import type { Comparison } from "@/lib/comparison";
import { chaseMessage } from "@/lib/calc/chase";
import { getEmailAccount } from "@/lib/mail";
import { one } from "@/lib/db";
import { FollowUpsBoard, type SupplierFollowUp } from "./chase-client";

/** Reply-by date for a draft: today plus the buyer's follow-up period. */
function daysFromToday(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const isPast = (iso: string | null) => Boolean(iso && new Date(iso).getTime() < Date.now());

/** What each supplier still owes, and the email that asks for it, side by side. */
export async function ChaseTab({ cmp, canEdit }: { cmp: Comparison; canEdit: boolean }) {
  const [account, me] = await Promise.all([
    getEmailAccount(cmp.rfx.user_id),
    one<{ name: string; followup_days: number }>("select name, followup_days from users where id = $1", [cmp.rfx.user_id]),
  ]);
  const due = daysFromToday(me?.followup_days ?? 3);
  const suppliers: SupplierFollowUp[] = cmp.suppliers.map((s) => {
    const g = cmp.supplierInfo[s.code].gaps;
    const history = cmp.chases.filter((c) => c.supplier_id === s.id).map((c) => {
      const x = c as typeof c & { sent_via?: string; to_email?: string; send_error?: string; subject?: string };
      return {
        id: c.id, sent_at: c.sent_at, due_at: c.due_at, answered_at: c.answered_at, created_by: c.created_by, message: c.message,
        subject: x.subject ?? null, how: x.sent_via === "email" ? `Emailed to ${x.to_email}` : x.send_error ? `Not sent: ${x.send_error}` : "Recorded, not emailed",
        items: Array.isArray(c.items) ? (c.items as Array<{ ask?: string }>).map((i) => i.ask ?? "").filter(Boolean) : [],
      };
    });
    const open = history.filter((h) => !h.answered_at);
    const overdue = open.some((h) => isPast(h.due_at));
    const draft = g.items.length
      ? chaseMessage({ gaps: g, rfxId: cmp.rfx.code, rfxTitle: cmp.rfx.title, buyerName: String((cmp.rfx.buyer as { name?: string }).name ?? me?.name ?? "Procurement"), dueAt: due })
      : null;
    return {
      code: s.code, name: s.name, email: String((s.contact as { email?: string }).email ?? "") || null,
      items: g.items.map((i) => ({ ask: i.ask, why: i.why, atRiskInr: i.atRiskInr ?? 0, dispute: i.family === "dispute" })),
      atRiskInr: g.totalAtRiskInr,
      resolved: g.resolvedWithoutAsking.map((r) => `${r.what} (lines ${r.lineNos.join(", ")})`),
      state: overdue ? "overdue" : open.length ? "waiting" : g.items.length ? "missing" : "clear",
      unreadFiles: cmp.documents.filter((d) => d.supplier_id === s.id && d.status === "unread").length,
      draft, history,
    };
  });
  return <FollowUpsBoard rfxId={cmp.rfx.id} suppliers={suppliers} emailReady={Boolean(account)} demo={cmp.rfx.created_via === "demo"} canEdit={canEdit} />;
}
