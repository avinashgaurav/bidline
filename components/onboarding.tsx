"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, Check, Copy, ExternalLink } from "lucide-react";
import { Mark } from "@/components/brand";
import { ClaudeMark } from "@/components/claude-mark";

const CLAUDE_GUIDE = "https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp";

/** Step two of the first run: connect Claude. Watches for the first call and shows it landing. */
export function ConnectStep({ url, connected, onConnected, onSkip, onContinue }: {
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
        <p className="text-[12px] font-medium tracking-[0.06em] text-ink-secondary uppercase">Step 2 of 2</p>
        <h2 id="onboarding-title" className="mt-1.5 text-[26px] leading-tight">{connected ? "Claude is connected" : "Connect your Claude"}</h2>
        <p className="mx-auto mt-2 max-w-[44ch] text-[16px] text-ink-secondary">
          {connected
            ? "Your Claude can now read supplier quotes into Bidline. Every price it reads appears here, ready to check."
            : "Bidline has no AI of its own. Your Claude reads each supplier file and sends the prices here; Bidline checks them, compares them and keeps the record. Takes about a minute."}
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

      {connected ? (
        <div className="grid gap-2 rounded-xl bg-muted px-4 py-3 text-[13.5px]">
          <p className="font-medium">What happens now</p>
          {[
            "In a Claude chat with Bidline switched on, ask it to read your supplier documents.",
            "Prices appear in Compare quotes within seconds, each linked to the line it came from.",
            "Every change Claude or your team makes is written to the audit log, with who and when.",
          ].map((t, i) => (
            <p key={t} className="flex gap-2.5 text-ink-secondary"><span className="num grid size-5 shrink-0 place-items-center rounded-full bg-card text-[11px] text-primary">{i + 1}</span>{t}</p>
          ))}
        </div>
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
        {connected ? <span /> : <button onClick={onSkip} className="text-sm text-ink-secondary hover:text-foreground">Skip, I&apos;ll connect later</button>}
        <button onClick={onContinue} disabled={!connected}
          className="inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-5 text-[16px] text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-ink-secondary">
          Go to the dashboard <ArrowRight className="size-4" />
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
