"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import type { DirectoryRow } from "@/lib/directory";
import { STAGE } from "@/lib/stages";
import { inrCompact } from "@/components/count-up";
import { InfoTip } from "@/components/tip";

/** Every supplier you have asked to quote, across events, with how reliable they have been. */
export function SupplierDirectory({ rows }: { rows: DirectoryRow[] }) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const shown = useMemo(() => {
    const t = text.trim().toLowerCase();
    return t ? rows.filter((r) => `${r.name} ${r.gstin ?? ""} ${r.city ?? ""}`.toLowerCase().includes(t)) : rows;
  }, [rows, text]);
  return (
    <div className="grid gap-4">
      <header>
        <h1 className="text-[24px] leading-tight tracking-[-0.01em]">Suppliers</h1>
        <p className="mt-1 max-w-[70ch] text-[14px] text-ink-secondary">Every supplier asked to quote across your sourcing events, matched by GSTIN or name. See who replies, who wins, and whose quotes needed correcting.</p>
      </header>
      <label className="relative max-w-[420px]">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-secondary" />
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search name, GSTIN or city" aria-label="Search suppliers"
          className="h-9 w-full rounded-lg bg-card pr-3 pl-9 text-[13.5px] ring-1 ring-border outline-none focus:ring-2 focus:ring-primary/50" />
      </label>
      <div className="overflow-hidden rounded-xl bg-card ring-1 ring-border">
        <div className="hidden grid-cols-[minmax(0,1fr)_90px_120px_110px_120px_90px_24px] gap-4 border-b border-border bg-[var(--grid-head)] px-4 py-2 text-[12px] text-ink-secondary lg:grid">
          <span>Supplier</span><span>Events</span>
          <span className="flex items-center gap-1">Reply rate<InfoTip text="Events where they sent a quote, out of the events they were asked in." /></span>
          <span>Lines won</span><span>Awarded value</span>
          <span className="flex items-center gap-1">Corrected<InfoTip text="Prices a person had to correct after reading. A high number means their quotes are hard to read or inconsistent." /></span>
          <span />
        </div>
        <ul>
          {shown.map((r) => {
            const rate = r.events ? Math.round((r.responded / r.events) * 100) : 0;
            const isOpen = open === r.key;
            return (
              <li key={r.key} className="border-b border-border last:border-0">
                <button onClick={() => setOpen(isOpen ? null : r.key)} aria-expanded={isOpen}
                  className="grid w-full gap-x-4 gap-y-1 px-4 py-2.5 text-left hover:bg-muted/50 lg:grid-cols-[minmax(0,1fr)_90px_120px_110px_120px_90px_24px] lg:items-center">
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-medium">{r.name}</span>
                    <span className="block truncate text-[12px] text-ink-secondary">{[r.city, r.gstin ? `GSTIN ${r.gstin}` : null, r.email].filter(Boolean).join(" · ") || "No details yet"}</span>
                  </span>
                  <span className="num text-[13px]">{r.events}</span>
                  <span className="grid gap-1">
                    <span className="num text-[12.5px]">{rate}%{r.declined ? <span className="text-ink-secondary"> · {r.declined} declined</span> : null}</span>
                    <span className="h-1 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-primary" style={{ width: `${rate}%` }} /></span>
                  </span>
                  <span className="num text-[13px]">{r.lines_won}</span>
                  <span className="num text-[13px]">{r.won_inr ? inrCompact(r.won_inr) : <span className="text-ink-secondary">n/a</span>}</span>
                  <span className={`num text-[13px] ${r.corrections ? "text-warning" : "text-ink-secondary"}`}>{r.corrections}</span>
                  <ChevronDown className={`hidden size-4 text-ink-secondary transition lg:block ${isOpen ? "rotate-180" : ""}`} />
                </button>
                {isOpen ? (
                  <div className="border-t border-border bg-muted/30 px-4 py-3">
                    <p className="mb-2 text-[12px] text-ink-secondary">{r.follow_ups} follow-up{r.follow_ups === 1 ? "" : "s"} sent{r.overdue ? `, ${r.overdue} overdue now` : ""}. Asked in:</p>
                    <ul className="grid gap-1">
                      {r.rfx.map((x) => (
                        <li key={x.id}>
                          <Link href={`/rfx/${x.id}?tab=suppliers`} className="flex flex-wrap items-center gap-2 text-[13px] hover:text-primary">
                            <span className={`size-1.5 rounded-full ${(STAGE[x.status] ?? STAGE.draft).dot}`} />
                            <span className="num">{x.code}</span><span className="truncate">{x.title}</span>
                            <span className="text-[12px] text-ink-secondary">· {x.supplier_status === "responded" ? "quoted" : x.supplier_status}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </li>
            );
          })}
          {!shown.length ? <li className="px-4 py-10 text-center text-[14px] text-ink-secondary">{rows.length ? "No supplier matches." : "No suppliers yet. They appear here once you add them to a sourcing event."}</li> : null}
        </ul>
      </div>
    </div>
  );
}
