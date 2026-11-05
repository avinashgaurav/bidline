import { newId, one, q } from "./db";
import { logEvent } from "./events";
import { decrypt, encrypt } from "./mail";
import { requireWorkspacePerm } from "./actions";
import { BadInput, NotFound } from "./rfx";
import { NOTIFY_KINDS, type NotifyKind } from "./notify";

/**
 * Workspace channels: Slack, Microsoft Teams or any webhook. An admin picks
 * which events each channel gets. The URL is a secret, so it is stored
 * encrypted and never shown again in full.
 */
export const CHANNEL_KINDS = [
  { key: "slack", label: "Slack", hint: "An incoming-webhook URL from your Slack app (https://hooks.slack.com/...)." },
  { key: "teams", label: "Microsoft Teams", hint: "A Workflows or incoming-webhook URL for the channel." },
  { key: "webhook", label: "Webhook", hint: "Any https URL. Bidline posts JSON: { event, text, eventCode, at }." },
] as const;
export type ChannelKind = (typeof CHANNEL_KINDS)[number]["key"];

export interface Channel { id: string; kind: ChannelKind; name: string; events: string[]; url_hint: string; last_ok_at: string | null; last_error: string | null; created_at: string }

/** Only public https endpoints: no local or private addresses. */
function checkUrl(kind: ChannelKind, raw: string): string {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new BadInput("That is not a valid link.");
  }
  if (u.protocol !== "https:") throw new BadInput("The link must start with https://.");
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || /^(127|10|0)\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || h.includes(":") || /^\[/.test(h)) {
    throw new BadInput("Use a public address. Local and private network addresses are not allowed.");
  }
  if (kind === "slack" && h !== "hooks.slack.com") throw new BadInput("A Slack link starts with https://hooks.slack.com/.");
  return u.toString();
}

const hint = (url: string) => {
  const u = new URL(url);
  return `${u.hostname}/…${u.pathname.slice(-6)}`;
};

export async function listChannels(workspaceId: string): Promise<Channel[]> {
  const rows = await q<Channel & { url_enc: string }>("select * from notification_channels where workspace_id = $1 order by created_at", [workspaceId]);
  return rows.map(({ url_enc, ...c }) => ({ ...c, url_hint: (() => { try { return hint(decrypt(url_enc)); } catch { return "hidden"; } })() }));
}

async function wsOf(userId: string) {
  const r = await one<{ workspace_id: string }>("select workspace_id from users where id = $1", [userId]);
  if (!r) throw new NotFound("No workspace.");
  return r.workspace_id;
}

export async function addChannel(userId: string, input: { kind: string; name: string; url: string; events: string[] }) {
  await requireWorkspacePerm(userId, "team");
  const kind = CHANNEL_KINDS.find((k) => k.key === input.kind)?.key;
  if (!kind) throw new BadInput("Pick Slack, Teams or Webhook.");
  const url = checkUrl(kind, input.url);
  const events = input.events.filter((e) => NOTIFY_KINDS.some((k) => k.key === e));
  if (!events.length) throw new BadInput("Pick at least one event to send.");
  const ws = await wsOf(userId);
  const id = newId("chn");
  const name = input.name.trim().slice(0, 60) || CHANNEL_KINDS.find((k) => k.key === kind)!.label;
  await q("insert into notification_channels (id, workspace_id, kind, name, url_enc, events, created_by) values ($1,$2,$3,$4,$5,$6,$7)",
    [id, ws, kind, name, encrypt(url), events, userId]);
  await logEvent({ userId, workspaceId: ws, actor: "user", kind: "settings_changed", summary: `Added the ${kind} channel "${name}" for: ${events.join(", ")}.`, detail: { after: { kind, name, events, url: hint(url) } } });
  return id;
}

export async function removeChannel(userId: string, id: string) {
  await requireWorkspacePerm(userId, "team");
  const ws = await wsOf(userId);
  const gone = await q<{ name: string; kind: string }>("delete from notification_channels where id = $1 and workspace_id = $2 returning name, kind", [id, ws]);
  if (!gone.length) throw new NotFound("That channel no longer exists.");
  await logEvent({ userId, workspaceId: ws, actor: "user", kind: "settings_changed", summary: `Removed the ${gone[0].kind} channel "${gone[0].name}".`, detail: { before: gone[0] } });
}

async function post(kind: string, url: string, event: string, text: string, code: string | null) {
  const body = kind === "webhook" ? { event, text, eventCode: code, at: new Date().toISOString() } : { text };
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000), redirect: "error" });
  if (!res.ok) throw new Error(`The channel answered ${res.status}.`);
}

export async function testChannel(userId: string, id: string) {
  await requireWorkspacePerm(userId, "team");
  const ws = await wsOf(userId);
  const c = await one<{ kind: string; url_enc: string; name: string }>("select kind, url_enc, name from notification_channels where id = $1 and workspace_id = $2", [id, ws]);
  if (!c) throw new NotFound("That channel no longer exists.");
  try {
    await post(c.kind, decrypt(c.url_enc), "test", `Bidline test: this channel will get the events you chose. (${c.name})`, null);
    await q("update notification_channels set last_ok_at = now(), last_error = null where id = $1", [id]);
  } catch (e) {
    await q("update notification_channels set last_error = $2 where id = $1", [id, (e as Error).message.slice(0, 300)]);
    throw new BadInput(`Could not post to ${c.name}: ${(e as Error).message}`);
  }
}

/** Post one event to every channel in the event's workspace that asked for it. Never throws. */
export async function announce(rfxId: string, kind: NotifyKind, text: string) {
  try {
    const chans = await q<{ id: string; kind: string; url_enc: string; code: string }>(
      `select c.id, c.kind, c.url_enc, r.code from notification_channels c join rfx r on r.workspace_id = c.workspace_id
        where r.id = $1 and $2 = any(c.events) and not r.restricted`, [rfxId, kind]);
    for (const c of chans) {
      try {
        await post(c.kind, decrypt(c.url_enc), kind, text, c.code);
        await q("update notification_channels set last_ok_at = now(), last_error = null where id = $1", [c.id]);
      } catch (e) {
        await q("update notification_channels set last_error = $2 where id = $1", [c.id, (e as Error).message.slice(0, 300)]);
      }
    }
  } catch (e) {
    console.error("[announce]", (e as Error).message);
  }
}
