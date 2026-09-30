// Dev tool: decode a .fig and list anything that points outside the file (URLs, plugin data, links).
import { readFileSync } from "node:fs";
import { readFigFile } from "../src/engine/fig/kiwi/index";
const parsed = readFigFile(new Uint8Array(readFileSync(process.argv[2])));
const nodes = parsed.message.nodeChanges ?? [];
const urls = new Set<string>();
let pluginEntries = 0;
const walk = (v: unknown, depth = 0): void => {
  if (depth > 12 || v == null) return;
  if (typeof v === "string") {
    for (const m of v.matchAll(/(?:https?|file|ftp|javascript|data):[^\s"'<>)]{2,200}/gi)) urls.add(m[0].slice(0, 160));
    return;
  }
  if (v instanceof Uint8Array) return;
  if (Array.isArray(v)) return v.forEach((x) => walk(x, depth + 1));
  if (typeof v === "object") for (const x of Object.values(v as object)) walk(x, depth + 1);
};
for (const n of nodes) {
  walk(n);
  const pd = (n as { pluginData?: unknown[] }).pluginData;
  if (pd?.length) pluginEntries += pd.length;
}
const types = new Map<string, number>();
for (const n of nodes) types.set(n.type ?? "?", (types.get(n.type ?? "?") ?? 0) + 1);
console.log(`decoded OK: header=${JSON.stringify(parsed.header)} nodes=${nodes.length} blobs=${parsed.message.blobs?.length ?? 0}`);
console.log("node types:", [...types].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(" "));
console.log(`plugin data entries: ${pluginEntries}`);
console.log(`URLs found in node data (${urls.size}):`);
for (const u of urls) console.log("  " + u);
