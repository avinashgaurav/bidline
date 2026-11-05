import type { GateIssue } from "./rfx";

/**
 * What must be true before an event goes to suppliers, in plain words. The
 * required checks block issuing; the others are advice. Unclear line items can
 * be overridden with a reason, as before.
 */
export interface ReadyCheck { key: string; label: string; ok: boolean; required: boolean; fix: string; tab: string }

export function readiness(input: {
  rfx: { due_at: string | null; approver: Record<string, unknown> };
  lines: Array<{ no: number; baseline_inr: number }>;
  suppliers: Array<{ code: string; name: string; status: string; contact: Record<string, unknown> }>;
  questions: unknown[];
  gate: GateIssue[];
}): ReadyCheck[] {
  const sup = input.suppliers.filter((s) => s.status !== "removed");
  const noEmail = sup.filter((s) => !String((s.contact as { email?: string }).email ?? "").includes("@"));
  const approver = input.rfx.approver as { name?: string; email?: string };
  const noBudget = input.lines.filter((l) => !(l.baseline_inr > 0)).length;
  return [
    { key: "lines", label: input.lines.length ? `${input.lines.length} line item${input.lines.length === 1 ? "" : "s"}` : "Add what you are buying", ok: input.lines.length > 0, required: true, fix: "Add line items.", tab: "lines" },
    { key: "clear", label: input.gate.length ? `${input.gate.length} line item${input.gate.length === 1 ? " is" : "s are"} unclear` : "Every line item is clear", ok: input.gate.length === 0, required: true, fix: "Fix the flagged lines, or give a reason to send anyway.", tab: "lines" },
    { key: "suppliers", label: sup.length ? `${sup.length} supplier${sup.length === 1 ? "" : "s"} invited` : "Add at least one supplier", ok: sup.length > 0, required: true, fix: "Add suppliers.", tab: "suppliers" },
    { key: "emails", label: noEmail.length ? `${noEmail.length} supplier${noEmail.length === 1 ? " has" : "s have"} no email: ${noEmail.map((s) => s.code).join(", ")}` : "Every supplier has an email address", ok: sup.length > 0 && noEmail.length === 0, required: true, fix: "Add an email for each supplier, so follow-ups can reach them.", tab: "suppliers" },
    { key: "due", label: input.rfx.due_at ? `Quotes due ${new Date(input.rfx.due_at).toLocaleDateString("en-IN", { dateStyle: "medium" })}` : "Set the date quotes are due", ok: Boolean(input.rfx.due_at), required: true, fix: "Set a due date.", tab: "lines" },
    { key: "approver", label: approver.name ? `Approver: ${approver.name}` : "Name the approver", ok: Boolean(approver.name), required: true, fix: "Name who approves the award.", tab: "lines" },
    { key: "questions", label: input.questions.length ? `${input.questions.length} qualification question${input.questions.length === 1 ? "" : "s"}` : "No qualification questions (optional)", ok: input.questions.length > 0, required: false, fix: "Add questions to qualify suppliers, such as warranty or certificates.", tab: "questionnaire" },
    { key: "budget", label: noBudget ? `${noBudget} line${noBudget === 1 ? " has" : "s have"} no budget (optional)` : "Every line has a budget", ok: noBudget === 0, required: false, fix: "Budgets show savings and flag unusual prices.", tab: "lines" },
  ];
}

export const blocking = (checks: ReadyCheck[]) => checks.filter((c) => c.required && !c.ok && c.key !== "clear");
