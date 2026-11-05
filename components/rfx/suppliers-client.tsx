"use client";

import { useActionState } from "react";
import { addSupplierUI, updateSupplierUI, type FormState } from "@/app/actions";
import { Field, FormMessage, SubmitButton, fieldClass } from "@/components/form-bits";

export function AddSupplierForm({ rfxId }: { rfxId: string }) {
  const [state, action] = useActionState<FormState, FormData>(addSupplierUI.bind(null, rfxId), {});
  return (
    <form action={action} className="grid gap-3 md:grid-cols-3">
      <Field label="Company"><input name="name" required className={fieldClass} /></Field>
      <Field label="Contact"><input name="contactName" className={fieldClass} /></Field>
      <Field label="Email"><input name="email" type="email" className={fieldClass} /></Field>
      <Field label="City"><input name="city" className={fieldClass} /></Field>
      <Field label="Phone"><input name="phone" className={fieldClass} /></Field>
      <div className="flex items-end gap-3"><SubmitButton>Add supplier</SubmitButton><FormMessage state={state} /></div>
    </form>
  );
}

export function EditSupplierForm({ rfxId, s }: { rfxId: string; s: { id: string; name: string; city: string | null; status: string; contact: Record<string, unknown> } }) {
  const [state, action] = useActionState<FormState, FormData>(updateSupplierUI.bind(null, rfxId, s.id), {});
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <Field label="Contact"><input name="contactName" defaultValue={String(s.contact.name ?? "")} className={fieldClass} /></Field>
      <Field label="Email"><input name="email" defaultValue={String(s.contact.email ?? "")} className={fieldClass} /></Field>
      <Field label="Phone"><input name="phone" defaultValue={String(s.contact.phone ?? "")} className={fieldClass} /></Field>
      <Field label="Status">
        <select name="status" defaultValue={s.status} className={fieldClass}>
          <option value="invited">Invited</option><option value="responded">Responded</option>
          <option value="declined">Declined</option><option value="removed">Removed</option>
        </select>
      </Field>
      <div className="flex items-center gap-3 sm:col-span-2"><SubmitButton size="sm" variant="secondary">Save</SubmitButton><FormMessage state={state} /></div>
    </form>
  );
}
