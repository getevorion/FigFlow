/**
 * DesignNode tree → SVG. The reference rendering of a design: used for the
 * browser preview (elements carry data-id for click-to-inspect), for
 * rasterizing artwork the ImGui runtime can't draw natively, and as the
 * oracle compiled output is compared against.
 */
import type { BlurEffect, Corners, DesignNode, GradientPaint, Mat, Paint, Rect, RGBA, ShadowEffect, Stroke } from "../model/types";
import { fitCorners } from "../fig/style";
import { IDENTITY, invert, mul, transformedBounds, translate } from "../model/math";
import type { BackdropImage, BackdropRequest } from "./backdrop";

export type SvgOptions = {
  /**
   * URL or data URI for an image hash. `size`, when given, is the largest the
   * document draws the whole image, in output pixels: a copy downscaled to
   * about that size looks the same (images are drawn as unit squares, so any
   * resolution fits) and renders faster; see ImageLevels in images.ts.
   */
  imageHref: (hash: string, size?: Size) => string | undefined;
  /** Deduplicated glyph outlines (em units, y down). */
  glyphs: string[];
  /** Adds data-id attributes for hit testing. */
  ids?: boolean;
  /** Render the root's own fills/effects (true) or only its children. */
  includeRootBackground?: boolean;
  /** Extra scale for rasterization. */
  scale?: number;
  /** Draw a checkerboard under transparent areas. */
  background?: string;
  /** Blurs a layer's backdrop in raster space (rasterBackdrop in backdrop.ts); without it, background blurs are skipped. */
  backdrop?: (req: BackdropRequest) => BackdropImage | undefined;
  /** The scale the document will be rasterized at when the rasterizer sets it (not `scale`): images and backdrops needn't be sharper. */
  rasterScale?: number;
  /** Draw only what's painted before this layer (what a blend mode on it blends with). */
  stopBefore?: DesignNode;
  /** Draw only what's painted up to and including this layer. */
  stopAfter?: DesignNode;
};

const n = (v: number) => {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? "0" : String(r);
};

export type Size = { w: number; h: number };

export const rgbaCss = (c: RGBA, alpha = 1) => {
  const a = Math.max(0, Math.min(1, c.a * alpha));
  const ch = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255);
  return a >= 0.999 ? `rgb(${ch(c.r)},${ch(c.g)},${ch(c.b)})` : `rgba(${ch(c.r)},${ch(c.g)},${ch(c.b)},${n(a)})`;
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

const matAttr = (m: Mat) =>
  m.m00 === 1 && m.m01 === 0 && m.m10 === 0 && m.m11 === 1
    ? m.m02 === 0 && m.m12 === 0
      ? ""
      : ` transform="translate(${n(m.m02)} ${n(m.m12)})"`
    : ` transform="matrix(${n(m.m00)} ${n(m.m10)} ${n(m.m01)} ${n(m.m11)} ${n(m.m02)} ${n(m.m12)})"`;

/** Rounded rectangle path with four independent radii (already fitted). */
export function roundedRectPath(x: number, y: number, w: number, h: number, c: Corners): string {
  const r = fitCorners(c, w, h);
  if (r.tl <= 0 && r.tr <= 0 && r.br <= 0 && r.bl <= 0) return `M${n(x)} ${n(y)}H${n(x + w)}V${n(y + h)}H${n(x)}Z`;
  return (
    `M${n(x + r.tl)} ${n(y)}` +
    `H${n(x + w - r.tr)}` +
    (r.tr > 0 ? `A${n(r.tr)} ${n(r.tr)} 0 0 1 ${n(x + w)} ${n(y + r.tr)}` : "") +
    `V${n(y + h - r.br)}` +
    (r.br > 0 ? `A${n(r.br)} ${n(r.br)} 0 0 1 ${n(x + w - r.br)} ${n(y + h)}` : "") +
    `H${n(x + r.bl)}` +
    (r.bl > 0 ? `A${n(r.bl)} ${n(r.bl)} 0 0 1 ${n(x)} ${n(y + h - r.bl)}` : "") +
    `V${n(y + r.tl)}` +
    (r.tl > 0 ? `A${n(r.tl)} ${n(r.tl)} 0 0 1 ${n(x + r.tl)} ${n(y)}` : "") +
    "Z"
  );
}

function insetCorners(c: Corners, d: number): Corners {
  return { tl: Math.max(0, c.tl - d), tr: Math.max(0, c.tr - d), br: Math.max(0, c.br - d), bl: Math.max(0, c.bl - d), smoothing: c.smoothing };
}

/** An image paint's crop transform, inverted: it maps the image's unit square into the layer's. */
function cropInverse(t: Mat): Mat {
  const det = t.m00 * t.m11 - t.m01 * t.m10 || 1;
  return { m00: t.m11 / det, m01: -t.m01 / det, m10: -t.m10 / det, m11: t.m00 / det, m02: (t.m01 * t.m12 - t.m11 * t.m02) / det, m12: (t.m10 * t.m02 - t.m00 * t.m12) / det };
}

