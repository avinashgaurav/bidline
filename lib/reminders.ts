import { q } from "./db";
import { logEvent } from "./events";
import { sendMail } from "./mail";
import { readSettings } from "./workspace";

const MAX_REMINDERS = 3;

/**
 * Automatic follow-up reminders. For workspaces that switched them on, every
 * emailed follow-up past its reply-by date with no answer gets a short
 * reminder from the buyer's own mailbox, at most three times, spaced by the
 * workspace's interval. Each one is written to the audit log.
 */
export async function sendDueReminders(now = new Date()): Promise<{ sent: number; failed: number; checked: number }> {
  const rows = await q<{
    id: string; rfx_id: string; code: string; title: string; owner: string; to_email: string; subject: string | null; message: string;
    due_at: string; reminders_sent: number; last_reminded_at: string | null; settings: unknown; workspace_id: string;
  }>(
    `select c.id, c.rfx_id, r.code, r.title, r.user_id as owner, c.to_email, c.subject, c.message, c.due_at, c.reminders_sent, c.last_reminded_at,
            w.settings, w.id as workspace_id
       from chases c join rfx r on r.id = c.rfx_id join workspaces w on w.id = r.workspace_id
      where c.answered_at is null and c.sent_via = 'email' and c.to_email is not null and c.due_at < $1
        and c.reminders_sent < ${MAX_REMINDERS} and r.archived_at is null and r.status not in ('awarded', 'closed')
        and coalesce((w.settings->'reminders'->>'enabled')::boolean, false)`,
    [now.toISOString()],
  );
  let sent = 0;
  let failed = 0;
  for (const c of rows) {
    const every = readSettings(c.settings).reminders.everyDays;
    const last = c.last_reminded_at ? new Date(c.last_reminded_at) : new Date(c.due_at);
    if (now.getTime() - last.getTime() < every * 86_400_000 && c.last_reminded_at) continue;
    const n = c.reminders_sent + 1;
    const subject = `Reminder${n > 1 ? ` ${n}` : ""}: ${c.subject ?? `${c.code} ${c.title}`}`;
    const text = `Hello,\n\nA gentle reminder about our message below, which asked for a reply by ${new Date(c.due_at).toLocaleDateString("en-IN", { dateStyle: "medium" })}. We still need these details to complete our comparison.\n\nThank you.\n\n----\n${c.message}`;
    try {
      await sendMail(c.owner, { to: c.to_email, subject, text });
      await q("update chases set reminders_sent = $2, last_reminded_at = $3 where id = $1", [c.id, n, now.toISOString()]);
      await logEvent({ userId: c.owner, rfxId: c.rfx_id, actor: "system", kind: "reminder_sent", summary: `Sent automatic reminder ${n} of ${MAX_REMINDERS} to ${c.to_email} for ${c.code}.`, detail: { to: c.to_email, chaseId: c.id, reminder: n } });
      sent++;
    } catch (e) {
      failed++;
      await logEvent({ userId: c.owner, rfxId: c.rfx_id, actor: "system", kind: "reminder_sent", summary: `Could not send the automatic reminder to ${c.to_email}: ${(e as Error).message}`, detail: { to: c.to_email, chaseId: c.id, failed: true } });
    }
  }
  return { sent, failed, checked: rows.length };
}
