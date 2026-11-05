/**
 * Questionnaire verdicts. Claude reports what a supplier answered and what
 * their evidence says; this file decides pass, fail or not assessed, with the
 * sentence that explains each verdict. Comparing a date to today is not a
 * judgement call, so it is done here, in code.
 */
export type AnswerStatus =
  | "supported"
  | "unanswered"
  | "no_evidence"
  | "evidence_contradicts"
  | "answer_falls_short";

export interface QuestionSpec {
  no: string;
  kind: string;
  q: string;
  doc_required: boolean;
}

export interface ReadAnswer {
  questionNo: string;
  answer: string | null;
  attachedDocument: string | null;
  evidence: {
    standard: string | null;
    validUntil: string | null;
    issuedTo: string | null;
    summary: string | null;
  } | null;
  confidence: number;
}

export interface Assessment {
  questionNo: string;
  mandatory: boolean;
  status: AnswerStatus;
  why: string;
  blocksAward: boolean;
  answer: string | null;
  attachedDocument: string | null;
  confidence: number;
}

export interface Verdict {
  qualified: boolean;
  failedMandatory: string[];
  assessments: Assessment[];
  assessed: boolean;
}

const isMandatory = (kind: string) => kind === "M" || kind === "mandatory";

const STANDARD = /\b(ISO(?:\/IEC)?\s*\d{4,5})\s*:\s*(\d{4})\b/i;

function standardMismatch(question: string, evidenceStandard: string | null) {
  const asked = STANDARD.exec(question);
  const got = evidenceStandard ? STANDARD.exec(evidenceStandard) : null;
  if (!asked || !got) return null;
  const sameFamily = asked[1].replace(/\s+/g, "").toLowerCase()
    === got[1].replace(/\s+/g, "").toLowerCase();
  if (!sameFamily) {
    return `the question asks for ${asked[0]} and the document is ${got[0]}, ` +
           `which is a different standard`;
  }
  if (asked[2] !== got[2]) {
    return `the question asks for the ${asked[2]} revision and the document is ` +
           `${got[0]}. The ${got[2]} revision was superseded, so this certificate ` +
           `does not evidence the answer`;
  }
  return null;
}

const MONEY = /(?:rs\.?|inr|₹)\s*([\d,.]+)\s*(crore|cr|lakh|lac|million|mn)?/i;
const SCALE: Record<string, number> = {
  crore: 1e7, cr: 1e7, lakh: 1e5, lac: 1e5, million: 1e6, mn: 1e6,
};

function parseMoney(s: string): number | null {
  const m = MONEY.exec(s);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  return n * (m[2] ? SCALE[m[2].toLowerCase()] ?? 1 : 1);
}

function thresholdShortfall(question: string, answer: string) {
  if (!/\bat least\b|\bminimum\b|\bnot less than\b|\bor more\b/i.test(question)) return null;
  const need = parseMoney(question);
  const got = parseMoney(answer);
  if (need === null || got === null || got >= need) return null;
  const fmt = (v: number) =>
    v >= 1e7 ? `Rs ${(v / 1e7).toFixed(2)} crore` : `Rs ${v.toLocaleString("en-IN")}`;
  return `the question sets a floor of ${fmt(need)} and their own answer states ` +
         `${fmt(got)}, which is below it`;
}

const NAMED_MANDATORY =
  /([A-Z][\w'.-]*(?:\s+[A-Z][\w'.-]*)*(?:\s*,\s*[A-Z][\w'.-]*(?:\s+[A-Z][\w'.-]*)*)*\s+and\s+[A-Z][\w'.-]*(?:\s+[A-Z][\w'.-]*)*)\s+are\s+mandatory/;

function missingNamedRequirements(question: string, answer: string): string | null {
  const m = NAMED_MANDATORY.exec(question);
  if (!m) return null;
  const items = m[1]
    .split(/\s*,\s*|\s+and\s+/)
    .map((x) => x.trim())
    .filter((x) => x.length > 2);
  if (items.length < 2) return null;
  const hay = answer.toLowerCase();
  const missing = items.filter((i) => !hay.includes(i.toLowerCase()));
  if (!missing.length) return null;
  return `the question names ${items.join(", ")} as mandatory and the answer does not ` +
         `include ${missing.join(" or ")}`;
}

const AFFIRMATIVE = /^\s*(yes|y|confirmed?|we (do|are|have|confirm)|agreed?|available)\b/i;

