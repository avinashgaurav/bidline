/**
 * What each supplier still owes, computed from the same matrix the grid
 * renders, and the message that asks for exactly that and nothing else.
 */
import type { Matrix, RfxLine } from "./normalise";

export type ChaseFamily = "gap" | "dispute";

export type ChaseKind =
  | "price_missing"
  | "price_unreadable"
  | "price_not_a_price"
  | "price_derived_unconfirmed"
  | "price_carried_forward"
  | "questionnaire_unanswered"
  | "questionnaire_no_document"
  | "term_not_stated";

export const FAMILY: Record<ChaseKind, ChaseFamily> = {
  price_missing: "gap",
  questionnaire_unanswered: "gap",
  questionnaire_no_document: "gap",
  term_not_stated: "gap",
  price_unreadable: "dispute",
  price_not_a_price: "dispute",
  price_derived_unconfirmed: "dispute",
  price_carried_forward: "dispute",
};

export interface ChaseItem {
  kind: ChaseKind;
  family: ChaseFamily;
  ask: string;
  why: string;
  atRiskInr: number;
  lineNos?: number[];
  questionNo?: string;
  termKey?: string;
}

export interface SupplierGaps {
  vendorId: string;
  vendorName: string;
  items: ChaseItem[];
  gapCount: number;
  disputeCount: number;
  totalAtRiskInr: number;
  resolvedWithoutAsking: Array<{ what: string; lineNos: number[] }>;
  lastChase?: {
    sentAt: string;
    dueAt: string | null;
    itemCount: number;
    answeredAt: string | null;
    overdue: boolean;
  };
}

const TERM_LABELS: Record<string, { label: string; why: string }> = {
  gst: {
    label: "the GST rate, and whether your prices include GST",
    why: "No GST rate stated, so one has been assumed. The price may not be comparable.",
  },
  freight: {
    label: "whether your prices include freight and insurance to our warehouse",
    why: "Ex-works and delivered prices cannot be compared without this.",
  },
  payment: {
    label: "your payment terms",
    why: "Payment terms affect the cost of an order this size.",
  },
  validity: {
    label: "the validity period of your quote",
    why: "A quote that expires before approval cannot be awarded.",
  },
  delivery: {
    label: "your delivery lead time from the purchase order date",
    why: "Lead time is part of the offer. A low price with a long lead time may not be usable.",
  },
};

export const VAGUE = /^\s*$|not stated|tbd|to be (advised|confirmed)|as applicable|at actuals|n\/?a$/i;

