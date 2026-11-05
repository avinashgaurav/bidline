import { ExternalLink, FileSpreadsheet, FileText, Image as ImageIcon, Mail } from "lucide-react";
import type { Comparison } from "@/lib/comparison";
import { CopyButton } from "@/components/copy-button";
import { DocumentRowForm, Uploader } from "./documents-client";

const ICON = (mime: string) =>
  mime.startsWith("image/") ? ImageIcon : /sheet|excel|csv|tab-separated|opendocument.spreadsheet/.test(mime) ? FileSpreadsheet : /rfc822/.test(mime) ? Mail : FileText;

export function DocumentsTab({ cmp }: { cmp: Comparison }) {
  const suppliers = cmp.suppliers.map((s) => ({ code: s.code, name: s.name }));
  const unread = cmp.documents.filter((d) => d.status === "unread");
  const prompt = `In Bidline, read the ${unread.length ? `${unread.length} unread` : "new"} supplier documents on ${cmp.rfx.code} one at a time and submit what each one says.`;
  return (
    <div className="grid gap-6">
      <Uploader rfxId={cmp.rfx.id} suppliers={suppliers} />
      {unread.length ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-lavender p-4 text-sm">
          <span><b className="font-medium">{unread.length} unread document{unread.length === 1 ? "" : "s"}.</b> Bidline has no AI inside. Ask Claude to read them: &ldquo;{prompt}&rdquo;</span>
          <CopyButton text={prompt} label="Copy prompt" />
        </div>
      ) : null}
      <div className="overflow-x-auto rounded-xl bg-card ring-1 ring-border">
        <table className="w-full text-sm">
          <thead className="bg-[var(--grid-head)] text-left text-xs text-ink-secondary">
            <tr><th className="px-4 py-3 font-medium">File</th><th className="px-4 py-3 font-medium">Supplier, type, status</th><th className="px-4 py-3 font-medium">Added</th></tr>
          </thead>
          <tbody>
            {cmp.documents.map((d) => {
              const Icon = ICON(d.mime_type);
              return (
                <tr key={d.id} className="border-t border-border align-middle">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Icon className="size-4 shrink-0 text-ink-secondary" />
                      <div className="min-w-0">
                        <a href={`/api/files/${d.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-primary hover:underline">
                          <span className="truncate">{d.filename}</span><ExternalLink className="size-3" />
                        </a>
                        <p className="text-xs text-ink-secondary">
                          {Math.round(d.byte_size / 1024)} KB · <code>{d.id}</code>
                          {d.status === "read" && d.read_at ? ` · read ${new Date(d.read_at).toLocaleDateString("en-IN", { dateStyle: "medium" })}` : ""}
                        </p>
                      </div>
                      {d.status === "unread" ? <span className="ml-auto rounded-full bg-warning/10 px-2 py-0.5 text-xs text-warning">Unread</span> : null}
                    </div>
                  </td>
                  <td className="px-4 py-3"><DocumentRowForm rfxId={cmp.rfx.id} doc={d} suppliers={suppliers} /></td>
                  <td className="px-4 py-3 text-xs text-ink-secondary">
                    {new Date(d.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                    <span className="block">{d.source === "claude" ? "Saved by Claude" : d.source === "seed" ? "Demo file" : "Uploaded"}</span>
                  </td>
                </tr>
              );
            })}
            {!cmp.documents.length ? (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-ink-secondary">No documents yet. Upload supplier quotes above, or attach them in a Claude chat.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
