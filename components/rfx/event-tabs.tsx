"use client";

import Link from "next/link";
import { useMemo, useSyncExternalStore } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, SlidersHorizontal } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tip } from "@/components/tip";

export interface TabSpec { tab: string; label: string; help: string; n?: number; warn?: boolean; badge?: string; tone?: string }

const KEY = "bidline:event-tabs";
type Prefs = { order: string[]; hidden: string[] };
const EMPTY: Prefs = { order: [], hidden: [] };
const listeners = new Set<() => void>();
let cache: { raw: string | null; prefs: Prefs } = { raw: null, prefs: EMPTY };
const read = (): Prefs => {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw !== cache.raw) cache = { raw, prefs: raw ? { ...EMPTY, ...(JSON.parse(raw) as Prefs) } : EMPTY };
    return cache.prefs;
  } catch {
    return EMPTY;
  }
};
const write = (p: Prefs) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // private window: the order resets next visit
  }
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/**
 * The event's sections as one row of tabs. Everyone works in a different
 * order, so each person can reorder or hide tabs; the choice stays in this
 * browser. The open tab always shows, and Overview always stays first.
 */
export function EventTabs({ rfxId, tabs, active }: { rfxId: string; tabs: TabSpec[]; active: string }) {
  const prefs = useSyncExternalStore(subscribe, read, () => EMPTY);
  const ordered = useMemo(() => {
    const rank = (t: string) => (t === "overview" ? -1 : prefs.order.indexOf(t) === -1 ? 100 + tabs.findIndex((x) => x.tab === t) : prefs.order.indexOf(t));
    return [...tabs].sort((a, b) => rank(a.tab) - rank(b.tab));
  }, [tabs, prefs.order]);
  const shown = ordered.filter((t) => t.tab === active || t.tab === "overview" || !prefs.hidden.includes(t.tab));

  const move = (tab: string, dir: -1 | 1) => {
    const order = ordered.map((t) => t.tab).filter((t) => t !== "overview");
    const i = order.indexOf(tab);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    write({ ...prefs, order });
  };
  const toggle = (tab: string) => write({ ...prefs, hidden: prefs.hidden.includes(tab) ? prefs.hidden.filter((t) => t !== tab) : [...prefs.hidden, tab] });

  return (
    <div className="flex items-end gap-1 border-b border-border">
      <nav className="-mb-px flex min-w-0 flex-1 gap-0.5 overflow-x-auto [scrollbar-width:none]" aria-label="Event sections">
        {shown.map((s) => {
          const on = active === s.tab;
          return (
            <Tip key={s.tab} text={s.help} side="bottom">
              <Link href={`/rfx/${rfxId}?tab=${s.tab}`} aria-current={on ? "page" : undefined} scroll={false}
                className={`inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-[13.5px] whitespace-nowrap transition-colors ${on ? "border-primary text-foreground" : "border-transparent text-ink-secondary hover:text-foreground"}`}>
                {s.label}
                {s.n !== undefined && s.n > 0 ? <span className={`num rounded-full px-1.5 text-[11px] leading-[18px] ${s.warn ? "bg-warning/10 text-warning" : "bg-muted text-ink-secondary"}`}>{s.n}</span> : null}
                {s.badge ? (
                  <span className={`rounded-full px-1.5 text-[11px] leading-[18px] ${s.tone === "approved" ? "bg-success/10 text-success" : s.tone === "sent" || s.tone === "changes_requested" ? "bg-warning/10 text-warning" : s.tone === "rejected" ? "bg-destructive/10 text-destructive" : "bg-muted text-ink-secondary"}`}>{s.badge}</span>
                ) : null}
              </Link>
            </Tip>
          );
        })}
      </nav>
      <Popover>
        <Tip text="Reorder or hide tabs to match how you work" side="left">
          <PopoverTrigger aria-label="Customise tabs" className="mb-1 grid size-8 shrink-0 place-items-center rounded-lg text-ink-secondary hover:bg-muted hover:text-foreground">
            <SlidersHorizontal className="size-4" />
          </PopoverTrigger>
        </Tip>
        <PopoverContent align="end" className="w-64 p-2">
          <p className="px-2 pt-1 pb-2 text-[12px] text-ink-secondary">Arrange tabs your way. Saved in this browser.</p>
          <ul className="grid gap-px">
            {ordered.filter((t) => t.tab !== "overview").map((t, i, arr) => {
              const hidden = prefs.hidden.includes(t.tab);
              return (
                <li key={t.tab} className="flex items-center gap-1 rounded-md px-2 py-1 hover:bg-muted">
                  <span className={`min-w-0 flex-1 truncate text-[13px] ${hidden ? "text-ink-secondary line-through" : ""}`}>{t.label}</span>
                  <button onClick={() => move(t.tab, -1)} disabled={i === 0} aria-label={`Move ${t.label} left`} className="rounded p-1 text-ink-secondary hover:text-foreground disabled:opacity-30"><ArrowUp className="size-3.5" /></button>
                  <button onClick={() => move(t.tab, 1)} disabled={i === arr.length - 1} aria-label={`Move ${t.label} right`} className="rounded p-1 text-ink-secondary hover:text-foreground disabled:opacity-30"><ArrowDown className="size-3.5" /></button>
                  <button onClick={() => toggle(t.tab)} aria-label={hidden ? `Show ${t.label}` : `Hide ${t.label}`} className="rounded p-1 text-ink-secondary hover:text-foreground">
                    {hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </button>
                </li>
              );
            })}
          </ul>
          {prefs.order.length || prefs.hidden.length ? (
            <button onClick={() => write(EMPTY)} className="mt-1 w-full rounded-md px-2 py-1.5 text-left text-[12.5px] text-primary hover:bg-muted">Reset to the standard order</button>
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  );
}
