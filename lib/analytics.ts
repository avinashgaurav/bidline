import { q } from "./db";
import { ME_CTE, VISIBLE } from "./rfx";

/**
 * Spend across the workspace, from approved awards (what was committed) and
 * line budgets (what was planned). Every figure is Bidline's own snapshot taken
 * when the award was drafted, so it matches the award note the approver saw.
 */
export interface Spend {
  totals: { awarded: number; baseline: number; awards: number };
  byEvent: Array<{ id: string; code: string; title: string; budget: number; awarded: number | null; baseline: number | null; status: string }>;
  byCategory: Array<{ category: string; awarded: number; baseline: number; lines: number }>;
  bySupplier: Array<{ supplier: string; awarded: number; lines: number; events: number }>;
  byMonth: Array<{ month: string; awarded: number; baseline: number; awards: number }>;
}

export async function spend(userId: string, rfxId: string | null = null): Promise<Spend> {
  // Committed spend stays counted when an event is archived; lists below show active events.
  // With rfxId, every figure narrows to that one event (still only if this person can see it).
  const vis = `with ${ME_CTE}, vis as (select r.* from rfx r, me where ${VISIBLE} and ($2::text is null or r.id = $2)),
    approved as (select distinct on (a.rfx_id) a.* from awards a join vis v on v.id = a.rfx_id where a.status = 'approved' order by a.rfx_id, a.decided_at desc),
    picks as (select ap.rfx_id, p from approved ap cross join jsonb_array_elements(ap.snapshot->'picks') p)`;
  const [totals, byEvent, byCategory, bySupplier, byMonth] = await Promise.all([
    q<Spend["totals"]>(`${vis}
      select coalesce(sum((snapshot->>'totalInr')::numeric), 0)::float8 as awarded,
             coalesce(sum((snapshot->>'baselineForAwardedInr')::numeric), 0)::float8 as baseline, count(*)::int as awards from approved`, [userId, rfxId]),
    q<Spend["byEvent"][number]>(`${vis}
      select v.id, v.code, v.title, v.status,
        coalesce((select sum(l.qty * l.baseline_inr) from rfx_lines l where l.rfx_id = v.id), 0)::float8 as budget,
        (select (ap.snapshot->>'totalInr')::float8 from approved ap where ap.rfx_id = v.id) as awarded,
        (select (ap.snapshot->>'baselineForAwardedInr')::float8 from approved ap where ap.rfx_id = v.id) as baseline
      from vis v where v.archived_at is null or v.id = $2 order by v.updated_at desc limit 30`, [userId, rfxId]),
    q<Spend["byCategory"][number]>(`${vis}
      select coalesce(nullif(l.group_name, ''), 'Uncategorised') as category,
        sum((p->>'extendedInr')::numeric)::float8 as awarded,
        sum(coalesce(l.baseline_inr, 0) * (p->>'qty')::numeric)::float8 as baseline,
        count(*)::int as lines
      from picks join rfx_lines l on l.rfx_id = picks.rfx_id and l.no = (p->>'lineNo')::int
      group by 1 order by 2 desc limit 12`, [userId, rfxId]),
    q<Spend["bySupplier"][number]>(`${vis}
      select p->>'supplierName' as supplier, sum((p->>'extendedInr')::numeric)::float8 as awarded, count(*)::int as lines, count(distinct picks.rfx_id)::int as events
      from picks group by 1 order by 2 desc limit 12`, [userId, rfxId]),
    q<Spend["byMonth"][number]>(`${vis}
      select to_char(date_trunc('month', ap.decided_at), 'YYYY-MM') as month,
        sum((ap.snapshot->>'totalInr')::numeric)::float8 as awarded,
        sum((ap.snapshot->>'baselineForAwardedInr')::numeric)::float8 as baseline,
        count(*)::int as awards
      from approved ap group by 1 order by 1 desc limit 12`, [userId, rfxId]),
  ]);
  return { totals: totals[0] ?? { awarded: 0, baseline: 0, awards: 0 }, byEvent, byCategory, bySupplier, byMonth: byMonth.reverse() };
}
