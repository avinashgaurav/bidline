import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { appUrlFromHeaders } from "@/lib/app-url";
import { listRfxs } from "@/lib/rfx";
import { listEvents, versionOf } from "@/lib/events";
import { ConnectCard } from "@/components/connect-card";
import { DemoButton, NewRfxForm } from "@/components/start-options";
import { OWN_DATA_PROMPT, PromptList } from "@/components/prompt-list";
import { CopyButton } from "@/components/copy-button";
import { LiveRefresh } from "@/components/live-refresh";
import { ActivityList } from "@/components/activity-list";
import { Onboarding } from "@/components/onboarding";

export const maxDuration = 60;

export const metadata = { title: "Sourcing events · Bidline" };

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-muted text-ink-secondary",
  issued: "bg-secondary text-primary",
  evaluating: "bg-warning/10 text-warning",
  awarded: "bg-success/10 text-success",
  closed: "bg-muted text-ink-secondary",
};

export default async function Dashboard() {
  const user = await requireUser();
  const [rfxs, base, events, version] = await Promise.all([
    listRfxs(user.id), appUrlFromHeaders(), listEvents({ userId: user.id, limit: 12 }), versionOf({ userId: user.id }),
  ]);
  const connector = `${base}/mcp/${user.mcp_token}`;

  const onboarding = <Onboarding connected={Boolean(user.last_mcp_at)} hasEvents={rfxs.length > 0} connectorUrl={connector} />;

  if (!rfxs.length) {
    return (
      <div className="mx-auto grid max-w-5xl gap-8">
        {onboarding}
        <div>
          <h1 className="text-[42px] leading-tight">Welcome to Bidline</h1>
          <p className="mt-2 max-w-2xl text-ink-secondary">Compare supplier quotes like for like, keep every price traceable to the supplier&apos;s own words, follow up on what is missing and get the award approved. Your Claude does the reading.</p>
        </div>
        <section className="grid gap-3">
          <h2 className="text-lg">Connect Claude</h2>
          <ConnectCard url={connector} connectedAt={user.last_mcp_at} />
        </section>
        <section className="grid gap-3">
          <h2 className="text-lg">Start a sourcing event</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col justify-between gap-5 rounded-xl bg-lavender p-7">
              <div>
                <h3 className="text-[24px]">Try the demo</h3>
                <p className="mt-2 text-sm text-ink-secondary">
                  An IT hardware RFQ with 30 line items and five supplier quotes: an Excel file, a revised Excel file, a PDF, a Word letter,
                  a photo of a rate card and an email. They arrive unread. Ask Claude to read them and the comparison fills in. All data is fictional.
                </p>
              </div>
              <DemoButton />
            </div>
            <div className="flex flex-col justify-between gap-5 rounded-xl bg-card p-7 ring-1 ring-border">
              <div>
                <h3 className="text-[24px]">Use your own data</h3>
                <p className="mt-2 text-sm text-ink-secondary">Tell Claude what you are buying and it creates the event here. Then upload the supplier quotes (PDF, Excel, Word, email, photos) and ask Claude to read them.</p>
                <div className="mt-3 rounded-lg bg-muted p-3 text-sm">
                  &ldquo;{OWN_DATA_PROMPT}&rdquo;
                  <div className="mt-2"><CopyButton text={OWN_DATA_PROMPT} label="Copy prompt" /></div>
                </div>
              </div>
              <details className="text-sm">
                <summary className="cursor-pointer text-primary">Or create one here without Claude</summary>
                <div className="mt-3"><NewRfxForm /></div>
              </details>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="grid gap-8">
      {onboarding}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px]">Supplier quote comparison</h1>
        </div>
        <LiveRefresh url="/api/rfx/all/version" initial={version} />
      </div>
      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="grid content-start gap-4">
          {rfxs.map((r) => (
            <Link key={r.id} href={`/rfx/${r.id}`} className="group rounded-xl bg-card p-6 ring-1 ring-border transition hover:ring-primary/40">
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-md bg-night px-1.5 py-0.5 text-[12px] font-medium tracking-wide text-on-dark">{r.event_type}</span>
                <span className="text-xs text-ink-secondary num">{r.code}</span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs capitalize ${STATUS_STYLE[r.status] ?? "bg-muted"}`}>{r.status}</span>
                {r.created_via === "claude" ? <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs text-primary">Created in Claude</span> : null}
                {r.unread_docs ? <span className="ml-auto rounded-full bg-warning/10 px-2.5 py-0.5 text-xs text-warning">{r.unread_docs} unread document{r.unread_docs === 1 ? "" : "s"}</span> : null}
              </div>
              <h2 className="mt-2 text-[18px] group-hover:text-primary">{r.title}</h2>
              <p className="mt-1 text-sm text-ink-secondary">
                {r.line_count} line items · {r.responded} of {r.supplier_count} suppliers quoted
                {r.due_at ? ` · due ${new Date(r.due_at).toLocaleDateString("en-IN", { dateStyle: "medium" })}` : ""}
              </p>
            </Link>
          ))}
          <div className="grid gap-4 rounded-xl bg-muted/60 p-6 md:grid-cols-2">
            <div>
              <h2 className="text-[18px]">New sourcing event</h2>
              <p className="mt-1 text-sm text-ink-secondary">Ask Claude to create one, or create it here and add line items yourself.</p>
              <div className="mt-3"><DemoButton label="Load another demo event" variant="outline" /></div>
            </div>
            <NewRfxForm />
          </div>
        </div>
        <aside className="grid content-start gap-6">
          <ConnectCard url={connector} connectedAt={user.last_mcp_at} compact />
          <div className="rounded-xl bg-card p-6 ring-1 ring-border">
            <h2 className="text-[18px]">Things to ask Claude</h2>
            <div className="mt-3"><PromptList /></div>
          </div>
          <div className="rounded-xl bg-card p-6 ring-1 ring-border">
            <h2 className="text-[18px]">Recent activity</h2>
            <div className="mt-3"><ActivityList events={events} compact /></div>
          </div>
        </aside>
      </div>
    </div>
  );
}
