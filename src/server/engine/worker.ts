/**
 * The engine worker: a Node process of its own (`node --import tsx worker.ts`)
 * that opens one uploaded .fig and answers the site's requests about it:
 * frame thumbnails, where a frame's buttons lead, and generated projects.
 * Parsing and rendering an untrusted file happens only here, so a file that
 * hangs, eats memory or crashes takes this process down and nothing else; the
 * pool (pool.ts) enforces the time and memory limits.
 *
 * Protocol (protocol.ts): one JSON request per line on stdin, one JSON reply
 * per line on stdout, answered in order.
 */
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { buffer } from "node:stream/consumers";
import { renderAsync } from "@resvg/resvg-js";
import { ZipFile } from "yazl";
import type { BuildResult } from "../../engine/fig/build";
import { FigFile } from "../../engine/fig/open";
import { formatCpp } from "../../engine/codegen/format";
import { generateProject } from "../../engine/codegen/project";
import { googleFontsProvider } from "../../engine/fonts/google";
import { rasterBackdrop } from "../../engine/render/backdrop";
import { ImageLevels } from "../../engine/render/images";
import { imageSizes, renderSvg } from "../../engine/render/svg";
import { analyzeFlow } from "../../engine/semantic/flow";
import { pickStart } from "../../engine/semantic/start";
import { writeFileAtomic } from "../atomic";
import type { FileManifest, FrameFlow, ProjectManifest, UnitManifest, WorkerReply, WorkerRequest, WorkerResult } from "./protocol";

// stdout carries the protocol; anything else that prints goes to stderr.
const send = process.stdout.write.bind(process.stdout);
const toStderr = (...args: unknown[]) => void process.stderr.write(`${args.map((a) => (a instanceof Error ? a.stack : String(a))).join(" ")}\n`);
console.log = console.info = console.warn = console.debug = toStderr;

let fig: FigFile | null = null;
/** The open file's images, with the downscaled copies renders have needed so far (kept while it's open). */
let levels: ImageLevels | null = null;

function open(): FigFile {
  if (!fig) throw new Error("No file is open.");
  return fig;
}

function images(): ImageLevels {
  return (levels ??= new ImageLevels(open().images));
}

/** Writes a file whole or not at all (readers may be waiting for it to appear). */
async function writeAtomic(path: string, bytes: Uint8Array) {
  await mkdir(dirname(path), { recursive: true });
  await writeFileAtomic(path, bytes);
}

/** A frame (or part of one) as a PNG through the reference renderer, `scale` pixels per design pixel. */
async function renderPng(built: BuildResult, scale: number, part?: { x: number; y: number; w: number; h: number }): Promise<Buffer> {
  // resvg fails below half a pixel on a side: a thin divider frame shrunk to a thumbnail gets 1 px instead.
  const side = Math.min(built.root.size.x, built.root.size.y);
  if (side > 0 && side * scale < 1) scale = 1 / side;
  const drawn = new Map([...imageSizes(built.root)].map(([hash, s]) => [hash, { w: s.w * scale, h: s.h * scale }]));
  await images().prepare(drawn);
  const svg = renderSvg(built.root, { imageHref: images().href, glyphs: built.glyphs, backdrop: rasterBackdrop, rasterScale: scale });
  // A part (a toast) is cut out of the whole render, in its pixels.
  const W = Math.round(built.root.size.x * scale);
  const H = Math.round(built.root.size.y * scale);
  const crop = part && {
    left: Math.max(0, Math.floor(part.x * scale)),
    top: Math.max(0, Math.floor(part.y * scale)),
    right: Math.min(W, Math.ceil((part.x + part.w) * scale)),
    bottom: Math.min(H, Math.ceil((part.y + part.h) * scale)),
  };
  const inside = crop && crop.right > crop.left && crop.bottom > crop.top;
  const rendered = await renderAsync(svg, { fitTo: { mode: "zoom", value: scale }, font: { loadSystemFonts: false }, ...(inside ? { crop } : {}) });
  return rendered.asPng();
}

function flowOf(frame: string): FrameFlow {
  const flow = analyzeFlow(open(), frame);
  return {
    screens: flow.screens.map((s) => ({ id: s.id, name: s.name })),
    popups: flow.popups.map((p) => ({ id: p.popup.id, name: p.popup.name, screen: p.screen, open: p.open })),
    toasts: flow.toasts.map((t) => ({ name: t.toast.name })),
    notes: flow.notes,
  };
}

