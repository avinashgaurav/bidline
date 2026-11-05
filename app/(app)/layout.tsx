import { requireUser } from "@/lib/auth";
import { logoutAction } from "@/app/actions";
import { Logo } from "@/components/brand";
import { SidebarNav } from "@/components/sidebar-nav";
import { LogOut } from "lucide-react";
import { Suspense } from "react";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const connected = Boolean(user.last_mcp_at);
  const initials = user.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="sticky top-0 hidden h-screen flex-col bg-night px-5 py-6 text-on-dark lg:flex">
        <div className="px-1"><Logo dark /></div>
        <div className="mt-8 overflow-y-auto"><Suspense><SidebarNav connected={connected} /></Suspense></div>
        <div className="mt-auto grid gap-3 border-t border-white/10 pt-4">
          <div className="flex items-center gap-3 px-1">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/10 text-xs">{initials}</span>
            <div className="min-w-0">
              <p className="truncate text-sm">{user.name}</p>
              <p className="truncate text-xs text-fog">{user.email}</p>
            </div>
          </div>
          <form action={logoutAction}>
            <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-fog hover:bg-white/5 hover:text-white">
              <LogOut className="size-4" /> Sign out
            </button>
          </form>
        </div>
      </aside>
      <header className="flex items-center gap-3 bg-night px-4 py-3 text-on-dark lg:hidden">
        <Logo dark />
        <div className="ml-auto min-w-0"><Suspense><SidebarNav connected={connected} compact /></Suspense></div>
        <form action={logoutAction}><button aria-label="Sign out" className="rounded-lg p-2 text-fog hover:text-white"><LogOut className="size-4" /></button></form>
      </header>
      <main className="min-w-0 px-4 py-6 sm:px-8 sm:py-8">
        <div className="mx-auto max-w-[1320px]">{children}</div>
      </main>
    </div>
  );
}
