"use client";

import { ChevronDown, Download, FileSpreadsheet, FileText, Table2 } from "lucide-react";
import { DropdownMenu } from "radix-ui";

const ITEMS = [
  { kind: "xlsx", label: "Excel workbook", hint: "Comparison, award options and an audit-trail sheet", icon: FileSpreadsheet },
  { kind: "csv", label: "CSV", hint: "Every price, one row per line and supplier", icon: Table2 },
  { kind: "transcript", label: "Activity log (.md)", hint: "Everything Claude and you did, in order", icon: FileText },
] as const;

/** One Export button instead of three, with what each file contains. */
export function ExportMenu({ rfxId }: { rfxId: string }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="inline-flex h-8 items-center gap-1.5 rounded-full bg-secondary px-3 text-[14px] outline-none hover:bg-lavender focus-visible:ring-3 focus-visible:ring-ring/30 data-[state=open]:bg-lavender">
        <Download className="size-3.5" /> Export <ChevronDown className="size-3.5 opacity-70" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6}
          className="z-50 w-[300px] rounded-xl bg-popover p-1.5 shadow-[0_1px_2px_rgba(23,23,33,0.06),0_16px_40px_-12px_rgba(23,23,33,0.28)] ring-1 ring-border motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95">
          {ITEMS.map(({ kind, label, hint, icon: Icon }) => (
            <DropdownMenu.Item key={kind} asChild>
              <a href={`/api/rfx/${rfxId}/export/${kind}`} className="flex cursor-pointer gap-3 rounded-lg px-3 py-2.5 outline-none data-[highlighted]:bg-muted">
                <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
                <span className="grid gap-0.5">
                  <span className="text-sm">{label}</span>
                  <span className="text-xs text-ink-secondary">{hint}</span>
                </span>
              </a>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
