import { redirect } from "next/navigation";
import { acceptInvite, currentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** An invite link for someone who already has an account: sign in, then join. */
export default async function InvitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/invite/${id}`)}`);
  const ws = await acceptInvite(user.id, id);
  redirect(ws ? "/?joined=1" : "/?invite=invalid");
}
