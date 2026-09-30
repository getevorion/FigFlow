"use client";

import { useEffect, useEffectEvent, useState } from "react";

/** Waits between polls: quick at first (most conversions take a second or two), then easing out to `ms`. */
export function* pollDelays(ms: number): Generator<number, never> {
  let delay = Math.min(ms, 250);
  for (;;) {
    yield delay;
    delay = Math.min(ms, delay * 1.3);
  }
}

/**
 * Fetches `url` as JSON while `active(data)` says to keep going, every `ms`
 * once past the quick first polls; starts from `initial` (the server-rendered state).
 */
export function usePoll<T>(url: string, initial: T, active: (data: T) => boolean, ms = 1000): { data: T; error: string | null } {
  const [data, setData] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const keepGoing = useEffectEvent((d: T) => active(d));

  useEffect(() => {
    if (!keepGoing(initial)) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const delays = pollDelays(ms);
    const tick = async () => {
      try {
        const res = await fetch(url, { cache: "no-store" });
        const body = (await res.json()) as T & { error?: string };
        if (stop) return;
        if (!res.ok) {
          setError(body.error ?? `Error ${res.status}`);
          return;
        }
        setData(body);
        setError(null);
        if (!keepGoing(body)) return;
      } catch {
        if (stop) return;
        setError("Can't reach Figflow. Retrying…");
      }
      timer = setTimeout(tick, delays.next().value);
    };
    timer = setTimeout(tick, delays.next().value);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [url, ms, initial]);

  return { data, error };
}
