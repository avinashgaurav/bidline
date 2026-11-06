"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Check, Copy, ExternalLink, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AskBox } from "@/components/rfx/ask";

const SUGGESTIONS = ["Who is cheapest overall?", "Savings against budget", "Biggest price differences", "What does each supplier still owe?"];
const WORKSPACE_PROMPTS = [
  "What is waiting across all my sourcing events in Bidline?",
  "In Bidline, read every unread supplier document on my latest sourcing event and submit the quotes.",
  "Which suppliers reply slowest in Bidline, and what have we awarded to each?",
];

/** A small figure: the agent's face, drawn so it reads at 20px. */
function AgentFigure({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v2.2" />
      <circle cx="12" cy="2.6" r="1" fill="currentColor" stroke="none" />
      <rect x="4.5" y="6" width="15" height="11.5" rx="4" />
      <circle cx="9.3" cy="11.5" r="1.25" fill="currentColor" stroke="none" className={active ? "motion-safe:animate-pulse" : ""} />
      <circle cx="14.7" cy="11.5" r="1.25" fill="currentColor" stroke="none" className={active ? "motion-safe:animate-pulse" : ""} />
      <path d="M9.5 14.6h5" />
      <path d="M7.5 20.5c1.2-1.6 2.8-2.4 4.5-2.4s3.3.8 4.5 2.4" />
    </svg>
  );
}

/**
 * The Bidline agent: a launcher in the corner. Inside an event it answers
 * common questions from Bidline's own figures straight away (no AI); anything
 * else, and anything across events, goes to the person's own Claude. Grey until
 * Claude is connected; a green dot means Claude is connected and changes show live.
 */
export function BidlineAgent({ connected, events }: { connected: boolean; events: Array<{ id: string; code: string }> }) {
  const path = usePathname();
  const rfxId = path.startsWith("/rfx/") ? path.split("/")[2] : null;
  const ev = events.find((e) => e.id === rfxId) ?? null;
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (t: string) => {
    await navigator.clipboard.writeText(t);
    setCopied(t);
    setTimeout(() => setCopied(null), 1600);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger aria-label={connected ? "Open the Bidline agent" : "Bidline agent: connect Claude to use it"}
        className={`fixed right-5 bottom-5 z-40 grid size-14 place-items-center rounded-2xl shadow-[0_12px_32px_-10px_rgba(23,23,33,0.45)] ring-1 transition-transform hover:-translate-y-0.5 ${
          connected ? "bg-night text-on-dark ring-white/10" : "bg-muted text-ink-secondary/60 ring-border"
        }`}>
        <AgentFigure active={connected} />
        <span className={`absolute top-1.5 right-1.5 size-2.5 rounded-full ring-2 ${connected ? "bg-[#3fbf7f] ring-night" : "bg-fog ring-muted"}`}>
          {connected ? <span className="absolute inset-0 rounded-full bg-[#3fbf7f] opacity-60 motion-safe:animate-ping" /> : null}
        </span>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" sideOffset={10} className="w-[min(420px,calc(100vw-24px))] p-0">
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <span className={`grid size-9 place-items-center rounded-xl ${connected ? "bg-night text-on-dark" : "bg-muted text-ink-secondary"}`}><AgentFigure active={connected} /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14.5px] font-medium">Bidline agent</span>
            <span className={`flex items-center gap-1.5 text-[12px] ${connected ? "text-success" : "text-ink-secondary"}`}>
              <span className={`size-1.5 rounded-full ${connected ? "bg-[#3fbf7f]" : "bg-fog"}`} />
              {connected ? "Claude connected · live" : "Waiting for Claude"}
            </span>
          </span>
          <button onClick={() => setOpen(false)} aria-label="Close" className="rounded-md p-1 text-ink-secondary hover:bg-muted"><X className="size-4" /></button>
        </div>
        {!connected ? (
          <div className="grid gap-3 p-4 text-[13.5px]">
            <p className="text-ink-secondary">The agent works through your own Claude. Connect it once and ask anything about your sourcing events, here or in a Claude chat.</p>
            <Link href="/ask#connect" onClick={() => setOpen(false)} className="inline-flex h-9 w-fit items-center rounded-lg bg-primary px-3.5 text-white hover:bg-primary/90">Connect Claude</Link>
          </div>
        ) : (
          <div className="grid max-h-[60vh] gap-3 overflow-y-auto p-4">
            {ev ? (
              <>
                <p className="text-[12.5px] text-ink-secondary">Ask about <span className="num">{ev.code}</span>. Common questions are answered here from Bidline&apos;s figures; others go to your Claude.</p>
                <AskBox rfxId={ev.id} code={ev.code} suggestions={SUGGESTIONS} />
              </>
            ) : (
              <>
                <p className="text-[12.5px] text-ink-secondary">Across all your events, ask your Claude. Copy one of these into a chat with Bidline switched on:</p>
                <ul className="grid gap-1.5">
                  {WORKSPACE_PROMPTS.map((p) => (
                    <li key={p} className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-[13px]">
                      <span className="flex-1">&ldquo;{p}&rdquo;</span>
                      <button onClick={() => copy(p)} aria-label="Copy" className="rounded-md p-1 text-ink-secondary hover:bg-card hover:text-foreground">
                        {copied === p ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="text-[12px] text-ink-secondary">Open an event to get instant answers from its figures here.</p>
              </>
            )}
            <a href="https://claude.ai/new" target="_blank" rel="noreferrer" className="inline-flex h-9 w-fit items-center gap-1.5 rounded-lg bg-night px-3.5 text-[13px] text-on-dark hover:bg-night-raised">
              Open Claude <ExternalLink className="size-3.5" />
            </a>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
