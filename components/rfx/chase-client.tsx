"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, CircleDot, Clock, Mail, Send } from "lucide-react";
import { markChaseUI, recordChaseUI, type FormState } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/copy-button";
import { FormMessage, areaClass, fieldClass } from "@/components/form-bits";
import { Tip } from "@/components/tip";
import { inr } from "@/lib/view";

export interface SupplierFollowUp {
  code: string; name: string; email: string | null;
  items: Array<{ ask: string; why: string; atRiskInr: number; dispute: boolean }>;
  atRiskInr: number;
  resolved: string[];
  state: "overdue" | "waiting" | "missing" | "clear";
  draft: { subject: string; body: string } | null;
  history: Array<{ id: string; sent_at: string; due_at: string | null; answered_at: string | null; created_by: string; message: string; subject: string | null; how: string; items: string[] }>;
}

const STATE: Record<SupplierFollowUp["state"], { label: string; cls: string; icon: React.ComponentType<{ className?: string }>; rank: number }> = {
  overdue: { label: "Reply overdue", cls: "text-destructive", icon: AlertTriangle, rank: 0 },
  missing: { label: "Needs a follow-up", cls: "text-warning", icon: CircleDot, rank: 1 },
  waiting: { label: "Waiting for reply", cls: "text-primary", icon: Clock, rank: 2 },
  clear: { label: "Nothing missing", cls: "text-success", icon: CheckCircle2, rank: 3 },
};
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "n/a");

/**
 * Follow-ups as a list of suppliers and one open supplier. What is still
 * missing sits beside the email that asks for it, with the send button on top,
 * so nothing needs scrolling to find.
 */
