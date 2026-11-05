import Link from "next/link";
import { ArrowRight, ChevronRight } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { appUrlFromHeaders } from "@/lib/app-url";
import { listRfxs } from "@/lib/rfx";
import { listEvents, versionOf } from "@/lib/events";
import { StartChoice } from "@/components/start-choice";
import { NewEventButton } from "@/components/new-event-button";
import { PromptList } from "@/components/prompt-list";
import { LiveRefresh } from "@/components/live-refresh";
import { ActivityList } from "@/components/activity-list";
import { Onboarding } from "@/components/onboarding";
import { ClaudeMark } from "@/components/claude-mark";
import { Tip } from "@/components/tip";

export const maxDuration = 60;

export const metadata = { title: "Sourcing events · Bidline" };

const STATUS: Record<string, { cls: string; help: string }> = {
  draft: { cls: "bg-muted text-ink-secondary", help: "Being set up. Not sent to suppliers yet." },
  issued: { cls: "bg-secondary text-primary", help: "Sent to suppliers. Waiting for quotes." },
  evaluating: { cls: "bg-warning/10 text-warning", help: "Quotes are in and being compared." },
  awarded: { cls: "bg-success/10 text-success", help: "Award approved." },
  closed: { cls: "bg-muted text-ink-secondary", help: "Finished. Kept for the record." },
};

const HOME_PROMPTS = [
  "In Bidline, read every unread supplier document on my latest sourcing event and submit the quotes.",
  "Using only Bidline's figures, which qualified supplier should we award each line to, and why?",
  "In Bidline, what does each supplier still owe me? Draft the follow-ups.",
];

