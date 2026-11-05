import Link from "next/link";
import { Check, Circle, Minus } from "lucide-react";
import type { ReadyCheck } from "@/lib/readiness";

/** Before an event goes to suppliers: what is done, what is left, and where to fix it. */
export function ReadyChecklist({ rfxId, checks, issued }: { rfxId: string; checks: ReadyCheck[]; issued: boolean }) {
  const required = checks.filter((c) => c.required);
  const done = required.filter((c) => c.ok).length;
  return (
    <section className="rounded-xl bg-card p-4 ring-1 ring-border sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-medium">{issued ? "Sent to suppliers" : "Ready to send?"}</h2>
        <span className={`text-[12.5px] ${done === required.length ? "text-success" : "text-ink-secondary"}`}>{done} of {required.length} required done</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        <span className="grow-x block h-full rounded-full bg-success" style={{ width: `${(done / required.length) * 100}%` }} />
      </div>
      <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
        {checks.map((c) => (
          <li key={c.key} className="flex items-start gap-2 text-[13.5px]">
            {c.ok ? <Check className="mt-0.5 size-4 shrink-0 text-success" /> : c.required ? <Circle className="mt-0.5 size-4 shrink-0 text-warning" /> : <Minus className="mt-0.5 size-4 shrink-0 text-ink-secondary" />}
            <span className="min-w-0">
              <span className={c.ok ? "" : c.required ? "text-foreground" : "text-ink-secondary"}>{c.label}</span>
              {!c.ok ? <Link href={`/rfx/${rfxId}?tab=${c.tab}`} className="ml-1.5 text-[12.5px] text-primary hover:underline">{c.fix}</Link> : null}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
