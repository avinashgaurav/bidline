"use client";

import { useOptimistic, useTransition } from "react";
import { Star } from "lucide-react";
import { starRfxUI } from "@/app/actions";
import { Tip } from "@/components/tip";

/** Star an event to keep it under Pinned in the sidebar. Personal: nobody else sees your stars. */
export function StarButton({ rfxId, starred, compact = false }: { rfxId: string; starred: boolean; compact?: boolean }) {
  const [on, setOn] = useOptimistic(starred);
  const [, start] = useTransition();
  return (
    <Tip text={on ? "Unstar: remove from Pinned" : "Star: keep it under Pinned in the sidebar"}>
      <button type="button" aria-pressed={on} aria-label={on ? "Unstar this event" : "Star this event"}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); start(async () => { setOn(!on); await starRfxUI(rfxId, !on); }); }}
        className={compact ? "grid size-7 place-items-center rounded-md hover:bg-muted" : "inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] ring-1 ring-border hover:bg-muted"}>
        <Star className={`size-3.5 ${on ? "fill-[#f0a43c] text-[#f0a43c]" : "text-ink-secondary"}`} />{compact ? null : on ? "Starred" : "Star"}
      </button>
    </Tip>
  );
}
