/**
 * Roles and what each may do. Pure data, safe to import in client components.
 * The server enforces these in lib/actions.ts and lib/team.ts; the screens only
 * use them to hide controls a person cannot use.
 */

export type Role = "admin" | "buyer" | "approver" | "viewer";

export type Perm =
  | "edit" // create and change sourcing events, read quotes, follow up, draft awards
  | "approve" // approve, reject or send back an award
  | "note" // add notes to line items
  | "team" // invite people, change roles, restrict events
  | "tools" // switch Claude tools on or off for the workspace
  | "audit_all"; // the organisation-wide audit log, including team changes

const MATRIX: Record<Role, Perm[]> = {
  admin: ["edit", "approve", "note", "team", "tools", "audit_all"],
  buyer: ["edit", "note"],
  approver: ["approve", "note", "audit_all"],
  viewer: [],
};

export const can = (role: string | null | undefined, perm: Perm) =>
  Boolean(role && (MATRIX[role as Role] ?? []).includes(perm));

export const ROLES: Array<{ key: Role; label: string; help: string }> = [
  { key: "admin", label: "Admin", help: "Everything, plus the team, Claude tools, restricted events and the full audit log." },
  { key: "buyer", label: "Buyer", help: "Creates and runs sourcing events: line items, suppliers, quotes, follow-ups and award drafts." },
  { key: "approver", label: "Approver", help: "Sees every event and the audit log, approves or rejects awards, and adds notes. Cannot change prices." },
  { key: "viewer", label: "Viewer", help: "Read-only. Can open events, documents and the comparison, but cannot change anything." },
];

export const roleLabel = (r: string | null | undefined) => ROLES.find((x) => x.key === r)?.label ?? "Member";

export const isRole = (r: unknown): r is Role => typeof r === "string" && ROLES.some((x) => x.key === r);

/** The sentence shown when someone tries something their role does not allow. */
export function deniedMessage(role: string | null | undefined, perm: Perm): string {
  const what: Record<Perm, string> = {
    edit: "change sourcing events",
    approve: "decide awards",
    note: "add notes",
    team: "manage the team",
    tools: "change Claude tools",
    audit_all: "see the organisation audit log",
  };
  return `Your role (${roleLabel(role)}) cannot ${what[perm]}. Ask an admin of this workspace to change your role.`;
}
