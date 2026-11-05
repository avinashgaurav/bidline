import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { AuthForm } from "@/components/auth-form";

export const metadata = { title: "Create account · Bidline" };

export default async function SignupPage() {
  if (await currentUser()) redirect("/");
  return (
    <>
      <h2 className="text-[28px]">Create your account</h2>
      <p className="mt-1 mb-6 text-sm text-ink-secondary">Then connect Claude and start comparing supplier quotes.</p>
      <AuthForm mode="signup" />
    </>
  );
}
