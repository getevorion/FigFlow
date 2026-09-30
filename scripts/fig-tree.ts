// Dev tool: print the built design tree of one frame.
// usage: tsx scripts/fig-tree.ts <file.fig> <frameNameOrId> [depth]
import { readFileSync } from "node:fs";
import { FigFile } from "../src/engine/fig/open";
import type { DesignNode } from "../src/engine/model/types";

const [file, which, depthArg] = process.argv.slice(2);
const fig = FigFile.open(new Uint8Array(readFileSync(file)));
const frame = fig.pages().flatMap((p) => p.frames).find((f) => f.id === which || f.name === which);
if (!frame) throw new Error(`frame ${which} not found`);
const built = fig.build(frame.id);
const maxDepth = Number(depthArg ?? 6);
const walk = (n: DesignNode, d: number) => {
  if (d > maxDepth) return;
  const fill = n.fills.find((p) => p.visible);
  const bits = [
    `${Math.round(n.box.x)},${Math.round(n.box.y)} ${Math.round(n.size.x)}x${Math.round(n.size.y)}`,
    n.visible ? "" : "HIDDEN",
    fill ? fill.type : "",
    n.text ? `"${n.text.characters.slice(0, 40)}" layout=${n.text.hasLayout} glyphs=${n.text.glyphs.length} font=${n.text.runs[0]?.font.family} ${n.text.runs[0]?.fontSize}` : "",
    n.component ? `→${n.component.name}` : "",
    n.props ? JSON.stringify(n.props).slice(0, 80) : "",
    n.layout ? `AL:${n.layout.mode} gap=${n.layout.gap}` : "",
    n.mask ? "MASK" : "",
    n.clipsContent ? "clip" : "",
    n.corners.tl || n.corners.tr || n.corners.br || n.corners.bl ? `r=${[n.corners.tl, n.corners.tr, n.corners.br, n.corners.bl].map((v) => Math.round(v)).join("/")}` : "",
    fill && fill.type === "SOLID" ? `#${[fill.color.r, fill.color.g, fill.color.b].map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("")}${fill.color.a * fill.opacity < 0.99 ? "@" + (fill.color.a * fill.opacity).toFixed(2) : ""}` : "",
    n.effects.filter((e) => e.visible).map((e) => e.type.replace("_SHADOW", "").toLowerCase()).join("+"),
    n.opacity < 1 ? `op=${n.opacity.toFixed(2)}` : "",
    n.reactions.length ? `reactions=${n.reactions.map((r) => `${r.trigger}:${r.action.kind}`).join(",")}` : "",
  ].filter(Boolean);
  console.log(`${"  ".repeat(d)}${n.kind} ${JSON.stringify(n.name)} ${bits.join(" ")}`);
  for (const c of n.children) walk(c, d + 1);
};
walk(built.root, 0);
for (const w of built.warnings) console.log(`! ${w.code} ${w.nodeName}: ${w.message}`);
