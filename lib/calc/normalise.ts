/**
 * The calculator. Every number a buyer sees is produced here, in plain
 * TypeScript. Claude reads documents and reports what they say; this file
 * turns those readings into landed, comparable prices.
 *
 * Normalisation order is fixed:
 *   raw price -> unit alias -> unit conversion -> currency -> scope -> extension
 *   (x the ASKED quantity) -> discounts
 */
export type CellStatus =
  | "comparable"              // a number you can rank
  | "comparable_with_caveat"  // a number, but the offer deviates from spec
  | "resolved_from_reference" // derived from a prior PO, needs vendor confirmation
  | "needs_review"            // we have raw input we cannot safely normalise
  | "unreadable"              // a price exists on the source and cannot be read
  | "declined"                // vendor explicitly said no
  | "omitted"                 // silently absent, vendor may not have noticed
  | "non_comparable"          // an "offer" that is not a price
  | "unresolvable"            // priced by reference to data we do not hold
  | "unmapped"                // vendor invented a line with no RFx equivalent
  | "not_read";               // WE have not read their response. Not their fault.

const AWARDABLE: ReadonlySet<CellStatus> = new Set<CellStatus>([
  "comparable",
  "comparable_with_caveat",
]);

export const isAwardable = (s: CellStatus, includeUnconfirmed = false) =>
  AWARDABLE.has(s) || (includeUnconfirmed && s === "resolved_from_reference");

export const hasNumber = (c: Cell) => c.unitInr !== null;

export interface NormStep {
  rule: string;   // what was applied
  basis: string;  // WHY it was applied, and from what source
  result: string; // where the number stood after it
}

export interface RawQuote {
  status: string;
  price?: number;
  uom?: string;
  ccy?: string;
  qty_override?: number;
  printed_price?: number;
  handwritten?: boolean;
  offered?: string;
  note?: string;
  basis?: string;
  ref_sku?: string;
  uplift_pct?: number;
  rival?: string;
  desc?: string;
  qty?: number;
  contested?: { first: number | null; second: number | null };
  unsourced?: boolean;
  scope_uplift_ref?: string;
  scope_uplift_note?: string;
}

export interface Cell {
  vendor: string;
  lineNo: number;
  status: CellStatus;
  unitInr: number | null;
  extendedInr: number | null;
  flags: string[];
  trace: NormStep[];
  needsConfirmation?: boolean;
  raw?: { price?: number; uom?: string; ccy?: string };
}

export interface RfxLine {
  no: number;
  sku: string;
  group: string;
  desc: string;
  spec: Record<string, unknown>;
  uom: string;
  pack_size: number;
  qty: number;
  hsn: string;
  baseline_inr: number;
  trap: string | null;
}

export interface UomConversion { from_uom: string; to_uom: string; factor: number; basis: string }
export interface FxRate { rate: number; source: string }
export interface PriorPo { po_number: string; po_date: string; vendor: string; rates: Record<string, number> }

export interface CalcRules {
  uomAliases: Record<string, string[]>;
  uomConversions: UomConversion[];
  fx: Record<string, FxRate>;
  priorPo: PriorPo | null;
}

export const lineByNo = (no: number, lines: RfxLine[]): RfxLine => {
  const l = lines.find((x) => x.no === no);
  if (!l) throw new Error(`No RFx line ${no}. Extraction may only map to the catalog.`);
  return l;
};

const uomKey = (u: string) =>
  u.trim().toLowerCase().replace(/^per\s+/, "").replace(/\s+/g, " ");

export function canonicalUom(
  quoted: string, asked: string, UOM_ALIASES: Record<string, string[]>,
): string {
  const q = uomKey(quoted);
  const a = uomKey(asked);
  if (q === a) return asked;
  if ((UOM_ALIASES[asked] ?? []).some((x) => uomKey(x) === q)) return asked;
  const key = Object.keys(UOM_ALIASES).find((k) => uomKey(k) === a);
  if (key && (UOM_ALIASES[key] ?? []).some((x) => uomKey(x) === q)) return asked;
  return quoted;
}