export function FollowUpsBoard({ rfxId, suppliers, emailReady, demo, canEdit }: {
  rfxId: string; suppliers: SupplierFollowUp[]; emailReady: boolean; demo: boolean; canEdit: boolean;
}) {
  const sorted = useMemo(() => [...suppliers].sort((a, b) => STATE[a.state].rank - STATE[b.state].rank || b.atRiskInr - a.atRiskInr), [suppliers]);
  const [sel, setSel] = useState(sorted[0]?.code ?? "");
  const s = sorted.find((x) => x.code === sel) ?? sorted[0];
  if (!s) return <p className="rounded-xl bg-card px-4 py-8 text-center text-[14px] text-ink-secondary ring-1 ring-border">Add suppliers first. Follow-ups list what each one still owes you.</p>;
  const counts = { missing: suppliers.filter((x) => x.state === "missing" || x.state === "overdue").length, waiting: suppliers.filter((x) => x.state === "waiting").length };

  return (
    <div className="@container grid gap-3">
      <p className="text-[13px] text-ink-secondary">
        {counts.missing ? `${counts.missing} supplier${counts.missing === 1 ? " needs" : "s need"} a follow-up` : "No supplier needs a follow-up"}
        {counts.waiting ? `, ${counts.waiting} waiting for a reply` : ""}. Bidline resolves unit and currency differences itself, so suppliers are only asked what it cannot work out.
      </p>
      <div className="grid gap-3 @3xl:grid-cols-[220px_minmax(0,1fr)]">
        <ul className="flex content-start gap-1 overflow-x-auto rounded-xl bg-card p-1.5 ring-1 ring-border @3xl:grid" role="listbox" aria-label="Suppliers">
          {sorted.map((x) => {
            const st = STATE[x.state];
            const on = x.code === s.code;
            return (
              <li key={x.code} className="min-w-[200px] @3xl:min-w-0">
                <button role="option" aria-selected={on} onClick={() => setSel(x.code)}
                  className={`flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${on ? "bg-secondary" : "hover:bg-muted"}`}>
                  <st.icon className={`mt-0.5 size-4 shrink-0 ${st.cls}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium">{x.code} {x.name}</span>
                    <span className={`block text-[12px] ${st.cls}`}>{st.label}{x.items.length ? ` · ${x.items.length} item${x.items.length === 1 ? "" : "s"}` : ""}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <section key={s.code} className="grid content-start gap-3 rounded-xl bg-card p-4 ring-1 ring-border motion-safe:animate-in motion-safe:fade-in-0 sm:p-5">
          <header className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-[17px] font-medium">{s.code} {s.name}</h3>
              <p className="text-[13px] text-ink-secondary">
                {s.items.length ? `${s.items.length} thing${s.items.length === 1 ? "" : "s"} still missing` : "Has given everything asked for"}
                {s.atRiskInr ? <> · <Tip text="The value of lines that cannot be compared until this supplier answers."><span tabIndex={0} className="num underline decoration-dotted underline-offset-2">{inr(s.atRiskInr)}</span></Tip> waiting on answers</> : null}
              </p>
            </div>
            <span className={`inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[12px] ${STATE[s.state].cls}`}>{STATE[s.state].label}</span>
          </header>

          <div className="@container/d grid gap-4 @5xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
            <div className="grid content-start gap-3">
              <div>
                <p className="mb-1.5 text-[12px] font-medium text-ink-secondary">Not answered yet</p>
                {s.items.length ? (
                  <ul className="grid max-h-[360px] gap-1.5 overflow-y-auto pr-1 [scrollbar-width:thin]">
                    {s.items.map((it, i) => (
                      <li key={i} className={`rounded-lg p-2.5 text-[13.5px] ${it.dispute ? "cell-review" : "bg-muted"}`}>
                        <p>{it.ask}</p>
                        <p className="mt-0.5 text-[12px] text-ink-secondary">{it.why}{it.atRiskInr ? ` · about ${inr(it.atRiskInr)} affected` : ""}</p>
                      </li>
                    ))}
                  </ul>
                ) : <p className="flex items-center gap-2 rounded-lg bg-success/5 p-2.5 text-[13.5px] text-success"><CheckCircle2 className="size-4" /> Nothing outstanding.</p>}
              </div>
              {s.resolved.length ? (
                <div>
                  <p className="mb-1 text-[12px] font-medium text-ink-secondary">Worked out by Bidline, not asked</p>
                  <ul className="grid gap-1 text-[12.5px] text-ink-secondary">{s.resolved.map((r) => <li key={r}>{r}</li>)}</ul>
                </div>
              ) : null}
              {s.history.length ? <History rfxId={rfxId} history={s.history} canEdit={canEdit} /> : null}
            </div>

            {s.draft && canEdit ? (
              <ChaseForm rfxId={rfxId} supplier={s.code} subject={s.draft.subject} body={s.draft.body} to={s.email} emailReady={emailReady} demo={demo} />
            ) : s.draft ? (
              <div className="rounded-xl bg-muted/60 p-4 text-[13px] text-ink-secondary">A buyer can send the follow-up email from here.</div>
            ) : (
              <div className="grid place-items-center rounded-xl bg-muted/40 p-6 text-center text-[13.5px] text-ink-secondary">
                <Mail className="mb-2 size-5" />No email needed. If this supplier sends something new, upload it in Documents and ask Claude to read it.
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function History({ rfxId, history, canEdit }: { rfxId: string; history: SupplierFollowUp["history"]; canEdit: boolean }) {
  return (
    <div>
      <p className="mb-1.5 text-[12px] font-medium text-ink-secondary">Sent before</p>
      <ul className="grid gap-1.5">
        {history.map((c) => {
          const overdue = !c.answered_at && c.due_at && new Date(c.due_at) < new Date();
          return (
            <li key={c.id}>
              <details className="group rounded-lg ring-1 ring-border">
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-2.5 py-2 text-[12.5px]">
                  <ChevronDown className="size-3.5 text-ink-secondary transition group-open:rotate-180" />
                  <span>{fmt(c.sent_at)}, reply by {fmt(c.due_at)}</span>
                  <span className={`rounded-full px-2 py-px text-[11.5px] ${c.answered_at ? "bg-success/10 text-success" : overdue ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning"}`}>
                    {c.answered_at ? "Answered" : overdue ? "Overdue" : "Awaiting reply"}
                  </span>
                  <span className="ml-auto text-ink-secondary">{c.created_by === "claude" ? "By Claude" : "In the app"}</span>
                </summary>
                <div className="grid gap-2 border-t border-border p-2.5">
                  <p className="text-[12px] text-ink-secondary">{c.how}</p>
                  {c.items.length ? <ul className="list-disc pl-5 text-[12.5px]">{c.items.map((x, i) => <li key={i}>{x}</li>)}</ul> : null}
                  <pre className="max-h-48 overflow-y-auto rounded-lg bg-muted p-2.5 font-sans text-[12.5px] whitespace-pre-wrap">{c.message}</pre>
                  <div className="flex gap-2"><CopyButton text={c.message} label="Copy" />{canEdit ? <AnsweredToggle rfxId={rfxId} chaseId={c.id} answered={Boolean(c.answered_at)} /> : null}</div>
                </div>
              </details>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function ChaseForm({ rfxId, supplier, subject, body, to, emailReady, demo }: {
  rfxId: string; supplier: string; subject: string; body: string; to: string | null; emailReady: boolean; demo: boolean;
}) {
  const [state, action] = useActionState<FormState, FormData>(recordChaseUI.bind(null, rfxId, supplier), {});
  const [text, setText] = useState(body);
  return (
    <form action={action} className="grid content-start gap-2.5 rounded-xl bg-muted/50 p-3 ring-1 ring-border">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto flex items-center gap-1.5 text-[13.5px] font-medium"><Mail className="size-4 text-primary" /> Follow-up email</p>
        {emailReady ? (
          <button name="intent" value="send" className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-[13px] text-white hover:bg-primary/90"><Send className="size-3.5" /> Send email</button>
        ) : (
          <Tip text="Connect your mailbox in Settings to send from Bidline. Until then, copy the email into your own mail or WhatsApp and record it here.">
            <a href="/settings#email" className="inline-flex h-8 items-center rounded-lg bg-card px-3 text-[13px] ring-1 ring-border hover:bg-muted">Connect email to send</a>
          </Tip>
        )}
        <CopyButton text={text} label="Copy" />
        <button name="intent" value="record" className="inline-flex h-8 items-center rounded-lg px-2.5 text-[13px] text-ink-secondary hover:bg-card">Record as sent</button>
      </div>
      <FormMessage state={state} />
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_150px]">
        <label className="grid gap-1 text-[12px] text-ink-secondary">To
          <input name="to" type="email" defaultValue={to ?? ""} placeholder="supplier@company.com" className={`${fieldClass} h-8 text-[13px]`} disabled={demo} />
        </label>
        <label className="grid gap-1 text-[12px] text-ink-secondary">Reply by
          <input name="dueDate" type="date" className={`${fieldClass} h-8 text-[13px]`} />
        </label>
      </div>
      {demo ? <p className="-mt-1 text-[11.5px] text-ink-secondary">Demo suppliers are fictional, so a demo follow-up goes to your own address.</p> : null}
      <label className="grid gap-1 text-[12px] text-ink-secondary">Subject
        <input name="subject" defaultValue={subject} className={`${fieldClass} h-8 text-[13px]`} />
      </label>
      <label className="grid gap-1 text-[12px] text-ink-secondary">Message
        <textarea name="message" rows={12} value={text} onChange={(e) => setText(e.target.value)} className={`${areaClass} text-[13px] leading-relaxed`} />
      </label>
    </form>
  );
}

export function AnsweredToggle({ rfxId, chaseId, answered }: { rfxId: string; chaseId: string; answered: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Button size="xs" variant="outline" disabled={pending} onClick={() => start(async () => { await markChaseUI(rfxId, chaseId, !answered); })}>
      {answered ? "Mark unanswered" : "Mark answered"}
    </Button>
  );
}
