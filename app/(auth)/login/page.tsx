import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { AuthForm } from "@/components/auth-form";

export const metadata = { title: "Sign in · Bidline" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  // Only an invite link may be the destination after signing in.
  const dest = next && /^\/invite\/[A-Za-z0-9_-]{8,64}$/.test(next) ? next : undefined;
  if (await currentUser()) redirect(dest ?? "/");
  return (
    <>
      <h1 className="text-[28px] leading-tight">Sign in to Bidline</h1>
      <p className="mt-2 mb-8 text-[15px] leading-relaxed text-ink-secondary">
        Your sourcing events, comparisons and approvals are where you left them.
      </p>
      <AuthForm mode="login" next={dest} />
    </>
  );
}
