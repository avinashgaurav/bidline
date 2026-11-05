import type { Comparison } from "@/lib/comparison";
import { DocumentsBoard } from "./documents-board";

/** Supplier files for one event, grouped by supplier so it stays readable at 5 or 50 files. */
export function DocumentsTab({ cmp, canEdit }: { cmp: Comparison; canEdit: boolean }) {
  return (
    <DocumentsBoard
      rfxId={cmp.rfx.id}
      code={cmp.rfx.code}
      canEdit={canEdit}
      suppliers={cmp.suppliers.map((s) => ({ id: s.id, code: s.code, name: s.name, status: s.status }))}
      docs={cmp.documents.map((d) => ({
        id: d.id, supplier_id: d.supplier_id, supplier_code: d.supplier_code, kind: d.kind, filename: d.filename, mime_type: d.mime_type,
        byte_size: d.byte_size, source: d.source, status: d.status, read_at: d.read_at, created_at: d.created_at,
      }))}
    />
  );
}
