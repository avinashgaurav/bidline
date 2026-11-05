"use client";

import { useActionState, useTransition } from "react";
import { markChaseUI, recordChaseUI, type FormState } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, SubmitButton, areaClass, fieldClass } from "@/components/form-bits";

export function ChaseForm({ rfxId, supplier, subject, body, to, emailReady, demo }: {
  rfxId: string; supplier: string; subject: string; body: string; to: string | null; emailReady: boolean; demo: boolean;
}) {
  const [state, action] = useActionState<FormState, FormData>(recordChaseUI.bind(null, rfxId, supplier), {});
  return (
    <form action={action} className="grid gap-3 rounded-lg border border-border p-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_170px]">
        <Field label="To" hint={demo ? "Demo suppliers are fictional, so a demo follow-up is sent to your own address." : undefined}>
          <input name="to" type="email" defaultValue={to ?? ""} placeholder="supplier@company.com" className={fieldClass} disabled={demo} />
        </Field>
        <Field label="Reply by"><input name="dueDate" type="date" className={fieldClass} /></Field>
      </div>
      <Field label="Subject"><input name="subject" defaultValue={subject} className={fieldClass} /></Field>
      <Field label="Message"><textarea name="message" rows={9} defaultValue={body} className={`${areaClass} leading-relaxed`} /></Field>
      <div className="flex flex-wrap items-center gap-2">
        {emailReady ? (
          <SubmitButton size="sm"><span>Send email</span></SubmitButton>
        ) : (
          <a href="/settings#email" className="inline-flex h-8 items-center rounded-full bg-secondary px-3 text-[14px] hover:bg-lavender">Connect email to send from Bidline</a>
        )}
        <button name="intent" value="record" className="h-8 rounded-full px-3 text-[14px] text-ink-secondary hover:bg-muted">Record without sending</button>
        <input type="hidden" name="intent" value={emailReady ? "send" : "record"} />
        <FormMessage state={state} />
      </div>
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
