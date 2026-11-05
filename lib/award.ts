import { cheapestPerLine, likeForLike, type Scenario } from "./calc/normalise";
import type { Comparison } from "./comparison";
import { cellKey } from "./comparison";
import { BadInput } from "./rfx";

export type ScenarioKey = "cheapest_all" | "cheapest_qualified" | "single_supplier";

export interface AwardPick {
  lineNo: number;
  sku: string;
  desc: string;
  qty: number;
  uom: string;
  supplierCode: string;
  supplierName: string;
  unitInr: number;
  extendedInr: number;
  status: string;
  flags: string[];
  corrected: boolean;
  source: string | null;
}

export interface AwardSnapshot {
  key: string;
  label: string;
  generatedAt: string;
  picks: AwardPick[];
  bySupplier: Array<{ code: string; name: string; lines: number; totalInr: number }>;
  totalInr: number;
  /** The sum of the line prices, before any whole-order discount. */
  linesTotalInr: number;
  linesAwarded: number;
  linesInRfx: number;
  unfilledLines: number[];
  baselineForAwardedInr: number;
  stateDiscount: { pct: number | null; applied: boolean; reason: string | null; totalAfterInr: number } | null;
  excludedSuppliers: Array<{ code: string; name: string; why: string }>;
  comparison: { otherLabel: string; otherTotalInr: number; warning: string | null; likeForLike: Array<{ label: string; totalInr: number }> } | null;
  correctedCells: number;
  caveatCells: number;
  fx: Array<{ currency: string; rate: number; source: string }>;
  gateOverride: string | null;
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

/** Freeze the numbers of one award option. Recomputed from the same calculator as the grid. */
export function buildAwardSnapshot(cmp: Comparison, key: ScenarioKey, supplierCode: string | null): AwardSnapshot {
  const all = cmp.suppliers.map((s) => s.code);
  const qualified = cmp.compliance.qualifiedVendors;
  let scenario: Scenario;
  let discount: AwardSnapshot["stateDiscount"] = null;
  if (key === "single_supplier") {
    if (!supplierCode) throw new BadInput("Choose a supplier for a single-supplier award.");
    scenario = cheapestPerLine(cmp.matrix, [supplierCode], { key, label: `All lines to ${nameOf(cmp, supplierCode)}`, ctx: cmp.ctx });
    const single = cmp.supplierInfo[supplierCode].single;
    discount = {
      pct: single.totalLevelDiscountPct,
      applied: single.totalLevelDiscountApplied,
      reason: single.totalLevelDiscountWithheldReason,
      totalAfterInr: single.totalAfterStatedDiscountInr,
    };
  } else if (key === "cheapest_qualified") {
    scenario = cheapestPerLine(cmp.matrix, qualified, { key, label: "Cheapest per line, qualified suppliers only", ctx: cmp.ctx });
  } else {
    scenario = cheapestPerLine(cmp.matrix, all, { key, label: "Cheapest per line, all suppliers", ctx: cmp.ctx });
  }

  const other = key === "cheapest_all" ? cmp.compliance.compliant : cmp.compliance.naive;
  const lfl = likeForLike([scenario, other]);
  const picks: AwardPick[] = Object.entries(scenario.picks).map(([no, p]) => {
    const line = cmp.lines.find((l) => l.no === Number(no))!;
    const cell = cmp.matrix[p.vendor][Number(no)];
    const info = cmp.cellInfo[cellKey(p.vendor, Number(no))];
    return {
      lineNo: Number(no), sku: line.sku, desc: line.desc, qty: line.qty, uom: line.uom,
      supplierCode: p.vendor, supplierName: nameOf(cmp, p.vendor),
      unitInr: p.unitInr, extendedInr: p.extendedInr, status: cell.status, flags: cell.flags,
      corrected: info?.source === "override", source: info?.filename ?? null,
    };
  }).sort((a, b) => a.lineNo - b.lineNo);

  const bySupplierMap = new Map<string, { code: string; name: string; lines: number; totalInr: number }>();
  for (const p of picks) {
    const e = bySupplierMap.get(p.supplierCode) ?? { code: p.supplierCode, name: p.supplierName, lines: 0, totalInr: 0 };
    e.lines++;
    e.totalInr += p.extendedInr;
    bySupplierMap.set(p.supplierCode, e);
  }

  const excluded = key === "cheapest_qualified"
    ? cmp.suppliers.filter((s) => !qualified.includes(s.code)).map((s) => {
        const v = cmp.supplierInfo[s.code].verdict;
        return { code: s.code, name: s.name, why: v.assessed ? `not qualified, failed mandatory questions ${v.failedMandatory.join(", ")}` : "questionnaire not assessed yet" };
      })
    : [];

  return {
    key,
    label: scenario.label,
    generatedAt: new Date().toISOString(),
    picks,
    bySupplier: [...bySupplierMap.values()].sort((a, b) => b.totalInr - a.totalInr),
    totalInr: discount?.applied ? discount.totalAfterInr : scenario.totalInr,
    linesTotalInr: scenario.totalInr,
    linesAwarded: scenario.linesAwarded,
    linesInRfx: cmp.lines.length,
    unfilledLines: scenario.unfilledLines,
    baselineForAwardedInr: picks.reduce((a, p) => a + (cmp.lines.find((l) => l.no === p.lineNo)?.baseline_inr ?? 0) * p.qty, 0),
    stateDiscount: discount,
    excludedSuppliers: excluded,
    comparison: {
      otherLabel: other.label,
      otherTotalInr: other.totalInr,
      warning: lfl.warning,
      likeForLike: lfl.scenarios.map((s) => ({ label: s.label, totalInr: s.likeForLikeTotalInr })),
    },
    correctedCells: picks.filter((p) => p.corrected).length,
    caveatCells: picks.filter((p) => p.status === "comparable_with_caveat").length,
    fx: Object.entries(cmp.rules.fx).map(([currency, r]) => ({ currency, rate: r.rate, source: r.source })),
    gateOverride: (cmp.rfx.gate as { overrideReason?: string } | null)?.overrideReason ?? null,
  };
}

const cell = (t: string) => t.replace(/[|\r\n]/g, " ");

function nameOf(cmp: Comparison, code: string) {
  return cmp.suppliers.find((s) => s.code === code)?.name ?? code;
}

/**
 * The award note. Every number in it comes from the snapshot, which comes
 * from the calculator. Claude's commentary is printed as commentary, under its
 * own heading, and never mixed into the figures.
 */
export function awardMarkdown(cmp: Comparison, s: AwardSnapshot, commentary: string | null): string {
  const r = cmp.rfx;
  const out: string[] = [];
  out.push(`# Award recommendation: ${r.code}`);
  out.push("");
  out.push(`**${r.title}**`);
  out.push("");
  out.push(`Award basis: ${s.label}. Prepared ${s.generatedAt.slice(0, 10)}.`);
  out.push("");
  out.push(`## Recommendation`);
  out.push("");
  out.push(`- Total: **${inr(s.totalInr)}** ex-GST across ${s.linesAwarded} of ${s.linesInRfx} lines.`);
  if (s.baselineForAwardedInr > 0) {
    const d = s.baselineForAwardedInr - s.totalInr;
    out.push(`- ${d >= 0 ? "Savings vs budget" : "Over budget"} on these lines: ${inr(Math.abs(d))} (${((Math.abs(d) / s.baselineForAwardedInr) * 100).toFixed(1)}%), against a budget of ${inr(s.baselineForAwardedInr)}.`);
  }
  if (s.stateDiscount?.pct) {
    out.push(`- Order discount of ${s.stateDiscount.pct}% stated by the supplier: ${s.stateDiscount.applied ? `applied. Line items add up to ${inr(s.linesTotalInr)} before the discount` : `not applied. ${s.stateDiscount.reason}`}.`);
  }
  if (s.unfilledLines.length) out.push(`- Not awardable on this basis: line${s.unfilledLines.length === 1 ? "" : "s"} ${s.unfilledLines.join(", ")} (no comparable price).`);
  out.push("");
  out.push(`## By supplier`);
  out.push("");
  out.push(`| Supplier | Lines | Total (₹, ex-GST) |`);
  out.push(`|---|---:|---:|`);
  for (const b of s.bySupplier) out.push(`| ${b.code} ${cell(b.name)} | ${b.lines} | ${Math.round(b.totalInr).toLocaleString("en-IN")} |`);
  out.push("");
  if (s.comparison) {
    out.push(`## Alternative award basis`);
    out.push("");
    out.push(`${s.comparison.otherLabel}: ${inr(s.comparison.otherTotalInr)}.`);
    if (s.comparison.warning) {
      out.push("");
      out.push(`> ${s.comparison.warning}`);
      out.push("");
      for (const l of s.comparison.likeForLike) out.push(`- ${l.label}, on the lines quoted by both: ${inr(l.totalInr)}`);
    }
    out.push("");
  }
  if (s.excludedSuppliers.length) {
    out.push(`## Suppliers excluded`);
    out.push("");
    for (const e of s.excludedSuppliers) out.push(`- ${e.code} ${e.name}: ${e.why}`);
    out.push("");
  }
  out.push(`## Notes for the approver`);
  out.push("");
  out.push(`- ${s.caveatCells} awarded line${s.caveatCells === 1 ? " is" : "s are"} off-spec or conditional (substitute item, lower specification, ex-works or scope change).`);
  out.push(`- ${s.correctedCells} awarded price${s.correctedCells === 1 ? " was" : "s were"} edited by the buyer. Each edit and its reason is in the activity log.`);
  for (const f of s.fx) out.push(`- Exchange rate: 1 ${f.currency} = ₹${f.rate} (${f.source}).`);
  if (s.gateOverride) out.push(`- The event was issued with unclear line items. Reason given: "${s.gateOverride}".`);
  out.push(`- Excluded from all totals: unreadable prices, prices where two reads disagreed, prices with no source in the supplier's document, and offers without a firm price.`);
  out.push("");
  if (commentary?.trim()) {
    out.push(`## Commentary (all figures above are calculated by Bidline)`);
    out.push("");
    for (const line of commentary.trim().split(/\r?\n/)) out.push(`> ${line.replace(/^[\s>#|]+/, "").replace(/\|/g, "/")}`);
    out.push("");
  }
  out.push(`## Line items`);
  out.push("");
  out.push(`| Line | Item | Qty | Supplier | Unit price ₹ | Total ₹ | Notes |`);
  out.push(`|---:|---|---:|---|---:|---:|---|`);
  for (const p of s.picks) {
    const note = [p.corrected ? "edited" : "", p.status === "comparable_with_caveat" ? "off-spec or conditional" : ""].filter(Boolean).join(", ");
    out.push(`| ${p.lineNo} | ${cell(`${p.sku} ${p.desc.slice(0, 48)}`)} | ${p.qty} ${cell(p.uom)} | ${p.supplierCode} | ${Math.round(p.unitInr).toLocaleString("en-IN")} | ${Math.round(p.extendedInr).toLocaleString("en-IN")} | ${note} |`);
  }
  return out.join("\n");
}
