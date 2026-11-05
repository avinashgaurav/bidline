"use client";

import { useRouter } from "next/navigation";
import { useActionState, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { updateDocumentUI, type FormState } from "@/app/actions";
import { FormMessage, fieldClass } from "@/components/form-bits";

export function Uploader({ rfxId, suppliers }: { rfxId: string; suppliers: Array<{ code: string; name: string }> }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [supplier, setSupplier] = useState("");
  const [log, setLog] = useState<Array<{ filename: string; ok: boolean; error?: string; supplier?: string | null }>>([]);

  async function send(files: FileList | File[]) {
    if (!files.length) return;
    setBusy(true);
    const results: typeof log = [];
    for (const f of Array.from(files)) {
      if (f.size > 4 * 1024 * 1024) {
        results.push({ filename: f.name, ok: false, error: "Over 4 MB. Attach it in the Claude chat instead, or upload a smaller copy." });
        continue;
      }
      const form = new FormData();
      form.append("files", f);
      if (supplier) form.append("supplier", supplier);
      try {
        const res = await fetch(`/api/rfx/${rfxId}/upload`, { method: "POST", body: form });
        const body = await res.json().catch(() => ({ error: `Upload failed (${res.status}).` }));
        results.push(...(body.results ?? [{ filename: f.name, ok: false, error: body.error ?? `Upload failed (${res.status}).` }]));
      } catch (e) {
        results.push({ filename: f.name, ok: false, error: (e as Error).message });
      }
      setLog([...results]);
    }
    setLog(results);
    router.refresh();
    setBusy(false);
    if (input.current) input.current.value = "";
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); send(e.dataTransfer.files); }}
      className={`grid gap-4 rounded-xl border-2 border-dashed p-6 ${drag ? "border-primary bg-lavender" : "border-input bg-card"}`}
    >
      <div className="flex flex-wrap items-center gap-4">
        <span className="grid size-11 place-items-center rounded-full bg-secondary text-primary"><Upload className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="font-medium">Drop supplier documents here</p>
          <p className="text-sm text-ink-secondary">PDF, Excel, Word, email (.eml), CSV, text or photos. Up to 4 MB each. Files stay unread until you ask Claude to read them.</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <select value={supplier} onChange={(e) => setSupplier(e.target.value)} className={`${fieldClass} w-auto`} aria-label="Which supplier sent these">
          <option value="">Supplier: detect from file name</option>
          {suppliers.map((s) => <option key={s.code} value={s.code}>{s.code} {s.name}</option>)}
        </select>
        <input ref={input} type="file" multiple hidden onChange={(e) => e.target.files && send(e.target.files)}
          accept=".pdf,.xlsx,.xls,.ods,.csv,.tsv,.docx,.odt,.eml,.txt,.md,.rtf,.jpg,.jpeg,.png,.webp,.gif" />
        <Button type="button" onClick={() => input.current?.click()} disabled={busy}>{busy ? "Uploading..." : "Choose files"}</Button>
      </div>
      {log.length ? (
        <ul className="grid gap-1 text-sm">
          {log.map((r, i) => (
            <li key={i} className={r.ok ? "text-success" : "text-destructive"}>
              {r.filename}: {r.ok ? `uploaded${r.supplier ? `, from ${r.supplier}` : ", supplier unknown"}` : r.error}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function DocumentRowForm({ rfxId, doc, suppliers }: {
  rfxId: string; doc: { id: string; kind: string; supplier_code: string | null; status: string }; suppliers: Array<{ code: string; name: string }>;
}) {
  const [state, action] = useActionState<FormState, FormData>(updateDocumentUI.bind(null, rfxId, doc.id), {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-2" onChange={(e) => (e.currentTarget as HTMLFormElement).requestSubmit()}>
      <select name="supplier" defaultValue={doc.supplier_code ?? ""} className={`${fieldClass} h-8 w-auto text-xs`} aria-label="Supplier">
        <option value="">Supplier unknown</option>
        {suppliers.map((s) => <option key={s.code} value={s.code}>{s.code} {s.name}</option>)}
      </select>
      <select name="kind" defaultValue={doc.kind} className={`${fieldClass} h-8 w-auto text-xs`} aria-label="Document type">
        <option value="quotation">Quote</option>
        <option value="questionnaire">Questionnaire</option>
        <option value="certificate">Certificate or evidence</option>
        <option value="rfx_pack">Our enquiry document</option>
        <option value="other">Other</option>
      </select>
      <select name="status" defaultValue={doc.status} className={`${fieldClass} h-8 w-auto text-xs`} aria-label="Read status">
        <option value="unread">Unread</option>
        <option value="read">Read</option>
      </select>
      <FormMessage state={state.error ? state : undefined} />
    </form>
  );
}
