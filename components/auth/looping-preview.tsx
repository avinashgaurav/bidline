"use client";

import { useEffect, useState } from "react";
import { ProductPreview } from "./product-preview";

/**
 * Plays the preview, holds the finished picture, fades, and plays it again.
 * Remounting restarts every CSS animation from the first frame. With reduced
 * motion the finished picture simply stays.
 */
export function LoopingPreview({ every = 8000 }: { every?: number }) {
  const [round, setRound] = useState(0);
  const [fading, setFading] = useState(false);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let fade: ReturnType<typeof setTimeout> | undefined;
    const id = setInterval(() => {
      setFading(true);
      fade = setTimeout(() => {
        setRound((r) => r + 1);
        setFading(false);
      }, 450);
    }, every);
    return () => {
      clearInterval(id);
      clearTimeout(fade);
    };
  }, [every]);
  return (
    <div className={`transition-opacity duration-[450ms] ${fading ? "opacity-0" : "opacity-100"}`}>
      <ProductPreview key={round} />
    </div>
  );
}
