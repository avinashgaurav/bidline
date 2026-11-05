import { createHash } from "node:crypto";
import { get, put } from "@vercel/blob";
import { newId, one, q } from "./db";
import { detectFormat } from "./extract/readers";
import type { SupplierRow } from "./rfx";

export interface DocumentRow {
  id: string;
  rfx_id: string;
  supplier_id: string | null;
  kind: string;
  filename: string;
  mime_type: string;
  byte_size: number;
  sha256: string;
  blob_url: string | null;
  blob_pathname: string | null;
  text_body: string | null;
  source: string;
  status: string;
  read_at: string | null;
  notes: string | null;
  created_at: string;
}

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  csv: "text/csv",
  tsv: "text/tab-separated-values",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  odt: "application/vnd.oasis.opendocument.text",
  eml: "message/rfc822",
  txt: "text/plain",
  md: "text/markdown",
  rtf: "application/rtf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

export function mimeFor(filename: string, given?: string | null): string {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  if (given && given !== "application/octet-stream") return given;
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

/** Questionnaire, certificate or quotation, guessed from the filename. A person can change it. */
export function guessKind(filename: string): string {
  const f = filename.toLowerCase();
  if (/questionnaire|vendor_q|response_q|compliance/.test(f)) return "questionnaire";
  if (/iso|certif|authoris|authoriz|oem_|licen[cs]e|cpcb|audited|statement/.test(f)) return "certificate";
  if (/no_questionnaire|readme/.test(f)) return "other";
  return "quotation";
}

/**
 * Which supplier sent a file, from its name. A hint that fails safe: no match,
 * or more than one, returns null and a person (or Claude) says who it is from.
 */
export function guessSupplier(filename: string, suppliers: SupplierRow[]): SupplierRow | null {
  const f = filename.toLowerCase();
  const hits = suppliers.filter((s) => {
    const words = s.name.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !GENERIC.has(w));
    return words.some((w) => f.includes(w)) || f.includes(s.code.toLowerCase() + "_");
  });
  return hits.length === 1 ? hits[0] : null;
}

const GENERIC = new Set([
  "india", "private", "limited", "solutions", "technologies", "systems", "services",
  "enterprise", "enterprises", "infotech", "group", "company", "trading", "global",
]);

export async function storeDocument(opts: {
  rfxId: string;
  filename: string;
  bytes: Buffer;
  mimeType?: string | null;
  supplierId?: string | null;
  kind?: string | null;
  source: "upload" | "claude" | "seed";
  notes?: string | null;
}): Promise<DocumentRow> {
  const filename = opts.filename.replace(/[/\\\u0000-\u001f\u007f]/g, "_").slice(0, 200) || "document";
  const mime = mimeFor(filename, opts.mimeType);
  // Refuses a file whose contents do not match its extension early, with a reason.
  detectFormat(filename, mime);
  const id = newId("doc");
  const sha = createHash("sha256").update(opts.bytes).digest("hex");
  const pathname = `rfx/${opts.rfxId}/${id}/${filename}`;
  const blob = await put(pathname, opts.bytes, {
    access: "private",
    contentType: mime,
    addRandomSuffix: false,
  });
  await q(
    `insert into documents (id, rfx_id, supplier_id, kind, filename, mime_type, byte_size, sha256, blob_url, blob_pathname, source, notes)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      id, opts.rfxId, opts.supplierId ?? null, opts.kind ?? guessKind(filename), filename, mime,
      opts.bytes.length, sha, blob.url, blob.pathname, opts.source, opts.notes ?? null,
    ],
  );
  return (await one<DocumentRow>("select * from documents where id = $1", [id]))!;
}

/** A document Claude saved from the chat: an email body or a message pasted in. */
export async function storeTextDocument(opts: {
  rfxId: string; filename: string; text: string; supplierId?: string | null; kind?: string | null;
}): Promise<DocumentRow> {
  const id = newId("doc");
  const filename = opts.filename.replace(/[/\\]/g, "_").slice(0, 200) || "pasted.txt";
  const bytes = Buffer.from(opts.text, "utf8");
  await q(
    `insert into documents (id, rfx_id, supplier_id, kind, filename, mime_type, byte_size, sha256, text_body, source)
     values ($1,$2,$3,$4,$5,'text/plain',$6,$7,$8,'claude')`,
    [
      id, opts.rfxId, opts.supplierId ?? null, opts.kind ?? guessKind(filename), filename, bytes.length,
      createHash("sha256").update(bytes).digest("hex"), opts.text,
    ],
  );
  return (await one<DocumentRow>("select * from documents where id = $1", [id]))!;
}

export async function documentBytes(doc: DocumentRow): Promise<Buffer> {
  if (doc.text_body !== null && doc.text_body !== undefined) return Buffer.from(doc.text_body, "utf8");
  if (!doc.blob_pathname) {
    const row = await one<{ text_body: string | null }>("select text_body from documents where id = $1", [doc.id]);
    if (row?.text_body !== null && row?.text_body !== undefined) return Buffer.from(row.text_body, "utf8");
    throw new Error(`Document ${doc.id} has no stored file.`);
  }
  const res = await get(doc.blob_pathname, { access: "private", useCache: false });
  if (!res || !res.stream) throw new Error(`The stored file for ${doc.filename} could not be fetched.`);
  const chunks: Uint8Array[] = [];
  const reader = res.stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export async function listDocuments(rfxId: string) {
  return q<DocumentRow & { supplier_code: string | null; supplier_name: string | null }>(
    `select d.id, d.rfx_id, d.supplier_id, d.kind, d.filename, d.mime_type, d.byte_size, d.sha256, d.blob_url,
            d.blob_pathname, null::text as text_body, d.source, d.status, d.read_at, d.notes, d.created_at,
            s.code as supplier_code, s.name as supplier_name
       from documents d left join suppliers s on s.id = d.supplier_id
      where d.rfx_id = $1 order by d.created_at desc`,
    [rfxId],
  );
}

export async function getDocument(rfxId: string, ref: string): Promise<DocumentRow | null> {
  return one<DocumentRow>(
    `select * from documents where rfx_id = $1 and (id = $2 or lower(filename) = lower($2)) order by created_at desc limit 1`,
    [rfxId, ref.trim()],
  );
}
