"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Download, FileText } from "lucide-react";
import { fileSize } from "@/lib/file-size";
import type { EventFileTotals, StoredFile } from "@/lib/storage";

const KIND: Record<string, string> = {
  quotation: "Quote", questionnaire: "Questionnaire", certificate: "Certificate", rfx_pack: "Enquiry pack", other: "Other",
};

/**
 * Supplier files, one fold per sourcing event. Folds keep their own open state,
 * so a live refresh never moves them, and an event's files load when it opens.
 */
export function EventFilesList({ events, showSizes = false }: { events: EventFileTotals[]; showSizes?: boolean }) {
  if (!events.length) {
    return <p className="rounded-lg bg-muted px-4 py-5 text-[14px] text-ink-secondary">No supplier files yet. Upload quotes on a sourcing event&apos;s Documents tab, or load the demo.</p>;
  }
  return (
    <div className="grid gap-2">
      {events.map((ev, i) => <EventFold key={ev.id} ev={ev} startOpen={i === 0} showSizes={showSizes} />)}
    </div>
  );
}

function EventFold({ ev, startOpen, showSizes }: { ev: EventFileTotals; startOpen: boolean; showSizes: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const [files, setFiles] = useState<StoredFile[] | null>(null);
  const [failed, setFailed] = useState(false);
  const need = open && !files && !failed;
  useEffect(() => {
    if (!need) return;
    let live = true;
    fetch(`/api/storage/${ev.id}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { files: StoredFile[] }) => live && setFiles(d.files))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [need, ev.id]);

  return (
    <details open={open} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)} className="group rounded-lg ring-1 ring-border">
      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-lg px-4 py-3 hover:bg-muted/60 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-medium">{ev.title}{ev.archived ? <span className="ml-1.5 text-[12px] font-normal text-ink-secondary">(archived)</span> : null}</span>
          <span className="block text-[12.5px] text-ink-secondary">{ev.code} · {ev.files} file{ev.files === 1 ? "" : "s"}{showSizes ? ` · ${fileSize(ev.bytes)}` : ""}</span>
        </span>
        <span aria-hidden className="text-ink-secondary transition group-open:rotate-90">›</span>
      </summary>
      <div className="border-t border-border p-2">
        {failed ? <p className="px-2.5 py-2 text-[13px] text-ink-secondary">Could not load these files. Reload the page to try again.</p> : null}
        {!files && !failed ? <p className="px-2.5 py-2 text-[13px] text-ink-secondary">Loading files…</p> : null}
        {files ? (
          <ul className="grid gap-1 sm:grid-cols-2">
            {files.map((f) => (
              <li key={f.id}>
                <a href={`/api/files/${f.id}?download=1`} download aria-label={`Download ${f.filename}`} className="flex items-center gap-3 rounded-md px-2.5 py-2 hover:bg-muted">
                  <FileText aria-hidden className="size-4 shrink-0 text-ink-secondary" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px]">{f.filename}</span>
                    <span className="block truncate text-[12px] text-ink-secondary">
                      {[f.supplier, KIND[f.kind] ?? f.kind, showSizes ? fileSize(f.byteSize) : null].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <Download aria-hidden className="size-3.5 shrink-0 text-ink-secondary" />
                </a>
              </li>
            ))}
          </ul>
        ) : null}
        <Link href={`/rfx/${ev.id}?tab=documents`} className="mt-1 inline-block px-2.5 py-1.5 text-[13px] text-primary hover:underline">Open this event&apos;s documents</Link>
      </div>
    </details>
  );
}
