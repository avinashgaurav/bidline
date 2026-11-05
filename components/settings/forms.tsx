"use client";

import { useActionState, useState } from "react";
import { CheckCircle2, ExternalLink } from "lucide-react";
import { disconnectEmailUI, saveDefaultsUI, saveEmailUI, saveProfileUI, sendTestEmailUI, type FormState } from "@/app/actions";
import { Field, FormMessage, SubmitButton, areaClass, fieldClass } from "@/components/form-bits";
import type { EmailAccount, Provider } from "@/lib/mail";

export function ProfileForm({ name, email, company, jobTitle }: { name: string; email: string; company: string; jobTitle: string }) {
  const [state, action] = useActionState<FormState, FormData>(saveProfileUI, {});
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <Field label="Name"><input name="name" defaultValue={name} required className={fieldClass} /></Field>
      <Field label="Sign-in email" hint="Used to sign in. It cannot be changed here."><input value={email} readOnly className={`${fieldClass} bg-muted`} /></Field>
      <Field label="Company"><input name="company" defaultValue={company} className={fieldClass} placeholder="Kaveri Retail India Pvt Ltd" /></Field>
      <Field label="Job title"><input name="jobTitle" defaultValue={jobTitle} className={fieldClass} placeholder="Category Manager, IT" /></Field>
      <div className="flex items-center gap-3 sm:col-span-2"><SubmitButton variant="secondary">Save profile</SubmitButton><FormMessage state={state} /></div>
    </form>
  );
}

export function DefaultsForm({ followupDays, approverName, approverEmail }: { followupDays: number; approverName: string; approverEmail: string }) {
  const [state, action] = useActionState<FormState, FormData>(saveDefaultsUI, {});
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-3">
      <Field label="Follow-up reply period" hint="Days a supplier gets to reply to a follow-up.">
        <input name="followupDays" type="number" min={1} max={30} defaultValue={followupDays} className={fieldClass} />
      </Field>
      <Field label="Default approver" hint="Used on new sourcing events."><input name="approverName" defaultValue={approverName} className={fieldClass} placeholder="CFO or Head of Procurement" /></Field>
      <Field label="Approver email"><input name="approverEmail" type="email" defaultValue={approverEmail} className={fieldClass} /></Field>
      <Field label="Base currency" hint="All comparisons are in INR, ex-GST."><input value="INR (₹)" readOnly className={`${fieldClass} bg-muted`} /></Field>
      <Field label="Default event type" hint="Change it per event."><input value="RFQ" readOnly className={`${fieldClass} bg-muted`} /></Field>
      <div className="flex items-end gap-3"><SubmitButton variant="secondary">Save defaults</SubmitButton><FormMessage state={state} /></div>
    </form>
  );
}

export function EmailForm({ account, providers, defaultName, defaultEmail }: {
  account: EmailAccount | null; providers: Provider[]; defaultName: string; defaultEmail: string;
}) {
  const [state, action] = useActionState<FormState, FormData>(saveEmailUI, {});
  const [testState, testAction] = useActionState<FormState, FormData>(async () => sendTestEmailUI(), {});
  const [offState, offAction] = useActionState<FormState, FormData>(async () => disconnectEmailUI(), {});
  const [providerId, setProviderId] = useState(account?.provider ?? "gmail");
  const preset = providers.find((p) => p.id === providerId) ?? providers[0];
  const [host, setHost] = useState(account?.smtp_host ?? preset.host);
  const [port, setPort] = useState(String(account?.smtp_port ?? preset.port));
  const [security, setSecurity] = useState(account ? (account.smtp_secure ? "ssl" : "starttls") : preset.secure ? "ssl" : "starttls");

  const choose = (id: string) => {
    setProviderId(id);
    const p = providers.find((x) => x.id === id);
    if (p && p.id !== "custom") {
      setHost(p.host);
      setPort(String(p.port));
      setSecurity(p.secure ? "ssl" : "starttls");
    }
  };

  return (
    <div className="grid gap-5">
      {account ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-success/10 px-4 py-3 text-sm text-success">
          <CheckCircle2 className="size-4" />
          <span>Connected as <b className="font-medium">{account.from_name} &lt;{account.from_email}&gt;</b>{account.verified_at ? `, checked ${new Date(account.verified_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}` : ""}.</span>
        </div>
      ) : (
        <p className="rounded-lg bg-muted px-4 py-3 text-sm text-ink-secondary">Not connected. Follow-ups are recorded in Bidline and you send them yourself.</p>
      )}
      {account?.last_error ? <p className="text-sm text-destructive">Last send failed: {account.last_error}</p> : null}

      <form action={action} className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email provider">
            <select name="provider" value={providerId} onChange={(e) => choose(e.target.value)} className={fieldClass}>
              {providers.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </Field>
          <div className="self-end text-sm text-ink-secondary">
            {preset.help}{" "}
            {preset.helpUrl ? <a href={preset.helpUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">How to create one <ExternalLink className="size-3" /></a> : null}
          </div>
          <Field label="From name" hint="What suppliers see."><input name="fromName" required defaultValue={account?.from_name ?? defaultName} className={fieldClass} /></Field>
          <Field label="From email"><input name="fromEmail" type="email" required defaultValue={account?.from_email ?? defaultEmail} className={fieldClass} /></Field>
          <Field label="Reply-to (optional)" hint="Where supplier replies go, if not the From email."><input name="replyTo" type="email" defaultValue={account?.reply_to ?? ""} className={fieldClass} /></Field>
          <Field label="SMTP username" hint="Usually your full email address."><input name="user" required defaultValue={account?.smtp_user ?? defaultEmail} className={fieldClass} autoComplete="off" /></Field>
          <Field label="SMTP server"><input name="host" required value={host} onChange={(e) => setHost(e.target.value)} className={fieldClass} placeholder="smtp.example.com" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Port"><input name="port" required inputMode="numeric" value={port} onChange={(e) => setPort(e.target.value)} className={fieldClass} /></Field>
            <Field label="Security">
              <select name="security" value={security} onChange={(e) => setSecurity(e.target.value)} className={fieldClass}>
                <option value="ssl">SSL/TLS (465)</option>
                <option value="starttls">STARTTLS (587)</option>
              </select>
            </Field>
          </div>
          <Field label="App password" hint={account ? "Saved. Leave empty to keep it." : "Not your normal password. Stored encrypted and never shown again."}>
            <input name="password" type="password" autoComplete="new-password" className={fieldClass} placeholder={account ? "••••••••••••" : ""} />
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input name="bccSelf" type="checkbox" defaultChecked={account?.bcc_self ?? true} className="size-4 accent-[var(--primary)]" />
            Send me a copy (BCC) of every follow-up
          </label>
          <div className="sm:col-span-2">
            <Field label="Signature (optional)"><textarea name="signature" rows={3} defaultValue={account?.signature ?? ""} className={areaClass} placeholder={"Regards,\nAnanya Kulkarni\nCategory Manager, IT"} /></Field>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton>{account ? "Save and check connection" : "Connect email"}</SubmitButton>
          <FormMessage state={state} />
        </div>
      </form>

      {account ? (
        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <form action={testAction}><SubmitButton variant="secondary" size="sm">Send a test email to me</SubmitButton></form>
          <form action={offAction}><SubmitButton variant="ghost" size="sm">Disconnect</SubmitButton></form>
          <FormMessage state={testState.error || testState.message ? testState : offState} />
        </div>
      ) : null}
    </div>
  );
}
