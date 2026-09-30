// Dev tool: converts many frames of many .fig files the way the site does
// (open, pick the start frame, generate) and reports what failed and where the
// time went, per stage. With --build, builds each file's start project with
// MSVC too. Output: a table on stdout and report.json in the output folder.
// usage: tsx scripts/smoke.ts <out dir> <file.fig>... [--frames N] [--build]
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { generateProject } from "../src/engine/codegen/project";
import { FigFile } from "../src/engine/fig/open";
import { googleFontsProvider } from "../src/engine/fonts/google";
import { pickStart } from "../src/engine/semantic/start";

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const flag = (name: string) => {
  const i = args.indexOf(name);
  if (i >= 0) args.splice(i, 1);
  return i >= 0;
};
const perFile = Number(opt("--frames") ?? 6);
const build = flag("--build");
const [out, ...files] = args;
if (!out || !files.length) {
  console.error("usage: tsx scripts/smoke.ts <out dir> <file.fig>... [--frames N] [--build]");
  process.exit(2);
}
const root = resolve(__dirname, "..");
const provider = googleFontsProvider(join(root, ".data", "font-cache"));
mkdirSync(out, { recursive: true });

type Row = { file: string; frame: string; name: string; start: boolean; ms: number; timings?: Record<string, number>; stats?: unknown; warnings?: number; error?: string; build?: string };
const rows: Row[] = [];

async function convert(fig: FigFile, file: string, frame: { id: string; name: string }, start: boolean, dir: string | null): Promise<Row> {
  const t0 = performance.now();
  try {
    const project = await generateProject({ fig, frameId: frame.id, runtimeDir: join(root, "runtime"), fontProvider: provider });
    const row: Row = { file, frame: frame.id, name: frame.name, start, ms: Math.round(performance.now() - t0), timings: project.timings, stats: project.stats, warnings: project.warnings.length };
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
      for (const f of project.files) {
        const p = join(dir, f.path);
        mkdirSync(dirname(p), { recursive: true });
        writeFileSync(p, f.contents);
      }
      const bt = performance.now();
      try {
        execFileSync("cmake", ["-S", dir, "-B", join(dir, "build"), "-G", "Visual Studio 17 2022", "-A", "x64"], { stdio: "pipe" });
        execFileSync("cmake", ["--build", join(dir, "build"), "--config", "Release", "--", "-m", "-v:minimal"], { stdio: "pipe", maxBuffer: 64 << 20 });
        row.build = `ok in ${((performance.now() - bt) / 1000).toFixed(1)} s`;
      } catch (e) {
        const text = String((e as { stdout?: Buffer }).stdout ?? e);
        row.build = `FAILED: ${text.split("\n").filter((l) => /error/i.test(l)).slice(0, 5).join(" | ")}`;
      }
    }
    return row;
  } catch (e) {
    return { file, frame: frame.id, name: frame.name, start, ms: Math.round(performance.now() - t0), error: (e as Error).stack?.split("\n").slice(0, 4).join(" <- ") ?? String(e) };
  }
}

async function main() {
  for (const path of files) {
    const file = path.split(/[\\/]/).pop()!;
    const t0 = performance.now();
    let fig: FigFile;
    try {
      fig = FigFile.open(new Uint8Array(readFileSync(path)));
    } catch (e) {
      rows.push({ file, frame: "-", name: "(open)", start: false, ms: 0, error: String(e) });
      continue;
    }
    const tOpen = performance.now() - t0;
    const t1 = performance.now();
    const pick = pickStart(fig);
    const tPick = performance.now() - t1;
    console.log(`\n${file}: open ${tOpen.toFixed(0)} ms, pick ${tPick.toFixed(0)} ms -> ${pick?.frame ?? "none"} (${pick?.reason ?? "-"})`);
    const frames = fig.pages().flatMap((p) => p.frames);
    // The start frame, then others spread across the file.
    const others = frames.filter((f) => f.id !== pick?.frame && f.width >= 120 && f.height >= 80);
    const step = Math.max(1, Math.floor(others.length / Math.max(1, perFile - 1)));
    const chosen = [...(pick ? frames.filter((f) => f.id === pick.frame) : []), ...others.filter((_, i) => i % step === 0)].slice(0, perFile);
    for (const f of chosen) {
      const isStart = f.id === pick?.frame;
      // Short folder names: CMake's compiler check nests deep, and MSBuild stops at 260 characters.
      const row = await convert(fig, file, f, isStart, build && isStart ? join(out, file.replace(/\W+/g, "_").slice(0, 20)) : null);
      rows.push(row);
      const t = row.timings ? Object.entries(row.timings).map(([k, v]) => `${k} ${v}`).join(", ") : "";
      console.log(`  ${isStart ? "*" : " "} ${f.id.padEnd(12)} ${(f.name.trim() || "Untitled").slice(0, 34).padEnd(34)} ${String(row.ms).padStart(6)} ms  ${row.error ? `ERROR ${row.error.slice(0, 160)}` : t}${row.build ? `  build ${row.build}` : ""}`);
    }
  }
  const ok = rows.filter((r) => !r.error);
  const sum: Record<string, number> = {};
  for (const r of ok) for (const [k, v] of Object.entries(r.timings ?? {})) sum[k] = (sum[k] ?? 0) + v;
  const total = Object.values(sum).reduce((a, b) => a + b, 0);
  console.log(`\n${ok.length}/${rows.length} converted; ${rows.length - ok.length} failed; builds failed: ${rows.filter((r) => r.build?.startsWith("FAILED")).length}`);
  console.log(`time by stage: ${Object.entries(sum).map(([k, v]) => `${k} ${(v / 1000).toFixed(1)} s (${((100 * v) / Math.max(1, total)).toFixed(0)}%)`).join(", ")}`);
  writeFileSync(join(out, "report.json"), JSON.stringify(rows, null, 1));
}

main();
