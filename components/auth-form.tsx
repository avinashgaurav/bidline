"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { loginAction, signupAction, type FormState } from "@/app/actions";
import { Field, FormMessage, SubmitButton } from "@/components/form-bits";

/** Auth fields run a little taller than in-app fields: this is the first thing a buyer touches. */
const inputClass =
  "h-11 w-full rounded-[10px] border border-input bg-card px-3.5 text-[15px] text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground hover:border-[#c9c9d6] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25";

export function AuthForm({ mode, defaultEmail, invite, next }: { mode: "login" | "signup"; defaultEmail?: string; invite?: string; next?: string }) {
  const [state, action] = useActionState<FormState, FormData>(mode === "login" ? loginAction : signupAction, {});
  const [show, setShow] = useState(false);
  return (
    <form action={action} className="grid gap-5">
      {invite ? <input type="hidden" name="invite" value={invite} /> : null}
      {next ? <input type="hidden" name="next" value={next} /> : null}
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
        <span className="relative block">
          <input name="password" type={show ? "text" : "password"} required className={`${inputClass} pr-16`} autoComplete={mode === "login" ? "current-password" : "new-password"} />
          <button type="button" onClick={() => setShow(!show)} aria-pressed={show} className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md px-2 py-1 text-[12.5px] text-ink-secondary hover:bg-muted hover:text-foreground">{show ? "Hide" : "Show"}</button>
        </span>
      </Field>
      <FormMessage state={state} />
      <SubmitButton size="lg" className="mt-1 h-11 w-full" pendingLabel={mode === "login" ? "Signing in..." : "Creating your account..."}>{mode === "login" ? "Sign in" : "Create account"}</SubmitButton>
      {mode === "login" ? <p className="-mt-2 text-center text-[13px] text-ink-secondary">Forgot your password? Ask an admin of your workspace to send you a new invite.</p> : null}
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
