import type { Comparison, CellInfo } from "./comparison";
import { cellKey } from "./comparison";
import type { NormStep, RawQuote } from "./calc/normalise";
import { shortName } from "./ui";

/** Plain, serialisable shapes for the client screens. */

export interface CellView {
  status: string;
  unitInr: number | null;
  extendedInr: number | null;
  flags: string[];
  trace: NormStep[];
  raw: { price?: number; uom?: string; ccy?: string } | null;
  info: CellInfo | null;
}

export interface SupplierView {
  id: string;
  code: string;
  name: string;
  short: string;
  status: string;
  totalInr: number;
  linesPriced: number;
  qualification: "qualified" | "failed" | "not_assessed" | "none";
  failed: string[];
}

export interface GridView {
  rfxId: string;
  lines: Array<{ no: number; sku: string; group: string; desc: string; uom: string; qty: number; packSize: number; baselineInr: number }>;
  suppliers: SupplierView[];
  cells: Record<string, CellView>;
  best: Record<number, string | null>;
  cheapestTotal: number;
  cheapestLines: number;
}

export function supplierViews(cmp: Comparison): SupplierView[] {
  return cmp.suppliers.map((s) => {
    const info = cmp.supplierInfo[s.code];
    const v = info.verdict;
    return {
      id: s.id, code: s.code, name: s.name, short: shortName(s.name), status: s.status,
      totalInr: info.single.totalInr, linesPriced: info.single.linesPriced,
      qualification: cmp.questions.length === 0 ? "none" : !v.assessed ? "not_assessed" : v.qualified ? "qualified" : "failed",
      failed: v.failedMandatory,
    };
  });
}

export function gridView(cmp: Comparison): GridView {
  const cells: Record<string, CellView> = {};
  const best: Record<number, string | null> = {};
  for (const l of cmp.lines) {
    let bestCode: string | null = null;
    let bestVal = Infinity;
    for (const s of cmp.suppliers) {
      const c = cmp.matrix[s.code]?.[l.no];
      const key = cellKey(s.code, l.no);
      if (!c) continue;
      cells[key] = {
        status: c.status, unitInr: c.unitInr, extendedInr: c.extendedInr, flags: c.flags, trace: c.trace,
        raw: c.raw ?? null, info: cmp.cellInfo[key] ?? null,
      };
      if (c.unitInr !== null && (c.status === "comparable" || c.status === "comparable_with_caveat") && c.unitInr < bestVal) {
        bestVal = c.unitInr;
        bestCode = s.code;
      }
    }
    best[l.no] = bestCode;
  }
  return {
    rfxId: cmp.rfx.id,
    lines: cmp.lines.map((l) => ({ no: l.no, sku: l.sku, group: l.group, desc: l.desc, uom: l.uom, qty: l.qty, packSize: l.pack_size, baselineInr: l.baseline_inr })),
    suppliers: supplierViews(cmp),
    cells,
    best,
    cheapestTotal: cmp.compliance.naive.totalInr,
    cheapestLines: cmp.compliance.naive.linesAwarded,
  };
}

export const inr = (n: number | null | undefined) =>
  n === null || n === undefined ? "" : `₹${Math.round(n).toLocaleString("en-IN")}`;
export const num = (n: number | null | undefined) =>
  n === null || n === undefined ? "" : Math.round(n).toLocaleString("en-IN");
export function inrShort(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e7) return `₹${(n / 1e7).toFixed(2)} cr`;
  if (a >= 1e5) return `₹${(n / 1e5).toFixed(1)} L`;
  return inr(n);
}

export type { RawQuote };
