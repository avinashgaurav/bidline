import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { newId, one, q } from "./db";
import type { Role } from "./roles";

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export interface User {
  id: string;
  email: string;
  name: string;
  mcp_token: string;
  last_mcp_at: string | null;
  /** True when Claude connected with the person's read-only link: it is offered reading tools only. */
  read_only_link?: boolean;
  /** The workspace this person is working in, their role there and its name. */
  workspace_id: string;
  workspace_name: string;
  role: Role;
}

// One person, with the workspace they are working in. A person who has lost
// their membership (removed by an admin) gets a fresh workspace of their own.
const USER_SQL = `select u.id, u.email, u.name, u.mcp_token, u.last_mcp_at, u.workspace_id, w.name as workspace_name, m.role
  from users u
  left join workspaces w on w.id = u.workspace_id
  left join workspace_members m on m.workspace_id = u.workspace_id and m.user_id = u.id`;

type RawUser = Omit<User, "role" | "workspace_id" | "workspace_name"> & { workspace_id: string | null; workspace_name: string | null; role: string | null };

async function withWorkspace(row: RawUser | null): Promise<User | null> {
  if (!row) return null;
  if (row.workspace_id && row.role) return row as User;
  const other = await one<{ workspace_id: string }>("select workspace_id from workspace_members where user_id = $1 order by created_at limit 1", [row.id]);
  const ws = other?.workspace_id ?? (await createWorkspace(row.id, `${row.name.split(" ")[0]}'s workspace`));
  await q("update users set workspace_id = $2 where id = $1", [row.id, ws]);
  return one<User>(`${USER_SQL} where u.id = $1`, [row.id]);
}

/** A new workspace with this person as its admin. */
export async function createWorkspace(userId: string, name: string): Promise<string> {
  const id = newId("ws");
  await q("insert into workspaces (id, name) values ($1, $2)", [id, name.trim().slice(0, 80) || "Workspace"]);
  await q("insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'admin')", [id, userId]);
  return id;
}

const COOKIE = "bidline_session";
const SESSION_DAYS = 30;

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return s;
}

// ---------------------------------------------------------------------------
// Passwords: scrypt with a per-user salt, stored as salt:hash.
// ---------------------------------------------------------------------------

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(pw, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const hash = await scryptAsync(pw, Buffer.from(saltHex, "hex"), 64);
  const expected = Buffer.from(hashHex, "hex");
  return expected.length === hash.length && timingSafeEqual(expected, hash);
}

export const newMcpToken = () => `bl_${randomBytes(24).toString("base64url")}`;

// ---------------------------------------------------------------------------
// Sessions: a signed cookie holding the user id and an expiry. No session
// table to clean up; changing AUTH_SECRET signs everybody out.
// ---------------------------------------------------------------------------

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function encodeSession(userId: string): string {
  const exp = Date.now() + SESSION_DAYS * 86_400_000;
  const payload = `${userId}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

function decodeSession(value: string | undefined): string | null {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [userId, exp, sig] = parts;
  const expected = sign(`${userId}.${exp}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (Number(exp) < Date.now()) return null;
  return userId;
}

