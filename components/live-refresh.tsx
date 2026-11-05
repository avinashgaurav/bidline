"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Tip } from "@/components/tip";

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
    <Tip text={pulse ? "Claude or another tab just changed this. The page has refreshed itself." : "This page updates by itself within a few seconds whenever Claude changes something. No need to reload."}>
      <span
        tabIndex={0}
        aria-live="polite"
        className={`inline-flex h-7 items-center gap-2 rounded-full px-2.5 text-[12px] font-medium transition-colors ${
          pulse ? "bg-secondary text-primary" : "bg-success/10 text-success"
        }`}
      >
        <span className="relative flex size-2">
          <span className={`absolute inline-flex size-full rounded-full opacity-60 motion-safe:animate-ping ${pulse ? "bg-primary" : "bg-success [animation-duration:2.4s]"}`} />
          <span className={`relative inline-flex size-2 rounded-full ${pulse ? "bg-primary" : "bg-success"}`} />
        </span>
        {pulse ? "Updated just now" : "Live"}
      </span>
    </Tip>
  );
}
