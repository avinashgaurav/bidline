"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ExternalLink, FileSpreadsheet, FileText, Image as ImageIcon, Mail, Pencil, Search, Upload } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ClaudeMark } from "@/components/claude-mark";
import { Check, Copy } from "lucide-react";
import { Tip } from "@/components/tip";
import { DocumentRowForm, Uploader } from "./documents-client";

interface Doc {
  id: string; supplier_id: string | null; supplier_code: string | null; kind: string; filename: string; mime_type: string;
  byte_size: number; source: string; status: string; read_at: string | null; created_at: string;
}
interface Sup { id: string; code: string; name: string; status: string }

const KIND: Record<string, string> = { quotation: "Quote", questionnaire: "Questionnaire", certificate: "Certificate", rfx_pack: "Our enquiry", other: "Other" };
const STATUS: Record<string, { label: string; cls: string; help: string }> = {
  unread: { label: "Waiting for Claude", cls: "bg-warning/10 text-warning", help: "Uploaded but not read yet. Ask your Claude to read it; Bidline has no AI of its own." },
  read: { label: "Read", cls: "bg-success/10 text-success", help: "Claude read it and its prices or answers are in Bidline." },
  failed: { label: "Could not read", cls: "bg-destructive/10 text-destructive", help: "Claude could not read this file. Upload a clearer copy, or type the figures in." },
};
const SUP_STATUS: Record<string, string> = { invited: "Waiting for a quote", responded: "Quoted", declined: "Declined", removed: "Removed" };
const FILTERS = [["all", "All files"], ["unread", "Waiting for Claude"], ["read", "Read"], ["unmatched", "No supplier"]] as const;

const iconOf = (mime: string) =>
  mime.startsWith("image/") ? ImageIcon : /sheet|excel|csv|tab-separated|opendocument.spreadsheet/.test(mime) ? FileSpreadsheet : /rfc822/.test(mime) ? Mail : FileText;

