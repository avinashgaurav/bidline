import { q } from "./db";
import { ME_CTE, VISIBLE } from "./rfx";
import { KIND_GROUPS } from "./audit-format";

/**
 * Reading the audit trail. One table (events) feeds both views: the whole
 * organisation and a single sourcing event. A person only ever sees entries
 * for events they can open; workspace-level entries (team and tool changes)
 * need the audit_all permission.
 */

export interface AuditRow {
  id: string;
  rfx_id: string | null;
  rfx_code: string | null;
  rfx_title: string | null;
  user_id: string | null;
  user_name: string | null;
  actor: string;
  kind: string;
  tool: string | null;
  user_request: string | null;
  summary: string;
  detail: Record<string, unknown>;
  created_at: string;
}

export interface AuditFilter {
  rfx?: string | null;
  person?: string | null;
  actor?: string | null;
  group?: string | null;
  from?: string | null;
  to?: string | null;
  search?: string | null;
  before?: number | null;
  limit?: number;
  /** Leave out Claude's look-ups, which change nothing. */
  noLookups?: boolean;
}

export async function listAudit(userId: string, f: AuditFilter, opts: { all: boolean }): Promise<AuditRow[]> {
  const args: unknown[] = [userId];
  const where: string[] = [
    "e.workspace_id = me.workspace_id",
    // event entries only for events this person can open; the rest only for audit_all
    `(r.id is not null and ${VISIBLE}${opts.all ? " or e.rfx_id is null" : " or (e.rfx_id is null and e.user_id = me.id)"})`,
  ];
  const add = (sql: string, v: unknown) => {
    args.push(v);
    where.push(sql.replaceAll("?", `$${args.length}`));
  };
  if (f.rfx) add("e.rfx_id = ?", f.rfx);
  if (f.person) add("e.user_id = ?", f.person);
  if (f.actor) add("e.actor = ?", f.actor);
  const group = KIND_GROUPS.find((g) => g.key === f.group);
  if (group) add("e.kind = any(?)", group.kinds);
  if (f.from) add("e.created_at >= ?::date", f.from);
  if (f.to) add("e.created_at < ?::date + 1", f.to);
  if (f.search) add("(e.summary ilike ? or e.user_request ilike ?)", `%${f.search}%`);
  if (f.before) add("e.id < ?", f.before);
  if (f.noLookups) where.push("e.kind <> 'query'");
  args.push(Math.min(f.limit ?? 100, 500));
  return q<AuditRow>(
    `with ${ME_CTE}
     select e.id::text, e.rfx_id, r.code as rfx_code, r.title as rfx_title, e.user_id, u.name as user_name,
            e.actor, e.kind, e.tool, e.user_request, e.summary, e.detail, e.created_at
     from events e
     cross join me
     left join rfx r on r.id = e.rfx_id
     left join users u on u.id = e.user_id
     where ${where.join(" and ")}
     order by e.id desc limit $${args.length}`,
    args,
  );
}

/** People who appear in this workspace's audit trail, for the filter. */
export async function auditPeople(userId: string) {
  return q<{ id: string; name: string }>(
    `with ${ME_CTE} select u.id, u.name from workspace_members m join users u on u.id = m.user_id, me
      where m.workspace_id = me.workspace_id order by u.name`,
    [userId],
  );
}
