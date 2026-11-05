"use client";

import { EditedTag, type Edit } from "@/components/edited-tag";
import { useActionState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { issueRfxUI, removeLineUI, saveLineUI, updateRfxUI, type FormState } from "@/app/actions";
import { Field, FormMessage, SubmitButton, fieldClass } from "@/components/form-bits";

type Line = { no: number; sku: string; group: string; desc: string; uom: string; pack_size: number; qty: number; baseline_inr: number };

export function LineRow({ rfxId, line, flagged, edits }: { rfxId: string; line: Line; flagged: string | null; edits?: Edit[] }) {
  const [state, action] = useActionState<FormState, FormData>(saveLineUI.bind(null, rfxId), {});
  const [removing, startRemove] = useTransition();
  return (
    <form action={action} className={`grid grid-cols-[40px_110px_1fr_120px_70px_80px_110px_auto] items-start gap-2 border-t border-border px-4 py-2 ${flagged ? "bg-[var(--cell-review-bg)]" : ""}`}>
      <input type="hidden" name="no" value={line.no} />
      <input type="hidden" name="group" value={line.group} />
      <span className="num pt-2 text-sm text-ink-secondary">{line.no}</span>
      <input name="sku" defaultValue={line.sku} className={`${fieldClass} h-8 text-xs`} aria-label="SKU" />
      <div className="grid gap-1">
        <input name="description" defaultValue={line.desc} className={`${fieldClass} h-8 text-xs`} aria-label="Description" />
        {flagged ? <span className="text-xs text-warning">{flagged}</span> : null}
        <EditedTag edits={edits} label={`line ${line.no}`} />
        <FormMessage state={state} />
      </div>
      <input name="uom" defaultValue={line.uom} className={`${fieldClass} h-8 text-xs`} aria-label="Unit" />
      <input name="packSize" defaultValue={line.pack_size} inputMode="numeric" className={`${fieldClass} h-8 text-xs`} aria-label="Pack size" />
      <input name="qty" defaultValue={line.qty} inputMode="numeric" className={`${fieldClass} h-8 text-xs`} aria-label="Quantity" />
      <input name="baselineInr" defaultValue={line.baseline_inr || ""} inputMode="decimal" className={`${fieldClass} h-8 text-xs`} aria-label="Budget unit price" />
      <div className="flex gap-1">
        <SubmitButton size="sm" variant="secondary">Save</SubmitButton>
        <Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove line ${line.no}`} disabled={removing}
          onClick={() => confirm(`Remove line ${line.no}? Supplier prices for this line are kept on record but excluded from the comparison.`) && startRemove(async () => { await removeLineUI(rfxId, line.no); })}>
          <Trash2 />
        </Button>
      </div>
    </form>
  );
}

export function AddLine({ rfxId, group }: { rfxId: string; group: string }) {
  const [state, action] = useActionState<FormState, FormData>(saveLineUI.bind(null, rfxId), {});
  return (
    <form action={action} className="grid grid-cols-[40px_110px_1fr_120px_70px_80px_110px_auto] items-start gap-2 border-t border-border bg-muted/50 px-4 py-3">
      <input type="hidden" name="group" value={group} />
      <span className="pt-2 text-xs text-ink-secondary">New</span>
      <input name="sku" placeholder="SKU" className={`${fieldClass} h-8 text-xs`} />
      <div className="grid gap-1">
        <input name="description" required placeholder="Item and key specification" className={`${fieldClass} h-8 text-xs`} />
        <FormMessage state={state} />
      </div>
      <input name="uom" required placeholder="nos, box of 10" className={`${fieldClass} h-8 text-xs`} />
      <input name="packSize" placeholder="1" inputMode="numeric" className={`${fieldClass} h-8 text-xs`} />
      <input name="qty" required placeholder="Qty" inputMode="numeric" className={`${fieldClass} h-8 text-xs`} />
      <input name="baselineInr" placeholder="Budget ₹" inputMode="decimal" className={`${fieldClass} h-8 text-xs`} />
      <SubmitButton size="sm">Add line</SubmitButton>
    </form>
  );
}

export function HeaderForm({ rfxId, title, eventType, due, status, approverName, approverEmail }: {
  rfxId: string; title: string; eventType: string; due: string; status: string; approverName: string; approverEmail: string;
}) {
  const [state, action] = useActionState<FormState, FormData>(updateRfxUI.bind(null, rfxId), {});
  return (
    <form action={action} className="grid gap-3 md:grid-cols-[2fr_1fr_1fr]">
      <Field label="Title"><input name="title" defaultValue={title} className={fieldClass} /></Field>
      <Field label="Due date"><input name="dueDate" type="date" defaultValue={due} className={fieldClass} /></Field>
      <Field label="Status">
        <select name="status" defaultValue={status} className={fieldClass}>
          {["draft", "issued", "evaluating", "awarded", "closed"].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </Field>
      <Field label="Type">
        <select name="eventType" defaultValue={eventType} className={fieldClass}>
          <option value="RFQ">RFQ: request for quotation</option>
          <option value="RFP">RFP: request for proposal</option>
          <option value="RFI">RFI: request for information</option>
          <option value="TENDER">Tender</option>
        </select>
      </Field>
      <Field label="Approver name"><input name="approverName" defaultValue={approverName} className={fieldClass} /></Field>
      <Field label="Approver email"><input name="approverEmail" defaultValue={approverEmail} className={fieldClass} /></Field>
      <div className="flex items-end gap-3"><SubmitButton variant="secondary">Save</SubmitButton><FormMessage state={state} /></div>
    </form>
  );
}

export function IssueForm({ rfxId, gateCount, issued }: { rfxId: string; gateCount: number; issued: boolean }) {
  const [state, action] = useActionState<FormState, FormData>(issueRfxUI.bind(null, rfxId), {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      {gateCount ? (
        <Field label={`To issue with ${gateCount} unclear line item${gateCount === 1 ? "" : "s"}, give a reason (shown in the award note)`}>
          <input name="overrideReason" className={`${fieldClass} min-w-[320px]`} placeholder="Suppliers confirmed pack sizes on the pre-bid call" />
        </Field>
      ) : null}
      <SubmitButton>{issued ? "Reissue to suppliers" : "Issue to suppliers"}</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
