"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, signupAction, type FormState } from "@/app/actions";
import { Field, FormMessage, SubmitButton } from "@/components/form-bits";

/** Auth fields run a little taller than in-app fields: this is the first thing a buyer touches. */
const inputClass =
  "h-11 w-full rounded-[10px] border border-input bg-card px-3.5 text-[15px] text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground hover:border-[#c9c9d6] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25";

export function AuthForm({ mode, defaultEmail }: { mode: "login" | "signup"; defaultEmail?: string }) {
  const [state, action] = useActionState<FormState, FormData>(mode === "login" ? loginAction : signupAction, {});
  return (
    <form action={action} className="grid gap-5">
      {mode === "signup" ? (
        <Field label="Your name">
          <input name="name" className={inputClass} autoComplete="name" placeholder="Ananya Kulkarni" />
        </Field>
      ) : null}
      <Field label="Work email">
        <input
          name="email"
          type="email"
          required
          className={inputClass}
          autoComplete="email"
          placeholder="you@company.com"
          defaultValue={defaultEmail}
        />
      </Field>
      <Field label="Password" hint={mode === "signup" ? "At least 8 characters." : undefined}>
        <input name="password" type="password" required className={inputClass} autoComplete={mode === "login" ? "current-password" : "new-password"} />
      </Field>
      <FormMessage state={state} />
      <SubmitButton size="lg" className="mt-1 h-11 w-full">{mode === "login" ? "Sign in" : "Create account"}</SubmitButton>
      <p className="border-t border-border pt-5 text-center text-sm text-ink-secondary">
        {mode === "login" ? (
          <>New to Bidline? <Link className="text-primary underline-offset-4 hover:underline" href="/signup">Create an account</Link></>
        ) : (
          <>Already have an account? <Link className="text-primary underline-offset-4 hover:underline" href="/login">Sign in</Link></>
        )}
      </p>
    </form>
  );
}
