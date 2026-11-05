import { newId, one, q } from "./db";
import { logEvent } from "./events";
import { normaliseEmail } from "./auth";
import { BadInput, NotFound, resolveRfx } from "./rfx";
import { requireWorkspacePerm } from "./actions";
import { can, deniedMessage, isRole, roleLabel } from "./roles";

/**
 * The team: who is in a workspace, with which role, and who can see a
 * restricted event. Only admins change any of it, and every change is written
 * to the audit trail as a workspace-level entry.
 */

export interface Member { user_id: string; name: string; email: string; role: string; created_at: string; last_mcp_at: string | null }
export interface Invite { id: string; email: string; role: string; created_at: string; invited_by_name: string | null }

async function ws(userId: string) {
  const row = await one<{ workspace_id: string; name: string }>(
    "select u.workspace_id, w.name from users u join workspaces w on w.id = u.workspace_id where u.id = $1", [userId]);
  if (!row) throw new NotFound("No workspace.");
  return row;
}

async function audit(userId: string, workspaceId: string, kind: string, summary: string, detail: Record<string, unknown>, rfxId: string | null = null) {
  await logEvent({ userId, workspaceId, rfxId, actor: "user", kind, summary, detail });
}

export async function listMembers(userId: string): Promise<{ members: Member[]; invites: Invite[] }> {
  const { workspace_id } = await ws(userId);
  const [members, invites] = await Promise.all([
    q<Member>(
      `select m.user_id, u.name, u.email, m.role, m.created_at, u.last_mcp_at from workspace_members m join users u on u.id = m.user_id
        where m.workspace_id = $1 order by case m.role when 'admin' then 0 when 'buyer' then 1 when 'approver' then 2 else 3 end, u.name`,
      [workspace_id]),
    q<Invite>(
      `select i.id, i.email, i.role, i.created_at, u.name as invited_by_name from workspace_invites i left join users u on u.id = i.invited_by
        where i.workspace_id = $1 and i.accepted_at is null order by i.created_at desc`,
      [workspace_id]),
  ]);
  return { members, invites };
}

/** Add someone. With an account they join now; without one they join when they sign up with that email. */
export async function inviteMember(userId: string, emailIn: string, role: string): Promise<"added" | "invited"> {
  await requireWorkspacePerm(userId, "team");
  if (!isRole(role)) throw new BadInput("Pick a role.");
  const email = normaliseEmail(emailIn);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadInput("Enter a valid email address.");
  const { workspace_id } = await ws(userId);
  const existing = await one<{ id: string; name: string }>("select id, name from users where email = $1", [email]);
  if (existing) {
    const already = await one("select 1 from workspace_members where workspace_id = $1 and user_id = $2", [workspace_id, existing.id]);
    if (already) throw new BadInput(`${existing.name} is already in this workspace.`);
    await q("insert into workspace_members (workspace_id, user_id, role, added_by) values ($1,$2,$3,$4)", [workspace_id, existing.id, role, userId]);
    await audit(userId, workspace_id, "member_added", `Added ${existing.name} (${email}) as ${roleLabel(role)}.`, { email, role });
    return "added";
  }
  await q(
    `insert into workspace_invites (id, workspace_id, email, role, invited_by) values ($1,$2,$3,$4,$5)
     on conflict (workspace_id, email) do update set role = excluded.role, invited_by = excluded.invited_by, created_at = now(), accepted_at = null`,
    [newId("inv"), workspace_id, email, role, userId]);
  await audit(userId, workspace_id, "member_invited", `Invited ${email} as ${roleLabel(role)}.`, { email, role });
  return "invited";
}

export async function cancelInvite(userId: string, inviteId: string) {
  await requireWorkspacePerm(userId, "team");
  const { workspace_id } = await ws(userId);
  const gone = await q<{ email: string }>("delete from workspace_invites where id = $1 and workspace_id = $2 and accepted_at is null returning email", [inviteId, workspace_id]);
  if (!gone.length) throw new NotFound("That invite no longer exists.");
  await audit(userId, workspace_id, "invite_cancelled", `Cancelled the invite for ${gone[0].email}.`, { email: gone[0].email });
}

async function adminCount(workspaceId: string) {
  const r = await one<{ n: number }>("select count(*)::int as n from workspace_members where workspace_id = $1 and role = 'admin'", [workspaceId]);
  return r?.n ?? 0;
}

export async function changeRole(userId: string, memberId: string, role: string) {
  await requireWorkspacePerm(userId, "team");
  if (!isRole(role)) throw new BadInput("Pick a role.");
  const { workspace_id } = await ws(userId);
  const m = await one<{ role: string; name: string; email: string }>(
    "select m.role, u.name, u.email from workspace_members m join users u on u.id = m.user_id where m.workspace_id = $1 and m.user_id = $2", [workspace_id, memberId]);
  if (!m) throw new NotFound("That person is not in this workspace.");
  if (m.role === role) return;
  if (m.role === "admin" && (await adminCount(workspace_id)) <= 1) throw new BadInput("A workspace needs at least one admin. Make someone else an admin first.");
  await q("update workspace_members set role = $3 where workspace_id = $1 and user_id = $2", [workspace_id, memberId, role]);
  await audit(userId, workspace_id, "member_role_changed", `Changed ${m.name}'s role from ${roleLabel(m.role)} to ${roleLabel(role)}.`,
    { email: m.email, from: roleLabel(m.role), role: roleLabel(role), before: m.role, after: role });
}