export function gapsForSupplier(opts: {
  vendorId: string;
  vendorName: string;
  matrix: Matrix;
  lines: RfxLine[];
  questionnaire: Array<{ no: string; kind: string; q: string; doc_required: boolean }>;
  answers: Record<string, { answer: string | null; doc: string | null; ok: boolean }>;
  terms: Record<string, unknown>;
  carriedForwardLines?: number[];
  lastChase?: SupplierGaps["lastChase"];
}): SupplierGaps {
  const { vendorId, vendorName, matrix, lines, questionnaire, answers, terms } = opts;
  const rows = matrix[vendorId] ?? {};
  const items: ChaseItem[] = [];

  const lineByNo = new Map(lines.map((l) => [l.no, l]));
  const worth = (no: number) => {
    const l = lineByNo.get(no);
    if (!l) return 0;
    const others = Object.entries(matrix)
      .filter(([v]) => v !== vendorId)
      .map(([, r]) => r[no]?.unitInr)
      .filter((n): n is number => typeof n === "number");
    const unit = others.length ? Math.min(...others) : Number(l.baseline_inr ?? 0);
    return Math.round(unit * Number(l.qty ?? 0));
  };

  const group = (
    kind: ChaseKind,
    match: (status: string) => boolean,
    ask: (nos: number[]) => string,
    why: string,
  ) => {
    const nos = Object.entries(rows)
      .filter(([, c]) => match(c.status))
      .map(([n]) => Number(n))
      .sort((a, b) => a - b);
    if (!nos.length) return;
    items.push({
      kind, family: FAMILY[kind], lineNos: nos, ask: ask(nos), why,
      atRiskInr: nos.reduce((a, n) => a + worth(n), 0),
    });
  };

  group(
    "price_missing",
    (s) => s === "omitted",
    (nos) =>
      `A price for line${nos.length === 1 ? "" : "s"} ${fmt(nos)}, which ` +
      `${nos.length === 1 ? "is" : "are"} not in your quote. If you do not intend to quote, ` +
      `please let us know so we can record it.`,
    "Not quoted, so it cannot be awarded to this supplier. A missing price is not the same as a decline.",
  );

  group(
    "price_unreadable",
    (s) => s === "unreadable",
    (nos) =>
      `Confirmation of the price for line${nos.length === 1 ? "" : "s"} ${fmt(nos)}. ` +
      `The price on your document is not legible. ` +
      `Please confirm it in writing, or send a clearer copy.`,
    "The document shows a price that cannot be read. Only the supplier can confirm it.",
  );

  group(
    "price_not_a_price",
    (s) => s === "non_comparable" || s === "unresolvable",
    (nos) =>
      `A firm price for line${nos.length === 1 ? "" : "s"} ${fmt(nos)}. Your quote ` +
      `refers to another price instead of stating one, so we cannot include it in ` +
      `the comparison.`,
    "A reference to another price, or an offer to match one, is not a firm price and cannot be compared.",
  );

  group(
    "price_derived_unconfirmed",
    (s) => s === "resolved_from_reference",
    (nos) =>
      `Written confirmation of the prices for line${nos.length === 1 ? "" : "s"} ` +
      `${fmt(nos)}. You referred us to a previous order and we have used those rates ` +
      `for now, but we need your confirmation before award.`,
    "Price taken from a previous PO. Not yet confirmed by the supplier.",
  );

  if (opts.carriedForwardLines?.length) {
    const nos = [...opts.carriedForwardLines].sort((a, b) => a - b);
    items.push({
      kind: "price_carried_forward", family: "dispute", lineNos: nos,
      ask:
        `Confirmation that your prices for line${nos.length === 1 ? "" : "s"} ${fmt(nos)} ` +
        `still apply. Your revised quote does not include them, so we have used the ` +
        `prices from your earlier quote.`,
      why: "The revised quote left out these lines. The earlier price is used but not confirmed.",
      atRiskInr: nos.reduce((a, n) => a + worth(n), 0),
    });
  }

  for (const q of questionnaire) {
    const a = answers[q.no];
    const mandatory = q.kind === "M" || q.kind === "mandatory";
    if (!a || a.answer === null || String(a.answer).trim() === "") {
      items.push({
        kind: "questionnaire_unanswered", family: "gap", questionNo: q.no,
        ask: `${q.no}. ${q.q}`,
        why: mandatory
          ? "Mandatory question not answered. The supplier cannot be awarded until it is."
          : "Not answered. Not mandatory, but part of the evaluation.",
        atRiskInr: 0,
      });
    } else if (q.doc_required && !a.doc) {
      items.push({
        kind: "questionnaire_no_document", family: "gap", questionNo: q.no,
        ask:
          `The supporting document for ${q.no}. You answered "${String(a.answer).slice(0, 60)}" ` +
          `but did not attach the document the question asks for.`,
        why: mandatory
          ? "Mandatory question answered without the required document. It cannot be " +
            "verified, so it is not a pass yet."
          : "Answered, but the supporting document is missing, so the answer cannot be " +
            "verified.",
        atRiskInr: 0,
      });
    }
  }

  for (const [key, meta] of Object.entries(TERM_LABELS)) {
    const v = terms[key];
    if (v !== undefined && v !== null && !VAGUE.test(String(v))) continue;
    items.push({
      kind: "term_not_stated", family: "gap", termKey: key,
      ask: `Please state ${meta.label}.`,
      why: meta.why,
      atRiskInr: 0,
    });
  }

  items.sort((a, b) => b.atRiskInr - a.atRiskInr);

  const resolved = new Map<string, number[]>();
  for (const [no, cell] of Object.entries(rows)) {
    if (cell.unitInr === null) continue;
    for (const step of cell.trace ?? []) {
      const r = step.rule;
      const label =
        r.startsWith("Unit conversion") ? "units of measure converted using the pack size in the RFQ"
        : r.startsWith("Exchange rate ") ? "foreign currency prices converted at the recorded exchange rate"
        : r === "Same unit" ? "different names for the same unit matched"
        : r.startsWith("Scope adjustment") ? "a separately quoted item added so the line is comparable"
        : r === "Handwritten correction" ? "a handwritten correction used instead of the printed price"
        : r.startsWith("Uplift") || r === "Previous PO rate" ? "a rate taken from the previous PO the supplier referred to"
        : null;
      if (!label) continue;
      const list = resolved.get(label) ?? [];
      if (!list.includes(Number(no))) list.push(Number(no));
      resolved.set(label, list);
    }
  }

  return {
    vendorId, vendorName, items,
    resolvedWithoutAsking: [...resolved]
      .map(([what, lineNos]) => ({ what, lineNos: lineNos.sort((a, b) => a - b) }))
      .sort((a, b) => b.lineNos.length - a.lineNos.length),
    gapCount: items.filter((i) => i.family === "gap").length,
    disputeCount: items.filter((i) => i.family === "dispute").length,
    totalAtRiskInr: items.reduce((a, i) => a + i.atRiskInr, 0),
    lastChase: opts.lastChase,
  };
}

