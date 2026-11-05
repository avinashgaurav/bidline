import { q } from "./db";
import * as A from "./actions";
import type { ActionCtx } from "./actions";

/**
 * Two smaller fictional events that sit beside the main demo, so the
 * dashboard, analytics and Claude have more than one purchase to work with:
 *   - Office furniture: every quote read and the award approved.
 *   - Housekeeping supplies: quotes partly in, an email unread, a follow-up overdue.
 * Quotes are submitted through the same action Claude uses, as Claude.
 */

type Line = { sku: string; group: string; description: string; uom: string; qty: number; baselineInr: number };
type Sup = { name: string; city: string; gstin: string; email: string; contactName: string };

const FURNITURE: { title: string; lines: Line[]; suppliers: Sup[]; prices: number[][] } = {
  title: "Office furniture, Pune office expansion",
  lines: [
    { sku: "CH-ERG-01", group: "Seating", description: "Ergonomic task chair, mesh back, adjustable arms", uom: "Nos", qty: 40, baselineInr: 14500 },
    { sku: "CH-VIS-02", group: "Seating", description: "Visitor chair, cantilever, upholstered", uom: "Nos", qty: 12, baselineInr: 5200 },
    { sku: "WS-1200", group: "Workstations", description: "Workstation 1200 x 600 mm with screen and cable tray", uom: "Nos", qty: 20, baselineInr: 18800 },
    { sku: "ST-PED-3", group: "Storage", description: "Mobile pedestal, 3 drawers, lockable", uom: "Nos", qty: 20, baselineInr: 7400 },
    { sku: "MT-2400", group: "Meeting", description: "Meeting table 2400 x 1200 mm, laminate top", uom: "Nos", qty: 2, baselineInr: 42000 },
    { sku: "WB-1800", group: "Meeting", description: "Magnetic whiteboard 1800 x 1200 mm", uom: "Nos", qty: 6, baselineInr: 6900 },
  ],
  suppliers: [
    { name: "Featherline Seating Pvt Ltd", city: "Bengaluru", gstin: "29AAECF4417M1Z", email: "sales@featherline.example", contactName: "Nisha Rao" },
    { name: "Kosmos Interiors LLP", city: "Pune", gstin: "27AAQFK2208B1Z", email: "quotes@kosmosinteriors.example", contactName: "Amit Kale" },
    { name: "Urban Office Works", city: "Mumbai", gstin: "27AAJFU6630R1Z", email: "rfq@urbanofficeworks.example", contactName: "Sara Dsouza" },
  ],
  prices: [
    [13950, 5050, 18400, 7150, 44500, 6450],
    [14400, 4890, 17650, 7480, 40900, 6990],
    [13600, 5390, 19100, 6950, 41800, 7200],
  ],
};

const SUPPLIES: { title: string; lines: Line[]; suppliers: Sup[]; prices: Array<number[] | null> } = {
  title: "Housekeeping and pantry supplies, Q4",
  lines: [
    { sku: "HK-FLR-5L", group: "Cleaning", description: "Floor cleaner concentrate, 5 L can", uom: "Can", qty: 60, baselineInr: 640 },
    { sku: "HK-TIS-100", group: "Paper", description: "Tissue roll, 2 ply, pack of 10", uom: "Pack", qty: 120, baselineInr: 310 },
    { sku: "HK-GBG-L", group: "Cleaning", description: "Garbage bags, large, 30 per roll", uom: "Roll", qty: 200, baselineInr: 145 },
    { sku: "PT-TEA-1K", group: "Pantry", description: "Tea leaves, CTC, 1 kg", uom: "Kg", qty: 40, baselineInr: 520 },
    { sku: "PT-COF-500", group: "Pantry", description: "Instant coffee, 500 g jar", uom: "Jar", qty: 30, baselineInr: 690 },
    { sku: "PT-SUG-1K", group: "Pantry", description: "Sugar sachets, 1 kg box of 200", uom: "Box", qty: 25, baselineInr: 380 },
    { sku: "PT-CUP-1K", group: "Pantry", description: "Paper cups 150 ml, pack of 1000", uom: "Pack", qty: 15, baselineInr: 950 },
    { sku: "HK-SAN-500", group: "Cleaning", description: "Hand sanitiser, 500 ml pump", uom: "Nos", qty: 80, baselineInr: 210 },
  ],
  suppliers: [
    { name: "CleanCart Facility Supplies", city: "Pune", gstin: "27AAKFC3381N1Z", email: "orders@cleancart.example", contactName: "Rohit Jain" },
    { name: "Sahyadri Traders", city: "Pune", gstin: "27ABMPS7721K1Z", email: "sahyadri.traders@example.com", contactName: "Meera Joshi" },
    { name: "Metro Pantry Solutions", city: "Mumbai", gstin: "27AAHCM5590D1Z", email: "bids@metropantry.example", contactName: "Farhan Shaikh" },
    { name: "GreenLeaf Hygiene", city: "Nashik", gstin: "27AAPFG4410Q1Z", email: "", contactName: "Vikram Patil" },
  ],
  // null = no quote read yet
  prices: [
    [615, 298, 139, 505, 712, 365, 905, 199],
    [598, 315, 151, 489, 668, 372, 935, 205],
    null,
    null,
  ],
};

const CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
function withCheckDigit(first14: string) {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const p = CHARS.indexOf(first14[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(p / 36) + (p % 36);
  }
  return first14 + CHARS[(36 - (sum % 36)) % 36];
}

const daysFrom = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

function emailQuote(sup: Sup, title: string, lines: Line[], prices: number[]) {
  return [
    `From: ${sup.contactName} <${sup.email || "noreply@example.com"}>`,
    `Subject: Quotation for ${title}`,
    "",
    "Dear Sir or Madam,",
    "",
    "Please find our best rates below, ex-GST, delivered to your Pune office.",
    "",
    ...lines.map((l, i) => `${i + 1}. ${l.description}: Rs ${prices[i].toLocaleString("en-IN")} per ${l.uom}`),
    "",
    "GST 18% extra. Payment 30 days. Delivery within 3 weeks of PO. Offer valid 30 days.",
    "",
    `Regards,\n${sup.contactName}\n${sup.name}`,
  ].join("\n");
}

async function readQuote(claude: ActionCtx, code: string, sup: Sup, supCode: string, title: string, lines: Line[], prices: number[]) {
  const text = emailQuote(sup, title, lines, prices);
  const { doc } = await A.saveTextDocumentAction(claude, code, { filename: `${sup.name.split(" ")[0]}_quotation.eml.txt`, text, supplierRef: supCode, kind: "quotation" });
  await A.submitQuoteAction(claude, {
    rfx: code, supplier: supCode, documentId: doc.id,
    extraction: {
      vendorRef: `${supCode}-Q1`,
      terms: { gst: "18% extra", payment: "30 days", validity: "30 days", delivery: "3 weeks from PO", freight: "Delivered Pune" },
      rows: lines.map((l, i) => ({
        rfxLineNo: i + 1, vendorDescription: l.description, status: "quoted", price: prices[i], uom: l.uom, currency: "INR",
        confidence: 0.97, provenance: { locator: `email line ${i + 1}`, citedText: `${l.description}: Rs ${prices[i].toLocaleString("en-IN")} per ${l.uom}`, method: "email_text" },
      })),
    },
  });
}

async function makeEvent(user: ActionCtx, spec: { title: string; lines: Line[]; suppliers: Sup[] }, due: string, approver: { name: string; email: string }) {
  const { rfx } = await A.createRfxAction(user, {
    title: spec.title, dueDate: due, approver, lines: spec.lines,
    suppliers: spec.suppliers.map((s) => ({ name: s.name, city: s.city, gstin: withCheckDigit(s.gstin), contactName: s.contactName, email: s.email || null })),
  });
  await q("update rfx set created_via = 'demo' where id = $1", [rfx.id]);
  return rfx;
}

export async function seedExtraDemos(userId: string) {
  const user: ActionCtx = { userId, actor: "user" };
  const claude: ActionCtx = { userId, actor: "claude", tool: "submit_quote", userRequest: "Read the supplier quotes and submit them" };

  // 1. Office furniture: issued, all quotes read, award drafted and approved on the link.
  const f = await makeEvent(user, FURNITURE, daysFrom(-12), { name: "Rajat Menon", email: "rajat.menon@example.com" });
  await A.issueRfxAction(user, f.code);
  const fSups = await q<{ code: string; name: string }>("select code, name from suppliers where rfx_id = $1 order by code", [f.id]);
  for (const [i, s] of fSups.entries()) await readQuote(claude, f.code, FURNITURE.suppliers[i], s.code, f.title, FURNITURE.lines, FURNITURE.prices[i]);
  const award = await A.createAwardAction(user, { rfx: f.code, scenario: "cheapest_all" });
  await A.decideAwardAction({ token: award.token, decision: "approved", name: "Rajat Menon", note: "Approved. Spread across two suppliers is fine." });

  // 2. Housekeeping: issued, two quotes read, one emailed reply waiting for Claude, one follow-up overdue.
  const h = await makeEvent(user, SUPPLIES, daysFrom(3), { name: "Rajat Menon", email: "rajat.menon@example.com" });
  await q("update suppliers set contact = contact || '{\"email\":\"greenleaf.hygiene@example.com\"}'::jsonb where rfx_id = $1 and name = $2", [h.id, "GreenLeaf Hygiene"]);
  await A.issueRfxAction(user, h.code);
  const hSups = await q<{ code: string }>("select code from suppliers where rfx_id = $1 order by code", [h.id]);
  for (const [i, s] of hSups.entries()) {
    const p = SUPPLIES.prices[i];
    if (p) await readQuote(claude, h.code, SUPPLIES.suppliers[i], s.code, h.title, SUPPLIES.lines, p);
  }
  // Metro's reply arrived but nobody has asked Claude to read it yet.
  await A.saveTextDocumentAction(user, h.code, {
    filename: "Metro_Pantry_reply.eml.txt", supplierRef: hSups[2].code, kind: "quotation",
    text: emailQuote(SUPPLIES.suppliers[2], h.title, SUPPLIES.lines, [629, 305, 142, 512, 701, 359, 889, 214]),
  });
  await q("update documents set status = 'unread' where rfx_id = $1 and filename = 'Metro_Pantry_reply.eml.txt'", [h.id]);
  // GreenLeaf has not replied: a follow-up went out and its reply-by date has passed.
  await A.recordChaseAction(user, { rfx: h.code, supplier: hSups[3].code, dueDate: daysFrom(-2), subject: `Reminder: quotation for ${h.title}`, message: "Dear Vikram, we have not yet received your quotation. Please send it by the date below so we can include you. Regards, Procurement", send: false, to: "greenleaf.hygiene@example.com" });
  return [f.code, h.code];
}
