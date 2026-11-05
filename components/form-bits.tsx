"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/app/actions";

export function SubmitButton({ children, variant = "default", size = "default", className }: {
  children: React.ReactNode; variant?: "default" | "secondary" | "outline" | "destructive" | "ghost"; size?: "default" | "sm" | "lg"; className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} size={size} disabled={pending} className={className}>
      {pending ? "Working..." : children}
    </Button>
  );
}

export function FormMessage({ state }: { state: FormState | undefined }) {
  if (!state?.error && !state?.message) return null;
  return (
    <p role={state.error ? "alert" : "status"} className={`text-sm ${state.error ? "text-destructive" : "text-success"}`}>
      {state.error ?? state.message}
    </p>
  );
}

export const fieldClass =
  "h-9 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30";
export const areaClass =
  "w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30";

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="text-ink-secondary">{label}</span>
      {children}
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  );
}