export async function removeMember(userId: string, memberId: string) {
  await requireWorkspacePerm(userId, "team");
  const { workspace_id } = await ws(userId);
  const m = await one<{ role: string; name: string; email: string }>(
    "select m.role, u.name, u.email from workspace_members m join users u on u.id = m.user_id where m.workspace_id = $1 and m.user_id = $2", [workspace_id, memberId]);
  if (!m) throw new NotFound("That person is not in this workspace.");
  if (m.role === "admin" && (await adminCount(workspace_id)) <= 1) throw new BadInput("You are the only admin. Make someone else an admin first.");
  await q("delete from workspace_members where workspace_id = $1 and user_id = $2", [workspace_id, memberId]);
  await q("delete from rfx_access a using rfx r where a.rfx_id = r.id and r.workspace_id = $1 and a.user_id = $2", [workspace_id, memberId]);
  // Their next visit lands them in another workspace of theirs, or a new one (see lib/auth.ts).
  await q("update users set workspace_id = null where id = $1 and workspace_id = $2", [memberId, workspace_id]);
  await audit(userId, workspace_id, "member_removed", `Removed ${m.name} (${m.email}) from the workspace.`, { email: m.email, role: roleLabel(m.role) });
}

export async function renameWorkspace(userId: string, name: string) {
  await requireWorkspacePerm(userId, "team");
  const clean = name.trim().slice(0, 80);
  if (!clean) throw new BadInput("Enter a name.");
  const w = await ws(userId);
  if (w.name === clean) return;
  await q("update workspaces set name = $2 where id = $1", [w.workspace_id, clean]);
  await audit(userId, w.workspace_id, "workspace_renamed", `Renamed the workspace from "${w.name}" to "${clean}".`, { before: w.name, after: clean });
}

/** Workspaces this person belongs to, for the switcher. */
export async function myWorkspaces(userId: string) {
  return q<{ id: string; name: string; role: string }>(
    "select w.id, w.name, m.role from workspace_members m join workspaces w on w.id = m.workspace_id where m.user_id = $1 order by w.name", [userId]);
}

export async function switchWorkspace(userId: string, workspaceId: string) {
  const ok = await one("select 1 from workspace_members where user_id = $1 and workspace_id = $2", [userId, workspaceId]);
  if (!ok) throw new NotFound("You are not a member of that workspace.");
  await q("update users set workspace_id = $2 where id = $1", [userId, workspaceId]);
}

// ---------------------------------------------------------------------------
// Who can see one event
// ---------------------------------------------------------------------------

export async function eventAccess(userId: string, rfxRef: string) {
  const rfx = await resolveRfx(userId, rfxRef);
  const people = await q<{ user_id: string }>("select user_id from rfx_access where rfx_id = $1", [rfx.id]);
  return { restricted: rfx.restricted, people: people.map((p) => p.user_id), createdBy: rfx.user_id };
}

/** Restrict an event to named people (admins and its creator always see it), or open it to the whole workspace. */
export async function setEventAccess(userId: string, rfxRef: string, restricted: boolean, people: string[]) {
  const rfx = await resolveRfx(userId, rfxRef);
  if (!can(rfx.my_role, "team")) throw new BadInput(deniedMessage(rfx.my_role, "team"));
  const members = await q<{ user_id: string; name: string }>(
    "select m.user_id, u.name from workspace_members m join users u on u.id = m.user_id where m.workspace_id = $1", [rfx.workspace_id]);
  const valid = people.filter((p) => members.some((m) => m.user_id === p));
  await q("update rfx set restricted = $2 where id = $1", [rfx.id, restricted]);
  await q("delete from rfx_access where rfx_id = $1", [rfx.id]);
  for (const p of restricted ? valid : []) await q("insert into rfx_access (rfx_id, user_id, added_by) values ($1,$2,$3) on conflict do nothing", [rfx.id, p, userId]);
  const names = members.filter((m) => valid.includes(m.user_id)).map((m) => m.name);
  await audit(userId, rfx.workspace_id, "access_changed",
    restricted ? `Restricted ${rfx.code} to admins, its creator${names.length ? ` and ${names.join(", ")}` : ""}.` : `Opened ${rfx.code} to everyone in the workspace.`,
    { before: rfx.restricted ? "restricted" : "everyone", after: restricted ? "restricted" : "everyone", people: names }, rfx.id);
}

// ---------------------------------------------------------------------------
// Claude tools switched off for the workspace
// ---------------------------------------------------------------------------

export async function disabledTools(workspaceId: string): Promise<string[]> {
  const r = await one<{ disabled_tools: string[] }>("select disabled_tools from workspaces where id = $1", [workspaceId]);
  return r?.disabled_tools ?? [];
}

export async function setToolEnabled(userId: string, tool: string, enabled: boolean, known: string[], locked: string[]) {
  await requireWorkspacePerm(userId, "tools");
  if (!known.includes(tool)) throw new BadInput("Unknown tool.");
  if (!enabled && locked.includes(tool)) throw new BadInput("This tool is needed for Bidline to work with Claude and cannot be switched off.");
  const { workspace_id } = await ws(userId);
  const now = await disabledTools(workspace_id);
  const next = enabled ? now.filter((t) => t !== tool) : [...new Set([...now, tool])];
  if (next.length === now.length && next.every((t) => now.includes(t))) return;
  await q("update workspaces set disabled_tools = $2 where id = $1", [workspace_id, next]);
  await audit(userId, workspace_id, "tools_changed", `Switched ${enabled ? "on" : "off"} the Claude tool ${tool}.`,
    enabled ? { enabled: tool } : { disabled: tool });
}