export function assessQuestionnaire(opts: {
  questions: QuestionSpec[];
  answers: ReadAnswer[];
  supplierName?: string;
  asOf?: Date;
}): Verdict {
  const { questions, answers } = opts;
  const asOf = opts.asOf ?? new Date();
  const byNo = new Map(answers.map((a) => [a.questionNo, a]));

  if (!answers.length) {
    return {
      qualified: false, failedMandatory: [], assessments: [], assessed: false,
    };
  }

  const assessments: Assessment[] = questions.map((q) => {
    const mandatory = isMandatory(q.kind);
    const a = byNo.get(q.no);
    const base = {
      questionNo: q.no, mandatory,
      answer: a?.answer ?? null,
      attachedDocument: a?.attachedDocument ?? null,
      confidence: a?.confidence ?? 0,
    };

    if (!a || a.answer === null || !String(a.answer).trim()) {
      return {
        ...base, status: "unanswered" as AnswerStatus,
        why: mandatory
          ? "Mandatory and unanswered. They cannot be awarded until they answer it."
          : "Unanswered. Not disqualifying, but it was part of what we asked.",
        blocksAward: mandatory,
      };
    }

    const answer = String(a.answer);

    const missing = missingNamedRequirements(q.q, answer);
    if (missing) {
      return {
        ...base, status: "answer_falls_short" as AnswerStatus,
        why: `Answered "${answer.slice(0, 55)}", but ${missing}.`,
        blocksAward: mandatory,
      };
    }

    const short = thresholdShortfall(q.q, answer);
    if (short) {
      return {
        ...base, status: "answer_falls_short" as AnswerStatus,
        why: `Answered "${answer.slice(0, 60)}", but ${short}.`,
        blocksAward: mandatory,
      };
    }

    if (q.doc_required && !a.attachedDocument) {
      return {
        ...base, status: "no_evidence" as AnswerStatus,
        why: mandatory
          ? `Answered "${answer.slice(0, 40)}" with no supporting document. The ` +
            `question asks for one, so the answer cannot be checked and does not ` +
            `yet count as a pass.`
          : `Answered without the document the question asks for, so nothing here ` +
            `has been verified.`,
        blocksAward: mandatory,
      };
    }

    if (a.evidence) {
      const mismatch = standardMismatch(q.q, a.evidence.standard);
      if (mismatch) {
        return {
          ...base, status: "evidence_contradicts" as AnswerStatus,
          why: `Answered "${answer.slice(0, 30)}" and attached ` +
               `${a.attachedDocument}, but ${mismatch}.`,
          blocksAward: mandatory,
        };
      }

      if (a.evidence.validUntil) {
        const until = new Date(a.evidence.validUntil);
        if (!Number.isNaN(until.getTime()) && until < asOf) {
          return {
            ...base, status: "evidence_contradicts" as AnswerStatus,
            why: `Answered "${answer.slice(0, 30)}" and attached ` +
                 `${a.attachedDocument}, which expired on ` +
                 `${until.toISOString().slice(0, 10)}. An expired certificate does ` +
                 `not evidence a current claim.`,
            blocksAward: mandatory,
          };
        }
      }

      const issued = a.evidence.issuedTo;
      const supplier = opts.supplierName;
      if (issued && supplier) {
        const key = (s: string) =>
          s.toLowerCase().replace(/\b(pvt|private|ltd|limited|llp|inc|india)\b/g, "")
            .replace(/[^a-z0-9]/g, "");
        if (key(issued) && key(supplier) && !key(issued).includes(key(supplier).slice(0, 6))) {
          return {
            ...base, status: "evidence_contradicts" as AnswerStatus,
            why: `The attached ${a.attachedDocument} is issued to "${issued}", not to ` +
                 `${supplier}. A related company's certificate is not the bidding ` +
                 `entity's certificate.`,
            blocksAward: mandatory,
          };
        }
      }
    }

    if (mandatory && /^\s*(do|are|is|was|can|will|confirm|have)\b/i.test(q.q)
        && !AFFIRMATIVE.test(answer) && !q.doc_required) {
      return {
        ...base, status: "answer_falls_short" as AnswerStatus,
        why: `The question requires a confirmation and the answer is ` +
             `"${answer.slice(0, 60)}", which does not confirm it.`,
        blocksAward: true,
      };
    }

    const passWhy = a.attachedDocument
      ? a.evidence?.validUntil
        ? `Answered "${answer.slice(0, 40)}". ${a.attachedDocument} supports it and ` +
          `is valid to ${a.evidence.validUntil.slice(0, 10)}.`
        : `Answered "${answer.slice(0, 40)}", supported by ${a.attachedDocument}. No ` +
          `expiry date was found on it, so its currency is unverified.`
      : q.doc_required
        ? `Answered "${answer.slice(0, 40)}" and a document was attached, so nothing ` +
          `contradicts it.`
        : `Answered "${answer.slice(0, 55)}". This question asks for a statement, not ` +
          `evidence, so the answer stands as given.`;

    return {
      ...base, status: "supported" as AnswerStatus,
      why: passWhy,
      blocksAward: false,
    };
  });

  const failedMandatory = assessments.filter((a) => a.blocksAward).map((a) => a.questionNo);
  return {
    qualified: failedMandatory.length === 0,
    failedMandatory,
    assessments,
    assessed: true,
  };
}
