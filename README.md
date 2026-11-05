# Bidline

**Claude reads the supplier quotes. Bidline does the maths, keeps the record and gets it approved.**

Live app: **https://bidline-app.vercel.app**

Bidline is a procurement workspace. Each purchase is a **sourcing event** (an RFQ by default, or an RFP, RFI or tender). A buyer asks three to five suppliers for quotes. The replies come back as a spreadsheet, a PDF, a Word letter, an email and a phone photo of a rate card. Today someone retypes all of it into one sheet before anyone can compare a price, and a "box of 10" priced per piece quietly makes the wrong supplier win.

Bidline is the system of record around the buyer's own Claude:

- **Claude** (the customer's own plan, connected over MCP) reads each supplier document and reports what it says: the price exactly as written, in the supplier's unit and currency, with their own words and where they appear.
- **Bidline** stores it, converts units and currencies, works out landed prices, ranks them, decides questionnaire pass or fail, lists what each supplier still owes, and drafts an award note that the approver signs off on a link. A person can open the app, see everything Claude created, and change it, on the record.

**There is no AI inside Bidline.** No model SDKs, no AI keys. `npm run check:no-ai` proves it.

---

## Try it

1. Sign in at https://bidline-app.vercel.app (test login in the submission email), or create an account.
2. Connect Claude. On first sign-in a popup walks you through it and confirms "Claude MCP connected" as soon as Claude reaches Bidline. The link is also on the Connect Claude page.
   - **Claude on the web or desktop:** Settings, then Connectors, then *Add custom connector*. Name it Bidline, paste the link, add. In a chat, switch Bidline on from the tools menu.
   - **Claude Code:** `claude mcp add --transport http bidline <your link>`
3. Answer one question, "How do you want to start?":
   - **Use demo data:** loads a fictional IT hardware enquiry with five supplier replies attached and unread.
   - **Use my own files:** tell Claude what you are buying (or fill a short form), then upload supplier replies (PDF, Excel, Word, email, photos).
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
| Home | Organisation dashboard: key figures, pipeline by stage, ways to save, what needs attention, recent activity. A second tab, My work, is the person's own queue; items can be assigned to a teammate or snoozed |
| Sidebar | Home, Pinned (drag to reorder, starred events), Sourcing (views by stage, suppliers), Insights (spend analytics, audit log), Claude (ask, tools, connection), Organisation (admins), the open event's sections, and an account menu with the organisation and role |
| Search and alerts | ⌘K search over events, suppliers, documents and line items; a notification bell; optional email notifications and Slack, Teams or webhook alerts |
| All events | Views (needs attention, by stage, awaiting approval, archived) with counts, search, owner and sort, all kept in the link |
| Event page | Steps as tabs with counts (each person can reorder or hide them), a "Next" banner, Star, Access (restrict to named people), Duplicate, Archive, Export, and the audit trail fixed on the right |
| Teams and roles | Workspaces with Admin, Buyer, Approver and Viewer roles, invites, restricted events. Approvers decide inside the app; nobody approves their own award; requests expire after a set time; extra approval steps above set values; a limit on one supplier's share of an award |
| Audit log | Organisation-wide and per event, with filters, CSV export and a sealed hash chain that shows any edited or deleted entry. Entries cannot be edited |
| Suppliers and spend | A supplier directory across events (reply rate, wins, corrections) and spend analytics against budget |
| Overview | Charts from the same figures as the grid: price against budget, lines won, quote quality, spend by category (each with a table view) |
| Audit trail | Side panel: every change on the event, who made it (Claude, the buyer, the approver), when, and the before and after values. Read-only |
| Ask | Instant answers worked out in code (cheapest, savings against budget, price differences, categories, qualification, what is owed, a line, a supplier); anything else is handed to your Claude |
| Settings | Profile; your own mailbox for supplier follow-ups (SMTP with an app password, checked before saving, stored encrypted); Claude link; defaults |
| Comparison | Line by supplier grid of landed prices per asked unit. Lowest comparable price highlighted; caveats, prices needing a person and missing prices marked without relying on colour alone |
| Cell drawer | Supplier's words, document and location, each conversion step, flags (including unusually high or low prices), correction with reason, undo, comments, history |
| Documents | Grouped by supplier, with filters and search; drag and drop files; assign supplier and kind; open the original |
| Lines | Edit what Claude created: items, units, pack sizes, quantities, budgets. Vague lines are flagged before issuing. Notes on any line |
| Suppliers | Contacts, status, terms as read, stated totals, conditional offers |
| Questionnaire | Pass, fail or not assessed per question, with the sentence that decided it. Remove a question with a reason |
| Follow-ups | Pick a supplier: what they still owe, and the email that asks for it with Send on top. Optional automatic reminders |
| Award | Award options with like-for-like restatement; award note and approval link; withdraw an award awaiting approval |
| Rules & items | Exchange rates, unit rules, prior-order rates, items that match no line |
| Exports | Comparison as Excel (with an audit-trail sheet) or CSV |

## MCP tools (51)

All tools, what each does and whether it reads or changes, are listed in the app under Claude tools, where an admin can switch any of them off for the workspace. A person's Claude is offered only the tools their role allows; a read-only connector link offers reading tools only.


Orientation: `get_started`, `list_rfxs`, `list_open_work`, `get_rfx`. Enquiry: `create_rfx`, `duplicate_rfx`, `update_rfx`, `upsert_lines`, `add_line_note`, `add_questions`, `remove_questions`, `issue_rfx`, `add_suppliers`, `update_supplier`. Reading: `list_documents`, `read_document`, `save_document_text`, `submit_quote`, `submit_questionnaire`, `submit_second_read`. Analysis: `get_comparison`, `get_line`, `explain_cell`, `get_supplier`, `list_needs_attention`, `compare_award_options`, `what_if`, `price_history`. Changes: `correct_price`, `set_fx_rate`, `add_unit_rule`, `set_prior_po_rates`, `record_assumption`, `resolve_unmatched_item`. Follow-ups: `get_chase_list`, `email_supplier` (draft, or send from the buyer's connected mailbox), `record_chase`, `update_follow_up`. Documents also: `update_document`. Award: `create_award`, `withdraw_award`, `get_award_status`. Exports and history: `get_export_link` (24-hour download link for the Excel, CSV or activity log), `get_activity`. Across events: `search_bidline`, `supplier_scorecard`, `spend_summary`, `flag_unusual_prices`, `set_budget`, `archive_rfx`, `comment_on_price`.

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

- Follow-ups are sent through the buyer's own mailbox (SMTP). On demo events they go to the buyer's own address, because demo suppliers are fictional.
- On Claude Team and Enterprise, one connector link maps to one Bidline account; per-user sign-in (OAuth) is next.
- A scanned PDF with no text layer is read by attaching it in the Claude chat; Bidline does no OCR because that would be AI inside the app.
- Automatic reminders and approval expiry run from a daily Vercel Cron job, which needs `CRON_SECRET` set in the project.
- Notification emails go from each person's own connected mailbox to their own address; Bidline has no mail server of its own.
- Sign-in is throttled: 5 failed attempts per email, or 30 per network address, in 15 minutes.
- All demo companies, people and prices are fictional.
