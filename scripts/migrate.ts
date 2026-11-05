/**
 * Apply db/schema.sql to the database in DATABASE_URL.
 *
 *   npx tsx --env-file=.env.local scripts/migrate.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { neon } from "@neondatabase/serverless";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const sql = neon(url);
  const text = readFileSync(join(process.cwd(), "db/schema.sql"), "utf8");
  const statements = splitSql(text);
  for (const s of statements) await sql.query(s);
  const tables = await sql.query(
    "select table_name from information_schema.tables where table_schema = 'public' order by 1",
  );
  console.log(`Applied ${statements.length} statements. Tables: ${tables.map((t) => t.table_name).join(", ")}`);
}

/**
 * Split on semicolons at line ends, except inside dollar-quoted bodies
 * ($fn$ ... $fn$) used by functions and DO blocks. Line comments are dropped.
 */
function splitSql(text: string): string[] {
  const out: string[] = [];
  let cur = "";
  let tag: string | null = null;
  for (const raw of text.split("\n")) {
    const line: string = tag ? raw : raw.replace(/^\s*--.*$/, "").replace(/\s--\s.*$/, "");
    for (const m of [...line.matchAll(/\$[a-z_]*\$/gi)] as RegExpMatchArray[]) tag = tag === null ? m[0] : tag === m[0] ? null : tag;
    cur += line + "\n";
    if (!tag && /;\s*$/.test(line)) {
      out.push(cur.trim().replace(/;$/, ""));
      cur = "";
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter(Boolean);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
