/** A sourcing event's stage in plain words, with the dot colour used everywhere it appears. */
export const STAGE: Record<string, { label: string; help: string; dot: string; chip: string }> = {
  draft: { label: "Draft", help: "Being set up. Not sent to suppliers yet.", dot: "bg-fog", chip: "bg-muted text-ink-secondary" },
  issued: { label: "Collecting quotes", help: "Sent to suppliers. Waiting for their quotes.", dot: "bg-[#7b8cf5]", chip: "bg-secondary text-primary" },
  evaluating: { label: "Comparing", help: "Quotes are in and being compared.", dot: "bg-[#f0a43c]", chip: "bg-warning/10 text-warning" },
  awarded: { label: "Awarded", help: "The award has been approved.", dot: "bg-[#3fbf7f]", chip: "bg-success/10 text-success" },
  closed: { label: "Closed", help: "Finished. Kept for the record.", dot: "bg-fog/50", chip: "bg-muted text-ink-secondary" },
};

export const STAGE_ORDER = ["draft", "issued", "evaluating", "awarded", "closed"] as const;

/** Views of the event list, used by the sidebar and the All events page. */
export const EVENT_VIEWS: Array<{ key: string; label: string; help: string }> = [
  { key: "all", label: "All events", help: "Every open sourcing event you can see." },
  { key: "attention", label: "Needs attention", help: "Unread documents, unreadable prices, overdue follow-ups or an award awaiting approval." },
  { key: "draft", label: "Draft", help: STAGE.draft.help },
  { key: "issued", label: "Collecting quotes", help: STAGE.issued.help },
  { key: "evaluating", label: "Comparing", help: STAGE.evaluating.help },
  { key: "approval", label: "Awaiting approval", help: "An award has been sent to the approver." },
  { key: "awarded", label: "Awarded", help: STAGE.awarded.help },
  { key: "archived", label: "Archived", help: "Put away. Kept with their full record; restore any time." },
];

export interface ViewableEvent { status: string; archived_at: string | null; unread_docs: number; needs_review: number; overdue_chases: number; award_status: string | null }

export function inView(e: ViewableEvent, view: string): boolean {
  if (view === "archived") return Boolean(e.archived_at);
  if (e.archived_at) return false;
  if (view === "all") return e.status !== "closed";
  if (view === "attention") return e.unread_docs > 0 || e.needs_review > 0 || e.overdue_chases > 0 || e.award_status === "sent";
  if (view === "approval") return e.award_status === "sent";
  return e.status === view;
}
