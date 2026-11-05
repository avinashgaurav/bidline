import * as XLSX from "xlsx";
import type { Comparison } from "./comparison";
import { cellKey } from "./comparison";

/** The comparison as rows: one per line, landed unit price per supplier, plus the cheapest. */
function rows(cmp: Comparison) {
  const head = ["Line", "SKU", "Item", "Qty", "Unit", ...cmp.suppliers.map((s) => `${s.code} ${s.name} (₹/unit)`), ...cmp.suppliers.map((s) => `${s.code} status`), "Cheapest supplier", "Cheapest ₹/unit"];
  const body = cmp.lines.map((l) => {
    const cells = cmp.suppliers.map((s) => cmp.matrix[s.code]?.[l.no]);
    const best = cmp.suppliers
      .map((s) => ({ s, c: cmp.matrix[s.code]?.[l.no] }))
      .filter((x) => x.c?.unitInr !== null && x.c?.unitInr !== undefined && (x.c.status === "comparable" || x.c.status === "comparable_with_caveat"))
      .sort((a, b) => a.c!.unitInr! - b.c!.unitInr!)[0];
    return [
      l.no, l.sku, l.desc, l.qty, l.uom,
      ...cells.map((c) => (c?.unitInr ?? "")),
      ...cmp.suppliers.map((s) => {
        const c = cmp.matrix[s.code]?.[l.no];
        const corrected = cmp.cellInfo[cellKey(s.code, l.no)]?.source === "override";
        return `${(c?.status ?? "not_read").replace(/_/g, " ")}${corrected ? " (corrected)" : ""}`;
      }),
      best ? `${best.s.code} ${best.s.name}` : "", best?.c?.unitInr ?? "",
    ];
  });
  return [head, ...body];
}

export function comparisonCsv(cmp: Comparison): string {
  const esc = (v: unknown) => {
    let s = String(v ?? "");
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "\uFEFF" + rows(cmp).map((r) => r.map(esc).join(",")).join("\n");
}

export function comparisonXlsx(cmp: Comparison): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows(cmp)), "Comparison");
  const suppliers = [["Code", "Supplier", "Status", "Comparable lines", "Total of comparable lines ₹", "Stated discount %", "Qualified"]];
  for (const s of cmp.suppliers) {
    const info = cmp.supplierInfo[s.code];
    suppliers.push([
      s.code, s.name, s.status, String(info.single.linesPriced), String(Math.round(info.single.totalInr)),
      String(info.single.totalLevelDiscountPct ?? ""),
      cmp.questions.length === 0 ? "n/a" : !info.verdict.assessed ? "not assessed" : info.verdict.qualified ? "yes" : `no (${info.verdict.failedMandatory.join(", ")})`,
    ]);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(suppliers), "Suppliers");
  const trace = [["Supplier", "Line", "Status", "Landed ₹/unit", "As written", "Source", "Cited text", "Steps"]];
  for (const s of cmp.suppliers) for (const l of cmp.lines) {
    const c = cmp.matrix[s.code]?.[l.no];
    const info = cmp.cellInfo[cellKey(s.code, l.no)];
    if (!c || c.status === "not_read") continue;
    trace.push([
      s.code, String(l.no), c.status, c.unitInr === null ? "" : String(c.unitInr),
      c.raw?.price !== undefined ? `${c.raw.ccy ?? "INR"} ${c.raw.price} ${c.raw.uom ?? ""}` : "",
      info?.filename ? `${info.filename} @ ${info.provenance?.locator ?? ""}` : "",
      info?.provenance?.citedText ?? "",
      c.trace.map((t) => `${t.rule}: ${t.result}`).join(" | "),
    ]);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(trace), "Audit trail");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
