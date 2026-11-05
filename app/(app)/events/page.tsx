import { requireUser } from "@/lib/auth";
import { listRfxs } from "@/lib/rfx";
import { can } from "@/lib/roles";
import { EventsTable } from "@/components/events-table";

export const metadata = { title: "Sourcing events · Bidline" };

export default async function EventsPage({ searchParams }: { searchParams: Promise<{ view?: string; q?: string; owner?: string; sort?: string; dir?: string }> }) {
  const user = await requireUser();
  const { view, ...initial } = await searchParams;
  const events = await listRfxs(user.id);
  return (
    <EventsTable
      view={view ?? "all"}
      initial={initial}
      canEdit={can(user.role, "edit")}
      events={events.map((e) => ({
        id: e.id, code: e.code, title: e.title, status: e.status, event_type: e.event_type, created_via: e.created_via, restricted: e.restricted,
        archived_at: e.archived_at, owner_name: e.owner_name, due_at: e.due_at, updated_at: e.last_activity ?? e.updated_at,
        line_count: e.line_count, supplier_count: e.supplier_count, responded: e.responded, doc_count: e.doc_count, unread_docs: e.unread_docs,
        needs_review: e.needs_review, open_chases: e.open_chases, overdue_chases: e.overdue_chases, award_status: e.award_status,
        award_total_inr: e.award_total_inr, budget_inr: e.budget_inr,
      }))}
    />
  );
}
