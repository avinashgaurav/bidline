import Link from "next/link";
import { ExternalLink, Plus } from "lucide-react";

export const metadata = { title: "Docs · Bidline" };

const TOOLS: Array<[string, Array<[string, string]>]> = [
  ["Getting started", [["get_started", "What Bidline does and what is in your workspace"], ["list_rfxs", "Your sourcing events"], ["get_rfx", "One event: line items, suppliers, questionnaire"]]],
  ["Set up an event", [["create_rfx", "Create a sourcing event (RFQ, RFP, RFI or tender)"], ["update_rfx", "Change title, type, due date, status, approver"], ["upsert_lines", "Add, change or remove line items"], ["add_questions", "Add questionnaire questions"], ["remove_questions", "Remove questions, with a reason"], ["issue_rfx", "Issue to suppliers, after the clarity check"], ["add_suppliers", "Add suppliers"], ["update_supplier", "Change a supplier's details or status"], ["duplicate_rfx", "Copy an event into a new draft for a repeat purchase"], ["add_line_note", "Add a note to a line item"]]],
  ["Read supplier documents", [["list_documents", "Files on an event"], ["read_document", "Open a file for Claude to read"], ["save_document_text", "Save text from the chat as a source"], ["update_document", "Set a file's supplier, type or status"], ["submit_quote", "Store what a quote says"], ["submit_questionnaire", "Store questionnaire answers and evidence"], ["submit_second_read", "Re-read photographed prices"]]],
  ["Compare and decide", [["get_comparison", "Suppliers, coverage, totals and the grid"], ["get_line", "One line item across suppliers"], ["explain_cell", "How one price was worked out, and its history"], ["get_supplier", "One supplier in full"], ["list_needs_attention", "What needs review"], ["compare_award_options", "Every award option, priced"], ["what_if", "Price a hypothetical without saving it"]]],
  ["Correct and set rules", [["correct_price", "Edit a price with a reason, or undo"], ["set_fx_rate", "Set an exchange rate"], ["add_unit_rule", "How a supplier's unit converts"], ["set_prior_po_rates", "Rates from a previous PO"], ["record_assumption", "Note an assumption"], ["resolve_unmatched_item", "Place or dismiss an unmatched item"]]],
  ["Follow up", [["get_chase_list", "What each supplier still owes"], ["email_supplier", "Draft, or send from your mailbox"], ["record_chase", "Record a follow-up without sending"], ["update_follow_up", "Mark answered or closed"]]],
  ["Award, export, history", [["create_award", "Award note and approval link"], ["withdraw_award", "Withdraw an award awaiting approval"], ["get_award_status", "Approval status"], ["get_export_link", "24-hour Excel, CSV or activity log link"], ["get_activity", "What changed, including edits in the app"]]],
];

const SECTIONS = [
  ["flow", "The flow"],
  ["connect", "Connect Claude"],
  ["tools", "What Claude can do"],
  ["email", "Email for follow-ups"],
  ["security", "Data and security"],
  ["faq", "Questions"],
] as const;

