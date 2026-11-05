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
  // Split on semicolons at line ends; the schema has no functions or DO blocks.
  const statements = text
    .split(/;\s*\n/)
    .map((s) => s.replace(/--[^\n]*\n/g, "\n").trim())
    .filter(Boolean);
  for (const s of statements) await sql.query(s);
  const tables = await sql.query(
    "select table_name from information_schema.tables where table_schema = 'public' order by 1",
  );
  console.log(`Applied ${statements.length} statements. Tables: ${tables.map((t) => t.table_name).join(", ")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
