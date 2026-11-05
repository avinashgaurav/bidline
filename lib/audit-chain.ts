import { one } from "./db";

/**
 * Checks the audit trail's hash chain for one workspace. Each entry stores a
 * hash over its own content and the hash of the entry before it, computed by
 * the database when the entry is written (db/schema.sql, events_chain). An
 * entry changed afterwards no longer matches its hash; a deleted entry leaves
 * the next one pointing at a hash that is not there.
 */
export interface ChainReport {
  entries: number;
  sealed: number;
  changed: number;
  missingLinks: number;
  heads: number;
  intact: boolean;
  checkedAt: string;
  lastHash: string | null;
}

export async function verifyChain(workspaceId: string): Promise<ChainReport> {
  const r = await one<{ entries: number; sealed: number; changed: number; missing: number; heads: number; last_hash: string | null }>(
    `with e as (select * from events where workspace_id = $1)
     select (select count(*)::int from e) as entries,
            (select count(*)::int from e where hash is not null) as sealed,
            (select count(*)::int from e where hash is not null and hash <> events_hash(prev_hash, e.*)) as changed,
            (select count(*)::int from e where prev_hash is not null and not exists (select 1 from e e2 where e2.hash = e.prev_hash)) as missing,
            (select count(*)::int from e where hash is not null and prev_hash is null) as heads,
            (select hash from e where hash is not null order by id desc limit 1) as last_hash`,
    [workspaceId],
  );
  const changed = r?.changed ?? 0;
  const missing = r?.missing ?? 0;
  return {
    entries: r?.entries ?? 0, sealed: r?.sealed ?? 0, changed, missingLinks: missing, heads: r?.heads ?? 0,
    intact: changed === 0 && missing === 0 && (r?.heads ?? 0) <= 1,
    checkedAt: new Date().toISOString(), lastHash: r?.last_hash ?? null,
  };
}