const conversionFor = (UOM_CONVERSIONS: UomConversion[], from: string, to: string) =>
  UOM_CONVERSIONS.find(
    (c) => uomKey(c.from_uom) === uomKey(from) && uomKey(c.to_uom) === uomKey(to),
  );

export function normaliseCell(
  vendor: string,
  lineNo: number,
  raw: RawQuote | undefined,
  vendorRaw: Record<string, RawQuote> | undefined,
  lines: RfxLine[],
  rules: CalcRules,
): Cell {
  const line = lineByNo(lineNo, lines);
  const PRIOR_PO = rules.priorPo;
  const flags: string[] = [];
  const trace: NormStep[] = [];

  const out = (status: CellStatus, unitInr: number | null = null, extra: Partial<Cell> = {}): Cell => ({
    vendor,
    lineNo,
    status,
    unitInr,
    extendedInr: unitInr === null ? null : unitInr * line.qty,
    flags,
    trace,
    raw: raw ? { price: raw.price, uom: raw.uom, ccy: raw.ccy } : undefined,
    ...extra,
  });

  if (!raw) {
    flags.push("Missing from the quote: no price, no decline, no mention");
    trace.push({
      rule: "Missing",
      basis: "This line is not in the supplier's quote",
      result: "Shown as missing, not as zero",
    });
    return out("omitted");
  }

  if (raw.contested) {
    const { first, second } = raw.contested;
    flags.push(
      `Two independent reads of this price disagreed: ${first ?? "unreadable"} ` +
      `against ${second ?? "unreadable"}. The document does not show which is ` +
      `correct, so it is excluded from totals`,
    );
    trace.push({
      rule: "Reads disagree",
      basis: "A second, separate read of this price gave a different figure",
      result: "Excluded from all totals. Needs review",
    });
    return out("needs_review");
  }

  if (raw.unsourced) {
    flags.push(
      "This price was submitted without the supplier's text it came from, so " +
      "it cannot be verified and is excluded from totals",
    );
    trace.push({
      rule: "No source text",
      basis: "The read gave where the price is, but not the supplier's text for it",
      result: "Excluded from all totals. Needs review",
    });
    return out("needs_review");
  }

  if (raw.status === "omitted") {
    flags.push("Missing from the quote: no price, no decline, no mention");
    trace.push({
      rule: "Missing",
      basis: "This line is not in the supplier's quote",
      result: "Shown as missing, not as zero",
    });
    return out("omitted");
  }

  if (raw.status === "not_quoted") {
    flags.push("Supplier declined to quote this line");
    trace.push({
      rule: "Declined",
      basis: raw.note ?? "Marked not quoted (NQ) by the supplier",
      result: "The supplier has answered. No follow-up needed",
    });
    return out("declined");
  }

  if (raw.status === "illegible") {
    flags.push("The document shows a price that cannot be read");
    flags.push("Open the original document to check it");
    trace.push({
      rule: "Unreadable",
      basis: raw.note ?? "The price on the document is not legible",
      result: "Not estimated. Excluded from totals",
    });
    return out("unreadable");
  }

  if (raw.status === "match_rival") {
    flags.push("Offer depends on another supplier's price");
    flags.push("Cannot be compared or awarded");
    trace.push({
      rule: "No firm price",
      basis: raw.note ?? `Supplier offered to match ${raw.rival ?? "a competitor"}`,
      result: "Excluded from all award options",
    });
    return out("non_comparable");
  }

  if (raw.status === "unmapped") {
    flags.push("Supplier's own item with no matching RFQ line");
    trace.push({
      rule: "No matching line",
      basis: raw.note ?? "No RFQ line matches this item",
      result: "Listed under unmatched items, not matched to a line",
    });
    return out("unmapped");
  }

  if (raw.status === "relative") {
    const ref = raw.ref_sku && PRIOR_PO ? PRIOR_PO.rates[raw.ref_sku] : undefined;
    if (ref === undefined) {
      flags.push("Priced by reference to an order Bidline does not have");
      trace.push({
        rule: "Reference not found",
        basis: raw.note ?? "Supplier referred to a previous order",
        result: `No previous PO rate on file for ${raw.ref_sku ?? "this item"}`,
      });
      return out("unresolvable");
    }
    let value = ref;
    trace.push({
      rule: "Previous PO rate",
      basis: `${raw.note ?? "Supplier referred to a previous order"} (${PRIOR_PO!.po_number} dated ${PRIOR_PO!.po_date})`,
      result: `Rs ${ref.toLocaleString("en-IN")} per ${line.uom}`,
    });
    if (raw.basis === "prior_po_uplift") {
      const pct = raw.uplift_pct ?? 0;
      value = Math.round(ref * (1 + pct / 100));
      trace.push({
        rule: `Uplift +${pct}%`,
        basis: "Supplier's stated increase over last year's price",
        result: `Rs ${value.toLocaleString("en-IN")} per ${line.uom}`,
      });
    }
    flags.push("Price taken from a previous PO, not quoted directly");
    flags.push("Supplier must confirm before award");
    return out("resolved_from_reference", value, { needsConfirmation: true });
  }

  if (raw.price === undefined || raw.price === null || raw.price === 0) {
    flags.push(
      `The supplier listed this line but gave no usable price. If it is included ` +
      `in another line, the supplier must confirm this before it can be compared. ` +
      `A zero price would otherwise win this line.`,
    );
    trace.push({
      rule: "No usable price",
      basis: `Reported as '${raw.status}' with no price`,
      result: "Excluded from all totals until reviewed",
    });
    return out("needs_review");
  }

  let price = raw.price;
  let unit = raw.uom ?? line.uom;
  const ccy = String(raw.ccy ?? "INR").trim().toUpperCase();

  trace.push({
    rule: "Quoted price",
    basis: "As written by the supplier. Kept unchanged",
    result: `${ccy} ${price.toLocaleString("en-IN")} ${
      /^per\b/i.test(unit) ? unit : `per ${unit}`}`,
  });

  if (raw.handwritten && raw.printed_price !== undefined) {
    flags.push("Handwritten price replaces the printed price");
    trace.push({
      rule: "Handwritten correction",
      basis: `Printed Rs ${raw.printed_price.toLocaleString("en-IN")} crossed out`,
      result: `Handwritten Rs ${price.toLocaleString("en-IN")} used`,
    });
  }

  const resolved = canonicalUom(unit, line.uom, rules.uomAliases);
  if (resolved !== unit) {
    trace.push({
      rule: "Same unit",
      basis: `'${unit}' is another name for '${line.uom}'`,
      result: "No conversion needed. Price unchanged",
    });
    unit = resolved;
  }
  if (unit !== line.uom) {
    const conv = conversionFor(rules.uomConversions, unit, line.uom);
    if (!conv) {
      flags.push(`Quoted per '${unit}', RFQ unit is '${line.uom}', and no conversion is set`);
      trace.push({
        rule: "No unit conversion",
        basis: `No conversion is set from '${unit}' to '${line.uom}'`,
        result: "Not estimated. Needs review",
      });
      return out("needs_review");
    }
    price = price * conv.factor;
    flags.push(
      `Different unit: quoted per '${unit}', converted to '${line.uom}' (x${conv.factor})`,
    );
    trace.push({
      rule: `Unit conversion x${conv.factor}`,
      basis: conv.basis,
      result: `${ccy} ${price.toLocaleString("en-IN")} per ${line.uom}`,
    });
  }

  let exWorks = false;
  if ((raw.note ?? "").toLowerCase().includes("ex-works")) {
    exWorks = true;
    flags.push(
      "Ex-works: customs duty and inbound freight are not included and are paid by " +
      "the buyer. Not directly comparable with a delivered (FOR destination) " +
      "price",
    );
  }

  if (ccy !== "INR") {
    const fx = rules.fx[ccy]?.rate;

    if (fx === undefined) {
      flags.push(
        `Quoted in ${ccy} and no exchange rate is set for it`,
        `Cannot be compared with rupee quotes until a dated exchange rate ` +
        `is added`,
      );
      trace.push({
        rule: `No exchange rate for ${ccy}`,
        basis: `Exchange rates are set for ${Object.keys(rules.fx).join(", ") || "no foreign currency"} only`,
        result: "Not converted. Needs review",
      });
      return out("needs_review");
    }

    price = Math.round(price * fx);
    flags.push(`Converted from ${ccy} at ${fx} (${rules.fx[ccy].source})`);
    trace.push({
      rule: `Exchange rate x${fx}`,
      basis: rules.fx[ccy].source,
      result: `INR ${price.toLocaleString("en-IN")}`,
    });
  }

  if (raw.scope_uplift_ref) {
    const ref = String(raw.scope_uplift_ref);
    const upliftRow = vendorRaw?.[ref];
    const what = raw.scope_uplift_note ?? "scope requested in the RFQ";
    if (upliftRow?.price === undefined || upliftRow.price === null) {
      flags.push(
        `This price excludes ${what}, which the supplier quoted separately on ` +
        `their line ${ref}. That line was not found in the quote, so this price ` +
        `cannot be compared with quotes that include it.`,
      );
      trace.push({
        rule: "Scope adjustment not possible",
        basis: `Supplier's line ${ref} has the extra cost and was not read`,
        result: "Not compared on an unequal basis. Needs review",
      });
      return out("needs_review");
    }
    let uplift = upliftRow.price;
    const upliftCcy = String(upliftRow.ccy ?? "INR").trim().toUpperCase();
    if (upliftCcy !== "INR") {
      const fx = rules.fx[upliftCcy]?.rate;
      if (fx === undefined) {
        flags.push(
          `The extra cost on line ${ref} is in ${upliftCcy} and no exchange rate ` +
          `is set for it, so the adjustment cannot be made`,
        );
        trace.push({
          rule: "Scope adjustment not possible",
          basis: `No ${upliftCcy} exchange rate set`,
          result: "Not compared on an unequal basis. Needs review",
        });
        return out("needs_review");
      }
      uplift = Math.round(uplift * fx);
      flags.push(`The extra cost on line ${ref} was quoted in ${upliftCcy}, converted at ${fx}`);
    }
    price += uplift;
    flags.push(
      `Scope: +Rs ${uplift.toLocaleString("en-IN")} for ${what} (supplier's ` +
      `line ${ref}), added so this price is comparable with quotes that include it`,
    );
    trace.push({
      rule: `Scope adjustment +Rs ${uplift.toLocaleString("en-IN")}`,
      basis: `Supplier priced ${what} separately on their line ${ref}`,
      result: `Rs ${price.toLocaleString("en-IN")} per ${line.uom}`,
    });
  }

  if (raw.qty_override !== undefined) {
    flags.push(
      `Supplier quoted ${raw.qty_override} ${line.uom} against ${line.qty} requested. ` +
      `Unit price applied to the requested quantity`,
    );
  }

  if (raw.status === "substituted" && raw.offered) {
    flags.push(`Substitute item offered: ${raw.offered}`);
  }
  if (raw.status === "downgraded" && raw.offered) {
    flags.push(`Below specification, supplier offered: ${raw.offered}`);
  }
  if (raw.note && ["downgraded", "bundled", "moq_adjusted", "quoted"].includes(raw.status)) {
    flags.push(`Supplier's note: ${raw.note}`);
  }

  trace.push({
    rule: "Landed unit price",
    basis: "Comparable with every other quote on this line",
    result: `Rs ${price.toLocaleString("en-IN")} per ${line.uom}, ex-GST`,
  });

  const status: CellStatus =
    raw.status === "substituted" || raw.status === "downgraded" || exWorks ||
    Boolean(raw.scope_uplift_ref)
      ? "comparable_with_caveat"
      : "comparable";

  return out(status, price);
}

