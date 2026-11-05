import { q } from "./db";
import { logEvent } from "./events";

/**
 * Approval requests that waited too long expire, with a stated reason, so
 * nothing sits as "awaiting approval" forever. The buyer drafts again to send
 * a fresh request. Runs with the daily job and before any decision.
 */
export async function expireStaleAwards(): Promise<number> {
  const gone = await q<{ id: string; rfx_id: string; code: string; user_id: string; days: number }>(
    `with due as (
       select a.id, a.rfx_id, r.code, coalesce(a.drafted_by_user, r.user_id) as user_id,
              coalesce((w.settings->>'approvalExpiryDays')::int, 14) as days
       from awards a join rfx r on r.id = a.rfx_id join workspaces w on w.id = r.workspace_id
       where a.status = 'sent')
     update awards a set status = 'expired', decided_at = now(),
            decision_note = 'No decision within ' || due.days || ' days. Draft the award again to send a fresh request.'
     from due where a.id = due.id and due.days > 0 and a.created_at < now() - make_interval(days => due.days)
     returning a.id, due.rfx_id, due.code, due.user_id, due.days`,
  );
  for (const g of gone) {
    await q("update award_steps set status = 'cancelled' where award_id = $1 and status in ('sent', 'waiting')", [g.id]);
    await logEvent({ userId: g.user_id, rfxId: g.rfx_id, actor: "system", kind: "award_expired", summary: `The approval request on ${g.code} expired after ${g.days} days without a decision.`, detail: { awardId: g.id, reason: `No decision within ${g.days} days` } });
  }
  return gone.length;
}
