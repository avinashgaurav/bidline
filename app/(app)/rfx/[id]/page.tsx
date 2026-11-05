import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { NotFound, getLineNotes, qualityGate, resolveRfx } from "@/lib/rfx";
import { loadComparison } from "@/lib/comparison";
import { listEvents, versionOf } from "@/lib/events";
import { gridView, inrShort } from "@/lib/view";
import { LiveRefresh } from "@/components/live-refresh";
import { ComparisonGrid } from "@/components/rfx/grid";
import { DocumentsTab } from "@/components/rfx/documents";
import { LinesTab } from "@/components/rfx/lines";
import { SuppliersTab } from "@/components/rfx/suppliers";
import { QuestionnaireTab } from "@/components/rfx/questionnaire";
import { ChaseTab } from "@/components/rfx/chase";
import { AwardTab } from "@/components/rfx/award";
import { AssumptionsTab } from "@/components/rfx/assumptions";
import { ActivityList } from "@/components/activity-list";
import { EVENT_STEPS } from "@/lib/event-steps";
import { AskBox } from "@/components/rfx/ask";
import { ExportMenu } from "@/components/export-menu";
import { InfoTip, Tip } from "@/components/tip";
import { NextStep } from "@/components/rfx/next-step";
import { OverviewTab } from "@/components/rfx/overview";
import { AuditPanel } from "@/components/rfx/audit-panel";
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
  const [cmp, version, audit, notes] = await Promise.all([
    loadComparison(rfx), versionOf({ rfxId: rfx.id }), listEvents({ rfxId: rfx.id, limit: 200 }), getLineNotes(rfx.id),
  ]);
  const tab = TABS.some(([k]) => k === sp.tab) ? sp.tab! : "overview";
  const unread = cmp.documents.filter((d) => d.status === "unread").length;
  const gate = qualityGate(cmp.lines);
  const c = cmp.compliance;
  const needsPerson = cmp.trust.needsHuman + cmp.unmapped.filter((u) => !u.resolution).length;
  const anyAssessed = cmp.suppliers.some((s) => cmp.supplierInfo[s.code].verdict.assessed);
  const showQualified = cmp.questions.length > 0 && anyAssessed;

  const openItems = cmp.suppliers.reduce((a, s) => a + (cmp.supplierInfo[s.code]?.gaps?.gapCount ?? 0), 0);
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

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[13px] text-ink-secondary">
            <Link href="/" className="hover:text-primary">Sourcing events</Link>
            <ChevronRight className="size-3.5 opacity-60" />
            <span className="num">{rfx.code}</span>
          </nav>
          <h1 className="mt-1.5 text-[24px] leading-tight text-balance">{rfx.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-ink-secondary">
            <Tip text={EVENT_TYPE_HELP[rfx.event_type] ?? "Type of sourcing event"}>
              <span tabIndex={0} className="rounded-md bg-night px-1.5 py-0.5 text-[11px] font-medium tracking-wide text-on-dark">{rfx.event_type}</span>
            </Tip>
            <Tip text={STATUS_HELP[rfx.status] ?? "Where this event is"}>
              <span tabIndex={0} className="rounded-full bg-secondary px-2 py-0.5 text-xs capitalize text-primary">{rfx.status}</span>
            </Tip>
            {rfx.created_via === "claude" ? <span className="rounded-full bg-muted px-2 py-0.5 text-xs">Created in Claude</span> : null}
            {rfx.created_via === "demo" ? <Tip text="Fictional data for trying Bidline. Follow-up emails go to your own address."><span tabIndex={0} className="rounded-full bg-lavender px-2 py-0.5 text-xs text-primary">Demo</span></Tip> : null}
            <span>{cmp.lines.length} line items</span>
            <span aria-hidden>·</span>
            <span>{cmp.suppliers.filter((s) => s.status === "responded").length} of {cmp.suppliers.length} suppliers quoted</span>
            {rfx.due_at ? <><span aria-hidden>·</span><span>Due {new Date(rfx.due_at).toLocaleDateString("en-IN", { dateStyle: "medium" })}</span></> : null}
            {approver ? <><span aria-hidden>·</span><span>Approver {approver}</span></> : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <LiveRefresh url={`/api/rfx/${rfx.id}/version`} initial={version} />
          <DuplicateButton rfxId={rfx.id} title={rfx.title} />
          <AuditPanel rfxId={rfx.id} buyerName={user.name} entries={audit.map((e) => ({
            id: Number(e.id), actor: e.actor, kind: e.kind, tool: e.tool, user_request: e.user_request, summary: e.summary,
            detail: (e.detail ?? {}) as Record<string, unknown>, created_at: e.created_at,
          }))} />
          <ExportMenu rfxId={rfx.id} />
        </div>
      </header>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-border ring-1 ring-border lg:grid-cols-5">
        <Kpi label="Lowest total, all suppliers" help="The cheapest price on every line, whichever supplier offered it. Ignores qualification. Prices that need review are left out."
          value={cmp.hasAnyReading ? inrShort(c.naive.totalInr) : "Not yet"} sub={cmp.hasAnyReading ? `${c.naive.linesAwarded} of ${cmp.lines.length} lines priced` : "No quotes read yet"} />
        <Kpi label="Lowest total, qualified only" help="The same, using only suppliers who pass the questionnaire (certificates, warranty, delivery). This is the basis for a defensible award."
          value={!cmp.questions.length ? "No questionnaire" : showQualified ? inrShort(c.compliant.totalInr) : "Pending"}
          sub={!cmp.questions.length ? "Add questions to qualify suppliers" : showQualified ? `${c.compliant.linesAwarded} of ${cmp.lines.length} lines · ${c.qualifiedVendors.length} qualified` : "No questionnaire answers read yet"} />
        <Kpi label="Cost of qualifying" help="How much more the qualified total costs than the lowest total. What you pay for choosing compliant suppliers."
          value={showQualified && c.naive.totalInr && c.compliant.linesAwarded ? inrShort(c.deltaInr) : "n/a"}
          sub={showQualified && c.likeForLike.warning ? "Covers different lines, see Award" : showQualified ? "Qualified minus lowest" : "Needs questionnaire answers"} />
        <Kpi label="Needs review" help="Prices Bidline will not count until a person checks them: unreadable, two readings disagree, no source quoted, or not a firm price."
          value={String(needsPerson)} sub={needsPerson ? "Kept out of all totals" : "Nothing to check"} warn={needsPerson > 0} href={needsPerson ? `/rfx/${rfx.id}?tab=comparison` : undefined} />
        <Kpi label="Unread documents" help="Supplier files uploaded but not yet read. Bidline has no AI inside: ask your Claude to read them."
          value={String(unread)} sub={unread ? "Ask Claude to read them" : "All read"} warn={unread > 0} href={unread ? `/rfx/${rfx.id}?tab=documents` : undefined} className="col-span-2 lg:col-span-1" />
      </div>

      {c.likeForLike.warning && showQualified && c.compliant.linesAwarded > 0 && c.naive.linesAwarded > 0 ? (
        <p className="rounded-xl bg-[var(--cell-review-bg)] px-4 py-3 text-sm ring-1 ring-[var(--cell-review)]/25">{c.likeForLike.warning}</p>
      ) : null}

      <NextStep rfx={rfx} cmp={cmp} unread={unread} needsPerson={needsPerson} openItems={openItems} gate={gate.length} />

      <nav className="-mx-1 flex gap-0.5 overflow-x-auto border-b border-border px-1" aria-label="Event steps">
        {EVENT_STEPS.map((s) => {
          const k = counts[s.tab] ?? {};
          const active = tab === s.tab;
          return (
            <Tip key={s.tab} text={s.help} side="bottom">
              <Link
                href={`/rfx/${rfx.id}?tab=${s.tab}`}
                aria-current={active ? "page" : undefined}
                className={`-mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-[14px] transition-colors ${
                  active ? "border-primary text-foreground" : "border-transparent text-ink-secondary hover:text-foreground"
                }`}
              >
                {s.label}
                {k.n !== undefined && k.n > 0 ? (
                  <span className={`num rounded-full px-1.5 text-[11px] leading-[18px] ${k.warn ? "bg-warning/10 text-warning" : "bg-muted text-ink-secondary"}`}>{k.n}</span>
                ) : null}
                {k.label ? (
                  <span className={`rounded-full px-1.5 text-[11px] leading-[18px] capitalize ${
                    k.tone === "approved" ? "bg-success/10 text-success" : k.tone === "sent" || k.tone === "changes_requested" ? "bg-warning/10 text-warning"
                      : k.tone === "rejected" ? "bg-destructive/10 text-destructive" : "bg-muted text-ink-secondary"
                  }`}>{k.label}</span>
                ) : null}
              </Link>
            </Tip>
          );
        })}
      </nav>

      {cmp.hasAnyReading && tab === "comparison" ? <AskBox rfxId={rfx.id} code={rfx.code} suggestions={SUGGESTIONS} /> : null}

      {tab === "overview" ? <OverviewTab cmp={cmp} /> : null}
      {tab === "comparison" ? <ComparisonGrid view={gridView(cmp)} /> : null}
      {tab === "documents" ? <DocumentsTab cmp={cmp} /> : null}
      {tab === "lines" ? <LinesTab cmp={cmp} gate={gate} notes={notes} buyerName={user.name} /> : null}
      {tab === "suppliers" ? <SuppliersTab cmp={cmp} /> : null}
      {tab === "questionnaire" ? <QuestionnaireTab cmp={cmp} /> : null}
      {tab === "chase" ? <ChaseTab cmp={cmp} /> : null}
      {tab === "award" ? <AwardTab cmp={cmp} /> : null}
      {tab === "assumptions" ? <AssumptionsTab cmp={cmp} /> : null}
      {tab === "activity" ? <ActivityTab rfxId={rfx.id} who={sp.who} /> : null}
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

async function ActivityTab({ rfxId, who }: { rfxId: string; who?: string }) {
  let events = await listEvents({ rfxId, limit: 300 });
  if (who === "claude") events = events.filter((e) => e.actor === "claude");
  if (who === "app") events = events.filter((e) => e.actor === "user" || e.actor === "approver");
  const filters = [["", "All"], ["claude", "From Claude"], ["app", "From the app"]];
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <div className="rounded-xl bg-card p-4 ring-1 ring-border sm:p-5">
        <div className="mb-4 flex flex-wrap gap-2">
          {filters.map(([k, l]) => (
            <Link key={k} href={`/rfx/${rfxId}?tab=activity${k ? `&who=${k}` : ""}`} className={`rounded-full px-3 py-1 text-sm ${(who ?? "") === k ? "bg-primary text-white" : "bg-secondary"}`}>{l}</Link>
          ))}
        </div>
        <ActivityList events={events} />
      </div>
      <aside className="h-fit rounded-xl bg-lavender p-5 text-sm">
        <p className="font-medium">Activity log</p>
        <p className="mt-1 text-ink-secondary">Every request made in Claude, every action Bidline took, every edit in the app and every approval, in date order.</p>
        <a href={`/api/rfx/${rfxId}/export/transcript`} className="mt-3 inline-flex h-9 items-center rounded-full bg-primary px-4 text-white">Download activity log (.md)</a>
      </aside>
    </div>
  );
}