/** How large a paint draws its whole image, in the layer's units (null for other paints). */
function imageDrawSize(p: Paint, node: DesignNode): Size | null {
  if (p.type !== "IMAGE" || !p.visible) return null;
  const w = node.size.x;
  const h = node.size.y;
  const iw = p.imageSize?.x ?? w;
  const ih = p.imageSize?.y ?? h;
  if (p.scaleMode === "FILL" || p.scaleMode === "FIT") {
    const k = p.scaleMode === "FILL" ? Math.max(w / iw, h / ih) : Math.min(w / iw, h / ih);
    return { w: iw * k, h: ih * k };
  }
  if (p.scaleMode === "STRETCH" && p.transform) {
    // The unit square through scale(w, h) and the inverted crop: its sides are the columns.
    const inv = cropInverse(p.transform);
    return { w: Math.hypot(w * inv.m00, h * inv.m10), h: Math.hypot(w * inv.m01, h * inv.m11) };
  }
  if (p.scaleMode === "TILE") return { w: iw * (p.scale ?? 1), h: ih * (p.scale ?? 1) };
  return { w, h };
}

/** The most a transform stretches any length. */
function matScale(m: Mat): number {
  return Math.max(Math.hypot(m.m00, m.m10), Math.hypot(m.m01, m.m11));
}

/**
 * The largest each image is drawn under `root` (transformed by `toRoot`), in
 * root units: what a render needs to prepare ImageLevels (images.ts) for.
 */
export function imageSizes(root: DesignNode, toRoot: Mat = IDENTITY, out = new Map<string, Size>()): Map<string, Size> {
  if (!root.visible) return out;
  const k = matScale(toRoot);
  const paints = [...root.fills, ...root.strokes, ...(root.text?.runs.flatMap((r) => r.fills) ?? [])];
  for (const p of paints) {
    const d = imageDrawSize(p, root);
    if (!d || p.type !== "IMAGE") continue;
    const known = out.get(p.hash);
    out.set(p.hash, { w: Math.max(known?.w ?? 0, d.w * k), h: Math.max(known?.h ?? 0, d.h * k) });
  }
  for (const c of root.children) imageSizes(c, mul(toRoot, c.transform), out);
  return out;
}

function isBoxShape(node: DesignNode): boolean {
  return node.kind === "RECTANGLE" || node.kind === "FRAME" || node.kind === "COMPONENT" || node.kind === "INSTANCE" || node.kind === "COMPONENT_SET" || node.kind === "SECTION";
}

class SvgWriter {
  defs: string[] = [];
  private uid = 0;
  private glyphUsed = new Set<number>();
  private imageIds = new Map<string, string>();
  /** The largest each image is drawn so far, in root units. */
  private imageDrawn = new Map<string, Size>();
  /** The tree's root, for background blurs (they blur what's painted before them). */
  root: DesignNode | null = null;
  /** While drawing a backdrop: the layer it's for (drawing stops there). */
  stopAt: DesignNode | null = null;
  stopped = false;
  /** Past opts.stopBefore / opts.stopAfter: nothing more is drawn. */
  cut = false;

  /** `canvas`: the part of root space the document shows. */
  constructor(
    readonly opts: SvgOptions,
    public canvas: Rect,
  ) {}

  /**
   * Where a layer's filter works, as <filter> attributes. It must hold what
   * the filter paints and every pixel it reads (`reach`: how far that is from
   * what it paints). The usual margin of `k` times the layer's bounds on each
   * side grows with the layer, so for a large one the canvas in the layer's
   * space, widened by the reach, is the smaller region, and still exact:
   * nothing outside the canvas is seen.
   */
  region(node: DesignNode, toRoot: Mat, reach: number, k: number): string {
    const relative = `x="${-k * 100}%" y="${-k * 100}%" width="${(1 + 2 * k) * 100}%" height="${(1 + 2 * k) * 100}%"`;
    const inv = invert(toRoot);
    if (!inv) return relative;
    const c = transformedBounds(mul(inv, translate(this.canvas.x, this.canvas.y)), this.canvas.w, this.canvas.h);
    const w = c.w + 2 * reach;
    const h = c.h + 2 * reach;
    if (w * h >= Math.max(1, node.size.x) * Math.max(1, node.size.y) * (1 + 2 * k) ** 2) return relative;
    return `filterUnits="userSpaceOnUse" x="${n(c.x - reach)}" y="${n(c.y - reach)}" width="${n(w)}" height="${n(h)}"`;
  }

  /**
   * A unit-square <image> in defs, once per image (each use scales it), so
   * repeats don't copy the data. The data itself is written per document by
   * imageDefs(), at that document's scale.
   */
  imageDef(hash: string): string {
    const known = this.imageIds.get(hash);
    if (known) return known;
    const id = this.id("im");
    this.imageIds.set(hash, id);
    return id;
  }

  /** The images used so far, for a document rasterized at `scale`. */
  imageDefs(scale: number): string {
    let out = "";
    for (const [hash, id] of this.imageIds) {
      const d = this.imageDrawn.get(hash);
      const href = this.opts.imageHref(hash, d && { w: d.w * scale, h: d.h * scale });
      if (href) out += `<image id="${id}" href="${esc(href)}" width="1" height="1" preserveAspectRatio="none"/>`;
    }
    return out;
  }

  id(prefix: string) {
    return `${prefix}${++this.uid}`;
  }

  useGlyph(i: number) {
    this.glyphUsed.add(i);
    return `g${i}`;
  }

