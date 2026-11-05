import { q } from "./db";
import { ME_CTE, VISIBLE } from "./rfx";

/**
 * Notifications are the audit entries that matter to one person: what Claude,
 * teammates and approvers did on events they can see, plus changes to their
 * own access. Nothing extra is stored except how far the person has read.
 */

const KINDS = [
  "rfx_created", "rfx_issued", "document_uploaded", "document_saved", "quote_read", "questionnaire_read",
  "cell_corrected", "chase_recorded", "award_drafted", "award_decided", "award_withdrawn", "line_note_added",
  "member_added", "member_role_changed", "access_changed",
];

export interface Notification {
  id: string; rfx_id: string | null; rfx_code: string | null; kind: string; actor: string; user_name: string | null;
  summary: string; created_at: string; unread: boolean;
}

export async function listNotifications(userId: string, limit = 30): Promise<{ items: Notification[]; unread: number }> {
  const items = await q<Notification>(
    `with ${ME_CTE}, seen as (select coalesce(notifications_seen_at, 'epoch'::timestamptz) as at from users where id = $1)
     select e.id::text, e.rfx_id, r.code as rfx_code, e.kind, e.actor, u.name as user_name, e.summary, e.created_at,
            (e.created_at > seen.at) as unread
     from events e cross join me cross join seen
     left join rfx r on r.id = e.rfx_id
     left join users u on u.id = e.user_id
     where e.workspace_id = me.workspace_id and (e.kind = any($2) or (e.kind = 'mentioned' and e.detail->'mentions' ? me.id))
       and e.created_at > now() - interval '30 days'
       and not (e.user_id = me.id and e.actor = 'user')
       and ((r.id is not null and ${VISIBLE} and r.archived_at is null) or (e.rfx_id is null and e.detail->>'email' = (select email from users where id = $1)))
     order by e.id desc limit $3`,
    [userId, KINDS, limit],
  );
  return { items, unread: items.filter((i) => i.unread).length };
}

export async function markNotificationsSeen(userId: string) {
  await q("update users set notifications_seen_at = now() where id = $1", [userId]);
}

/** Awards waiting on this person: approvers and admins see every award awaiting approval. */
export async function awaitingMyApproval(userId: string) {
  return q<{ rfx_id: string; code: string; title: string; total_inr: number | null; created_at: string }>(
    `with ${ME_CTE} select r.id as rfx_id, r.code, r.title, (a.snapshot->>'totalInr')::float8 as total_inr, a.created_at
     from awards a join rfx r on r.id = a.rfx_id cross join me
     where ${VISIBLE} and a.status = 'sent' and me.role in ('admin', 'approver') and r.archived_at is null
     order by a.created_at`,
    [userId],
  );
}
