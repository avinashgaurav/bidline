import { one } from "./db";

/**
 * Checks the audit trail's seal for one workspace. Each entry has a number in
 * its workspace, a hash over its own content, and the hash of the entry
 * numbered one before it, all written by the database (db/schema.sql,
 * events_chain). A changed entry no longer matches its hash; a removed entry
 * leaves a gap in the numbers or a broken link. Removing the newest entries
 * leaves no trace on its own, which is why exports carry the latest hash.
 */
export interface ChainReport {
  entries: number;
  sealed: number;
  changed: number;
  missingLinks: number;
  gaps: number;
  intact: boolean;
  checkedAt: string;
  lastHash: string | null;
}

export async function verifyChain(workspaceId: string): Promise<ChainReport> {
  const r = await one<{ entries: number; sealed: number; changed: number; missing: number; gaps: number; last_hash: string | null }>(
    `with e as (select * from events where workspace_id = $1),
          s as (select * from e where seq is not null)
     select (select count(*)::int from e) as entries,
            (select count(*)::int from s) as sealed,
            (select count(*)::int from s where hash is distinct from events_hash(prev_hash, s.*)) as changed,
            (select count(*)::int from s cur left join s before on before.seq = cur.seq - 1
              where cur.seq > (select min(seq) from s) and cur.prev_hash is distinct from before.hash) as missing,
            (select coalesce(max(seq) - min(seq) + 1 - count(*), 0)::int from s) as gaps,
            (select hash from s order by seq desc limit 1) as last_hash`,
    [workspaceId],
  );
  const changed = r?.changed ?? 0;
  const missing = r?.missing ?? 0;
  const gaps = r?.gaps ?? 0;
  return {
    entries: r?.entries ?? 0, sealed: r?.sealed ?? 0, changed, missingLinks: missing + gaps, gaps,
    intact: changed === 0 && missing === 0 && gaps === 0 && (r?.entries ?? 0) === (r?.sealed ?? 0),
    checkedAt: new Date().toISOString(), lastHash: r?.last_hash ?? null,
  };
}
