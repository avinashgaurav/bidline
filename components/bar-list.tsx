"use client";

import Link from "next/link";
import { useState } from "react";
import { moneyShort } from "@/lib/prefs";
import { usePrefs } from "@/components/prefs-provider";

/**
 * Horizontal bars for one measure (indigo), with an optional reference mark
 * (the budget, a grey tick). Labels and values are text, never colour alone,
 * and a table view gives the exact numbers.
 */
export function BarList({ rows }: { rows: Array<{ label: string; value: number; ref?: number; meta?: string; href?: string }> }) {
  const [table, setTable] = useState(false);
  const prefs = usePrefs();
  const max = Math.max(1, ...rows.map((r) => Math.max(r.value, r.ref ?? 0)));
  if (!rows.length) return <p className="text-[13px] text-ink-secondary">Nothing to show yet.</p>;
  return (
    <div>
      <div className="mb-2 flex items-center gap-4 text-[11.5px] text-ink-secondary">
        <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-[#5266eb]" /> Awarded</span>
        {rows.some((r) => r.ref) ? <span className="flex items-center gap-1.5"><span className="h-3 w-[3px] rounded-sm bg-[#8a8799]" /> Budget</span> : null}
        <button onClick={() => setTable(!table)} className="ml-auto text-primary hover:underline">{table ? "Show chart" : "Show table"}</button>
      </div>
      {table ? (
        <table className="w-full text-[13px]">
          <thead className="text-left text-[12px] text-ink-secondary"><tr><th className="py-1 font-medium">Item</th><th className="py-1 text-right font-medium">Awarded</th><th className="py-1 text-right font-medium">Budget</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.label} className="border-t border-border"><td className="py-1.5 pr-2">{r.label}</td><td className="num py-1.5 text-right">{moneyShort(r.value, prefs)}</td><td className="num py-1.5 text-right text-ink-secondary">{r.ref ? moneyShort(r.ref, prefs) : "n/a"}</td></tr>)}</tbody>
        </table>
      ) : (
        <ul className="grid gap-2.5">
          {rows.map((r, i) => {
            const body = (
              <>
                <span className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="truncate">{r.label}</span>
                  <span className="num shrink-0">{r.value ? moneyShort(r.value, prefs) : ""}{r.meta ? <span className="ml-2 text-[11.5px] text-ink-secondary">{r.meta}</span> : null}</span>
                </span>
                <span className="relative mt-1 block h-2 rounded-full bg-muted">
                  <span className="grow-x absolute inset-y-0 left-0 rounded-full bg-[#5266eb]" style={{ width: `${(r.value / max) * 100}%`, animationDelay: `${i * 60}ms` }} />
                  {r.ref ? <span className="absolute -top-0.5 -bottom-0.5 w-[3px] rounded-sm bg-[#8a8799] ring-2 ring-card" style={{ left: `calc(${(r.ref / max) * 100}% - 1.5px)` }} title={`Budget ${moneyShort(r.ref, prefs)}`} /> : null}
                </span>
              </>
            );
            return <li key={r.label}>{r.href ? <Link href={r.href} className="block hover:text-primary">{body}</Link> : body}</li>;
          })}
        </ul>
      )}
    </div>
  );
}
