import type { Comparison } from "@/lib/comparison";
import { appUrlFromHeaders } from "@/lib/app-url";
import { inr } from "@/lib/view";
import { CopyButton } from "@/components/copy-button";
import { Markdown } from "@/components/markdown";
import { AwardForm } from "./award-client";
import { WithdrawAward } from "./edit-extras";
import { DecideAward } from "./event-actions";
import { stepsOf } from "@/lib/approvals";

const STATUS: Record<string, string> = {
  sent: "bg-warning/10 text-warning", approved: "bg-success/10 text-success",
  rejected: "bg-destructive/10 text-destructive", changes_requested: "bg-warning/10 text-warning", withdrawn: "bg-muted text-ink-secondary", expired: "bg-muted text-ink-secondary",
};

export async function AwardTab({ cmp, canEdit, canApprove }: { cmp: Comparison; canEdit: boolean; canApprove: boolean }) {
  const base = await appUrlFromHeaders();
  const steps = new Map(await Promise.all(cmp.awards.map(async (a) => [a.id, await stepsOf(a.id)] as const)));
  const c = cmp.compliance;
  // Only options that cover at least one line: a ₹0 option for 0 lines says nothing.
  const qualifiedReady = cmp.questions.length > 0 && c.compliant.linesAwarded > 0;
  const options = [
    { label: c.naive.label, total: c.naive.totalInr, lines: c.naive.linesAwarded },
    ...(qualifiedReady ? [{ label: c.compliant.label, total: c.compliant.totalInr, lines: c.compliant.linesAwarded }] : []),
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
            {options.filter((o) => o.lines > 0).map((o) => (
              <tr key={o.label} className="border-t border-border">
                <td className="py-2">{o.label}{"note" in o && o.note ? <span className="block text-xs text-ink-secondary">{o.note}</span> : null}</td>
                <td className="num py-2 text-right">{inr(o.total)}</td>
                <td className="num py-2 text-right">{o.lines}/{cmp.lines.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {cmp.questions.length && !qualifiedReady ? (
          <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-[13px] text-ink-secondary">The &ldquo;qualified suppliers only&rdquo; option appears once Claude has read the questionnaire answers and at least one supplier qualifies.</p>
        ) : null}
        {c.likeForLike.warning && c.likeForLike.linesInCommonBasis > 0 && qualifiedReady ? (
          <div className="mt-4 cell-review rounded-lg p-3 text-sm">
            <p>{c.likeForLike.warning}</p>
            <ul className="mt-1 list-disc pl-5">{c.likeForLike.scenarios.map((s) => <li key={s.key}>{s.label}: {inr(s.likeForLikeTotalInr)} on the {c.likeForLike.linesInCommonBasis} lines quoted by both</li>)}</ul>
          </div>
        ) : null}
      </section>
      {canEdit ? (
        <section className="rounded-xl bg-card p-4 ring-1 sm:p-5 ring-border">
          <p className="eyebrow mb-3">Draft award</p>
          <AwardForm rfxId={cmp.rfx.id} suppliers={cmp.suppliers.map((s) => ({ code: s.code, name: s.name }))} hasQuestions={qualifiedReady} />
        </section>
      ) : null}
      {cmp.awards.map((a) => {
        const link = `${base}/share/${a.share_token}`;
        const st = steps.get(a.id) ?? [];
        const waiting = st.find((x) => x.status === "sent");
        return (
          <section key={a.id} className="grid gap-4 rounded-xl bg-card p-4 ring-1 sm:p-5 ring-border">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="eyebrow">Award drafted {new Date(a.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} {a.created_by === "claude" ? "by Claude" : "in the app"}</p>
                <p className="mt-1 text-sm">{(a.snapshot as { label?: string }).label} · <span className="num">{inr((a.snapshot as { totalInr?: number }).totalInr ?? 0)}</span></p>
              </div>
              <span className="flex items-center gap-2">
                {a.status === "sent" && canEdit ? <WithdrawAward rfxId={cmp.rfx.id} awardId={a.id} /> : null}
                <span className={`rounded-full px-3 py-1 text-xs capitalize ${STATUS[a.status] ?? "bg-muted"}`}>
                  {a.status === "sent" ? "Awaiting approval" : a.status.replace(/_/g, " ")}{a.decided_by ? ` by ${a.decided_by}` : ""}
                </span>
              </span>
            </div>
            {(a.snapshot as { limitWarning?: string | null }).limitWarning ? (
              <p className="cell-review rounded-lg p-3 text-[13px]">{(a.snapshot as { limitWarning?: string }).limitWarning}</p>
            ) : null}
            {st.length ? (
              <ol className="grid gap-1.5 rounded-lg bg-muted/60 p-3 text-[13px]">
                <li className="text-[12px] text-ink-secondary">Approval in {st.length} steps (workspace thresholds)</li>
                {st.map((x) => (
                  <li key={x.id} className="flex flex-wrap items-center gap-2">
                    <span className="num grid size-5 place-items-center rounded-full bg-card text-[11px]">{x.step + 1}</span>
                    <span className="font-medium">{x.name}</span>{x.above_inr !== null ? <span className="text-ink-secondary">over {inr(Number(x.above_inr))}</span> : null}
                    <span className={`rounded-full px-2 py-px text-[11.5px] capitalize ${STATUS[x.status] ?? "bg-card text-ink-secondary"}`}>{x.status === "sent" ? "Deciding now" : x.status.replace(/_/g, " ")}</span>
                    {x.step > 0 && x.status === "sent" ? <span className="text-[12px] text-ink-secondary">Decided signed in to Bidline</span> : null}
                  </li>
                ))}
              </ol>
            ) : null}
            {a.status === "sent" && canApprove ? <DecideAward rfxId={cmp.rfx.id} awardId={a.id} stepLabel={waiting ? `step ${waiting.step + 1} of ${st.length}, as ${waiting.name}` : null} /> : null}
            {a.decision_note ? <p className="text-sm">{a.status === "withdrawn" ? "Reason for withdrawing" : a.status === "expired" ? "Expired" : "Approver's note"}: &ldquo;{a.decision_note}&rdquo;</p> : null}
            <div className="flex flex-wrap items-center gap-2">
              {(canEdit || canApprove) && a.status === "sent" ? (
                <>
                  <code className="min-w-0 flex-1 truncate rounded-lg bg-muted px-3 py-2 text-xs">{link}</code>
                  <CopyButton text={link} label="Copy approval link" />
                </>
              ) : <span className="flex-1" />}
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
