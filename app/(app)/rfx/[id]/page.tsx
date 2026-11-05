import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { NotFound, qualityGate, resolveRfx } from "@/lib/rfx";
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
import { SUGGESTIONS } from "@/lib/insights";

const TABS = EVENT_STEPS.map((s) => [s.tab, s.label] as const);

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
  const [cmp, version] = await Promise.all([loadComparison(rfx), versionOf({ rfxId: rfx.id })]);
  const tab = TABS.some(([k]) => k === sp.tab) ? sp.tab! : "comparison";
  const unread = cmp.documents.filter((d) => d.status === "unread").length;
  const gate = qualityGate(cmp.lines);
  const c = cmp.compliance;
  const needsPerson = cmp.trust.needsHuman + cmp.unmapped.filter((u) => !u.resolution).length;
  const anyAssessed = cmp.suppliers.some((s) => cmp.supplierInfo[s.code].verdict.assessed);
  const showQualified = cmp.questions.length > 0 && anyAssessed;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href="/" className="text-sm text-ink-secondary hover:text-primary">Sourcing events</Link>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <span className="rounded-md bg-night px-1.5 py-0.5 text-[12px] font-medium tracking-wide text-on-dark">{rfx.event_type}</span>
            <span className="num text-sm text-ink-secondary">{rfx.code}</span>
            <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs capitalize text-primary">{rfx.status}</span>
            {rfx.created_via === "claude" ? <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-ink-secondary">Created in Claude</span> : null}
          </div>
          <h1 className="mt-1 text-[28px] leading-tight">{rfx.title}</h1>
          <p className="mt-1 text-sm text-ink-secondary">
            {cmp.lines.length} line items · {cmp.suppliers.filter((s) => s.status === "responded").length} of {cmp.suppliers.length} suppliers quoted
            {rfx.due_at ? ` · due ${new Date(rfx.due_at).toLocaleDateString("en-IN", { dateStyle: "medium" })}` : ""}
            {(rfx.approver as { name?: string }).name ? ` · approver ${(rfx.approver as { name?: string }).name}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LiveRefresh url={`/api/rfx/${rfx.id}/version`} initial={version} />
          <a href={`/api/rfx/${rfx.id}/export/xlsx`} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-secondary px-3 text-[14px] hover:bg-lavender"><Download className="size-3.5" />Excel</a>
          <a href={`/api/rfx/${rfx.id}/export/csv`} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-secondary px-3 text-[14px] hover:bg-lavender"><Download className="size-3.5" />CSV</a>
          <a href={`/api/rfx/${rfx.id}/export/transcript`} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-secondary px-3 text-[14px] hover:bg-lavender"><Download className="size-3.5" />Activity log .md</a>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Cheapest per line, all suppliers" value={cmp.hasAnyReading ? inrShort(c.naive.totalInr) : "Not yet"} sub={cmp.hasAnyReading ? `${c.naive.linesAwarded}/${cmp.lines.length} lines` : "No quotes read yet"} />
        <Kpi
          label="Qualified suppliers only"
          value={!cmp.questions.length ? "No questionnaire" : showQualified ? inrShort(c.compliant.totalInr) : "Pending"}
          sub={!cmp.questions.length ? "" : showQualified ? `${c.compliant.linesAwarded}/${cmp.lines.length} lines · ${c.qualifiedVendors.length} qualified` : "No questionnaire answers read yet"}
        />
        <Kpi
          label="Premium for qualified suppliers"
          value={showQualified && c.naive.totalInr && c.compliant.linesAwarded ? inrShort(c.deltaInr) : "n/a"}
          sub={showQualified && c.likeForLike.warning ? "Covers different lines, see Award" : showQualified ? "Qualified total minus lowest total" : "Needs questionnaire answers"}
        />
        <Kpi label="Needs review" value={String(needsPerson)} sub="Excluded from all totals" warn={needsPerson > 0} />
        <Kpi label="Unread documents" value={String(unread)} sub={unread ? "Ask Claude to read them" : "All read"} warn={unread > 0} />
      </div>

      {c.likeForLike.warning && showQualified && c.compliant.linesAwarded > 0 && c.naive.linesAwarded > 0 ? (
        <p className="rounded-xl bg-[var(--cell-review-bg)] p-4 text-sm" style={{ boxShadow: "inset 3px 0 0 var(--cell-review)" }}>{c.likeForLike.warning}</p>
      ) : null}

      {cmp.hasAnyReading ? <AskBox rfxId={rfx.id} code={rfx.code} suggestions={SUGGESTIONS} /> : null}

      <nav className="flex gap-1 overflow-x-auto border-b border-border lg:hidden" aria-label="Event sections">
        {TABS.map(([k, label]) => (
          <Link
            key={k}
            href={`/rfx/${rfx.id}?tab=${k}`}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm ${tab === k ? "border-primary text-foreground" : "border-transparent text-ink-secondary hover:text-foreground"}`}
            aria-current={tab === k ? "page" : undefined}
          >
            {label}
            {k === "documents" && unread ? <span className="ml-1.5 rounded-full bg-warning/10 px-1.5 text-xs text-warning">{unread}</span> : null}
            {k === "lines" && gate.length ? <span className="ml-1.5 rounded-full bg-warning/10 px-1.5 text-xs text-warning">{gate.length}</span> : null}
          </Link>
        ))}
      </nav>

      <h2 className="hidden text-[24px] lg:block">{TABS.find(([k]) => k === tab)?.[1]}</h2>

      {tab === "comparison" ? <ComparisonGrid view={gridView(cmp)} /> : null}
      {tab === "documents" ? <DocumentsTab cmp={cmp} /> : null}
      {tab === "lines" ? <LinesTab cmp={cmp} gate={gate} /> : null}
      {tab === "suppliers" ? <SuppliersTab cmp={cmp} /> : null}
      {tab === "questionnaire" ? <QuestionnaireTab cmp={cmp} /> : null}
      {tab === "chase" ? <ChaseTab cmp={cmp} /> : null}
      {tab === "award" ? <AwardTab cmp={cmp} /> : null}
      {tab === "assumptions" ? <AssumptionsTab cmp={cmp} /> : null}
      {tab === "activity" ? <ActivityTab rfxId={rfx.id} who={sp.who} /> : null}
    </div>
  );
}

function Kpi({ label, value, sub, warn = false }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className={`rounded-xl p-4 ${warn ? "bg-[var(--cell-review-bg)]" : "bg-card ring-1 ring-border"}`}>
      <p className="text-xs text-ink-secondary">{label}</p>
      <p className="num mt-1 text-[24px] leading-tight">{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-ink-secondary">{sub}</p> : null}
    </div>
  );
}

async function ActivityTab({ rfxId, who }: { rfxId: string; who?: string }) {
  let events = await listEvents({ rfxId, limit: 300 });
  if (who === "claude") events = events.filter((e) => e.actor === "claude");
  if (who === "app") events = events.filter((e) => e.actor === "user" || e.actor === "approver");
  const filters = [["", "All"], ["claude", "From Claude"], ["app", "From the app"]];
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <div className="rounded-xl bg-card p-6 ring-1 ring-border">
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
