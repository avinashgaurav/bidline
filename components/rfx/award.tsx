import type { Comparison } from "@/lib/comparison";
import { appUrlFromHeaders } from "@/lib/app-url";
import { inr } from "@/lib/view";
import { CopyButton } from "@/components/copy-button";
import { Markdown } from "@/components/markdown";
import { AwardForm } from "./award-client";
import { WithdrawAward } from "./edit-extras";

const STATUS: Record<string, string> = {
  sent: "bg-warning/10 text-warning", approved: "bg-success/10 text-success",
  rejected: "bg-destructive/10 text-destructive", changes_requested: "bg-warning/10 text-warning", withdrawn: "bg-muted text-ink-secondary",
};

export async function AwardTab({ cmp }: { cmp: Comparison }) {
  const base = await appUrlFromHeaders();
  const c = cmp.compliance;
  const options = [
    { label: c.naive.label, total: c.naive.totalInr, lines: c.naive.linesAwarded },
    ...(cmp.questions.length ? [{ label: c.compliant.label, total: c.compliant.totalInr, lines: c.compliant.linesAwarded }] : []),
    ...cmp.suppliers.map((s) => {
      const x = cmp.supplierInfo[s.code].single;
      return { label: `All lines to ${s.code} ${s.name}`, total: x.totalLevelDiscountApplied ? x.totalAfterStatedDiscountInr : x.totalInr, lines: x.linesPriced, note: x.totalLevelDiscountApplied ? `after the supplier's ${x.totalLevelDiscountPct}% discount` : x.totalLevelDiscountWithheldReason ?? "" };
    }),
  ];
  return (
    <div className="grid gap-4">
      <section className="rounded-xl bg-card p-4 ring-1 sm:p-5 ring-border">
        <p className="eyebrow">Award options</p>
        <table className="mt-3 w-full text-sm">
          <thead className="text-left text-xs text-ink-secondary"><tr><th className="py-2 font-medium">Award basis</th><th className="py-2 text-right font-medium">Total, ex-GST</th><th className="py-2 text-right font-medium">Lines covered</th></tr></thead>
          <tbody>
            {options.map((o) => (
              <tr key={o.label} className="border-t border-border">
                <td className="py-2">{o.label}{"note" in o && o.note ? <span className="block text-xs text-ink-secondary">{o.note}</span> : null}</td>
                <td className="num py-2 text-right">{inr(o.total)}</td>
                <td className="num py-2 text-right">{o.lines}/{cmp.lines.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {c.likeForLike.warning ? (
          <div className="mt-4 cell-review rounded-lg p-3 text-sm">
            <p>{c.likeForLike.warning}</p>
            <ul className="mt-1 list-disc pl-5">{c.likeForLike.scenarios.map((s) => <li key={s.key}>{s.label}: {inr(s.likeForLikeTotalInr)} on the {c.likeForLike.linesInCommonBasis} lines quoted by both</li>)}</ul>
          </div>
        ) : null}
      </section>
      <section className="rounded-xl bg-card p-4 ring-1 sm:p-5 ring-border">
        <p className="eyebrow mb-3">Draft award</p>
        <AwardForm rfxId={cmp.rfx.id} suppliers={cmp.suppliers.map((s) => ({ code: s.code, name: s.name }))} hasQuestions={cmp.questions.length > 0} />
      </section>
      {cmp.awards.map((a) => {
        const link = `${base}/share/${a.share_token}`;
        return (
          <section key={a.id} className="grid gap-4 rounded-xl bg-card p-4 ring-1 sm:p-5 ring-border">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="eyebrow">Award drafted {new Date(a.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} {a.created_by === "claude" ? "by Claude" : "in the app"}</p>
                <p className="mt-1 text-sm">{(a.snapshot as { label?: string }).label} · <span className="num">{inr((a.snapshot as { totalInr?: number }).totalInr ?? 0)}</span></p>
              </div>
              <span className="flex items-center gap-2">
                {a.status === "sent" ? <WithdrawAward rfxId={cmp.rfx.id} awardId={a.id} /> : null}
                <span className={`rounded-full px-3 py-1 text-xs capitalize ${STATUS[a.status] ?? "bg-muted"}`}>
                  {a.status === "sent" ? "Awaiting approval" : a.status.replace(/_/g, " ")}{a.decided_by ? ` by ${a.decided_by}` : ""}
                </span>
              </span>
            </div>
            {a.decision_note ? <p className="text-sm">{a.status === "withdrawn" ? "Reason for withdrawing" : "Approver's note"}: &ldquo;{a.decision_note}&rdquo;</p> : null}
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-muted px-3 py-2 text-xs">{link}</code>
              <CopyButton text={link} label="Copy approval link" />
              <a className="inline-flex h-8 items-center rounded-full bg-secondary px-3 text-[14px]" href={`/api/rfx/${cmp.rfx.id}/export/award?award=${a.id}`}>Download .md</a>
            </div>
            <details>
              <summary className="cursor-pointer text-sm text-primary">View award note</summary>
              <div className="mt-3"><Markdown text={a.note_md} /></div>
            </details>
          </section>
        );
      })}
    </div>
  );
}
