// Dev loop: generate a project from a Figma frame, build it with MSVC, capture it
// headless, and pixel-compare with the reference render.
// usage: tsx scripts/e2e.ts <file.fig> <frame> <work dir> [--offline]
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const offline = args.includes("--offline");
const [fig, frame, work] = args.filter((a) => !a.startsWith("--"));
if (!fig || !frame || !work) {
  console.error("usage: tsx scripts/e2e.ts <file.fig> <frame> <work dir> [--offline]");
  process.exit(2);
}
const root = join(__dirname, "..");
const src = join(work, "project");
const build = join(work, "build");
// tsx's JS entry run by node directly: no shell, so paths with spaces are safe.
const tsxCli = join(root, "node_modules", "tsx", "dist", "cli.mjs");
const run = (cmd: string, argv: string[], env?: Record<string, string>) => {
  const t0 = performance.now();
  const out = execFileSync(cmd, argv, { encoding: "utf8", env: { ...process.env, ...env }, maxBuffer: 64 << 20 });
  return { out, ms: performance.now() - t0 };
};
const tsx = (script: string, argv: string[]) => run(process.execPath, [tsxCli, join(root, "scripts", script), ...argv]);

mkdirSync(work, { recursive: true });
const gen = tsx("generate.ts", [fig, frame, src, ...(offline ? ["--offline"] : [])]);
console.log(gen.out.trim(), `(${gen.ms.toFixed(0)} ms)`);
const name = gen.out.split(":")[0].trim();

if (!existsSync(join(build, "CMakeCache.txt"))) run("cmake", ["-S", src, "-B", build, "-G", "Visual Studio 17 2022", "-A", "x64"]);
const b = run("cmake", ["--build", build, "--config", "Release", "--", "-m", "-v:minimal"]);
const errors = b.out.split("\n").filter((l) => /error|warning C\d/.test(l));
console.log(`build: ${(b.ms / 1000).toFixed(1)} s${errors.length ? `, ${errors.length} diagnostics:\n${errors.slice(0, 20).join("\n")}` : ", clean"}`);

const exe = join(build, "Release", `${name}.exe`);
const png = join(work, "capture.png");
run(exe, [], { FIGFLOW_CAPTURE: png });
const cmp = tsx("compare.ts", [fig, frame, png, join(work, "compare")]);
console.log(cmp.out.trim());