export async function startSession(userId: string) {
  const jar = await cookies();
  jar.set(COOKIE, encodeSession(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
}

export async function endSession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function currentUser(): Promise<User | null> {
  const jar = await cookies();
  const userId = decodeSession(jar.get(COOKIE)?.value);
  if (!userId) return null;
  return withWorkspace(await one<RawUser>(`${USER_SQL} where u.id = $1`, [userId]));
}

/** For pages: send anyone not signed in to the login screen. */
export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

export async function userByMcpToken(token: string): Promise<User | null> {
  if (!token || !token.startsWith("bl_")) return null;
  const u = await withWorkspace(await one<RawUser>(`${USER_SQL} where u.mcp_token = $1 or u.mcp_token_ro = $1`, [token]));
  // The read-only link works like a Viewer's: Claude is offered reading tools only.
  return u && u.mcp_token !== token ? { ...u, role: "viewer", read_only_link: true } : u;
}

export const normaliseEmail = (e: string) => e.trim().toLowerCase();

export async function createUser(opts: { email: string; name: string; password: string; company?: string }): Promise<User> {
  const id = newId("usr");
  const email = normaliseEmail(opts.email);
  await q(
    "insert into users (id, email, name, password_hash, mcp_token) values ($1,$2,$3,$4,$5)",
    [id, email, opts.name.trim() || email.split("@")[0], await hashPassword(opts.password), newMcpToken()],
  );
  // Invited? Join the inviting workspace with the invited role. Otherwise start a workspace of one's own.
  const invite = await one<{ id: string; workspace_id: string; role: string }>(
    "select id, workspace_id, role from workspace_invites where email = $1 and accepted_at is null order by created_at limit 1", [email]);
  if (invite) {
    await q("insert into workspace_members (workspace_id, user_id, role, added_by) select workspace_id, $2, role, invited_by from workspace_invites where id = $1 on conflict do nothing", [invite.id, id]);
    await q("update workspace_invites set accepted_at = now() where email = $1 and accepted_at is null", [email]);
    await q("update users set workspace_id = $2 where id = $1", [id, invite.workspace_id]);
  } else {
    const ws = await createWorkspace(id, opts.company?.trim() || `${(opts.name.trim() || email).split(/[\s@]/)[0]}'s workspace`);
    await q("update users set workspace_id = $2 where id = $1", [id, ws]);
  }
  const user = await one<User>(`${USER_SQL} where u.id = $1`, [id]);
  if (!user) throw new Error("user was not created");
  return user;
}

export async function checkLogin(email: string, password: string): Promise<User | null> {
  const row = await one<{ id: string; password_hash: string }>(
    "select id, password_hash from users where email = $1",
    [normaliseEmail(email)],
  );
  if (!row) return null;
  if (!(await verifyPassword(password, row.password_hash))) return null;
  return withWorkspace(await one<RawUser>(`${USER_SQL} where u.id = $1`, [row.id]));
}

// ---------------------------------------------------------------------------
// Sign-in throttle: 5 attempts per email or 30 per address in 15 minutes.
// Each attempt is counted and recorded in one statement, so a burst of parallel
// guesses cannot all slip past an empty count. A successful sign-in clears its
// email and prunes old rows.
// ---------------------------------------------------------------------------

const WINDOW = "15 minutes";
const MAX_PER_EMAIL = 5;
const MAX_PER_IP = 30;

/** Record one sign-in attempt and say whether it is over the limit. */
export async function recordLoginAttempt(email: string, ip: string | null): Promise<boolean> {
  const e = normaliseEmail(email).slice(0, 254);
  const addr = (ip ?? "").slice(0, 64);
  // Counted and inserted in one statement. Once over the limit nothing more is
  // written, so a flood neither grows the table nor extends the lockout.
  const row = await one<{ by_email: number; by_ip: number }>(
    `with c as (
       select (select count(*)::int from login_failures where email = $1 and at > now() - interval '${WINDOW}') as by_email,
              (select count(*)::int from login_failures where $2 <> '' and ip = $2 and at > now() - interval '${WINDOW}') as by_ip
     ), ins as (
       insert into login_failures (email, ip)
       select $1, $2 from c where c.by_email < ${MAX_PER_EMAIL} and (c.by_ip < ${MAX_PER_IP} or $2 = '')
       returning 1
     )
     select by_email, by_ip from c`,
    [e, addr],
  );
  return (row?.by_email ?? 0) >= MAX_PER_EMAIL || (addr !== "" && (row?.by_ip ?? 0) >= MAX_PER_IP);
}

export async function clearLoginFailures(email: string) {
  await q("delete from login_failures where email = $1 or at < now() - interval '1 day'", [normaliseEmail(email).slice(0, 254)]);
}

// ---------------------------------------------------------------------------
// Signed download links: let Claude hand the buyer an export without a login.
// The link names one event and one file type and expires.
// ---------------------------------------------------------------------------

export function signExport(userId: string, rfxId: string, kind: string, hours = 24): string {
  const exp = Date.now() + hours * 3_600_000;
  const payload = `${userId}.${rfxId}.${kind}.${exp}`;
  return `${Buffer.from(payload).toString("base64url")}.${sign(`export:${payload}`)}`;
}

export function verifyExport(token: string, rfxId: string, kind: string): string | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const payload = Buffer.from(body, "base64url").toString();
  const expected = sign(`export:${payload}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const [userId, rid, k, exp] = payload.split(".");
  if (rid !== rfxId || k !== kind || Number(exp) < Date.now()) return null;
  return userId;
}
