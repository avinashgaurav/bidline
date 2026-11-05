"use client";

import { useActionState, useState } from "react";
import { Copy, Trash2, Undo2 } from "lucide-react";
import { addLineNoteUI, duplicateRfxUI, removeQuestionUI, withdrawAwardUI, type FormState } from "@/app/actions";
import { FormMessage, SubmitButton, fieldClass } from "@/components/form-bits";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const pill = "inline-flex h-8 items-center gap-1.5 rounded-full bg-secondary px-3 text-[14px] outline-none hover:bg-lavender focus-visible:ring-3 focus-visible:ring-ring/30";

/** Copy this event into a new draft for a repeat purchase. */
export function DuplicateButton({ rfxId, title }: { rfxId: string; title: string }) {
  const [state, action] = useActionState<FormState, FormData>(duplicateRfxUI.bind(null, rfxId), {});
  return (
    <Dialog>
      <DialogTrigger className={pill}><Copy className="size-3.5" /> Duplicate</DialogTrigger>
      <DialogContent className="sm:max-w-[460px]">
        <DialogTitle className="text-[18px] font-medium">Duplicate this event</DialogTitle>
        <DialogDescription className="text-[13px] text-ink-secondary">
          For a repeat purchase. Copies the line items, budgets, suppliers and questionnaire into a new draft. No quotes, documents or decisions are copied.
        </DialogDescription>
        <form action={action} className="grid gap-3">
          <label className="grid gap-1.5 text-sm">
            <span className="text-ink-secondary">Title of the new event</span>
            <input name="title" defaultValue={`${title} (copy)`} className={fieldClass} />
          </label>
          <FormMessage state={state} />
          <div><SubmitButton>Create the copy</SubmitButton></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** A destructive change that needs a reason for the audit trail. */
function ReasonAction({ label, icon, title, text, placeholder, act }: {
  label: string; icon: React.ReactNode; title: string; text: string; placeholder: string;
  act: (s: FormState, f: FormData) => Promise<FormState>;
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<FormState, FormData>(async (s, f) => {
    const r = await act(s, f);
    if (r.ok) setOpen(false);
    return r;
  }, {});
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[12px] text-ink-secondary hover:bg-muted hover:text-destructive">{icon}{label}</DialogTrigger>
      <DialogContent className="sm:max-w-[440px]">
        <DialogTitle className="text-[18px] font-medium">{title}</DialogTitle>
        <DialogDescription className="text-[13px] text-ink-secondary">{text}</DialogDescription>
        <form action={action} className="grid gap-3">
          <label className="grid gap-1.5 text-sm">
            <span className="text-ink-secondary">Reason (kept in the audit trail)</span>
            <input name="reason" required autoFocus className={fieldClass} placeholder={placeholder} />
          </label>
          <FormMessage state={state} />
          <div><SubmitButton variant="destructive">{label}</SubmitButton></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RemoveQuestion({ rfxId, no, question }: { rfxId: string; no: string; question: string }) {
  return (
    <ReasonAction label="Remove" icon={<Trash2 className="size-3.5" />} title={`Remove question ${no}?`}
      text={`"${question}" will no longer count towards qualification. Answers already read stay in the record.`}
      placeholder="Not required for this purchase" act={removeQuestionUI.bind(null, rfxId, no)} />
  );
}

export function WithdrawAward({ rfxId, awardId }: { rfxId: string; awardId: string }) {
  return (
    <ReasonAction label="Withdraw" icon={<Undo2 className="size-3.5" />} title="Withdraw this award?"
      text="The approval link stops accepting a decision and shows that the award was withdrawn. You can draft a new award afterwards."
      placeholder="A revised quote arrived from Cygnus" act={withdrawAwardUI.bind(null, rfxId, awardId)} />
  );
}

export function AddLineNote({ rfxId, lines }: { rfxId: string; lines: Array<{ no: number; desc: string }> }) {
  const [state, action] = useActionState<FormState, FormData>(addLineNoteUI.bind(null, rfxId), {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <select name="lineNo" className={`${fieldClass} w-auto max-w-[260px]`} aria-label="Line">
        {lines.map((l) => <option key={l.no} value={l.no}>Line {l.no}: {l.desc.slice(0, 40)}</option>)}
      </select>
      <input name="text" required placeholder="e.g. Confirm the warranty terms with Vector before award" className={`${fieldClass} min-w-[240px] flex-1`} aria-label="Note" />
      <SubmitButton variant="secondary">Add note</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
