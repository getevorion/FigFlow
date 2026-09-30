// Dev tool: print what the converter recognizes in a frame.
// usage: tsx scripts/analyze.ts <file.fig> <frame name or id>
import { readFileSync } from "node:fs";
import { FigFile } from "../src/engine/fig/open";
import { detectWidgets } from "../src/engine/semantic/detect";
import { detectPopups, detectToasts } from "../src/engine/semantic/overlays";
import { buildScene } from "../src/engine/semantic/scene";

const [file, which] = process.argv.slice(2);
const fig = FigFile.open(new Uint8Array(readFileSync(file)));
const frames = fig.pages().flatMap((p) => p.frames);
const targets = which ? frames.filter((f) => f.id === which || f.name === which) : frames;
for (const frame of targets) {
  const built = fig.build(frame.id);
  const t0 = performance.now();
  const scene = buildScene(built.root);
  const popups = detectPopups(scene);
  const toasts = detectToasts(scene);
  // A toast's contents are the toast itself, not controls.
  const { widgets, navs } = detectWidgets(built.root, { scene, exclude: new Set(toasts.map((t) => t.root.id)) });
  const ms = performance.now() - t0;
  console.log(`\n=== ${frame.name} (${Math.round(frame.width)}x${Math.round(frame.height)}) — ${scene.all.length} layers, analyzed in ${ms.toFixed(0)} ms`);
  const r = (x: { x: number; y: number; w: number; h: number }) => `${Math.round(x.x)},${Math.round(x.y)} ${Math.round(x.w)}x${Math.round(x.h)}`;
  for (const w of widgets.sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x))
    console.log(`  ${w.kind.padEnd(13)} ${r(w.rect).padEnd(20)} ${w.label ? JSON.stringify(w.label.text) : ""} ${w.value !== undefined ? `value=${JSON.stringify(w.value)}` : ""} ${w.action ?? ""} [${w.evidence.score.toFixed(2)}] ${w.evidence.reasons.join("; ")}`);
  for (const n of navs) console.log(`  NAV ${n.axis} ${n.items.length} items, selected #${n.selected} [${n.evidence.reasons.join("; ")}]`);
  for (const p of popups) console.log(`  POPUP "${p.name}" ${r(p.rect)} backdrop=${!!p.backdrop} [${p.evidence.reasons.join("; ")}]`);
  for (const t of toasts) console.log(`  TOAST "${t.name}" ${r(t.rect)} ${t.anchor} [${t.evidence.reasons.join("; ")}]`);
}
