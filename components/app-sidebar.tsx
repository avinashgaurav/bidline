"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import {
  Archive, BarChart3, BellDot, BookOpen, Building2, ChevronDown, ChevronRight, History, Home, Lock, LogOut, Menu, Pin, PinOff, Plug,
  Search, Settings, Shield, Stamp, Star, Users, Wrench,
} from "lucide-react";
import { Logo } from "@/components/brand";
import { ClaudeMark } from "@/components/claude-mark";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tip } from "@/components/tip";
import { NotificationBell } from "@/components/notifications";
import { openCommandMenu } from "@/components/command-menu";
import { can, roleLabel } from "@/lib/roles";
import { EVENT_VIEWS, STAGE, inView } from "@/lib/stages";

export interface SidebarEvent {
  id: string; code: string; title: string; status: string; restricted: boolean; archived_at: string | null;
  needs_review: number; overdue_chases: number; starred: boolean;
  line_count: number; supplier_count: number; responded: number; doc_count: number; unread_docs: number;
  question_count: number; open_chases: number; award_status: string | null;
}

export interface SidebarProps {
  user: { name: string; email: string; role: string };
  workspace: { name: string };
  workspaces: Array<{ id: string; name: string; role: string }>;
  events: SidebarEvent[];
  connected: boolean;
  switchAction: (formData: FormData) => Promise<void>;
  logoutAction: () => Promise<void>;
}

/** The whole navigation: organisation pages on top, then every sourcing event, each opening into its parts. */
export function AppSidebar(props: SidebarProps) {
  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-[256px] shrink-0 flex-col bg-night text-on-dark lg:flex">
        <SidebarBody {...props} />
      </aside>
      <MobileBar {...props} />
    </>
  );
}

function MobileBar(props: SidebarProps) {
  const path = usePathname();
  // Open for the page it was opened on; following a link closes it.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === path;
  const setOpen = (o: boolean) => setOpenAt(o ? path : null);
  return (
    <header className="sticky top-0 z-30 flex items-center gap-2 bg-night px-3 py-2.5 text-on-dark lg:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger aria-label="Open menu" className="rounded-lg p-2 text-fog hover:text-white"><Menu className="size-5" /></SheetTrigger>
        <SheetContent side="left" className="w-[284px] gap-0 border-0 bg-night p-0 text-on-dark">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <SidebarBody {...props} />
        </SheetContent>
      </Sheet>
      <Logo dark />
      <div className="ml-auto flex items-center gap-1">
        <button onClick={openCommandMenu} aria-label="Search" className="rounded-lg p-2 text-fog hover:text-white"><Search className="size-[18px]" /></button>
        <NotificationBell dark />
      </div>
    </header>
  );
}

interface Item { key: string; href: string; label: string; icon: React.ReactNode; active: boolean; count?: number; warn?: boolean; help?: string }

function usePrefs<T>(key: string, fallback: T) {
  const read = () => {
    try {
      const raw = localStorage.getItem(key);
      return raw ?? null;
    } catch {
      return null;
    }
  };
  const raw = useSyncExternalStore(subscribePrefs, read, () => null);
  const value: T = raw ? (JSON.parse(raw) as T) : fallback;
  const set = (v: T) => {
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch {
      // private window: resets next visit
    }
    prefListeners.forEach((l) => l());
  };
  return [value, set] as const;
}
const prefListeners = new Set<() => void>();
const subscribePrefs = (l: () => void) => {
  prefListeners.add(l);
  return () => prefListeners.delete(l);
};

