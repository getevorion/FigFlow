/**
 * Bakes raster requests (vectors, icons, images, effects Dear ImGui can't
 * draw natively) into PNG assets through the reference SVG renderer.
 * Identical results are stored once.
 */
import { createHash } from "node:crypto";
import { availableParallelism } from "node:os";
import { renderAsync, type ResvgRenderOptions } from "@resvg/resvg-js";
import sharp from "sharp";
import type { ImageLevels } from "../render/images";
import { IDENTITY } from "../model/math";
import { imageSizes, renderNodeSvg, type Size } from "../render/svg";
import type { DesignNode } from "../model/types";
import type { RasterRequest } from "./plan";
import { NameScope, cleanLayerName, snake } from "./cpp";

export type ImageAssetOut = {
  index: number;
  ident: string;
  png: Uint8Array;
  width: number;
  height: number;
  /** Pixels per design pixel the PNG was baked at. */
  scale: number;
  mask: boolean;
  /** `png` holds a PNG, or a JPEG for an opaque photo (a fraction of the bytes to compile in). */
  format: "png" | "jpeg";
  reason: string;
};

export type BakeResult = {
  assets: ImageAssetOut[];
  /** raster request id → asset index */
  byRequest: Map<string, number>;
};

/** One build's raster requests, with the glyph table their text is drawn from. */
export type BakeJob = { requests: RasterRequest[]; glyphs: string[] };

const RENDER: ResvgRenderOptions = { fitTo: { mode: "zoom", value: 1 }, font: { loadSystemFonts: false } };
const PNG = { compressionLevel: 4, adaptiveFiltering: true } as const;
/** Renders in flight at once, each holding its pixels until encoded; both run on libuv's thread pool. */
const PARALLEL = Math.max(1, Math.min(4, availableParallelism()));

type Baked = { png: Buffer; width: number; height: number; format: "png" | "jpeg" };

/** Photos at least this many pixels are JPEG when they come out opaque. */
const PHOTO_PIXELS = 128 * 128;
const JPEG = { quality: 95, chromaSubsampling: "4:4:4" } as const;

function opaque(px: Uint8Array): boolean {
  for (let i = 3; i < px.length; i += 4) if (px[i] !== 255) return false;
  return true;
}

async function bake(svg: string, tintAlpha: number | null, photo: boolean): Promise<Baked> {
  const rendered = await renderAsync(svg, RENDER);
  const { width, height } = rendered;
  const px = rendered.pixels;
  if (tintAlpha === null) {
    if (photo && width * height >= PHOTO_PIXELS && opaque(px)) {
      const jpg = await sharp(px, { raw: { width, height, channels: 4 } }).removeAlpha().jpeg(JPEG).toBuffer();
      return { png: jpg, width, height, format: "jpeg" };
    }
    // resvg's pixels are premultiplied; sharp divides the alpha back out.
    const png = await sharp(px, { raw: { width, height, channels: 4, premultiplied: true } }).png(PNG).toBuffer();
    return { png, width, height, format: "png" };
  }
  // Single-color artwork: keep coverage only, the tint is applied at runtime.
  for (let i = 0; i < px.length; i += 4) {
    px[i] = 255;
    px[i + 1] = 255;
    px[i + 2] = 255;
    px[i + 3] = Math.min(255, Math.round(px[i + 3] / tintAlpha));
  }
  const png = await sharp(px, { raw: { width, height, channels: 4 } }).png(PNG).toBuffer();
  return { png, width, height, format: "png" };
}

/** Holds a picture: an image fill on the layer or anything in it. */
function hasPicture(n: DesignNode): boolean {
  return (n.visible && n.fills.some((p) => p.visible && p.type === "IMAGE")) || n.children.some(hasPicture);
}

/**
 * A blended layer as an ordinary image: drawn with plain alpha over what's beneath it (as
 * Dear ImGui draws), it gives what the blend mode gives. With `after` the backdrop with
 * the layer blended on, `before` the backdrop alone and `a` the layer's coverage (all
 * premultiplied), source-over compositing says after = F + before·(1 − a), so
 * F = after − before·(1 − a), with alpha a. Where the layer paints nothing F is empty,
 * so whatever lies beneath (controls included) stays live.
 */
async function bakeBlend(after: string, before: string, cover: string, crop: { left: number; top: number; right: number; bottom: number }): Promise<Baked> {
  // The backdrops are rendered whole and cropped: rendering only a region of a whole frame
  // trips a resvg panic on groups the smaller viewport culls (see backdrop.ts).
  const [A, B, C] = await Promise.all([renderAsync(after, { ...RENDER, crop }), renderAsync(before, { ...RENDER, crop }), renderAsync(cover, RENDER)]);
  const { width, height } = C;
  if (A.width !== width || B.width !== width || A.height !== height || B.height !== height) throw new Error("blend bake: renders differ in size");
  const pa = A.pixels;
  const pb = B.pixels;
  const out = C.pixels;
  for (let i = 0; i < out.length; i += 4) {
    const alpha = out[i + 3];
    if (alpha === 0) {
      out[i] = out[i + 1] = out[i + 2] = 0;
      continue;
    }
    const keep = 1 - alpha / 255;
    for (let c = 0; c < 3; c++) out[i + c] = Math.max(0, Math.min(alpha, Math.round(pa[i + c] - pb[i + c] * keep)));
  }
  const png = await sharp(out, { raw: { width, height, channels: 4, premultiplied: true } }).png(PNG).toBuffer();
  return { png, width, height, format: "png" };
}

