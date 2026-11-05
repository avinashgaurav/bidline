import { json, newId, one, q } from "./db";
import { logEvent } from "./events";
import { BadInput, NotFound, getLines, getQuestions, resolveRfx } from "./rfx";
import { createRfxAction, requireWorkspacePerm, type ActionCtx } from "./actions";
import { can, deniedMessage } from "./roles";

/**
 * Templates: an event's line items and questions, kept to start the next
 * purchase of the same kind. Suppliers and quotes are never copied.
 */
export interface Template { id: string; name: string; event_type: string; line_count: number; question_count: number; created_at: string; created_by_name: string | null }

export async function listTemplates(userId: string): Promise<Template[]> {
  return q<Template>(
    `select t.id, t.name, t.event_type, jsonb_array_length(t.lines)::int as line_count, jsonb_array_length(t.questions)::int as question_count,
            t.created_at, u.name as created_by_name
       from rfx_templates t left join users u on u.id = t.created_by
      where t.workspace_id = (select workspace_id from users where id = $1) order by t.created_at desc`, [userId]);
}

export async function saveTemplate(ctx: ActionCtx, rfxRef: string | null | undefined, name?: string | null) {
  const rfx = await resolveRfx(ctx.userId, rfxRef);
  if (!can(rfx.my_role, "edit")) throw new BadInput(deniedMessage(rfx.my_role, "edit"));
  const [lines, questions] = await Promise.all([getLines(rfx.id), getQuestions(rfx.id)]);
  if (!lines.length) throw new BadInput("This event has no line items to save.");
  const id = newId("tpl");
  const title = (name?.trim() || rfx.title).slice(0, 120);
  await q("insert into rfx_templates (id, workspace_id, name, event_type, lines, questions, from_rfx, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8)", [
    id, rfx.workspace_id, title, rfx.event_type,
    json(lines.map((l) => ({ sku: l.sku, group: l.group, description: l.desc, spec: l.spec, uom: l.uom, packSize: l.pack_size, qty: l.qty, hsn: l.hsn || undefined, baselineInr: l.baseline_inr || null }))),
    json(questions.map((x) => ({ no: x.no, question: x.q, mandatory: x.kind === "M", documentRequired: x.doc_required }))),
    rfx.id, ctx.userId,
  ]);
  await logEvent({ userId: ctx.userId, rfxId: rfx.id, actor: ctx.actor, tool: ctx.tool ?? null, userRequest: ctx.userRequest ?? null, kind: "template_saved",
    summary: `Saved ${rfx.code} as the template "${title}" (${lines.length} lines, ${questions.length} questions).`, detail: { templateId: id, name: title } });
  return { id, name: title, lines: lines.length, questions: questions.length };
}

export async function createFromTemplate(ctx: ActionCtx, templateRef: string, input: { title?: string | null; dueDate?: string | null }) {
  await requireWorkspacePerm(ctx.userId, "edit");
  const t = await one<{ id: string; name: string; event_type: string; lines: never[]; questions: never[] }>(
    `select * from rfx_templates where workspace_id = (select workspace_id from users where id = $1) and (id = $2 or lower(name) = lower($2)) limit 1`,
    [ctx.userId, templateRef.trim()]);
  if (!t) throw new NotFound(`No template "${templateRef}". Use list_templates to see what exists.`);
  const r = await createRfxAction(ctx, { title: input.title?.trim() || t.name, eventType: t.event_type, dueDate: input.dueDate ?? null, lines: t.lines, questions: t.questions });
  return { ...r, template: t.name };
}

export async function deleteTemplate(userId: string, id: string) {
  await requireWorkspacePerm(userId, "edit");
  const gone = await q<{ name: string; workspace_id: string }>("delete from rfx_templates where id = $1 and workspace_id = (select workspace_id from users where id = $2) returning name, workspace_id", [id, userId]);
  if (!gone.length) throw new NotFound("That template no longer exists.");
  await logEvent({ userId, workspaceId: gone[0].workspace_id, actor: "user", kind: "template_deleted", summary: `Deleted the template "${gone[0].name}".`, detail: {} });
}
