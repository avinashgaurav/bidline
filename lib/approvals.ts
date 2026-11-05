import { randomBytes } from "node:crypto";
import { newId, one, q, type Row } from "./db";
import { logEvent } from "./events";
import { BadInput, NotFound } from "./rfx";
import { getSettings, stepsFor } from "./workspace";
import { notify } from "./notify";
import { announce } from "./channels";

/**
 * Approval in steps. Every award has the event's own approver (on the award's
 * share link). When the workspace sets thresholds, awards above them also need
 * later approvers, one after another, each on their own link. A single
 * rejection or request for changes ends the round; the buyer drafts again.
 */

export interface AwardStep {
  id: string; award_id: string; step: number; name: string; email: string | null; above_inr: number | null;
  token: string; status: string; decided_by: string | null; decided_at: string | null; note: string | null;
}

type Decision = "approved" | "rejected" | "changes_requested";

/** Called once when an award is drafted. Adds nothing when no threshold applies. */
export async function createSteps(award: { id: string; token: string; totalInr: number }, rfx: { workspace_id: string; approver: Record<string, unknown> }) {
  const extra = stepsFor(await getSettings(rfx.workspace_id), award.totalInr);
  if (!extra.length) return [];
  const first = rfx.approver as { name?: string; email?: string };
  await q("insert into award_steps (id, award_id, step, name, email, token, status) values ($1,$2,0,$3,$4,$5,'sent')",
    [newId("stp"), award.id, first.name || "Event approver", first.email || null, award.token]);
  for (const [i, s] of extra.entries()) {
    await q("insert into award_steps (id, award_id, step, name, email, above_inr, token, status) values ($1,$2,$3,$4,$5,$6,$7,'waiting')",
      [newId("stp"), award.id, i + 1, s.name, s.email || null, s.aboveInr, randomBytes(18).toString("base64url")]);
  }
  return extra;
}

export async function stepsOf(awardId: string): Promise<AwardStep[]> {
  return q<AwardStep>("select * from award_steps where award_id = $1 order by step", [awardId]);
}

/** The award a link belongs to, whether it is the first approver's link or a later step's. */
export async function awardForToken(token: string) {
  return one<Row>(
    `select a.*, r.user_id, r.code, r.title from awards a join rfx r on r.id = a.rfx_id
      where a.share_token = $1 or a.id = (select award_id from award_steps where token = $1)`,
    [token]);
}

/**
 * Record one decision. `token` picks the step (null = whichever step is waiting,
 * for an approver deciding signed in to the app). Returns false when the award
 * has no steps, so the caller uses the single-approver path.
 */
