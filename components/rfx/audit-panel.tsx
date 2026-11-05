"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Download, History, Lock } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ClaudeMark } from "@/components/claude-mark";

export interface AuditEntry {
  id: number;
  actor: string;
  kind: string;
  tool: string | null;
  user_request: string | null;
  summary: string;
  detail: Record<string, unknown>;
  created_at: string;
}

const FILTERS = [["all", "All"], ["claude", "Claude"], ["user", "In the app"], ["approver", "Approver"]] as const;

const kindLabel = (k: string) => k.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/** Detail fields worth showing a reviewer, in plain words. Ids and internals stay out. */
const SHOW: Record<string, string> = { reason: "Reason", before: "Before", after: "After", decision: "Decision", to: "Sent to", items: "Items", lines: "Lines", issues: "Checks raised" };

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === "") return "none";
  if (Array.isArray(v)) return v.length ? v.map((x) => (x && typeof x === "object" ? fmt(x) : String(x))).join(" | ") : "none";
  if (typeof v === "object") {
    return Object.entries(v as Record<string, unknown>)
      .filter(([, x]) => x !== null && x !== undefined && x !== "")
      .map(([k, x]) => `${k}: ${typeof x === "object" ? JSON.stringify(x) : String(x)}`)
      .join(" · ") || "none";
  }
  return String(v);
}

/**
 * The audit trail as a side panel: every change on this event, who made it,
 * when, and what exactly changed. Read-only: entries are appended by Bidline
 * and cannot be edited or removed from the app or from Claude.
 */
export function AuditPanel({ rfxId, entries, buyerName }: { rfxId: string; entries: AuditEntry[]; buyerName: string }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("all");
  const shown = useMemo(() => entries.filter((e) => filter === "all" || e.actor === filter), [entries, filter]);
  const days = useMemo(() => {
    const out: Array<[string, AuditEntry[]]> = [];
    for (const e of shown) {
      const d = new Date(e.created_at).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
      const last = out.at(-1);
      if (last && last[0] === d) last[1].push(e);
      else out.push([d, [e]]);
    }
    return out;
  }, [shown]);

  const who = (e: AuditEntry) =>
    e.actor === "claude" ? { name: "Claude", sub: `for ${buyerName}, over MCP` }
      : e.actor === "user" ? { name: buyerName, sub: "in the app" }
        : e.actor === "approver" ? { name: String(e.detail?.name ?? "Approver"), sub: "on the approval link" }
          : { name: "Bidline", sub: "automatic" };

  return (
    <Sheet>
      <SheetTrigger className="inline-flex h-8 items-center gap-1.5 rounded-full bg-secondary px-3 text-[14px] outline-none hover:bg-lavender focus-visible:ring-3 focus-visible:ring-ring/30">
        <History className="size-3.5" /> Audit trail <span className="num rounded-full bg-card px-1.5 text-[11px] leading-[18px] text-ink-secondary">{entries.length}</span>
      </SheetTrigger>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-[520px]">
        <div className="border-b border-border px-5 pt-5 pb-4">
          <SheetTitle className="text-[18px] font-medium">Audit trail</SheetTitle>
          <SheetDescription className="mt-1 text-[13px] text-ink-secondary">
            Every change to this event: who made it, when, and what changed. Entries are stored with the event and cannot be edited or deleted.
          </SheetDescription>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {FILTERS.map(([k, l]) => {
              const n = k === "all" ? entries.length : entries.filter((e) => e.actor === k).length;
              return (
                <button key={k} type="button" onClick={() => setFilter(k)} aria-pressed={filter === k}
                  className={`rounded-full px-2.5 py-1 text-[13px] ${filter === k ? "bg-primary text-white" : "bg-secondary hover:bg-lavender"}`}>
                  {l} <span className="num opacity-75">{n}</span>
                </button>
              );
            })}
            <a href={`/api/rfx/${rfxId}/export/transcript`} className="ml-auto inline-flex items-center gap-1 text-[13px] text-primary hover:underline">
              <Download className="size-3.5" /> Download
            </a>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {!shown.length ? <p className="text-sm text-ink-secondary">Nothing here yet.</p> : null}
          {days.map(([day, list]) => (
            <section key={day} className="mb-5">
              <p className="sticky top-0 z-10 -mx-5 bg-popover/95 px-5 py-1.5 text-[12px] font-medium text-ink-secondary backdrop-blur">{day}</p>
              <ol className="relative ml-3 border-l border-border">
                {list.map((e) => <Entry key={e.id} e={e} who={who(e)} />)}
              </ol>
            </section>
          ))}
          <p className="mt-2 flex items-center gap-1.5 text-[12px] text-ink-secondary"><Lock className="size-3.5" /> Read-only record. Corrections add a new entry; the original reading is always kept.</p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Entry({ e, who }: { e: AuditEntry; who: { name: string; sub: string } }) {
  const [open, setOpen] = useState(false);
  const extra = Object.entries(e.detail ?? {}).filter(([k, v]) => SHOW[k] && v !== null && v !== undefined && !(Array.isArray(v) && !v.length));
  const hasMore = Boolean(e.user_request || e.tool || extra.length);
  return (
    <li className="relative pb-4 pl-5 last:pb-0">
      <span aria-hidden className="absolute top-0.5 -left-[11px] grid size-[21px] place-items-center rounded-full bg-popover ring-1 ring-border">
        {e.actor === "claude" ? <ClaudeMark className="size-3" /> : <span className={`size-2 rounded-full ${e.actor === "approver" ? "bg-success" : e.actor === "user" ? "bg-primary" : "bg-fog"}`} />}
      </span>
      <div className="flex flex-wrap items-baseline gap-x-2 text-[12px] text-ink-secondary">
        <span className="font-medium text-foreground">{who.name}</span>
        <span>{who.sub}</span>
        <span aria-hidden>·</span>
        <time className="num" dateTime={e.created_at}>{new Date(e.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time>
      </div>
      <p className="mt-0.5 text-[12px] text-ink-secondary">{kindLabel(e.kind)}</p>
      <p className="mt-0.5 text-[14px] leading-snug">{e.summary}</p>
      {hasMore ? (
        <>
          <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="mt-1 inline-flex items-center gap-1 text-[12px] text-primary hover:underline">
            {open ? "Hide details" : "Details"} <ChevronDown className={`size-3 transition ${open ? "rotate-180" : ""}`} />
          </button>
          {open ? (
            <dl className="mt-1.5 grid gap-1 rounded-lg bg-muted px-3 py-2 text-[12px]">
              {e.user_request ? <Detail k="Asked in Claude" v={`"${e.user_request}"`} /> : null}
              {e.tool ? <Detail k="Tool" v={e.tool} mono /> : null}
              {extra.map(([k, v]) => <Detail key={k} k={SHOW[k]} v={fmt(v)} />)}
              <Detail k="Recorded at" v={new Date(e.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "medium" })} />
            </dl>
          ) : null}
        </>
      ) : null}
    </li>
  );
}

function Detail({ k, v, mono = false }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[104px_minmax(0,1fr)] gap-2">
      <dt className="text-ink-secondary">{k}</dt>
      <dd className={`break-words ${mono ? "font-mono text-[11px]" : ""}`}>{v}</dd>
    </div>
  );
}
