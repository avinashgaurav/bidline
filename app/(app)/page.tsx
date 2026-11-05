import { Money } from "@/components/money";
import Link from "next/link";
import { AlertCircle, ArrowRight, ArrowUpRight, CheckCircle2, ChevronRight, Scale, TrendingDown, Users } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { listRfxs, type RfxListRow } from "@/lib/rfx";
import { listAudit } from "@/lib/audit";
import { awaitingMyApproval } from "@/lib/notifications";
import { myQueue, todos } from "@/lib/work";
import { todoStates } from "@/lib/todo-state";
import { HomeTabs } from "@/components/home-tabs";
import { ApprovalsBanner } from "@/components/approvals-banner";
import { savingsOpportunities } from "@/lib/opportunities";
import { can } from "@/lib/roles";
import { STAGE, STAGE_ORDER, inView } from "@/lib/stages";
import { actorOf } from "@/lib/audit-format";
import { CountUp } from "@/components/count-up";
import { Ago } from "@/components/ago";
import { PromptList } from "@/components/prompt-list";
import { ClaudeMark } from "@/components/claude-mark";
import { InfoTip, Tip } from "@/components/tip";

export const maxDuration = 60;
export const metadata = { title: "Home · Bidline" };

const HOME_PROMPTS = [
  "In Bidline, read every unread supplier document on my latest sourcing event and submit the quotes.",
  "What is waiting across all my sourcing events in Bidline?",
  "Using only Bidline's figures, which qualified supplier should win each line, and why?",
];