export async function decideStep(opts: {
  awardId: string; token: string | null; decision: Decision; name: string; note: string | null;
  /** Set for a decision made signed in to the app. */
  decider?: { userId: string; email: string | null };
  log: { userId: string; actor: "approver" | "user" | "claude"; rfxId: string; code: string; tool?: string | null; userRequest?: string | null };
}): Promise<boolean> {
  const steps = await stepsOf(opts.awardId);
  if (!steps.length) return false;
  const live = await one<{ status: string }>("select status from awards where id = $1", [opts.awardId]);
  if (live?.status !== "sent") throw new BadInput(`This award is ${String(live?.status ?? "gone").replace(/_/g, " ")}, so it no longer takes a decision.`);
  const step = opts.token ? steps.find((s) => s.token === opts.token) : steps.find((s) => s.status === "sent");
  if (!step) throw new NotFound("This approval link is not valid.");
  if (step.status === "waiting") throw new BadInput(`This award is still with ${steps.find((s) => s.status === "sent")?.name ?? "an earlier approver"}. Your link opens for a decision once they approve.`);
  if (step.status !== "sent") throw new BadInput(`This step was already ${step.status.replace(/_/g, " ")}${step.decided_by ? ` by ${step.decided_by}` : ""}.`);
  // Later steps are decided signed in to Bidline, so the person is known, not typed.
  if (step.step > 0 && !opts.decider) throw new BadInput(`Step ${step.step + 1} is decided signed in to Bidline. Sign in and open the event's Award step.`);
  if (opts.decider) {
    // Each step needs a different person. The extra steps an admin set up, when they name an
    // email, are that person's to decide; the first step is open to any approver in the app.
    if (step.step > 0 && step.email && opts.decider.email && step.email.toLowerCase() !== opts.decider.email.toLowerCase()) {
      throw new BadInput(`This step is for ${step.name} (${step.email}). They decide it, signed in or on their link.`);
    }
    // The same account cannot decide two steps: checked against the audit trail, by account, not by name.
    const earlier = await one(
      `select 1 from events where kind in ('award_step_decided', 'award_decided') and actor in ('user', 'claude') and user_id = $1 and detail->>'awardId' = $2 limit 1`,
      [opts.decider.userId, opts.awardId]);
    if (earlier) throw new BadInput("You already decided an earlier step of this award. A different person must decide this one.");
  }
  const done = await q("update award_steps set status = $2, decided_by = $3, decided_at = now(), note = $4 where id = $1 and status = 'sent' returning id",
    [step.id, opts.decision, opts.name.slice(0, 120), opts.note?.slice(0, 2000) ?? null]);
  if (!done.length) throw new BadInput("This step was decided a moment ago.");
  const next = steps.find((s) => s.step === step.step + 1);
  const verb = opts.decision === "approved" ? "approved" : opts.decision === "rejected" ? "rejected" : "asked for changes to";
  if (opts.decision === "approved" && next) {
    await q("update award_steps set status = 'sent' where id = $1", [next.id]);
    await logEvent({
      userId: opts.log.userId, rfxId: opts.log.rfxId, actor: opts.log.actor, tool: opts.log.tool ?? null, userRequest: opts.log.userRequest ?? null, kind: "award_step_decided",
      summary: `${opts.name} approved step ${step.step + 1} of ${steps.length} on ${opts.log.code}. Now with ${next.name}.`,
      detail: { awardId: opts.awardId, step: step.step + 1, decision: opts.decision, name: opts.name, note: opts.note },
    });
    return true;
  }
  // Final approval, or a rejection that ends the round. Only an award still waiting can end here.
  const ended = await q("update awards set status = $2, decided_by = $3, decided_at = now(), decision_note = $4 where id = $1 and status = 'sent' returning id",
    [opts.awardId, opts.decision, opts.name.slice(0, 120), opts.note?.slice(0, 2000) ?? null]);
  if (!ended.length) throw new BadInput("This award was decided or withdrawn a moment ago.");
  if (opts.decision !== "approved") await q("update award_steps set status = 'cancelled' where award_id = $1 and status = 'waiting'", [opts.awardId]);
  if (opts.decision === "approved") await q("update rfx set status = 'awarded' where id = $1 and status <> 'closed'", [opts.log.rfxId]);
  const drafter = await one<{ drafted_by_user: string | null }>("select drafted_by_user from awards where id = $1", [opts.awardId]);
  await announce(opts.log.rfxId, "award_decided", `${opts.name} ${verb} the award on ${opts.log.code}.`);
  if (drafter?.drafted_by_user) await notify([drafter.drafted_by_user], "award_decided", `award ${verb} on ${opts.log.code}`, `${opts.name} ${verb} the award on ${opts.log.code}${opts.note ? `: "${opts.note}"` : "."}`);
  await logEvent({
    userId: opts.log.userId, rfxId: opts.log.rfxId, actor: opts.log.actor, tool: opts.log.tool ?? null, userRequest: opts.log.userRequest ?? null, kind: "award_decided",
    summary: `${opts.name} ${verb} the award on ${opts.log.code}${steps.length > 1 ? ` (step ${step.step + 1} of ${steps.length})` : ""}${opts.note ? `: "${opts.note}"` : "."}`,
    detail: { awardId: opts.awardId, decision: opts.decision, name: opts.name, step: step.step + 1, note: opts.note },
  });
  return true;
}
