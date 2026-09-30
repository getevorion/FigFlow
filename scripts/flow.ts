// Dev tool: print the app flow the converter derives from a start frame.
// usage: tsx scripts/flow.ts <file.fig> <start frame name or id>
import { readFileSync } from "node:fs";
import { FigFile } from "../src/engine/fig/open";
import { analyzeFlow } from "../src/engine/semantic/flow";
import type { PressAction, Widget } from "../src/engine/semantic/types";

const [file, which] = process.argv.slice(2);
const fig = FigFile.open(new Uint8Array(readFileSync(file)));
const frames = fig.pages().flatMap((p) => p.frames);
const start = frames.find((f) => f.id === which || f.name === which);
if (!start) {
  console.log("Frames:");
  for (const f of frames) console.log(`  ${f.id.padEnd(10)} ${f.kind.padEnd(8)} ${Math.round(f.width)}x${Math.round(f.height)}  ${f.name}`);
  process.exit(which ? 1 : 0);
}

const t0 = performance.now();
const flow = analyzeFlow(fig, start.id);
const ms = performance.now() - t0;
const screenName = (id: string) => flow.screens.find((s) => s.id === id)?.name ?? frames.find((f) => f.id === id)?.name ?? id;
const popupName = (id: string) => flow.popups.find((p) => p.popup.id === id)?.popup.name ?? id;
const toastName = (id: string) => flow.toasts.find((t) => t.toast.id === id)?.toast.name ?? id;
const act = (a: PressAction) => {
  switch (a.kind) {
    case "go": return `${a.replace ? "switch" : "go"} → "${screenName(a.screen)}"`;
    case "back": return "back";
    case "open-popup": return `open popup "${popupName(a.popup)}"`;
    case "close-popup": return "close popup";
    case "show-toast": return `toast "${toastName(a.toast)}"`;
    case "select-page": return `select page ${a.index + 1}`;
    case "window": return `window ${a.action}`;
    case "url": return `open ${a.url}`;
  }
};
const line = (w: Widget) => {
  const r = `${Math.round(w.rect.x)},${Math.round(w.rect.y)} ${Math.round(w.rect.w)}x${Math.round(w.rect.h)}`;
  const does = w.onPress ? (w.onPress.length ? w.onPress.map(act).join(", then ") : "(current page)") : "—";
  return `    ${w.kind.padEnd(13)} ${r.padEnd(18)} ${(w.label ? JSON.stringify(w.label.text) : "").padEnd(28)} ${does}${w.pressReason ? `   [${w.pressReason}]` : ""}`;
};

console.log(`Flow from "${start.name}" in ${ms.toFixed(0)} ms; starts on "${screenName(flow.start)}"`);
for (const s of flow.screens) {
  console.log(`\nSCREEN "${s.name}" (${s.id}) ${Math.round(s.analysis.size.x)}x${Math.round(s.analysis.size.y)}`);
  const inPopup = new Set(flow.popups.filter((p) => p.source === s.id).flatMap((p) => p.widgets));
  for (const w of s.analysis.widgets.filter((x) => !inPopup.has(x)).sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x)) console.log(line(w));
  for (const n of s.analysis.navs) console.log(`    NAV ${n.axis} ${n.items.length} items, selected #${n.selected + 1}`);
}
for (const p of flow.popups) {
  console.log(`\nPOPUP "${p.popup.name}" over "${screenName(p.screen)}", from "${screenName(p.source)}", opens: ${p.open}${p.popup.overlay ? ` (overlay ${p.popup.overlay.position})` : ""}`);
  for (const w of p.widgets) console.log(line(w));
}
for (const t of flow.toasts) console.log(`\nTOAST "${t.toast.name}" ${t.toast.anchor}, from "${screenName(t.source)}"`);
if (flow.notes.length) console.log(`\nNotes:\n${flow.notes.map((n) => `  - ${n}`).join("\n")}`);
