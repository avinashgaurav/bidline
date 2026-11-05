import type { Cell } from "../calc/normalise";
import { cellKey, type Comparison } from "../comparison";
import { qualityGate } from "../rfx";

/** Plain-text renderings of the comparison for Claude to read and quote from. */

export const inr = (n: number | null | undefined) =>
  n === null || n === undefined ? "n/a" : `₹${Math.round(n).toLocaleString("en-IN")}`;

const STATUS_WORDS: Record<string, string> = {
  comparable: "comparable",
  comparable_with_caveat: "off-spec or conditional",
  resolved_from_reference: "taken from a previous PO, supplier must confirm",
  needs_review: "needs review",
  unreadable: "unreadable on the document",
  declined: "supplier declined to quote",
  omitted: "missing from the quote",
  non_comparable: "no firm price (e.g. an offer to match)",
  unresolvable: "refers to data Bidline does not have",
  unmapped: "matches no line item",
  not_read: "no documents read from this supplier yet",
};

export const statusWords = (s: string) => STATUS_WORDS[s] ?? s.replace(/_/g, " ");

export function cellShort(c: Cell | undefined): string {
  if (!c) return "-";
  if (c.unitInr === null) return `(${statusWords(c.status)})`;
  return `${inr(c.unitInr)}${c.status === "comparable_with_caveat" ? "*" : ""}`;
}

export function rfxHeader(cmp: Comparison, appUrl: string): string {
  const r = cmp.rfx;
  const due = r.due_at ? new Date(r.due_at).toISOString().slice(0, 10) : "not set";
  return [
    `${r.code}: ${r.title}`,
    `Status: ${r.status}. Due: ${due}. ${cmp.lines.length} line items, ${cmp.suppliers.length} suppliers, ${cmp.documents.length} documents (${cmp.documents.filter((d) => d.status === "unread").length} unread).`,
    `Open in Bidline: ${appUrl}/rfx/${r.id}`,
  ].join("\n");
}

export function supplierTable(cmp: Comparison): string {
  const rows = cmp.suppliers.map((s) => {
    const info = cmp.supplierInfo[s.code];
    const counts = countStatuses(cmp, s.code);
    const v = info.verdict;
    const qual = cmp.questions.length === 0 ? "no questionnaire"
      : !v.assessed ? "questionnaire not read"
      : v.qualified ? "qualified" : `not qualified (failed mandatory ${v.failedMandatory.join(", ")})`;
    return `- ${s.code} ${s.name} [${s.status}]: ${counts.usable}/${cmp.lines.length} lines comparable` +
      `${counts.excluded ? `, ${counts.excluded} excluded` : ""}; total of comparable lines ${inr(info.single.totalInr)}` +
      `${info.single.totalLevelDiscountPct ? `; order discount of ${info.single.totalLevelDiscountPct}% (${info.single.totalLevelDiscountApplied ? "applied" : "not applied: scope incomplete"})` : ""}; ${qual}` +
      `${info.gaps.items.length ? `; ${info.gaps.items.length} open item${info.gaps.items.length === 1 ? "" : "s"} for follow-up` : ""}.`;
  });
  return rows.join("\n") || "No suppliers yet.";
}

function countStatuses(cmp: Comparison, code: string) {
  let usable = 0, excluded = 0;
  for (const l of cmp.lines) {
    const c = cmp.matrix[code]?.[l.no];
    if (!c) continue;
    if (c.status === "comparable" || c.status === "comparable_with_caveat") usable++;
    else if (c.status !== "not_read") excluded++;
  }
  return { usable, excluded };
}