  glyphDefs(): string {
    return [...this.glyphUsed].map((i) => `<path id="g${i}" d="${this.opts.glyphs[i]}"/>`).join("");
  }

  /** Returns an SVG paint reference for fill/stroke attributes; `toRoot` maps the layer to root space. */
  paint(p: Paint, node: DesignNode, shapeD: string, toRoot: Mat): { attr: string; extra?: string } | null {
    if (!p.visible) return null;
    switch (p.type) {
      case "SOLID":
        return { attr: rgbaCss(p.color, p.opacity) };
      case "GRADIENT_LINEAR":
      case "GRADIENT_RADIAL":
      case "GRADIENT_DIAMOND":
      case "GRADIENT_ANGULAR":
        return { attr: `url(#${this.gradient(p)})` };
      case "IMAGE": {
        if (!this.opts.imageHref(p.hash)) return { attr: "rgba(200,200,200,0.35)" };
        const drawn = imageDrawSize(p, node)!;
        const k = matScale(toRoot);
        const known = this.imageDrawn.get(p.hash);
        this.imageDrawn.set(p.hash, { w: Math.max(known?.w ?? 0, drawn.w * k), h: Math.max(known?.h ?? 0, drawn.h * k) });
        const clip = this.id("ic");
        this.defs.push(`<clipPath id="${clip}"><path d="${shapeD}"/></clipPath>`);
        const w = node.size.x;
        const h = node.size.y;
        const iw = p.imageSize?.x ?? w;
        const ih = p.imageSize?.y ?? h;
        let img = "";
        const unit = this.imageDef(p.hash);
        if (p.scaleMode === "FILL" || p.scaleMode === "FIT") {
          const s = p.scaleMode === "FILL" ? Math.max(w / iw, h / ih) : Math.min(w / iw, h / ih);
          const dw = iw * s;
          const dh = ih * s;
          img = `<use href="#${unit}" transform="translate(${n((w - dw) / 2)} ${n((h - dh) / 2)}) scale(${n(dw)} ${n(dh)})"/>`;
        } else if (p.scaleMode === "STRETCH" && p.transform) {
          // transform maps the layer's unit square into the image's unit square
          const inv = cropInverse(p.transform);
          img = `<use href="#${unit}" transform="scale(${n(w)} ${n(h)}) matrix(${n(inv.m00)} ${n(inv.m10)} ${n(inv.m01)} ${n(inv.m11)} ${n(inv.m02)} ${n(inv.m12)})"/>`;
        } else if (p.scaleMode === "TILE") {
          const s = p.scale ?? 1;
          const pat = this.id("pt");
          this.defs.push(
            `<pattern id="${pat}" patternUnits="userSpaceOnUse" width="${n(iw * s)}" height="${n(ih * s)}"><use href="#${unit}" transform="scale(${n(iw * s)} ${n(ih * s)})"/></pattern>`,
          );
          return { attr: `url(#${pat})`, extra: p.opacity < 1 ? ` fill-opacity="${n(p.opacity)}"` : undefined };
        } else {
          img = `<use href="#${unit}" transform="scale(${n(w)} ${n(h)})"/>`;
        }
        return { attr: "", extra: `<g clip-path="url(#${clip})"${p.opacity < 1 ? ` opacity="${n(p.opacity)}"` : ""}>${img}</g>` };
      }
    }
  }

  gradient(p: GradientPaint): string {
    const id = this.id("gr");
    const stops = p.stops
      .map((s) => `<stop offset="${n(s.position)}" stop-color="${rgbaCss({ ...s.color, a: 1 })}"${s.color.a * p.opacity < 0.999 ? ` stop-opacity="${n(s.color.a * p.opacity)}"` : ""}/>`)
      .join("");
    if (p.type === "GRADIENT_LINEAR" || p.type === "GRADIENT_ANGULAR") {
      this.defs.push(
        `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${n(p.from.x)}" y1="${n(p.from.y)}" x2="${n(p.to.x)}" y2="${n(p.to.y)}">${stops}</linearGradient>`,
      );
    } else {
      // Radial: an ellipse centred at `from`, with semi-axes to `to` and to `width`.
      const ax = { x: p.to.x - p.from.x, y: p.to.y - p.from.y };
      const bx = { x: p.width.x - p.from.x, y: p.width.y - p.from.y };
      this.defs.push(
        `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="1" gradientTransform="matrix(${n(ax.x)} ${n(ax.y)} ${n(bx.x)} ${n(bx.y)} ${n(p.from.x)} ${n(p.from.y)})">${stops}</radialGradient>`,
      );
    }
    return id;
  }

  blurFilter(sigma: number, region: string): string {
    const id = this.id("bl");
    this.defs.push(`<filter id="${id}" ${region} color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${n(sigma)}"/></filter>`);
    return id;
  }

