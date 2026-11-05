"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { CELL_CLASS, EMPTY_GLYPH, STATUS_ACTION, displayState } from "@/lib/ui";
import type { CellStatus } from "@/lib/calc/normalise";
import type { GridView } from "@/lib/view";
import { CellDrawer } from "./cell-drawer";

const num = (n: number | null | undefined) => (n === null || n === undefined ? "" : Math.round(n).toLocaleString("en-IN"));

const QUAL: Record<string, { label: string; cls: string }> = {
  qualified: { label: "Qualified", cls: "bg-success/10 text-success" },
  failed: { label: "Not qualified", cls: "bg-destructive/10 text-destructive" },
  not_assessed: { label: "Not assessed", cls: "bg-muted text-ink-secondary" },
  none: { label: "", cls: "" },
};

/**
 * The comparison grid: one row per RFx line, one column per supplier, every
 * cell the landed unit price per asked unit. Click any cell to see where the
 * number came from and to correct it.
 */
export function ComparisonGrid({ view }: { view: GridView }) {
  const [open, setOpen] = useState<{ code: string; lineNo: number } | null>(null);
  const groups: Array<{ name: string; lines: GridView["lines"] }> = [];
  for (const l of view.lines) {
    const g = groups.at(-1);
    if (g && g.name === l.group) g.lines.push(l);
    else groups.push({ name: l.group, lines: [l] });
  }

  if (!view.lines.length) {
    return <p className="rounded-xl bg-card p-8 text-sm text-ink-secondary ring-1 ring-border">This RFQ has no line items yet. Add them on the Line items tab, or ask Claude to add them.</p>;
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-4 pb-3 text-xs text-ink-secondary">
        <Legend cls="cell-best" label="Lowest price" />
        <Legend cls="cell-caveat" label="Off-spec or conditional" />
        <Legend cls="cell-review" label="Needs review, excluded from totals" />
        <Legend cls="cell-empty" label="No price" />
        <span className="inline-flex items-center gap-1"><Pencil className="size-3" /> Edited</span>
        <span>Landed unit prices in ₹ per RFQ unit, ex-GST.</span>
      </div>
      <div className="max-h-[70vh] overflow-auto rounded-xl bg-card ring-1 ring-border">
        <table className="grid-table w-full">
          <thead>
            <tr>
              <th className="col-sticky min-w-[300px]">Line item</th>
              <th className="text-right">Qty</th>
              {view.suppliers.map((s) => (
                <th key={s.code} className="min-w-[132px] text-right">
                  <div className="grid justify-items-end gap-1">
                    <span className="text-[11px] text-ink-secondary">{s.code}</span>
                    <span className="max-w-[150px] truncate" title={s.name}>{s.short}</span>
                    {s.qualification !== "none" ? (
                      <span title={s.failed.length ? `Failed mandatory questions: ${s.failed.join(", ")}` : undefined} className={`rounded-full px-2 py-0.5 text-[10px] font-normal ${QUAL[s.qualification].cls}`}>
                        {QUAL[s.qualification].label}
                      </span>
                    ) : null}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <GroupRows key={g.name + g.lines[0].no} group={g} view={view} onOpen={setOpen} />
            ))}
          </tbody>
          <tfoot>
            <tr className="font-medium">
              <td className="col-sticky">
                <div className="grid">
                  <span>All lines to one supplier</span>
                  <span className="text-[11px] font-normal text-ink-secondary">Comparable lines only, before any order discount</span>
                </div>
              </td>
              <td />
              {view.suppliers.map((s) => (
                <td key={s.code} className="num text-right">
                  ₹{num(s.totalInr)}
                  <span className="block text-[11px] font-normal text-ink-secondary">{s.linesPriced}/{view.lines.length} lines</span>
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      {open ? (
        <CellDrawer
          rfxId={view.rfxId}
          supplier={view.suppliers.find((s) => s.code === open.code)!}
          line={view.lines.find((l) => l.no === open.lineNo)!}
          cell={view.cells[`${open.code}:${open.lineNo}`]}
          isBest={view.best[open.lineNo] === open.code}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </>
  );
}

function GroupRows({ group, view, onOpen }: {
  group: { name: string; lines: GridView["lines"] }; view: GridView; onOpen: (x: { code: string; lineNo: number }) => void;
}) {
  return (
    <>
      {group.name ? (
        <tr className="group-row"><td className="col-sticky" colSpan={1}>{group.name}</td><td colSpan={view.suppliers.length + 1} /></tr>
      ) : null}
      {group.lines.map((l) => (
        <tr key={l.no}>
          <td className="col-sticky">
            <div className="flex max-w-[340px] items-baseline gap-2">
              <span className="num w-6 shrink-0 text-ink-secondary">{l.no}</span>
              <span className="truncate" title={l.desc}>{l.desc}</span>
            </div>
          </td>
          <td className="num text-right text-ink-secondary">{l.qty} <span className="text-[11px]">{l.uom}</span></td>
          {view.suppliers.map((s) => {
            const c = view.cells[`${s.code}:${l.no}`];
            if (!c) return <td key={s.code} />;
            const state = displayState(c.status as CellStatus);
            const best = view.best[l.no] === s.code;
            const corrected = c.info?.source === "override";
            const lowConf = c.info?.source === "read" && (c.info.confidence ?? 1) < 0.8 && c.unitInr !== null;
            const glyph = EMPTY_GLYPH[c.status as CellStatus];
            const action = STATUS_ACTION[c.status as CellStatus];
            return (
              <td key={s.code} className={`num p-0 text-right ${best ? "cell-best" : CELL_CLASS[state]}`}>
                <button
                  type="button"
                  onClick={() => onOpen({ code: s.code, lineNo: l.no })}
                  title={`${action?.label ?? ""}: ${c.flags[0] ?? action?.action ?? ""}`}
                  className="flex h-[34px] w-full items-center justify-end gap-1 px-2.5 hover:underline"
                  aria-label={`${s.name}, line ${l.no}: ${c.unitInr !== null ? `₹${num(c.unitInr)}` : action?.label ?? c.status}. Open details`}
                >
                  {corrected ? <Pencil className="size-3 text-primary" aria-hidden /> : null}
                  {c.unitInr !== null ? (
                    <span>{num(c.unitInr)}{lowConf ? <sup className="text-warning">?</sup> : null}</span>
                  ) : (
                    <span className="text-[11px] text-ink-secondary">{glyph?.short ?? action?.label}</span>
                  )}
                </button>
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}

function Legend({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-3 w-5 rounded-sm ring-1 ring-border ${cls}`} />
      {label}
    </span>
  );
}
