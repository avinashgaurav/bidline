"use client";

import { createContext, useContext } from "react";
import { DEFAULT_PREFS, type Prefs } from "@/lib/prefs";

const Ctx = createContext<Prefs>(DEFAULT_PREFS);

/** The signed-in person's display preferences, for every client component under the app layout. */
export function PrefsProvider({ prefs, children }: { prefs: Prefs; children: React.ReactNode }) {
  return <Ctx.Provider value={prefs}>{children}</Ctx.Provider>;
}

export const usePrefs = () => useContext(Ctx);