function fmt(nos: number[]): string {
  if (nos.length <= 6) {
    return nos.length === 1
      ? String(nos[0])
      : `${nos.slice(0, -1).join(", ")} and ${nos[nos.length - 1]}`;
  }
  return `${nos.slice(0, 5).join(", ")} and ${nos.length - 5} others`;
}

export function chaseMessage(opts: {
  gaps: SupplierGaps;
  rfxId: string;
  rfxTitle: string;
  buyerName: string;
  dueAt: string;
  selected?: ChaseKind[];
  onlyLines?: number[];
  onlyQuestions?: string[];
}): { subject: string; body: string; items: ChaseItem[] } {
  let items = opts.selected?.length
    ? opts.gaps.items.filter((i) => opts.selected!.includes(i.kind))
    : opts.gaps.items;

  if (opts.onlyLines?.length || opts.onlyQuestions?.length) {
    const lines = new Set(opts.onlyLines ?? []);
    const qs = new Set(opts.onlyQuestions ?? []);
    items = items.filter((i) =>
      (i.lineNos?.some((n) => lines.has(n)) ?? false) ||
      (i.questionNo ? qs.has(i.questionNo) : false),
    );
  }

  const dueText = new Date(opts.dueAt).toLocaleDateString("en-IN", {
    day: "numeric", month: "long", year: "numeric",
  });

  const gaps = items.filter((i) => i.family === "gap");
  const disputes = items.filter((i) => i.family === "dispute");

  const gapPrices = gaps.filter((i) => i.kind === "price_missing");
  const gapQuest = gaps.filter((i) => i.kind.startsWith("questionnaire_"));
  const gapTerms = gaps.filter((i) => i.kind === "term_not_stated");

  const section = (title: string, list: ChaseItem[]) =>
    list.length ? `\n${title}\n${list.map((i) => `  - ${i.ask}`).join("\n")}\n` : "";

  const opening = gaps.length && disputes.length
    ? `Thank you for your quote for ${opts.rfxId}, ${opts.rfxTitle}. To complete our ` +
      `evaluation we need the items below. Some were not included in your quote, and ` +
      `some figures need your confirmation.`
    : disputes.length
      ? `Thank you for your quote for ${opts.rfxId}, ${opts.rfxTitle}. Before we can ` +
        `evaluate it, please confirm the figures below. These are figures you have ` +
        `already sent, not new requests.`
      : `Thank you for your quote for ${opts.rfxId}, ${opts.rfxTitle}. A few items ` +
        `requested in the RFQ are missing, and we need them to complete our evaluation. ` +
        `Everything else has been received.`;

  const body =
    `${opening}\n` +
    section("MISSING PRICES", gapPrices) +
    section("QUESTIONNAIRE", gapQuest) +
    section("COMMERCIAL TERMS", gapTerms) +
    section("PLEASE CONFIRM", disputes) +
    `\nPlease send these by ${dueText}.\n\n` +
    `If we do not receive them by then, we will complete the evaluation with the ` +
    `information we already have.\n\n` +
    `Regards,\n` +
    `${opts.buyerName}`;

  const subject = disputes.length && !gaps.length
    ? `${opts.rfxId}: please confirm prices in your quote`
    : `${opts.rfxId}: information needed to complete your quote`;

  return { subject, body, items };
}
