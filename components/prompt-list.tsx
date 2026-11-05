import { CopyButton } from "@/components/copy-button";

export const STARTER_PROMPTS = [
  "In Bidline, read every unread supplier document on my latest sourcing event and submit the quotes.",
  "In Bidline, what needs review before I can compare these quotes?",
  "Using only Bidline's figures, which qualified supplier should we award each line to, and why?",
  "In Bidline, send a follow-up to each supplier for anything still missing, due in three days.",
  "In Bidline, draft the award using qualified suppliers only and give me the approval link for the CFO.",
];

export const OWN_DATA_PROMPT =
  "Create a sourcing event in Bidline: 40 business laptops (16GB, 512GB SSD, 3-year warranty) and 40 docking stations, due in two weeks. " +
  "Invite Zenith Infotech and Orbit Systems, and add ISO 27001:2022 certification as a mandatory question.";

export function PromptList({ prompts = STARTER_PROMPTS }: { prompts?: string[] }) {
  return (
    <ul className="grid gap-1.5">
      {prompts.map((p) => (
        <li key={p} className="flex items-start justify-between gap-3 rounded-lg bg-muted px-3 py-2.5 text-[13px] leading-snug">
          <span>&ldquo;{p}&rdquo;</span>
          <CopyButton text={p} />
        </li>
      ))}
    </ul>
  );
}
