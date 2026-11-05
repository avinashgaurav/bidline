"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronRight, Search, Stamp } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { moneyShort } from "@/lib/prefs";
import { usePrefs } from "@/components/prefs-provider";
import { Ago } from "@/components/ago";

interface Pending { rfxId: string; code: string; title: string; totalInr: number | null; since: string }

/**
 * Awards waiting for this approver. One shows as a single row; two or more
 * collapse into a banner that opens a list sorted by value, so a backlog is
 * cleared in one place.
 */
export function ApprovalsBanner({ items }: { items: Pending[] }) {
  const [text, setText] = useState("");
  const prefs = usePrefs();
  const sorted = useMemo(() => [...items].sort((a, b) => (b.totalInr ?? 0) - (a.totalInr ?? 0)), [items]);
  const shown = sorted.filter((x) => !text.trim() || `${x.code} ${x.title}`.toLowerCase().includes(text.trim().toLowerCase()));
  if (!items.length) return null;
  const total = items.reduce((a, x) => a + (x.totalInr ?? 0), 0);
  if (items.length === 1) {
    const x = items[0];
    return (
      <Link href={`/rfx/${x.rfxId}?tab=award`} className="flex items-center gap-3 rounded-xl bg-success/5 px-4 py-3 ring-1 ring-success/25 hover:bg-success/10">
        <Stamp className="size-5 text-success" />
        <span className="min-w-0 flex-1 text-[14px]"><span className="font-medium">An award is waiting for your approval</span><span className="text-ink-secondary"> · <span className="num">{x.code}</span> {x.title}</span></span>
        <span className="num text-[14px] font-medium">{x.totalInr ? moneyShort(x.totalInr, prefs) : ""}</span>
        <ChevronRight className="size-4 text-ink-secondary" />
      </Link>
    );
  }
  return (
    <Sheet>
      <SheetTrigger className="flex w-full items-center gap-3 rounded-xl bg-success/5 px-4 py-3 text-left ring-1 ring-success/25 hover:bg-success/10">
        <Stamp className="size-5 text-success" />
        <span className="min-w-0 flex-1 text-[14px]"><span className="font-medium">{items.length} awards are waiting for your approval</span><span className="text-ink-secondary"> · {moneyShort(total, prefs)} in total</span></span>
        <span className="text-[13px] text-primary">Review</span>
        <ChevronRight className="size-4 text-ink-secondary" />
      </SheetTrigger>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-[460px]">
        <div className="border-b border-border p-4">
          <SheetTitle className="text-[17px] font-medium">Waiting for your approval</SheetTitle>
          <SheetDescription className="mt-0.5 text-[13px] text-ink-secondary">Largest first. Open one to see the award note and decide.</SheetDescription>
          <label className="relative mt-3 block">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-secondary" />
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Find an event" aria-label="Find an event"
              className="h-8 w-full rounded-lg bg-card pr-2 pl-8 text-[13px] ring-1 ring-border outline-none focus:ring-2 focus:ring-primary/50" />
          </label>
        </div>
        <ul className="overflow-y-auto">
          {shown.map((x) => (
            <li key={x.rfxId} className="border-b border-border">
              <Link href={`/rfx/${x.rfxId}?tab=award`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px]">{x.title}</span>
                  <span className="block text-[12px] text-ink-secondary"><span className="num">{x.code}</span> · sent <Ago iso={x.since} /></span>
                </span>
                <span className="num text-[14px] font-medium">{x.totalInr ? moneyShort(x.totalInr, prefs) : ""}</span>
              </Link>
            </li>
          ))}
          {!shown.length ? <li className="px-4 py-6 text-center text-[13px] text-ink-secondary">No event matches.</li> : null}
        </ul>
      </SheetContent>
    </Sheet>
  );
}
