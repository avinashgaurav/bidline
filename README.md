# Bidline

**Claude reads the supplier quotes. Bidline does the maths, keeps the record and gets it approved.**

Live app: **https://bidline-app.vercel.app**

A buyer asks three to five suppliers for quotes. The replies come back as a spreadsheet, a PDF, a Word letter, an email and a phone photo of a rate card. Today someone retypes all of it into one sheet before anyone can compare a price, and a "box of 10" priced per piece quietly makes the wrong supplier win.

Bidline is the system of record around the buyer's own Claude:

- **Claude** (the customer's own plan, connected over MCP) reads each supplier document and reports what it says: the price exactly as written, in the supplier's unit and currency, with their own words and where they appear.
- **Bidline** stores it, converts units and currencies, works out landed prices, ranks them, decides questionnaire pass or fail, lists what each supplier still owes, and drafts an award note that the approver signs off on a link. A person can open the app, see everything Claude created, and change it, on the record.

**There is no AI inside Bidline.** No model SDKs, no AI keys. `npm run check:no-ai` proves it.

---

## Try it

1. Sign in at https://bidline-app.vercel.app (test login in the submission email), or create an account.
2. Connect Claude. The Connect Claude page shows your personal connector link.
   - **Claude on the web or desktop:** Settings, then Connectors, then *Add custom connector*. Name it Bidline, paste the link, add. In a chat, switch Bidline on from the tools menu.
   - **Claude Code:** `claude mcp add --transport http bidline <your link>`
3. Choose how to start:
   - **Demo:** loads a fictional IT hardware enquiry with five supplier replies attached and unread.
   - **Your own data:** describe what you are buying to Claude, then upload supplier replies (PDF, Excel, Word, email, photos).
4. Ask Claude, for example:
   - "Use Bidline: read every unread supplier document on my latest enquiry and submit what each one says."
   - "In Bidline, what needs my attention before I can compare these quotes?"
   - "Using Bidline's numbers only, who should win if we only award to qualified suppliers?"
   - "Chase every supplier for what they still owe."
   - "Draft the award on the qualified basis and give me the approval link."
5. Watch the enquiry page update by itself. Click any price to see where it came from, every step that turned it into a landed price, and its history. Correct it with a reason; the original reading is kept.

## What a person can do in the app

| Area | What it does |
|---|---|
| Comparison | Line by supplier grid of landed prices per asked unit. Lowest comparable price highlighted; caveats, prices needing a person and missing prices marked without relying on colour alone |
| Cell drawer | Supplier's words, document and location, each conversion step, flags, correction with reason, undo, history |
| Documents | Drag and drop supplier files; assign supplier and kind; open the original |
| Lines | Edit what Claude created: items, units, pack sizes, quantities, budgets. Vague lines are flagged before issuing |
| Suppliers | Contacts, status, terms as read, stated totals, conditional offers |
| Questionnaire | Pass, fail or not assessed per question, with the sentence that decided it |
| Chase | What each supplier still owes and the money riding on it; a drafted message to send |
| Award | Award options with like-for-like restatement; award note and approval link |
| Rules & items | Exchange rates, unit rules, prior-order rates, items that match no line |
| Activity | Every request made in Claude, every tool call, every edit and approval; download as `transcript.md` |
| Exports | Comparison as Excel (with an audit-trail sheet) or CSV |

## MCP tools (35)

Orientation: `get_started`, `list_rfxs`, `get_rfx`. Enquiry: `create_rfx`, `update_rfx`, `upsert_lines`, `add_questions`, `issue_rfx`, `add_suppliers`, `update_supplier`. Reading: `list_documents`, `read_document`, `save_document_text`, `submit_quote`, `submit_questionnaire`, `submit_second_read`. Analysis: `get_comparison`, `get_line`, `explain_cell`, `get_supplier`, `list_needs_attention`, `compare_award_options`, `what_if`. Changes: `correct_price`, `set_fx_rate`, `add_unit_rule`, `set_prior_po_rates`, `record_assumption`, `resolve_unmatched_item`. Follow-ups: `get_chase_list`, `record_chase`. Award: `create_award`, `get_award_status`. Exports and history: `get_export_link` (24-hour download link for the Excel, CSV or activity log), `get_activity`.

Every tool accepts an optional `user_request`, the message that led to the call, which is kept in the transcript.

## How it is built

| Part | Choice |
|---|---|
| App | Next.js 16 (App Router), React 19, Tailwind 4, shadcn primitives, Mercury-inspired design (`docs/DESIGN.md`) |
| MCP | `@modelcontextprotocol/sdk`, stateless streamable HTTP at `/mcp/<personal token>`, JSON responses |
| Data | Neon Postgres (`db/schema.sql`). Raw readings are never overwritten; corrections are a separate layer |
| Files | Vercel Blob, private store, streamed to the owner only |
| Auth | Email and password (scrypt), signed session cookie; per-user MCP token that can be replaced |
| Hosting | Vercel, functions in iad1 next to the database |

```
lib/calc/normalise.ts     the calculator: units, currency, scope, totals, award scenarios
lib/calc/questionnaire.ts pass, fail or not assessed, from facts Claude reports
lib/calc/chase.ts         what each supplier still owes
lib/extract/              the reading contract, file readers, reading rules for Claude
lib/comparison.ts         rebuilds the whole comparison from stored readings and corrections
lib/actions.ts            every change; used by both the MCP tools and the app
lib/mcp/server.ts         the MCP tools
lib/events.ts             the transcript, also the signal the screens poll to stay live
```

## Checks

```bash
npm install
vercel env pull .env.local --yes
npm run verify        # no-AI check, types, lint, calculator check
npm run test:mcp      # end-to-end through MCP and the database (needs a running app)
```

- `npm run test:calc`: for the demo enquiry, all 150 supplier-by-line cells and every headline total match a reference snapshot to the rupee.
- `scripts/mcp-e2e.ts`: a scripted MCP client creates the demo enquiry, submits five suppliers' readings, answers questionnaires, corrects and undoes a price, runs a second read, changes an exchange rate, chases, drafts an award and checks the approval page, then confirms all 150 cells after the round trip. It passes against production.

## Limits, on purpose

- Chases are recorded and copyable, not sent; email delivery is next.
- A scanned PDF with no text layer is read by attaching it in the Claude chat; Bidline does no OCR because that would be AI inside the app.
- One buyer per workspace for now; teams come next.
- All demo companies, people and prices are fictional.
