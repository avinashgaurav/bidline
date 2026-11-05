import type { Comparison } from "@/lib/comparison";
import type { GateIssue } from "@/lib/rfx";
import { AddLine, HeaderForm, IssueForm, LineRow } from "./lines-client";

export function LinesTab({ cmp, gate }: { cmp: Comparison; gate: GateIssue[] }) {
  const r = cmp.rfx;
  const approver = (r.approver ?? {}) as { name?: string; email?: string };
  const flagged = new Map(gate.map((g) => [g.lineNo, `${g.issue}. Fix: ${g.fix}`]));
  const lastGroup = cmp.lines.at(-1)?.group ?? "";
  return (
    <div className="grid gap-6">
      <section className="rounded-xl bg-card p-6 ring-1 ring-border">
        <p className="eyebrow mb-3">Event details</p>
        <HeaderForm rfxId={r.id} title={r.title} eventType={r.event_type} due={r.due_at ? r.due_at.slice(0, 10) : ""} status={r.status} approverName={approver.name ?? ""} approverEmail={approver.email ?? ""} />
      </section>
      <section className="rounded-xl bg-card ring-1 ring-border">
        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <p className="eyebrow">Line items</p>
            <p className="mt-1 text-sm text-ink-secondary">
              {gate.length ? `${gate.length} line item${gate.length === 1 ? " is" : "s are"} not specific enough for like-for-like quotes. Fix before you issue the event.` : "All line items are fully specified."}
              {" "}Changes here update the comparison and are recorded in the activity log.
            </p>
          </div>
          <IssueForm rfxId={r.id} gateCount={gate.length} issued={Boolean(r.issued_at)} />
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[980px]">
            <div className="grid grid-cols-[40px_110px_1fr_120px_70px_80px_110px_auto] gap-2 bg-[var(--grid-head)] px-4 py-2 text-xs text-ink-secondary">
              <span>#</span><span>SKU</span><span>Item and specification</span><span>Unit</span><span>Pack size</span><span>Qty</span><span>Budget ₹/unit</span><span />
            </div>
            {cmp.lines.map((l) => <LineRow key={l.no} rfxId={r.id} line={l} flagged={flagged.get(l.no) ?? null} />)}
            <AddLine rfxId={r.id} group={lastGroup} />
          </div>
        </div>
      </section>
    </div>
  );
}
