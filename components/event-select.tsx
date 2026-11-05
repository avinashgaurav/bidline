"use client";

import { useRouter } from "next/navigation";
import { fieldClass } from "@/components/form-bits";

/** Switch which sourcing event the Ask page answers about. */
export function EventSelect({ events, current }: { events: Array<{ id: string; code: string; title: string }>; current: string }) {
  const router = useRouter();
  return (
    <label className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
      <span className="text-ink-secondary">Sourcing event</span>
      <select value={current} onChange={(e) => router.push(`/ask?event=${e.target.value}`)} className={`${fieldClass} w-auto max-w-full min-w-0 sm:max-w-[460px]`}>
        {events.map((e) => <option key={e.id} value={e.id}>{e.code} · {e.title}</option>)}
      </select>
    </label>
  );
}
