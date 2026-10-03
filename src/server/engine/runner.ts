import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { buffer } from "node:stream/consumers";
import { renderAsync } from "@resvg/resvg-js";
import { ZipFile } from "yazl";
import type { BuildResult } from "../../engine/fig/build";
import { FigFile } from "../../engine/fig/open";
import { googleFontsProvider } from "../../engine/fonts/google";
import { rasterBackdrop } from "../../engine/render/backdrop";
import { ImageLevels } from "../../engine/render/images";
import { imageSizes, renderSvg } from "../../engine/render/svg";
import { analyzeFlow } from "../../engine/semantic/flow";
import { pickStart } from "../../engine/semantic/start";
import { readBytes, syncTreeToBlob, usesBlob, writeBytes } from "../data/io";
import type { FileManifest, FrameFlow, ProjectManifest, UnitManifest, WorkerRequest, WorkerResult } from "./protocol";

export class EngineRunner {
  private fig: FigFile | null = null;
  private levels: ImageLevels | null = null;

  private open() {
    if (!this.fig) throw new Error("No file is open.");
    return this.fig;
  }

  private images() {
    return (this.levels ??= new ImageLevels(this.open().images));
  }

  private async writeOut(path: string, bytes: Uint8Array) {
    await writeBytes(path, bytes);
  }

  private async renderPng(built: BuildResult, scale: number, part?: { x: number; y: number; w: number; h: number }): Promise<Buffer> {
    const side = Math.min(built.root.size.x, built.root.size.y);
    if (side > 0 && side * scale < 1) scale = 1 / side;
    const drawn = new Map([...imageSizes(built.root)].map(([hash, s]) => [hash, { w: s.w * scale, h: s.h * scale }]));
    await this.images().prepare(drawn);
    const svg = renderSvg(built.root, { imageHref: this.images().href, glyphs: built.glyphs, backdrop: rasterBackdrop, rasterScale: scale });
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

  private flowOf(frame: string): FrameFlow {
    const flow = analyzeFlow(this.open(), frame);
    return {
      screens: flow.screens.map((s) => ({ id: s.id, name: s.name })),
      popups: flow.popups.map((p) => ({ id: p.popup.id, name: p.popup.name, screen: p.screen, open: p.open })),
      toasts: flow.toasts.map((t) => ({ name: t.toast.name })),
      notes: flow.notes,
    };
  }

  private async generate(req: Extract<WorkerRequest, { op: "generate" }>): Promise<ProjectManifest> {
    const t0 = performance.now();
    await mkdir(req.dir, { recursive: true });
    const { generateProject } = await import("../../engine/codegen/project");
    const project = await generateProject({
      fig: this.open(),
      frameId: req.frame,
      name: req.name,
      runtimeDir: req.runtimeDir,
      fontProvider: googleFontsProvider(req.fontCacheDir),
      images: this.images(),
    });

    const tSave = performance.now();
    const files: FileManifest[] = [];
    const writes: Promise<unknown>[] = [];
    const zip = new ZipFile();
    for (const f of project.files) {
      const bytes = typeof f.contents === "string" ? Buffer.from(f.contents, "utf8") : Buffer.from(f.contents.buffer, f.contents.byteOffset, f.contents.byteLength);
      const path = join(req.dir, "files", ...f.path.split("/"));
      writes.push(mkdir(dirname(path), { recursive: true }).then(() => writeFile(path, bytes)));
      zip.addBuffer(bytes, `${project.name}/${f.path}`, { compress: !f.path.endsWith(".png") });
      files.push({ path: f.path, size: bytes.length, kind: f.kind });
    }
    zip.end();
    const [archive] = await Promise.all([buffer(zip.outputStream), ...writes]);
    const zipName = `${project.name}.zip`;
    await this.writeOut(join(req.dir, zipName), archive);
    if (usesBlob()) await syncTreeToBlob(req.dir);

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

  async handle(req: WorkerRequest): Promise<WorkerResult[WorkerRequest["op"]]> {
    switch (req.op) {
      case "open": {
        const bytes = await readBytes(req.path);
        if (!bytes) throw new Error("The design file is missing.");
        this.fig = FigFile.open(new Uint8Array(bytes));
        this.levels = null;
        return { name: this.fig.name, pages: this.fig.pages() };
      }
      case "thumb": {
        const built = this.open().build(req.frame);
        const w = Math.max(1, built.root.size.x);
        const png = await this.renderPng(built, Math.min(4, req.width / w));
        await this.writeOut(req.out, png);
        return { width: built.root.size.x, height: built.root.size.y };
      }
      case "flow":
        return this.flowOf(req.frame);
      case "generate":
        return this.generate(req);
      case "pick":
        return pickStart(this.open());
      case "preview": {
        const built = this.open().build(req.frame);
        const width = req.rect?.w ?? built.root.size.x;
        const scale = Math.min(2, Math.max(1, 1800 / Math.max(1, width)));
        const png = await this.renderPng(built, scale, req.rect);
        await this.writeOut(req.out, png);
        return { width, height: req.rect?.h ?? built.root.size.y };
      }
    }
  }

  close() {
    this.fig = null;
    this.levels = null;
  }
}

