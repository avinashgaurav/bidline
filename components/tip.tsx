"use client";

import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** Wrap any element with a short plain-language explanation on hover or focus. */
export function Tip({ text, children, side = "top" }: { text: React.ReactNode; children: React.ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} sideOffset={6} className="max-w-[280px] text-[12px] leading-snug">{text}</TooltipContent>
    </Tooltip>
  );
}

/** A small info mark next to a label, for terms a first-time user may not know. */
export function InfoTip({ text, label = "What is this?" }: { text: React.ReactNode; label?: string }) {
  return (
    <Tip text={text}>
      <button type="button" aria-label={label} className="inline-grid size-4 shrink-0 place-items-center rounded-full text-ink-secondary/70 hover:text-primary focus-visible:text-primary">
        <Info className="size-3.5" />
      </button>
    </Tip>
  );
}
