import { q, type Row } from "./db";
import {
  buildMatrix, costOfCompliance, singleVendor, trustSummary,
  type CalcRules, type Cell, type Matrix, type RawQuote, type RfxContext, type RfxLine,
} from "./calc/normalise";
import { assessQuestionnaire, type QuestionSpec, type ReadAnswer, type Verdict } from "./calc/questionnaire";
import { gapsForSupplier, type SupplierGaps } from "./calc/chase";
import {
  getAssumptions, getLines, getQuestions, getSuppliers, rulesFrom,
  type AssumptionRow, type RfxRow, type SupplierRow,
} from "./rfx";
import { listDocuments, type DocumentRow } from "./files";

export interface Provenance {
  locator: string;
  citedText: string;
  method: string;
  page?: number | null;
}

export interface CellInfo {
  source: "read" | "override" | "none";
  provenance?: Provenance;
  confidence?: number;
  documentId?: string | null;
  filename?: string | null;
  submissionId?: string;
  revision?: number;
  carriedForward?: boolean;
  vendorDesc?: string | null;
  verification?: { second: number | null; by: string; at: string } | null;
  /** The reading as it came off the document, kept when a person corrected it. */
  reading?: RawQuote | null;
  override?: { id: string; reason: string; actor: string; at: string; raw: RawQuote } | null;
}

export interface SubmissionRow {
  id: string;
  supplier_id: string;
  document_id: string | null;
  source: string;
  vendor_ref: string | null;
  supersedes_ref: string | null;
  revision: number;
  revision_note: string | null;
  terms: Record<string, unknown>;
  conditional_discounts: unknown[];
  stated_total: Record<string, unknown>;
  unreadable_regions: string[];
  blanket_fallback: { status?: string; note?: string; rival?: string | null } | null;
  issues: Array<{ severity: string; rowIndex: number; reason: string }>;
  created_at: string;
}

export interface UnmappedRow {
  id: string;
  supplier_id: string;
  submission_id: string;
  vendor_ref: string | null;
  description: string;
  price: string | null;
  uom: string | null;
  currency: string | null;
  qty: number | null;
  note: string | null;
  provenance: Provenance;
  resolution: string | null;
  resolved_to_line_no: number | null;
}

export interface ChaseRow {
  id: string;
  supplier_id: string;
  items: unknown[];
  message: string;
  channel: string;
  due_at: string | null;
  sent_at: string;
  answered_at: string | null;
  closed_reason: string | null;
  created_by: string;
}

export interface AwardRow {
  id: string;
  scenario_key: string;
  snapshot: Record<string, unknown>;
  note_md: string;
  commentary: string | null;
  share_token: string;
  status: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  created_by: string;
  created_at: string;
}

export interface SupplierInfo {
  supplier: SupplierRow;
  submissions: SubmissionRow[];
  terms: Record<string, unknown>;
  conditionalDiscounts: unknown[];
  statedTotal: Record<string, unknown>;
  unreadableRegions: string[];
  vendorRef: string | null;
  revision: number;
  verdict: Verdict;
  gaps: SupplierGaps;
  single: ReturnType<typeof singleVendor>;
  lastChase: ChaseRow | null;
  documents: number;
}

export type Comparison = Awaited<ReturnType<typeof loadComparison>>;

const num = (v: unknown) => (v === null || v === undefined ? undefined : Number(v));
export const cellKey = (code: string, lineNo: number) => `${code}:${lineNo}`;

function rawFromCell(row: Row): RawQuote {
  const ref = (row.reference ?? null) as {
    basis?: string; refSku?: string | null; upliftPct?: number | null;
    rival?: string | null; scopeUpliftRef?: string | null; scopeUpliftNote?: string | null;
  } | null;
  const prov = row.provenance as { citedText?: unknown } | null;
  return {
    status: String(row.raw_status),
    price: num(row.raw_price),
    uom: row.raw_uom ? String(row.raw_uom) : undefined,
    ccy: row.raw_currency ? String(row.raw_currency) : undefined,
    qty_override: num(row.raw_qty),
    printed_price: num(row.printed_price),
    handwritten: Boolean(row.handwritten),
    offered: row.offered ? String(row.offered) : undefined,
    note: row.note ? String(row.note) : undefined,
    scope_uplift_ref: ref?.scopeUpliftRef ?? undefined,
    scope_uplift_note: ref?.scopeUpliftNote ?? undefined,
    basis: ref?.basis ?? undefined,
    ref_sku: ref?.refSku ?? undefined,
    uplift_pct: ref?.upliftPct ?? undefined,
    rival: ref?.rival ?? undefined,
    unsourced: prov && !String(prov.citedText ?? "").trim() ? true : undefined,
  };
}

