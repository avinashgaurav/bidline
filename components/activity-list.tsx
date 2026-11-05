import type { EventRow } from "@/lib/events";

const ACTOR: Record<string, { label: string; cls: string }> = {
  claude: { label: "Claude", cls: "bg-secondary text-primary" },
  user: { label: "In the app", cls: "bg-muted text-ink-secondary" },
  approver: { label: "Approver", cls: "bg-success/10 text-success" },
  system: { label: "Bidline", cls: "bg-muted text-ink-secondary" },
};

export function ActivityList({ events, compact = false }: { events: EventRow[]; compact?: boolean }) {
  if (!events.length) return <p className="text-sm text-ink-secondary">No activity yet. Changes made in Claude or in the app appear here.</p>;
  return (
    <ol className="grid gap-3">
      {events.map((e) => {
        const a = ACTOR[e.actor] ?? ACTOR.system;
        return (
          <li key={e.id} className="grid gap-1 border-b border-border pb-3 last:border-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-ink-secondary">
              <span className={`rounded-full px-2 py-0.5 ${a.cls}`}>{a.label}</span>
              {e.tool ? <code className="text-[12px]">{e.tool}</code> : null}
              <span className="num">{new Date(e.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>
            </div>
            {e.user_request && !compact ? <p className="text-sm text-ink-secondary">Asked: &ldquo;{e.user_request}&rdquo;</p> : null}
            <p className="text-sm">{e.summary}</p>
          </li>
        );
      })}
    </ol>
  );
}
