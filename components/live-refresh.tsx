"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { RefreshCw, X } from "lucide-react";

/**
 * Keeps every open screen in step with Claude and teammates. It polls the
 * workspace's change counter and refreshes the page when anything changed, then
 * says what changed in a small note. It shows nothing while nothing happens:
 * whether Claude is connected is shown once, in the sidebar.
 */
export function LiveRefresh({ initial }: { initial: number }) {
  const router = useRouter();
  const seen = useRef(initial);
  const [note, setNote] = useState<{ summary: string; who: string } | null>(null);
  useEffect(() => {
    seen.current = Math.max(seen.current, initial);
  }, [initial]);
  useEffect(() => {
    let stop = false;
    let hide: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/rfx/all/version", { cache: "no-store" });
        if (!res.ok) return;
        // look-ups by Claude do not change anything, so they never refresh the page
        const body = (await res.json()) as { version: number; latest?: { summary: string; who: string; mine: boolean } | null };
        if (stop || body.version <= seen.current) return;
        seen.current = body.version;
        router.refresh();
        // Your own clicks refresh quietly; changes by Claude or a teammate are named.
        if (body.latest && !body.latest.mine) {
          setNote({ summary: body.latest.summary, who: body.latest.who });
          clearTimeout(hide);
          hide = setTimeout(() => setNote(null), 6000);
        }
      } catch {
        // offline for a moment; the next tick tries again
      }
    };
    const id = setInterval(tick, 10000);
    return () => {
      stop = true;
      clearInterval(id);
      clearTimeout(hide);
    };
  }, [router]);
  if (!note) return null;
  return (
    <div role="status" aria-live="polite"
      className="fixed right-4 bottom-4 z-40 flex max-w-[380px] items-start gap-3 rounded-xl bg-night px-4 py-3 text-[13px] text-on-dark shadow-[0_18px_40px_-14px_rgba(23,23,33,0.5)] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2">
      <RefreshCw className="mt-0.5 size-3.5 shrink-0 text-fog" />
      <span className="min-w-0">
        <span className="font-medium">{note.who} just made a change.</span>
        <span className="mt-0.5 line-clamp-2 block text-fog">{note.summary}</span>
      </span>
      <button onClick={() => setNote(null)} aria-label="Dismiss" className="-mr-1 rounded p-0.5 text-fog hover:text-white"><X className="size-3.5" /></button>
    </div>
  );
}
