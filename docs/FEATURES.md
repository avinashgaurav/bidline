# Bidline features

[Back to README](../README.md) · See also: [How Bidline is used](USER-FLOW.md)

What Bidline does, feature by feature. Everything here is live at https://bidline-app.vercel.app. Bidline has no AI inside: the customer's own Claude does the reading over MCP.

## Getting started

| Feature | What it does |
|---|---|
| First run | Asks each new Buyer or Admin once: use demo data or your own files. After the demo it offers to connect Claude (skippable), then opens the dashboard. |
| Demo data | Three fictional sourcing events: IT hardware with 12 supplier files to read, office furniture already awarded, and housekeeping supplies in progress. |
| New sourcing event | Start one three ways: describe it to Claude, fill in a short form, or reuse a saved template. |

## Claude

| Feature | What it does |
|---|---|
| Ask Claude page | One place for Claude: an ask bar with instant answers from Bidline's figures, your connector link, ready-made questions, and every supplier file by event. |
| Claude connector | A private link you add to Claude once. Claude then works in Bidline as you, with your role. You can replace the link at any time. |
| 58 Claude tools | Create events, read quotes, compare, edit, chase suppliers, draft awards and more, by asking in plain words. 57 are on by default. |
| Read-only link | A second link for reviews: Claude can read and compare but cannot change anything. |
| Tools and integrations | Lists every tool, what it does and whether your role allows it. Admins switch tools on or off. |

## Running a sourcing event

| Feature | What it does |
|---|---|
| Line items, suppliers, questions | What you are buying, who is quoting, and the questions each supplier must answer. |
| Ready-to-send checklist | Shows what is missing (due date, suppliers, emails, lines) before the event goes out. |
| Documents | Upload quotes in any format: Excel, PDF, Word, email, photos. Grouped by supplier; Claude reads them. |
| Compare quotes | Puts every price on the same basis: units, pack sizes, currency and warranty are converted in code, and prices are compared against earlier order rates. Doubtful prices stay out of totals. |
| Trace a price | Click any price to see the supplier's own words, where they appear and each conversion step. |
| Edit with a record | Correct any price with a reason. The original is kept, and every change is tagged Claude or Person. |
| Unusual price flags | Marks prices far above or below the others. |
| Comments and @mentions | Discuss a price with your team; a mentioned person is notified. |
| Follow-ups | What each supplier still owes and the money at stake, with the email ready to send from your own mailbox. Automatic reminders, up to three per follow-up, once an admin switches them on. |
| Award and approval | Compares award options, drafts the award and sends one approval link. Approval steps by value, a limit on one supplier's share, no approving your own award, and requests that expire. |
| Export, archive, templates | Download to Excel, archive and restore, save an event as a template, star an event, or restrict it to named people. |
| GSTIN check | Checks a supplier's GSTIN format offline. A live status check is planned. |

## Seeing everything

| Feature | What it does |
|---|---|
| Home | Key figures, pipeline by stage, ways to save, what needs attention, quotes due and latest activity. A My work tab lists your own to-dos, which you can assign or snooze. |
| All sourcing events | Every event with views, search, filters and sorting; built for 20 events or more. |
| Supplier directory | Every supplier across events, with reply rate, wins and corrections. |
| Spend analytics | Awarded spend against budget by category, supplier, event and month. Filter by one sourcing event, or see all (the default). |
| Audit log | Every change across the organisation and per event: who, when, before and after. Sealed so edits are refused and gaps show. Export to CSV. |
| Notifications and alerts | A bell in the app, plus email, Slack, Microsoft Teams or webhook alerts, chosen per person. |
| Search (⌘K) | Find any event, supplier, document, line item or page from anywhere. |
| Live updates | Pages refresh themselves within about 10 seconds and say who changed what. |

## Team, settings and security

| Feature | What it does |
|---|---|
| Workspaces and roles | Admin, Buyer, Approver and Viewer. Invite people by link; restrict an event to named people. |
| Admin settings | Organisation, team and roles, approval steps and reminders, security and data. Tool switches are on the Claude tools page. |
| Your settings | Profile, preferences (number and date format, time zone), notifications, integrations, API and Claude, and Storage. |
| Storage | Every supplier file by sourcing event, with file counts and sizes, for the events you can open. |
| Private files | Files are shown only to people who can open the event. |

## Planned next (not built yet)

Claude sign-in for Team and Enterprise plans, Gmail and Outlook sign-in to pick up supplier replies, WhatsApp follow-ups, live GSTIN status, purchase-order export to Tally, Zoho Books and SAP, SSO, data kept in India, and negotiation rounds.