/** Runs `fn` over `items` at most `limit` at a time, started in `order` (indices); results in input order. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>, order = items.map((_, i) => i)): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  let failed = false;
  const run = async () => {
    while (!failed && next < order.length) {
      const i = order[next++];
      try {
        out[i] = await fn(items[i]);
      } catch (e) {
        failed = true;
        throw e;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return out;
}

/** `images`: the design's images, with the copies earlier renders made (see images.ts). */
export async function bakeRasters(jobs: BakeJob[], images: ImageLevels, scale = 1): Promise<BakeResult> {
  // A blended layer's bake draws its backdrop too, and so the backdrop's images.
  const work = jobs.flatMap((job) => job.requests.map((req) => ({ req, glyphs: job.glyphs, uses: req.mode === "blend" && req.backdrop ? imageSizes(req.backdrop, IDENTITY) : imageSizes(req.node, req.toRoot) })));
  // Each image at the largest size any of the rasters draws it, made when the first raster using it is.
  const drawn = new Map<string, Size>();
  for (const { uses } of work)
    for (const [hash, s] of uses) {
      const known = drawn.get(hash);
      drawn.set(hash, { w: Math.max(known?.w ?? 0, s.w * scale), h: Math.max(known?.h ?? 0, s.h * scale) });
    }
  const rectOf = (req: RasterRequest) => (req.mode === "fill-only" ? { x: req.node.box.x, y: req.node.box.y, w: req.node.size.x, h: req.node.size.y } : req.rect);
  // Largest first: the longest render starts at once rather than holding up the end.
  const area = (i: number) => rectOf(work[i].req).w * rectOf(work[i].req).h;
  const order = work.map((_, i) => i).sort((a, b) => area(b) - area(a));
  // The same drawing requested twice (a background every screen shares) is rendered once.
  const inFlight = new Map<string, Promise<Baked>>();
  const baked = await mapLimit(
    work,
    PARALLEL,
    async ({ req, glyphs, uses }) => {
      await images.prepare(new Map([...uses.keys()].map((hash) => [hash, drawn.get(hash)!])));
      const rect = rectOf(req);
      const vp = { x: rect.x, y: rect.y, w: Math.max(1, rect.w), h: Math.max(1, rect.h) };
      if (req.mode === "blend" && req.backdrop) {
        const opts = { imageHref: images.href, glyphs, scale };
        const whole = { x: 0, y: 0, w: req.backdrop.size.x, h: req.backdrop.size.y };
        const after = renderNodeSvg(req.backdrop, IDENTITY, whole, { ...opts, stopAfter: req.node });
        const before = renderNodeSvg(req.backdrop, IDENTITY, whole, { ...opts, stopBefore: req.node });
        const cover = renderNodeSvg({ ...req.node, blendMode: "NORMAL" }, req.toRoot, vp, opts);
        const crop = { left: Math.round(vp.x * scale), top: Math.round(vp.y * scale), right: Math.round((vp.x + vp.w) * scale), bottom: Math.round((vp.y + vp.h) * scale) };
        const key = createHash("sha1").update(`blend|${JSON.stringify(crop)}|`).update(after).update(before).update(cover).digest("base64");
        let pending = inFlight.get(key);
        if (!pending) inFlight.set(key, (pending = bakeBlend(after, before, cover, crop)));
        return pending;
      }
      const svg = renderNodeSvg(req.node, req.toRoot, vp, { imageHref: images.href, glyphs, scale });
      const tintAlpha = req.mode === "mask" ? Math.max(1 / 255, req.tint?.a ?? 1) : null;
      const photo = tintAlpha === null && hasPicture(req.node);
      const key = createHash("sha1").update(`${tintAlpha ?? "color"}|${photo}|`).update(svg).digest("base64");
      let pending = inFlight.get(key);
      if (!pending) inFlight.set(key, (pending = bake(svg, tintAlpha, photo)));
      return pending;
    },
    order,
  );

  // In request order, so names and indices don't depend on which render finished first.
  const assets: ImageAssetOut[] = [];
  const byHash = new Map<string, number>();
  const byRequest = new Map<string, number>();
  const names = new NameScope();
  work.forEach(({ req }, i) => {
    const { png, width, height, format } = baked[i];
    const hash = createHash("sha1").update(png).digest("hex");
    let index = byHash.get(hash);
    if (index === undefined) {
      index = assets.length;
      const ident = names.take(snake(`${req.mode === "mask" ? "icon" : "img"} ${req.hint || cleanLayerName(req.node.name) || "image"}`, "img"));
      assets.push({ index, ident, png: new Uint8Array(png), width, height, scale, mask: req.mode === "mask", format, reason: req.reason });
      byHash.set(hash, index);
    }
    byRequest.set(req.id, index);
  });
  return { assets, byRequest };
}
