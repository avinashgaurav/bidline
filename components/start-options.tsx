"use client";

import { useActionState } from "react";
import { createRfxUI, loadDemoAction, type FormState } from "@/app/actions";
import { Field, FormMessage, SubmitButton, fieldClass } from "@/components/form-bits";

export function DemoButton({ label = "Load the demo event", variant = "default" }: { label?: string; variant?: "default" | "outline" }) {
  const [state, action] = useActionState<FormState, FormData>(async () => loadDemoAction(), {});
  return (
    <form action={action} className="grid gap-2">
      <SubmitButton variant={variant}>{label}</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function NewRfxForm() {
  const [state, action] = useActionState<FormState, FormData>(createRfxUI, {});
  return (
    <form action={action} className="grid gap-3">
      <Field label="What are you buying?">
        <input name="title" required className={fieldClass} placeholder="Office laptops refresh, Q1" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Due date">
          <input name="dueDate" type="date" className={fieldClass} />
        </Field>
        <Field label="Approver">
          <input name="approver" className={fieldClass} placeholder="CFO name" />
        </Field>
      </div>
      <FormMessage state={state} />
      <SubmitButton variant="outline">Create event</SubmitButton>
    </form>
  );
}
