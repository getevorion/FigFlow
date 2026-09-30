// CLI: generate a Dear ImGui project from one frame of a .fig file.
// usage: tsx scripts/generate.ts <file.fig> <frame name or id> <out dir> [--offline] [--name Name]
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { FigFile } from "../src/engine/fig/open";
import { generateProject } from "../src/engine/codegen/project";
import { googleFontsProvider } from "../src/engine/fonts/google";

const args = process.argv.slice(2);
const flag = (n: string) => {
  const i = args.indexOf(n);
  if (i < 0) return false;
  args.splice(i, 1);
  return true;
};
const opt = (n: string) => {
  const i = args.indexOf(n);
  if (i < 0) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const offline = flag("--offline");
const name = opt("--name");
const [file, which, out] = args;
if (!file || !which || !out) {
  console.error("usage: tsx scripts/generate.ts <file.fig> <frame> <out dir> [--offline] [--name Name]");
  process.exit(2);
}

async function main() {
  const t0 = performance.now();
  const fig = FigFile.open(new Uint8Array(readFileSync(file)));
  const frames = fig.pages().flatMap((p) => p.frames.map((f) => ({ ...f, page: p.name })));
  const frame = frames.find((f) => f.id === which) ?? frames.find((f) => f.name === which) ?? frames.find((f) => `${f.page}/${f.name}` === which);
  if (!frame) {
    console.error(`No frame "${which}". Frames:\n${frames.slice(0, 40).map((f) => `  ${f.id}  ${f.page}/${f.name}  ${Math.round(f.width)}x${Math.round(f.height)}`).join("\n")}`);
    process.exit(1);
  }

  const root = resolve(__dirname, "..");
  const project = await generateProject({
    fig,
    frameId: frame.id,
    name,
    runtimeDir: join(root, "runtime"),
    fontProvider: offline ? null : googleFontsProvider(join(root, ".data", "font-cache")),
  });
  rmSync(out, { recursive: true, force: true });
  for (const f of project.files) {
    const p = join(out, f.path);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, f.contents);
  }
  const t1 = performance.now();
  console.log(`${project.name}: ${project.files.length} files in ${(t1 - t0).toFixed(0)} ms`);
  console.log(JSON.stringify(project.stats));
  for (const w of project.warnings.slice(0, 20)) console.log(`  ! ${w.code}: ${w.message}${w.nodeName ? ` (${w.nodeName})` : ""}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
