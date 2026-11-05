"use client";

import { useActionState, useTransition } from "react";
import { markChaseUI, recordChaseUI, type FormState } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, SubmitButton, areaClass, fieldClass } from "@/components/form-bits";

export function ChaseForm({ rfxId, supplier }: { rfxId: string; supplier: string }) {
  const [state, action] = useActionState<FormState, FormData>(recordChaseUI.bind(null, rfxId, supplier), {});
  return (
    <form action={action} className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
        <Field label="Due date (default: 3 days)"><input name="dueDate" type="date" className={fieldClass} /></Field>
        <Field label="Message (leave blank to use Bidline's draft)"><textarea name="message" rows={2} className={areaClass} /></Field>
      </div>
      <div className="flex items-center gap-3"><SubmitButton size="sm">Record follow-up</SubmitButton><FormMessage state={state} /></div>
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
