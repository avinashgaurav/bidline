import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { logoutAction } from "@/app/actions";
import { Logo } from "@/components/brand";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="min-h-screen">
      <header className="bg-night text-on-dark">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-8 px-6">
          <Logo dark />
          <nav className="flex items-center gap-1 text-sm">
            <Link href="/" className="rounded-full px-4 py-2 hover:bg-white/10">RFQs</Link>
            <Link href="/connect" className="rounded-full px-4 py-2 hover:bg-white/10">Connect Claude</Link>
          </nav>
          <div className="ml-auto flex items-center gap-4 text-sm">
            <span className="hidden text-fog sm:inline">{user.email}</span>
            <form action={logoutAction}>
              <button className="rounded-full bg-white/10 px-4 py-2 hover:bg-white/20">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1440px] px-6 py-8">{children}</main>
    </div>
  );
}
