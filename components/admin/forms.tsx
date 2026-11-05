"use client";

import { useActionState, useState } from "react";
import { Check, Copy } from "lucide-react";
import {
  cancelInviteUI, changeRoleUI, inviteMemberUI, removeMemberUI, renameWorkspaceUI, saveWorkspaceSettingsUI, type FormState,
} from "@/app/actions";
import { Field, FormMessage, SubmitButton, fieldClass } from "@/components/form-bits";
import { ROLES, roleLabel } from "@/lib/roles";
import type { WorkspaceSettings } from "@/lib/workspace";

export function InviteForm() {
  const [state, action] = useActionState<FormState, FormData>(inviteMemberUI, {});
  const link = state.message?.match(/https?:\/\/\S+/)?.[0];
  const [copied, setCopied] = useState(false);
  return (
    <form action={action} className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px_auto] sm:items-end">
        <Field label="Email"><input name="email" type="email" required placeholder="colleague@company.com" className={fieldClass} /></Field>
        <Field label="Role">
          <select name="role" defaultValue="buyer" className={fieldClass}>
            {ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        </Field>
        <SubmitButton>Invite</SubmitButton>
      </div>
      {link ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-success/10 px-3 py-2 text-[13px] text-success">
          <span className="min-w-0 flex-1">Invite saved. Send them this sign-up link:</span>
          <code className="max-w-full truncate rounded bg-card px-2 py-0.5 text-[12px] text-foreground">{link}</code>
          <button type="button" onClick={async () => { await navigator.clipboard.writeText(link); setCopied(true); }} className="inline-flex items-center gap-1 rounded-md bg-card px-2 py-0.5 text-foreground ring-1 ring-border">
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}{copied ? "Copied" : "Copy"}
          </button>
        </div>
      ) : <FormMessage state={state} />}
    </form>
  );
}

export function RoleSelect({ memberId, role, self }: { memberId: string; role: string; self: boolean }) {
  const [state, action] = useActionState<FormState, FormData>(changeRoleUI.bind(null, memberId), {});
  return (
    <form action={action} onChange={(e) => (e.currentTarget as HTMLFormElement).requestSubmit()} className="grid gap-1">
      <select name="role" defaultValue={role} aria-label="Role" className={`${fieldClass} h-8 w-[130px] text-[13px]`}>
        {ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}{self && r.key === role ? " (you)" : ""}</option>)}
      </select>
      {state.error ? <FormMessage state={state} /> : null}
    </form>
  );
}

export function RemoveMember({ memberId, name }: { memberId: string; name: string }) {
  const [state, action] = useActionState<FormState, FormData>(removeMemberUI.bind(null, memberId), {});
  const [sure, setSure] = useState(false);
  if (!sure) return <button type="button" onClick={() => setSure(true)} className="text-[13px] text-ink-secondary hover:text-destructive">Remove</button>;
  return (
    <form action={action} className="flex flex-wrap items-center gap-2 text-[13px]">
      <span>Remove {name}?</span>
      <SubmitButton size="sm" variant="destructive">Remove</SubmitButton>
      <button type="button" onClick={() => setSure(false)} className="text-ink-secondary">Keep</button>
      <FormMessage state={state} />
    </form>
  );
}

export function CancelInvite({ inviteId }: { inviteId: string }) {
  const [state, action] = useActionState<FormState, FormData>(cancelInviteUI.bind(null, inviteId), {});
  return (
    <form action={action} className="flex items-center gap-2">
      <button className="text-[13px] text-ink-secondary hover:text-destructive">Cancel invite</button>
      {state.error ? <FormMessage state={state} /> : null}
    </form>
  );
}

export function RenameWorkspace({ name }: { name: string }) {
  const [state, action] = useActionState<FormState, FormData>(renameWorkspaceUI, {});
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
      <Field label="Workspace name" hint="Shown in the sidebar and on award notes."><input name="name" defaultValue={name} required className={fieldClass} /></Field>
      <SubmitButton variant="secondary">Save name</SubmitButton>
      <div className="sm:col-span-2"><FormMessage state={state} /></div>
    </form>
  );
}

