import { q } from "./db";
import { ME_CTE, VISIBLE } from "./rfx";

/**
 * Supplier files, by the sourcing event they belong to. The list of events
 * carries only totals; one event's files are fetched when it is opened.
 * Only events this person can open are included, archived ones last.
 */
export interface EventFileTotals { id: string; code: string; title: string; archived: boolean; files: number; bytes: number }
export interface StoredFile { id: string; filename: string; kind: string; byteSize: number; supplier: string | null; status: string; createdAt: string }

export async function fileTotalsByEvent(userId: string): Promise<EventFileTotals[]> {
  return q<EventFileTotals>(
    `with ${ME_CTE}
     select r.id, r.code, r.title, r.archived_at is not null as archived, count(d.id)::int as files, coalesce(sum(d.byte_size), 0)::float8 as bytes
     from rfx r join documents d on d.rfx_id = r.id, me
     where ${VISIBLE}
     group by r.id order by r.archived_at is not null, r.created_at desc, r.id`,
    [userId],
  );
}

export async function filesOfEvent(userId: string, rfxId: string): Promise<StoredFile[]> {
  return q<StoredFile>(
    `with ${ME_CTE}
     select d.id, d.filename, d.kind, d.byte_size as "byteSize", s.name as supplier, d.status, d.created_at as "createdAt"
     from rfx r join documents d on d.rfx_id = r.id left join suppliers s on s.id = d.supplier_id and s.rfx_id = r.id, me
     where ${VISIBLE} and r.id = $2
     order by d.created_at, d.id`,
    [userId, rfxId],
  );
}

export { fileSize } from "./file-size";
