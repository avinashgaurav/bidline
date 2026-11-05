import { loadComparison } from "./comparison";
import { findOutliers } from "./calc/outliers";
import { resolveRfx, type RfxListRow } from "./rfx";

/**
 * Ways to save, across open events, each with a rupee value, and how much of
 * what was found has already been captured in approved awards. All figures
 * come from Bidline's own comparison; nothing is estimated by a model.
 */
export interface Opportunity { rfxId: string; code: string; title: string; kind: "under_budget" | "single_quote" | "unusual" | "qualify_cost"; text: string; inr: number; action: string; href: string }

export async function savingsOpportunities(userId: string, events: RfxListRow[]) {
  const open = events.filter((e) => !e.archived_at && ["issued", "evaluating"].includes(e.status) && e.responded > 0 && e.award_status !== "approved").slice(0, 6);
  const cmps = await Promise.all(open.map(async (e) => loadComparison(await resolveRfx(userId, e.id))));
  const out: Opportunity[] = [];
  let identifiedOpen = 0;
  for (const cmp of cmps) {
    const { rfx, lines } = cmp;
    const picks = cmp.compliance.naive.picks;
    const base = { rfxId: rfx.id, code: rfx.code, title: rfx.title };
    // Lowest quotes against budget, on lines that have both.
    let under = 0;
    let underLines = 0;
    for (const l of lines) {
      const p = picks[l.no];
      if (p && l.baseline_inr > 0 && p.unitInr < l.baseline_inr) {
        under += (l.baseline_inr - p.unitInr) * l.qty;
        underLines++;
      }
    }
    if (under > 0) {
      identifiedOpen += under;
      out.push({ ...base, kind: "under_budget", inr: under, text: `Lowest quotes are under budget on ${underLines} line${underLines === 1 ? "" : "s"}`, action: "Draft the award", href: `/rfx/${rfx.id}?tab=award` });
    }
    // Lines with only one comparable price: no competition yet.
    const single = lines.filter((l) => cmp.suppliers.filter((s) => {
      const c = cmp.matrix[s.code]?.[l.no];
      return c && c.unitInr !== null && (c.status === "comparable" || c.status === "comparable_with_caveat");
    }).length === 1);
    const singleInr = single.reduce((a, l) => a + (picks[l.no]?.extendedInr ?? 0), 0);
    if (single.length && singleInr > 0) {
      out.push({ ...base, kind: "single_quote", inr: singleInr, text: `${single.length} line${single.length === 1 ? " has" : "s have"} only one usable quote`, action: "Chase the others", href: `/rfx/${rfx.id}?tab=chase` });
    }
    // Unusually high prices on the line's cheapest pick are worth a second look.
    const prices = cmp.suppliers.flatMap((s) => lines.map((l) => {
      const c = cmp.matrix[s.code]?.[l.no];
      return { lineNo: l.no, supplier: s.code, unitInr: c?.unitInr ?? null, comparable: c?.status === "comparable" || c?.status === "comparable_with_caveat" };
    }));
    const high = findOutliers(lines, prices).filter((o) => o.kind === "high" && picks[o.lineNo]?.vendor === o.supplier);
    if (high.length) {
      const inr = high.reduce((a, o) => {
        const l = lines.find((x) => x.no === o.lineNo)!;
        return a + Math.max(0, o.unitInr - (l.baseline_inr || o.unitInr)) * l.qty;
      }, 0);
      out.push({ ...base, kind: "unusual", inr, text: `${high.length} winning price${high.length === 1 ? " looks" : "s look"} unusually high`, action: "Check prices", href: `/rfx/${rfx.id}?tab=comparison` });
    }
    // What qualification costs, when it costs something.
    if (cmp.questions.length && cmp.compliance.deltaInr > 0 && cmp.compliance.compliant.linesAwarded) {
      out.push({ ...base, kind: "qualify_cost", inr: cmp.compliance.deltaInr, text: "Qualified suppliers cost more than the lowest quotes", action: "Compare options", href: `/rfx/${rfx.id}?tab=award` });
    }
  }
  const captured = events.filter((e) => e.award_status === "approved" && e.award_baseline_inr && e.award_total_inr !== null)
    .reduce((a, e) => a + Math.max(0, (e.award_baseline_inr ?? 0) - (e.award_total_inr ?? 0)), 0);
  const identified = captured + identifiedOpen;
  return {
    items: out.sort((a, b) => b.inr - a.inr).slice(0, 6),
    captured, identified,
    pct: identified > 0 ? Math.round((captured / identified) * 100) : 0,
    checked: open.length,
  };
}
