import "server-only";
import { sweep } from "./store";

/**
 * Keeps the promise that uploads are deleted two hours after they're made:
 * a sweep every few minutes, whether or not anyone is using the site.
 */
export function startRetention() {
  const g = globalThis as typeof globalThis & { __figflowRetention?: NodeJS.Timeout };
  if (g.__figflowRetention) return;
  const run = () => void sweep().catch((e) => console.error("[figflow] retention sweep failed:", e));
  run();
  g.__figflowRetention = setInterval(run, 5 * 60_000);
  g.__figflowRetention.unref?.();
}