export type Matrix = Record<string, Record<number, Cell>>;

export interface RfxContext {
  lines: RfxLine[];
  vendors: Array<{ code: string }>;
  qualification: Record<string, { qualified: boolean }>;
  statedDiscountPct?: Record<string, number | null>;
  rules: CalcRules;
}

export function buildMatrix(
  rawByVendor: Record<string, Record<string, RawQuote>>,
  ctx: RfxContext,
): Matrix {
  const m: Matrix = {};
  for (const v of ctx.vendors) {
    const rows: Record<number, Cell> = {};
    const vq = rawByVendor[v.code] ?? {};

    const unread = Object.keys(vq).length === 0;

    for (const line of ctx.lines) {
      if (unread) {
        rows[line.no] = {
          vendor: v.code, lineNo: line.no, status: "not_read",
          unitInr: null, extendedInr: null,
          flags: ["No documents from this supplier have been read yet"],
          trace: [{
            rule: "Not read",
            basis: "No quote from this supplier has been read yet",
            result: "No price recorded, and nothing assumed about what they quoted",
          }],
        };
        continue;
      }
      const raw = vq[String(line.no)] ?? vq["_default"];
      rows[line.no] = normaliseCell(v.code, line.no, raw, vq, ctx.lines, ctx.rules);
    }
    m[v.code] = rows;
  }
  return m;
}

