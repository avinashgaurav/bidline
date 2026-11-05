"use client";

import { useActionState, useState } from "react";
import { Archive, ArchiveRestore, Check, Lock, Stamp, Unlock, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { archiveRfxUI, decideAwardInAppUI, setEventAccessUI, type FormState } from "@/app/actions";
import { FormMessage, SubmitButton, areaClass, fieldClass } from "@/components/form-bits";
import { roleLabel } from "@/lib/roles";

const btn = "inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] ring-1 ring-border hover:bg-muted";

export function ArchiveButton({ rfxId, archived }: { rfxId: string; archived: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<FormState, FormData>(archiveRfxUI.bind(null, rfxId, !archived), {});
  if (archived) {
    return (
      <form action={action}>
        <button className={btn}><ArchiveRestore className="size-3.5" /> Restore</button>
        <FormMessage state={state.error ? state : undefined} />
      </form>
    );
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className={btn}><Archive className="size-3.5" /> Archive</DialogTrigger>
      <DialogContent className="sm:max-w-[440px]">
        <DialogTitle className="text-[18px] font-medium">Archive this sourcing event?</DialogTitle>
        <DialogDescription className="text-[13px] text-ink-secondary">It leaves the lists and the dashboard but keeps everything: quotes, the audit log and the award. Restore it any time from Sourcing events, Archived.</DialogDescription>
        <form action={action} className="grid gap-3">
          <label className="grid gap-1.5 text-sm"><span className="text-ink-secondary">Reason (optional, kept in the audit log)</span>
            <input name="reason" className={fieldClass} placeholder="Purchase completed" /></label>
          <FormMessage state={state} />
          <div><SubmitButton>Archive</SubmitButton></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AccessButton({ rfxId, restricted, people, members, createdBy }: {
  rfxId: string; restricted: boolean; people: string[]; createdBy: string;
  members: Array<{ user_id: string; name: string; email: string; role: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [limit, setLimit] = useState(restricted);
  const [state, action] = useActionState<FormState, FormData>(async (s, f) => {
    const r = await setEventAccessUI(rfxId, s, f);
    if (r.ok) setOpen(false);
    return r;
  }, {});
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className={btn}>{restricted ? <Lock className="size-3.5" /> : <Unlock className="size-3.5" />} {restricted ? "Restricted" : "Access"}</DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogTitle className="text-[18px] font-medium">Who can see this event</DialogTitle>
        <DialogDescription className="text-[13px] text-ink-secondary">By default everyone in the workspace can open it, with what their role allows. Restrict it for sensitive purchases.</DialogDescription>
        <form action={action} className="grid gap-4">
          <div className="grid gap-2 text-[14px]">
            <label className="flex items-start gap-2.5"><input type="radio" name="restricted" value="no" checked={!limit} onChange={() => setLimit(false)} className="mt-1 accent-[#5266eb]" />
              <span><span className="font-medium">Everyone in the workspace</span><span className="block text-[12.5px] text-ink-secondary">Each person can do what their role allows.</span></span></label>
            <label className="flex items-start gap-2.5"><input type="radio" name="restricted" value="yes" checked={limit} onChange={() => setLimit(true)} className="mt-1 accent-[#5266eb]" />
              <span><span className="font-medium">Only the people I choose</span><span className="block text-[12.5px] text-ink-secondary">Admins and the person who created it always see it.</span></span></label>
          </div>
          {limit ? (
            <fieldset className="grid max-h-[240px] gap-1 overflow-y-auto rounded-lg bg-muted/60 p-2">
              {members.map((m) => {
                const always = m.role === "admin" || m.user_id === createdBy;
                return (
                  <label key={m.user_id} className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13.5px] hover:bg-card">
                    <input type="checkbox" name="people" value={m.user_id} defaultChecked={always || people.includes(m.user_id)} disabled={always} className="accent-[#5266eb]" />
                    <span className="min-w-0 flex-1 truncate">{m.name} <span className="text-ink-secondary">· {roleLabel(m.role)}</span></span>
                    {always ? <span className="text-[11.5px] text-ink-secondary">{m.role === "admin" ? "Admin" : "Creator"}, always</span> : null}
                  </label>
                );
              })}
            </fieldset>
          ) : null}
          <FormMessage state={state} />
          <div><SubmitButton>Save access</SubmitButton></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** For approvers signed in to the app: decide without the link. */
export function DecideAward({ rfxId, awardId, stepLabel }: { rfxId: string; awardId: string; stepLabel?: string | null }) {
  const [state, action] = useActionState<FormState, FormData>(decideAwardInAppUI.bind(null, rfxId, awardId), {});
  return (
    <form action={action} className="grid gap-3 rounded-xl bg-lavender p-4">
      <div className="flex items-center gap-2">
        <Stamp className="size-4 text-primary" />
        <p className="text-[15px] font-medium">Your decision{stepLabel ? ` (${stepLabel})` : ""}</p>
      </div>
      <p className="-mt-1 text-[13px] text-ink-secondary">You are signed in as an approver, so you can decide here. Your name and the time go into the audit log.</p>
      <textarea name="note" rows={2} className={areaClass} placeholder="Note for the buyer (needed when rejecting or asking for changes)" />
      <div className="flex flex-wrap items-center gap-2">
        <button name="decision" value="approved" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-success px-4 text-[14px] text-white hover:bg-success/90"><Check className="size-4" /> Approve</button>
        <button name="decision" value="changes_requested" className="inline-flex h-9 items-center rounded-lg bg-card px-4 text-[14px] ring-1 ring-border hover:bg-muted">Ask for changes</button>
        <button name="decision" value="rejected" className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[14px] text-destructive hover:bg-destructive/10"><X className="size-4" /> Reject</button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
