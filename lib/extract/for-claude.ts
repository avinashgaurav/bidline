import sharp from "sharp";
import { readFileParts, type Part } from "./readers";

export type McpContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

const MAX_TEXT = 120_000;

/**
 * Turn a stored file into content Claude can read: text with locators for
 * spreadsheets, PDFs, Word files and emails, and the picture itself for
 * photographs. Mechanical only. Nothing here decides what a number means.
 */
export async function documentContent(bytes: Buffer, filename: string, mimeType: string): Promise<{
  format: string; content: McpContent[]; notes: string[];
}> {
  const notes: string[] = [];
  const read = await readFileParts(bytes, filename, mimeType);
  const content: McpContent[] = [];
  if (read.guidance) content.push({ type: "text", text: read.guidance });
  for (const part of read.parts) content.push(...(await partToContent(part, notes)));
  for (const nested of read.nestedFiles ?? []) {
    content.push({ type: "text", text: `\n=== ATTACHMENT: ${nested.filename} ===` });
    try {
      const inner = await readFileParts(nested.buf, nested.filename, nested.mimeType);
      if (inner.guidance) content.push({ type: "text", text: inner.guidance });
      for (const p of inner.parts) content.push(...(await partToContent(p, notes)));
    } catch (e) {
      content.push({ type: "text", text: `(could not open this attachment: ${(e as Error).message})` });
    }
  }
  return { format: read.format, content: capText(content), notes };
}

async function partToContent(part: Part, notes: string[]): Promise<McpContent[]> {
  if (part.kind === "text") return [{ type: "text", text: part.text }];
  if (part.kind === "image") {
    const buf = Buffer.from(part.base64, "base64");
    const resized = await sharp(buf).rotate().resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 88 }).toBuffer();
    return [{ type: "image", data: resized.toString("base64"), mimeType: "image/jpeg" }];
  }
  // PDF: the text layer, page by page, with line numbers to cite.
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(Buffer.from(part.base64, "base64")));
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  const pages = text as string[];
  const chars = pages.join("").replace(/\s/g, "").length;
  if (chars < 40) {
    notes.push("This PDF has no text layer (it is a scan).");
    return [{
      type: "text",
      text: `This PDF (${totalPages} page${totalPages === 1 ? "" : "s"}) has no text layer: it is a scanned image. ` +
        "Bidline cannot turn it into text without AI, and it has none. Ask the user to attach the file in this chat so you can read it directly, then submit with the same documentId.",
    }];
  }
  return [{
    type: "text",
    text: pages.map((p, i) => {
      const lines = p.split(/\n/).map((l, j) => `p${i + 1} L${j + 1}: ${l}`);
      return `--- PAGE ${i + 1} of ${totalPages} ---\n${lines.join("\n")}`;
    }).join("\n\n"),
  }];
}

function capText(content: McpContent[]): McpContent[] {
  let used = 0;
  return content.map((c) => {
    if (c.type !== "text") return c;
    const room = Math.max(0, MAX_TEXT - used);
    used += c.text.length;
    return c.text.length > room ? { type: "text", text: c.text.slice(0, room) + "\n...(truncated)" } : c;
  });
}
