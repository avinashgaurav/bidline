"use client";

import { useSyncExternalStore } from "react";
import { date, time } from "@/lib/prefs";
import { usePrefs } from "@/components/prefs-provider";

const subscribe = (l: () => void) => {
  const id = setInterval(l, 60_000);
  return () => clearInterval(id);
};

export function agoText(iso: string, now = Date.now()): string {
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/** "5 min ago" for the last day, then the date; the exact time on hover. Updates each minute. */
export function Ago({ iso }: { iso: string }) {
  const prefs = usePrefs();
  const now = useSyncExternalStore(subscribe, () => Math.floor(Date.now() / 60_000), () => 0);
  const recent = now && now * 60_000 - new Date(iso).getTime() < 86_400_000;
  const text = recent ? agoText(iso, now * 60_000) : date(iso, prefs);
  return <time dateTime={iso} title={`${date(iso, prefs)}, ${time(iso, prefs, true)} (${prefs.timeZone})`}>{text}</time>;
}
