"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { ExternalLink, Undo2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { STATUS_ACTION } from "@/lib/ui";
import type { CellStatus } from "@/lib/calc/normalise";
import type { CellView, GridView, SupplierView } from "@/lib/view";
import { cellHistory, correctCellUI, undoCorrectionUI, type FormState } from "@/app/actions";
import { Field, FormMessage, SubmitButton, fieldClass } from "@/components/form-bits";

const num = (n: number | null | undefined) => (n === null || n === undefined ? "" : Math.round(n).toLocaleString("en-IN"));

const STATUSES = [
  ["quoted", "Quoted"], ["substituted", "Different make or model"], ["downgraded", "Below specification"],
  ["not_quoted", "Declined by supplier"], ["illegible", "Unreadable"], ["omitted", "Missing from quote"],
] as const;

export function CellDrawer({ rfxId, supplier, line, cell, isBest, onClose }: {
  rfxId: string; supplier: SupplierView; line: GridView["lines"][number]; cell: CellView | undefined; isBest: boolean; onClose: () => void;
}) {
  const key = `${supplier.code}:${line.no}`;
  const [history, setHistory] = useState<Array<{ id: string; created_at: string; actor: string; summary: string; user_request: string | null }>>([]);
  const [state, action] = useActionState<FormState, FormData>(correctCellUI.bind(null, rfxId, supplier.code, line.no), {});
  const [undoPending, startUndo] = useTransition();
  const info = cell?.info ?? null;
  const status = (cell?.status ?? "not_read") as CellStatus;
  const what = STATUS_ACTION[status];

  useEffect(() => {
    let live = true;
    cellHistory(rfxId, key).then((h) => live && setHistory(h)).catch(() => {});
    return () => {
      live = false;
    };
  }, [rfxId, key, state, cell?.unitInr, cell?.status]);

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <p className="eyebrow">{supplier.code} · {supplier.name}</p>
          <SheetTitle className="text-[18px] font-normal">Line {line.no}: {line.desc}</SheetTitle>
          <SheetDescription>Requested quantity: {line.qty} × {line.uom}{line.packSize > 1 ? ` (pack size ${line.packSize})` : ""}</SheetDescription>
        </SheetHeader>

        <div className="grid gap-6 px-4 pb-8">
          <section className="rounded-xl bg-lavender p-5">
            {cell?.unitInr !== null && cell?.unitInr !== undefined ? (
              <>
                <p className="num text-[28px] leading-none">₹{num(cell.unitInr)} <span className="text-base text-ink-secondary">per {line.uom}</span></p>
                <p className="num mt-2 text-sm text-ink-secondary">₹{num(cell.extendedInr)} for {line.qty}{isBest ? " · lowest price on this line" : ""}</p>
              </>
            ) : (
              <p className="text-[24px]">No comparable price</p>
            )}
            <p className="mt-3 text-sm"><b className="font-medium">{what?.label}.</b> {what?.action}</p>
          </section>

          {info?.override ? (
            <section className="grid gap-2 rounded-xl bg-card p-4 ring-1 ring-primary/30">
              <p className="text-sm"><b className="font-medium">Edited by {info.override.actor === "claude" ? "Claude at the buyer's request" : "the buyer"}</b> on {new Date(info.override.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>
              <p className="text-sm text-ink-secondary">Reason: {info.override.reason}</p>
              {info.reading && info.source === "override" ? (
                <p className="text-sm text-ink-secondary">Original value: {info.reading.ccy ?? "INR"} {info.reading.price ?? "none"} {info.reading.uom ?? ""} ({info.reading.status?.replace(/_/g, " ")})</p>
              ) : null}
              <div>
                <Button variant="outline" size="sm" disabled={undoPending} onClick={() => startUndo(async () => { await undoCorrectionUI(rfxId, supplier.code, line.no); })}>
                  <Undo2 /> {undoPending ? "Undoing..." : "Undo edit"}
                </Button>
              </div>
            </section>
          ) : null}

          {info?.provenance ? (
            <section className="grid gap-2">
              <p className="eyebrow">What the supplier wrote</p>
              {cell?.raw?.price !== undefined ? <p className="num text-sm">{cell.raw.ccy ?? "INR"} {num(cell.raw.price)} {cell.raw.uom ?? ""}</p> : null}
              <blockquote className="rounded-lg bg-muted p-3 text-sm">&ldquo;{info.provenance.citedText || "no text quoted"}&rdquo;</blockquote>
              <p className="text-xs text-ink-secondary">
                {info.filename ?? "From the Claude chat"} · {info.provenance.locator}
                {info.revision && info.revision > 1 ? ` · revision ${info.revision}` : ""}
                {info.carriedForward ? " · carried forward from an earlier quote" : ""}
                {` · read confidence ${Math.round((info.confidence ?? 0) * 100)}%`}
              </p>
              {info.documentId ? (
                <a href={`/api/files/${info.documentId}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                  Open original document <ExternalLink className="size-3.5" />
                </a>
              ) : null}
              {info.verification ? (
                <p className="text-xs text-ink-secondary">Second check: {info.verification.second ?? "unreadable"} ({info.verification.by})</p>
              ) : null}
            </section>
          ) : null}

          {cell?.trace?.length ? (
            <section className="grid gap-2">
              <p className="eyebrow">How Bidline calculated this</p>
              <ol className="grid gap-2">
                {cell.trace.map((t, i) => (
                  <li key={i} className="rounded-lg border border-border p-3 text-sm">
                    <p className="font-medium">{t.rule}</p>
                    <p className="text-ink-secondary">{t.basis}</p>
                    <p className="num mt-1">{t.result}</p>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          {cell?.flags?.length ? (
            <section className="grid gap-1">
              <p className="eyebrow">Flags</p>
              <ul className="list-disc pl-5 text-sm text-ink-secondary">{cell.flags.map((f, i) => <li key={i}>{f}</li>)}</ul>
            </section>
          ) : null}

          <section className="grid gap-3 rounded-xl bg-card p-5 ring-1 ring-border">
            <p className="eyebrow">Edit this price</p>
            <p className="text-sm text-ink-secondary">Enter the supplier&apos;s price in their unit and currency. Bidline converts it. The original value is kept.</p>
            <form action={action} className="grid gap-3">
              <div className="grid grid-cols-3 gap-3">
                <Field label="Price">
                  <input name="price" inputMode="decimal" className={fieldClass} defaultValue={cell?.raw?.price ?? ""} />
                </Field>
                <Field label="Supplier's unit">
                  <input name="uom" className={fieldClass} defaultValue={cell?.raw?.uom ?? line.uom} />
                </Field>
                <Field label="Currency">
                  <input name="currency" className={fieldClass} defaultValue={cell?.raw?.ccy ?? "INR"} />
                </Field>
              </div>
              <Field label="Status">
                <select name="status" className={fieldClass} defaultValue="">
                  <option value="">No change</option>
                  {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </Field>
              <Field label="Reason (required, shown on the price and in the award note)">
                <input name="reason" required className={fieldClass} placeholder="Supplier confirmed by email on 18 Sep" />
              </Field>
              <FormMessage state={state} />
              <SubmitButton>Save</SubmitButton>
            </form>
          </section>

          <section className="grid gap-2">
            <p className="eyebrow">History</p>
            {history.length ? (
              <ol className="grid gap-2 text-sm">
                {history.map((h) => (
                  <li key={h.id} className="border-b border-border pb-2 last:border-0">
                    <span className="text-xs text-ink-secondary">{new Date(h.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} · {h.actor === "claude" ? "Claude" : h.actor === "user" ? "In the app" : h.actor}</span>
                    <p>{h.summary}</p>
                  </li>
                ))}
              </ol>
            ) : <p className="text-sm text-ink-secondary">No changes yet.</p>}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
