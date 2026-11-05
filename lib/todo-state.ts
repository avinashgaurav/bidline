import { one, q } from "./db";
import { logEvent } from "./events";
import { BadInput, resolveRfx } from "./rfx";

/**
 * What people decided about a to-do: who it is assigned to and until when it
 * is snoozed. The to-do itself is worked out from the event each time.
 */
export interface TodoState { todo_key: string; assigned_to: string | null; assignee_name: string | null; snoozed_until: string | null }

export async function todoStates(workspaceId: string): Promise<Map<string, TodoState>> {
  const rows = await q<TodoState>(
    `select t.todo_key, t.assigned_to, u.name as assignee_name, t.snoozed_until from todo_state t left join users u on u.id = t.assigned_to
      where t.workspace_id = $1`, [workspaceId]);
  return new Map(rows.map((r) => [r.todo_key, r]));
}

export async function setTodo(userId: string, input: { key: string; rfxId: string; text: string; assignTo?: string | null; snoozeDays?: number | null }) {
  const rfx = await resolveRfx(userId, input.rfxId);
  const me = await one<{ name: string }>("select name from users where id = $1", [userId]);
  let assignee: { id: string; name: string } | null = null;
  if (input.assignTo) {
    assignee = await one<{ id: string; name: string }>(
      "select u.id, u.name from workspace_members m join users u on u.id = m.user_id where m.workspace_id = $1 and m.user_id = $2", [rfx.workspace_id, input.assignTo]);
    if (!assignee) throw new BadInput("That person is not in this workspace.");
  }
  const snooze = input.snoozeDays ? new Date(Date.now() + input.snoozeDays * 86_400_000).toISOString() : null;
  await q(
    `insert into todo_state (workspace_id, todo_key, rfx_id, assigned_to, snoozed_until, updated_by, updated_at) values ($1,$2,$3,$4,$5,$6,now())
     on conflict (workspace_id, todo_key) do update set
       assigned_to = case when $7 then excluded.assigned_to else todo_state.assigned_to end,
       snoozed_until = case when $8 then excluded.snoozed_until else todo_state.snoozed_until end,
       updated_by = excluded.updated_by, updated_at = now()`,
    [rfx.workspace_id, input.key, rfx.id, assignee?.id ?? null, snooze, userId, input.assignTo !== undefined, input.snoozeDays !== undefined],
  );
  const what = input.assignTo !== undefined
    ? assignee ? `Assigned "${input.text}" to ${assignee.name}.` : `Unassigned "${input.text}".`
    : snooze ? `Snoozed "${input.text}" until ${new Date(snooze).toLocaleDateString("en-IN", { dateStyle: "medium" })}.` : `Brought back "${input.text}".`;
  await logEvent({ userId, rfxId: rfx.id, actor: "user", kind: input.assignTo !== undefined ? "todo_assigned" : "todo_snoozed", summary: `${me?.name ?? "Someone"}: ${what}`, detail: { after: assignee?.name ?? snooze ?? null } });
}
