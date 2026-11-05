import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { NotFound, getLineNotes, qualityGate, resolveRfx } from "@/lib/rfx";
import { loadComparison } from "@/lib/comparison";
import { listEvents } from "@/lib/events";
import { gridView, inrShort } from "@/lib/view";
import { ComparisonGrid } from "@/components/rfx/grid";
import { DocumentsTab } from "@/components/rfx/documents";
import { LinesTab } from "@/components/rfx/lines";
import { SuppliersTab } from "@/components/rfx/suppliers";
import { QuestionnaireTab } from "@/components/rfx/questionnaire";
import { ChaseTab } from "@/components/rfx/chase";
import { AwardTab } from "@/components/rfx/award";
import { AssumptionsTab } from "@/components/rfx/assumptions";
import { EVENT_STEPS } from "@/lib/event-steps";
import { AskBox } from "@/components/rfx/ask";
import { ExportMenu } from "@/components/export-menu";
import { InfoTip, Tip } from "@/components/tip";
import { NextStep } from "@/components/rfx/next-step";
import { OverviewTab } from "@/components/rfx/overview";
import { AuditRail, AuditSheetButton } from "@/components/rfx/audit-panel";
import { EventTabs, type TabSpec } from "@/components/rfx/event-tabs";
import { AccessButton, ArchiveButton } from "@/components/rfx/event-actions";
import { eventAccess, listMembers } from "@/lib/team";
import { can } from "@/lib/roles";
import { one } from "@/lib/db";
import { StarButton } from "@/components/star-button";
import { STAGE } from "@/lib/stages";
import { Archive, Eye } from "lucide-react";
import { DuplicateButton } from "@/components/rfx/edit-extras";
import { SUGGESTIONS } from "@/lib/insights";

const TABS = EVENT_STEPS.map((s) => [s.tab, s.label] as const);

const EVENT_TYPE_HELP: Record<string, string> = {
  RFQ: "Request for quotation: you know what you want and ask suppliers for prices.",
  RFP: "Request for proposal: suppliers propose how they would meet the need, with prices.",
  RFI: "Request for information: gathering supplier details before a priced round.",
  TENDER: "Formal tender: sealed, rule-bound bids, usually for larger or public purchases.",
};
const STATUS_HELP: Record<string, string> = {
  draft: "Being set up. Suppliers have not been sent the enquiry yet.",
  issued: "Sent to suppliers. Waiting for their quotes.",
  evaluating: "Quotes are in and being compared.",
  awarded: "The award has been approved.",
  closed: "Finished. Kept for the record.",
};

export const metadata = { title: "Sourcing event · Bidline" };

