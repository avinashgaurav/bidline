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

export const maxDuration = 60;

export const metadata = { title: "RFQs · Bidline" };

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

  if (!rfxs.length) {
    return (
      <div className="mx-auto grid max-w-5xl gap-8">
        <div>
          <p className="eyebrow">Welcome, {user.name}</p>
          <h1 className="mt-2 text-[34px] leading-tight">Two steps to compare your supplier quotes.</h1>
        </div>
        <section className="grid gap-3">
          <h2 className="text-lg">1. Connect Claude</h2>
          <ConnectCard url={connector} connectedAt={user.last_mcp_at} />
        </section>
        <section className="grid gap-3">
          <h2 className="text-lg">2. Start an RFQ</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col justify-between gap-5 rounded-xl bg-lavender p-7">
              <div>
                <p className="eyebrow">Demo data</p>
                <h3 className="mt-2 text-[22px]">An IT hardware RFQ with five supplier quotes</h3>
                <p className="mt-2 text-sm text-ink-secondary">
                  30 line items and five suppliers. The quotes are an Excel file, a revised Excel file, a PDF, a Word letter, a photo of a rate card
                  and an email. They are attached and unread. Ask Claude to read them and the comparison fills in. All data is fictional.
                </p>
              </div>
              <DemoButton />
            </div>
            <div className="flex flex-col justify-between gap-5 rounded-xl bg-card p-7 ring-1 ring-border">
              <div>
                <p className="eyebrow">Your own data</p>
                <h3 className="mt-2 text-[22px]">Tell Claude what you are buying</h3>
                <p className="mt-2 text-sm text-ink-secondary">Claude creates the RFQ here. Then upload the supplier quotes (PDF, Excel, Word, email, photos) and ask Claude to read them.</p>
                <div className="mt-3 rounded-lg bg-muted p-3 text-sm">
                  &ldquo;{OWN_DATA_PROMPT}&rdquo;
                  <div className="mt-2"><CopyButton text={OWN_DATA_PROMPT} label="Copy prompt" /></div>
                </div>
              </div>
              <details className="text-sm">
                <summary className="cursor-pointer text-primary">Or create an RFQ here without Claude</summary>
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
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Your RFQs</p>
          <h1 className="mt-1 text-[30px]">Supplier quote comparison</h1>
        </div>
        <LiveRefresh url="/api/rfx/all/version" initial={version} />
      </div>
      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="grid content-start gap-4">
          {rfxs.map((r) => (
            <Link key={r.id} href={`/rfx/${r.id}`} className="group rounded-xl bg-card p-6 ring-1 ring-border transition hover:ring-primary/40">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs text-ink-secondary num">{r.code}</span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs capitalize ${STATUS_STYLE[r.status] ?? "bg-muted"}`}>{r.status}</span>
                {r.created_via === "claude" ? <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs text-primary">Created in Claude</span> : null}
                {r.unread_docs ? <span className="ml-auto rounded-full bg-warning/10 px-2.5 py-0.5 text-xs text-warning">{r.unread_docs} unread document{r.unread_docs === 1 ? "" : "s"}</span> : null}
              </div>
              <h2 className="mt-2 text-[20px] group-hover:text-primary">{r.title}</h2>
              <p className="mt-1 text-sm text-ink-secondary">
                {r.line_count} line items · {r.responded} of {r.supplier_count} suppliers quoted
                {r.due_at ? ` · due ${new Date(r.due_at).toLocaleDateString("en-IN", { dateStyle: "medium" })}` : ""}
              </p>
            </Link>
          ))}
          <div className="grid gap-4 rounded-xl bg-muted/60 p-6 md:grid-cols-2">
            <div>
              <p className="eyebrow">New RFQ</p>
              <p className="mt-1 text-sm text-ink-secondary">Ask Claude to create one, or create it here and add line items yourself.</p>
              <div className="mt-3"><DemoButton label="Load another demo RFQ" variant="outline" /></div>
            </div>
            <NewRfxForm />
          </div>
        </div>
        <aside className="grid content-start gap-6">
          <ConnectCard url={connector} connectedAt={user.last_mcp_at} compact />
          <div className="rounded-xl bg-card p-6 ring-1 ring-border">
            <p className="eyebrow">Things to ask Claude</p>
            <div className="mt-3"><PromptList /></div>
          </div>
          <div className="rounded-xl bg-card p-6 ring-1 ring-border">
            <p className="eyebrow">Recent activity</p>
            <div className="mt-3"><ActivityList events={events} compact /></div>
          </div>
        </aside>
      </div>
    </div>
  );
}