export function WorkflowForm({ settings }: { settings: WorkspaceSettings }) {
  const [state, action] = useActionState<FormState, FormData>(saveWorkspaceSettingsUI, {});
  const steps = [0, 1, 2].map((i) => settings.approvalSteps[i]);
  return (
    <form action={action} className="grid gap-6">
      <fieldset className="grid gap-3">
        <legend className="text-[15px] font-medium">Automatic follow-up reminders</legend>
        <p className="-mt-1 text-[13px] text-ink-secondary">When a supplier has not answered a follow-up by its reply-by date, Bidline emails them a short reminder from the buyer&apos;s connected mailbox, at most 3 times. Every reminder is in the audit log.</p>
        <label className="flex items-center gap-2.5 text-[14px]">
          <input type="checkbox" name="remindersEnabled" defaultChecked={settings.reminders.enabled} className="size-4 accent-[#5266eb]" />
          Send reminders automatically
        </label>
        <Field label="Wait between reminders (days)">
          <input name="remindersEveryDays" type="number" min={1} max={14} defaultValue={settings.reminders.everyDays} className={`${fieldClass} w-28`} />
        </Field>
      </fieldset>
      <fieldset className="grid gap-3">
        <legend className="text-[15px] font-medium">Approval steps by value</legend>
        <p className="-mt-1 text-[13px] text-ink-secondary">Every award goes to the event&apos;s approver first. Awards above a value then also go to the people below, in order, each on their own link. Leave empty for one approver.</p>
        {steps.map((s, i) => (
          <div key={i} className="grid gap-2 rounded-lg bg-muted/60 p-3 sm:grid-cols-[150px_minmax(0,1fr)_minmax(0,1fr)]">
            <Field label={`Step ${i + 2}: above (₹)`}><input name={`step${i}Above`} inputMode="numeric" defaultValue={s ? String(s.aboveInr) : ""} placeholder="e.g. 500000" className={fieldClass} /></Field>
            <Field label="Approver name"><input name={`step${i}Name`} defaultValue={s?.name ?? ""} placeholder="e.g. Head of Finance" className={fieldClass} /></Field>
            <Field label="Approver email"><input name={`step${i}Email`} type="email" defaultValue={s?.email ?? ""} placeholder="name@company.com" className={fieldClass} /></Field>
          </div>
        ))}
      </fieldset>
      <fieldset className="grid gap-3">
        <legend className="text-[15px] font-medium">Approval requests expire</legend>
        <p className="-mt-1 text-[13px] text-ink-secondary">An award with no decision after this many days expires, with the reason recorded, so nothing waits forever. 0 means never. The person who drafts an award can never approve it.</p>
        <Field label="Days before a request expires">
          <input name="approvalExpiryDays" type="number" min={0} max={90} defaultValue={settings.approvalExpiryDays} className={`${fieldClass} w-28`} />
        </Field>
      </fieldset>
      <fieldset className="grid gap-3">
        <legend className="text-[15px] font-medium">Limit per supplier</legend>
        <p className="-mt-1 text-[13px] text-ink-secondary">To spread risk, set the most of one award a single supplier should get. Awards above it are flagged to the approver in the award note.</p>
        <Field label="Largest share for one supplier (%)">
          <input name="maxSupplierSharePct" type="number" min={1} max={100} defaultValue={settings.maxSupplierSharePct ?? ""} placeholder="No limit" className={`${fieldClass} w-36`} />
        </Field>
      </fieldset>
      <div className="flex flex-wrap items-center gap-3"><SubmitButton>Save workflow settings</SubmitButton><FormMessage state={state} /></div>
    </form>
  );
}

export { roleLabel };
