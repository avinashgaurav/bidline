"use client";

import { useActionState, useState, useTransition } from "react";
import { Eye, Send, Trash2 } from "lucide-react";
import { addChannelUI, readOnlyLinkUI, removeChannelUI, testChannelUI, type FormState } from "@/app/actions";
import { CopyButton } from "@/components/copy-button";
import { Field, FormMessage, SubmitButton, fieldClass } from "@/components/form-bits";

export function ReadOnlyLink({ url }: { url: string | null }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<FormState>({});
  const act = (create: boolean) => start(async () => setMsg(await readOnlyLinkUI(create)));
  return (
    <div className="grid gap-3">
      {url ? (
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg bg-muted px-3 py-2 text-[12px]">{url}</code>
          <CopyButton text={url} label="Copy" />
          <button onClick={() => act(true)} disabled={pending} className="h-8 rounded-lg px-3 text-[13px] text-ink-secondary ring-1 ring-border hover:bg-muted">Replace</button>
          <button onClick={() => act(false)} disabled={pending} className="h-8 rounded-lg px-3 text-[13px] text-destructive hover:bg-destructive/10">Turn off</button>
        </div>
      ) : (
        <button onClick={() => act(true)} disabled={pending} className="inline-flex h-9 w-fit items-center gap-1.5 rounded-lg bg-card px-3.5 text-[13.5px] ring-1 ring-border hover:bg-muted">
          <Eye className="size-4" /> Create a read-only link
        </button>
      )}
      <FormMessage state={msg} />
    </div>
  );
}

export function ChannelForm({ kinds, events }: { kinds: Array<{ key: string; label: string; hint: string }>; events: Array<{ key: string; label: string }> }) {
  const [state, action] = useActionState<FormState, FormData>(addChannelUI, {});
  const [kind, setKind] = useState(kinds[0].key);
  return (
    <form action={action} className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-[160px_minmax(0,1fr)]">
        <Field label="Where">
          <select name="kind" value={kind} onChange={(e) => setKind(e.target.value)} className={fieldClass}>
            {kinds.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
          </select>
        </Field>
        <Field label="Name"><input name="name" placeholder="#procurement" className={fieldClass} /></Field>
      </div>
      <Field label="Webhook link" hint={kinds.find((k) => k.key === kind)?.hint}>
        <input name="url" type="url" required placeholder="https://" className={fieldClass} />
      </Field>
      <fieldset className="grid gap-1.5">
        <legend className="mb-1 text-sm text-ink-secondary">Send these events</legend>
        {events.map((e) => (
          <label key={e.key} className="flex items-center gap-2.5 text-[13.5px]"><input type="checkbox" name="events" value={e.key} defaultChecked={e.key === "award_waiting" || e.key === "award_decided"} className="accent-[#5266eb]" />{e.label.replace(/\bmy\b/gi, "an").replace(/\bI\b/g, "someone")}</label>
        ))}
      </fieldset>
      <div className="flex flex-wrap items-center gap-3"><SubmitButton>Add channel</SubmitButton><FormMessage state={state} /></div>
    </form>
  );
}

export function ChannelRow({ c }: { c: { id: string; kind: string; name: string; events: string[]; url_hint: string; last_ok_at: string | null; last_error: string | null } }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<FormState>({});
  return (
    <li className="grid gap-1 border-b border-border py-3 last:border-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-muted px-1.5 py-px text-[11.5px] capitalize text-ink-secondary">{c.kind}</span>
        <span className="text-[14px] font-medium">{c.name}</span>
        <code className="text-[11.5px] text-ink-secondary">{c.url_hint}</code>
        <span className="ml-auto flex gap-1">
          <button onClick={() => start(async () => setMsg(await testChannelUI(c.id)))} disabled={pending} className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12.5px] ring-1 ring-border hover:bg-muted"><Send className="size-3.5" /> Test</button>
          <button onClick={() => start(async () => setMsg(await removeChannelUI(c.id)))} disabled={pending} aria-label={`Remove ${c.name}`} className="grid size-7 place-items-center rounded-md text-ink-secondary hover:bg-destructive/10 hover:text-destructive"><Trash2 className="size-3.5" /></button>
        </span>
      </div>
      <p className="text-[12.5px] text-ink-secondary">
        {c.events.join(", ").replace(/_/g, " ")}
        {c.last_error ? <span className="text-destructive"> · last attempt failed: {c.last_error}</span> : c.last_ok_at ? ` · last sent ${new Date(c.last_ok_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}` : " · not used yet"}
      </p>
      <FormMessage state={msg} />
    </li>
  );
}
