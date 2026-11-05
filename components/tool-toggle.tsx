"use client";

import { useState, useTransition } from "react";
import { setToolUI } from "@/app/actions";

/** An admin's on/off switch for one Claude tool, for the whole workspace. */
export function ToolToggle({ tool, enabled, locked }: { tool: string; enabled: boolean; locked: boolean }) {
  const [on, setOn] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex items-center gap-2">
      {error ? <span role="alert" className="text-[12px] text-destructive">{error}</span> : null}
      <button type="button" role="switch" aria-checked={on} aria-label={`${on ? "Switch off" : "Switch on"} ${tool}`} disabled={locked || pending}
        title={locked ? "Always on: Claude needs this to find its way around" : undefined}
        onClick={() => start(async () => {
          const next = !on;
          setOn(next);
          const res = await setToolUI(tool, next);
          if (res.error) { setOn(!next); setError(res.error); } else setError(null);
        })}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${on ? "bg-primary" : "bg-fog"}`}>
        <span className={`absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform ${on ? "translate-x-4" : ""}`} />
      </button>
    </span>
  );
}
