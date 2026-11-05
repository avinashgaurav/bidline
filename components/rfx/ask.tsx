"use client";

import { useState, useTransition } from "react";
import { ArrowRight, Search } from "lucide-react";
import { askBidline } from "@/app/actions";
import type { Insight } from "@/lib/insights";
import { ClaudeMark } from "@/components/claude-mark";

/**
 * Ask about this sourcing event. Common analysis questions are answered
 * instantly by Bidline's own code; anything else goes to the buyer's Claude,
 * which answers with Bidline's tools.
 */
export function AskBox({ rfxId, code, suggestions }: { rfxId: string; code: string; suggestions: string[] }) {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<Insight | null | undefined>(undefined);
  const [asked, setAsked] = useState("");
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  const ask = (q: string) => {
    if (!q.trim()) return;
    setAsked(q);
    setCopied(false);
    start(async () => setResult(await askBidline(rfxId, q)));
  };

  const prompt = `In Bidline, for sourcing event ${code}: ${asked || question}. Use Bidline's figures only.`;
  const toClaude = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
    } catch {
      setCopied(false);
    }
    window.open(`https://claude.ai/new?q=${encodeURIComponent(prompt)}`, "_blank", "noopener");
  };

  return (
    <section className="rounded-xl bg-card p-4 ring-1 ring-border sm:p-5">
      <form onSubmit={(e) => { e.preventDefault(); ask(question); }} className="flex items-center gap-2">
        <label htmlFor="ask" className="sr-only">Ask about this sourcing event</label>
        <div className="relative flex-1">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-secondary" />
          <input
            id="ask" value={question} onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask about this event: savings against budget, line 13, Cygnus, biggest differences..."
            className="h-11 w-full rounded-full border border-input bg-background pr-4 pl-10 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
          />
        </div>
        <button type="submit" disabled={pending} className="inline-flex h-11 items-center gap-1.5 rounded-full bg-primary px-5 text-sm text-white hover:bg-primary/90 disabled:opacity-60">
          {pending ? "Working..." : "Ask"} <ArrowRight className="size-4" />
        </button>
      </form>
      <div className="mt-3 flex flex-wrap gap-2">
        {suggestions.map((s) => (
          <button key={s} type="button" onClick={() => { setQuestion(s); ask(s); }} className="rounded-full bg-secondary px-3 py-1.5 text-[14px] hover:bg-lavender">{s}</button>
        ))}
      </div>

      {result !== undefined && !pending ? (
        <div className="mt-4 grid gap-3 rounded-lg bg-muted/60 p-4">
          {result ? (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-[18px]">{result.title}</h3>
                <span className="text-xs text-ink-secondary">Calculated by Bidline from the figures on this page</span>
              </div>
              {result.lines.map((l, i) => <p key={i} className="text-sm">{l}</p>)}
              {result.table ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-xs text-ink-secondary">{result.table.head.map((h) => <th key={h} className="py-1.5 pr-4 font-medium">{h}</th>)}</tr></thead>
                    <tbody>{result.table.rows.map((r, i) => <tr key={i} className="border-t border-border">{r.map((c, j) => <td key={j} className={`num py-1.5 pr-4 ${j > 0 ? "whitespace-nowrap" : ""}`}>{c}</td>)}</tr>)}</tbody>
                  </table>
                </div>
              ) : null}
            </>
          ) : (
            <p className="text-sm">Bidline answers common analysis questions instantly. For &ldquo;{asked}&rdquo;, ask your Claude: it works from the same figures.</p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={toClaude} className="inline-flex h-9 items-center gap-2 rounded-full bg-night px-4 text-sm text-on-dark hover:bg-night-raised">
              <ClaudeMark className="size-4" /> {result ? "Go deeper in Claude" : "Ask Claude"}
            </button>
            {copied ? <span className="text-xs text-ink-secondary">Question copied. If Claude opens empty, paste it.</span> : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
