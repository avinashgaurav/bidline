import { currentUser } from "@/lib/auth";
import { uploadDocumentAction } from "@/lib/actions";
import { MAX_UPLOAD_BYTES } from "@/lib/files";
import { BadInput, NotFound } from "@/lib/rfx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Upload supplier files (photos, PDF, Excel, Word, email, CSV) to an enquiry. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in again." }, { status: 401 });
  const { id } = await params;
  const form = await req.formData();
  const supplier = String(form.get("supplier") ?? "") || null;
  const kind = String(form.get("kind") ?? "") || null;
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return Response.json({ error: "Choose at least one file." }, { status: 400 });
  const results: Array<{ filename: string; ok: boolean; error?: string; supplier?: string | null }> = [];
  for (const file of files) {
    if (file.size > MAX_UPLOAD_BYTES) {
      results.push({ filename: file.name, ok: false, error: "Over 4 MB. Attach it in the Claude chat instead, or send a smaller copy." });
      continue;
    }
    try {
      const r = await uploadDocumentAction(
        { userId: user.id, actor: "user" },
        id,
        { filename: file.name, bytes: Buffer.from(await file.arrayBuffer()), mimeType: file.type, supplierRef: supplier, kind },
      );
      results.push({ filename: file.name, ok: true, supplier: r.supplier ? `${r.supplier.code} ${r.supplier.name}` : null });
    } catch (e) {
      const known = e instanceof BadInput || e instanceof NotFound;
      results.push({ filename: file.name, ok: false, error: known ? (e as Error).message : `Could not store it: ${(e as Error).message}` });
    }
  }
  return Response.json({ results });
}