function greeting() {
  const h = Number(new Date().toLocaleString("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default async function Home() {
  const user = await requireUser();
  const [all, audit, approvals] = await Promise.all([
    listRfxs(user.id), listAudit(user.id, { limit: 6, noLookups: true }, { all: can(user.role, "audit_all") }), awaitingMyApproval(user.id),
  ]);
  const savings = await savingsOpportunities(user.id, all);
  const events = all.filter((e) => !e.archived_at);
  const first = user.name.split(" ")[0];
  const canEdit = can(user.role, "edit");
  const connected = Boolean(user.last_mcp_at);

  if (!events.length) {
    return (
      <div className="mx-auto grid max-w-[880px] gap-6 pt-6 sm:pt-12">
        <div className="rise">
          <p className="text-[13px] text-ink-secondary">{user.workspace_name}</p>
          <h1 className="mt-1 text-[32px] leading-[1.1] tracking-[-0.01em] text-balance sm:text-[40px]">{greeting()}, {first}. Let&apos;s run your first sourcing event.</h1>
          <p className="mt-3 max-w-[60ch] text-[16px] text-ink-secondary">
            Suppliers send quotes as spreadsheets, PDFs, emails and photos. Your Claude reads them; Bidline puts every price side by side, like for like, and takes the award to approval.
          </p>
        </div>
        <ol className="grid gap-3 sm:grid-cols-3">
          {[
            ["Add the purchase", "Line items, suppliers and the questions they must answer."],
            ["Claude reads the quotes", "Every price lands in one comparison, linked to its source."],
            ["Award and approve", "Pick the winners and send the award note to your approver."],
          ].map(([t, d], i) => (
            <li key={t} className="rise rounded-xl bg-card p-4 ring-1 ring-border" style={{ animationDelay: `${120 + i * 80}ms` }}>
              <span className="num grid size-7 place-items-center rounded-full bg-secondary text-[13px] text-primary">{i + 1}</span>
              <p className="mt-3 text-[15px] font-medium">{t}</p>
              <p className="mt-1 text-[13.5px] text-ink-secondary">{d}</p>
            </li>
          ))}
        </ol>
        <div className="rise flex flex-wrap items-center gap-3" style={{ animationDelay: "380ms" }}>
          {canEdit ? (
            <Link href="/?new=1" className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-5 text-[15px] text-white hover:bg-primary/90">Start a sourcing event <ArrowRight className="size-4" /></Link>
          ) : (
            <p className="text-[14px] text-ink-secondary">You have view-only access. Sourcing events your team creates will appear here.</p>
          )}
          <Link href="/docs" className="text-[14px] text-ink-secondary hover:text-primary">How Bidline works</Link>
        </div>
      </div>
    );
  }

  const open = events.filter((e) => !["awarded", "closed"].includes(e.status));
  const attention = events.filter((e) => inView(e, "attention"));
  const awaiting = events.filter((e) => e.award_status === "sent");
  const awaitingValue = awaiting.reduce((a, e) => a + (e.award_total_inr ?? 0), 0);
  const planned = open.reduce((a, e) => a + e.budget_inr, 0);
  const approved = events.filter((e) => e.award_status === "approved" && e.award_total_inr !== null);
  const savedOnAwards = approved.reduce((a, e) => a + ((e.award_baseline_inr ?? 0) - (e.award_total_inr ?? 0)), 0);
  const hasBaseline = approved.some((e) => (e.award_baseline_inr ?? 0) > 0);
  const list = todos(events, approvals, canEdit);
  const states = await todoStates(user.workspace_id);
  const mine = myQueue(todos(events, [], canEdit), user.id, states, Number(new Date()));
  const now = Number(new Date());
  const dueList = events.filter((e) => e.due_at && !["awarded", "closed"].includes(e.status)).sort((a, b) => +new Date(a.due_at!) - +new Date(b.due_at!)).slice(0, 6);

  return (
    <div className="grid gap-5">
      <header className="rise flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[13px] text-ink-secondary">{user.workspace_name} · {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" })}</p>
          <h1 className="mt-0.5 text-[28px] leading-tight tracking-[-0.01em]">{greeting()}, {first}</h1>
          <p className="mt-1 text-[14px] text-ink-secondary">
            {list.length ? <>{list.length} thing{list.length === 1 ? "" : "s"} need{list.length === 1 ? "s" : ""} attention across {open.length} open event{open.length === 1 ? "" : "s"}.</> : <>Nothing is waiting on anyone. {open.length} open event{open.length === 1 ? "" : "s"}.</>}
          </p>
        </div>
      </header>

      {!connected ? (
        <Link href="/connect" className="rise flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-night px-4 py-3 text-on-dark hover:bg-night-raised sm:px-5">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#F6EEE8]"><ClaudeMark className="size-5" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14.5px] font-medium">Connect your Claude to read supplier quotes</span>
            <span className="block text-[13px] text-fog">Bidline has no AI of its own. It takes a minute, and every change Claude makes is logged.</span>
          </span>
          <span className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white px-3.5 text-[13.5px] text-night">Connect Claude <ArrowUpRight className="size-3.5" /></span>
        </Link>
      ) : null}
      <HomeTabs active="overview" workCount={mine.active.length + approvals.length} />
      <ApprovalsBanner items={approvals.map((a) => ({ rfxId: a.rfx_id, code: a.code, title: a.title, totalInr: a.total_inr, since: a.created_at }))} />

      <section aria-label="Key figures" className="rise grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-border ring-1 ring-border lg:grid-cols-5" style={{ animationDelay: "60ms" }}>
        <Stat label="Open events" help="Sourcing events not yet awarded or closed." value={<CountUp value={open.length} />} sub={`${events.length} in total`} href="/events" />
        <Stat label="Need attention" help="Unread documents, prices to check, overdue follow-ups or an award awaiting approval." value={<CountUp value={attention.length} />} sub={attention.length ? "Open the list" : "All clear"} warn={attention.length > 0} href="/events?view=attention" />
        <Stat label="Awaiting approval" help="Total value of awards sent to an approver and not yet decided." value={<CountUp value={awaitingValue} format="inr" />} sub={`${awaiting.length} award${awaiting.length === 1 ? "" : "s"}`} href="/events?view=approval" />
        <Stat label="Planned spend" help="Budget across open events: quantity times the budget unit price you set on each line. Lines without a budget are not counted." value={<CountUp value={planned} format="inr" />} sub={planned ? "Budget on open events" : "No budgets set yet"} href="/analytics" />
        <Stat label="Saved against budget" help="On approved awards: budget for the awarded lines minus the awarded total." value={hasBaseline ? <CountUp value={savedOnAwards} format="inr" /> : "n/a"} sub={hasBaseline ? `${approved.length} approved award${approved.length === 1 ? "" : "s"}` : "Shows once an award is approved"} href="/analytics" className="col-span-2 lg:col-span-1" />
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid min-w-0 content-start gap-5">
          <Pipeline events={events} />

          <Savings data={savings} />

          <section className="rise overflow-hidden rounded-xl bg-card ring-1 ring-border" style={{ animationDelay: "160ms" }}>
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <h2 className="text-[15px] font-medium">Needs attention</h2>
              {list.length > 6 ? <Link href="/events?view=attention" className="text-[13px] text-primary hover:underline">All {list.length}</Link> : null}
            </div>
            {list.length ? (
              <ul>
                {list.slice(0, 6).map((t) => (
                  <li key={t.key} className="border-b border-border last:border-0">
                    <Link href={t.href} className="group flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50">
                      <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${t.tone === "warn" ? "bg-warning/10 text-warning" : t.tone === "go" ? "bg-success/10 text-success" : "bg-secondary text-primary"}`}><t.icon className="size-4" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px]">{t.text}</span>
                        <span className="block truncate text-[12px] text-ink-secondary"><span className="num">{t.rfx.code}</span> · {t.rfx.title}</span>
                      </span>
                      <span className="hidden shrink-0 items-center gap-1 text-[13px] text-primary opacity-80 group-hover:opacity-100 sm:inline-flex">{t.action} <ChevronRight className="size-3.5" /></span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="flex items-center gap-2 px-4 py-5 text-[14px] text-ink-secondary"><CheckCircle2 className="size-4 text-success" /> Nothing is waiting on you right now.</p>
            )}
          </section>

          <section className="rise overflow-hidden rounded-xl bg-card ring-1 ring-border" style={{ animationDelay: "220ms" }}>
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <h2 className="text-[15px] font-medium">Quotes due</h2>
              <Link href="/events" className="inline-flex items-center gap-1 text-[13px] text-primary hover:underline">All sourcing events <ArrowRight className="size-3.5" /></Link>
            </div>
            {dueList.length ? (
              <ul>
                {dueList.map((r) => {
                  const st = STAGE[r.status] ?? STAGE.draft;
                  const pct = r.supplier_count ? Math.round((r.responded / r.supplier_count) * 100) : 0;
                  const days = Math.round((new Date(r.due_at!).getTime() - now) / 86_400_000);
                  return (
                    <li key={r.id} className="border-b border-border last:border-0">
                      <Link href={`/rfx/${r.id}`} className="group grid gap-x-4 gap-y-1.5 px-4 py-2.5 hover:bg-muted/50 md:grid-cols-[minmax(0,1fr)_130px_150px_110px] md:items-center">
                        <span className="min-w-0">
                          <span className="block truncate text-[14px] font-medium group-hover:text-primary">{r.title}</span>
                          <span className="block truncate text-[12px] text-ink-secondary"><span className="num">{r.code}</span> · {r.line_count} items</span>
                        </span>
                        <span><span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] ${st.chip}`}><span className={`size-1.5 rounded-full ${st.dot}`} />{st.label}</span></span>
                        <span className="grid gap-1">
                          <span className="num text-[12.5px]">{r.responded} of {r.supplier_count} quoted</span>
                          <span className="h-1 overflow-hidden rounded-full bg-muted" aria-hidden><span className="grow-x block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></span>
                        </span>
                        <span className={`num text-[12.5px] ${days < 0 ? "text-destructive" : days <= 3 ? "text-warning" : "text-ink-secondary"}`}>
                          {days < 0 ? `${-days} day${days === -1 ? "" : "s"} overdue` : days === 0 ? "Due today" : `In ${days} day${days === 1 ? "" : "s"}`}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="px-4 py-4 text-[13.5px] text-ink-secondary">No open event has a due date yet.</p>}
          </section>
        </div>

        <aside className="grid content-start gap-5">


          <section className="rise rounded-xl bg-card p-4 ring-1 ring-border" style={{ animationDelay: "180ms" }}>
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="flex items-center gap-2 text-[15px] font-medium"><ClaudeMark className="size-4" /> Ask Claude</h2>
              <Link href="/ask" className="text-[13px] text-primary hover:underline">More examples</Link>
            </div>
            <p className="mt-0.5 mb-3 text-[13px] text-ink-secondary">Copy one into a Claude chat with Bidline switched on, or ask in your own words.</p>
            <PromptList prompts={HOME_PROMPTS} />
          </section>

          <section className="rise rounded-xl bg-card ring-1 ring-border" style={{ animationDelay: "240ms" }}>
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <h2 className="text-[15px] font-medium">Latest activity</h2>
              <Link href="/audit" className="text-[13px] text-primary hover:underline">Audit log</Link>
            </div>
            <ol className="grid">
              {audit.map((e) => {
                const who = actorOf(e.actor, e.user_name, e.detail);
                return (
                  <li key={e.id} className="flex gap-3 border-b border-border px-4 py-2.5 last:border-0">
                    <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-muted">
                      {e.actor === "claude" ? <ClaudeMark className="size-3" /> : <span className={`size-2 rounded-full ${e.actor === "approver" ? "bg-success" : "bg-primary"}`} />}
                    </span>
                    <span className="min-w-0">
                      <span className="line-clamp-2 text-[13px] leading-snug">{e.summary}</span>
                      <span className="mt-0.5 block text-[11.5px] text-ink-secondary">{who.name}{e.rfx_code ? <> · <span className="num">{e.rfx_code}</span></> : null} · <Ago iso={e.created_at} /></span>
                    </span>
                  </li>
                );
              })}
              {!audit.length ? <li className="px-4 py-5 text-[13px] text-ink-secondary">No activity yet.</li> : null}
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Stat({ label, help, value, sub, warn = false, href, className = "" }: {
  label: string; help: string; value: React.ReactNode; sub: string; warn?: boolean; href: string; className?: string;
}) {
  return (
    <Link href={href} className={`group block bg-card px-4 py-3.5 transition-colors hover:bg-muted/40 ${className}`}>
      <span className="flex items-center gap-1.5 text-[12px] text-ink-secondary">{label}<InfoTip text={help} label={`About ${label}`} /></span>
      <span className={`num mt-1 block text-[24px] leading-tight tracking-[-0.01em] ${warn ? "text-warning" : ""}`}>{value}</span>
      <span className="mt-0.5 flex items-center gap-1 text-[12px] text-ink-secondary">{sub}<ArrowRight className="size-3 opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" /></span>
    </Link>
  );
}

/** Events by stage as one bar: how the work is spread across the pipeline. */
function Pipeline({ events }: { events: RfxListRow[] }) {
  const counts = STAGE_ORDER.map((k) => ({ k, n: events.filter((e) => e.status === k).length })).filter((x) => x.n);
  const total = counts.reduce((a, x) => a + x.n, 0) || 1;
  return (
    <section className="rise rounded-xl bg-card p-4 ring-1 ring-border" style={{ animationDelay: "100ms" }}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-medium">Pipeline</h2>
        <span className="text-[12px] text-ink-secondary">{events.length} event{events.length === 1 ? "" : "s"} by stage</span>
      </div>
      <div className="mt-3 flex h-2.5 gap-[2px] overflow-hidden rounded-full" role="img" aria-label={counts.map((c) => `${STAGE[c.k].label}: ${c.n}`).join(", ")}>
        {counts.map((c, i) => (
          <span key={c.k} className={`grow-x h-full ${STAGE[c.k].dot}`} style={{ width: `${(c.n / total) * 100}%`, animationDelay: `${150 + i * 90}ms` }} />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
        {STAGE_ORDER.map((k) => {
          const n = events.filter((e) => e.status === k).length;
          return (
            <li key={k}>
              <Tip text={STAGE[k].help}>
                <Link href={`/events?view=${k}`} className={`inline-flex items-center gap-2 text-[13px] ${n ? "" : "opacity-50"} hover:text-primary`}>
                  <span className={`size-2 rounded-full ${STAGE[k].dot}`} />{STAGE[k].label}<span className="num text-ink-secondary">{n}</span>
                </Link>
              </Tip>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const OPP_ICON = { under_budget: TrendingDown, single_quote: Users, unusual: AlertCircle, qualify_cost: Scale } as const;

/** Ways to save across open events, with how much of what was found is already captured in approved awards. */
function Savings({ data }: { data: Awaited<ReturnType<typeof savingsOpportunities>> }) {
  if (!data.items.length && !data.captured) return null;
  return (
    <section className="rise overflow-hidden rounded-xl bg-card ring-1 ring-border" style={{ animationDelay: "130ms" }}>
      <div className="grid gap-3 border-b border-border px-4 py-3 sm:grid-cols-[minmax(0,1fr)_260px] sm:items-center">
        <div>
          <h2 className="flex items-center gap-1.5 text-[15px] font-medium">Ways to save<InfoTip label="About ways to save" text="Found by Bidline's own comparison on open events: lowest quotes under your budget, lines with only one quote, unusually high winning prices, and what qualification costs. No AI estimates." /></h2>
          <p className="text-[12.5px] text-ink-secondary">From the latest quotes on {data.checked} open event{data.checked === 1 ? "" : "s"}.</p>
        </div>
        <div>
          <div className="flex items-baseline justify-between text-[12.5px]">
            <span className="text-ink-secondary">Captured in approved awards</span>
            <span className="num font-medium">{data.pct}%</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${data.pct}% of savings found are captured`}>
            <span className="grow-x block h-full rounded-full bg-success" style={{ width: `${data.pct}%` }} />
          </div>
          <p className="num mt-1 text-[11.5px] text-ink-secondary">{<Money short value={data.captured} />} of {<Money short value={data.identified} />} found</p>
        </div>
      </div>
      {data.items.length ? (
        <ul>
          {data.items.map((o) => {
            const Icon = OPP_ICON[o.kind];
            return (
              <li key={`${o.rfxId}-${o.kind}`} className="border-b border-border last:border-0">
                <Link href={o.href} className="group flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-success/10 text-success"><Icon className="size-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px]">{o.text}</span>
                    <span className="block truncate text-[12px] text-ink-secondary"><span className="num">{o.code}</span> · {o.title}</span>
                  </span>
                  <span className="num shrink-0 text-right text-[14px] font-medium">{<Money short value={o.inr} />}<span className="block text-[11px] font-normal text-ink-secondary">{o.kind === "under_budget" ? "under budget" : o.kind === "qualify_cost" ? "extra cost" : "at stake"}</span></span>
                  <span className="hidden shrink-0 items-center gap-1 text-[13px] text-primary sm:inline-flex">{o.action}<ChevronRight className="size-3.5" /></span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : <p className="px-4 py-4 text-[13.5px] text-ink-secondary">Nothing new found on open events.</p>}
    </section>
  );
}