export function overview(cmp: Comparison, appUrl: string): string {
  const t = cmp.trust;
  const c = cmp.compliance;
  const out = [
    rfxHeader(cmp, appUrl),
    "",
    "SUPPLIERS",
    supplierTable(cmp),
    "",
    `PRICES: ${t.total} supplier and line item combinations. ${t.usable} comparable (${t.awardableWithCaveat} off-spec or conditional), ${t.needsHuman} need review, ${t.derivedAwaitingVendor} taken from a previous PO, ${t.noPrice} have no price, ${t.notRead} not read yet.`,
    "",
    "AWARD OPTIONS (landed, ex-GST, INR)",
    `- Cheapest per line, all suppliers: ${inr(c.naive.totalInr)} covering ${c.naive.linesAwarded}/${cmp.lines.length} lines.`,
  ];
  const anyAssessed = cmp.suppliers.some((s) => cmp.supplierInfo[s.code].verdict.assessed);
  if (cmp.questions.length && !anyAssessed) {
    out.push("- Qualified suppliers only: no questionnaire answers have been read yet, so no supplier is qualified. Submit the answers (submit_questionnaire) before comparing on this basis.");
  } else if (cmp.questions.length) {
    out.push(`- Cheapest per line, qualified suppliers only (${c.qualifiedVendors.join(", ") || "none"}): ${inr(c.compliant.totalInr)} covering ${c.compliant.linesAwarded}/${cmp.lines.length} lines.`);
    if (c.likeForLike.warning && c.compliant.linesAwarded) out.push(`- Warning: ${c.likeForLike.warning}`);
  }
  if (cmp.baselineTotal) out.push(`- Budget for all lines: ${inr(cmp.baselineTotal)}.`);
  out.push("", "Bidline calculated every figure above. Quote them exactly as given.");
  return out.join("\n");
}

export function gridText(cmp: Comparison, opts: { lines?: number[]; suppliers?: string[] } = {}): string {
  const codes = opts.suppliers?.length ? cmp.suppliers.filter((s) => opts.suppliers!.includes(s.code)).map((s) => s.code) : cmp.suppliers.map((s) => s.code);
  const lines = opts.lines?.length ? cmp.lines.filter((l) => opts.lines!.includes(l.no)) : cmp.lines;
  const head = `Line | Item | Qty | ${codes.join(" | ")} | Lowest`;
  const rows = lines.map((l) => {
    const cells = codes.map((code) => cellShort(cmp.matrix[code]?.[l.no]));
    const best = codes
      .map((code) => ({ code, c: cmp.matrix[code]?.[l.no] }))
      .filter((x) => x.c && x.c.unitInr !== null && (x.c.status === "comparable" || x.c.status === "comparable_with_caveat"))
      .sort((a, b) => a.c!.unitInr! - b.c!.unitInr!)[0];
    return `L${l.no} | ${l.sku} ${l.desc.slice(0, 40)} | ${l.qty} ${l.uom} | ${cells.join(" | ")} | ${best ? best.code : "none"}`;
  });
  return `Landed unit price per requested unit, INR ex-GST. * = off-spec or conditional. Text in brackets = no comparable price.\n${head}\n${rows.join("\n")}`;
}

export function lineText(cmp: Comparison, no: number): string {
  const l = cmp.lines.find((x) => x.no === no);
  if (!l) return `There is no line ${no}.`;
  const out = [
    `Line ${l.no} ${l.sku}: ${l.desc}`,
    `Requested quantity: ${l.qty} x ${l.uom}${l.pack_size > 1 ? ` (pack size ${l.pack_size})` : ""}. Budget ${inr(l.baseline_inr)} per ${l.uom}.`,
    "",
  ];
  for (const s of cmp.suppliers) {
    const c = cmp.matrix[s.code]?.[no];
    const info = cmp.cellInfo[cellKey(s.code, no)];
    out.push(`${s.code} ${s.name}: ${c?.unitInr !== null && c?.unitInr !== undefined ? `${inr(c.unitInr)} per ${l.uom}, line total ${inr(c.extendedInr)}` : "no comparable price"} [${statusWords(c?.status ?? "not_read")}]`);
    if (c?.raw?.price !== undefined) out.push(`   as quoted: ${c.raw.ccy ?? "INR"} ${c.raw.price} ${c.raw.uom ?? ""}`);
    for (const f of (c?.flags ?? []).slice(0, 4)) out.push(`   - ${f}`);
    if (info?.provenance) out.push(`   source: ${info.filename ?? "document"} @ ${info.provenance.locator}: "${info.provenance.citedText.slice(0, 160)}" (confidence ${info.confidence})`);
  }
  return out.join("\n");
}

