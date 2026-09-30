// Dev probe: sibling order, group encoding, guidPath segment identity.
import { readFileSync } from "node:fs";
import { readFigFile } from "../src/engine/fig/kiwi/index";
import type { NodeChange } from "../src/engine/fig/kiwi/schema";

const [file, mode = "tree", arg] = process.argv.slice(2);
const { message } = readFigFile(new Uint8Array(readFileSync(file)));
const nodes = message.nodeChanges ?? [];
const k = (g?: { sessionID: number; localID: number }) => (g ? `${g.sessionID}:${g.localID}` : "-");
const byId = new Map(nodes.map((n) => [k(n.guid), n]));
const kids = new Map<string, NodeChange[]>();
for (const n of nodes) {
  const p = k(n.parentIndex?.guid);
  if (!kids.has(p)) kids.set(p, []);
  kids.get(p)!.push(n);
}
for (const list of kids.values()) list.sort((a, b) => (a.parentIndex!.position < b.parentIndex!.position ? -1 : a.parentIndex!.position > b.parentIndex!.position ? 1 : 0));

if (mode === "tree") {
  const walk = (n: NodeChange, depth: number) => {
    if (depth > Number(arg ?? 4)) return;
    const extra = [
      n.resizeToFit ? "resizeToFit" : "",
      n.frameMaskDisabled !== undefined ? `maskDisabled=${n.frameMaskDisabled}` : "",
      n.overrideKey ? `ok=${k(n.overrideKey)}` : "",
      `pos=${JSON.stringify(n.parentIndex?.position)}`,
      n.fillPaints?.[0]?.type === "SOLID" ? `fill=rgb(${["r", "g", "b"].map((c) => Math.round((n.fillPaints![0].color as never)[c] * 255)).join(",")})` : "",
      n.size ? `${Math.round(n.size.x)}x${Math.round(n.size.y)}@${Math.round(n.transform?.m02 ?? 0)},${Math.round(n.transform?.m12 ?? 0)}` : "",
    ].filter(Boolean);
    console.log(`${"  ".repeat(depth)}${n.type} ${JSON.stringify(n.name)} [${k(n.guid)}] ${extra.join(" ")}`);
    for (const c of kids.get(k(n.guid)) ?? []) walk(c, depth + 1);
  };
  walk(nodes.find((n) => n.type === "DOCUMENT")!, 0);
}

if (mode === "paths") {
  // For instances with multi-segment override paths, check each segment against guid / overrideKey
  let shown = 0;
  for (const inst of nodes) {
    if (inst.type !== "INSTANCE") continue;
    const master = byId.get(k(inst.symbolData?.symbolID));
    if (!master) continue;
    // collect master subtree keys
    const guidSet = new Set<string>();
    const okSet = new Set<string>();
    const collect = (n: NodeChange) => {
      guidSet.add(k(n.guid));
      if (n.overrideKey) okSet.add(k(n.overrideKey));
      for (const c of kids.get(k(n.guid)) ?? []) collect(c);
    };
    collect(master);
    for (const o of [...(inst.symbolData?.symbolOverrides ?? []), ...(inst.derivedSymbolData ?? [])]) {
      const segs = o.guidPath?.guids ?? [];
      if (segs.length < Number(arg ?? 2)) continue;
      const first = k(segs[0]);
      console.log(
        `inst ${JSON.stringify(inst.name)} path=${segs.map(k).join("/")} first: inGuids=${guidSet.has(first)} inOverrideKeys=${okSet.has(first)} fields=${Object.keys(o).filter((x) => x !== "guidPath").join(",")}`,
      );
      if (++shown > 14) process.exit(0);
    }
  }
}
