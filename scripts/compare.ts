// Dev tool: pixel-compare a captured ImGui frame with the reference render of the same Figma frame.
// usage: tsx scripts/compare.ts <file.fig> <frame> <captured.png> <out-prefix>
import { readFileSync, writeFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";
import { FigFile } from "../src/engine/fig/open";
import { imageSizes, renderSvg } from "../src/engine/render/svg";
import { rasterBackdrop } from "../src/engine/render/backdrop";
import { ImageLevels } from "../src/engine/render/images";

async function main() {
  const [file, which, captured, outPrefix] = process.argv.slice(2);
  const fig = FigFile.open(new Uint8Array(readFileSync(file)));
  const frame = fig.pages().flatMap((p) => p.frames).find((f) => f.id === which || f.name === which);
  if (!frame) throw new Error(`frame ${which} not found`);
  const built = fig.build(frame.id);
  // Images drawn small come from averaged-down copies, as in the baked assets.
  const images = new ImageLevels(fig.images);
  await images.prepare(imageSizes(built.root));
  const svg = renderSvg(built.root, { imageHref: images.href, glyphs: built.glyphs, backdrop: rasterBackdrop });
  const ref = new Resvg(svg, { fitTo: { mode: "zoom", value: 1 } }).render();
  const W = ref.width, H = ref.height;
  const refPng = ref.asPng();
  const cap = await sharp(readFileSync(captured)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const refRaw = await sharp(refPng).ensureAlpha().raw().toBuffer();
  if (cap.info.width !== W || cap.info.height !== H) throw new Error(`size mismatch: captured ${cap.info.width}x${cap.info.height} vs reference ${W}x${H}`);

  // Composite both over the same background, then diff per pixel.
  const bg = [40, 40, 40];
  const over = (buf: Buffer, i: number, c: number) => (buf[i + c] * buf[i + 3] + bg[c] * (255 - buf[i + 3])) / 255;
  const diff = Buffer.alloc(W * H * 4);
  let sum = 0;
  let bad = 0;
  for (let i = 0; i < W * H * 4; i += 4) {
    let d = 0;
    for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(over(cap.data, i, c) - over(refRaw, i, c)));
    sum += d;
    if (d > 24) bad++;
    const v = Math.min(255, d * 4);
    diff[i] = v;
    diff[i + 1] = v > 96 ? 64 : v;
    diff[i + 2] = v > 96 ? 64 : v;
    diff[i + 3] = 255;
  }
  writeFileSync(`${outPrefix}-reference.png`, refPng);
  await sharp(diff, { raw: { width: W, height: H, channels: 4 } }).png().toFile(`${outPrefix}-diff.png`);
  const pct = (100 * bad) / (W * H);
  console.log(`mean channel error ${(sum / (W * H)).toFixed(2)}/255, pixels off by >24: ${bad} (${pct.toFixed(3)}%), match ${(100 - pct).toFixed(2)}%`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