export function cellText(cmp: Comparison, code: string, no: number, history: Array<{ created_at: string; actor: string; summary: string }>): string {
  const s = cmp.suppliers.find((x) => x.code === code)!;
  const l = cmp.lines.find((x) => x.no === no);
  const c = cmp.matrix[code]?.[no];
  const info = cmp.cellInfo[cellKey(code, no)];
  if (!l || !c) return "No price found for that supplier and line.";
  const out = [
    `${s.code} ${s.name}, line ${l.no} ${l.sku} (${l.desc.slice(0, 60)})`,
    `Result: ${c.unitInr !== null ? `${inr(c.unitInr)} per ${l.uom}, ${inr(c.extendedInr)} for ${l.qty}` : "no comparable price"} [${statusWords(c.status)}]`,
  ];
  if (info?.override) {
    out.push(`Edited by ${info.override.actor === "claude" ? "Claude at the buyer's request" : "the buyer"} on ${info.override.at.slice(0, 10)}: ${info.override.reason}`);
    if (info.reading) out.push(`Original value: ${info.reading.ccy ?? "INR"} ${info.reading.price ?? "(none)"} ${info.reading.uom ?? ""} [${info.reading.status}]`);
  }
  if (info?.provenance) {
    out.push(`Source: ${info.filename ?? "document"}${info.revision && info.revision > 1 ? ` (revision ${info.revision})` : ""}, at ${info.provenance.locator}`);
    out.push(`Supplier's text: "${info.provenance.citedText}"`);
    out.push(`Read confidence: ${info.confidence}${info.carriedForward ? ". Carried forward from an earlier quote." : ""}`);
  }
  if (info?.verification) out.push(`Second check: ${info.verification.second ?? "unreadable"} by ${info.verification.by}`);
  out.push("", "How Bidline calculated this:");
  for (const st of c.trace) out.push(`- ${st.rule}: ${st.basis} -> ${st.result}`);
  if (c.flags.length) {
    out.push("", "Flags:");
    for (const f of c.flags) out.push(`- ${f}`);
  }
  if (history.length) {
    out.push("", "History:");
    for (const h of history.slice(0, 10)) out.push(`- ${h.created_at.slice(0, 16).replace("T", " ")} ${h.actor}: ${h.summary}`);
  }
  return out.join("\n");
}

export function needsAttentionText(cmp: Comparison): string {
  const out: string[] = [];
  const buckets: Record<string, string[]> = {};
  for (const s of cmp.suppliers) {
    for (const l of cmp.lines) {
      const c = cmp.matrix[s.code]?.[l.no];
      const info = cmp.cellInfo[cellKey(s.code, l.no)];
      if (!c) continue;
      const lowConf = info?.source === "read" && (info.confidence ?? 1) < 0.8 && c.unitInr !== null;
      const kind = c.status === "needs_review" ? (c.flags[0]?.startsWith("Two independent reads") ? "reads disagree" : "needs review")
        : c.status === "unreadable" ? "unreadable"
        : c.status === "resolved_from_reference" ? "from previous PO, needs supplier confirmation"
        : c.status === "unresolvable" ? "refers to data Bidline does not have"
        : lowConf ? "low read confidence, check the original document" : null;
      if (!kind) continue;
      (buckets[kind] ??= []).push(`${s.code} L${l.no}: ${c.flags[0] ?? statusWords(c.status)}`);
    }
  }
  for (const [k, items] of Object.entries(buckets)) {
    out.push(`${k.toUpperCase()} (${items.length})`);
    out.push(...items.slice(0, 25).map((i) => `- ${i}`));
    if (items.length > 25) out.push(`- ...and ${items.length - 25} more`);
    out.push("");
  }
  const open = cmp.unmapped.filter((u) => !u.resolution);
  if (open.length) {
    out.push(`UNMATCHED ITEMS, NO LINE ITEM (${open.length})`);
    for (const u of open) {
      const s = cmp.suppliers.find((x) => x.id === u.supplier_id);
      out.push(`- ${u.id} from ${s?.code ?? "?"}: "${u.description}" ${u.price ?? ""} ${u.currency ?? ""} ${u.uom ?? ""}`);
    }
    out.push("");
  }
  const gate = qualityGate(cmp.lines);
  if (gate.length) {
    out.push(`UNCLEAR LINE ITEMS (${gate.length})`);
    out.push(...gate.map((g) => `- L${g.lineNo}: ${g.issue}. Fix: ${g.fix}`));
    out.push("");
  }
  const unread = cmp.documents.filter((d) => d.status === "unread");
  if (unread.length) {
    out.push(`UNREAD DOCUMENTS (${unread.length})`);
    out.push(...unread.map((d) => `- ${d.id} ${d.filename} (${d.kind}${d.supplier_code ? `, ${d.supplier_code}` : ", supplier unknown"})`));
  }
  return out.join("\n").trim() || "Nothing needs review.";
}

