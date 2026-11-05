import { redirect } from "next/navigation";

/** Admin now lives in Settings; old links keep working. */
export default async function AdminPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  redirect(`/settings?tab=${tab === "workspace" ? "organisation" : tab ?? "team"}`);
}
