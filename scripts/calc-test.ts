/**
 * Calculator check: for the demo enquiry and a fixed set of supplier
 * readings, every one of the 150 cells and every headline total must match
 * the reference snapshot in fixture-expected.json, to the rupee.
 *
 * Pure: no database, no network. Run with `npm run test:calc`.
 */
import catalog from "../lib/data/demo-rfx.json";
import fixture from "./fixture-raw-quotes.json";
import expected from "./fixture-expected.json";
import {
  buildMatrix, cellStatusCounts, cheapestPerLine, costOfCompliance, likeForLike, singleVendor,
  type CalcRules, type RawQuote, type RfxContext, type RfxLine,
} from "../lib/calc/normalise";

const lines = catalog.lines as unknown as RfxLine[];
const rules: CalcRules = {
  uomAliases: catalog.uom_aliases as Record<string, string[]>,
  uomConversions: catalog.uom_conversions,
  fx: { USD: { rate: Number(catalog.assumptions.fx_usd_inr.value), source: catalog.assumptions.fx_usd_inr.source } },
  priorPo: catalog.prior_po,
};
const ctx: RfxContext = {
  lines,
  vendors: catalog.vendors.map((v) => ({ code: v.code })),
  qualification: catalog.qualification,
  statedDiscountPct: Object.fromEntries(
    Object.entries(catalog.terms).map(([k, t]) => [k, (t as { total_level_discount_pct?: number }).total_level_discount_pct ?? null]),
  ),
  rules,
};

const m = buildMatrix((fixture as { quotes: Record<string, Record<string, RawQuote>> }).quotes, ctx);

let failures = 0;
function expect(label: string, got: number | string, want: number | string) {
  const ok = typeof want === "number" ? Math.round(Number(got)) === want : got === want;
  if (!ok) failures++;
  if (!ok || process.env.VERBOSE) console.log(`${ok ? "PASS" : "FAIL"}  ${label}: ${got}${ok ? "" : `  (expected ${want})`}`);
}

// 1. Every one of the 150 cells matches the snapshot: status and landed price.
const cells = expected.cells as Record<string, { status: string; unitInr: number | null }>;
for (const [key, want] of Object.entries(cells)) {
  const [v, no] = key.split(":");
  const got = m[v]?.[Number(no)];
  expect(`${key} status`, got?.status ?? "missing", want.status);
  expect(`${key} landed`, String(got?.unitInr ?? null), String(want.unitInr));
}

// 2. Every headline figure matches.
for (const [code, want] of Object.entries(expected.singles)) {
  const s = singleVendor(m, code, false, ctx);
  expect(`single-supplier ${code}`, s.totalInr, want.total);
  expect(`single-supplier ${code} after stated discount`, s.totalAfterStatedDiscountInr, want.afterDiscount);
}
const cost = costOfCompliance(m, ctx);
expect("cheapest per line, all suppliers", cost.naive.totalInr, expected.naive);
expect("cheapest per line, qualified only", cost.compliant.totalInr, expected.compliant);
expect("cost of compliance", cost.deltaInr, expected.delta);
const c = cheapestPerLine(m, ["V1", "V2"], { excludeCaveats: true, key: "c", label: "qualified, no caveats", ctx });
expect("qualified, excluding caveats", c.totalInr, expected.noCaveats);
expect("lines fillable without caveats", c.linesAwarded, expected.noCaveatsLines);
const lfl = likeForLike([cost.naive, cost.compliant, c]);
lfl.scenarios.forEach((s, i) => expect(`like-for-like ${s.label}`, s.likeForLikeTotalInr, expected.likeForLike[i]));
const counts = cellStatusCounts(m, ctx);
for (const [k, want] of Object.entries(expected.counts)) expect(`${k} cells`, counts[k] ?? 0, want as number);

// 3. The unit traps land where they should.
expect("V4 L13 per DIMM -> per kit", m.V4[13].unitInr ?? -1, 19200);
expect("V4 L20 per pc -> per box of 10", m.V4[20].unitInr ?? -1, 41500);
expect("V4 L22 per pc -> per box of 50", m.V4[22].unitInr ?? -1, 13400);

console.log(failures
  ? `\n${failures} check(s) failed`
  : `All ${Object.keys(cells).length} cells and every headline total match the reference snapshot to the rupee.`);
process.exit(failures ? 1 : 0);
