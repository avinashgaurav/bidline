"use client";

import { usePathname, useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";

/** One dropdown that narrows a page to a single sourcing event; "All sourcing events" is the default. */
export function EventFilter({ events, value }: { events: Array<{ id: string; code: string; title: string; archived: boolean }>; value: string }) {
  const router = useRouter();
  const path = usePathname();
  const [pending, start] = useTransition();
  // show the new choice at once, while the page loads its figures
  const [shown, setShown] = useOptimistic(value);
  return (
    <select value={shown} aria-label="Sourcing event" aria-busy={pending}
      onChange={(e) => {
        const next = e.target.value;
        start(() => {
          setShown(next);
          router.replace(next ? `${path}?event=${encodeURIComponent(next)}` : path, { scroll: false });
        });
      }}
      className="h-9 max-w-full rounded-lg bg-card px-3 text-[13.5px] ring-1 ring-border outline-none focus-visible:ring-2 focus-visible:ring-primary/50 aria-busy:opacity-60 sm:w-[320px]">
      <option value="">All sourcing events</option>
      {events.map((e) => (
        <option key={e.id} value={e.id}>{e.code} · {e.title}{e.archived ? " (archived)" : ""}</option>
      ))}
    </select>
  );
}
