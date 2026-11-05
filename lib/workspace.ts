import { json, one, q } from "./db";
import { logEvent } from "./events";
import { requireWorkspacePerm } from "./actions";
import { BadInput } from "./rfx";

/**
 * Workspace settings an admin controls: automatic follow-up reminders, and
 * extra approval steps for awards above a value.
 */

export interface ApprovalStep { aboveInr: number; name: string; email: string }
export interface WorkspaceSettings {
  reminders: { enabled: boolean; everyDays: number };
  approvalSteps: ApprovalStep[];
  /** Most of one award any single supplier should get, in percent. Null for no limit. */
  maxSupplierSharePct: number | null;
  /** Days an award may wait for approval before the request expires. 0 = never. */
  approvalExpiryDays: number;
}

export const DEFAULT_SETTINGS: WorkspaceSettings = { reminders: { enabled: false, everyDays: 3 }, approvalSteps: [], maxSupplierSharePct: null, approvalExpiryDays: 14 };

export function readSettings(raw: unknown): WorkspaceSettings {
  const s = (raw ?? {}) as Partial<WorkspaceSettings>;
  return {
    reminders: {
      enabled: Boolean(s.reminders?.enabled),
      everyDays: Math.min(14, Math.max(1, Number(s.reminders?.everyDays) || 3)),
    },
    approvalSteps: (Array.isArray(s.approvalSteps) ? s.approvalSteps : [])
      .filter((x) => x && x.name && Number.isFinite(Number(x.aboveInr)))
      .map((x) => ({ aboveInr: Number(x.aboveInr), name: String(x.name), email: String(x.email ?? "") }))
      .sort((a, b) => a.aboveInr - b.aboveInr),
    approvalExpiryDays: s.approvalExpiryDays === undefined || s.approvalExpiryDays === null ? 14 : Math.min(90, Math.max(0, Math.round(Number(s.approvalExpiryDays)) || 0)),
    maxSupplierSharePct: Number(s.maxSupplierSharePct) > 0 && Number(s.maxSupplierSharePct) <= 100 ? Number(s.maxSupplierSharePct) : null,
  };
}

/** Suppliers whose share of an award is above the workspace limit. */
export function overLimit(settings: WorkspaceSettings, bySupplier: Array<{ code: string; name: string; totalInr: number }>, totalInr: number) {
  const max = settings.maxSupplierSharePct;
  if (!max || totalInr <= 0) return [];
  return bySupplier.map((x) => ({ ...x, pct: Math.round((x.totalInr / totalInr) * 1000) / 10 })).filter((x) => x.pct > max);
}

export async function getSettings(workspaceId: string): Promise<WorkspaceSettings> {
  const r = await one<{ settings: unknown }>("select settings from workspaces where id = $1", [workspaceId]);
  return readSettings(r?.settings);
}

export async function saveSettings(userId: string, next: WorkspaceSettings) {
  await requireWorkspacePerm(userId, "team");
  for (const s of next.approvalSteps) {
    if (s.aboveInr < 0) throw new BadInput("Approval thresholds must be zero or more.");
    if (s.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email)) throw new BadInput(`"${s.email}" is not a valid email address.`);
  }
  const ws = await one<{ workspace_id: string; settings: unknown }>(
    "select u.workspace_id, w.settings from users u join workspaces w on w.id = u.workspace_id where u.id = $1", [userId]);
  if (!ws) throw new BadInput("No workspace.");
  const before = readSettings(ws.settings);
  const after = readSettings(next);
  await q("update workspaces set settings = $2::jsonb where id = $1", [ws.workspace_id, json(after)]);
  const changes: string[] = [];
  if (before.reminders.enabled !== after.reminders.enabled) changes.push(`automatic reminders ${after.reminders.enabled ? "on" : "off"}`);
  if (before.reminders.everyDays !== after.reminders.everyDays) changes.push(`reminders every ${after.reminders.everyDays} days`);
  if (before.approvalExpiryDays !== after.approvalExpiryDays) changes.push(after.approvalExpiryDays ? `approval requests expire after ${after.approvalExpiryDays} days` : "approval requests never expire");
  if (before.maxSupplierSharePct !== after.maxSupplierSharePct) changes.push(after.maxSupplierSharePct ? `limit per supplier ${after.maxSupplierSharePct}% of an award` : "no limit per supplier");
  if (JSON.stringify(before.approvalSteps) !== JSON.stringify(after.approvalSteps)) {
    changes.push(after.approvalSteps.length
      ? `approval steps: ${after.approvalSteps.map((s) => `${s.name} above ₹${s.aboveInr.toLocaleString("en-IN")}`).join(", ")}`
      : "no extra approval steps");
  }
  if (!changes.length) return;
  await logEvent({ userId, workspaceId: ws.workspace_id, actor: "user", kind: "settings_changed", summary: `Changed workspace settings: ${changes.join("; ")}.`, detail: { before, after } });
}

/** Extra approvers an award of this value needs, in order, after the event's own approver. */
export function stepsFor(settings: WorkspaceSettings, totalInr: number): ApprovalStep[] {
  return settings.approvalSteps.filter((s) => totalInr > s.aboveInr);
}
