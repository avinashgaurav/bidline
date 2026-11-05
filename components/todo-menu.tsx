"use client";

import { useState, useTransition } from "react";
import { AlarmClock, MoreHorizontal, UserRound } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { setTodoUI } from "@/app/actions";

/** Assign a to-do to a teammate or snooze it. Both are recorded in the event's audit trail. */
export function TodoMenu({ todoKey, rfxId, text, members, assignedTo, snoozed }: {
  todoKey: string; rfxId: string; text: string; members: Array<{ user_id: string; name: string }>; assignedTo: string | null; snoozed: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (patch: { assignTo?: string | null; snoozeDays?: number | null }) => start(async () => {
    const r = await setTodoUI({ key: todoKey, rfxId, text, ...patch });
    if (r.error) setError(r.error);
    else setOpen(false);
  });
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger aria-label="Assign or snooze" disabled={pending} className="grid size-8 shrink-0 place-items-center rounded-lg text-ink-secondary hover:bg-muted hover:text-foreground">
        <MoreHorizontal className="size-4" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60 p-1.5">
        <p className="flex items-center gap-1.5 px-2 pt-1 pb-1 text-[11.5px] text-ink-secondary"><UserRound className="size-3.5" /> Assign to</p>
        <div className="max-h-48 overflow-y-auto">
          {members.map((m) => (
            <button key={m.user_id} onClick={() => run({ assignTo: m.user_id })}
              className={`flex w-full items-center rounded-md px-2.5 py-1.5 text-left text-[13px] hover:bg-muted ${assignedTo === m.user_id ? "font-medium text-primary" : ""}`}>{m.name}</button>
          ))}
          {assignedTo ? <button onClick={() => run({ assignTo: null })} className="w-full rounded-md px-2.5 py-1.5 text-left text-[13px] text-ink-secondary hover:bg-muted">Unassign</button> : null}
        </div>
        <p className="mt-1 flex items-center gap-1.5 border-t border-border px-2 pt-2 pb-1 text-[11.5px] text-ink-secondary"><AlarmClock className="size-3.5" /> Snooze</p>
        {snoozed ? (
          <button onClick={() => run({ snoozeDays: null })} className="w-full rounded-md px-2.5 py-1.5 text-left text-[13px] hover:bg-muted">Bring it back now</button>
        ) : (
          [[1, "Until tomorrow"], [3, "For 3 days"], [7, "For a week"]].map(([d, l]) => (
            <button key={d} onClick={() => run({ snoozeDays: d as number })} className="w-full rounded-md px-2.5 py-1.5 text-left text-[13px] hover:bg-muted">{l}</button>
          ))
        )}
        {error ? <p role="alert" className="px-2 pt-1 text-[12px] text-destructive">{error}</p> : null}
      </PopoverContent>
    </Popover>
  );
}
