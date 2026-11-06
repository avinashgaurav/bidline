import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { head, put } from "@vercel/blob";
import catalog from "./data/demo-rfx.json";
import { json, newId, q } from "./db";
import { logEvent } from "./events";
import { addSupplier, createRfx, setAssumption } from "./rfx";
import { mimeFor } from "./files";

/**
 * The optional demo: a real-looking IT hardware enquiry with 30 lines, five
 * suppliers and their replies in five formats, all fictional. The enquiry is
 * set up and the replies are attached UNREAD, so the first thing a visitor
 * does is ask Claude to read them and watch the comparison fill in.
 */
const DEMO_FILES: Array<{ path: string; supplier: string | null; kind: string; status?: string }> = [
  { path: "00-rfx/01_Scope_of_Work.pdf", supplier: null, kind: "rfx_pack", status: "read" },
  { path: "00-rfx/02_Line_Items.xlsx", supplier: null, kind: "rfx_pack", status: "read" },
  { path: "00-rfx/03_Vendor_Questionnaire.xlsx", supplier: null, kind: "rfx_pack", status: "read" },
  { path: "00-rfx/04_Commercial_Terms.pdf", supplier: null, kind: "rfx_pack", status: "read" },
  { path: "01-vendor-zenith/Zenith_Quotation_ZIS-NBR-2026-1184.xlsx", supplier: "V1", kind: "quotation" },
  { path: "01-vendor-zenith/Zenith_Quotation_ZIS-NBR-2026-1184-R2_REVISED.xlsx", supplier: "V1", kind: "quotation" },
  { path: "01-vendor-zenith/Zenith_Questionnaire_Response.xlsx", supplier: "V1", kind: "questionnaire" },
  { path: "01-vendor-zenith/Zenith_ISO27001_2022.pdf", supplier: "V1", kind: "certificate" },
  { path: "02-vendor-cygnus/Cygnus_Quotation_CTI-Q-2026-0918.pdf", supplier: "V2", kind: "quotation" },
  { path: "02-vendor-cygnus/Cygnus_ISO27001_2022.pdf", supplier: "V2", kind: "certificate" },
  { path: "03-vendor-orbit/Orbit_Offer_OSS-QT-2026-27-0442.docx", supplier: "V3", kind: "quotation" },
  { path: "03-vendor-orbit/Orbit_Questionnaire_Response.docx", supplier: "V3", kind: "questionnaire" },
  { path: "04-vendor-vector/IMG_20260917_1142_vector_rate_card.jpg", supplier: "V4", kind: "quotation" },
  { path: "04-vendor-vector/Vector_Questionnaire_Response.pdf", supplier: "V4", kind: "questionnaire" },
  { path: "04-vendor-vector/VDS_ISO27001.pdf", supplier: "V4", kind: "certificate" },
  { path: "05-vendor-helios/helios_reply_2026-09-17.eml", supplier: "V5", kind: "quotation" },
];

async function sampleBytes(path: string): Promise<Buffer> {
  try {
    return await readFile(join(process.cwd(), "public", "samples", path));
  } catch {
    const base = process.env.APP_URL
      ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");
    const res = await fetch(`${base}/samples/${path}`);
    if (!res.ok) throw new Error(`sample ${path} is not available (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }
}

/** Upload a sample once to shared storage; every demo enquiry points at the same file. */
async function sharedSample(path: string) {
  const pathname = `samples/${path}`;
  try {
    const h = await head(pathname);
    return { pathname, url: h.url, size: h.size, sha: h.etag.replace(/"/g, "") };
  } catch {
    const bytes = await sampleBytes(path);
    const blob = await put(pathname, bytes, { access: "private", contentType: mimeFor(path), addRandomSuffix: false, allowOverwrite: true });
    return { pathname, url: blob.url, size: bytes.length, sha: createHash("sha256").update(bytes).digest("hex") };
  }
}

/** The main demo event's title, used to load it only once per workspace. */
export const DEMO_TITLE = catalog.rfx.title;

export async function seedDemoRfx(userId: string): Promise<string> {
  const r = catalog.rfx;
  const rfx = await createRfx(userId, {
    title: r.title,
    dueDate: r.due,
    buyer: { ...r.buyer_contact, company: catalog.buyer.legal_name },
    approver: r.approver,
    termsAsked: {
      delivery: r.incoterm_asked, tax: r.tax_basis_asked, payment: r.payment_asked,
      validity: r.validity_asked, currency: r.currency_asked,
    },
    notes: "Demo enquiry. Every company, person and price in it is fictional.",
    lines: catalog.lines.map((l) => ({
      no: l.no, sku: l.sku, group: l.group, description: l.desc, spec: l.spec, uom: l.uom,
      packSize: l.pack_size, qty: l.qty, hsn: l.hsn, baselineInr: l.baseline_inr,
    })),
    questions: catalog.questionnaire.map((x) => ({ no: x.no, question: x.q, mandatory: x.kind === "M", documentRequired: x.doc_required })),
    createdVia: "demo",
  });
  await q("update rfx set status = 'issued', issued_at = $2 where id = $1", [rfx.id, r.issued]);

  // The buyer's own reference data for this enquiry: unit rules and the last order's rates.
  await setAssumption(rfx.id, {
    key: "uom_aliases", value: catalog.uom_aliases, setBy: "buyer",
    source: "This enquiry's unit table: different words for the same unit",
  });
  await setAssumption(rfx.id, {
    key: "uom_conversions", value: catalog.uom_conversions, setBy: "buyer",
    source: "This enquiry's line specs: one kit = 2 DIMMs, one box = 10 or 50 pieces",
  });
  await setAssumption(rfx.id, {
    key: "prior_po", value: catalog.prior_po, setBy: "buyer",
    source: `Prior purchase order ${catalog.prior_po.po_number} dated ${catalog.prior_po.po_date}`,
  });

  const codes: Record<string, string> = {};
  for (const v of catalog.vendors) {
    const s = await addSupplier(rfx.id, {
      name: v.name, code: v.code, city: v.city, gstin: v.gstin, contactName: v.contact,
      email: v.email, phone: v.phone, channel: v.reply_channel?.includes("WhatsApp") ? "WhatsApp" : "email",
    });
    codes[v.code] = s.id;
  }

  await Promise.all(DEMO_FILES.map(async (f) => {
    const blob = await sharedSample(f.path);
    const filename = f.path.split("/").pop()!;
    await q(
      `insert into documents (id, rfx_id, supplier_id, kind, filename, mime_type, byte_size, sha256, blob_url, blob_pathname, source, status, read_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'seed',$11,$12)`,
      [
        newId("doc"), rfx.id, f.supplier ? codes[f.supplier] : null, f.kind, filename, mimeFor(filename),
        blob.size, blob.sha, blob.url, blob.pathname, f.status ?? "unread", f.status === "read" ? new Date().toISOString() : null,
      ],
    );
  }));

  await logEvent({
    userId, rfxId: rfx.id, actor: "user", kind: "demo_loaded",
    summary: `Loaded the demo enquiry ${rfx.code}: 30 lines, 5 suppliers, ${DEMO_FILES.filter((f) => f.supplier).length} supplier documents waiting to be read in Claude.`,
    detail: { files: json(DEMO_FILES.length) },
  });
  return rfx.id;
}
