import Link from "next/link";
import { ArrowRight, ExternalLink, Plus } from "lucide-react";

export const metadata = { title: "Docs · Bidline" };

const SECTIONS = [
  ["flow", "The flow"],
  ["connect", "Connect Claude"],
  ["roles", "Roles and permissions"],
  ["tools", "Claude tools"],
  ["audit", "Audit log"],
  ["email", "Email for follow-ups"],
  ["security", "Data and security"],
  ["faq", "Questions"],
] as const;

const FLOW: Array<[string, string]> = [
  ["Create a sourcing event", "Tell Claude what you are buying, or create it here. An event can be an RFQ, RFP, RFI or tender."],
  ["Collect quotes", "Upload supplier files on the Documents step, or attach them in a Claude chat. Excel, PDF, Word, email and photos all work."],
  ["Claude reads them", "Ask Claude to read the unread documents. Each price arrives with the supplier's own words and where they appear."],
  ["Compare and check", "Bidline converts units and currencies and ranks the quotes. Click any price to see how it was worked out. Correct it with a reason."],
  ["Follow up", "Bidline lists what each supplier still owes and drafts the email. You send it from your own mailbox."],
  ["Award", "Draft the award note and send the approval link to your approver. Every step is in the audit log."],
];

const ROLES: Array<[string, string]> = [
  ["Admin", "Everything, including the team, Claude tools and every sourcing event."],
  ["Buyer", "Creates and runs sourcing events, reads quotes, sends follow-ups and drafts awards."],
  ["Approver", "Sees everything. Approves or rejects awards in the app or on the approval link, and adds notes."],
  ["Viewer", "Read-only. Can look at events and comparisons but not change them."],
];

const TOOL_GROUPS: Array<[string, string]> = [
  ["Getting started", "See your events and what is waiting on you."],
  ["Set up an event", "Create it, add line items, suppliers and questions, then issue it."],
  ["Read supplier documents", "Open each file and record what the quote says."],
  ["Compare and decide", "Pull the comparison, explain a price, price award options."],
  ["Correct and set rules", "Fix a price with a reason, set exchange rates and unit rules."],
  ["Follow up", "List what suppliers owe and draft or send the email."],
  ["Award, export, history", "Draft the award, get an Excel link, read the activity."],
];

const FAQ: Array<[string, string]> = [
  ["Can I attach files straight into Claude?", "Yes. Claude reads them and submits the prices. Upload the file in Bidline too if you want the original linked to every price."],
  ["A PDF is a scan with no text.", "Attach it in the Claude chat; Claude reads the image. Bidline does no OCR, because that would be AI inside the app."],
  ["How do I get an Excel file?", "Open the sourcing event and use Export at the top right, or ask Claude for a 24-hour download link."],
  ["Why did a price drop out of the totals?", "It needs review: unreadable, two reads disagreed, no source quoted, or not a firm price. Open the price to see why."],
];

const link = "text-primary underline-offset-4 hover:underline";