  /**
   * Figma's inner shadow, from the layer's coverage (see coverage()). Its
   * strength s is the shadow's opacity wherever the coverage, shifted by the
   * offset (shrunk by the spread, blurred), doesn't reach; coverage shifted in
   * from outside the layer is empty, so an offset larger than the layer gives
   * full strength everywhere (the usual Figma way to recolour a PNG icon).
   * Figma blends the layer toward the shadow colour by s over the coverage:
   *   result = content * (1 - s) + colour * s * coverage
   * which, unlike painting the shadow over the content, leaves no trace of
   * the original colour at anti-aliased edges and reaches full opacity over a
   * semi-transparent image fill (both verified against Figma's own render).
   * This filter makes the second term; innerShadowKeep() masks the first.
   */
  innerShadowFilter(e: ShadowEffect, region: string): string {
    const id = this.id("is");
    this.defs.push(
      `<filter id="${id}" ${region} color-interpolation-filters="sRGB">` +
        this.innerShadowStrength(e) +
        `<feComposite in="s" in2="SourceAlpha" operator="in"/>` +
        `</filter>`,
    );
    return id;
  }

  /**
   * The mask on the layer's content under an inner shadow (see innerShadowFilter()). The
   * shadow term is painted over it (source-over), which itself scales what's beneath by
   * (1 - s): where the layer is fully covered, that already gives content * (1 - s), so the
   * mask keeps everything. Masking by (1 - s) there too scaled the content twice, leaving it
   * 1 - s + s² opaque (a 31% shadow made a background 79% opaque). At anti-aliased edges the
   * mask keeps (1 - s), which leaves no trace of the original colour under a full-strength
   * shadow, as Figma does.
   */
  innerShadowKeep(e: ShadowEffect, cov: string, region: string): string {
    const f = this.id("isk");
    const interior = `${"0 ".repeat(19)}1`; // coverage from 0.95 up counts as fully covered
    this.defs.push(
      `<filter id="${f}" ${region} color-interpolation-filters="sRGB">` +
        this.innerShadowStrength(e) +
        `<feComponentTransfer in="SourceAlpha" result="f"><feFuncA type="discrete" tableValues="${interior}"/></feComponentTransfer>` +
        `<feComposite in="s" in2="f" operator="out" result="e"/>` +
        `<feFlood flood-color="#fff" flood-opacity="1" result="w"/>` +
        `<feComposite in="w" in2="e" operator="out"/>` +
        `</filter>`,
    );
    const id = this.id("ism");
    this.defs.push(
      `<mask id="${id}" mask-type="alpha" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="-100000" y="-100000" width="200000" height="200000"><g filter="url(#${f})">${cov}</g></mask>`,
    );
    return id;
  }

  /** Filter primitives leaving the shadow colour at strength s in result "s". */
  private innerShadowStrength(e: ShadowEffect): string {
    return (
      `<feOffset in="SourceAlpha" dx="${n(e.offset.x)}" dy="${n(e.offset.y)}" result="o"/>` +
      (e.spread > 0 ? `<feMorphology in="o" operator="erode" radius="${n(e.spread)}" result="o"/>` : "") +
      `<feGaussianBlur in="o" stdDeviation="${n(e.radius / 2)}" result="b"/>` +
      `<feFlood flood-color="${rgbaCss({ ...e.color, a: 1 })}" flood-opacity="${n(e.color.a)}" result="c"/>` +
      `<feComposite in="c" in2="b" operator="out" result="s"/>`
    );
  }

  /**
   * Figma's drop shadow of the layer's coverage. Unless "Show behind
   * transparent areas" is on, it isn't visible behind the layer itself.
   */
  shadowFilter(e: ShadowEffect, region: string): string {
    const id = this.id("ds");
    this.defs.push(
      `<filter id="${id}" ${region} color-interpolation-filters="sRGB">` +
        (e.spread > 0 ? `<feMorphology in="SourceAlpha" operator="dilate" radius="${n(e.spread)}" result="a"/>` : e.spread < 0 ? `<feMorphology in="SourceAlpha" operator="erode" radius="${n(-e.spread)}" result="a"/>` : "") +
        `<feOffset in="${e.spread !== 0 ? "a" : "SourceAlpha"}" dx="${n(e.offset.x)}" dy="${n(e.offset.y)}" result="o"/>` +
        `<feGaussianBlur in="o" stdDeviation="${n(e.radius / 2)}" result="b"/>` +
        `<feFlood flood-color="${rgbaCss({ ...e.color, a: 1 })}" flood-opacity="${n(e.color.a)}"/>` +
        `<feComposite in2="b" operator="in"${e.showBehindNode ? "" : ` result="s"/><feComposite in="s" in2="SourceAlpha" operator="out"`}/>` +
        `</filter>`,
    );
    return id;
  }
}

/** The fill outline of a node in its local space. */
function shapePath(node: DesignNode): string {
  if (node.fillGeometry.length) return node.fillGeometry.map((g) => g.d).join("");
  if (node.kind === "ELLIPSE") {
    const rx = node.size.x / 2;
    const ry = node.size.y / 2;
    return `M${n(rx * 2)} ${n(ry)}A${n(rx)} ${n(ry)} 0 1 1 0 ${n(ry)}A${n(rx)} ${n(ry)} 0 1 1 ${n(rx * 2)} ${n(ry)}Z`;
  }
  return roundedRectPath(0, 0, node.size.x, node.size.y, node.corners);
}

function fillRule(node: DesignNode): string {
  return node.fillGeometry[0]?.winding === "EVENODD" ? ` fill-rule="evenodd"` : "";
}

