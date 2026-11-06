import { q } from "./db";
import { ME_CTE, VISIBLE } from "./rfx";

/**
 * Every stored supplier file, grouped by the sourcing event it belongs to.
 * Only events this person can open are included, archived ones last.
 */
export interface EventFiles {
  id: string;
  code: string;
  title: string;
  archived: boolean;
  bytes: number;
  files: Array<{ id: string; filename: string; kind: string; byteSize: number; supplier: string | null; status: string; createdAt: string }>;
}

export async function filesByEvent(userId: string): Promise<EventFiles[]> {
  const rows = await q<{
    rfx_id: string; code: string; title: string; archived: boolean;
    id: string; filename: string; kind: string; byte_size: number; supplier: string | null; status: string; created_at: string;
  }>(
    `with ${ME_CTE}
     select r.id as rfx_id, r.code, r.title, r.archived_at is not null as archived,
            d.id, d.filename, d.kind, d.byte_size, s.name as supplier, d.status, d.created_at
     from rfx r join documents d on d.rfx_id = r.id left join suppliers s on s.id = d.supplier_id, me
     where ${VISIBLE}
     order by r.archived_at is not null, r.updated_at desc, d.created_at`,
    [userId],
  );
  const byEvent = new Map<string, EventFiles>();
  for (const r of rows) {
    let ev = byEvent.get(r.rfx_id);
    if (!ev) byEvent.set(r.rfx_id, (ev = { id: r.rfx_id, code: r.code, title: r.title, archived: r.archived, bytes: 0, files: [] }));
    ev.bytes += r.byte_size;
    ev.files.push({ id: r.id, filename: r.filename, kind: r.kind, byteSize: r.byte_size, supplier: r.supplier, status: r.status, createdAt: r.created_at });
  }
  return [...byEvent.values()];
}

/** 1.2 MB, 340 KB, 12 bytes. */
export function fileSize(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} bytes`;
}
