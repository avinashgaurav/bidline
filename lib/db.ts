import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { randomBytes } from "node:crypto";

/**
 * Neon over HTTP. One round trip per query, no pool to manage, works the same
 * in a Vercel function and in a local script.
 */
let client: NeonQueryFunction<false, false> | null = null;

function sqlClient() {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set. Run `vercel env pull` first.");
    client = neon(url);
  }
  return client;
}

export type Row = Record<string, unknown>;

/** Run a parameterised query and return its rows. */
export async function q<T = Row>(text: string, params: unknown[] = []): Promise<T[]> {
  const rows = (await sqlClient().query(text, params)) as Row[];
  // Timestamps come back as Date objects; the app and the tool answers work
  // with ISO strings, so convert once here.
  for (const r of rows) for (const k in r) if (r[k] instanceof Date) r[k] = (r[k] as Date).toISOString();
  return rows as T[];
}

export async function one<T = Row>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await q<T>(text, params);
  return rows[0] ?? null;
}

/** Several statements in one transaction. */
export async function tx(statements: Array<[string, unknown[]]>) {
  const sql = sqlClient();
  return sql.transaction(statements.map(([text, params]) => sql.query(text, params)));
}

/** Short random id with a readable prefix, e.g. `doc_k3j9x2`. */
export function newId(prefix: string, bytes = 6): string {
  return `${prefix}_${randomBytes(bytes).toString("base64url").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, bytes * 2)}`;
}

export const json = (v: unknown) => JSON.stringify(v ?? null);
export const numOrNull = (v: unknown): number | null =>
  v === null || v === undefined || v === "" ? null : Number(v);
