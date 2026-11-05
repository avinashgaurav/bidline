import { currentUser, verifyExport, type User } from "@/lib/auth";
import { one } from "@/lib/db";
import { resolveRfx } from "@/lib/rfx";
import { loadComparison } from "@/lib/comparison";
import { comparisonCsv, comparisonXlsx } from "@/lib/exports";
import { listEvents, transcriptMarkdown } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Downloads: comparison.csv, comparison.xlsx, transcript.md, award.md (?award=<id>).
 * Signed in, or with a signed link from get_export_link (?t=...).
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string; kind: string }> }) {
  const { id, kind } = await params;
  const t = new URL(req.url).searchParams.get("t");
  let user: Pick<User, "id" | "email"> | null = await currentUser();
  if (!user && t) {
    const userId = verifyExport(t, id, kind);
    user = userId ? await one<Pick<User, "id" | "email">>("select id, email from users where id = $1", [userId]) : null;
  }
  if (!user) return new Response(t ? "This download link has expired. Ask Claude for a new one." : "Sign in first.", { status: 401 });
  const rfx = await resolveRfx(user.id, id).catch(() => null);
  if (!rfx) return new Response("Not found.", { status: 404 });
  const name = rfx.code.toLowerCase();
  const file = (body: BodyInit, type: string, filename: string) =>
    new Response(body, { headers: { "content-type": type, "content-disposition": `attachment; filename="${filename}"` } });

  if (kind === "transcript") {
    const events = await listEvents({ rfxId: rfx.id, limit: 2000 });
    return file(transcriptMarkdown({ title: `${rfx.code} ${rfx.title}`, subtitle: `Workspace: ${user.email}`, events }), "text/markdown; charset=utf-8", `${name}-transcript.md`);
  }
  if (kind === "award") {
    const awardId = new URL(req.url).searchParams.get("award");
    const a = await one<{ note_md: string }>("select note_md from awards where id = $1 and rfx_id = $2", [awardId, rfx.id]);
    if (!a) return new Response("Not found.", { status: 404 });
    return file(a.note_md, "text/markdown; charset=utf-8", `${name}-award.md`);
  }
  const cmp = await loadComparison(rfx);
  if (kind === "csv") return file(comparisonCsv(cmp), "text/csv; charset=utf-8", `${name}-comparison.csv`);
  if (kind === "xlsx") return file(new Uint8Array(comparisonXlsx(cmp)), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", `${name}-comparison.xlsx`);
  return new Response("Unknown export.", { status: 400 });
}