export function DocumentsBoard({ rfxId, code, canEdit, suppliers, docs }: { rfxId: string; code: string; canEdit: boolean; suppliers: Sup[]; docs: Doc[] }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("all");
  const [text, setText] = useState("");
  const [uploadOpen, setUploadOpen] = useState(docs.length === 0);
  const unread = docs.filter((d) => d.status === "unread").length;
  const unmatched = docs.filter((d) => !d.supplier_id && d.kind !== "rfx_pack").length;
  const prompt = `In Bidline, read every unread supplier document on ${code} and submit the quotes and questionnaire answers.`;

  const shown = useMemo(() => {
    const t = text.trim().toLowerCase();
    return docs.filter((d) =>
      (filter === "all" || (filter === "unmatched" ? !d.supplier_id && d.kind !== "rfx_pack" : d.status === filter)) &&
      (!t || d.filename.toLowerCase().includes(t)));
  }, [docs, filter, text]);

  const groups = useMemo(() => {
    const out: Array<{ key: string; title: string; sub: string; docs: Doc[]; warn?: boolean }> = [];
    const loose = shown.filter((d) => !d.supplier_id && d.kind !== "rfx_pack");
    if (loose.length) out.push({ key: "none", title: "Not matched to a supplier", sub: "Pick the supplier so Claude files the prices under the right name.", docs: loose, warn: true });
    for (const s of suppliers) {
      const list = shown.filter((d) => d.supplier_id === s.id);
      if (list.length || (filter === "all" && !text)) out.push({ key: s.id, title: `${s.code} ${s.name}`, sub: SUP_STATUS[s.status] ?? s.status, docs: list });
    }
    const ours = shown.filter((d) => d.kind === "rfx_pack" && !d.supplier_id);
    if (ours.length) out.push({ key: "ours", title: "Our enquiry documents", sub: "What you sent to suppliers.", docs: ours });
    return out;
  }, [shown, suppliers, filter, text]);

  return (
    <div className="grid gap-3">
      {unread && canEdit ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-night px-4 py-3 text-on-dark">
          <ClaudeMark className="size-5 shrink-0" />
          <p className="min-w-0 flex-1 text-[13.5px]"><span className="font-medium">{unread} file{unread === 1 ? " is" : "s are"} waiting for your Claude.</span> <span className="text-fog">Paste this into a Claude chat with Bidline switched on:</span></p>
          <CopyOnDark text={prompt} />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Filter files">
          {FILTERS.map(([k, l]) => {
            const n = k === "all" ? docs.length : k === "unmatched" ? unmatched : docs.filter((d) => d.status === k).length;
            if (k === "unmatched" && !n) return null;
            return (
              <button key={k} role="tab" aria-selected={filter === k} onClick={() => setFilter(k)}
                className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[13px] ${filter === k ? "bg-night text-on-dark" : "text-ink-secondary hover:bg-muted"}`}>
                {l}<span className="num text-[11px] opacity-70">{n}</span>
              </button>
            );
          })}
        </div>
        <label className="relative ml-auto min-w-[180px] flex-1 sm:max-w-[260px]">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-secondary" />
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Find a file" aria-label="Find a file"
            className="h-8 w-full rounded-lg bg-card pr-2 pl-8 text-[13px] ring-1 ring-border outline-none focus:ring-2 focus:ring-primary/50" />
        </label>
        {canEdit ? (
          <button onClick={() => setUploadOpen(!uploadOpen)} aria-expanded={uploadOpen} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-[13px] text-white hover:bg-primary/90">
            <Upload className="size-3.5" /> Upload
          </button>
        ) : null}
      </div>

      {uploadOpen && canEdit ? <Uploader rfxId={rfxId} suppliers={suppliers.map((s) => ({ code: s.code, name: s.name }))} /> : null}

      {groups.map((g) => <Group key={g.key} g={g} rfxId={rfxId} canEdit={canEdit} suppliers={suppliers} />)}
      {!docs.length ? (
        <p className="rounded-xl bg-card px-4 py-8 text-center text-[14px] text-ink-secondary ring-1 ring-border">No files yet. Upload the quotes your suppliers sent, or attach them in a Claude chat and ask Claude to save them here.</p>
      ) : !shown.length ? <p className="px-1 text-[13px] text-ink-secondary">No files match.</p> : null}
    </div>
  );
}

function Group({ g, rfxId, canEdit, suppliers }: { g: { key: string; title: string; sub: string; docs: Doc[]; warn?: boolean }; rfxId: string; canEdit: boolean; suppliers: Sup[] }) {
  const [open, setOpen] = useState(true);
  const unread = g.docs.filter((d) => d.status === "unread").length;
  return (
    <section className={`overflow-hidden rounded-xl bg-card ring-1 ${g.warn ? "ring-warning/40" : "ring-border"}`}>
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/40">
        <ChevronDown className={`size-4 shrink-0 text-ink-secondary transition ${open ? "" : "-rotate-90"}`} />
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-[14px] font-medium ${g.warn ? "text-warning" : ""}`}>{g.title}</span>
          <span className="block truncate text-[12px] text-ink-secondary">{g.sub}</span>
        </span>
        <span className="num shrink-0 text-[12px] text-ink-secondary">{g.docs.length} file{g.docs.length === 1 ? "" : "s"}{unread ? <span className="text-warning"> · {unread} waiting</span> : null}</span>
      </button>
      {open ? (
        g.docs.length ? (
          <ul className="border-t border-border">
            {g.docs.map((d) => {
              const Icon = iconOf(d.mime_type);
              const st = STATUS[d.status] ?? STATUS.unread;
              return (
                <li key={d.id} className="grid gap-x-3 gap-y-1 border-b border-border px-4 py-2 last:border-0 sm:grid-cols-[minmax(0,1fr)_110px_150px_auto] sm:items-center">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <Icon className="size-4 shrink-0 text-ink-secondary" />
                    <a href={`/api/files/${d.id}`} target="_blank" rel="noreferrer" className="group inline-flex min-w-0 items-center gap-1 text-[13.5px] hover:text-primary">
                      <span className="truncate">{d.filename}</span><ExternalLink className="size-3 shrink-0 opacity-0 group-hover:opacity-100" />
                    </a>
                  </span>
                  <span className="text-[12px] text-ink-secondary">{KIND[d.kind] ?? d.kind} · {Math.max(1, Math.round(d.byte_size / 1024))} KB</span>
                  <span className="text-[12px] text-ink-secondary">
                    {d.source === "claude" ? "Saved by Claude" : d.source === "seed" ? "Demo file" : "Uploaded"} {new Date(d.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  </span>
                  <span className="flex items-center gap-2 sm:justify-end">
                    <Tip text={st.help}><span tabIndex={0} className={`rounded-full px-2 py-0.5 text-[11.5px] whitespace-nowrap ${st.cls}`}>{st.label}</span></Tip>
                    {canEdit ? (
                      <Popover>
                        <PopoverTrigger aria-label={`Change details of ${d.filename}`} className="rounded-md p-1 text-ink-secondary hover:bg-muted hover:text-foreground"><Pencil className="size-3.5" /></PopoverTrigger>
                        <PopoverContent align="end" className="w-[300px]">
                          <p className="mb-2 text-[12.5px] text-ink-secondary">Which supplier sent it, what it is, and whether Claude has read it. Saved as you change it.</p>
                          <DocumentRowForm rfxId={rfxId} doc={d} suppliers={suppliers.map((s) => ({ code: s.code, name: s.name }))} />
                        </PopoverContent>
                      </Popover>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : <p className="border-t border-border px-4 py-2.5 text-[12.5px] text-ink-secondary">No files from this supplier yet.</p>
      ) : null}
    </section>
  );
}

function CopyOnDark({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" onClick={async () => { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1800); }}
      className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-white px-3 text-[13px] text-night hover:bg-fog">
      {done ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}{done ? "Copied" : "Copy request"}
    </button>
  );
}
