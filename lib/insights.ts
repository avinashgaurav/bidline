import type { Comparison } from "./comparison";
import { cellKey } from "./comparison";

/**
 * Instant answers. A question typed in the app is matched to one of these by
 * keywords, and the answer is worked out here, in code, from the same numbers
 * as the grid. Anything else goes to the buyer's own Claude. No AI inside.
 */

export interface Insight {
  title: string;
  lines: string[];
  table?: { head: string[]; rows: string[][] };
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const pct = (n: number) => `${n.toFixed(1)}%`;

export const SUGGESTIONS = [
  "Who is cheapest overall?",
  "Savings against budget",
  "Biggest price differences",
  "Totals by category",
  "Which suppliers qualify?",
  "What does each supplier still owe?",
  "What needs my review?",
];

export function answer(cmp: Comparison, question: string): Insight | null {
  const qn = question.toLowerCase();
  const lineNo = /\b(?:line|l)\s*#?\s*(\d{1,3})\b/.exec(qn)?.[1];
  if (lineNo) return lineAnswer(cmp, Number(lineNo));
  const supplier = cmp.suppliers.find((s) =>
    qn.includes(s.code.toLowerCase() + " ") || qn.endsWith(s.code.toLowerCase()) ||
    s.name.toLowerCase().split(/[^a-z0-9]+/).some((w) => w.length >= 4 && !["india", "private", "limited", "systems", "services", "solutions", "technologies", "enterprise"].includes(w) && qn.includes(w)),
  );
  if (supplier) return supplierAnswer(cmp, supplier.code);
  if (/budget|saving|baseline/.test(qn)) return budget(cmp);
  if (/spread|difference|range|variance|outlier/.test(qn)) return spread(cmp);
  if (/categor|group|section/.test(qn)) return categories(cmp);
  if (/qualif|questionnaire|complian|certif|iso/.test(qn)) return qualification(cmp);
  if (/owe|missing|follow|chase|outstanding|gap/.test(qn)) return owed(cmp);
  if (/review|attention|problem|issue|flag|excluded/.test(qn)) return attention(cmp);
  if (/cheap|lowest|best|win|award|total/.test(qn)) return cheapest(cmp);
  return null;
}

function cheapest(cmp: Comparison): Insight {
  const c = cmp.compliance;
  const by: Record<string, { lines: number; total: number }> = {};
  for (const p of Object.values(c.naive.picks)) {
    by[p.vendor] ??= { lines: 0, total: 0 };
    by[p.vendor].lines++;
    by[p.vendor].total += p.extendedInr;
  }
  const lines = [
    `Cheapest per line across all suppliers: ${inr(c.naive.totalInr)} on ${c.naive.linesAwarded} of ${cmp.lines.length} line items.`,
  ];
  if (cmp.questions.length && cmp.suppliers.some((s) => cmp.supplierInfo[s.code].verdict.assessed)) {
    lines.push(`Qualified suppliers only: ${inr(c.compliant.totalInr)} on ${c.compliant.linesAwarded} line items. Premium for qualified suppliers: ${inr(c.deltaInr)}.`);
  }
  if (c.likeForLike.warning && c.compliant.linesAwarded) lines.push(c.likeForLike.warning);
  return {
    title: "Who is cheapest",
    lines,
    table: {
      head: ["Supplier", "Lines won", "Value won", "All lines to them"],
      rows: cmp.suppliers.map((s) => {
        const single = cmp.supplierInfo[s.code].single;
        return [
          `${s.code} ${s.name}`, String(by[s.code]?.lines ?? 0), inr(by[s.code]?.total ?? 0),
          `${inr(single.totalLevelDiscountApplied ? single.totalAfterStatedDiscountInr : single.totalInr)} (${single.linesPriced}/${cmp.lines.length})`,
        ];
      }).sort((a, b) => Number(b[1]) - Number(a[1])),
    },
  };
}

function budget(cmp: Comparison): Insight {
  const rows: string[][] = [];
  for (const sc of [cmp.compliance.naive, cmp.compliance.compliant]) {
    if (!sc.linesAwarded) continue;
    const base = Object.keys(sc.picks).reduce((a, no) => {
      const l = cmp.lines.find((x) => x.no === Number(no));
      return a + (l ? (l.baseline_inr || 0) * l.qty : 0);
    }, 0);
    const d = base - sc.totalInr;
    rows.push([sc.label, inr(base), inr(sc.totalInr), `${d >= 0 ? "" : "-"}${inr(Math.abs(d))}`, base ? pct((d / base) * 100) : "n/a"]);
  }
  return {
    title: "Savings against budget",
    lines: [`Budget for all ${cmp.lines.length} line items: ${inr(cmp.baselineTotal)}. Savings are measured on the line items each option covers.`],
    table: { head: ["Option", "Budget", "Quoted", "Savings", "%"], rows },
  };
}

function spread(cmp: Comparison): Insight {
  const items = cmp.lines.map((l) => {
    const prices = cmp.suppliers
      .map((s) => ({ s, c: cmp.matrix[s.code]?.[l.no] }))
      .filter((x) => x.c?.unitInr !== null && x.c?.unitInr !== undefined && (x.c.status === "comparable" || x.c.status === "comparable_with_caveat"))
      .map((x) => ({ code: x.s.code, v: x.c!.unitInr! }));
    if (prices.length < 2) return null;
    const lo = prices.reduce((a, b) => (b.v < a.v ? b : a));
    const hi = prices.reduce((a, b) => (b.v > a.v ? b : a));
    return { l, lo, hi, gap: (hi.v - lo.v) / lo.v, value: (hi.v - lo.v) * l.qty };
  }).filter((x): x is NonNullable<typeof x> => Boolean(x)).sort((a, b) => b.value - a.value).slice(0, 6);
  return {
    title: "Biggest price differences",
    lines: ["Where suppliers differ most, by money at stake on the requested quantity. Worth checking the spec and unit before awarding."],
    table: {
      head: ["Line item", "Lowest", "Highest", "Gap", "At stake"],
      rows: items.map((x) => [`${x.l.no}. ${x.l.desc.slice(0, 40)}`, `${x.lo.code} ${inr(x.lo.v)}`, `${x.hi.code} ${inr(x.hi.v)}`, pct(x.gap * 100), inr(x.value)]),
    },
  };
}

function categories(cmp: Comparison): Insight {
  const groups = new Map<string, { lines: number; cheapest: number; budget: number; winners: Set<string> }>();
  for (const l of cmp.lines) {
    const g = groups.get(l.group || "Other") ?? { lines: 0, cheapest: 0, budget: 0, winners: new Set<string>() };
    g.lines++;
    g.budget += (l.baseline_inr || 0) * l.qty;
    const p = cmp.compliance.naive.picks[l.no];
    if (p) {
      g.cheapest += p.extendedInr;
      g.winners.add(p.vendor);
    }
    groups.set(l.group || "Other", g);
  }
  return {
    title: "Totals by category",
    lines: ["Cheapest comparable price per line item, summed by category."],
    table: {
      head: ["Category", "Line items", "Budget", "Cheapest", "Suppliers winning"],
      rows: [...groups].map(([name, g]) => [name, String(g.lines), inr(g.budget), inr(g.cheapest), [...g.winners].join(", ") || "none"]),
    },
  };
}

function qualification(cmp: Comparison): Insight {
  if (!cmp.questions.length) return { title: "Supplier qualification", lines: ["This event has no supplier questionnaire."] };
  return {
    title: "Which suppliers qualify",
    lines: ["Decided in code from what each supplier answered and what their certificates say."],
    table: {
      head: ["Supplier", "Result", "Failed questions"],
      rows: cmp.suppliers.map((s) => {
        const v = cmp.supplierInfo[s.code].verdict;
        return [`${s.code} ${s.name}`, !v.assessed ? "Not assessed yet" : v.qualified ? "Qualified" : "Not qualified", v.failedMandatory.join(", ") || "none"];
      }),
    },
  };
}

function owed(cmp: Comparison): Insight {
  return {
    title: "What each supplier still owes",
    lines: ["Open items per supplier, with the value of the line items affected. Draft and send follow-ups on the Follow-ups tab."],
    table: {
      head: ["Supplier", "Missing", "Disputed", "Value affected", "Last follow-up"],
      rows: cmp.suppliers.map((s) => {
        const g = cmp.supplierInfo[s.code].gaps;
        return [`${s.code} ${s.name}`, String(g.gapCount), String(g.disputeCount), inr(g.totalAtRiskInr), g.lastChase ? `${g.lastChase.sentAt.slice(0, 10)}${g.lastChase.answeredAt ? ", answered" : g.lastChase.overdue ? ", overdue" : ""}` : "none"];
      }),
    },
  };
}

function attention(cmp: Comparison): Insight {
  const t = cmp.trust;
  const lowConf = Object.entries(cmp.cellInfo).filter(([k, i]) => {
    const [code, no] = k.split(":");
    const c = cmp.matrix[code]?.[Number(no)];
    return i.source === "read" && (i.confidence ?? 1) < 0.8 && c?.unitInr !== null;
  }).length;
  return {
    title: "What needs your review",
    lines: [
      `${t.needsHuman} price${t.needsHuman === 1 ? "" : "s"} need review and are excluded from every total.`,
      `${t.derivedAwaitingVendor} price${t.derivedAwaitingVendor === 1 ? " is" : "s are"} taken from a previous PO and need the supplier to confirm.`,
      `${lowConf} price${lowConf === 1 ? " was" : "s were"} read with low confidence: check them against the original.`,
      `${cmp.unmapped.filter((u) => !u.resolution).length} supplier item${cmp.unmapped.length === 1 ? "" : "s"} match no line item.`,
      `${cmp.documents.filter((d) => d.status === "unread").length} document${cmp.documents.length === 1 ? " is" : "s are"} still unread.`,
    ],
  };
}

function supplierAnswer(cmp: Comparison, code: string): Insight {
  const info = cmp.supplierInfo[code];
  const s = info.supplier;
  const won = Object.values(cmp.compliance.naive.picks).filter((p) => p.vendor === code);
  const v = info.verdict;
  return {
    title: `${s.code} ${s.name}`,
    lines: [
      `Comparable prices on ${info.single.linesPriced} of ${cmp.lines.length} line items, totalling ${inr(info.single.totalInr)}.`,
      info.single.totalLevelDiscountPct ? `States a ${info.single.totalLevelDiscountPct}% order discount: ${info.single.totalLevelDiscountApplied ? `applies, ${inr(info.single.totalAfterStatedDiscountInr)}` : "not applied, the quote is incomplete"}.` : "No order discount stated.",
      `Cheapest on ${won.length} line item${won.length === 1 ? "" : "s"}, worth ${inr(won.reduce((a, p) => a + p.extendedInr, 0))}.`,
      cmp.questions.length ? `Questionnaire: ${!v.assessed ? "not assessed yet" : v.qualified ? "qualified" : `not qualified (failed ${v.failedMandatory.join(", ")})`}.` : "No questionnaire on this event.",
      `Still owes ${info.gaps.items.length} item${info.gaps.items.length === 1 ? "" : "s"}.`,
    ],
  };
}

function lineAnswer(cmp: Comparison, no: number): Insight | null {
  const l = cmp.lines.find((x) => x.no === no);
  if (!l) return { title: `Line ${no}`, lines: [`There is no line item ${no} on this event.`] };
  return {
    title: `Line ${l.no}: ${l.desc.slice(0, 60)}`,
    lines: [`Requested: ${l.qty} × ${l.uom}. Budget ${inr(l.baseline_inr)} per ${l.uom}.`],
    table: {
      head: ["Supplier", "Landed unit price", "Line total", "Status"],
      rows: cmp.suppliers.map((s) => {
        const c = cmp.matrix[s.code]?.[l.no];
        const corrected = cmp.cellInfo[cellKey(s.code, l.no)]?.source === "override";
        return [`${s.code} ${s.name}`, c?.unitInr !== null && c?.unitInr !== undefined ? inr(c.unitInr) : "none", c?.extendedInr ? inr(c.extendedInr) : "", `${(c?.status ?? "not_read").replace(/_/g, " ")}${corrected ? ", edited" : ""}`];
      }),
    },
  };
}
