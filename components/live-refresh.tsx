"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Keeps the open screen in step with Claude. Polls the event counter and
 * refreshes the page when anything changed, so a quote Claude submits, or an
 * edit made in another tab, appears without reloading.
 */
export function LiveRefresh({ url, initial }: { url: string; initial: number }) {
  const router = useRouter();
  const seen = useRef(initial);
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    seen.current = initial;
  }, [initial]);
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) return;
        const { version } = (await res.json()) as { version: number };
        if (!stop && version > seen.current) {
          seen.current = version;
          setPulse(true);
          router.refresh();
          setTimeout(() => setPulse(false), 2500);
        }
      } catch {
        // offline for a moment; the next tick tries again
      }
    };
    const id = setInterval(tick, 3000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [url, router]);
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-secondary" aria-live="polite">
      <span className={`size-2 rounded-full ${pulse ? "bg-primary animate-ping" : "bg-success"}`} />
      {pulse ? "Updated just now" : "Live"}
    </span>
  );
}
