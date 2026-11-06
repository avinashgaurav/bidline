"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Lock, Search, X } from "lucide-react";
import { EVENT_VIEWS, STAGE, inView } from "@/lib/stages";
import { ClaudeMark } from "@/components/claude-mark";
import { Tip } from "@/components/tip";
import { moneyShort } from "@/lib/prefs";
import { usePrefs } from "@/components/prefs-provider";

export interface EventRowLite {
  id: string; code: string; title: string; status: string; event_type: string; created_via: string; restricted: boolean;
  archived_at: string | null; owner_name: string | null; due_at: string | null; updated_at: string;
  line_count: number; supplier_count: number; responded: number; doc_count: number; unread_docs: number;
  needs_review: number; open_chases: number; overdue_chases: number; award_status: string | null;
  award_total_inr: number | null; budget_inr: number;
}

const pastDue = (e: EventRowLite) => Boolean(e.due_at && !e.archived_at && ["draft", "issued", "evaluating"].includes(e.status) && new Date(e.due_at).getTime() < Date.now());

type SortKey = "updated" | "due" | "title" | "progress" | "value";
const SORTS: Array<[SortKey, string]> = [["updated", "Last activity"], ["due", "Due date"], ["title", "Name"], ["progress", "Quotes in"], ["value", "Value"]];