/**
 * Rebuild the whole comparison from what is stored.
 *
 * Nothing derived is saved: every landed price, total and verdict on every
 * screen and in every tool answer is recomputed from the raw readings, the
 * buyer's corrections and the assumption ledger, by the same calculator. So
 * the grid, the award and Claude's answers cannot disagree with each other.
 */
export async function loadComparison(rfx: RfxRow, opts: { rules?: CalcRules } = {}) {
  const rfxId = rfx.id;
  const [lines, suppliers, questions, assumptions] = await Promise.all([
    getLines(rfxId), getSuppliers(rfxId), getQuestions(rfxId), getAssumptions(rfxId),
  ]);
  const [submissions, cellRows, unmapped, overrides, qreads, chases, documents, awards] = await Promise.all([
    q<SubmissionRow>(`select * from submissions where rfx_id = $1 order by revision, created_at`, [rfxId]),
    q<Row>(
      `select c.*, s.revision, s.document_id, s.created_at as sub_created, d.filename
         from quote_cells c
         join submissions s on s.id = c.submission_id
         left join documents d on d.id = s.document_id
        where c.rfx_id = $1
        order by c.supplier_id, c.line_no, s.revision, s.created_at`,
      [rfxId],
    ),
    q<UnmappedRow>(`select * from unmapped_items where rfx_id = $1 order by created_at`, [rfxId]),
    q<Row>(`select * from cell_overrides where rfx_id = $1 and active order by created_at`, [rfxId]),
    q<Row>(`select * from questionnaire_reads where rfx_id = $1 order by created_at`, [rfxId]),
    q<ChaseRow>(`select * from chases where rfx_id = $1 order by sent_at desc`, [rfxId]),
    listDocuments(rfxId),
    q<AwardRow>(`select * from awards where rfx_id = $1 order by created_at desc`, [rfxId]),
  ]);

  // A what-if passes its own rules; nothing about them is saved.
  const rules: CalcRules = opts.rules ?? rulesFrom(assumptions);
  const byId = new Map(suppliers.map((s) => [s.id, s]));
  const codeOf = (supplierId: string) => byId.get(supplierId)?.code;

  // --- Revisions: the newest revision wins; lines it skipped carry forward. ---
  const maxRevision: Record<string, number> = {};
  for (const row of cellRows) {
    const v = String(row.supplier_id);
    maxRevision[v] = Math.max(maxRevision[v] ?? 1, Number(row.revision ?? 1));
  }
  const winning = new Map<string, Row>();
  const superseded = new Map<string, Row>();
  for (const row of cellRows) {
    const code = codeOf(String(row.supplier_id));
    if (!code) continue;
    const key = cellKey(code, Number(row.line_no));
    if (Number(row.revision ?? 1) >= (maxRevision[String(row.supplier_id)] ?? 1)) winning.set(key, row);
    else superseded.set(key, row);
  }
  const carriedForward: string[] = [];
  const resolved = new Map<string, Row>(winning);
  for (const [key, row] of superseded) {
    if (!winning.has(key)) {
      carriedForward.push(key);
      resolved.set(key, row);
    }
  }

  const rawByVendor: Record<string, Record<string, RawQuote>> = {};
  const cellInfo: Record<string, CellInfo> = {};
  for (const [key, row] of resolved) {
    const code = key.split(":")[0];
    const lineNo = Number(row.line_no);
    const raw = rawFromCell(row);
    const verification = (row.verification ?? null) as CellInfo["verification"];
    if (verification && raw.price !== undefined && raw.status !== "illegible") {
      const second = verification.second;
      if (second === null || Number(second) !== Number(raw.price)) {
        raw.contested = { first: raw.price ?? null, second: second === null ? null : Number(second) };
      }
    }
    rawByVendor[code] ??= {};
    rawByVendor[code][String(lineNo)] = raw;
    cellInfo[key] = {
      source: "read",
      provenance: row.provenance as Provenance,
      confidence: Number(row.confidence ?? 0),
      documentId: (row.document_id as string) ?? null,
      filename: (row.filename as string) ?? null,
      submissionId: String(row.submission_id),
      revision: Number(row.revision ?? 1),
      carriedForward: carriedForward.includes(key),
      vendorDesc: (row.vendor_desc as string) ?? null,
      verification,
      reading: { ...raw, contested: undefined },
    };
  }

  // Lines a supplier invented, keyed by their own label, so a scope uplift
  // ("3-year cover at our line 30A") can find its price.
  for (const u of unmapped) {
    const code = codeOf(u.supplier_id);
    if (!code || u.price === null) continue;
    const label = (String(u.vendor_ref ?? "").match(/\b(\d+[A-Z])\b/) ?? u.description.match(/\b(\d+[A-Z])\b/))?.[1];
    if (!label) continue;
    rawByVendor[code] ??= {};
    rawByVendor[code][label] = {
      status: "unmapped",
      price: Number(u.price),
      uom: u.uom ?? undefined,
      ccy: u.currency ?? undefined,
    };
  }

  for (const s of submissions) {
    const code = codeOf(s.supplier_id);
    if (!code || !s.blanket_fallback?.status) continue;
    rawByVendor[code] ??= {};
    rawByVendor[code]["_default"] = {
      status: s.blanket_fallback.status,
      note: s.blanket_fallback.note,
      rival: s.blanket_fallback.rival ?? undefined,
    };
  }

  // --- A person's corrections sit on top of the reading. ---
  for (const o of overrides) {
    const code = codeOf(String(o.supplier_id));
    if (!code) continue;
    const key = cellKey(code, Number(o.line_no));
    rawByVendor[code] ??= {};
    const reading = rawByVendor[code][String(o.line_no)] ?? null;
    const raw = o.raw as RawQuote;
    rawByVendor[code][String(o.line_no)] = raw;
    cellInfo[key] = {
      ...(cellInfo[key] ?? { source: "none" }),
      source: "override",
      reading,
      override: { id: String(o.id), reason: String(o.reason), actor: String(o.actor), at: String(o.created_at), raw },
    };
  }

  // --- Questionnaires: facts read by Claude, verdicts decided here. ---
  const latestAnswers = new Map<string, ReadAnswer[]>();
  const bySupplierQ = new Map<string, Map<string, ReadAnswer>>();
  for (const r of qreads) {
    const merged = bySupplierQ.get(String(r.supplier_id)) ?? new Map<string, ReadAnswer>();
    for (const a of (r.answers ?? []) as ReadAnswer[]) merged.set(a.questionNo, mergeAnswer(merged.get(a.questionNo), a));
    bySupplierQ.set(String(r.supplier_id), merged);
  }
  for (const [sid, m] of bySupplierQ) latestAnswers.set(sid, [...m.values()]);
  const verdicts: Record<string, Verdict> = {};
  for (const s of suppliers) {
    verdicts[s.code] = assessQuestionnaire({
      questions, answers: latestAnswers.get(s.id) ?? [], supplierName: s.name,
    });
  }

  // --- Terms: the latest reading of each supplier's commercial terms. ---
  const termsBy: Record<string, SubmissionRow | undefined> = {};
  const subsBy: Record<string, SubmissionRow[]> = {};
  for (const s of submissions) {
    const code = codeOf(s.supplier_id);
    if (!code) continue;
    (subsBy[code] ??= []).push(s);
    const t = termsBy[code];
    if (!t || s.revision > t.revision || (s.revision === t.revision && s.created_at >= t.created_at)) termsBy[code] = s;
  }
  const mergedTerms = (code: string) => {
    const out: Record<string, unknown> = {};
    for (const s of subsBy[code] ?? []) {
      for (const [k, v] of Object.entries(s.terms ?? {})) if (v !== null && v !== undefined && v !== "") out[k] = v;
    }
    return out;
  };

  const ctx: RfxContext = {
    lines,
    vendors: suppliers.map((s) => ({ code: s.code })),
    qualification: Object.fromEntries(
      suppliers.map((s) => [s.code, { qualified: questions.length === 0 ? true : verdicts[s.code].qualified }]),
    ),
    statedDiscountPct: Object.fromEntries(
      suppliers.map((s) => {
        const p = mergedTerms(s.code).totalLevelDiscountPercent;
        return [s.code, p === undefined || p === null ? null : Number(p)];
      }),
    ),
    rules,
  };

  const matrix: Matrix = buildMatrix(rawByVendor, ctx);

  // Say on the cell itself that a person changed it, and keep the reading in view.
  for (const [key, info] of Object.entries(cellInfo)) {
    if (info.source !== "override" || !info.override) continue;
    const [code, no] = key.split(":");
    const cell: Cell | undefined = matrix[code]?.[Number(no)];
    if (!cell) continue;
    cell.flags.unshift(`corrected by ${info.override.actor === "claude" ? "Claude, at the buyer's request" : "the buyer"}: ${info.override.reason}`);
    cell.trace.unshift({
      rule: "buyer correction",
      basis: info.override.reason,
      result: info.reading?.price !== undefined
        ? `replaces the reading of ${info.reading.ccy ?? "INR"} ${info.reading.price} ${info.reading.uom ?? ""}; the original is kept`
        : "replaces the reading; the original is kept",
    });
  }
  for (const key of carriedForward) {
    const [code, no] = key.split(":");
    matrix[code]?.[Number(no)]?.flags.push("carried forward from an earlier quotation: their revision did not mention this line");
  }

  const latestChase = new Map<string, ChaseRow>();
  for (const c of chases) if (!latestChase.has(c.supplier_id)) latestChase.set(c.supplier_id, c);

  const supplierInfo: Record<string, SupplierInfo> = {};
  for (const s of suppliers) {
    const verdict = verdicts[s.code];
    const answersMap: Record<string, { answer: string | null; doc: string | null; ok: boolean }> = {};
    for (const a of verdict.assessments) {
      answersMap[a.questionNo] = { answer: a.answer, doc: a.attachedDocument, ok: a.status === "supported" };
    }
    const terms = mergedTerms(s.code);
    const last = latestChase.get(s.id) ?? null;
    const latest = termsBy[s.code];
    supplierInfo[s.code] = {
      supplier: s,
      submissions: subsBy[s.code] ?? [],
      terms,
      conditionalDiscounts: (subsBy[s.code] ?? []).flatMap((x) => x.conditional_discounts ?? []),
      statedTotal: latest?.stated_total ?? {},
      unreadableRegions: (subsBy[s.code] ?? []).flatMap((x) => x.unreadable_regions ?? []),
      vendorRef: latest?.vendor_ref ?? null,
      revision: maxRevision[s.id] ?? (latest ? latest.revision : 0),
      verdict,
      gaps: gapsForSupplier({
        vendorId: s.code,
        vendorName: s.name,
        matrix,
        lines,
        questionnaire: questions,
        answers: answersMap,
        terms,
        carriedForwardLines: carriedForward.filter((k) => k.startsWith(`${s.code}:`)).map((k) => Number(k.split(":")[1])),
        lastChase: last
          ? {
              sentAt: last.sent_at, dueAt: last.due_at,
              itemCount: Array.isArray(last.items) ? last.items.length : 0,
              answeredAt: last.answered_at,
              overdue: Boolean(last.due_at && !last.answered_at && new Date(last.due_at).getTime() < Date.now()),
            }
          : undefined,
      }),
      single: singleVendor(matrix, s.code, false, ctx),
      lastChase: last,
      documents: documents.filter((d) => d.supplier_id === s.id).length,
    };
  }

  const baselineTotal = lines.reduce((a, l) => a + (l.baseline_inr || 0) * l.qty, 0);
  const compliance = costOfCompliance(matrix, ctx);

  return {
    rfx,
    lines,
    suppliers,
    questions,
    assumptions,
    rules,
    ctx,
    matrix,
    cellInfo,
    supplierInfo,
    unmapped,
    documents: documents as Array<DocumentRow & { supplier_code: string | null; supplier_name: string | null }>,
    chases,
    awards,
    carriedForward,
    trust: trustSummary(matrix, ctx),
    compliance,
    baselineTotal,
    hasAnyReading: cellRows.length > 0,
  };
}

/**
 * Later readings fill in or replace earlier ones question by question. A
 * certificate read on its own adds evidence without erasing the answer that
 * came from the questionnaire itself.
 */
function mergeAnswer(old: ReadAnswer | undefined, a: ReadAnswer): ReadAnswer {
  const clean = (e: ReadAnswer["evidence"]) =>
    Object.fromEntries(Object.entries(e ?? {}).filter(([, v]) => v !== null && v !== undefined && v !== ""));
  return {
    questionNo: a.questionNo,
    answer: a.answer ?? old?.answer ?? null,
    attachedDocument: a.attachedDocument ?? old?.attachedDocument ?? null,
    evidence: a.evidence
      ? ({ standard: null, validUntil: null, issuedTo: null, summary: null, ...(old?.evidence ?? {}), ...clean(a.evidence) } as ReadAnswer["evidence"])
      : old?.evidence ?? null,
    confidence: a.confidence ?? old?.confidence ?? 0.5,
  };
}

export function lineOf(c: Comparison, no: number): RfxLine | undefined {
  return c.lines.find((l) => l.no === no);
}

export type { QuestionSpec, AssumptionRow };
