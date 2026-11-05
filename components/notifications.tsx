"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ClaudeMark } from "@/components/claude-mark";

interface Item { id: string; rfx_id: string | null; rfx_code: string | null; kind: string; actor: string; user_name: string | null; summary: string; created_at: string; unread: boolean }

const ago = (iso: string) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};

/** What Claude, teammates and approvers did on your events since you last looked. */
export function NotificationBell({ dark = false }: { dark?: boolean }) {
  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/me/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as { items: Item[]; unread: number };
      setItems(body.items);
      setUnread(body.unread);
    } catch {
      // try again on the next tick
    }
  }, []);
  useEffect(() => {
    const first = setTimeout(load, 0);
    const id = setInterval(() => document.visibilityState === "visible" && load(), 20000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [load]);
  const markRead = async () => {
    setUnread(0);
    setItems((l) => l.map((i) => ({ ...i, unread: false })));
    await fetch("/api/me/notifications", { method: "POST" }).catch(() => undefined);
  };

  return (
    <Popover>
      <PopoverTrigger aria-label={unread ? `Notifications, ${unread} new` : "Notifications"}
        className={`relative grid size-9 place-items-center rounded-lg transition-colors ${dark ? "text-fog hover:bg-white/10 hover:text-white" : "text-ink-secondary ring-1 ring-border hover:bg-muted hover:text-foreground"}`}>
        <Bell className="size-[18px]" />
        {unread ? <span className="num absolute -top-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-medium text-white">{unread > 9 ? "9+" : unread}</span> : null}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <p className="text-[14px] font-medium">Notifications</p>
          {unread ? <button onClick={markRead} className="inline-flex items-center gap-1 text-[12px] text-primary hover:underline"><CheckCheck className="size-3.5" /> Mark all read</button> : null}
        </div>
        <ul className="max-h-[420px] overflow-y-auto">
          {items.map((i) => (
            <li key={i.id} className="border-b border-border last:border-0">
              <Link href={i.rfx_id ? `/rfx/${i.rfx_id}` : "/audit"} className={`flex gap-3 px-4 py-3 hover:bg-muted/60 ${i.unread ? "bg-secondary/40" : ""}`}>
                <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-muted">
                  {i.actor === "claude" ? <ClaudeMark className="size-3" /> : <span className={`size-2 rounded-full ${i.actor === "approver" ? "bg-success" : "bg-primary"}`} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-[13px] leading-snug">{i.summary}</span>
                  <span className="mt-0.5 block text-[11px] text-ink-secondary">
                    {i.actor === "claude" ? `Claude for ${i.user_name ?? "a teammate"}` : i.actor === "approver" ? "Approver" : i.user_name ?? "A teammate"}
                    {i.rfx_code ? <> · <span className="num">{i.rfx_code}</span></> : null} · {ago(i.created_at)}
                  </span>
                </span>
                {i.unread ? <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-label="New" /> : null}
              </Link>
            </li>
          ))}
          {!items.length ? <li className="px-4 py-8 text-center text-[13px] text-ink-secondary">Nothing new. When Claude reads a quote, a teammate changes something or an approver decides, it shows here.</li> : null}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
