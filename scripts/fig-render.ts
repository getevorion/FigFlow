// Dev tool: render frames of a .fig to PNG through the reference SVG renderer.
// usage: tsx scripts/fig-render.ts <file.fig> <outDir> [frameNameFilter] [maxFrames]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { FigFile } from "../src/engine/fig/open";
import { renderSvg } from "../src/engine/render/svg";
import { rasterBackdrop } from "../src/engine/render/backdrop";
import { sniffImageMime } from "../src/engine/util/mime";

const [file, outDir, filter, maxArg] = process.argv.slice(2);
const max = Number(maxArg ?? 6);
mkdirSync(outDir, { recursive: true });
const fig = FigFile.open(new Uint8Array(readFileSync(file)));
const href = (hash: string) => {
  const b = fig.images.get(hash);
  return b ? `data:${sniffImageMime(b)};base64,${Buffer.from(b).toString("base64")}` : undefined;
};

let done = 0;
for (const page of fig.pages()) {
  for (const f of page.frames) {
    if (done >= max) break;
    if (filter && !`${page.name}/${f.name}`.toLowerCase().includes(filter.toLowerCase())) continue;
    if (f.width < 8 || f.height < 8 || f.width * f.height > 4096 * 4096) continue;
    const t0 = performance.now();
    const built = fig.build(f.id);
    const t1 = performance.now();
    const svg = renderSvg(built.root, { imageHref: href, glyphs: built.glyphs, background: "#ffffff", backdrop: rasterBackdrop });
    const png = new Resvg(svg, { fitTo: { mode: "width", value: Math.min(1600, Math.round(f.width * 2)) } }).render().asPng();
    const safe = `${page.name}-${f.name}`.replace(/[^a-z0-9._-]+/gi, "_").slice(0, 80);
    writeFileSync(join(outDir, `${safe}.png`), png);
    writeFileSync(join(outDir, `${safe}.svg`), svg);
    const count = (n: typeof built.root): number => 1 + n.children.reduce((s, c) => s + count(c), 0);
    console.log(
      `${safe}: ${Math.round(f.width)}x${Math.round(f.height)} nodes=${count(built.root)} build=${(t1 - t0).toFixed(0)}ms svg=${(svg.length / 1024).toFixed(0)}KB warnings=${built.warnings.length}`,
    );
    for (const w of built.warnings.slice(0, 3)) console.log(`   ! ${w.code}: ${w.message} (${w.nodeName})`);
    done++;
  }
}
