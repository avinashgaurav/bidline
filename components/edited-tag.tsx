"use client";

import { History } from "lucide-react";
import { ClaudeMark } from "@/components/claude-mark";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Ago } from "@/components/ago";

export interface Edit { actor: string; name: string | null; at: string; summary: string; kind?: string }

/** "Claude" or "Person": the small tag that says who made a change. */
export function ByTag({ actor, name }: { actor: string; name?: string | null }) {
  if (actor === "claude") {
    return <span className="inline-flex items-center gap-1 rounded-full bg-[#F6EEE8] px-1.5 py-px text-[11.5px] text-[#8a4a2c]"><ClaudeMark className="size-3" />Claude</span>;
  }
  if (actor === "approver") return <span className="rounded-full bg-success/10 px-1.5 py-px text-[11.5px] text-success">Approver{name ? `: ${name}` : ""}</span>;
  if (actor === "system") return <span className="rounded-full bg-muted px-1.5 py-px text-[11.5px] text-ink-secondary">Bidline</span>;
  return <span className="rounded-full bg-secondary px-1.5 py-px text-[11.5px] text-primary">Person{name ? `: ${name}` : ""}</span>;
}

/** The latest change to one item, and its full history on click. Nothing shows for an item never changed. */
export function EditedTag({ edits, label = "this item" }: { edits: Edit[] | undefined; label?: string }) {
  if (!edits?.length) return null;
  const last = edits[0];
  return (
    <Popover>
      <PopoverTrigger className="inline-flex max-w-full items-center gap-1.5 rounded-md text-[12px] text-ink-secondary hover:text-foreground" aria-label={`History of ${label}`}>
        <span>Edited by</span><ByTag actor={last.actor} name={last.actor === "claude" ? null : last.name} />
        <span className="hidden sm:inline"><Ago iso={last.at} /></span>
        {edits.length > 1 ? <span className="inline-flex items-center gap-0.5"><History className="size-3" />{edits.length}</span> : null}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[340px] p-0">
        <p className="border-b border-border px-3 py-2 text-[12.5px] font-medium">History of {label}</p>
        <ol className="max-h-[300px] overflow-y-auto">
          {edits.map((e, i) => (
            <li key={i} className="border-b border-border px-3 py-2 last:border-0">
              <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-ink-secondary">
                <ByTag actor={e.actor} name={e.actor === "claude" ? null : e.name} />
                {e.actor === "claude" && e.name ? <span>for {e.name}</span> : null}
                <span>·</span><Ago iso={e.at} />
              </div>
              <p className="mt-0.5 text-[13px] leading-snug">{e.summary}</p>
            </li>
          ))}
        </ol>
      </PopoverContent>
    </Popover>
  );
}
