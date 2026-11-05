"use client";

import { useActionState } from "react";
import { addUnitRuleUI, resolveUnmappedUI, setFxUI, type FormState } from "@/app/actions";
import { Field, FormMessage, SubmitButton, fieldClass } from "@/components/form-bits";

export function FxForm({ rfxId }: { rfxId: string }) {
  const [state, action] = useActionState<FormState, FormData>(setFxUI.bind(null, rfxId), {});
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[90px_110px_1fr_auto] sm:items-end">
      <Field label="Currency"><input name="currency" required placeholder="USD" className={fieldClass} /></Field>
      <Field label="Rate in ₹"><input name="rate" required inputMode="decimal" placeholder="88.4" className={fieldClass} /></Field>
      <Field label="Source"><input name="source" placeholder="RBI reference rate, 18 Sep" className={fieldClass} /></Field>
      <SubmitButton size="sm">Save rate</SubmitButton>
      <div className="sm:col-span-4"><FormMessage state={state} /></div>
    </form>
  );
}

export function UnitRuleForm({ rfxId, uoms }: { rfxId: string; uoms: string[] }) {
  const [state, action] = useActionState<FormState, FormData>(addUnitRuleUI.bind(null, rfxId), {});
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[1fr_1fr_90px_1.4fr_auto] sm:items-end">
      <Field label="Supplier's unit"><input name="fromUom" required placeholder="per DIMM" className={fieldClass} /></Field>
      <Field label="RFQ unit">
        <select name="toUom" className={fieldClass}>{uoms.map((u) => <option key={u}>{u}</option>)}</select>
      </Field>
      <Field label="Factor"><input name="factor" required inputMode="decimal" placeholder="2" className={fieldClass} /></Field>
      <Field label="Basis"><input name="basis" placeholder="One kit = two 16GB DIMMs" className={fieldClass} /></Field>
      <SubmitButton size="sm">Add conversion</SubmitButton>
      <div className="sm:col-span-5"><FormMessage state={state} /></div>
    </form>
  );
}

export function UnmappedForm({ rfxId, itemId, lines }: { rfxId: string; itemId: string; lines: Array<{ no: number; desc: string }> }) {
  const [state, action] = useActionState<FormState, FormData>(resolveUnmappedUI.bind(null, rfxId, itemId), {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <select name="lineNo" className={`${fieldClass} h-8 w-auto text-xs`} aria-label="Map to line">
        <option value="">Exclude from comparison</option>
        {lines.map((l) => <option key={l.no} value={l.no}>Line {l.no}: {l.desc.slice(0, 50)}</option>)}
      </select>
      <input name="reason" placeholder="Reason" className={`${fieldClass} h-8 w-48 text-xs`} />
      <SubmitButton size="sm" variant="secondary">Save</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
