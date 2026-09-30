/** Small formatting helpers for the converter's UI. */

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  return `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

/** "in 1 h 42 min", "in 3 min", "any moment now". */
export function timeLeft(until: number, now = Date.now()): string {
  const min = Math.floor((until - now) / 60_000);
  if (min < 1) return "any moment now";
  if (min < 60) return `in ${min} min`;
  return `in ${Math.floor(min / 60)} h ${min % 60} min`;
}

/** "just now", "5 min ago", "1 h ago". */
export function ago(at: number, now = Date.now()): string {
  const min = Math.floor((now - at) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  return `${Math.floor(min / 60)} h ago`;
}

/** The C++ project name the engine will derive from a frame or typed name (PascalCase ASCII). */
export function projectNameFrom(name: string): string {
  const words = name
    .normalize("NFKD")
    .replace(/\p{Mn}/gu, "")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  const out = words.map((w) => w[0].toUpperCase() + w.slice(1)).join("");
  return /^[0-9]/.test(out) ? `Design${out}` : out || "Design";
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
