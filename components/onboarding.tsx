"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useSyncExternalStore } from "react";
import { ArrowRight, Check, Copy, ExternalLink, FileSpreadsheet, PencilLine } from "lucide-react";
import { createRfxUI, loadDemoAction, type FormState } from "@/app/actions";
import { Mark } from "@/components/brand";
import { ClaudeMark } from "@/components/claude-mark";
import { FormMessage, SubmitButton, fieldClass } from "@/components/form-bits";
import { OWN_DATA_PROMPT } from "@/components/prompt-list";

const DISMISSED = "bidline:onboarding-dismissed";
const CLAUDE_GUIDE = "https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp";

// Per-browser memory of "Skip for now", read without a hydration mismatch.
const listeners = new Set<() => void>();
const readDismissed = () => {
  try {
    return localStorage.getItem(DISMISSED) === "1";
  } catch {
    return false;
  }
};
const setDismissed = (v: boolean) => {
  try {
    if (v) localStorage.setItem(DISMISSED, "1");
    else localStorage.removeItem(DISMISSED);
  } catch {
    // private window: the popup simply shows again next time
  }
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

type Stage = "connect" | "start" | null;

/**
 * First run: connect Claude, then start a sourcing event. The dashboard stays
 * visible, blurred, behind the card, so the destination is never hidden.
 */
export function Onboarding({ connected, hasEvents, connectorUrl }: { connected: boolean; hasEvents: boolean; connectorUrl: string }) {
  const dismissed = useSyncExternalStore(subscribe, readDismissed, () => true);
  const [opened, setOpened] = useState<Stage>(null);
  const [isConnected, setIsConnected] = useState(connected);
  const auto: Stage = dismissed ? null : !isConnected ? "connect" : !hasEvents ? "start" : null;
  const stage = opened ?? auto;

  const close = () => {
    setOpened(null);
    setDismissed(true);
  };

  return (
    <>
      {!isConnected && !stage ? (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl bg-night px-5 py-3 text-sm text-on-dark">
          <ClaudeMark className="size-5" />
          <span className="flex-1">Claude is not connected yet. Bidline needs your Claude to read supplier quotes.</span>
          <button onClick={() => setOpened("connect")} className="rounded-full bg-white px-4 py-1.5 text-night hover:bg-fog">Connect Claude</button>
        </div>
      ) : null}
      {stage ? (
        <div role="dialog" aria-modal="true" aria-labelledby="onboarding-title"
          className="fixed inset-0 z-50 overflow-y-auto bg-night/30 backdrop-blur-[10px] backdrop-saturate-150 motion-safe:animate-in motion-safe:fade-in-0"
          onKeyDown={(e) => e.key === "Escape" && close()}>
          <div className="flex min-h-full items-center justify-center p-4 sm:p-8">
          <div className="w-full max-w-[560px] rounded-2xl bg-card p-7 shadow-[0_1px_2px_rgba(23,23,33,0.06),0_28px_70px_-16px_rgba(23,23,33,0.35)] sm:p-9 motion-safe:animate-in motion-safe:zoom-in-95 motion-safe:fade-in-0">
            {stage === "connect" ? (
              <ConnectStep
                url={connectorUrl}
                connected={isConnected}
                onConnected={() => {
                  // Stay on this card to show "Claude MCP connected" until Continue.
                  setOpened("connect");
                  setIsConnected(true);
                }}
                onSkip={close}
                onContinue={() => (hasEvents ? close() : setOpened("start"))}
              />
            ) : (
              <StartStep onSkip={close} />
            )}
          </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function ConnectStep({ url, connected, onConnected, onSkip, onContinue }: {
  url: string; connected: boolean; onConnected: () => void; onSkip: () => void; onContinue: () => void;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [at, setAt] = useState<string | null>(null);

  useEffect(() => {
    if (connected) return;
    let stop = false;
    const id = setInterval(async () => {
      try {
        const res = await fetch("/api/me/connection", { cache: "no-store" });
        const body = (await res.json()) as { connected?: boolean; lastMcpAt?: string };
        if (!stop && body.connected) {
          setAt(body.lastMcpAt ?? null);
          onConnected();
          router.refresh();
        }
      } catch {
        // try again on the next tick
      }
    }, 2500);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [connected, onConnected, router]);

  const copy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-7">
      <div className="flex items-center justify-center gap-3" aria-hidden>
        <span className="grid size-14 place-items-center rounded-2xl bg-lavender"><Mark size={34} /></span>
        <svg width="112" height="14" viewBox="0 0 112 14" className="overflow-visible">
          <line x1="4" y1="7" x2="108" y2="7" strokeWidth="2" strokeLinecap="round"
            className={connected ? "stroke-success transition-[stroke] duration-500" : "stroke-fog motion-safe:animate-[dash_1.1s_linear_infinite]"}
            strokeDasharray={connected ? "0" : "4 7"} />
          {connected ? (
            <g className="motion-safe:animate-in motion-safe:zoom-in-50">
              <circle cx="56" cy="7" r="9" className="fill-success" />
              <path d="M51.5 7.2l3 3 6-6" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </g>
          ) : null}
        </svg>
        <span className="grid size-14 place-items-center rounded-2xl bg-[#F6EEE8]"><ClaudeMark className="size-8" /></span>
      </div>

      <div className="text-center">
        <h2 id="onboarding-title" className="text-[28px] leading-tight">{connected ? "Claude is connected" : "Connect Claude to Bidline"}</h2>
        <p className="mx-auto mt-2 max-w-[44ch] text-[16px] text-ink-secondary">
          {connected
            ? "Your Claude can now read supplier quotes into Bidline. Every price it reads appears here, ready to check."
            : "Your Claude reads the supplier quotes. Bidline does the calculations and keeps the record. It takes about a minute."}
        </p>
      </div>

      {!connected ? (
        <ol className="grid gap-5">
          <Step n={1} title="Copy your private connector link">
            <div className="mt-2 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-muted px-3 py-2 text-[12px] text-ink-secondary">{url}</code>
              <button onClick={copy} className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm ${copied ? "bg-success/10 text-success" : "bg-primary text-white hover:bg-primary/90"}`}>
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}{copied ? "Copied" : "Copy"}
              </button>
            </div>
          </Step>
          <Step n={2} title="Add it to Claude as a custom connector">
            <p className="mt-1 text-sm text-ink-secondary">In Claude, open Settings, then Connectors, then <b className="font-medium text-foreground">Add custom connector</b>. Name it Bidline and paste the link. On Claude Team or Enterprise, an Owner adds it under Organization settings.</p>
            <div className="mt-2 flex flex-wrap gap-3 text-sm">
              <a href="https://claude.ai/settings/connectors" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">Open Claude settings <ExternalLink className="size-3.5" /></a>
              <a href={CLAUDE_GUIDE} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-ink-secondary hover:text-primary hover:underline">Claude&apos;s guide to connectors <ExternalLink className="size-3.5" /></a>
            </div>
          </Step>
          <Step n={3} title="Turn Bidline on in a chat">
            <p className="mt-1 text-sm text-ink-secondary">In a new chat, switch Bidline on from the tools menu and ask: &ldquo;What can Bidline do?&rdquo;</p>
          </Step>
        </ol>
      ) : null}

      <div className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm ${connected ? "bg-success/10 text-success" : "bg-muted text-ink-secondary"}`} aria-live="polite">
        {connected ? (
          <>
            <Check className="size-4" />
            <span className="font-medium">Claude MCP connected</span>
            <span className="ml-auto text-xs">{at ? new Date(at).toLocaleTimeString("en-IN", { timeStyle: "short" }) : "just now"}</span>
          </>
        ) : (
          <>
            <span className="relative flex size-2.5"><span className="absolute inline-flex size-full rounded-full bg-primary opacity-60 motion-safe:animate-ping" /><span className="relative inline-flex size-2.5 rounded-full bg-primary" /></span>
            <span>Waiting for Claude to connect</span>
            <span className="ml-auto text-xs">Checks automatically</span>
          </>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        {connected ? <span /> : <button onClick={onSkip} className="text-sm text-ink-secondary hover:text-foreground">Skip for now</button>}
        <button onClick={onContinue} disabled={!connected}
          className="inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-5 text-[16px] text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-ink-secondary">
          Continue <ArrowRight className="size-4" />
        </button>
      </div>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
      <span className="num grid size-7 place-items-center rounded-full bg-secondary text-[14px] font-medium text-primary">{n}</span>
      <div>
        <p className="text-[16px] font-medium">{title}</p>
        {children}
      </div>
    </li>
  );
}

function StartStep({ onSkip }: { onSkip: () => void }) {
  const [demoState, demoAction] = useActionState<FormState, FormData>(async () => loadDemoAction(), {});
  const [createState, createAction] = useActionState<FormState, FormData>(createRfxUI, {});
  const [copied, setCopied] = useState(false);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <div>
        <h2 id="onboarding-title" className="text-[28px] leading-tight">Start your first sourcing event</h2>
        <p className="mt-2 text-[16px] text-ink-secondary">One purchase with its line items, suppliers and their quotes. Pick a way in; you can add more any time.</p>
      </div>

      <div className="grid gap-3">
        <form action={demoAction} className="grid gap-3 rounded-xl bg-lavender p-5">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-card"><FileSpreadsheet className="size-4.5 text-primary" /></span>
            <div>
              <p className="font-medium">Try the demo</p>
              <p className="mt-0.5 text-sm text-ink-secondary">An IT hardware RFQ: 30 line items and five supplier quotes in Excel, PDF, Word, an email and a phone photo. Then ask Claude to read them.</p>
            </div>
          </div>
          <div className="flex items-center gap-3 pl-12"><SubmitButton>Load the demo</SubmitButton><FormMessage state={demoState} /></div>
        </form>

        <div className="grid gap-3 rounded-xl p-5 ring-1 ring-border">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#F6EEE8]"><ClaudeMark className="size-4.5" /></span>
            <div className="min-w-0">
              <p className="font-medium">Describe it to Claude</p>
              <p className="mt-0.5 text-sm text-ink-secondary">Claude creates the event here. Then upload or attach the supplier quotes.</p>
              <p className="mt-2 rounded-lg bg-muted p-3 text-[14px]">&ldquo;{OWN_DATA_PROMPT}&rdquo;</p>
              <button onClick={async () => { await navigator.clipboard.writeText(OWN_DATA_PROMPT); setCopied(true); }} className="mt-2 inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}{copied ? "Copied. Paste it in Claude" : "Copy this prompt"}
              </button>
            </div>
          </div>
        </div>

        <form action={createAction} className="grid gap-3 rounded-xl p-5 ring-1 ring-border">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted"><PencilLine className="size-4.5 text-ink-secondary" /></span>
            <div className="grid flex-1 gap-2">
              <p className="font-medium">Create it here</p>
              <div className="flex flex-wrap gap-2">
                <input name="title" required placeholder="What are you buying?" className={`${fieldClass} min-w-[200px] flex-1`} />
                <select name="eventType" defaultValue="RFQ" className={`${fieldClass} w-auto`} aria-label="Type">
                  <option value="RFQ">RFQ</option><option value="RFP">RFP</option><option value="RFI">RFI</option><option value="TENDER">Tender</option>
                </select>
                <SubmitButton variant="secondary">Create</SubmitButton>
              </div>
              <FormMessage state={createState} />
            </div>
          </div>
        </form>
      </div>

      <button onClick={onSkip} className="justify-self-start text-sm text-ink-secondary hover:text-foreground">I&apos;ll look around first</button>
    </div>
  );
}
