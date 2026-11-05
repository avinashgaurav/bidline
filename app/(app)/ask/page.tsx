import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listRfxs } from "@/lib/rfx";
import { SUGGESTIONS } from "@/lib/insights";
import { AskBox } from "@/components/rfx/ask";
import { PromptList } from "@/components/prompt-list";

export const metadata = { title: "Ask Claude · Bidline" };

export default async function AskPage({ searchParams }: { searchParams: Promise<{ event?: string }> }) {
  const user = await requireUser();
  const events = await listRfxs(user.id);
  const sp = await searchParams;
  const current = events.find((e) => e.id === sp.event) ?? events[0];
  return (
    <div className="mx-auto grid max-w-4xl gap-6">
      <div>
        <h1 className="text-[28px]">Ask Claude</h1>
        <p className="mt-1 max-w-2xl text-ink-secondary">
          Common analysis questions are answered instantly by Bidline from the figures on record. For anything else, Bidline hands the question to your
          Claude, which answers with Bidline&apos;s own numbers.
        </p>
      </div>
      {current ? (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-ink-secondary">Sourcing event:</span>
            {events.map((e) => (
              <Link key={e.id} href={`/ask?event=${e.id}`}
                title={e.title}
                className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-3 py-1.5 ${e.id === current.id ? "bg-primary text-white" : "bg-secondary hover:bg-lavender"}`}>
                <span className="num shrink-0">{e.code}</span> <span className="max-w-[260px] truncate opacity-80">{e.title}</span>
              </Link>
            ))}
          </div>
          <AskBox key={current.id} rfxId={current.id} code={current.code} suggestions={SUGGESTIONS} />
        </>
      ) : (
        <p className="rounded-xl bg-card p-6 text-sm text-ink-secondary ring-1 ring-border">There are no sourcing events yet. <Link href="/" className="text-primary hover:underline">Start one</Link>, then ask about it here.</p>
      )}
      <section className="rounded-xl bg-card p-6 ring-1 ring-border">
        <h2 className="text-[18px]">Things to ask Claude</h2>
        <p className="mt-1 mb-4 text-sm text-ink-secondary">Copy one into a Claude chat with Bidline switched on.</p>
        <PromptList />
      </section>
    </div>
  );
}