/**
 * What a layer's shadows are cast from. A layer filled only with images casts
 * from the images' pixels (a transparent PNG casts the shape of what it
 * shows), at full strength whatever the paint's opacity: a 60%-opaque logo
 * with a black inner shadow turns fully black in Figma. Anything else casts
 * from its shape, fills or not.
 */
function coverage(w: SvgWriter, node: DesignNode, d: string, toRoot: Mat): string {
  const visible = node.fills.filter((p) => p.visible);
  if (visible.length && visible.every((p) => p.type === "IMAGE")) {
    return renderFills(w, { ...node, fills: visible.map((p) => ({ ...p, opacity: 1, blendMode: "NORMAL" as const })) }, d, toRoot);
  }
  return `<path d="${d}" fill="#000"${fillRule(node)}/>`;
}

/**
 * Figma's background blur: what's painted behind the layer, blurred, shown
 * where the layer paints: under its fill shape (a fill at any opacity; 100%
 * simply hides it) and under its strokes. A layer without fills shows it only
 * under its strokes (Figma's docs: "you'll need to set the layer's fill
 * opacity to any value between .10 and 99.99%").
 *
 * Only what lies under the layer's own bounds is blurred, with mirrored
 * edges: measured against Figma's render of a stroked card, a blur of the
 * whole backdrop gives 160 and one clamped at the bounds 185, where Figma
 * shows 163-174 and mirrored edges give 173. It is also what a GPU gets by
 * copying the region and sampling it with mirror addressing (the runtime's way).
 */
function backdrop(w: SvgWriter, node: DesignNode, d: string, toRoot: Mat, radius: number): string {
  if (!w.opts.backdrop) return "";
  const b = transformedBounds(toRoot, node.size.x, node.size.y);
  if (b.w < 1 || b.h < 1) return "";
  // What's painted behind the layer, inside its bounds (in root space): only
  // they are blurred, so the filters drawing it needn't work anywhere else.
  const canvas = w.canvas;
  w.canvas = { x: Math.floor(b.x) - 1, y: Math.floor(b.y) - 1, w: Math.ceil(b.w) + 2, h: Math.ceil(b.h) + 2 };
  w.stopAt = node;
  w.stopped = false;
  // The layer is drawn, so a partial document's cut lies after it: the backdrop is all before it.
  const cut = w.cut;
  w.cut = false;
  const behind = renderNode(w, w.root!, true, IDENTITY);
  w.cut = cut;
  w.stopAt = null;
  w.stopped = false;
  w.canvas = canvas;
  if (!behind) return "";
  // The whole frame as the viewport (resvg mishandles content its viewport culls), cropped to the layer.
  const root = w.root!;
  const defs = w.glyphDefs() + w.defs.join("");
  const svgAt = (zoom: number) =>
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${n(root.size.x)}" height="${n(root.size.y)}" viewBox="0 0 ${n(root.size.x)} ${n(root.size.y)}">` +
    `<defs>${w.imageDefs(zoom)}${defs}</defs>${behind}</svg>`;
  const x0 = Math.max(0, Math.floor(b.x));
  const y0 = Math.max(0, Math.floor(b.y));
  const x1 = Math.min(Math.ceil(root.size.x), Math.ceil(b.x + b.w));
  const y1 = Math.min(Math.ceil(root.size.y), Math.ceil(b.y + b.h));
  if (x1 - x0 < 1 || y1 - y0 < 1) return "";
  // …blurred with mirrored edges, as a picture (it may cover a little more than the bounds).
  const scale = w.opts.rasterScale ?? w.opts.scale ?? 1;
  const img = w.opts.backdrop({ svgAt, canvas: { w: root.size.x, h: root.size.y }, region: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, sigma: radius / 2, scale });
  if (!img) return "";
  const white: Paint = { type: "SOLID", color: { r: 1, g: 1, b: 1, a: 1 }, opacity: 1, visible: true, blendMode: "NORMAL" };
  const fillArea = node.fills.some((p) => p.visible && p.opacity > 0.001) ? `<path d="${d}" fill="#fff"${fillRule(node)}/>` : "";
  const strokeArea = node.stroke && node.strokes.some((p) => p.visible) ? renderStrokes(w, { ...node, strokes: [white] }, toRoot) : "";
  if (!fillArea && !strokeArea) return "";
  const m = w.id("bm");
  w.defs.push(`<mask id="${m}" mask-type="alpha" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="-100000" y="-100000" width="200000" height="200000">${fillArea}${strokeArea}</mask>`);
  return `<g mask="url(#${m})"><g${matAttr(invert(toRoot) ?? IDENTITY)}><image href="${img.href}" x="${n(img.x)}" y="${n(img.y)}" width="${n(img.w)}" height="${n(img.h)}" preserveAspectRatio="none"/></g></g>`;
}

function renderFills(w: SvgWriter, node: DesignNode, d: string, toRoot: Mat): string {
  let out = "";
  for (const p of node.fills) {
    const r = w.paint(p, node, d, toRoot);
    if (!r) continue;
    if (r.attr) out += `<path d="${d}" fill="${r.attr}"${fillRule(node)}${r.extra ?? ""}${p.blendMode !== "NORMAL" && p.blendMode !== "PASS_THROUGH" ? ` style="mix-blend-mode:${cssBlend(p.blendMode)}"` : ""}/>`;
    else if (r.extra) out += r.extra;
  }
  return out;
}

