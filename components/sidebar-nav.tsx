"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { BookOpen, Download, LayoutList, Plug, Settings } from "lucide-react";
import { ClaudeMark } from "@/components/claude-mark";
import { EVENT_STEPS } from "@/lib/event-steps";


const linkClass = (active: boolean) =>
  `relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] whitespace-nowrap transition-colors ${
    active ? "bg-white/10 text-white" : "text-fog hover:bg-white/5 hover:text-white"
  }`;

export function SidebarNav({ connected, compact = false }: { connected: boolean; compact?: boolean }) {
  const path = usePathname();
  const params = useSearchParams();
  const eventId = /^\/rfx\/([^/]+)/.exec(path)?.[1] ?? null;
  const tab = params.get("tab") ?? "comparison";

  const main = [
    { href: "/", label: "Sourcing events", icon: <LayoutList className="size-[18px] shrink-0" />, active: path === "/" || Boolean(eventId) },
    { href: "/ask", label: "Ask Claude", icon: <ClaudeMark className="size-[18px] shrink-0" color="currentColor" />, active: path.startsWith("/ask") },
    { href: "/connect", label: "Connect Claude", icon: <Plug className="size-[18px] shrink-0" />, active: path.startsWith("/connect"), dot: true },
    { href: "/docs", label: "Docs", icon: <BookOpen className="size-[18px] shrink-0" />, active: path.startsWith("/docs") },
    { href: "/settings", label: "Settings", icon: <Settings className="size-[18px] shrink-0" />, active: path.startsWith("/settings") },
  ];

  if (compact) {
    return (
      <nav aria-label="Main" className="flex gap-1 overflow-x-auto">
        {main.map((it) => (
          <Link key={it.href} href={it.href} aria-label={it.label} aria-current={it.active ? "page" : undefined}
            className={`rounded-lg p-2 ${it.active ? "bg-white/10 text-white" : "text-fog hover:text-white"}`}>
            {it.icon}
          </Link>
        ))}
      </nav>
    );
  }

  return (
    <nav aria-label="Main" className="grid gap-1">
      {main.map((it, i) => (
        <div key={it.href}>
          <Link href={it.href} aria-current={it.active && !(i === 0 && eventId) ? "page" : undefined} className={linkClass(it.active && !(i === 0 && eventId))}>
            {it.active && !(i === 0 && eventId) ? <span aria-hidden className="absolute top-2 bottom-2 -left-5 w-[3px] rounded-r bg-primary" /> : null}
            {it.icon}
            <span>{it.label}</span>
            {it.dot ? (
              <span title={connected ? "Connected" : "Not connected"} className={`ml-auto size-2 rounded-full ${connected ? "bg-[#3fbf7f]" : "bg-[#f0a43c]"}`} />
            ) : null}
          </Link>
          {i === 0 && eventId ? (
            <div className="mt-1 mb-2 ml-[22px] grid gap-0.5 border-l border-white/10 pl-3">
              <p className="px-3 pt-1 pb-1.5 text-[12px] text-fog/80">This event</p>
              {EVENT_STEPS.map((s) => {
                const active = tab === s.tab;
                return (
                  <Link key={s.tab} href={`/rfx/${eventId}?tab=${s.tab}`} aria-current={active ? "page" : undefined}
                    className={`relative rounded-md px-3 py-1.5 text-[14px] ${active ? "bg-white/10 text-white" : "text-fog hover:bg-white/5 hover:text-white"}`}>
                    {active ? <span aria-hidden className="absolute top-1.5 bottom-1.5 -left-[13px] w-[2px] rounded bg-primary" /> : null}
                    {s.label}
                  </Link>
                );
              })}
              <a href={`/api/rfx/${eventId}/export/xlsx`} className="flex items-center gap-2 rounded-md px-3 py-1.5 text-[14px] text-fog hover:bg-white/5 hover:text-white">
                <Download className="size-3.5" /> Export to Excel
              </a>
            </div>
          ) : null}
        </div>
      ))}
    </nav>
  );
}
