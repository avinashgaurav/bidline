import { json, one, q } from "./db";
import { sendMail } from "./mail";

/**
 * Email notifications each person chooses in Settings. Bidline has no mail
 * server of its own: a notification is sent from the person's own connected
 * mailbox to their own address, so nothing leaves through a third party.
 */
export const NOTIFY_KINDS: Array<{ key: NotifyKind; label: string; help: string; default: boolean }> = [
  { key: "award_waiting", label: "An award is waiting for my approval", help: "Approvers and admins.", default: true },
  { key: "award_decided", label: "An award I drafted was decided", help: "Approved, rejected, sent back or expired.", default: true },
  { key: "quote_read", label: "Claude read a quote on my event", help: "One email per document read.", default: false },
  { key: "followup_overdue", label: "A supplier missed a reply-by date", help: "Once a day, with the daily reminders.", default: false },
];
export type NotifyKind = "award_waiting" | "award_decided" | "quote_read" | "followup_overdue";

export function readNotify(raw: unknown): Record<NotifyKind, boolean> {
  const r = (raw ?? {}) as Partial<Record<NotifyKind, boolean>>;
  return Object.fromEntries(NOTIFY_KINDS.map((k) => [k.key, typeof r[k.key] === "boolean" ? r[k.key] : k.default])) as Record<NotifyKind, boolean>;
}

export async function saveNotify(userId: string, prefs: Record<NotifyKind, boolean>) {
  await q("update users set notify = $2::jsonb where id = $1", [userId, json(prefs)]);
}

/** Send one notification to each listed person who asked for it and has a mailbox connected. Never throws. */
export async function notify(userIds: string[], kind: NotifyKind, subject: string, text: string) {
  for (const id of [...new Set(userIds)]) {
    try {
      const u = await one<{ email: string; notify: unknown; has_mail: boolean }>(
        "select u.email, u.notify, exists (select 1 from email_accounts e where e.user_id = u.id) as has_mail from users u where u.id = $1", [id]);
      if (!u || !u.has_mail || !readNotify(u.notify)[kind]) continue;
      await sendMail(id, { to: u.email, subject: `Bidline: ${subject}`, text });
    } catch (e) {
      console.error("[notify]", kind, (e as Error).message);
    }
  }
}

/** Approvers and admins who can see an event: who to tell an award is waiting. */
export async function approversOf(rfxId: string): Promise<string[]> {
  const rows = await q<{ user_id: string }>(
    `select m.user_id from rfx r join workspace_members m on m.workspace_id = r.workspace_id
      where r.id = $1 and m.role in ('admin', 'approver')
        and (not r.restricted or m.role = 'admin' or exists (select 1 from rfx_access a where a.rfx_id = r.id and a.user_id = m.user_id))`, [rfxId]);
  return rows.map((r) => r.user_id);
}
