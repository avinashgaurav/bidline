/**
 * Prices that look unusual for their line: far below or above what the other
 * suppliers quoted (the median of the comparable prices), or far from the
 * budget. A flag is a prompt to check the spec or the reading, never a verdict.
 */
export interface Outlier { lineNo: number; supplier: string; unitInr: number; kind: "low" | "high"; note: string }

const LOW = 0.6;
const HIGH = 1.6;

export function findOutliers(
  lines: Array<{ no: number; baseline_inr: number }>,
  prices: Array<{ lineNo: number; supplier: string; unitInr: number | null; comparable: boolean }>,
): Outlier[] {
  const out: Outlier[] = [];
  for (const l of lines) {
    const row = prices.filter((p) => p.lineNo === l.no && p.comparable && p.unitInr !== null && p.unitInr > 0) as Array<{ lineNo: number; supplier: string; unitInr: number }>;
    const sorted = row.map((p) => p.unitInr).sort((a, b) => a - b);
    const median = sorted.length ? (sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2) : 0;
    for (const p of row) {
      const pct = (x: number) => `${Math.round(Math.abs(p.unitInr / x - 1) * 100)}%`;
      if (sorted.length >= 3 && p.unitInr < median * LOW) out.push({ lineNo: l.no, supplier: p.supplier, unitInr: p.unitInr, kind: "low", note: `${pct(median)} below the middle price of ${sorted.length} quotes. Check it is the same model and quantity.` });
      else if (sorted.length >= 3 && p.unitInr > median * HIGH) out.push({ lineNo: l.no, supplier: p.supplier, unitInr: p.unitInr, kind: "high", note: `${pct(median)} above the middle price of ${sorted.length} quotes.` });
      else if (l.baseline_inr > 0 && p.unitInr > l.baseline_inr * HIGH) out.push({ lineNo: l.no, supplier: p.supplier, unitInr: p.unitInr, kind: "high", note: `${pct(l.baseline_inr)} above your budget price.` });
      else if (l.baseline_inr > 0 && p.unitInr < l.baseline_inr * 0.5) out.push({ lineNo: l.no, supplier: p.supplier, unitInr: p.unitInr, kind: "low", note: `${pct(l.baseline_inr)} below your budget price. Check the unit and the spec.` });
    }
  }
  return out;
}