function SidebarBody({ user, workspace, workspaces, events, connected, switchAction, logoutAction }: SidebarProps) {
  const path = usePathname();
  const sp = useSearchParams();
  const tab = sp.get("tab") ?? "overview";
  const view = path === "/events" ? sp.get("view") ?? "all" : null;
  const adminTab = path === "/settings" ? sp.get("tab") ?? "profile" : null;
  const activeId = path.startsWith("/rfx/") ? path.split("/")[2] : null;
  const current = events.find((e) => e.id === activeId) ?? null;
  // Pins belong to one person in one workspace.
  const [pins, setPins] = usePrefs<string[]>(`bidline:pins:v1:${user.email}:${workspace.name}`, ["view:attention", "audit"]);
  // One section open at a time; the one holding the current page opens itself.
  const [openSec, setOpenSec] = usePrefs<string | null>("bidline:open-section", "sourcing");
  const [drag, setDrag] = useState<number | null>(null);

  const ic = "size-4 shrink-0";
  const viewItems: Item[] = EVENT_VIEWS.map((v) => {
    const n = events.filter((e) => inView(e, v.key)).length;
    return {
      key: `view:${v.key}`, href: v.key === "all" ? "/events" : `/events?view=${v.key}`, label: v.label, help: v.help, active: view === v.key,
      icon: v.key === "archived" ? <Archive className={ic} /> : v.key === "attention" ? <BellDot className={ic} /> : v.key === "approval" ? <Stamp className={ic} /> : <Building2 className={ic} />,
      count: n, warn: v.key === "attention" && n > 0,
    };
  }).filter((it) => it.count || ["view:all", "view:attention"].includes(it.key));
  const sections: Array<{ key: string; label: string; items: Item[] }> = [
    { key: "sourcing", label: "Sourcing", items: [
      ...viewItems,
      { key: "suppliers", href: "/suppliers", label: "Suppliers", icon: <Users className={ic} />, active: path.startsWith("/suppliers") },
    ] },
    { key: "insights", label: "Insights", items: [
      { key: "analytics", href: "/analytics", label: "Spend analytics", icon: <BarChart3 className={ic} />, active: path.startsWith("/analytics") },
      ...(user.role !== "viewer" ? [{ key: "audit", href: "/audit", label: "Audit log", icon: <History className={ic} />, active: path.startsWith("/audit") }] : []),
    ] },
    { key: "claude", label: "Claude", items: [
      { key: "ask", href: "/ask", label: "Ask Claude", icon: <ClaudeMark className={ic} color="currentColor" />, active: path.startsWith("/ask") },
      { key: "tools", href: "/tools", label: "Tools and integrations", icon: <Wrench className={ic} />, active: path.startsWith("/tools") },
      { key: "connect", href: "/connect", label: connected ? "Claude connection" : "Connect Claude", icon: <Plug className={ic} />, active: path.startsWith("/connect"), warn: !connected },
    ] },
    ...(can(user.role, "team") ? [{ key: "admin", label: "Organisation", items: [
      { key: "admin:team", href: "/settings?tab=team", label: "Team and roles", icon: <Users className={ic} />, active: adminTab === "team" },
      { key: "admin:workflow", href: "/settings?tab=workflow", label: "Approvals and reminders", icon: <Stamp className={ic} />, active: adminTab === "workflow" },
      { key: "admin:security", href: "/settings?tab=security", label: "Security and data", icon: <Shield className={ic} />, active: adminTab === "security" },
    ] }] : []),
  ];
  const all = sections.flatMap((x) => x.items);
  const pinned = pins.map((k) => all.find((it) => it.key === k)).filter(Boolean) as Item[];
  const togglePin = (k: string) => setPins(pins.includes(k) ? pins.filter((p) => p !== k) : [...pins, k]);
  const toggleSection = (k: string) => setOpenSec(openSec === k ? null : k);
  const dropPin = (to: number) => {
    if (drag === null || drag === to) return setDrag(null);
    const next = pinned.map((p) => p.key);
    const [m] = next.splice(drag, 1);
    next.splice(to, 0, m);
    setPins(next);
    setDrag(null);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 px-4 pt-4 pb-3"><Logo dark /></div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 [scrollbar-width:thin]">
        <NavLink href="/" active={path === "/"} icon={<Home className={ic} />} label="Home" />

        {pinned.length || events.some((e) => e.starred) ? (
          <div className="mt-4">
            <p className="mb-1 px-2 text-[11px] font-medium tracking-[0.08em] text-fog/60 uppercase">Pinned</p>
            <ul className="grid gap-px" aria-label="Pinned pages. Drag to reorder.">
              {pinned.map((it, i) => (
                <li key={`pin-${it.key}`} draggable onDragStart={() => setDrag(i)} onDragOver={(e) => e.preventDefault()} onDrop={() => dropPin(i)} onDragEnd={() => setDrag(null)}
                  className={`rounded-md ${drag === i ? "opacity-40" : ""}`}>
                  <PinnableLink it={it} pinned onPin={() => togglePin(it.key)} />
                </li>
              ))}
            </ul>
            {events.filter((e) => e.starred && !e.archived_at).map((e) => (
              <Link key={`star-${e.id}`} href={`/rfx/${e.id}`} aria-current={e.id === activeId ? "page" : undefined}
                className={`flex h-8 items-center gap-2.5 rounded-md px-2 text-[13.5px] ${e.id === activeId ? "bg-white/10 text-white" : "text-fog hover:bg-white/5 hover:text-white"}`}>
                <Star className="size-4 shrink-0 fill-[#f0a43c]/80 text-[#f0a43c]/80" /><span className="truncate">{e.title}</span>
                <span className={`ml-auto size-1.5 shrink-0 rounded-full ${(STAGE[e.status] ?? STAGE.draft).dot}`} />
              </Link>
            ))}
          </div>
        ) : null}

        {current ? <CurrentEvent e={current} tab={tab} /> : null}

        <div className="mt-3 grid gap-1 border-t border-white/[0.08] pt-3">
          {sections.map((sec) => {
            const open = openSec === sec.key || sec.items.some((it) => it.active);
            return (
              <div key={sec.key}>
                <button onClick={() => toggleSection(sec.key)} aria-expanded={open}
                  className={`flex h-8 w-full items-center rounded-md px-2 text-[11.5px] font-medium tracking-[0.08em] uppercase transition-colors ${open ? "text-on-dark" : "text-fog/70 hover:text-on-dark"} hover:bg-white/5`}>
                  {sec.label}
                  <span className="ml-auto">{open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}</span>
                </button>
                {open ? (
                  <div className="mb-1 grid gap-px ">
                    {sec.items.map((it) => <PinnableLink key={it.key} it={it} pinned={pins.includes(it.key)} onPin={() => togglePin(it.key)} />)}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <div className="border-t border-white/[0.08] p-3">
        <AccountMenu user={user} workspace={workspace} workspaces={workspaces} connected={connected} switchAction={switchAction} logoutAction={logoutAction} />
      </div>
    </div>
  );
}

function PinnableLink({ it, pinned, onPin }: { it: Item; pinned: boolean; onPin: () => void }) {
  const link = (
    <Link href={it.href} aria-current={it.active ? "page" : undefined}
      className={`flex h-8 min-w-0 flex-1 items-center gap-2.5 rounded-md px-2 text-[13.5px] transition-colors ${it.active ? "bg-white/10 text-white" : "text-fog hover:bg-white/5 hover:text-white"}`}>
      {it.icon}<span className="truncate">{it.label}</span>
      {it.count !== undefined ? <span className={`num ml-auto text-[11px] ${it.warn ? "text-[#f6c37b]" : "text-fog/60"}`}>{it.count}</span> : it.warn ? <span className="ml-auto size-1.5 rounded-full bg-[#f0a43c]" /> : null}
    </Link>
  );
  return (
    <div className="group relative flex items-center">
      {it.help ? <Tip text={it.help} side="right">{link}</Tip> : link}
      <button onClick={onPin} aria-label={pinned ? `Unpin ${it.label}` : `Pin ${it.label}`} aria-pressed={pinned}
        className="absolute right-1 hidden size-6 place-items-center rounded text-fog/70 hover:bg-white/10 hover:text-white group-hover:grid group-focus-within:grid">
        {pinned ? <PinOff className="size-3" /> : <Pin className="size-3" />}
      </button>
    </div>
  );
}

function AccountMenu({ user, workspace, workspaces, connected, switchAction, logoutAction }: Pick<SidebarProps, "user" | "workspace" | "workspaces" | "connected" | "switchAction" | "logoutAction">) {
  return (
    <Popover>
      <PopoverTrigger className="flex w-full items-center gap-2.5 rounded-lg bg-white/[0.04] px-2.5 py-2 text-left ring-1 ring-white/[0.06] hover:bg-white/[0.08]">
        <span className="relative grid size-8 shrink-0 place-items-center rounded-full bg-primary text-[12px] font-medium text-white">
          {initials(user.name)}
          <span className={`absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-night ${connected ? "bg-[#3fbf7f]" : "bg-[#f0a43c]"}`} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] leading-tight">{user.email}</span>
          <span className="block truncate text-[11px] leading-tight text-fog/70">{workspace.name} · {roleLabel(user.role)}</span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-fog/70" />
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-[248px] border-0 bg-night-raised p-0 text-on-dark ring-1 ring-white/10">
        <div className="border-b border-white/10 p-3">
          <p className="mb-1.5 text-[11.5px] text-fog/70">Organisation</p>
          {workspaces.length > 1 ? (
            <form action={switchAction} className="grid">
              <select name="workspace" defaultValue={workspaces.find((w) => w.name === workspace.name)?.id} onChange={(e) => e.currentTarget.form?.requestSubmit()}
                aria-label="Switch organisation" className="h-9 rounded-lg bg-night px-2.5 text-[13px] text-on-dark ring-1 ring-white/10 outline-none">
                {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name} · {roleLabel(w.role)}</option>)}
              </select>
            </form>
          ) : (
            <p className="rounded-lg bg-night px-2.5 py-2 text-[13px] ring-1 ring-white/10">{workspace.name} · {roleLabel(user.role)}</p>
          )}
        </div>
        <div className="grid p-1.5 text-[13.5px]">
          <MenuLink href="/connect" icon={<ClaudeMark className="size-4" />} label={connected ? "Claude connected" : "Connect Claude"} />
          <MenuLink href="/settings" icon={<Settings className="size-4" />} label="Settings" />
          {can(user.role, "team") ? <MenuLink href="/settings?tab=team" icon={<Users className="size-4" />} label="Invite people" /> : null}
          <MenuLink href="/docs" icon={<BookOpen className="size-4" />} label="Help and docs" />
        </div>
        <form action={logoutAction} className="border-t border-white/10 p-1.5">
          <button className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[13.5px] text-[#f5a3a3] hover:bg-white/5"><LogOut className="size-4" /> Log out</button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

function MenuLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return <Link href={href} className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-fog hover:bg-white/5 hover:text-white">{icon}{label}</Link>;
}

/** The open event's own sections, so moving around inside a case never needs the page. */
function CurrentEvent({ e, tab }: { e: SidebarEvent; tab: string }) {
  const st = STAGE[e.status] ?? STAGE.draft;
  const parts: Array<{ tab: string; label: string; meta?: string; warn?: boolean }> = [
    { tab: "overview", label: "Overview" },
    { tab: "lines", label: "Line items", meta: String(e.line_count) },
    { tab: "suppliers", label: "Suppliers", meta: `${e.responded}/${e.supplier_count}` },
    { tab: "documents", label: "Documents", meta: e.unread_docs ? `${e.unread_docs} unread` : String(e.doc_count), warn: e.unread_docs > 0 },
    { tab: "comparison", label: "Compare quotes" },
    { tab: "questionnaire", label: "Questionnaire", meta: e.question_count ? String(e.question_count) : undefined },
    { tab: "chase", label: "Follow-ups", meta: e.open_chases ? `${e.open_chases} open` : undefined, warn: e.open_chases > 0 },
    { tab: "award", label: "Award", meta: e.award_status === "sent" ? "awaiting" : e.award_status ?? undefined, warn: e.award_status === "sent" },
    { tab: "assumptions", label: "Rates & units" },
  ];
  return (
    <section aria-label="This sourcing event" className="mt-4 rounded-lg bg-white/[0.04] p-1.5 ring-1 ring-white/[0.06] ">
      <div className="px-2 pt-1 pb-1.5">
        <p className="flex items-center gap-1.5 text-[11px] text-fog/70">
          <span className={`size-1.5 rounded-full ${st.dot}`} /><span className="num">{e.code}</span> · {st.label}
          {e.restricted ? <Lock className="size-3" aria-label="Restricted" /> : null}
        </p>
        <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug font-medium text-white">{e.title}</p>
      </div>
      <ul className="grid gap-px">
        {parts.map((p) => {
          const here = tab === p.tab;
          return (
            <li key={p.tab}>
              <Link href={`/rfx/${e.id}?tab=${p.tab}`} aria-current={here ? "page" : undefined}
                className={`flex h-7 items-center gap-2 rounded-md px-2 text-[12.5px] ${here ? "bg-white/10 text-white" : "text-fog/90 hover:bg-white/5 hover:text-white"}`}>
                <span className="truncate">{p.label}</span>
                {p.meta ? <span className={`num ml-auto shrink-0 text-[11px] ${p.warn ? "text-[#f6c37b]" : "text-fog/60"}`}>{p.meta}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function NavLink({ href, active, icon, label, count }: { href: string; active: boolean; icon: React.ReactNode; label: string; count?: number }) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined}
      className={`flex h-8 items-center gap-2.5 rounded-md px-2 text-[13.5px] transition-colors ${active ? "bg-white/10 text-white" : "text-fog hover:bg-white/5 hover:text-white"}`}>
      {icon}<span className="truncate">{label}</span>
      {count ? <span className="num ml-auto text-[11px] text-fog/70">{count}</span> : null}
    </Link>
  );
}

const initials = (s: string) => s.split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "B";