export function supplierText(cmp: Comparison, code: string): string {
  const info = cmp.supplierInfo[code];
  const s = info.supplier;
  const contact = s.contact as Record<string, unknown>;
  const out = [
    `${s.code} ${s.name}${s.city ? `, ${s.city}` : ""} [${s.status}]`,
    `Contact: ${[contact.name, contact.email, contact.phone].filter(Boolean).join(", ") || "not recorded"}. Channel: ${s.channel}.`,
    `Quote: ${info.vendorRef ?? "not read yet"}${info.revision > 1 ? `, revision ${info.revision}` : ""}. Documents on file: ${info.documents}.`,
    "",
    `Total of comparable lines: ${inr(info.single.totalInr)} (${info.single.linesPriced}/${cmp.lines.length} lines).` +
      (info.single.totalLevelDiscountPct ? ` Order discount of ${info.single.totalLevelDiscountPct}%: ${info.single.totalLevelDiscountApplied ? `applied, ${inr(info.single.totalAfterStatedDiscountInr)}` : info.single.totalLevelDiscountWithheldReason}.` : ""),
  ];
  const st = info.statedTotal as { amount?: number | null; currency?: string | null };
  if (st?.amount) out.push(`Supplier's stated grand total: ${st.currency ?? "INR"} ${st.amount}.`);
  const terms = Object.entries(info.terms).filter(([, v]) => v !== null && v !== "");
  if (terms.length) out.push("", "Terms:", ...terms.map(([k, v]) => `- ${k}: ${v}`));
  if (info.conditionalDiscounts.length) out.push("", "Conditional discounts (excluded from totals):", ...info.conditionalDiscounts.map((d) => `- ${JSON.stringify(d)}`));
  if (cmp.questions.length) {
    const v = info.verdict;
    out.push("", `Questionnaire: ${!v.assessed ? "not read yet" : v.qualified ? "qualified" : `not qualified, failed ${v.failedMandatory.join(", ")}`}`);
    for (const a of v.assessments) out.push(`- ${a.questionNo} ${a.mandatory ? "(M)" : "(D)"} ${a.status.replace(/_/g, " ")}: ${a.why}`);
  }
  if (info.gaps.items.length) {
    out.push("", `Open items (${info.gaps.items.length}):`);
    for (const g of info.gaps.items) out.push(`- [${g.kind.replace(/_/g, " ")}] ${g.ask}${g.atRiskInr ? ` (about ${inr(g.atRiskInr)} at stake)` : ""}`);
  }
  if (info.lastChase) out.push("", `Last follow-up ${info.lastChase.sent_at.slice(0, 10)}, due ${info.lastChase.due_at?.slice(0, 10) ?? "n/a"}, ${info.lastChase.answered_at ? "answered" : "no reply yet"}.`);
  return out.join("\n");
}