function renderStrokes(w: SvgWriter, node: DesignNode, toRoot: Mat): string {
  const s = node.stroke;
  if (!s || !node.strokes.some((p) => p.visible)) return "";
  let out = "";
  // Pre-outlined stroke geometry from Figma: exact caps, joins and alignment.
  if (node.strokeGeometry.length && !isBoxShape(node)) {
    const d = node.strokeGeometry.map((g) => g.d).join("");
    for (const p of node.strokes) {
      const r = w.paint(p, node, d, toRoot);
      if (r?.attr) out += `<path d="${d}" fill="${r.attr}"${r.extra ?? ""}/>`;
    }
    return out;
  }
  // Boxes: emulate alignment by insetting the outline.
  if (s.sides && isBoxShape(node)) return renderSideStrokes(w, node, s, toRoot);
  const wgt = s.weight;
  const off = s.align === "INSIDE" ? wgt / 2 : s.align === "OUTSIDE" ? -wgt / 2 : 0;
  let d: string;
  if (node.kind === "ELLIPSE" && !node.fillGeometry.length) {
    const rx = Math.max(0, node.size.x / 2 - off);
    const ry = Math.max(0, node.size.y / 2 - off);
    const cx = node.size.x / 2;
    const cy = node.size.y / 2;
    d = `M${n(cx + rx)} ${n(cy)}A${n(rx)} ${n(ry)} 0 1 1 ${n(cx - rx)} ${n(cy)}A${n(rx)} ${n(ry)} 0 1 1 ${n(cx + rx)} ${n(cy)}Z`;
  } else if (isBoxShape(node) || node.kind === "ELLIPSE") {
    d = roundedRectPath(off, off, node.size.x - off * 2, node.size.y - off * 2, insetCorners(node.corners, off));
  } else {
    d = shapePath(node);
  }
  const dash = s.dashes?.length ? ` stroke-dasharray="${s.dashes.map(n).join(" ")}"` : "";
  for (const p of node.strokes) {
    const r = w.paint(p, node, d, toRoot);
    if (r?.attr) out += `<path d="${d}" fill="none" stroke="${r.attr}" stroke-width="${n(wgt)}" stroke-linejoin="${s.join.toLowerCase()}"${dash}/>`;
  }
  return out;
}

/** Independent side weights: fill the ring between the outer box and the box inset by each side. */
function renderSideStrokes(w: SvgWriter, node: DesignNode, s: Stroke, toRoot: Mat): string {
  const sd = s.sides!;
  const k = s.align === "INSIDE" ? 1 : s.align === "OUTSIDE" ? 0 : 0.5;
  const outer = { l: -sd.left * (1 - k), t: -sd.top * (1 - k), r: node.size.x + sd.right * (1 - k), b: node.size.y + sd.bottom * (1 - k) };
  const inner = { l: outer.l + sd.left, t: outer.t + sd.top, r: outer.r - sd.right, b: outer.b - sd.bottom };
  const o = roundedRectPath(outer.l, outer.t, outer.r - outer.l, outer.b - outer.t, insetCorners(node.corners, -Math.max(sd.left, sd.top) * (1 - k)));
  const i = roundedRectPath(inner.l, inner.t, Math.max(0, inner.r - inner.l), Math.max(0, inner.b - inner.t), insetCorners(node.corners, Math.max(sd.left, sd.top) * k));
  let out = "";
  for (const p of node.strokes) {
    const r = w.paint(p, node, o, toRoot);
    if (r?.attr) out += `<path d="${o}${i}" fill="${r.attr}" fill-rule="evenodd"/>`;
  }
  return out;
}

function renderText(w: SvgWriter, node: DesignNode, toRoot: Mat): string {
  const t = node.text!;
  if (!t.hasLayout) return renderTextFallback(node);
  let out = "";
  // Group glyphs by run so each run gets its fill.
  const runAt = (ci: number) => t.runs.find((r) => ci >= r.start && ci < r.end) ?? t.runs[t.runs.length - 1];
  const byFill = new Map<string, string[]>();
  for (const g of t.glyphs) {
    if (g.outline < 0) continue;
    const run = runAt(g.char);
    const fill = run?.fills.find((p) => p.visible) ?? node.fills.find((p) => p.visible);
    let key = "rgb(0,0,0)";
    if (fill) {
      const r = w.paint(fill, node, `M0 0H${n(node.size.x)}V${n(node.size.y)}H0Z`, toRoot);
      key = r?.attr || key;
    }
    const tr = g.rotation ? ` rotate(${n((g.rotation * 180) / Math.PI)})` : "";
    const use = `<use href="#${w.useGlyph(g.outline)}" transform="translate(${n(g.x)} ${n(g.y)})${tr} scale(${n(g.fontSize)})"/>`;
    if (!byFill.has(key)) byFill.set(key, []);
    byFill.get(key)!.push(use);
  }
  for (const [fill, uses] of byFill) out += `<g fill="${fill}">${uses.join("")}</g>`;
  // Decorations
  for (const run of t.runs) {
    if (run.decoration === "NONE") continue;
    for (const line of t.lines) {
      if (line.endChar <= run.start || line.firstChar >= run.end) continue;
      const glyphs = t.glyphs.filter((g) => g.char >= Math.max(run.start, line.firstChar) && g.char < Math.min(run.end, line.endChar));
      if (!glyphs.length) continue;
      const x0 = glyphs[0].x;
      const last = glyphs[glyphs.length - 1];
      const x1 = last.x + last.advance;
      const th = Math.max(1, run.fontSize / 14);
      const y = run.decoration === "UNDERLINE" ? line.baseline.y + th * 1.5 : line.baseline.y - run.fontSize * 0.3;
      const fill = run.fills.find((p) => p.visible);
      out += `<rect x="${n(x0)}" y="${n(y)}" width="${n(x1 - x0)}" height="${n(th)}" fill="${fill?.type === "SOLID" ? rgbaCss(fill.color, fill.opacity) : "#000"}"/>`;
    }
  }
  return out;
}