export function cellStatusCounts(
  m: Matrix, ctx: RfxContext,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const v of Object.keys(m)) {
    for (const line of ctx.lines) {
      const s = m[v][line.no].status;
      counts[s] = (counts[s] ?? 0) + 1;
    }
  }
  return counts;
}

export function trustSummary(m: Matrix, ctx: RfxContext) {
  const counts = cellStatusCounts(m, ctx);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const n = (k: string) => counts[k] ?? 0;

  const clean = n("comparable");
  const withCaveat = n("comparable_with_caveat");
  const awardable = clean + withCaveat;

  const awaitingSupplier = n("resolved_from_reference");
  const awaitingBuyer = n("needs_review");
  const unreadable = n("unreadable");
  const noPrice = n("declined") + n("omitted") + n("non_comparable")
    + n("unresolvable") + n("unmapped");
  const notRead = n("not_read");

  return {
    total,
    usable: awardable,
    awardableWithCaveat: withCaveat,
    excluded: total - awardable,
    derivedAwaitingVendor: awaitingSupplier,
    unreadable,
    noPrice,
    notRead,
    needsHuman: awaitingBuyer + unreadable,
    counts,
  };
}

export interface Scenario {
  key: string;
  label: string;
  picks: Record<number, { vendor: string; unitInr: number; extendedInr: number }>;
  totalInr: number;
  linesAwarded: number;
  unfilledLines: number[];
}