export default async function RfxPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; who?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const rfx = await resolveRfx(user.id, id).catch((e) => {
    if (e instanceof NotFound) notFound();
    throw e;
  });
  const canEdit = can(rfx.my_role, "edit");
  const isAdmin = can(rfx.my_role, "team");
  const [cmp, audit, notes, team, access, star] = await Promise.all([
    loadComparison(rfx), listEvents({ rfxId: rfx.id, limit: 300 }), getLineNotes(rfx.id),
    isAdmin ? listMembers(user.id) : Promise.resolve(null), isAdmin ? eventAccess(user.id, rfx.id) : Promise.resolve(null),
    one<{ on: boolean }>("select exists (select 1 from rfx_stars where user_id = $1 and rfx_id = $2) as on", [user.id, rfx.id]),
  ]);
  const feed = audit.map((e) => ({
    id: e.id, rfx_id: e.rfx_id, rfx_code: rfx.code, user_name: e.user_name ?? null, actor: e.actor, kind: e.kind, tool: e.tool,
    user_request: e.user_request, summary: e.summary, detail: (e.detail ?? {}) as Record<string, unknown>, created_at: e.created_at,
  }));
  const tab = TABS.some(([k]) => k === sp.tab) ? sp.tab! : "overview";
  const unread = cmp.documents.filter((d) => d.status === "unread").length;
  const gate = qualityGate(cmp.lines);
  const c = cmp.compliance;
  // Same count as the Overview chart: prices only a person can settle. Unmatched items are listed separately.
  const needsPerson = cmp.trust.needsHuman;
  const unmatched = cmp.unmapped.filter((u) => !u.resolution).length;
  const anyAssessed = cmp.suppliers.some((s) => cmp.supplierInfo[s.code].verdict.assessed);
  const showQualified = cmp.questions.length > 0 && anyAssessed;

  const openItems = cmp.suppliers.reduce((a, s) => a + (cmp.supplierInfo[s.code]?.gaps?.items.length ?? 0), 0);
  const latestAward = cmp.awards[0];
  const approver = (rfx.approver as { name?: string }).name;
  const counts: Record<string, { n?: number; warn?: boolean; label?: string; tone?: string }> = {
    lines: { n: cmp.lines.length, warn: gate.length > 0 },
    suppliers: { n: cmp.suppliers.length },
    documents: unread ? { n: unread, warn: true } : { n: cmp.documents.length },
    comparison: needsPerson ? { n: needsPerson, warn: true } : {},
    questionnaire: { n: cmp.questions.length },
    chase: openItems && cmp.hasAnyReading ? { n: openItems, warn: true } : {},
    award: latestAward ? { label: latestAward.status === "sent" ? "Awaiting approval" : latestAward.status.replace("_", " "), tone: latestAward.status } : {},
  };

  const tabs: TabSpec[] = EVENT_STEPS.map((st) => {
    const k = counts[st.tab] ?? {};
    return { tab: st.tab, label: st.label, help: st.help, n: k.n, warn: k.warn, badge: k.label, tone: k.tone };
  });
  const stage = STAGE[rfx.status] ?? STAGE.draft;
  // Approvers may add notes on line items and decide awards; everything else is read-only for them.
  const readOnly = !canEdit && !(tab === "award" || (tab === "lines" && can(rfx.my_role, "note")));
  const content = (
    <>
      {tab === "overview" ? <OverviewTab cmp={cmp} /> : null}
      {tab === "comparison" ? <ComparisonGrid view={gridView(cmp)} /> : null}
      {tab === "documents" ? <DocumentsTab cmp={cmp} canEdit={canEdit} /> : null}
      {tab === "lines" ? <LinesTab cmp={cmp} gate={gate} notes={notes} buyerName={user.name} /> : null}
      {tab === "suppliers" ? <SuppliersTab cmp={cmp} /> : null}
      {tab === "questionnaire" ? <QuestionnaireTab cmp={cmp} /> : null}
      {tab === "chase" ? <ChaseTab cmp={cmp} canEdit={canEdit} /> : null}
      {tab === "award" ? <AwardTab cmp={cmp} canEdit={canEdit} canApprove={can(rfx.my_role, "approve")} /> : null}
      {tab === "assumptions" ? <AssumptionsTab cmp={cmp} /> : null}
    </>
  );

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="@container grid min-w-0 content-start gap-4">
        <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[12.5px] text-ink-secondary">
              <Link href="/events" className="hover:text-primary">Sourcing events</Link>
              <ChevronRight className="size-3.5 opacity-60" />
              <span className="num">{rfx.code}</span>
            </nav>
            <h1 className="mt-1 text-[22px] leading-tight tracking-[-0.01em] text-balance sm:text-[24px]">{rfx.title}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[12.5px] text-ink-secondary">
              <Tip text={EVENT_TYPE_HELP[rfx.event_type] ?? "Type of sourcing event"}>
                <span tabIndex={0} className="rounded bg-night px-1.5 py-px text-[10.5px] font-medium tracking-wide text-on-dark">{rfx.event_type}</span>
              </Tip>
              <Tip text={STATUS_HELP[rfx.status] ?? stage.help}>
                <span tabIndex={0} className={`inline-flex items-center gap-1.5 rounded-full px-2 py-px text-[12px] ${stage.chip}`}><span className={`size-1.5 rounded-full ${stage.dot}`} />{stage.label}</span>
              </Tip>
              {rfx.created_via === "claude" ? <span className="rounded-full bg-muted px-2 py-px text-[12px]">Created in Claude</span> : null}
              {rfx.created_via === "demo" ? <Tip text="Fictional data for trying Bidline. Follow-up emails go to your own address."><span tabIndex={0} className="rounded-full bg-lavender px-2 py-px text-[12px] text-primary">Demo</span></Tip> : null}
              <span>{cmp.lines.length} line items</span>
              <span aria-hidden>·</span>
              <span>{cmp.suppliers.filter((x) => x.status === "responded").length} of {cmp.suppliers.length} suppliers quoted</span>
              {rfx.due_at ? <><span aria-hidden>·</span><span>Due {new Date(rfx.due_at).toLocaleDateString("en-IN", { dateStyle: "medium" })}</span></> : null}
              {approver ? <><span aria-hidden>·</span><span>Approver {approver}</span></> : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <StarButton rfxId={rfx.id} starred={Boolean(star?.on)} />
            <AuditSheetButton rfxId={rfx.id} entries={feed} />
            {isAdmin && team && access ? (
              <AccessButton rfxId={rfx.id} restricted={access.restricted} people={access.people} createdBy={access.createdBy} members={team.members} />
            ) : null}
            {canEdit ? <DuplicateButton rfxId={rfx.id} title={rfx.title} /> : null}
            {canEdit ? <ArchiveButton rfxId={rfx.id} archived={Boolean(rfx.archived_at)} /> : null}
            <ExportMenu rfxId={rfx.id} />
          </div>
        </header>

        {rfx.archived_at ? (
          <p className="flex items-center gap-2 rounded-xl bg-muted px-4 py-2.5 text-[13.5px]"><Archive className="size-4 text-ink-secondary" /> Archived on {new Date(rfx.archived_at).toLocaleDateString("en-IN", { dateStyle: "medium" })}. It is kept with its full record; restore it to work on it again.</p>
        ) : null}
        {!canEdit ? (
          <p className="flex items-center gap-2 rounded-xl bg-lavender px-4 py-2.5 text-[13.5px]"><Eye className="size-4 text-primary" /> You can view this event{can(rfx.my_role, "approve") ? ", add notes and decide its award" : ""}. Editing needs the Buyer or Admin role.</p>
        ) : null}

        {/* The figures and the next step lead on Overview; other tabs start with their own content. */}
        {tab === "overview" ? (<>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-border ring-1 ring-border @2xl:grid-cols-3 @5xl:grid-cols-5">
          <Kpi label="Lowest total, all suppliers" help="The cheapest price on every line, whichever supplier offered it. Ignores qualification. Prices that need review are left out."
            value={cmp.hasAnyReading ? inrShort(c.naive.totalInr) : "None yet"} sub={cmp.hasAnyReading ? `${c.naive.linesAwarded} of ${cmp.lines.length} lines priced` : "No quotes read yet"} />
          <Kpi label="Lowest total, qualified only" help="The same, using only suppliers who pass the questionnaire (certificates, warranty, delivery). This is the basis for a defensible award."
            value={!cmp.questions.length ? "No questions" : showQualified ? inrShort(c.compliant.totalInr) : "Waiting"}
            sub={!cmp.questions.length ? "Add questions to qualify suppliers" : showQualified ? `${c.compliant.linesAwarded} of ${cmp.lines.length} lines · ${c.qualifiedVendors.length} qualified` : "Ask Claude to read the questionnaire answers"} />
          <Kpi label="Extra cost of qualified suppliers" help="How much more the qualified total costs than the lowest total. What you pay for choosing suppliers who meet your requirements."
            value={showQualified && c.naive.totalInr && c.compliant.linesAwarded ? inrShort(c.deltaInr) : "Not yet"}
            sub={showQualified && c.likeForLike.warning ? "Covers different lines, see Award" : showQualified ? "Qualified minus lowest" : "Needs questionnaire answers"} />
          <Kpi label="Prices to check" help="Prices Bidline will not count until a person checks them: unreadable, two readings disagree, no source quoted, or not a firm price."
            value={String(needsPerson)} sub={needsPerson ? `Kept out of totals${unmatched ? ` · ${unmatched} unmatched item${unmatched === 1 ? "" : "s"}` : ""}` : unmatched ? `${unmatched} unmatched item${unmatched === 1 ? "" : "s"} to place` : "Nothing to check"} warn={needsPerson > 0} href={needsPerson ? `/rfx/${rfx.id}?tab=comparison` : undefined} />
          <Kpi label="Unread documents" help="Supplier files uploaded but not yet read. Bidline has no AI inside: ask your Claude to read them."
            value={String(unread)} sub={unread ? "Ask Claude to read them" : "All read"} warn={unread > 0} href={unread ? `/rfx/${rfx.id}?tab=documents` : undefined} className="col-span-2 @5xl:col-span-1" />
        </div>

        {c.likeForLike.warning && showQualified && c.compliant.linesAwarded > 0 && c.naive.linesAwarded > 0 ? (
          <p className="rounded-xl bg-[var(--cell-review-bg)] px-4 py-3 text-sm ring-1 ring-[var(--cell-review)]/25">{c.likeForLike.warning}</p>
        ) : null}

        {canEdit ? <NextStep rfx={rfx} cmp={cmp} unread={unread} needsPerson={needsPerson} openItems={openItems} gate={gate.length} /> : null}
        </>) : null}

        <EventTabs rfxId={rfx.id} tabs={tabs} active={tab} />

        {cmp.hasAnyReading && tab === "comparison" ? <AskBox rfxId={rfx.id} code={rfx.code} suggestions={SUGGESTIONS} /> : null}

        {readOnly ? <fieldset disabled className="contents">{content}</fieldset> : content}
      </div>
      <AuditRail rfxId={rfx.id} entries={feed} />
    </div>
  );
}

function Kpi({ label, value, sub, help, warn = false, href, className = "" }: { label: string; value: string; sub?: string; help: string; warn?: boolean; href?: string; className?: string }) {
  const body = (
    <>
      <span className="flex items-center gap-1.5 text-xs text-ink-secondary">{label}<InfoTip text={help} label={`About ${label}`} /></span>
      <span className={`num mt-1 block text-[22px] leading-tight ${warn ? "text-warning" : ""}`}>{value}</span>
      {sub ? <span className="mt-0.5 block text-xs text-ink-secondary">{sub}</span> : null}
    </>
  );
  const cls = `block px-4 py-3 ${warn ? "bg-[var(--cell-review-bg)]" : "bg-card"} ${className}`;
  return href ? <Link href={href} className={`${cls} hover:bg-[#fbf1dc]`}>{body}</Link> : <div className={cls}>{body}</div>;
}
