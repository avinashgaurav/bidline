"use client";

import { useActionState } from "react";
import { decideAwardUI, type FormState } from "@/app/actions";
import { Field, FormMessage, SubmitButton, areaClass, fieldClass } from "@/components/form-bits";

export function DecisionForm({ token, approverName }: { token: string; approverName: string }) {
  const [state, action] = useActionState<FormState, FormData>(decideAwardUI.bind(null, token), {});
  if (state.ok) return <p className="rounded-xl bg-success/10 p-4 text-success">{state.message}</p>;
  return (
    <form action={action} className="grid gap-3">
      <Field label="Your name"><input name="name" required defaultValue={approverName} className={fieldClass} /></Field>
      <Field label="Note to the buyer (optional)"><textarea name="note" rows={3} className={areaClass} /></Field>
      <FormMessage state={state} />
      <div className="flex flex-wrap gap-2">
        <button name="decision" value="approved" className="h-10 rounded-full bg-primary px-5 text-white hover:bg-primary/90">Approve</button>
        <button name="decision" value="changes_requested" className="h-10 rounded-full bg-secondary px-5 hover:bg-lavender">Request changes</button>
        <button name="decision" value="rejected" className="h-10 rounded-full bg-destructive/10 px-5 text-destructive hover:bg-destructive/20">Reject</button>
      </div>
      <SubmitButton className="hidden">Submit</SubmitButton>
    </form>
  );
}