export default function DocsPage() {
  return (
    <div className="mx-auto grid max-w-[1080px] gap-8 pb-16 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-12">
      <nav aria-label="On this page" className="hidden lg:block">
        <div className="sticky top-6 grid gap-0.5 text-[14px]">
          <p className="mb-2 px-3 text-[12px] font-medium text-ink-secondary">On this page</p>
          {SECTIONS.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="rounded-lg px-3 py-1.5 text-ink-secondary hover:bg-muted hover:text-foreground">{label}</a>
          ))}
        </div>
      </nav>
      <div className="grid max-w-[72ch] gap-10">
      <header>
        <h1 className="text-[28px] leading-tight">How Bidline works</h1>
        <p className="mt-3 text-[17px] leading-relaxed text-ink-secondary">
          Bidline is a procurement workspace for comparing supplier quotes. Your Claude reads each supplier&apos;s document and reports the prices exactly as
          written. Bidline converts units and currencies, ranks the quotes, checks qualification, lists what is missing and prepares the award for
          approval. There is no AI inside Bidline.
        </p>
      </header>

      <Doc id="flow" title="The flow">
        <ol className="grid gap-3">
          {[
            ["Create a sourcing event", "Tell Claude what you are buying, or create it here. Each event has a type: RFQ, RFP, RFI or tender."],
            ["Collect quotes", "Upload supplier files on the Documents step, or attach them in a Claude chat. Excel, PDF, Word, email and photos all work."],
            ["Claude reads them", "Ask Claude to read the unread documents. Each price lands in Bidline with the supplier's own words and where they appear."],
            ["Compare and check", "Bidline converts units and currencies and ranks the quotes. Click any price to see how it was worked out, and correct it with a reason."],
            ["Follow up", "Bidline lists what each supplier still owes and drafts the email. Send it from your own mailbox."],
            ["Award", "Draft the award note and share the approval link with your approver. Everything is in the activity log."],
          ].map(([t, d], i) => (
            <li key={t} className="grid grid-cols-[28px_1fr] gap-3">
              <span className="num grid size-7 place-items-center rounded-full bg-secondary text-[14px] text-primary">{i + 1}</span>
              <div><p className="font-medium">{t}</p><p className="text-sm text-ink-secondary">{d}</p></div>
            </li>
          ))}
        </ol>
      </Doc>

      <Doc id="connect" title="Connect Claude">
        <p>Open <Link href="/connect" className="text-primary hover:underline">Connect Claude</Link> and copy your private link. In Claude, go to Settings, then Connectors, then Add custom connector, and paste it. In a chat, switch Bidline on from the tools menu.</p>
        <p>On Claude Team and Enterprise plans, an Owner adds custom connectors under Organization settings, then members connect. Today the link belongs to one Bidline account, so a whole team using one link shares one workspace.</p>
        <p className="flex flex-wrap gap-4">
          <a className="inline-flex items-center gap-1 text-primary hover:underline" href="https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp" target="_blank" rel="noreferrer">Claude: custom connectors <ExternalLink className="size-3.5" /></a>
          <a className="inline-flex items-center gap-1 text-primary hover:underline" href="https://claude.com/docs/connectors/custom/remote-mcp" target="_blank" rel="noreferrer">Claude: add a connector that isn&apos;t in the directory <ExternalLink className="size-3.5" /></a>
          <a className="inline-flex items-center gap-1 text-primary hover:underline" href="https://modelcontextprotocol.io" target="_blank" rel="noreferrer">What MCP is <ExternalLink className="size-3.5" /></a>
        </p>
      </Doc>

      <Doc id="tools" title="What Claude can do in Bidline (42 tools)">
        <p className="text-sm text-ink-secondary">You never call these yourself. Ask Claude in plain words and it picks the right ones.</p>
        <div className="grid divide-y divide-border overflow-hidden rounded-xl bg-card ring-1 ring-border">
          {TOOLS.map(([group, tools]) => (
            <div key={group} className="px-4 py-3.5">
              <p className="mb-2 text-[14px] font-medium">{group}</p>
              <dl className="grid gap-1.5 text-sm sm:grid-cols-[210px_1fr]">
                {tools.map(([name, desc]) => (
                  <div key={name} className="contents"><dt><code className="rounded bg-muted px-1.5 py-0.5 text-[12px]">{name}</code></dt><dd className="text-ink-secondary">{desc}</dd></div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </Doc>

      <Doc id="email" title="Email for follow-ups">
        <p>In <Link href="/settings#email" className="text-primary hover:underline">Settings</Link>, connect your own mailbox with an app password (Gmail, Microsoft 365, Zoho or any mail server). Follow-ups then go from your address and replies come back to you. The password is stored encrypted and never shown again.</p>
        <p>Demo suppliers are fictional, so follow-ups on the demo event are sent to your own address.</p>
      </Doc>

      <Doc id="security" title="Data and security">
        <ul className="grid list-disc gap-1.5 pl-5">
          <li>No AI runs inside Bidline. Reading happens in your own Claude, under your Claude plan&apos;s terms.</li>
          <li>Supplier files are kept in private storage and only shown to you.</li>
          <li>Original readings are never overwritten. Every edit keeps the original and a reason.</li>
          <li>Your connector link is private. Replace it in Settings if it is ever shared by mistake.</li>
        </ul>
      </Doc>

      <Doc id="faq" title="Questions">
        <div className="grid divide-y divide-border overflow-hidden rounded-xl bg-card ring-1 ring-border">
          {[
            ["Can I attach files straight into Claude?", "Yes. Claude reads them and submits the prices. Upload the file in Bidline too if you want the original linked to every price."],
            ["A PDF is a scan with no text.", "Attach it in the Claude chat; Claude reads the image. Bidline does no OCR because that would be AI inside the app."],
            ["How do I get an Excel file?", "Open the sourcing event and use Export at the top right, or ask Claude for a 24-hour download link."],
            ["Why did a price drop out of the totals?", "It needs review: unreadable, two reads disagreed, no source quoted, or not a firm price. Open the price to see why."],
          ].map(([q, a]) => (
            <details key={q} className="group px-4 py-3">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-medium">
                {q}<Plus aria-hidden className="size-4 shrink-0 text-ink-secondary transition group-open:rotate-45" />
              </summary>
              <p className="mt-1.5 text-sm text-ink-secondary">{a}</p>
            </details>
          ))}
        </div>
      </Doc>
      </div>
    </div>
  );
}

function Doc({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="grid scroll-mt-6 gap-3 border-t border-border pt-8 text-[15px] leading-relaxed">
      <h2 className="text-[22px]">{title}</h2>
      {children}
    </section>
  );
}
