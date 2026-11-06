"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";

/** One dropdown that narrows a page to a single sourcing event; "All sourcing events" is the default. */
export function EventFilter({ events, value }: { events: Array<{ id: string; code: string; title: string; archived: boolean }>; value: string }) {
  const router = useRouter();
  const path = usePathname();
  const [pending, start] = useTransition();
  return (
    <select value={value} aria-label="Sourcing event" disabled={pending}
      onChange={(e) => start(() => router.replace(e.target.value ? `${path}?event=${encodeURIComponent(e.target.value)}` : path, { scroll: false }))}
      className="h-9 max-w-full rounded-lg bg-card px-3 text-[13.5px] ring-1 ring-border outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-60 sm:w-[320px]">
      <option value="">All sourcing events</option>
      {events.map((e) => (
        <option key={e.id} value={e.id}>{e.code} · {e.title}{e.archived ? " (archived)" : ""}</option>
      ))}
    </select>
  );
}
