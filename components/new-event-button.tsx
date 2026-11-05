"use client";

import { Plus } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { StartChoice } from "@/components/start-choice";

/** "New sourcing event" opens the same one-question start as the first run. */
export function NewEventButton() {
  return (
    <Dialog>
      <DialogTrigger className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-sm text-white outline-none hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/30">
        <Plus className="size-4" /> New sourcing event
      </DialogTrigger>
      <DialogContent className="max-w-[680px] p-6 sm:max-w-[680px] sm:p-7">
        <DialogTitle className="sr-only">New sourcing event</DialogTitle>
        <StartChoice heading="New sourcing event" />
      </DialogContent>
    </Dialog>
  );
}
