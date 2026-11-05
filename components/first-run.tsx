"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { X } from "lucide-react";
import { StartChoice } from "@/components/start-choice";
import { ConnectStep } from "@/components/onboarding";

const SKIPPED = "bidline:connect-skipped";
const listeners = new Set<() => void>();
const readSkipped = () => {
  try {
    return localStorage.getItem(SKIPPED) === "1";
  } catch {
    return false;
  }
};
const setSkipped = () => {
  try {
    localStorage.setItem(SKIPPED, "1");
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
 *   1. demo data or your own files
 *   2. connect Claude (skippable)
 * then the organisation dashboard. "New sourcing event" anywhere reopens step 1.
 */
export function FirstRun({ hasEvents, canEdit, connected, connectorUrl }: {
  hasEvents: boolean; canEdit: boolean; connected: boolean; connectorUrl: string;
}) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const skipped = useSyncExternalStore(subscribe, readSkipped, () => true);
  const [closedStart, setClosedStart] = useState(false);
  const [closedConnect, setClosedConnect] = useState(false);

  const wantsNew = sp.get("new") === "1";
  const showStart = canEdit && !closedStart && (wantsNew || (!hasEvents && path === "/" && !sp.get("welcome")));
  // keep the connect card on screen after the first call lands, until the person moves on
  const [justConnected, setJustConnected] = useState(false);
  const isConnected = connected || justConnected;
  const showConnect = !showStart && !closedConnect && !connected && !skipped && (sp.get("welcome") === "demo" || hasEvents);
  const connectOpen = showConnect || (justConnected && !closedConnect);

  const clearParams = () => {
    if (wantsNew || sp.get("welcome")) router.replace(path);
  };
  const closeStart = () => {
    setClosedStart(true);
    clearParams();
  };
  const closeConnect = (skip: boolean) => {
    if (skip) setSkipped();
    setClosedConnect(true);
    clearParams();
  };

  if (showStart) {
    return (
      <Modal label="Start a sourcing event" onClose={hasEvents || wantsNew ? closeStart : undefined}>
        <p className="mb-1.5 text-[12px] font-medium tracking-[0.06em] text-ink-secondary uppercase">{hasEvents ? "New sourcing event" : "Step 1 of 2"}</p>
        <StartChoice heading={hasEvents ? "How do you want to start this one?" : "How would you like to start?"} />
      </Modal>
    );
  }
  if (connectOpen) {
    return (
      <Modal label="Connect Claude" onClose={() => closeConnect(!isConnected)}>
        <ConnectStep url={connectorUrl} connected={isConnected} stepLabel={sp.get("welcome") === "demo" ? "Step 2 of 2" : null}
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
