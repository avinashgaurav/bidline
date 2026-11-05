import { AlertCircle, FileText, Mail, Scale, Stamp } from "lucide-react";
import type { RfxListRow } from "./rfx";
import type { awaitingMyApproval } from "./notifications";
import { inrShort } from "./view";

/**
 * The to-do list: one row per thing a person should do next, most urgent first.
 * Home shows it across the workspace; My work shows only the person's own
 * events and the approvals waiting on them.
 */
export interface Todo { key: string; rfx: RfxListRow; icon: React.ComponentType<{ className?: string }>; text: string; action: string; href: string; tone: "warn" | "info" | "go" }

/** What needs a person, across every event, most urgent first. */
export function todos(events: RfxListRow[], approvals: Awaited<ReturnType<typeof awaitingMyApproval>>, canEdit: boolean): Todo[] {
  const out: Todo[] = [];
  for (const a of approvals) {
    const rfx = events.find((e) => e.id === a.rfx_id);
    if (rfx) out.push({ key: `ap-${a.rfx_id}`, rfx, icon: Stamp, tone: "go", text: `Award${a.total_inr ? ` of ${inrShort(a.total_inr)}` : ""} is waiting for your approval`, action: "Review", href: `/rfx/${a.rfx_id}?tab=award` });
  }
  for (const e of events) {
    if (e.archived_at) continue;
    if (e.overdue_chases) out.push({ key: `od-${e.id}`, rfx: e, icon: Mail, tone: "warn", text: `${e.overdue_chases} follow-up${e.overdue_chases === 1 ? " is" : "s are"} past the reply-by date`, action: "Follow up", href: `/rfx/${e.id}?tab=chase` });
    if (e.unread_docs && canEdit) out.push({ key: `ud-${e.id}`, rfx: e, icon: FileText, tone: "info", text: `${e.unread_docs} supplier document${e.unread_docs === 1 ? "" : "s"} for Claude to read`, action: "Open documents", href: `/rfx/${e.id}?tab=documents` });
    if (e.needs_review) out.push({ key: `nr-${e.id}`, rfx: e, icon: AlertCircle, tone: "warn", text: `${e.needs_review} price${e.needs_review === 1 ? " is" : "s are"} unreadable on the supplier's file`, action: "Check", href: `/rfx/${e.id}?tab=comparison` });
    if (e.award_status === "sent" && !approvals.some((a) => a.rfx_id === e.id)) out.push({ key: `aw-${e.id}`, rfx: e, icon: Stamp, tone: "info", text: "Award sent, waiting for the approver", action: "See status", href: `/rfx/${e.id}?tab=award` });
    if (e.status === "evaluating" && !e.award_status && !e.unread_docs && canEdit) out.push({ key: `rd-${e.id}`, rfx: e, icon: Scale, tone: "go", text: "Quotes are in. Ready to compare and draft the award", action: "Compare", href: `/rfx/${e.id}?tab=comparison` });
  }
  return out;
}


/** The to-dos that are this person's: their own events' unless assigned elsewhere, plus any assigned to them. Snoozed ones split out. */
export function myQueue(
  all: Todo[], userId: string,
  states: Map<string, { assigned_to: string | null; snoozed_until: string | null }>, now: number,
) {
  const mine = all.filter((t) => {
    const st = states.get(t.key);
    return st?.assigned_to ? st.assigned_to === userId : t.rfx.user_id === userId;
  });
  const snoozed = (k: string) => {
    const until = states.get(k)?.snoozed_until;
    return Boolean(until && new Date(until).getTime() > now);
  };
  return { active: mine.filter((t) => !snoozed(t.key)), snoozed: mine.filter((t) => snoozed(t.key)) };
}
