"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, LayoutList, Plug, Settings } from "lucide-react";
import { ClaudeMark } from "@/components/claude-mark";


const linkClass = (active: boolean) =>
  `relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] whitespace-nowrap transition-colors ${
    active ? "bg-white/10 text-white" : "text-fog hover:bg-white/5 hover:text-white"
  }`;

export function SidebarNav({ connected, compact = false }: { connected: boolean; compact?: boolean }) {
  const path = usePathname();

  const main = [
    { href: "/", label: "Sourcing events", icon: <LayoutList className="size-[18px] shrink-0" />, active: path === "/" || path.startsWith("/rfx") },
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
      {main.map((it) => (
        <Link key={it.href} href={it.href} aria-current={it.active ? "page" : undefined} className={linkClass(it.active)}>
          {it.active ? <span aria-hidden className="absolute top-2 bottom-2 -left-5 w-[3px] rounded-r bg-primary" /> : null}
          {it.icon}
          <span>{it.label}</span>
          {it.dot ? (
            <span title={connected ? "Claude is connected" : "Claude is not connected yet"} className={`ml-auto size-2 rounded-full ${connected ? "bg-[#3fbf7f]" : "bg-[#f0a43c]"}`} />
          ) : null}
        </Link>
      ))}
    </nav>
  );
}
