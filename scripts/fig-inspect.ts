// Empirical survey of .fig fixtures: node types, field coverage, derived data.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { readFigFile, extractImages } from "../src/engine/fig/kiwi/index";

const dir = process.argv[2];
const only = process.argv[3];
const files = readdirSync(dir).filter((f) => f.endsWith(".fig") && (!only || f.includes(only)));

for (const f of files) {
  const t0 = performance.now();
  const bytes = new Uint8Array(readFileSync(join(dir, f)));
  let parsed;
  try {
    parsed = readFigFile(bytes);
  } catch (e) {
    console.log(`\n### ${f}: ERROR ${(e as Error).message}`);
    continue;
  }
  const t1 = performance.now();
  const { message, header } = parsed;
  const nodes = message.nodeChanges ?? [];
  const types = new Map<string, number>();
  const fieldCount = new Map<string, number>();
  for (const n of nodes) {
    types.set(n.type ?? "?", (types.get(n.type ?? "?") ?? 0) + 1);
    for (const k of Object.keys(n)) fieldCount.set(k, (fieldCount.get(k) ?? 0) + 1);
  }
  const images = extractImages(parsed.zip_files);
  console.log(`\n### ${f}  (${(bytes.length / 1e6).toFixed(2)} MB, parsed in ${(t1 - t0).toFixed(0)} ms)`);
  console.log(`header=${JSON.stringify(header)} messageType=${message.type} nodes=${nodes.length} blobs=${message.blobs?.length ?? 0} images=${images.size}`);
  console.log("types:", [...types.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(" "));
  const canvases = nodes.filter((n) => n.type === "CANVAS").map((n) => `${n.name}${n.internalOnly ? "(internal)" : ""}`);
  console.log("pages:", canvases.join(" | "));
  if (process.env.FIELDS) {
    console.log("fields:", [...fieldCount.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(" "));
  }
  const inst = nodes.filter((n) => n.type === "INSTANCE");
  if (inst.length) {
    const withDerived = inst.filter((n) => n.derivedSymbolData?.length).length;
    const withOverrides = inst.filter((n) => n.symbolData?.symbolOverrides?.length).length;
    const withProps = inst.filter((n) => n.componentPropAssignments?.length).length;
    console.log(`instances=${inst.length} derivedSymbolData=${withDerived} overrides=${withOverrides} propAssignments=${withProps}`);
  }
  const text = nodes.filter((n) => n.type === "TEXT");
  if (text.length) {
    const withDerived = text.filter((n) => n.derivedTextData?.glyphs?.length).length;
    const withBaselines = text.filter((n) => n.derivedTextData?.baselines?.length).length;
    console.log(`text=${text.length} derivedGlyphs=${withDerived} baselines=${withBaselines}`);
  }
  if (process.env.SAMPLE) {
    const want = process.env.SAMPLE;
    const sample = nodes.find((n) => n.type === want);
    if (sample) {
      const replacer = (_k: string, v: unknown) =>
        v instanceof Uint8Array ? `<bytes ${v.length}>` : Array.isArray(v) && v.length > 12 ? [...v.slice(0, 12), `…${v.length - 12} more`] : v;
      console.log(`sample ${want}:`, JSON.stringify(sample, replacer, 1).slice(0, Number(process.env.MAX ?? 6000)));
    }
  }
}
