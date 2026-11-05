import Link from "next/link";
import { ArrowRight, CircleCheck } from "lucide-react";
import type { Comparison } from "@/lib/comparison";
import type { RfxRow } from "@/lib/rfx";
import { ClaudeMark } from "@/components/claude-mark";
import { CopyButton } from "@/components/copy-button";

interface Step {
  title: string;
  why: string;
  tab?: string;
  cta?: string;
  prompt?: string;
  done?: boolean;
}

/**
 * The one thing to do next on this event, worked out from its state, so a
 * first-time buyer never has to guess which tab matters now.
 */
function nextStep(rfx: RfxRow, cmp: Comparison, unread: number, needsPerson: number, openItems: number, gate: number): Step {
  const award = cmp.awards[0];
  if (!cmp.lines.length) {
    return { title: "Add what you are buying", why: "Line items are the rows every quote is compared against.", tab: "lines", cta: "Add line items",
      prompt: `In Bidline, add these line items to ${rfx.code}: ` };
  }
  if (gate) {
    return { title: `${gate} line item${gate === 1 ? " is" : "s are"} too vague to compare`, why: "Suppliers will quote different things unless the spec is clear. Fix them before issuing.", tab: "lines", cta: "Review line items" };
  }
  if (!cmp.suppliers.length) {
    return { title: "Add the suppliers you are asking", why: "Each supplier's quote becomes a column in the comparison.", tab: "suppliers", cta: "Add suppliers" };
  }
  if (!cmp.documents.length && !cmp.hasAnyReading) {
    return { title: "Collect the supplier quotes", why: "Upload each supplier's reply (Excel, PDF, Word, email or a photo), or attach them in a Claude chat.", tab: "documents", cta: "Upload quotes" };
  }
  if (unread) {
    return { title: `Ask Claude to read ${unread} unread document${unread === 1 ? "" : "s"}`, why: "Bidline has no AI inside. Your Claude reads each file and the prices appear here within seconds.",
      tab: "documents", cta: "See documents",
      prompt: `In Bidline, read the ${unread} unread supplier document${unread === 1 ? "" : "s"} on ${rfx.code} one at a time and submit what each one says.` };
  }
  if (needsPerson) {
    return { title: `Check ${needsPerson} price${needsPerson === 1 ? "" : "s"} kept out of the totals`, why: "These were unreadable, disagreed between two reads, or are not firm prices. Confirm or correct them.", tab: "comparison", cta: "Review prices" };
  }
  if (openItems && cmp.hasAnyReading) {
    return { title: `Follow up on ${openItems} missing item${openItems === 1 ? "" : "s"}`, why: "Some suppliers left lines or answers blank. Bidline has drafted the email for each.", tab: "chase", cta: "Open follow-ups",
      prompt: `In Bidline, send a follow-up to each supplier on ${rfx.code} for anything still missing, due in three days.` };
  }
  if (!award) {
    return { title: "Draft the award", why: "Compare the award options and send the approval link to your approver.", tab: "award", cta: "Open award",
      prompt: `In Bidline, draft the award on ${rfx.code} using qualified suppliers only and give me the approval link.` };
  }
  if (award.status === "sent") {
    return { title: "Waiting for approval", why: "The approval link has been created. Share it with your approver; their decision appears here.", tab: "award", cta: "View award" };
  }
  if (award.status === "approved") {
    return { title: "Award approved", why: `Approved${award.decided_by ? ` by ${award.decided_by}` : ""}. Export the comparison and activity log for your records.`, done: true };
  }
  const redraft = `In Bidline, draft a revised award on ${rfx.code} using qualified suppliers only and give me the new approval link.`;
  if (award.status === "withdrawn") {
    return { title: "Award withdrawn: draft a revised one", why: "The earlier approval link no longer accepts a decision. Draft a new award when the figures are final.", tab: "award", cta: "Open award", prompt: redraft };
  }
  if (award.status === "rejected") {
    return { title: `The approver rejected the award${award.decided_by ? ` (${award.decided_by})` : ""}`, why: award.decision_note ?? "Review the options and draft a revised award.", tab: "award", cta: "Open award", prompt: redraft };
  }
  return { title: "The approver asked for changes", why: award.decision_note ?? "Revise the award and send a new approval link.", tab: "award", cta: "Open award", prompt: redraft };
}

export function NextStep({ rfx, cmp, unread, needsPerson, openItems, gate }: {
  rfx: RfxRow; cmp: Comparison; unread: number; needsPerson: number; openItems: number; gate: number;
}) {
  const s = nextStep(rfx, cmp, unread, needsPerson, openItems, gate);
  return (
    <section aria-label="Next step" className={`flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl px-4 py-3 ${s.done ? "bg-success/10" : "bg-lavender"}`}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {s.done ? <CircleCheck className="mt-0.5 size-5 shrink-0 text-success" /> : <span className="mt-0.5 shrink-0 rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-white">Next</span>}
        <div className="min-w-0">
          <p className="text-[15px] font-medium">{s.title}</p>
          <p className="text-[13px] text-ink-secondary">{s.why}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {s.prompt ? (
          <span className="inline-flex items-center gap-2 text-[13px] text-ink-secondary">
            <ClaudeMark className="size-4" />
            <CopyButton text={s.prompt} label="Copy prompt for Claude" />
          </span>
        ) : null}
        {s.tab && s.cta ? (
          <Link href={`/rfx/${rfx.id}?tab=${s.tab}`} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-primary px-3.5 text-[14px] text-white hover:bg-primary/90">
            {s.cta} <ArrowRight className="size-3.5" />
          </Link>
        ) : null}
      </div>
    </section>
  );
}
