"use client";

import { useEffect, useState } from "react";

/**
 * The current time, ticking every `ms`; null until the page is hydrated, so
 * "deleted in 1 h 58 min" is never rendered twice with different minutes
 * (on the server, then in the browser) and doesn't break hydration.
 */
export function useNow(ms = 30_000): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, ms);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [ms]);
  return now;
}
