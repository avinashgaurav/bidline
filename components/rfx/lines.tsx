import type { Comparison } from "@/lib/comparison";
import type { GateIssue, LineNote } from "@/lib/rfx";
import { ClaudeMark } from "@/components/claude-mark";
import { AddLine, HeaderForm, IssueForm, LineRow } from "./lines-client";
import { AddLineNote } from "./edit-extras";

export function LinesTab({ cmp, gate, notes, buyerName }: { cmp: Comparison; gate: GateIssue[]; notes: LineNote[]; buyerName: string }) {
  const r = cmp.rfx;
  const approver = (r.approver ?? {}) as { name?: string; email?: string };
  const flagged = new Map(gate.map((g) => [g.lineNo, `${g.issue}. Fix: ${g.fix}`]));
  const lastGroup = cmp.lines.at(-1)?.group ?? "";
  return (
    <div className="grid gap-4">
      <details className="group rounded-xl bg-card ring-1 ring-border" open={!cmp.lines.length}>
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 sm:px-5">
          <span className="text-[15px] font-medium">Event details</span>
          <span className="text-[13px] text-ink-secondary">Title, type, due date, status and approver</span>
          <span className="ml-auto text-[13px] text-primary group-open:hidden">Edit</span>
          <span className="ml-auto hidden text-[13px] text-ink-secondary group-open:inline">Close</span>
        </summary>
        <div className="border-t border-border p-4 sm:p-5">
        <HeaderForm rfxId={r.id} title={r.title} eventType={r.event_type} due={r.due_at ? r.due_at.slice(0, 10) : ""} status={r.status} approverName={approver.name ?? ""} approverEmail={approver.email ?? ""} />
        </div>
      </details>
      <section className="rounded-xl bg-card ring-1 ring-border">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
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
      {cmp.lines.length ? (
        <section className="grid gap-3 rounded-xl bg-card p-4 ring-1 ring-border sm:p-5">
          <div>
            <p className="text-[15px] font-medium">Notes on line items</p>
            <p className="text-[13px] text-ink-secondary">Reminders for you, colleagues and Claude. Notes never change a price, and each one is kept in the audit trail.</p>
          </div>
          {notes.length ? (
            <ul className="grid gap-2">
              {notes.map((n) => {
                const line = cmp.lines.find((l) => l.no === n.line_no);
                return (
                  <li key={n.id} className="grid gap-0.5 rounded-lg bg-muted px-3 py-2 text-sm">
                    <span className="flex flex-wrap items-center gap-x-2 text-[12px] text-ink-secondary">
                      <span className="num font-medium text-foreground">Line {n.line_no}</span>
                      {line ? <span className="max-w-[40ch] truncate">{line.desc}</span> : <span>(line removed)</span>}
                      <span aria-hidden>·</span>
                      <span className="inline-flex items-center gap-1">{n.actor === "claude" ? <><ClaudeMark className="size-3" />Claude</> : buyerName}</span>
                      <span aria-hidden>·</span>
                      <time className="num">{new Date(n.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</time>
                    </span>
                    <span>{n.text}</span>
                  </li>
                );
              })}
            </ul>
          ) : null}
          <AddLineNote rfxId={r.id} lines={cmp.lines.map((l) => ({ no: l.no, desc: l.desc }))} />
        </section>
      ) : null}
    </div>
  );
}