export default async function Dashboard() {
  const user = await requireUser();
  const [rfxs, base, events, version] = await Promise.all([
    listRfxs(user.id), appUrlFromHeaders(), listEvents({ userId: user.id, limit: 8 }), versionOf({ userId: user.id }),
  ]);
  const connector = `${base}/mcp/${user.mcp_token}`;
  const connected = Boolean(user.last_mcp_at);
  const onboarding = <Onboarding connected={connected} connectorUrl={connector} />;

  if (!rfxs.length) {
    return (
      <div className="mx-auto grid max-w-[760px] gap-6 pt-2 sm:pt-6">
        {onboarding}
        <div>
          <h1 className="text-[28px] leading-tight">Welcome to Bidline, {user.name.split(" ")[0]}</h1>
          <p className="mt-1.5 max-w-[62ch] text-[15px] text-ink-secondary">
            Compare supplier quotes like for like, trace every price to the supplier&apos;s own words, chase what is missing and get the award approved.
            Your Claude does the reading; Bidline does the calculations.
          </p>
        </div>
        <section className="rounded-2xl bg-card p-5 ring-1 ring-border sm:p-7">
          <StartChoice />
        </section>
        <div className="justify-self-start">
          <LiveRefresh url="/api/rfx/all/version" initial={version} />
        </div>
      </div>
    );
  }

  const unread = rfxs.reduce((a, r) => a + (r.unread_docs ?? 0), 0);
  const awaiting = rfxs.filter((r) => r.award_status === "sent").length;
  const open = rfxs.filter((r) => !["awarded", "closed"].includes(r.status)).length;

  return (
    <div className="grid gap-5">
      {onboarding}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] leading-tight">Sourcing events</h1>
          <p className="mt-1 text-[14px] text-ink-secondary">
            {open} open · {unread ? <Link href={`/rfx/${rfxs.find((r) => r.unread_docs)?.id}?tab=documents`} className="text-warning hover:underline">{unread} unread document{unread === 1 ? "" : "s"}</Link> : "no unread documents"}
            {awaiting ? <> · {awaiting} award{awaiting === 1 ? "" : "s"} awaiting approval</> : null}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <LiveRefresh url="/api/rfx/all/version" initial={version} />
          <NewEventButton />
        </div>
      </header>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="h-fit overflow-hidden rounded-xl bg-card ring-1 ring-border">
          <div className="hidden grid-cols-[minmax(0,1fr)_120px_170px_120px_20px] gap-4 border-b border-border bg-[var(--grid-head)] px-4 py-2.5 text-xs text-ink-secondary md:grid">
            <span>Event</span><span>Status</span><span>Quotes in</span><span>Due</span><span />
          </div>
          <ul>
            {rfxs.map((r) => {
              const st = STATUS[r.status] ?? STATUS.draft;
              const pct = r.supplier_count ? Math.round((r.responded / r.supplier_count) * 100) : 0;
              return (
                <li key={r.id} className="border-b border-border last:border-0">
                  <Link href={`/rfx/${r.id}`} className="group grid gap-x-4 gap-y-2 px-4 py-3.5 transition-colors hover:bg-muted/50 md:grid-cols-[minmax(0,1fr)_120px_170px_120px_20px] md:items-center">
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 text-[12px] whitespace-nowrap text-ink-secondary">
                        <span className="rounded bg-night px-1.5 py-px text-[10px] font-medium tracking-wide text-on-dark">{r.event_type}</span>
                        <span className="num">{r.code}</span>
                        {r.created_via === "demo" ? <span className="rounded-full bg-lavender px-1.5 text-[11px] text-primary">Demo</span> : null}
                        {r.created_via === "claude" ? <Tip text="Created in Claude over MCP"><span tabIndex={0} aria-label="Created in Claude" className="inline-flex"><ClaudeMark className="size-3" /></span></Tip> : null}
                      </span>
                      <span className="mt-0.5 block truncate text-[15px] font-medium group-hover:text-primary">{r.title}</span>
                      <span className="text-[12px] text-ink-secondary">
                        {r.line_count} line items
                        {r.unread_docs ? <span className="text-warning"> · {r.unread_docs} unread</span> : null}
                        {r.award_status === "sent" ? <span className="text-primary"> · awaiting approval</span> : null}
                      </span>
                    </span>
                    <span>
                      <Tip text={st.help}><span tabIndex={0} className={`rounded-full px-2 py-0.5 text-xs capitalize ${st.cls}`}>{r.status}</span></Tip>
                    </span>
                    <span className="grid gap-1">
                      <span className="num text-[13px]">{r.responded} of {r.supplier_count} suppliers</span>
                      <span className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
                        <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                      </span>
                    </span>
                    <span className="num text-[13px] text-ink-secondary">{r.due_at ? new Date(r.due_at).toLocaleDateString("en-IN", { dateStyle: "medium" }) : "No due date"}</span>
                    <ChevronRight className="hidden size-4 text-ink-secondary group-hover:text-primary md:block" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>

        <aside className="grid content-start gap-4">
          <Link href="/connect" className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm ring-1 transition-colors ${connected ? "bg-card ring-border hover:ring-primary/40" : "bg-warning/10 ring-warning/30"}`}>
            <span className="relative grid size-8 place-items-center rounded-lg bg-[#F6EEE8]">
              <ClaudeMark className="size-4" />
              <span className={`absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-card ${connected ? "bg-[#3fbf7f]" : "bg-[#f0a43c]"}`} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{connected ? "Claude is connected" : "Connect Claude"}</span>
              <span className="block truncate text-xs text-ink-secondary">
                {connected ? `Last used ${new Date(user.last_mcp_at!).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}` : "Needed to read supplier quotes"}
              </span>
            </span>
            <ChevronRight className="size-4 text-ink-secondary" />
          </Link>

          <section className="rounded-xl bg-card p-4 ring-1 ring-border">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-[16px] font-medium">Ask Claude</h2>
              <Link href="/ask" className="inline-flex items-center gap-1 text-[13px] text-primary hover:underline">More <ArrowRight className="size-3.5" /></Link>
            </div>
            <p className="mt-0.5 mb-3 text-[13px] text-ink-secondary">Examples to start with. Ask anything else in your own words.</p>
            <PromptList prompts={HOME_PROMPTS} />
          </section>

          <section className="rounded-xl bg-card p-4 ring-1 ring-border">
            <h2 className="mb-3 text-[16px] font-medium">Recent activity</h2>
            <ActivityList events={events} compact />
          </section>
        </aside>
      </div>
    </div>
  );
}
