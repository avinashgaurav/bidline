"use client";

import { useActionState, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Copy, FileSpreadsheet, FolderOpen, LayoutTemplate, PencilLine } from "lucide-react";
import { createFromTemplateUI, createRfxUI, listTemplatesUI, loadDemoAction, type FormState } from "@/app/actions";
import type { Template } from "@/lib/templates";
import { ClaudeMark } from "@/components/claude-mark";
import { Field, FormMessage, SubmitButton, fieldClass } from "@/components/form-bits";
import { OWN_DATA_PROMPT } from "@/components/prompt-list";

type Stage = "ask" | "demo" | "own" | "claude" | "form" | "template";

/**
 * Starting a sourcing event as one question at a time: demo data or your own
 * files first, and only then how to set your own one up.
 */
export function StartChoice({ heading = "How do you want to start?" }: { heading?: string }) {
  const [stage, setStage] = useState<Stage>("ask");
  const [templates, setTemplates] = useState<Template[]>([]);
  useEffect(() => {
    let live = true;
    listTemplatesUI().then((t) => live && setTemplates(t)).catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  const back = (to: Stage) => (
    <button type="button" onClick={() => setStage(to)} className="inline-flex items-center gap-1.5 text-[13px] text-ink-secondary hover:text-foreground">
      <ArrowLeft className="size-3.5" /> Back
    </button>
  );

  if (stage === "ask" || stage === "own") {
    const own = stage === "own";
    return (
      <div className="grid gap-5">
        <div>
          {own ? back("ask") : null}
          <h2 className={`${own ? "mt-3 " : ""}text-[24px] leading-tight`}>{own ? "How do you want to set it up?" : heading}</h2>
          <p className="mt-1 text-[15px] text-ink-secondary">
            {own ? "Either way, you upload the supplier quotes next and your Claude reads them." : "Pick one to begin. You can add more sourcing events, or load the demo, any time."}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {own ? (
            <>
              <Choice icon={<ClaudeMark className="size-5" />} tint="bg-[#F6EEE8]" title="Tell Claude what you are buying"
                text="Describe the purchase in a Claude chat. Claude creates the event here with line items and suppliers." onClick={() => setStage("claude")} />
              <Choice icon={<PencilLine className="size-5 text-primary" />} title="Fill in a short form here"
                text="Name the purchase, set a due date and approver. Add line items and suppliers after." onClick={() => setStage("form")} />
              {templates.length ? (
                <Choice icon={<LayoutTemplate className="size-5 text-primary" />} title="Start from a template" badge={`${templates.length}`}
                  text="Reuse the line items and questions of an earlier purchase. Add this round's suppliers after." onClick={() => setStage("template")} />
              ) : null}
            </>
          ) : (
            <>
              <Choice icon={<FileSpreadsheet className="size-5 text-primary" />} title="Use demo data" badge="2 minutes"
                text="Three ready-made purchases to explore: IT hardware with 12 quote files to read, office furniture already awarded, and housekeeping supplies in progress. All fictional."
                onClick={() => setStage("demo")} />
              <Choice icon={<FolderOpen className="size-5 text-primary" />} title="Use my own files"
                text="Set up a real purchase and upload the quotes your suppliers sent you. Only people in your workspace can see them." onClick={() => setStage("own")} />
            </>
          )}
        </div>
      </div>
    );
  }

  if (stage === "demo") return <DemoConfirm back={back("ask")} />;
  if (stage === "claude") return <ClaudeSetup back={back("own")} />;
  if (stage === "template") return <TemplateSetup back={back("own")} templates={templates} />;
  return <FormSetup back={back("own")} />;
}

function Choice({ icon, title, text, onClick, badge, tint = "bg-secondary" }: {
  icon: React.ReactNode; title: string; text: string; onClick: () => void; badge?: string; tint?: string;
}) {
  return (
    <button type="button" onClick={onClick}
      className="group grid content-start gap-3 rounded-xl bg-card p-5 text-left ring-1 ring-border transition hover:ring-2 hover:ring-primary/60 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none">
      <span className="flex items-center justify-between">
        <span className={`grid size-10 place-items-center rounded-lg ${tint}`}>{icon}</span>
        {badge ? <span className="rounded-full bg-muted px-2 py-0.5 text-[12px] text-ink-secondary">{badge}</span> : null}
      </span>
      <span>
        <span className="flex items-center gap-1.5 text-[17px] font-medium">
          {title} <ArrowRight className="size-4 text-primary opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
        </span>
        <span className="mt-1 block text-[14px] leading-snug text-ink-secondary">{text}</span>
      </span>
    </button>
  );
}

function DemoConfirm({ back }: { back: React.ReactNode }) {
  const [state, action] = useActionState<FormState, FormData>(async () => loadDemoAction(), {});
  return (
    <form action={action} className="grid gap-5">
      <div>
        {back}
        <h2 className="mt-3 text-[24px] leading-tight">Load the demo: three sourcing events</h2>
        <p className="mt-1 text-[15px] text-ink-secondary">Here is what happens next:</p>
      </div>
      <ol className="grid gap-2.5 text-[14px]">
        {[
          "An IT hardware RFQ with 30 line items, 5 suppliers and 12 supplier files waiting to be read: Excel, PDF, Word, an email and a phone photo.",
          "A few seconds later, two more arrive: office furniture, already compared and approved; and housekeeping supplies, with quotes partly in and a follow-up overdue.",
          "You ask your Claude to read them. Prices fill the comparison within seconds.",
          "You check, correct, follow up and send the award for approval.",
        ].map((t, i) => (
          <li key={t} className="flex gap-3">
            <span className="num grid size-6 shrink-0 place-items-center rounded-full bg-secondary text-[12px] text-primary">{i + 1}</span>
            <span className="pt-0.5">{t}</span>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pendingLabel="Loading the demo...">Load the demo</SubmitButton>
        <span className="text-[13px] text-ink-secondary">Takes about 20 seconds. All companies and prices are fictional.</span>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

function ClaudeSetup({ back }: { back: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="grid gap-5">
      <div>
        {back}
        <h2 className="mt-3 text-[24px] leading-tight">Tell Claude what you are buying</h2>
        <p className="mt-1 text-[15px] text-ink-secondary">Copy this example, change the details to your purchase and send it in a Claude chat with Bidline switched on. The event appears here by itself.</p>
      </div>
      <div className="rounded-xl bg-muted p-4 text-[14px] leading-relaxed">
        &ldquo;{OWN_DATA_PROMPT}&rdquo;
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={async () => { await navigator.clipboard.writeText(OWN_DATA_PROMPT); setCopied(true); }}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-sm text-white hover:bg-primary/90">
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}{copied ? "Copied" : "Copy example"}
        </button>
        <a href="https://claude.ai/new" target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-full bg-night px-4 text-sm text-on-dark hover:bg-night-raised">
          <ClaudeMark className="size-4" /> Open Claude
        </a>
      </div>
      <p className="text-[13px] text-ink-secondary">You can describe it in your own words too: what you are buying, quantities, due date, suppliers and any must-have conditions.</p>
    </div>
  );
}

function FormSetup({ back }: { back: React.ReactNode }) {
  const [state, action] = useActionState<FormState, FormData>(createRfxUI, {});
  return (
    <form action={action} className="grid gap-4">
      <div>
        {back}
        <h2 className="mt-3 text-[24px] leading-tight">Name your sourcing event</h2>
        <p className="mt-1 text-[15px] text-ink-secondary">Next you add line items, suppliers and their quotes.</p>
      </div>
      <Field label="What are you buying?">
        <input name="title" required autoFocus className={fieldClass} placeholder="Office laptops refresh, Q1" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Type">
          <select name="eventType" defaultValue="RFQ" className={fieldClass}>
            <option value="RFQ">RFQ (quotation)</option><option value="RFP">RFP (proposal)</option><option value="RFI">RFI (information)</option><option value="TENDER">Tender</option>
          </select>
        </Field>
        <Field label="Quotes due">
          <input name="dueDate" type="date" className={fieldClass} />
        </Field>
        <Field label="Approver">
          <input name="approver" className={fieldClass} placeholder="e.g. CFO name" />
        </Field>
      </div>
      <FormMessage state={state} />
      <div><SubmitButton>Create sourcing event</SubmitButton></div>
    </form>
  );
}

function TemplateSetup({ back, templates }: { back: React.ReactNode; templates: Template[] }) {
  const [state, action] = useActionState<FormState, FormData>(createFromTemplateUI, {});
  return (
    <form action={action} className="grid gap-4">
      <div>
        {back}
        <h2 className="mt-3 text-[24px] leading-tight">Start from a template</h2>
        <p className="mt-1 text-[15px] text-ink-secondary">The line items and questions are copied. You add this round&apos;s suppliers next.</p>
      </div>
      <Field label="Template">
        <select name="template" required className={fieldClass}>
          {templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.line_count} lines, {t.question_count} questions)</option>)}
        </select>
      </Field>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_170px]">
        <Field label="Name for this event (optional)"><input name="title" className={fieldClass} placeholder="Same as the template" /></Field>
        <Field label="Quotes due"><input name="dueDate" type="date" className={fieldClass} /></Field>
      </div>
      <FormMessage state={state} />
      <div><SubmitButton>Create sourcing event</SubmitButton></div>
    </form>
  );
}
