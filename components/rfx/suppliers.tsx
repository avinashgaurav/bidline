import type { Comparison } from "@/lib/comparison";
import { inr } from "@/lib/view";
import { AddSupplierForm, EditSupplierForm } from "./suppliers-client";

const TERM_LABEL: Record<string, string> = {
  gst: "GST", freight: "Freight", payment: "Payment terms", validity: "Validity", delivery: "Delivery",
  fxReference: "Supplier's exchange rate", fxNote: "Exchange rate note", totalLevelDiscountPercent: "Order discount %", notes: "Notes",
};

export function SuppliersTab({ cmp }: { cmp: Comparison }) {
  return (
    <div className="grid gap-6">
      <div className="grid gap-4 xl:grid-cols-2">
        {cmp.suppliers.map((s) => {
          const info = cmp.supplierInfo[s.code];
          const v = info.verdict;
          const st = info.statedTotal as { amount?: number | null; currency?: string | null };
          return (
            <section key={s.id} className="grid gap-4 rounded-xl bg-card p-6 ring-1 ring-border">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="eyebrow">{s.code} · {s.status}</p>
                  <h3 className="mt-1 text-[18px]">{s.name}</h3>
                  <p className="text-sm text-ink-secondary">{[s.city, info.vendorRef ? `quote ${info.vendorRef}` : null, info.revision > 1 ? `revision ${info.revision}` : null].filter(Boolean).join(" · ") || "No quote read yet"}</p>
                </div>
                {cmp.questions.length ? (
                  <span className={`rounded-full px-3 py-1 text-xs ${!v.assessed ? "bg-muted text-ink-secondary" : v.qualified ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                    {!v.assessed ? "Questionnaire not read" : v.qualified ? "Qualified" : `Not qualified: ${v.failedMandatory.join(", ")}`}
                  </span>
                ) : null}
              </div>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="rounded-lg bg-muted p-3"><p className="text-xs text-ink-secondary">Lines priced</p><p className="num text-lg">{info.single.linesPriced}/{cmp.lines.length}</p></div>
                <div className="rounded-lg bg-muted p-3"><p className="text-xs text-ink-secondary">Comparable total</p><p className="num text-lg">{inr(info.single.totalInr)}</p></div>
                <div className="rounded-lg bg-muted p-3"><p className="text-xs text-ink-secondary">Supplier&apos;s stated total</p><p className="num text-lg">{st?.amount ? `${st.currency ?? "INR"} ${Number(st.amount).toLocaleString("en-IN")}` : "None"}</p></div>
              </div>
              {info.single.totalLevelDiscountPct ? (
                <p className="text-sm">Order discount of {info.single.totalLevelDiscountPct}%: {info.single.totalLevelDiscountApplied ? `applied, total ${inr(info.single.totalAfterStatedDiscountInr)}` : info.single.totalLevelDiscountWithheldReason}</p>
              ) : null}
              {Object.keys(info.terms).length ? (
                <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[140px_1fr]">
                  {Object.entries(info.terms).map(([k, val]) => (
                    <div key={k} className="contents"><dt className="text-ink-secondary">{TERM_LABEL[k] ?? k}</dt><dd>{String(val)}</dd></div>
                  ))}
                </dl>
              ) : null}
              {info.conditionalDiscounts.length ? (
                <div className="rounded-lg bg-lavender p-3 text-sm">
                  <p className="font-medium">Conditional discounts (excluded from totals)</p>
                  <ul className="mt-1 list-disc pl-5">{(info.conditionalDiscounts as Array<{ percent?: number; scope?: string; condition?: string }>).map((d, i) => <li key={i}>{d.percent ? `${d.percent}% ` : ""}{d.scope}: {d.condition}</li>)}</ul>
                </div>
              ) : null}
              {info.unreadableRegions.length ? <p className="text-sm text-warning">Unreadable sections: {info.unreadableRegions.join("; ")}</p> : null}
              <details className="text-sm">
                <summary className="cursor-pointer text-primary">Contact and status</summary>
                <div className="mt-3"><EditSupplierForm rfxId={cmp.rfx.id} s={s} /></div>
              </details>
            </section>
          );
        })}
      </div>
      <section className="rounded-xl bg-card p-6 ring-1 ring-border">
        <p className="eyebrow mb-3">Add supplier</p>
        <AddSupplierForm rfxId={cmp.rfx.id} />
      </section>
    </div>
  );
}
