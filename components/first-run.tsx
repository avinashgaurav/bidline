"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { X } from "lucide-react";
import { StartChoice } from "@/components/start-choice";
import { ConnectStep } from "@/components/onboarding";
import { markStartedUI } from "@/app/actions";

// "Skip" is remembered per person, so a teammate on the same browser still sees the step.
const keyFor = (userId: string) => `bidline:connect-skipped:${userId}`;
const listeners = new Set<() => void>();
const readSkipped = (key: string) => {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
};
const setSkipped = (key: string) => {
  try {
    localStorage.setItem(key, "1");
  } catch {
    // private window: the step shows again next time, which is harmless
  }
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/**
 * The first run, one question at a time, as popups over the dashboard:
 *   1. demo data or your own files: asked once to every person who can edit,
 *      even when the workspace already has events or Claude is connected
 *   2. connect Claude (skippable)
 * then the organisation dashboard. "New sourcing event" anywhere reopens step 1.
 */
export function FirstRun({ started, hasEvents, canEdit, connected, connectorUrl, userId }: {
  started: boolean; hasEvents: boolean; canEdit: boolean; connected: boolean; connectorUrl: string; userId: string;
}) {
  const path = usePathname();
  const sp = useSearchParams();
  const skipKey = keyFor(userId);
  const skipped = useSyncExternalStore(subscribe, () => readSkipped(skipKey), () => true);
  // "Closed" is remembered separately for the first-run question and for "New sourcing event",
  // and the latter resets each time ?new=1 comes back, so the New button always opens it.
  const [closedFirst, setClosedFirst] = useState(false);
  const [closedNew, setClosedNew] = useState(false);
  // set once the person answers "Tell Claude", so a refresh does not pull the instructions away
  const [answered, setAnswered] = useState(false);
  const [closedConnect, setClosedConnect] = useState(false);

  const wantsNew = sp.get("new") === "1";
  const welcome = sp.get("welcome");
  const [prev, setPrev] = useState({ wantsNew, welcome });
  if (prev.wantsNew !== wantsNew || prev.welcome !== welcome) {
    setPrev({ wantsNew, welcome });
    if (wantsNew) setClosedNew(false);
    if (welcome === "demo") setClosedConnect(false);
  }

  const showStart = canEdit && ((wantsNew && !closedNew) || (!closedFirst && (answered || (!started && !welcome))));
  // keep the connect card on screen after the first call lands, until the person moves on
  const [justConnected, setJustConnected] = useState(false);
  const isConnected = connected || justConnected;
  // Step 2 always follows step 1; afterwards it shows until connected or skipped.
  const showConnect = !showStart && !closedConnect && !connected && (welcome === "demo" || (!skipped && hasEvents));
  const connectOpen = showConnect || (justConnected && !closedConnect);
  // Only an empty Home insists on an answer; anywhere else, or once there are events, it can be closed.
  const mustAnswer = !hasEvents && !wantsNew && !answered && path === "/";

  // The browser's own history call: it syncs useSearchParams without a server round trip,
  // so a closed popup's ?new=1 is gone and the New button can open it again from Home.
  const clearParams = () => {
    if (wantsNew || welcome) window.history.replaceState(null, "", path);
  };
  const closeStart = () => {
    setClosedNew(true);
    setClosedFirst(true);
    // Save the answer once, on the first-run close; a server action in flight would also cancel the URL change below.
    if (!started && !closedFirst && !wantsNew) markStartedUI().catch(() => {});
    clearParams();
  };
  const closeConnect = (skip: boolean) => {
    if (skip) setSkipped(skipKey);
    setClosedConnect(true);
    clearParams();
  };

  if (showStart) {
    return (
      <Modal label="Start a sourcing event" onClose={mustAnswer ? undefined : closeStart}>
        <p className="mb-1.5 text-[12px] font-medium tracking-[0.06em] text-ink-secondary uppercase">{wantsNew ? "New sourcing event" : connected ? "Getting started" : "Step 1 of 2"}</p>
        <StartChoice heading={wantsNew ? "How do you want to start this one?" : "How would you like to start?"}
          connected={isConnected} onTellClaude={() => setAnswered(true)} />
      </Modal>
    );
  }
  if (connectOpen) {
    return (
      <Modal label="Connect Claude" onClose={() => closeConnect(!isConnected)}>
        <ConnectStep url={connectorUrl} connected={isConnected} stepLabel={welcome === "demo" ? "Step 2 of 2" : null}
          onConnected={() => setJustConnected(true)}
          onSkip={() => closeConnect(true)} onContinue={() => closeConnect(false)} />
      </Modal>
    );
  }
  return null;
}

function Modal({ label, onClose, children }: { label: string; onClose?: () => void; children: React.ReactNode }) {
  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-label={label}
      className="fixed inset-0 z-50 overflow-y-auto bg-night/35 backdrop-blur-[8px] backdrop-saturate-150 motion-safe:animate-in motion-safe:fade-in-0">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative max-h-[calc(100dvh-32px)] w-full max-w-[560px] overflow-y-auto rounded-2xl bg-card p-5 shadow-[0_1px_2px_rgba(23,23,33,0.06),0_28px_70px_-16px_rgba(23,23,33,0.4)] sm:p-7 motion-safe:animate-in motion-safe:zoom-in-95 motion-safe:fade-in-0 motion-safe:duration-300">
          {onClose ? (
            <button onClick={onClose} aria-label="Close" className="absolute top-4 right-4 rounded-lg p-1.5 text-ink-secondary hover:bg-muted hover:text-foreground"><X className="size-4" /></button>
          ) : null}
          {children}
        </div>
      </div>
    </div>
  );
}
