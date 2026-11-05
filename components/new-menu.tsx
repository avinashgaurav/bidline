"use client";

import Link from "next/link";
import { ChevronDown, FilePlus2, FileText, Plus, UserPlus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** One place to start anything: a new event, quotes for an open event, or a teammate. */
export function NewMenu({ canTeam, openEvents }: { canTeam: boolean; openEvents: Array<{ id: string; code: string; title: string }> }) {
  return (
    <Popover>
      <PopoverTrigger className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-[13.5px] text-white transition-colors hover:bg-primary/90">
        <Plus className="size-4" /> New <ChevronDown className="size-3.5 opacity-80" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[300px] p-1.5">
        <Item href="/?new=1" icon={<FilePlus2 className="size-4" />} title="Sourcing event" sub="Demo data or your own purchase" />
        {openEvents.length ? (
          <div className="mt-1 border-t border-border pt-1.5">
            <p className="px-2.5 pb-1 text-[11.5px] text-ink-secondary">Upload supplier quotes to</p>
            {openEvents.slice(0, 5).map((e) => (
              <Item key={e.id} href={`/rfx/${e.id}?tab=documents`} icon={<FileText className="size-4" />} title={e.title} sub={e.code} />
            ))}
          </div>
        ) : null}
        {canTeam ? (
          <div className="mt-1 border-t border-border pt-1.5">
            <Item href="/settings?tab=team" icon={<UserPlus className="size-4" />} title="Invite someone" sub="Add a teammate with a role" />
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function Item({ href, icon, title, sub }: { href: string; icon: React.ReactNode; title: string; sub: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5 rounded-md px-2.5 py-2 hover:bg-muted">
      <span className="grid size-7 shrink-0 place-items-center rounded-md bg-secondary text-primary">{icon}</span>
      <span className="min-w-0"><span className="block truncate text-[13.5px]">{title}</span><span className="block truncate text-[11.5px] text-ink-secondary">{sub}</span></span>
    </Link>
  );
}
