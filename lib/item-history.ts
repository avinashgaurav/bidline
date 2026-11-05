import { q } from "./db";

/**
 * Who changed each item on an event, and when: a line, a supplier, or one
 * supplier's price on one line. Worked out from the audit trail, so it is
 * always the same record the audit log shows.
 */
export interface ItemEdit { actor: string; name: string | null; at: string; summary: string; kind: string }

function itemsOf(kind: string, d: Record<string, unknown>): string[] {
  const out = new Set<string>();
  if (typeof d.cell === "string") {
    const [s, n] = d.cell.split(":");
    out.add(`cell:${s}:${n}`);
  }
  for (const k of ["before", "after"]) {
    const v = d[k];
    if (Array.isArray(v)) for (const x of v) if (x && typeof x === "object" && "no" in x) out.add(`line:${(x as { no: number }).no}`);
    if (kind.startsWith("supplier") && v && typeof v === "object" && "code" in v) out.add(`supplier:${(v as { code: string }).code}`);
  }
  if (Array.isArray(d.lines)) for (const n of d.lines) if (typeof n === "number") out.add(`line:${n}`);
  if (typeof d.supplier === "string") out.add(`supplier:${d.supplier}`);
  return [...out];
}

export async function itemHistory(rfxId: string): Promise<Record<string, ItemEdit[]>> {
  const rows = await q<{ actor: string; user_name: string | null; created_at: string; summary: string; kind: string; detail: Record<string, unknown>; aname: string | null }>(
    `select e.actor, u.name as user_name, e.created_at, e.summary, e.kind, e.detail, e.detail->>'name' as aname
       from events e left join users u on u.id = e.user_id
      where e.rfx_id = $1 and e.kind <> 'query' order by e.id desc limit 2000`, [rfxId]);
  const map: Record<string, ItemEdit[]> = {};
  for (const r of rows) {
    for (const key of itemsOf(r.kind, r.detail ?? {})) {
      (map[key] ??= []).push({ actor: r.actor, name: r.actor === "approver" ? r.aname : r.user_name, at: r.created_at, summary: r.summary, kind: r.kind });
    }
  }
  return map;
}