export function cheapestPerLine(
  m: Matrix,
  vendorCodes: string[],
  opts: {
    excludeCaveats?: boolean;
    includeUnconfirmed?: boolean;
    key?: string;
    label?: string;
    ctx: RfxContext;
  },
): Scenario {
  const picks: Scenario["picks"] = {};
  const unfilled: number[] = [];
  const ctx = opts.ctx;

  for (const line of ctx.lines) {
    let best: number | null = null;
    let bestVendor: string | null = null;
    for (const vc of vendorCodes) {
      const cell = m[vc]?.[line.no];
      if (!cell || cell.unitInr === null) continue;
      if (!isAwardable(cell.status, opts.includeUnconfirmed)) continue;
      if (opts.excludeCaveats && cell.status === "comparable_with_caveat") continue;
      if (best === null || cell.unitInr < best) {
        best = cell.unitInr;
        bestVendor = vc;
      }
    }
    if (best === null || bestVendor === null) unfilled.push(line.no);
    else picks[line.no] = { vendor: bestVendor, unitInr: best, extendedInr: best * line.qty };
  }

  const totalInr = Object.values(picks).reduce((a, p) => a + p.extendedInr, 0);
  return {
    key: opts.key ?? "cheapest",
    label: opts.label ?? "Cheapest per line",
    picks,
    totalInr,
    linesAwarded: Object.keys(picks).length,
    unfilledLines: unfilled,
  };
}

