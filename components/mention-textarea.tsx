"use client";

import { useEffect, useRef, useState } from "react";
import { mentionablePeople } from "@/app/actions";

/**
 * A text box where typing "@" suggests teammates who can see the event.
 * Picking one inserts "@Name"; that person is notified when the text is saved.
 */
export function MentionTextarea({ rfxId, name, placeholder, rows = 2, className = "" }: { rfxId: string; name: string; placeholder?: string; rows?: number; className?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [people, setPeople] = useState<Array<{ id: string; name: string }>>([]);
  const [query, setQuery] = useState<string | null>(null);
  const [sel, setSel] = useState(0);
  useEffect(() => {
    let live = true;
    mentionablePeople(rfxId).then((p) => live && setPeople(p)).catch(() => {});
    return () => {
      live = false;
    };
  }, [rfxId]);
  const matches = query === null ? [] : people.filter((p) => p.name.toLowerCase().includes(query.toLowerCase())).slice(0, 6);

  const onInput = () => {
    const el = ref.current;
    if (!el) return;
    const upto = el.value.slice(0, el.selectionStart ?? el.value.length);
    const m = /(^|\s)@([\p{L}.' -]{0,30})$/u.exec(upto);
    setQuery(m ? m[2] : null);
    setSel(0);
  };
  const pick = (p: { name: string }) => {
    const el = ref.current;
    if (!el) return;
    const pos = el.selectionStart ?? el.value.length;
    const before = el.value.slice(0, pos).replace(/@([\p{L}.' -]{0,30})$/u, `@${p.name} `);
    el.value = before + el.value.slice(pos);
    el.focus();
    el.setSelectionRange(before.length, before.length);
    setQuery(null);
  };

  return (
    <div className="relative flex-1">
      <textarea ref={ref} name={name} rows={rows} required placeholder={placeholder ?? "Add a comment. Type @ to mention a teammate."}
        onInput={onInput}
        onKeyDown={(e) => {
          if (!matches.length) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, matches.length - 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
          if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pick(matches[sel]); }
          if (e.key === "Escape") setQuery(null);
        }}
        aria-autocomplete="list"
        className={`min-h-[38px] w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 ${className}`} />
      {matches.length ? (
        <ul role="listbox" className="absolute bottom-full left-0 z-20 mb-1 w-60 rounded-lg bg-popover p-1 shadow-lg ring-1 ring-border">
          {matches.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === sel}>
              <button type="button" onMouseDown={(e) => { e.preventDefault(); pick(p); }}
                className={`w-full rounded-md px-2.5 py-1.5 text-left text-[13px] ${i === sel ? "bg-secondary" : "hover:bg-muted"}`}>@{p.name}</button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
