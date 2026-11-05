import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { AuthForm } from "@/components/auth-form";

export const metadata = { title: "Sign in · Bidline" };

export default async function LoginPage() {
  if (await currentUser()) redirect("/");
  return (
    <>
      <h2 className="text-[28px]">Sign in</h2>
      <p className="mt-1 mb-6 text-sm text-ink-secondary">Sign in to see your sourcing events.</p>
      <AuthForm mode="login" />
    </>
  );
}
