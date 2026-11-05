"use client";

import { money, moneyShort, date } from "@/lib/prefs";
import { usePrefs } from "@/components/prefs-provider";

/** Money in the person's number format. Use from server components too. */
export function Money({ value, short = false }: { value: number; short?: boolean }) {
  const p = usePrefs();
  return <>{short ? moneyShort(value, p) : money(value, p)}</>;
}

export function DateText({ iso }: { iso: string }) {
  const p = usePrefs();
  return <time dateTime={iso}>{date(iso, p)}</time>;
}
