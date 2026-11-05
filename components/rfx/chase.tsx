import type { Comparison } from "@/lib/comparison";
import { inr } from "@/lib/view";
import { CopyButton } from "@/components/copy-button";
import { AnsweredToggle, ChaseForm } from "./chase-client";

export function ChaseTab({ cmp }: { cmp: Comparison }) {
  return (
    <div className="grid gap-4">
      <p className="text-sm text-ink-secondary">Open items for each supplier, with the value at stake. Bidline resolves unit and currency differences itself, so suppliers are not asked about them. Bidline records follow-ups but does not send them. Copy the message into your email or WhatsApp.</p>
      {cmp.suppliers.map((s) => {
        const info = cmp.supplierInfo[s.code];
        const g = info.gaps;
        const history = cmp.chases.filter((c) => c.supplier_id === s.id);
        return (
          <section key={s.id} className="grid gap-4 rounded-xl bg-card p-6 ring-1 ring-border">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h3 className="text-[18px]">{s.code} {s.name}</h3>
              <span className="text-sm text-ink-secondary">{g.gapCount} open item{g.gapCount === 1 ? "" : "s"} · {g.disputeCount} discrepanc{g.disputeCount === 1 ? "y" : "ies"} · {inr(g.totalAtRiskInr)} at stake</span>
            </div>
            {g.items.length ? (
              <ul className="grid gap-2">
                {g.items.map((it, i) => (
                  <li key={i} className={`rounded-lg p-3 text-sm ${it.family === "dispute" ? "cell-review" : "bg-muted"}`}>
                    <p>{it.ask}</p>
                    <p className="mt-1 text-xs text-ink-secondary">{it.why}{it.atRiskInr ? ` · about ${inr(it.atRiskInr)} at stake` : ""}</p>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-success">Nothing outstanding.</p>}
            {g.resolvedWithoutAsking.length ? (
              <p className="text-xs text-ink-secondary">Resolved by Bidline: {g.resolvedWithoutAsking.map((r) => `${r.what} (lines ${r.lineNos.join(", ")})`).join("; ")}.</p>
            ) : null}
            {g.items.length ? <ChaseForm rfxId={cmp.rfx.id} supplier={s.code} /> : null}
            {history.length ? (
              <div className="grid gap-2">
                <p className="eyebrow">Follow-ups</p>
                {history.map((c) => (
                  <details key={c.id} className="rounded-lg border border-border p-3 text-sm">
                    <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                      <span>{new Date(c.sent_at).toLocaleDateString("en-IN", { dateStyle: "medium" })}, due {c.due_at ? new Date(c.due_at).toLocaleDateString("en-IN", { dateStyle: "medium" }) : "n/a"}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs ${c.answered_at ? "bg-success/10 text-success" : c.due_at && new Date(c.due_at) < new Date() ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning"}`}>
                        {c.answered_at ? "Answered" : c.due_at && new Date(c.due_at) < new Date() ? "Overdue" : "Awaiting reply"}
                      </span>
                      <span className="text-xs text-ink-secondary">{c.created_by === "claude" ? "Recorded by Claude" : "Recorded in the app"}</span>
                    </summary>
                    <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-muted p-3 font-sans text-sm">{c.message}</pre>
                    <div className="mt-2 flex gap-2"><CopyButton text={c.message} label="Copy message" /><AnsweredToggle rfxId={cmp.rfx.id} chaseId={c.id} answered={Boolean(c.answered_at)} /></div>
                  </details>
                ))}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
