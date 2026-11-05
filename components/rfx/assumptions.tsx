import type { Comparison } from "@/lib/comparison";
import { FxForm, UnitRuleForm, UnmappedForm } from "./assumptions-client";

export function AssumptionsTab({ cmp }: { cmp: Comparison }) {
  const fx = Object.entries(cmp.rules.fx);
  const uoms = [...new Set(cmp.lines.map((l) => l.uom))];
  const notes = cmp.assumptions.filter((a) => !/^(fx:|uom_|prior_po)/.test(a.key));
  const open = cmp.unmapped.filter((u) => !u.resolution);
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <section className="grid gap-4 rounded-xl bg-card p-6 ring-1 ring-border">
        <div>
          <p className="eyebrow">Exchange rates</p>
          <p className="mt-1 text-sm text-ink-secondary">Foreign currency prices convert at the rate and source shown here. A price in a currency with no rate is excluded from totals.</p>
        </div>
        {fx.length ? (
          <ul className="grid gap-2 text-sm">{fx.map(([ccy, r]) => <li key={ccy} className="rounded-lg bg-muted p-3"><b className="font-medium">1 {ccy} = ₹{r.rate}</b><span className="block text-xs text-ink-secondary">{r.source}</span></li>)}</ul>
        ) : <p className="text-sm text-ink-secondary">No foreign currency prices yet.</p>}
        <FxForm rfxId={cmp.rfx.id} />
      </section>
      <section className="grid gap-4 rounded-xl bg-card p-6 ring-1 ring-border">
        <div>
          <p className="eyebrow">Unit of measure conversions</p>
          <p className="mt-1 text-sm text-ink-secondary">How a supplier&apos;s unit of measure converts to the RFQ unit. A factor of 1 means both names refer to the same unit.</p>
        </div>
        <ul className="grid gap-1 text-sm">
          {cmp.rules.uomConversions.map((c, i) => <li key={i}>One <b className="font-medium">{c.to_uom}</b> = {c.factor} × &ldquo;{c.from_uom}&rdquo; <span className="text-xs text-ink-secondary">({c.basis})</span></li>)}
          {!cmp.rules.uomConversions.length ? <li className="text-ink-secondary">No conversions yet.</li> : null}
        </ul>
        <UnitRuleForm rfxId={cmp.rfx.id} uoms={uoms} />
      </section>
      <section className="grid gap-3 rounded-xl bg-card p-6 ring-1 ring-border">
        <p className="eyebrow">Previous PO rates</p>
        {cmp.rules.priorPo ? (
          <>
            <p className="text-sm text-ink-secondary">{cmp.rules.priorPo.po_number}, {cmp.rules.priorPo.po_date}, {cmp.rules.priorPo.vendor}. Used when a supplier quotes &ldquo;same as last time&rdquo;. The supplier must confirm these prices before award.</p>
            <ul className="grid gap-1 text-sm">{Object.entries(cmp.rules.priorPo.rates).map(([sku, r]) => <li key={sku} className="num">{sku}: ₹{Number(r).toLocaleString("en-IN")}</li>)}</ul>
          </>
        ) : <p className="text-sm text-ink-secondary">None recorded. If a supplier refers to a previous purchase order, ask Claude to add its rates.</p>}
      </section>
      <section className="grid gap-3 rounded-xl bg-card p-6 ring-1 ring-border">
        <p className="eyebrow">Unmatched items ({open.length})</p>
        <p className="text-sm text-ink-secondary">Items a supplier quoted that are not in the RFQ. Bidline does not match them to a line unless you choose one.</p>
        {cmp.unmapped.map((u) => {
          const s = cmp.suppliers.find((x) => x.id === u.supplier_id);
          return (
            <div key={u.id} className="grid gap-2 rounded-lg bg-muted p-3 text-sm">
              <p><b className="font-medium">{s?.code}</b> &ldquo;{u.description}&rdquo; {u.price ? `${u.currency ?? "INR"} ${Number(u.price).toLocaleString("en-IN")} ${u.uom ?? ""}` : ""}</p>
              {u.resolution ? <p className="text-xs text-ink-secondary">Resolution: {u.resolution}</p> : <UnmappedForm rfxId={cmp.rfx.id} itemId={u.id} lines={cmp.lines.map((l) => ({ no: l.no, desc: l.desc }))} />}
            </div>
          );
        })}
      </section>
      {notes.length ? (
        <section className="grid gap-3 rounded-xl bg-card p-6 ring-1 ring-border xl:col-span-2">
          <p className="eyebrow">Assumptions</p>
          <ul className="grid gap-2 text-sm">{notes.map((a) => <li key={a.key}><b className="font-medium">{a.key.replace(/_/g, " ")}:</b> {String(a.value)} <span className="block text-xs text-ink-secondary">{a.source}{a.note ? `. ${a.note}` : ""}</span></li>)}</ul>
        </section>
      ) : null}
    </div>
  );
}
