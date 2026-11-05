"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { ClaudeMark } from "@/components/claude-mark";
import { ByTag } from "@/components/edited-tag";
import { date, time } from "@/lib/prefs";
import { usePrefs } from "@/components/prefs-provider";
import { DETAIL_LABEL, actorOf, entityOf, fmtValue, kindLabel } from "@/lib/audit-format";

export interface FeedEntry {
  id: string | number;
  rfx_id?: string | null;
  rfx_code?: string | null;
  rfx_title?: string | null;
  user_name?: string | null;
  actor: string;
  kind: string;
  tool: string | null;
  user_request: string | null;
  summary: string;
  detail: Record<string, unknown>;
  created_at: string;
}


/**
 * Audit entries grouped by day. Each says who (and through what), when to the
 * second, what they did, which item it touched, and on request the exact
 * values before and after. `showEvent` adds the event each entry belongs to.
 */
export function AuditFeed({ entries, showEvent = false, dense = false }: { entries: FeedEntry[]; showEvent?: boolean; dense?: boolean }) {
  const prefs = usePrefs();
  const days = useMemo(() => {
    const out: Array<[string, FeedEntry[]]> = [];
    for (const e of entries) {
      const d = date(e.created_at, prefs);
      const last = out.at(-1);
      if (last && last[0] === d) last[1].push(e);
      else out.push([d, [e]]);
    }
    return out;
  }, [entries, prefs]);
  if (!entries.length) return <p className="py-6 text-center text-[13px] text-ink-secondary">Nothing recorded for these filters yet.</p>;
  return (
    <div>
      {days.map(([day, list]) => (
        <section key={day} className="mb-3 last:mb-0">
          <p className={`sticky top-0 z-[1] -mx-1 bg-card/95 px-1 py-1 text-[11.5px] font-medium text-ink-secondary backdrop-blur ${dense ? "" : "sm:text-[12px]"}`}>{day}</p>
          <ol className="relative ml-2.5 border-l border-border">
            {list.map((e) => <Entry key={e.id} e={e} showEvent={showEvent} dense={dense} />)}
          </ol>
        </section>
      ))}
    </div>
  );
}

function Entry({ e, showEvent, dense }: { e: FeedEntry; showEvent: boolean; dense: boolean }) {
  const prefs = usePrefs();
  const [open, setOpen] = useState(false);
  const who = actorOf(e.actor, e.user_name, e.detail);
  const item = entityOf(e.kind, e.detail, e.rfx_code);
  const extra = Object.entries(e.detail ?? {}).filter(([k, v]) => DETAIL_LABEL[k] && v !== null && v !== undefined && !(Array.isArray(v) && !v.length));
  const hasMore = Boolean(e.user_request || e.tool || extra.length);
  return (
    <li className={`relative pl-4 ${dense ? "pb-3" : "pb-3.5"} last:pb-1`}>
      <span aria-hidden className="absolute top-0.5 -left-[9px] grid size-[17px] place-items-center rounded-full bg-card ring-1 ring-border">
        {e.actor === "claude" ? <ClaudeMark className="size-2.5" /> : <span className={`size-1.5 rounded-full ${e.actor === "approver" ? "bg-success" : e.actor === "user" ? "bg-primary" : "bg-fog"}`} />}
      </span>
      <div className="flex flex-wrap items-baseline gap-x-1.5 text-[12px] text-ink-secondary">
        <ByTag actor={e.actor} />
        <span className="font-medium text-foreground">{e.actor === "user" || e.actor === "approver" ? who.name : e.actor === "claude" ? "Claude" : who.name}</span>
        <span>{who.via}</span>
        <span aria-hidden>·</span>
        <time className="num" dateTime={e.created_at} title={new Date(e.created_at).toISOString()}>
          {time(e.created_at, prefs, true)}
        </time>
      </div>
      <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px]">
        <span className="rounded bg-muted px-1.5 py-px text-ink-secondary">{kindLabel(e.kind)}</span>
        <span className="text-ink-secondary">{item.type}:</span>{showEvent && e.rfx_id && item.name === e.rfx_code ? <Link href={`/rfx/${e.rfx_id}`} className="num font-medium text-primary hover:underline">{item.name}</Link> : <span className="font-medium">{item.name}</span>}
        {showEvent && e.rfx_id && item.name !== e.rfx_code ? <Link href={`/rfx/${e.rfx_id}`} className="num text-primary hover:underline">{e.rfx_code}</Link> : null}
      </p>
      <p className={`mt-0.5 leading-snug ${dense ? "text-[13px]" : "text-[13.5px]"}`}>{e.summary}</p>
      {hasMore ? (
        <>
          <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="mt-0.5 inline-flex items-center gap-1 text-[12px] text-primary hover:underline">
            {open ? "Hide details" : "Details"} <ChevronDown className={`size-3 transition ${open ? "rotate-180" : ""}`} />
          </button>
          {open ? (
            <dl className="mt-1.5 grid gap-1 rounded-lg bg-muted px-3 py-2 text-[12px]">
              {e.user_request ? <Detail k="Asked in Claude" v={`"${e.user_request}"`} /> : null}
              {e.tool ? <Detail k="Claude tool" v={e.tool} /> : null}
              {extra.map(([k, v]) => <Detail key={k} k={DETAIL_LABEL[k]} v={fmtValue(v)} />)}
              <Detail k="Recorded at" v={new Date(e.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "medium" })} />
              <Detail k="Entry" v={`#${e.id}`} />
            </dl>
          ) : null}
        </>
      ) : null}
    </li>
  );
}

function Detail({ k, v }: { k: string; v: string }) {
  return (
    <div className="grid grid-cols-[100px_minmax(0,1fr)] gap-2">
      <dt className="text-ink-secondary">{k}</dt>
      <dd className="break-words">{v}</dd>
    </div>
  );
}
