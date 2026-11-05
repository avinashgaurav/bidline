import { currentUser } from "@/lib/auth";
import { one } from "@/lib/db";
import { documentBytes, type DocumentRow } from "@/lib/files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Stream a stored supplier file to its owner. Files are private; this is the only way in. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return new Response("Sign in to view this file.", { status: 401 });
  const { id } = await params;
  const doc = await one<DocumentRow>(
    "select d.* from documents d join rfx r on r.id = d.rfx_id where d.id = $1 and r.user_id = $2",
    [id, user.id],
  );
  if (!doc) return new Response("Not found.", { status: 404 });
  const bytes = await documentBytes(doc);
  // Only types a browser cannot run are shown inline; anything else downloads.
  const safeInline = /^(application\/pdf|image\/(jpeg|png|webp|gif)|text\/plain)$/.test(doc.mime_type);
  const inline = safeInline && new URL(req.url).searchParams.get("download") !== "1";
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": doc.mime_type,
      "content-disposition": `${inline ? "inline" : "attachment"}; filename="${doc.filename.replace(/[^\x20-\x7e]|"/g, "_")}"; filename*=UTF-8''${encodeURIComponent(doc.filename)}`,
      "cache-control": "private, max-age=300",
      "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox",
    },
  });
}
