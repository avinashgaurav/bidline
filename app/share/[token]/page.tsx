import { notFound } from "next/navigation";
import { one } from "@/lib/db";
import { Logo } from "@/components/brand";
import { Markdown } from "@/components/markdown";
import { DecisionForm } from "@/components/decision-form";

export const metadata = { title: "Award approval · Bidline", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

interface AwardShare {
  note_md: string; status: string; decided_by: string | null; decided_at: string | null; decision_note: string | null;
  created_at: string; snapshot: { totalInr: number; label: string; linesAwarded: number; linesInRfx: number };
  code: string; title: string; approver: { name?: string } | null; buyer: { name?: string; company?: string } | null;
}

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{16,}$/.test(token)) notFound();
  const a = await one<AwardShare>(
    `select a.note_md, a.status, a.decided_by, a.decided_at, a.decision_note, a.created_at, a.snapshot,
            r.code, r.title, r.approver, r.buyer
       from awards a join rfx r on r.id = a.rfx_id where a.share_token = $1 or a.id = (select award_id from award_steps where token = $1)`,
    [token],
  );
  if (!a) notFound();
  const decided = a.status !== "sent";
  // Old links for a later approval step: those steps are decided signed in to Bidline.
  const laterStep = await one<{ step: number }>("select step from award_steps where token = $1 and step > 0", [token]);
  return (
    <div className="min-h-screen">
      <header className="bg-night text-on-dark">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <Logo dark />
          <span className="text-sm text-fog">Award approval</span>
        </div>
      </header>
      <main className="mx-auto grid max-w-5xl gap-6 px-6 py-8 lg:grid-cols-[1fr_320px]">
        <article className="rounded-xl bg-card p-8 ring-1 ring-border">
          <p className="eyebrow">{a.code}{a.buyer?.name ? ` · prepared by ${a.buyer.name}` : ""}</p>
          <div className="mt-3"><Markdown text={a.note_md} /></div>
        </article>
        <aside className="grid h-fit gap-4">
          <div className="rounded-xl bg-lavender p-6">
            <p className="text-xs text-ink-secondary">{a.snapshot.label}</p>
            <p className="num mt-1 text-[28px] leading-none">₹{Math.round(a.snapshot.totalInr).toLocaleString("en-IN")}</p>
            <p className="mt-2 text-sm text-ink-secondary">{a.snapshot.linesAwarded} of {a.snapshot.linesInRfx} line items, ex-GST. Bidline calculated every figure from the suppliers&apos; documents.</p>
          </div>
          <div className="rounded-xl bg-card p-6 ring-1 ring-border">
            {decided ? (
              <div className="grid gap-2 text-sm">
                <p className="eyebrow">{a.status === "withdrawn" ? "Withdrawn" : a.status === "expired" ? "Expired" : "Decision"}</p>
                <p className="text-[18px] capitalize">{a.status === "withdrawn" ? "The buyer withdrew this award" : a.status === "expired" ? "This approval request expired" : a.status.replace(/_/g, " ")}</p>
                <p className="text-ink-secondary">
                  {a.status === "withdrawn" ? "No decision is needed. A revised award will come with a new link." : a.status === "expired" ? (a.decision_note ?? "No decision is needed. A fresh request will come with a new link.") : `by ${a.decided_by}`}
                  {" "}on {a.decided_at ? new Date(a.decided_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : ""}
                </p>
                {a.decision_note ? <p>&ldquo;{a.decision_note}&rdquo;</p> : null}
              </div>
            ) : (
              laterStep ? (
                <p className="text-[14px] text-ink-secondary">This approval step is decided signed in to Bidline. <a href="/login" className="text-primary hover:underline">Sign in</a> and open the event&apos;s Award step.</p>
              ) : (
                <>
                  <p className="eyebrow mb-3">Your decision</p>
                  <DecisionForm token={token} approverName={a.approver?.name ?? ""} />
                </>
              )
            )}
          </div>
        </aside>
      </main>
    </div>
  );
}
