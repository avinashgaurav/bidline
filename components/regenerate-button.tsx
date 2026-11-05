"use client";

import { useActionState } from "react";
import { regenerateTokenAction, type FormState } from "@/app/actions";
import { FormMessage, SubmitButton } from "@/components/form-bits";

export function RegenerateButton() {
  const [state, action] = useActionState<FormState, FormData>(async () => regenerateTokenAction(), {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <SubmitButton variant="outline" size="sm">Replace link</SubmitButton>
      <span className="text-xs text-ink-secondary">Use this if the link was shared by mistake. The old link will stop working.</span>
      <FormMessage state={state} />
    </form>
  );
}
