import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { newId, one, q } from "./db";

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export interface User {
  id: string;
  email: string;
  name: string;
  mcp_token: string;
  last_mcp_at: string | null;
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
  return one<User>(
    "select id, email, name, mcp_token, last_mcp_at from users where id = $1",
    [userId],
  );
}

/** For pages: send anyone not signed in to the login screen. */
export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

export async function userByMcpToken(token: string): Promise<User | null> {
  if (!token || !token.startsWith("bl_")) return null;
  return one<User>(
    "select id, email, name, mcp_token, last_mcp_at from users where mcp_token = $1",
    [token],
  );
}

export const normaliseEmail = (e: string) => e.trim().toLowerCase();

export async function createUser(opts: { email: string; name: string; password: string }): Promise<User> {
  const id = newId("usr");
  const email = normaliseEmail(opts.email);
  await q(
    "insert into users (id, email, name, password_hash, mcp_token) values ($1,$2,$3,$4,$5)",
    [id, email, opts.name.trim() || email.split("@")[0], await hashPassword(opts.password), newMcpToken()],
  );
  const user = await one<User>("select id, email, name, mcp_token, last_mcp_at from users where id = $1", [id]);
  if (!user) throw new Error("user was not created");
  return user;
}

export async function checkLogin(email: string, password: string): Promise<User | null> {
  const row = await one<User & { password_hash: string }>(
    "select id, email, name, mcp_token, last_mcp_at, password_hash from users where email = $1",
    [normaliseEmail(email)],
  );
  if (!row) return null;
  if (!(await verifyPassword(password, row.password_hash))) return null;
  return { id: row.id, email: row.email, name: row.name, mcp_token: row.mcp_token, last_mcp_at: row.last_mcp_at };
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
