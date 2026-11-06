import Link from "next/link";
import { Download, FileText } from "lucide-react";
import { fileSize, type EventFiles } from "@/lib/storage";

const KIND: Record<string, string> = {
  quotation: "Quote", questionnaire: "Questionnaire", certificate: "Certificate", rfx_pack: "Enquiry pack", other: "Other",
};

/** Supplier files, one fold per sourcing event; the first event starts open. */
export function EventFilesList({ events, showSizes = false }: { events: EventFiles[]; showSizes?: boolean }) {
  if (!events.length) {
    return <p className="rounded-lg bg-muted px-4 py-5 text-[14px] text-ink-secondary">No supplier files yet. Upload quotes on a sourcing event&apos;s Documents tab, or load the demo.</p>;
  }
  return (
    <div className="grid gap-2">
      {events.map((ev, i) => (
        <details key={ev.id} open={i === 0} className="group rounded-lg ring-1 ring-border">
          <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-muted/60 [&::-webkit-details-marker]:hidden">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-medium">{ev.title}{ev.archived ? <span className="ml-1.5 text-[12px] font-normal text-ink-secondary">(archived)</span> : null}</span>
              <span className="block text-[12.5px] text-ink-secondary">{ev.code} · {ev.files.length} file{ev.files.length === 1 ? "" : "s"}{showSizes ? ` · ${fileSize(ev.bytes)}` : ""}</span>
            </span>
            <Link href={`/rfx/${ev.id}?tab=documents`} className="shrink-0 text-[13px] text-primary hover:underline">Open event</Link>
            <span aria-hidden className="text-ink-secondary transition group-open:rotate-90">›</span>
          </summary>
          <ul className="grid gap-1 border-t border-border p-2 sm:grid-cols-2">
            {ev.files.map((f) => (
              <li key={f.id}>
                <a href={`/api/files/${f.id}?download=1`} download className="flex items-center gap-3 rounded-md px-2.5 py-2 hover:bg-muted">
                  <FileText className="size-4 shrink-0 text-ink-secondary" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px]">{f.filename}</span>
                    <span className="block truncate text-[12px] text-ink-secondary">
                      {[f.supplier, KIND[f.kind] ?? f.kind, showSizes ? fileSize(f.byteSize) : null].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <Download className="size-3.5 shrink-0 text-ink-secondary" />
                </a>
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}
