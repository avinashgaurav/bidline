import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listRfxs } from "@/lib/rfx";
import { SUGGESTIONS } from "@/lib/insights";
import { AskBox } from "@/components/rfx/ask";
import { PromptList } from "@/components/prompt-list";
import { EventSelect } from "@/components/event-select";
import { ConnectCard } from "@/components/connect-card";
import { EventFilesList } from "@/components/event-files";
import { appUrlFromHeaders } from "@/lib/app-url";
import { fileTotalsByEvent } from "@/lib/storage";

export const metadata = { title: "Ask Claude · Bidline" };
export const maxDuration = 60;

const EXAMPLES: Array<[string, string[]]> = [
  ["Read and check", [
    "In Bidline, read every unread supplier document on my latest sourcing event and submit the quotes.",
    "In Bidline, what needs my review before I can compare these quotes?",
    "In Bidline, explain how the cheapest price on line 1 was worked out, with the supplier's own words.",
  ]],
  ["Decide", [
    "Using only Bidline's figures, which qualified supplier should we award each line to, and why?",
    "In Bidline, what if we bought one whole category from a single supplier? Price it without saving.",
    "In Bidline, where are the biggest price differences between suppliers?",
  ]],
  ["Follow up and close", [
    "In Bidline, send a follow-up to each supplier for anything still missing, due in three days.",
    "In Bidline, draft the award using qualified suppliers only and give me the approval link for the CFO.",
    "In Bidline, give me a download link for the Excel export.",
  ]],
];

export default async function AskPage({ searchParams }: { searchParams: Promise<{ event?: string }> }) {
  const user = await requireUser();
  const [events, base, files, sp] = await Promise.all([listRfxs(user.id), appUrlFromHeaders(), fileTotalsByEvent(user.id), searchParams]);
  const current = events.find((e) => e.id === sp.event) ?? events[0];
  return (
    <div className="mx-auto grid max-w-5xl gap-5">
      <div>
        <h1 className="text-[24px] leading-tight">Ask Claude</h1>
        <p className="mt-1 max-w-[72ch] text-[14px] text-ink-secondary">
          Common questions are answered instantly by Bidline from the figures on record. For anything else, ask your Claude: it reads the
          supplier files and works through Bidline&apos;s tools, and every change shows here straight away. Bidline has no AI inside.
        </p>
      </div>
      {current ? (
        <section className="grid gap-3">
          <EventSelect events={events.map((e) => ({ id: e.id, code: e.code, title: e.title }))} current={current.id} />
          <AskBox key={current.id} rfxId={current.id} code={current.code} suggestions={SUGGESTIONS} />
        </section>
      ) : (
        <p className="rounded-xl bg-card p-5 text-sm text-ink-secondary ring-1 ring-border">There are no sourcing events yet. <Link href="/" className="text-primary hover:underline">Start one</Link>, then ask about it here.</p>
      )}
      <section id="connect" aria-label="Your Claude connector" className="scroll-mt-20">
        <ConnectCard url={`${base}/mcp/${user.mcp_token}`} connectedAt={user.last_mcp_at} />
      </section>
      <section className="rounded-xl bg-card p-4 ring-1 ring-border sm:p-5">
        <h2 className="text-[16px] font-medium">Things to ask Claude</h2>
        <p className="mt-0.5 text-[13px] text-ink-secondary">
          Starting points only. Ask in your own words, in a Claude chat with Bidline switched on.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {EXAMPLES.map(([group, prompts]) => (
            <div key={group} className="grid content-start gap-2">
              <p className="text-[12px] font-medium text-ink-secondary">{group}</p>
              <PromptList prompts={prompts} />
            </div>
          ))}
        </div>
      </section>
      <section className="rounded-xl bg-card p-4 ring-1 ring-border sm:p-5">
        <h2 className="text-[16px] font-medium">Supplier files, by sourcing event</h2>
        <p className="mt-0.5 mb-3 text-[13px] text-ink-secondary">
          Every file stored on your events. Download one to attach it to a Claude chat, or ask Claude to read them all for you.
        </p>
        <EventFilesList events={files} />
      </section>
    </div>
  );
}
