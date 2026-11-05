import { redirect } from "next/navigation";
import { UserPlus } from "lucide-react";
import { currentUser } from "@/lib/auth";
import { AuthForm } from "@/components/auth-form";

export const metadata = { title: "Create account · Bidline" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  if (await currentUser()) redirect("/");
  const params = await searchParams;
  // Team invites link here as /signup?email=...&invited=1. Both only change what is shown.
  const email = typeof params.email === "string" ? params.email.trim().slice(0, 254) : undefined;
  const invited = params.invited === "1" || typeof params.invite === "string";
  return (
    <>
      <h1 className="text-[28px] leading-tight">Create your Bidline account</h1>
      <p className="mt-2 mb-8 text-[15px] leading-relaxed text-ink-secondary">
        Next, connect your own Claude and bring in your first supplier quotes.
      </p>
      {invited ? (
        <p className="-mt-3 mb-7 flex items-start gap-2.5 rounded-[10px] bg-lavender px-3.5 py-3 text-sm leading-relaxed text-foreground">
          <UserPlus aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" strokeWidth={1.75} />
          <span>You have been invited to a Bidline workspace. Create your account to join.</span>
        </p>
      ) : null}
      <AuthForm mode="signup" defaultEmail={email || undefined} invite={typeof params.invite === "string" ? params.invite.slice(0, 64) : undefined} />
    </>
  );
}