/** Every sourcing event in one table that stays usable at 20, 50 or 200 events: views, search, owner and sort. */
export function EventsTable({ events, view, canEdit, initial }: {
  events: EventRowLite[]; view: string; canEdit: boolean; initial: { q?: string; owner?: string; sort?: string; dir?: string };
}) {
  const router = useRouter();
  const prefs = usePrefs();
  // Search, owner and sort live in the link, so a view can be bookmarked or shared.
  const [text, setTextState] = useState(initial.q ?? "");
  const [owner, setOwnerState] = useState(initial.owner ?? "");
  const [sort, setSortState] = useState<SortKey>(SORTS.some(([k]) => k === initial.sort) ? (initial.sort as SortKey) : "updated");
  const [asc, setAscState] = useState(initial.dir === "asc");
  const sync = (next: Partial<{ q: string; owner: string; sort: string; dir: string }>) => {
    const p = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(next)) if (v) p.set(k, v); else p.delete(k);
    router.replace(`/events${p.size ? `?${p}` : ""}`, { scroll: false });
  };
  const setText = (v: string) => { setTextState(v); sync({ q: v }); };
  const setOwner = (v: string) => { setOwnerState(v); sync({ owner: v }); };
  const setSort = (v: SortKey) => { setSortState(v); sync({ sort: v === "updated" ? "" : v }); };
  const setAsc = (v: boolean) => { setAscState(v); sync({ dir: v ? "asc" : "" }); };
  const owners = useMemo(() => [...new Set(events.map((e) => e.owner_name).filter(Boolean) as string[])].sort(), [events]);
  const current = EVENT_VIEWS.find((v) => v.key === view) ?? EVENT_VIEWS[0];

  const rows = useMemo(() => {
    const t = text.trim().toLowerCase();
    const list = events.filter((e) => inView(e, current.key) && (!owner || e.owner_name === owner) && (!t || `${e.title} ${e.code} ${e.owner_name ?? ""}`.toLowerCase().includes(t)));
    const val = (e: EventRowLite): number | string => {
      if (sort === "title") return e.title.toLowerCase();
      if (sort === "due") return e.due_at ? +new Date(e.due_at) : Number.MAX_SAFE_INTEGER;
      if (sort === "progress") return e.supplier_count ? e.responded / e.supplier_count : 0;
      if (sort === "value") return e.award_total_inr ?? e.budget_inr;
      return +new Date(e.updated_at);
    };
    return [...list].sort((a, b) => {
      const x = val(a), y = val(b);
      const c = x < y ? -1 : x > y ? 1 : 0;
      return asc ? c : -c;
    });
  }, [events, current.key, owner, text, sort, asc]);

  const setView = (k: string) => router.push(k === "all" ? "/events" : `/events?view=${k}`);

  return (
    <div className="grid gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] leading-tight tracking-[-0.01em]">Sourcing events</h1>
          <p className="mt-1 text-[14px] text-ink-secondary">{current.help}</p>
        </div>
        {canEdit ? <Link href="/?new=1" className="inline-flex h-9 items-center rounded-lg bg-primary px-3.5 text-[13.5px] text-white hover:bg-primary/90">New sourcing event</Link> : null}
      </header>

      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5" role="tablist" aria-label="Views">
        {EVENT_VIEWS.map((v) => {
          const n = events.filter((e) => inView(e, v.key)).length;
          const on = v.key === current.key;
          return (
            <button key={v.key} role="tab" aria-selected={on} onClick={() => setView(v.key)}
              className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[13px] transition-colors ${on ? "bg-night text-on-dark" : "text-ink-secondary hover:bg-muted hover:text-foreground"}`}>
              {v.label}<span className={`num text-[11.5px] ${on ? "text-fog" : "text-ink-secondary/70"}`}>{n}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-secondary" />
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search by name, code or owner" aria-label="Search events"
            className="h-9 w-full rounded-lg bg-card pr-8 pl-9 text-[13.5px] ring-1 ring-border outline-none focus:ring-2 focus:ring-primary/50" />
          {text ? <button onClick={() => setText("")} aria-label="Clear search" className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-ink-secondary hover:text-foreground"><X className="size-3.5" /></button> : null}
        </label>
        {owners.length > 1 ? (
          <select value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Owner" className="h-9 rounded-lg bg-card px-3 text-[13.5px] ring-1 ring-border outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
            <option value="">Everyone</option>
            {owners.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : null}
        <div className="flex items-center gap-1">
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort by" className="h-9 rounded-lg bg-card px-3 text-[13.5px] ring-1 ring-border outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
            {SORTS.map(([k, l]) => <option key={k} value={k}>Sort: {l}</option>)}
          </select>
          <button onClick={() => setAsc(!asc)} aria-label={asc ? "Ascending" : "Descending"} className="grid size-9 place-items-center rounded-lg bg-card ring-1 ring-border hover:bg-muted">
            {asc ? <ArrowUp className="size-4" /> : <ArrowDown className="size-4" />}
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl bg-card ring-1 ring-border">
        <div className="hidden grid-cols-[minmax(0,1fr)_140px_120px_150px_110px_100px] gap-4 border-b border-border bg-[var(--grid-head)] px-4 py-2 text-[12px] text-ink-secondary lg:grid">
          <span>Event</span><span>Stage</span><span>Owner</span><span>Quotes in</span><span>Waiting</span><span className="text-right">Value</span>
        </div>
        <ul>
          {rows.map((e) => {
            const st = STAGE[e.status] ?? STAGE.draft;
            const pct = e.supplier_count ? Math.round((e.responded / e.supplier_count) * 100) : 0;
            const waits = [
              e.unread_docs ? `${e.unread_docs} unread` : null,
              e.needs_review ? `${e.needs_review} unreadable` : null,
              e.overdue_chases ? `${e.overdue_chases} overdue` : null,
              e.award_status === "sent" ? "approval" : null,
            ].filter(Boolean) as string[];
            return (
              <li key={e.id} className="border-b border-border last:border-0">
                <Link href={`/rfx/${e.id}`} className="group grid gap-x-4 gap-y-1.5 px-4 py-2.5 hover:bg-muted/50 lg:grid-cols-[minmax(0,1fr)_140px_120px_150px_110px_100px] lg:items-center">
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[14px] font-medium group-hover:text-primary">{e.title}</span>
                      {e.restricted ? <Tip text="Restricted: only admins, its creator and named people can see it."><Lock className="size-3 shrink-0 text-ink-secondary" /></Tip> : null}
                    </span>
                    <span className="flex items-center gap-1.5 text-[12px] text-ink-secondary">
                      <span className="rounded bg-night px-1 text-[11.5px] font-medium tracking-wide text-on-dark">{e.event_type}</span>
                      <span className="num">{e.code}</span> · {e.line_count} items
                      {e.due_at ? <> · due {new Date(e.due_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</> : null}
                      {pastDue(e) ? <Tip text="Quotes were due and the event is not awarded yet."><span className="rounded-full bg-destructive/10 px-1.5 text-[12px] text-destructive">Overdue</span></Tip> : null}
                      {e.created_via === "claude" ? <Tip text="Created in Claude"><span className="inline-flex"><ClaudeMark className="size-3" /></span></Tip> : null}
                      {e.created_via === "demo" ? <span className="rounded-full bg-lavender px-1.5 text-[12px] text-primary">Demo</span> : null}
                    </span>
                  </span>
                  <span><Tip text={st.help}><span tabIndex={0} className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] ${st.chip}`}><span className={`size-1.5 rounded-full ${st.dot}`} />{st.label}</span></Tip></span>
                  <span className="truncate text-[13px] text-ink-secondary">{e.owner_name ?? "Unknown"}</span>
                  <span className="grid gap-1">
                    <span className="num text-[12.5px]">{e.responded} of {e.supplier_count} suppliers</span>
                    <span className="h-1 overflow-hidden rounded-full bg-muted" aria-hidden><span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></span>
                  </span>
                  <span className="text-[12.5px]">{waits.length ? <span className="text-warning">{waits.join(", ")}</span> : <span className="text-ink-secondary">Nothing</span>}</span>
                  <span className="num text-[13px] lg:text-right">
                    {e.award_total_inr !== null ? <Tip text={`Latest award (${e.award_status?.replace(/_/g, " ")})`}><span tabIndex={0}>{moneyShort(e.award_total_inr, prefs)}</span></Tip>
                      : e.budget_inr ? <Tip text="Budget: no award yet"><span tabIndex={0} className="text-ink-secondary">{moneyShort(e.budget_inr, prefs)}</span></Tip> : <span className="text-ink-secondary">n/a</span>}
                  </span>
                </Link>
              </li>
            );
          })}
          {!rows.length ? (
            <li className="px-4 py-10 text-center text-[14px] text-ink-secondary">
              {text || owner ? "No events match. Clear the search or the owner filter." : current.key === "archived" ? "Nothing archived. Archive a finished event from its page to tidy this list." : "No events here right now."}
            </li>
          ) : null}
        </ul>
      </div>
      <p className="text-[12px] text-ink-secondary">{rows.length} of {events.length} events shown.</p>
    </div>
  );
}
