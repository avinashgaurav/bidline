"use client";

import { useEffect, useRef, useState } from "react";

/** A number that counts up once when it first appears. Shows the final value straight away for reduced motion. */
export function CountUp({ value, format = "int", className }: { value: number; format?: "int" | "inr"; className?: string }) {
  const [shown, setShown] = useState<number | null>(null);
  const done = useRef(false);
  useEffect(() => {
    if (done.current || value === 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    done.current = true;
    const start = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / 700);
      setShown(p < 1 ? value * (1 - Math.pow(1 - p, 3)) : null);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  const v = shown ?? value;
  return <span className={className}>{format === "inr" ? inrCompact(v) : Math.round(v).toLocaleString("en-IN")}</span>;
}

export function inrCompact(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e7) return `₹${(v / 1e7).toFixed(2)} cr`;
  if (a >= 1e5) return `₹${(v / 1e5).toFixed(1)} L`;
  return `₹${Math.round(v).toLocaleString("en-IN")}`;
}