async function generate(req: Extract<WorkerRequest, { op: "generate" }>): Promise<ProjectManifest> {
  const t0 = performance.now();
  const project = await generateProject({
    fig: open(),
    frameId: req.frame,
    name: req.name,
    runtimeDir: req.runtimeDir,
    fontProvider: googleFontsProvider(req.fontCacheDir),
    images: images(),
  });

  const tSave = performance.now();
  // The files, one by one (for the code view) and zipped under the project's folder, both at once:
  // zlib compresses every file on the thread pool while they're written.
  const files: FileManifest[] = [];
  const writes: Promise<unknown>[] = [];
  const zip = new ZipFile();
  for (const f of project.files) {
    const bytes = typeof f.contents === "string" ? Buffer.from(f.contents, "utf8") : Buffer.from(f.contents.buffer, f.contents.byteOffset, f.contents.byteLength);
    const path = join(req.dir, "files", ...f.path.split("/"));
    writes.push(mkdir(dirname(path), { recursive: true }).then(() => writeFile(path, bytes)));
    // PNGs are compressed already: stored as they are.
    zip.addBuffer(bytes, `${project.name}/${f.path}`, { compress: !f.path.endsWith(".png") });
    files.push({ path: f.path, size: bytes.length, kind: f.kind });
  }
  zip.end();
  const [archive] = await Promise.all([buffer(zip.outputStream), ...writes]);
  const zipName = `${project.name}.zip`;
  await writeAtomic(join(req.dir, zipName), archive);

  // Screens, popups and toasts, with the frames they're drawn from (previews are rendered on request).
  const units: UnitManifest[] = project.units.map((u) => ({
    kind: u.kind,
    ident: u.ident,
    name: u.name,
    frame: u.built.root.id,
    rect: u.rect,
    ...(u.start ? { start: true } : {}),
    ...(u.over ? { over: u.over } : {}),
  }));

  return {
    name: project.name,
    stats: project.stats,
    warnings: project.warnings.map((w) => ({ code: w.code, message: w.message, ...(w.nodeName ? { node: w.nodeName } : {}) })),
    units,
    elements: project.elements,
    files,
    zip: { name: zipName, size: archive.length },
    ms: Math.round(performance.now() - t0),
    timings: { ...project.timings, save: Math.round(performance.now() - tSave) },
  };
}

async function handle(req: WorkerRequest): Promise<WorkerResult[WorkerRequest["op"]]> {
  switch (req.op) {
    case "open": {
      fig = FigFile.open(new Uint8Array(readFileSync(req.path)));
      levels = null;
      return { name: fig.name, pages: fig.pages() };
    }
    case "thumb": {
      const built = open().build(req.frame);
      const w = Math.max(1, built.root.size.x);
      const png = await renderPng(built, Math.min(4, req.width / w));
      await writeAtomic(req.out, png);
      return { width: built.root.size.x, height: built.root.size.y };
    }
    case "flow":
      return flowOf(req.frame);
    case "generate":
      return generate(req);
    case "pick":
      return pickStart(open());
    case "preview": {
      // Sharp at up to 2x, for high-density screens; a toast is cut out of its frame.
      const built = open().build(req.frame);
      const width = req.rect?.w ?? built.root.size.x;
      const scale = Math.min(2, Math.max(1, 1800 / Math.max(1, width)));
      const png = await renderPng(built, scale, req.rect);
      await writeAtomic(req.out, png);
      return { width, height: req.rect?.h ?? built.root.size.y };
    }
  }
}

// Requests are answered one at a time, in order.
let queue = Promise.resolve();
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
lines.on("line", (line) => {
  queue = queue.then(async () => {
    let req: WorkerRequest;
    try {
      req = JSON.parse(line) as WorkerRequest;
    } catch {
      return;
    }
    let reply: WorkerReply;
    try {
      reply = { id: req.id, ok: true, result: await handle(req) };
    } catch (e) {
      toStderr(e);
      reply = { id: req.id, ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    send(`${JSON.stringify(reply)}\n`);
  });
});
lines.on("close", () => process.exit(0));
// The formatter compiles its WebAssembly on first use: before the first project, not during it.
formatCpp("int x;\n", "warm.cpp");
send(`${JSON.stringify({ id: 0, ok: true, result: "ready" })}\n`);