export function singleVendor(
  m: Matrix, vc: string, includeUnconfirmed = false,
  ctx: RfxContext,
) {
  let total = 0;
  const missing: number[] = [];
  let priced = 0;
  for (const line of ctx.lines) {
    const cell = m[vc]?.[line.no];
    if (!cell || cell.unitInr === null || !isAwardable(cell.status, includeUnconfirmed)) {
      missing.push(line.no);
      continue;
    }
    total += cell.extendedInr as number;
    priced += 1;
  }
  const discPct = ctx.statedDiscountPct?.[vc] ?? undefined;

  const discountApplies = Boolean(discPct) && missing.length === 0;

  return {
    vendor: vc,
    totalInr: total,
    totalAfterStatedDiscountInr: discountApplies
      ? Math.round(total * (1 - (discPct as number) / 100))
      : total,
    totalLevelDiscountPct: discPct ?? null,
    totalLevelDiscountApplied: discountApplies,
    totalLevelDiscountWithheldReason: discPct && missing.length
      ? `the stated ${discPct}% discount requires the complete scope, and ` +
        `${missing.length} line(s) are unpriced, so it has not been applied`
      : null,
    linesPriced: priced,
    missingLines: missing,
    complete: missing.length === 0,
    comparableToOtherVendors: missing.length === 0,
  };
}

export function likeForLike(scenarios: Scenario[]) {
  const sets = scenarios.map((s) => new Set(Object.keys(s.picks).map(Number)));
  const common = sets.length
    ? [...sets[0]].filter((n) => sets.every((set) => set.has(n))).sort((a, b) => a - b)
    : [];
  const union = new Set(sets.flatMap((set) => [...set]));

  const restated = scenarios.map((s) => ({
    key: s.key,
    label: s.label,
    headlineTotalInr: s.totalInr,
    linesAwarded: s.linesAwarded,
    likeForLikeTotalInr: common.reduce((a, n) => a + s.picks[n].extendedInr, 0),
    couldNotFill: s.unfilledLines,
    coversUniquely: [...sets[scenarios.indexOf(s)]]
      .filter((n) => !common.includes(n)).sort((a, b) => a - b),
  }));

  const coverageDiffers = sets.length > 1
    && sets.some((set) => set.size !== sets[0].size || [...set].some((n) => !sets[0].has(n)));

  const commonShare = union.size ? common.length / union.size : 0;

  return {
    commonLines: common,
    linesInCommonBasis: common.length,
    linesInAnyScenario: union.size,
    commonBasisShare: commonShare,
    scenarios: restated,
    coverageDiffers,
    commonBasisTooThin: coverageDiffers && commonShare < 0.5,
    warning: !coverageDiffers
      ? null
      : commonShare < 0.5
        ? `These scenarios cover different lines and share only ${common.length} of ` +
          `${union.size}. Neither the headline totals nor the like-for-like totals ` +
          `answer which is better value: they are not measuring the same purchase.`
        : `These scenarios cover different lines. Their headline totals are not ` +
          `comparable. Compare the like-for-like column, restated on the ` +
          `${common.length} lines they all fill, and read the coverage difference first.`,
  };
}

export function costOfCompliance(m: Matrix, ctx: RfxContext) {
  const all = ctx.vendors.map((v) => v.code);
  const qualified = all.filter((c) => ctx.qualification[c]?.qualified);

  const naive = cheapestPerLine(m, all, {
    key: "all_vendors",
    label: "Cheapest per line, all suppliers",
    ctx,
  });
  const compliant = cheapestPerLine(m, qualified, {
    key: "qualified_only",
    label: "Cheapest per line, qualified suppliers only",
    ctx,
  });

  const deltaInr = compliant.totalInr - naive.totalInr;
  return {
    naive,
    compliant,
    qualifiedVendors: qualified,
    disqualifiedVendors: all.filter((c) => !ctx.qualification[c]?.qualified),
    deltaInr,
    deltaPct: naive.totalInr ? (deltaInr / naive.totalInr) * 100 : 0,
    likeForLike: likeForLike([naive, compliant]),
  };
}

export const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export function inrShort(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e7) return `₹${(n / 1e7).toFixed(2)} cr`;
  if (a >= 1e5) return `₹${(n / 1e5).toFixed(1)} L`;
  return inr(n);
}
