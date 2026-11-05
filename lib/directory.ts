import { q } from "./db";
import { ME_CTE, VISIBLE } from "./rfx";

/**
 * Suppliers across every event a person can see, merged by GSTIN when there is
 * one, otherwise by name. How often each was asked, how often they quoted,
 * what they won, and how often their prices had to be corrected.
 */
export interface DirectoryRow {
  key: string; name: string; gstin: string | null; city: string | null; email: string | null;
  events: number; responded: number; declined: number; lines_won: number; won_inr: number;
  corrections: number; follow_ups: number; overdue: number; last_seen: string;
  rfx: Array<{ id: string; code: string; title: string; status: string; supplier_status: string }>;
}

export async function supplierDirectory(userId: string): Promise<DirectoryRow[]> {
  return q<DirectoryRow>(
    `with ${ME_CTE}, vis as (select r.* from rfx r, me where ${VISIBLE} and r.archived_at is null),
     s as (
       select s.*, coalesce(nullif(upper(trim(s.gstin)), ''), 'name:' || lower(regexp_replace(s.name, '[^a-zA-Z0-9]+', '', 'g'))) as key,
              v.code as rfx_code, v.title as rfx_title, v.status as rfx_status
       from suppliers s join vis v on v.id = s.rfx_id where s.status <> 'removed'
     ),
     won as (
       select p->>'supplierCode' as code, a.rfx_id, count(*)::int as lines, sum((p->>'extendedInr')::numeric)::float8 as inr
       from awards a join vis v on v.id = a.rfx_id cross join jsonb_array_elements(a.snapshot->'picks') p
       where a.status = 'approved' group by 1, 2
     )
     select s.key,
            (array_agg(s.name order by s.created_at desc))[1] as name,
            max(nullif(trim(s.gstin), '')) as gstin,
            max(s.city) as city,
            max(s.contact->>'email') as email,
            count(*)::int as events,
            count(*) filter (where s.status = 'responded')::int as responded,
            count(*) filter (where s.status = 'declined')::int as declined,
            coalesce(sum(w.lines), 0)::int as lines_won,
            coalesce(sum(w.inr), 0)::float8 as won_inr,
            (select count(*)::int from cell_overrides o where o.supplier_id = any(array_agg(s.id))) as corrections,
            (select count(*)::int from chases c where c.supplier_id = any(array_agg(s.id))) as follow_ups,
            (select count(*)::int from chases c where c.supplier_id = any(array_agg(s.id)) and c.answered_at is null and c.due_at < now()) as overdue,
            max(s.created_at) as last_seen,
            json_agg(json_build_object('id', s.rfx_id, 'code', s.rfx_code, 'title', s.rfx_title, 'status', s.rfx_status, 'supplier_status', s.status) order by s.created_at desc) as rfx
     from s left join won w on w.code = s.code and w.rfx_id = s.rfx_id
     group by s.key
     order by count(*) desc, max(s.created_at) desc`,
    [userId],
  );
}
