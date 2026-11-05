import { q } from "./db";
import { ME_CTE, VISIBLE } from "./rfx";

/** One search box over everything a person can see: events, suppliers, documents and line items. */
export interface SearchHit { type: "event" | "supplier" | "document" | "line"; title: string; sub: string; href: string }

export async function searchAll(userId: string, text: string): Promise<SearchHit[]> {
  const t = text.trim();
  if (t.length < 2) return [];
  const like = `%${t.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const rows = await q<{ type: SearchHit["type"]; title: string; sub: string; rfx_id: string; extra: string | null }>(
    `with ${ME_CTE}, vis as (select r.* from rfx r, me where ${VISIBLE})
     (select 'event' as type, r.title, r.code || ' · ' || r.status || case when r.archived_at is not null then ' · archived' else '' end as sub, r.id as rfx_id, null as extra
        from vis r where r.title ilike $2 or r.code ilike $2 order by r.updated_at desc limit 6)
     union all
     (select 'supplier', s.name, s.code || ' on ' || r.code || ' ' || r.title, r.id, null
        from suppliers s join vis r on r.id = s.rfx_id where (s.name ilike $2 or s.gstin ilike $2) and s.status <> 'removed' limit 6)
     union all
     (select 'document', d.filename, r.code || ' · ' || d.status, r.id, null
        from documents d join vis r on r.id = d.rfx_id where d.filename ilike $2 order by d.created_at desc limit 6)
     union all
     (select 'line', l.description, 'Line ' || l.no || ' · ' || l.sku || ' on ' || r.code, r.id, l.no::text
        from rfx_lines l join vis r on r.id = l.rfx_id where l.description ilike $2 or l.sku ilike $2 limit 6)`,
    [userId, like],
  );
  const tab: Record<SearchHit["type"], string> = { event: "overview", supplier: "suppliers", document: "documents", line: "lines" };
  return rows.map((r) => ({ type: r.type, title: r.title, sub: r.sub, href: `/rfx/${r.rfx_id}?tab=${tab[r.type]}` }));
}