/** No saved layout: approximate with SVG text in the design's font. */
function renderTextFallback(node: DesignNode): string {
  const t = node.text!;
  const run = t.runs[0];
  if (!run) return "";
  const fill = run.fills.find((p) => p.visible);
  const color = fill?.type === "SOLID" ? rgbaCss(fill.color, fill.opacity) : "#000";
  const lh = run.lineHeight ?? run.fontSize * 1.2;
  const anchor = t.alignH === "CENTER" ? "middle" : t.alignH === "RIGHT" ? "end" : "start";
  const x = t.alignH === "CENTER" ? node.size.x / 2 : t.alignH === "RIGHT" ? node.size.x : 0;
  const lines = t.characters.split("\n");
  return `<text font-family="${esc(run.font.family)}" font-size="${n(run.fontSize)}" font-weight="${run.font.weight}" fill="${color}" text-anchor="${anchor}"${run.letterSpacing ? ` letter-spacing="${n(run.letterSpacing)}"` : ""}>${lines
    .map((l, i) => `<tspan x="${n(x)}" y="${n(lh * i + run.fontSize * 0.95)}">${esc(l)}</tspan>`)
    .join("")}</text>`;
}

function cssBlend(b: string): string {
  const map: Record<string, string> = {
    MULTIPLY: "multiply",
    SCREEN: "screen",
    OVERLAY: "overlay",
    DARKEN: "darken",
    LIGHTEN: "lighten",
    COLOR_DODGE: "color-dodge",
    COLOR_BURN: "color-burn",
    HARD_LIGHT: "hard-light",
    SOFT_LIGHT: "soft-light",
    DIFFERENCE: "difference",
    EXCLUSION: "exclusion",
    HUE: "hue",
    SATURATION: "saturation",
    COLOR: "color",
    LUMINOSITY: "luminosity",
    LINEAR_DODGE: "plus-lighter",
    LINEAR_BURN: "color-burn",
  };
  return map[b] ?? "normal";
}

/** `toRoot` maps the node's own space to the root's (for background blurs). */
function renderNode(w: SvgWriter, node: DesignNode, isRoot: boolean, toRoot: Mat): string {
  // Partial documents (see SvgOptions.stopBefore): everything from the cut on is left out.
  if (w.cut) return "";
  if (node === w.opts.stopBefore) {
    w.cut = true;
    return "";
  }
  const out = renderNodeInner(w, node, isRoot, toRoot);
  if (node === w.opts.stopAfter) w.cut = true;
  return out;
}

