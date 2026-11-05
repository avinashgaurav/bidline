import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { AuthForm } from "@/components/auth-form";

export const metadata = { title: "Sign in · Bidline" };

export default async function LoginPage() {
  if (await currentUser()) redirect("/");
  return (
    <>
      <h1 className="text-[28px] leading-tight">Sign in to Bidline</h1>
      <p className="mt-2 mb-8 text-[15px] leading-relaxed text-ink-secondary">
        Your sourcing events, comparisons and approvals are where you left them.
      </p>
      <AuthForm mode="login" />
    </>
  );
}
