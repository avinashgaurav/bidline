"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { ArrowRight, Building2, CornerDownLeft, FileText, Hash, Loader2, Search, Users } from "lucide-react";

const OPEN = "bidline:command-menu";

/** Open the search from anywhere (a button, a shortcut). */
export const openCommandMenu = () => window.dispatchEvent(new Event(OPEN));

interface Hit { type: string; title: string; sub: string; href: string }

const PAGES: Hit[] = [
  { type: "page", title: "Home", sub: "Organisation dashboard", href: "/" },
  { type: "page", title: "All sourcing events", sub: "Search, filter and sort every event", href: "/events" },
  { type: "page", title: "Needs attention", sub: "Events waiting on someone", href: "/events?view=attention" },
  { type: "page", title: "Suppliers", sub: "Every supplier across events", href: "/suppliers" },
  { type: "page", title: "Spend analytics", sub: "Budget, awards and savings", href: "/analytics" },
  { type: "page", title: "Audit log", sub: "Every change, by whom and when", href: "/audit" },
  { type: "page", title: "Claude tools", sub: "What Claude can do in Bidline", href: "/tools" },
  { type: "page", title: "Ask Claude", sub: "Ask, connect Claude, supplier files", href: "/ask" },
  { type: "page", title: "Connect Claude", sub: "Your connector link", href: "/ask#connect" },
  { type: "page", title: "Storage", sub: "Supplier files by sourcing event", href: "/settings?tab=storage" },
  { type: "page", title: "Team and roles", sub: "Invite people, change roles", href: "/settings?tab=team" },
  { type: "page", title: "Notifications", sub: "Choose what emails you", href: "/settings?tab=notifications" },
  { type: "page", title: "Settings", sub: "Profile, email, defaults", href: "/settings" },
  { type: "page", title: "Help and docs", sub: "How Bidline works", href: "/docs" },
  { type: "action", title: "New sourcing event", sub: "Demo data or your own files", href: "/?new=1" },
];

const ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  event: Building2, supplier: Users, document: FileText, line: Hash, page: ArrowRight, action: ArrowRight,
};
const GROUP: Record<string, string> = { event: "Sourcing events", supplier: "Suppliers", document: "Documents", line: "Line items", page: "Go to", action: "Actions" };

/** Search across everything you can see, from any page: ⌘K or Ctrl+K. */
export function CommandMenu() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState(0);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN, onOpen);
    };
  }, []);

  useEffect(() => {
    const t = text.trim();
    if (t.length < 2) return;
    let stop = false;
    const id = setTimeout(async () => {
      setBusy(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(t)}`, { cache: "no-store" });
        const body = (await res.json()) as { hits?: Hit[] };
        if (!stop) setHits(body.hits ?? []);
      } catch {
        if (!stop) setHits([]);
      } finally {
        if (!stop) setBusy(false);
      }
    }, 180);
    return () => {
      stop = true;
      clearTimeout(id);
    };
  }, [text]);

  const results = useMemo(() => {
    const t = text.trim().toLowerCase();
    const pages = PAGES.filter((p) => !t || `${p.title} ${p.sub}`.toLowerCase().includes(t));
    return t.length < 2 ? pages : [...hits, ...pages];
  }, [text, hits]);

  const go = (h: Hit | undefined) => {
    if (!h) return;
    setOpen(false);
    setText("");
    setHits([]);
    router.push(h.href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, results.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    if (e.key === "Enter") { e.preventDefault(); go(results[sel]); }
  };
  useEffect(() => {
    list.current?.querySelector(`[data-i="${sel}"]`)?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => { setOpen(o); if (!o) setText(""); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-night/30 backdrop-blur-[3px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content aria-describedby={undefined}
          className="fixed top-[12vh] left-1/2 z-50 w-[calc(100%-32px)] max-w-[600px] -translate-x-1/2 overflow-hidden rounded-2xl bg-popover shadow-[0_28px_70px_-16px_rgba(23,23,33,0.45)] ring-1 ring-border data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98]">
          <DialogPrimitive.Title className="sr-only">Search Bidline</DialogPrimitive.Title>
          <div className="flex items-center gap-3 border-b border-border px-4">
            {busy ? <Loader2 className="size-4 animate-spin text-ink-secondary" /> : <Search className="size-4 text-ink-secondary" />}
            <input autoFocus role="combobox" aria-expanded="true" aria-controls="cmdk-list" aria-activedescendant={results[sel] ? `cmdk-${sel}` : undefined} aria-label="Search Bidline" value={text} onChange={(e) => { setText(e.target.value); setSel(0); if (e.target.value.trim().length < 2) setHits([]); }} onKeyDown={onKeyDown}
              placeholder="Search events, suppliers, documents, line items or pages"
              className="h-13 flex-1 bg-transparent py-4 text-[15px] outline-none placeholder:text-ink-secondary/70 focus:outline-none focus-visible:outline-none" />
            <kbd className="rounded bg-muted px-1.5 text-[11px] text-ink-secondary">Esc</kbd>
          </div>
          <div ref={list} id="cmdk-list" className="max-h-[56vh] overflow-y-auto p-2" role="listbox" aria-label="Results">
            {results.map((h, i) => {
              const Icon = ICON[h.type] ?? ArrowRight;
              const head = i === 0 || GROUP[results[i - 1].type] !== GROUP[h.type] ? GROUP[h.type] : null;
              return (
                <div key={`${h.href}-${h.title}-${i}`} data-i={i} role="presentation">
                  {head ? <p role="presentation" className="px-2.5 pt-2 pb-1 text-[11.5px] font-medium text-ink-secondary">{head}</p> : null}
                  <button id={`cmdk-${i}`} role="option" aria-selected={sel === i} tabIndex={-1} onMouseMove={() => setSel(i)} onClick={() => go(h)}
                    className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left ${sel === i ? "bg-secondary" : ""}`}>
                    <span className="grid size-7 shrink-0 place-items-center rounded-md bg-muted text-ink-secondary"><Icon className="size-3.5" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px]">{h.title}</span>
                      <span className="block truncate text-[12px] text-ink-secondary">{h.sub}</span>
                    </span>
                    {sel === i ? <CornerDownLeft className="size-3.5 text-ink-secondary" /> : null}
                  </button>
                </div>
              );
            })}
            {!results.length && !busy ? <p className="px-3 py-8 text-center text-[14px] text-ink-secondary">Nothing matches &ldquo;{text}&rdquo;. Try a supplier name, an event code or a file name.</p> : null}
          </div>
          <div className="flex items-center gap-4 border-t border-border bg-muted/50 px-4 py-2 text-[11px] text-ink-secondary">
            <span>↑↓ to move</span><span>Enter to open</span><span className="ml-auto">Only what you have access to is shown</span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** The search field in the top bar. */
export function SearchButton() {
  return (
    <button onClick={openCommandMenu}
      className="flex h-10 w-full items-center gap-2.5 rounded-xl bg-card px-4 text-[14px] text-ink-secondary ring-1 ring-border transition-colors hover:ring-primary/40 hover:text-foreground">
      <Search className="size-4" /> <span className="truncate">Search events, suppliers, documents and line items</span>
      <kbd className="ml-auto hidden rounded bg-card px-1.5 text-[11px] ring-1 ring-border sm:inline">⌘K</kbd>
    </button>
  );
}