function renderNodeInner(w: SvgWriter, node: DesignNode, isRoot: boolean, toRoot: Mat): string {
  if (!node.visible || node.kind === "SLICE") return "";
  // Drawing a backdrop: everything from the blurred layer on is left out.
  if (w.stopAt && (w.stopped || node === w.stopAt)) {
    w.stopped = true;
    return "";
  }
  const idAttr = w.opts.ids ? ` data-id="${esc(node.id)}"` : "";
  const d = shapePath(node);

  // The node's own visuals
  let body = "";
  const effects = node.effects.filter((e) => e.visible);
  const drop = effects.filter((e): e is ShadowEffect => e.type === "DROP_SHADOW");
  const inner = effects.filter((e): e is ShadowEffect => e.type === "INNER_SHADOW");
  const layerBlur = effects.find((e): e is BlurEffect => e.type === "LAYER_BLUR");
  const drawSelf = !(isRoot && w.opts.includeRootBackground === false);
  // How far a shadow's pixels are from the coverage they're cast from: offset, spread, and the blur's three sigmas.
  const shadowRegion = (e: ShadowEffect, k: number) => w.region(node, toRoot, Math.max(Math.abs(e.offset.x), Math.abs(e.offset.y)) + Math.abs(e.spread) + 1.5 * e.radius + 1, k);

  if (drawSelf && node.kind !== "GROUP") {
    const hasFill = node.fills.some((p) => p.visible);
    const bgBlur = effects.find((e): e is BlurEffect => e.type === "BACKGROUND_BLUR" && e.radius > 0);
    if (bgBlur && w.root && !w.stopAt) body += backdrop(w, node, d, toRoot, bgBlur.radius);
    // Shadows are cast by the layer's coverage (see coverage()).
    const cov = drop.length || inner.length ? (node.kind === "TEXT" ? renderText(w, node, toRoot) : coverage(w, node, d, toRoot)) : "";
    for (const e of drop) body += `<g filter="url(#${w.shadowFilter(e, shadowRegion(e, 1))})">${cov}</g>`;
    let own = node.kind === "TEXT" ? renderText(w, node, toRoot) : hasFill ? renderFills(w, node, d, toRoot) : "";
    // Each inner shadow blends what's drawn so far toward its colour (see innerShadowFilter()).
    for (const e of inner) own = `<g mask="url(#${w.innerShadowKeep(e, cov, shadowRegion(e, 0.5))})">${own}</g><g filter="url(#${w.innerShadowFilter(e, shadowRegion(e, 0.5))})">${cov}</g>`;
    body += own;
  } else if (drawSelf && node.kind === "GROUP" && drop.length) {
    // Group shadows are cast by the rendered children.
    const kids = node.children.map((c) => renderNode(w, c, false, mul(toRoot, c.transform))).join("");
    for (const e of drop) body += `<g filter="url(#${w.shadowFilter(e, shadowRegion(e, 1))})">${kids}</g>`;
  }

  // Children, with clipping and masks
  let kids = "";
  let pendingMask: { id: string; items: string[] } | null = null;
  for (const c of node.children) {
    if (c.mask && c.visible) {
      if (pendingMask) kids += `<g mask="url(#${pendingMask.id})">${pendingMask.items.join("")}</g>`;
      const id = w.id("mk");
      const content = renderNode(w, { ...c, mask: null }, false, mul(toRoot, c.transform));
      const type = c.mask.type === "LUMINANCE" ? "luminance" : "alpha";
      w.defs.push(`<mask id="${id}" mask-type="${type}" style="mask-type:${type}" maskUnits="userSpaceOnUse" x="-100000" y="-100000" width="200000" height="200000">${content}</mask>`);
      pendingMask = { id, items: [] };
      continue;
    }
    const r = renderNode(w, c, false, mul(toRoot, c.transform));
    if (pendingMask) pendingMask.items.push(r);
    else kids += r;
  }
  if (pendingMask) kids += `<g mask="url(#${pendingMask.id})">${pendingMask.items.join("")}</g>`;
  if (kids && node.clipsContent) {
    const clip = w.id("cp");
    w.defs.push(`<clipPath id="${clip}"><path d="${roundedRectPath(0, 0, node.size.x, node.size.y, node.corners)}"/></clipPath>`);
    kids = `<g clip-path="url(#${clip})">${kids}</g>`;
  }

  // Strokes paint above fills; on frames Figma draws them above the children too.
  const strokes = drawSelf && node.kind !== "GROUP" && node.kind !== "TEXT" ? renderStrokes(w, node, toRoot) : "";
  let content = body + kids + strokes;
  if (!content) return "";
  if (layerBlur && layerBlur.radius > 0) content = `<g filter="url(#${w.blurFilter(layerBlur.radius / 2, w.region(node, toRoot, 1.5 * layerBlur.radius + 1, 0.5))})">${content}</g>`;

  const attrs: string[] = [];
  if (!isRoot) attrs.push(matAttr(node.transform).trim());
  if (node.opacity < 1) attrs.push(`opacity="${n(node.opacity)}"`);
  if (node.blendMode !== "PASS_THROUGH" && node.blendMode !== "NORMAL") attrs.push(`style="mix-blend-mode:${cssBlend(node.blendMode)}"`);
  return `<g${idAttr}${attrs.filter(Boolean).length ? " " + attrs.filter(Boolean).join(" ") : ""}>${content}</g>`;
}

/**
 * Renders one node with an explicit transform into a viewport given in the
 * same (root) space, e.g. to bake a rotated vector into a texture.
 */
export function renderNodeSvg(node: DesignNode, toRoot: Mat, viewport: { x: number; y: number; w: number; h: number }, opts: SvgOptions): string {
  const w = new SvgWriter({ ...opts, includeRootBackground: true }, viewport);
  const body = renderNode(w, node, true, toRoot);
  const s = opts.scale ?? 1;
  const m = toRoot;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${n(viewport.w * s)}" height="${n(viewport.h * s)}" viewBox="${n(viewport.x)} ${n(viewport.y)} ${n(viewport.w)} ${n(viewport.h)}">` +
    `<defs>${w.imageDefs(s)}${w.glyphDefs()}${w.defs.join("")}</defs>` +
    `<g transform="matrix(${n(m.m00)} ${n(m.m10)} ${n(m.m01)} ${n(m.m11)} ${n(m.m02)} ${n(m.m12)})">${body}</g></svg>`
  );
}

/** Renders a root node (at its own origin) to a complete SVG document. */
export function renderSvg(root: DesignNode, opts: SvgOptions): string {
  const w = new SvgWriter(opts, { x: 0, y: 0, w: root.size.x, h: root.size.y });
  w.root = root;
  const body = renderNode(w, root, true, IDENTITY);
  const s = opts.scale ?? 1;
  const W = root.size.x;
  const H = root.size.y;
  const bg = opts.background ? `<rect width="${n(W)}" height="${n(H)}" fill="${opts.background}"/>` : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${n(W * s)}" height="${n(H * s)}" viewBox="0 0 ${n(W)} ${n(H)}">` +
    `<defs>${w.imageDefs(opts.rasterScale ?? s)}${w.glyphDefs()}${w.defs.join("")}</defs>${bg}${body}</svg>`
  );
}
