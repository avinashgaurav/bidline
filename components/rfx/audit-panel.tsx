"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { Download, History, Lock, PanelRightClose, PanelRightOpen } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { AuditFeed, type FeedEntry } from "@/components/audit-feed";
import { Tip } from "@/components/tip";

const FILTERS = [["all", "All"], ["user", "People"], ["claude", "Claude"], ["approver", "Approver"]] as const;
type Filter = (typeof FILTERS)[number][0];

const KEY = "bidline:audit-rail";
const listeners = new Set<() => void>();
const readCollapsed = () => {
  try {
    return localStorage.getItem(KEY) === "closed";
  } catch {
    return false;
  }
};
const setCollapsed = (v: boolean) => {
  try {
    localStorage.setItem(KEY, v ? "closed" : "open");
  } catch {
    // private window: resets next visit
  }
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

function Filtered({ rfxId, entries, onClose }: { rfxId: string; entries: FeedEntry[]; onClose?: () => void }) {
  const [filter, setFilter] = useState<Filter>("all");
  const shown = useMemo(() => entries.filter((e) => filter === "all" || e.actor === filter), [entries, filter]);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border px-4 pt-3.5 pb-3">
        <div className="flex items-center gap-2">
          <History className="size-4 text-ink-secondary" />
          <h2 className="text-[15px] font-medium">Audit trail</h2>
          <span className="num rounded-full bg-muted px-1.5 text-[11px] text-ink-secondary">{entries.length}</span>
          {onClose ? (
            <Tip text="Hide the audit trail" side="left">
              <button onClick={onClose} aria-label="Hide the audit trail" className="ml-auto rounded-md p-1 text-ink-secondary hover:bg-muted hover:text-foreground"><PanelRightClose className="size-4" /></button>
            </Tip>
          ) : null}
        </div>
        <p className="mt-1 text-[12px] text-ink-secondary">Every change to this event, newest first: who, when, what and the item it touched.</p>
        <div className="mt-2.5 flex flex-wrap items-center gap-1">
          {FILTERS.map(([k, l]) => (
            <button key={k} type="button" onClick={() => setFilter(k)} aria-pressed={filter === k}
              className={`rounded-md px-2 py-0.5 text-[12px] ${filter === k ? "bg-night text-on-dark" : "text-ink-secondary hover:bg-muted"}`}>
              {l} <span className="num opacity-70">{k === "all" ? entries.length : entries.filter((e) => e.actor === k).length}</span>
            </button>
          ))}
          <a href={`/api/rfx/${rfxId}/export/transcript`} className="ml-auto inline-flex items-center gap-1 text-[12px] text-primary hover:underline"><Download className="size-3.5" /> Download</a>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 [scrollbar-width:thin]">
        <AuditFeed entries={shown} dense />
        <p className="mt-3 flex items-center gap-1.5 text-[11.5px] text-ink-secondary"><Lock className="size-3" /> Read-only and sealed. Corrections add an entry; originals are kept.</p>
      </div>
    </div>
  );
}

/** The case-level audit trail, fixed beside the event on wide screens and collapsible. */
export function AuditRail({ rfxId, entries }: { rfxId: string; entries: FeedEntry[] }) {
  const collapsed = useSyncExternalStore(subscribe, readCollapsed, () => false);
  if (collapsed) {
    return (
      <aside className="sticky top-[72px] hidden h-[calc(100vh-88px)] xl:block">
        <Tip text="Show the audit trail" side="left">
          <button onClick={() => setCollapsed(false)} aria-label="Show the audit trail"
            className="flex h-full w-10 flex-col items-center gap-2 rounded-xl bg-card pt-3 text-ink-secondary ring-1 ring-border hover:text-foreground">
            <PanelRightOpen className="size-4" />
            <span className="num text-[11px]">{entries.length}</span>
            <span className="mt-1 text-[11px] [writing-mode:vertical-rl]">Audit trail</span>
          </button>
        </Tip>
      </aside>
    );
  }
  return (
    <aside className="sticky top-[72px] hidden h-[calc(100vh-88px)] overflow-hidden rounded-xl bg-card ring-1 ring-border xl:block">
      <Filtered rfxId={rfxId} entries={entries} onClose={() => setCollapsed(true)} />
    </aside>
  );
}

/** The same trail behind a button, for screens too narrow for the side panel. */
export function AuditSheetButton({ rfxId, entries }: { rfxId: string; entries: FeedEntry[] }) {
  return (
    <Sheet>
      <SheetTrigger className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] ring-1 ring-border hover:bg-muted xl:hidden">
        <History className="size-3.5" /> Audit <span className="num text-[11px] text-ink-secondary">{entries.length}</span>
      </SheetTrigger>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-[460px]">
        <SheetTitle className="sr-only">Audit trail</SheetTitle>
        <SheetDescription className="sr-only">Every change to this event.</SheetDescription>
        <Filtered rfxId={rfxId} entries={entries} />
      </SheetContent>
    </Sheet>
  );
}