export default function DocsPage() {
  return (
    <div className="mx-auto grid max-w-[1080px] gap-8 pb-16 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-14">
      <nav aria-label="On this page" className="hidden lg:block">
        <div className="sticky top-6 grid gap-0.5 text-[14px]">
          <p className="mb-2 px-3 text-[12px] font-medium text-ink-secondary">On this page</p>
          {SECTIONS.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="rounded-lg px-3 py-1.5 text-ink-secondary transition-colors hover:bg-muted hover:text-foreground">{label}</a>
          ))}
        </div>
      </nav>

      <div className="grid max-w-[68ch] gap-9">
        <header className="grid gap-3">
          <h1 className="text-[30px] leading-tight text-balance">How Bidline works</h1>
          <p className="text-[17px] leading-relaxed text-ink-secondary" style={{ fontWeight: 360 }}>
            Bidline is where your team compares supplier quotes. Your own Claude reads each document and reports the prices exactly as written.
            Bidline does the rest: it converts units and currencies, ranks the quotes, lists what is missing and gets the award approved.
          </p>
          <p className="text-[14px] text-ink-secondary">There is no AI inside Bidline. Reading happens in your Claude, on your Claude plan.</p>
        </header>

        <Doc id="flow" title="The flow">
          <ol className="grid gap-4">
            {FLOW.map(([t, d], i) => (
              <li key={t} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
                <span className="num grid size-7 place-items-center rounded-full bg-secondary text-[13px] text-primary">{i + 1}</span>
                <div className="pt-0.5">
                  <p className="font-medium">{t}</p>
                  <p className="mt-0.5 text-[14px] text-ink-secondary">{d}</p>
                </div>
              </li>
            ))}
          </ol>
        </Doc>

        <Doc id="connect" title="Connect Claude">
          <p>
            Open <Link href="/connect" className={link}>Connect Claude</Link> and copy your private link. In Claude, go to Settings, then Connectors,
            then Add custom connector, and paste it. In a chat, switch Bidline on from the tools menu.
          </p>
          <p>
            On Claude Team and Enterprise plans, an Owner adds the connector under Organization settings first. Members then connect it themselves.
          </p>
          <ul className="grid gap-1.5 text-[14px]">
            <li><a className={`inline-flex items-center gap-1 ${link}`} href="https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp" target="_blank" rel="noreferrer">Claude: custom connectors <ExternalLink aria-hidden className="size-3.5" /></a></li>
            <li><a className={`inline-flex items-center gap-1 ${link}`} href="https://claude.com/docs/connectors/custom/remote-mcp" target="_blank" rel="noreferrer">Claude: add a connector that isn&apos;t in the directory <ExternalLink aria-hidden className="size-3.5" /></a></li>
            <li><a className={`inline-flex items-center gap-1 ${link}`} href="https://modelcontextprotocol.io" target="_blank" rel="noreferrer">What MCP is <ExternalLink aria-hidden className="size-3.5" /></a></li>
          </ul>
        </Doc>

        <Doc id="roles" title="Roles and permissions">
          <p>Each person in a workspace has a role. The role decides what they can see and change.</p>
          <dl className="grid divide-y divide-border overflow-hidden rounded-xl bg-card ring-1 ring-border">
            {ROLES.map(([role, can]) => (
              <div key={role} className="grid gap-0.5 px-4 py-3 sm:grid-cols-[110px_minmax(0,1fr)] sm:gap-4">
                <dt className="font-medium">{role}</dt>
                <dd className="text-[14px] text-ink-secondary sm:text-[15px]">{can}</dd>
              </div>
            ))}
          </dl>
          <p>Admins can also restrict a single sourcing event to named people.</p>
        </Doc>

        <Doc id="tools" title="Claude tools">
          <p>
            Claude works in Bidline through a set of tools. You never use them directly: ask Claude in plain words and it picks the right ones.
          </p>
          <ul className="grid gap-2 text-[14px]">
            {TOOL_GROUPS.map(([group, what]) => (
              <li key={group} className="grid gap-0.5 sm:grid-cols-[190px_minmax(0,1fr)] sm:gap-4">
                <span className="font-medium text-foreground">{group}</span>
                <span className="text-ink-secondary">{what}</span>
              </li>
            ))}
          </ul>
          <p>
            The full list, with an on and off switch for each tool, is on the <Link href="/tools" className={link}>Claude tools</Link> page. Admins can
            switch a tool off for the whole workspace.
          </p>
          <p>
            <Link href="/tools" className="inline-flex items-center gap-1.5 text-[14px] font-medium text-primary underline-offset-4 hover:underline">
              See all Claude tools <ArrowRight aria-hidden className="size-3.5" />
            </Link>
          </p>
        </Doc>

        <Doc id="audit" title="Audit log">
          <p>Every change is recorded, whether a person, Claude or the approver made it. Each entry shows:</p>
          <ul className="grid list-disc gap-1 pl-5 marker:text-ink-secondary">
            <li>when it happened and who did it</li>
            <li>what they did, and which item it affected</li>
            <li>the value before and after the change</li>
          </ul>
          <p>
            The <Link href="/audit" className={link}>audit log</Link> covers the whole organisation. Each sourcing event also has its own activity
            panel. Entries cannot be edited or deleted.
          </p>
        </Doc>

        <Doc id="email" title="Email for follow-ups">
          <p>
            In <Link href="/settings#email" className={link}>Settings</Link>, connect your own mailbox with an app password (Gmail, Microsoft 365, Zoho
            or any mail server). Follow-ups then go from your address and replies come back to you. The password is stored encrypted and never shown again.
          </p>
          <p>Demo suppliers are fictional, so follow-ups on the demo event go to your own address.</p>
        </Doc>

        <Doc id="security" title="Data and security">
          <ul className="grid list-disc gap-1.5 pl-5 marker:text-ink-secondary">
            <li>No AI runs inside Bidline. Reading happens in your own Claude, under your Claude plan&apos;s terms.</li>
            <li>Supplier files are kept in private storage.</li>
            <li>Original readings are never overwritten. Every edit keeps the original and a reason.</li>
            <li>Your connector link is private. Replace it in Settings if it is ever shared by mistake.</li>
          </ul>
        </Doc>

        <Doc id="faq" title="Questions">
          <div className="grid divide-y divide-border overflow-hidden rounded-xl bg-card ring-1 ring-border">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group px-4 py-3">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-medium [&::-webkit-details-marker]:hidden">
                  {q}<Plus aria-hidden className="size-4 shrink-0 text-ink-secondary transition-transform group-open:rotate-45" />
                </summary>
                <p className="mt-1.5 text-[14px] text-ink-secondary">{a}</p>
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
    <section id={id} aria-labelledby={`${id}-title`} className="grid scroll-mt-6 gap-3 border-t border-border pt-7 text-[15px] leading-relaxed">
      <h2 id={`${id}-title`} className="mb-1 text-[20px] leading-snug">{title}</h2>
      {children}
    </section>
  );
}
