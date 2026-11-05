"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, signupAction, type FormState } from "@/app/actions";
import { Field, FormMessage, SubmitButton, fieldClass } from "@/components/form-bits";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const [state, action] = useActionState<FormState, FormData>(mode === "login" ? loginAction : signupAction, {});
  return (
    <form action={action} className="grid gap-4">
      {mode === "signup" ? (
        <Field label="Your name">
          <input name="name" className={fieldClass} autoComplete="name" placeholder="Ananya Kulkarni" />
        </Field>
      ) : null}
      <Field label="Work email">
        <input name="email" type="email" required className={fieldClass} autoComplete="email" placeholder="you@company.com" />
      </Field>
      <Field label="Password" hint={mode === "signup" ? "At least 8 characters." : undefined}>
        <input name="password" type="password" required className={fieldClass} autoComplete={mode === "login" ? "current-password" : "new-password"} />
      </Field>
      <FormMessage state={state} />
      <SubmitButton size="lg" className="w-full">{mode === "login" ? "Sign in" : "Create account"}</SubmitButton>
      <p className="text-center text-sm text-ink-secondary">
        {mode === "login" ? (
          <>New to Bidline? <Link className="text-primary hover:underline" href="/signup">Create an account</Link></>
        ) : (
          <>Already have an account? <Link className="text-primary hover:underline" href="/login">Sign in</Link></>
        )}
      </p>
    </form>
  );
}
