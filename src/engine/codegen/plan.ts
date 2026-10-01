/**
 * Design tree → draw plan: the ordered drawing operations for a frame, in
 * root-frame coordinates, before any C++ is written. Each operation keeps the
 * layer it came from so the generated code can name and comment it.
 */
import { IDENTITY, isTranslation, mul, transformedBounds } from "../model/math";
import { drawnFills, noOpBlend } from "../model/paint";
import { applyCase } from "../model/text";
import type { DesignNode, Effect, Mat, Paint, Rect, RGBA, TextRun } from "../model/types";
import { isCompositeIcon } from "../semantic/scene";
import { cleanLayerName } from "./cpp";

/** Names Figma gives new layers ("Vector 3", "Group 5", "Слой 3"): they say nothing about what a layer is. */
const DEFAULT_LAYER_NAME = /^(frame|group|rectangle|rect|ellipse|vector|line|polygon|star|union|subtract|intersect|exclude|instance|component|layer|shape|path|image|mask group|слой)(\s+\d+)*$/i;

export type PlanFill =
  | { kind: "solid"; color: RGBA; opacity: number; variable?: string; styleName?: string }
  | { kind: "linear"; from: { x: number; y: number }; to: { x: number; y: number }; stops: { position: number; color: RGBA }[]; opacity: number }
  | { kind: "image"; asset: RasterRequest; opacity: number };

export type PlanStroke = {
  color: RGBA;
  weight: number;
  align: "inside" | "center" | "outside";
  sides?: { top: number; right: number; bottom: number; left: number };
  opacity: number;
  variable?: string;
  styleName?: string;
};

export type PlanShadow = { color: RGBA; offset: { x: number; y: number }; blur: number; spread: number; inner: boolean; showBehind: boolean };

export type PlanBox = {
  fills: PlanFill[];
  radii: [number, number, number, number];
  stroke: PlanStroke | null;
  shadows: PlanShadow[];
  opacity: number;
  backdropBlur: number;
};

/** Something the asset stage must bake into a PNG. */
export type RasterRequest = {
  id: string;
  node: DesignNode;
  /** Absolute transform from the root frame to the node's own space. */
  toRoot: Mat;
  /** Area to render, in root coordinates. */
  rect: Rect;
  /** "mask": a single-color shape baked white, tinted at runtime. "blend": a layer with a blend
   *  mode, baked as its result over what's beneath it (drawn over that, it looks the same). */
  mode: "color" | "mask" | "fill-only" | "blend";
  tint?: RGBA;
  /** For "blend": the tree the layer is in, whose layers before it are what it blends with. */
  backdrop?: DesignNode;
  /** What to name the image after: the layer's name, or for a default one ("Vector 3") its section's. */
  hint?: string;
  reason: string;
};

export type TextSegment = {
  text: string;
  /** Baseline start, root coordinates. */
  x: number;
  y: number;
  run: TextRun;
};

export type Op =
  | { kind: "box"; node: DesignNode; rect: Rect; box: PlanBox; ellipse: boolean }
  | { kind: "text"; node: DesignNode; rect: Rect; segments: TextSegment[]; singleLine: boolean; align: "start" | "center" | "end"; baseline: number; truncate: boolean }
  | { kind: "raster"; node: DesignNode; rect: Rect; raster: RasterRequest }
  | { kind: "clip-begin"; node: DesignNode; rect: Rect }
  | { kind: "clip-end"; node: DesignNode }
  | { kind: "section-begin"; node: DesignNode; rect: Rect }
  | { kind: "section-end"; node: DesignNode };

export type Plan = {
  root: DesignNode;
  size: { x: number; y: number };
  ops: Op[];
  rasters: RasterRequest[];
  warnings: { code: string; message: string; nodeId?: string; nodeName?: string }[];
};

const SHAPE_KINDS = new Set(["VECTOR", "BOOLEAN", "STAR", "POLYGON", "LINE"]);

function visiblePaints(ps: Paint[]): Paint[] {
  return ps.filter((p) => p.visible && p.opacity > 0 && !noOpBlend(p));
}

/** A fill or stroke that mixes with what's beneath it: only a bake over that backdrop reproduces it. */
function paintBlend(n: DesignNode): Paint | undefined {
  return [...visiblePaints(drawnFills(n)), ...(n.stroke ? visiblePaints(n.strokes) : [])].find((p) => p.blendMode !== "NORMAL" && p.blendMode !== "PASS_THROUGH");
}

/**
 * A layer under `n` that mixes with what's beneath `n`: Figma's groups and masks pass blending
 * through, while a layer with a blend mode of its own keeps its insides to itself.
 */
function blendsThrough(n: DesignNode): boolean {
  return n.children.some((c) => {
    if (!c.visible || c.mask) return false;
    if (c.blendMode !== "NORMAL" && c.blendMode !== "PASS_THROUGH") return true;
    return !!paintBlend(c) || (c.blendMode === "PASS_THROUGH" && blendsThrough(c));
  });
}

function effectExtent(effects: Effect[]): number {
  let e = 0;
  for (const fx of effects) {
    if (!fx.visible) continue;
    if (fx.type === "DROP_SHADOW") e = Math.max(e, fx.radius * 1.5 + Math.max(0, fx.spread) + Math.max(Math.abs(fx.offset.x), Math.abs(fx.offset.y)));
    if (fx.type === "LAYER_BLUR") e = Math.max(e, fx.radius * 1.5);
  }
  return e;
}

function strokeExtent(n: DesignNode): number {
  if (!n.stroke || !n.strokes.some((p) => p.visible)) return 0;
  const w = n.stroke.sides ? Math.max(n.stroke.sides.top, n.stroke.sides.right, n.stroke.sides.bottom, n.stroke.sides.left) : n.stroke.weight;
  if (n.stroke.align === "INSIDE") return 0;
  // Miter joins on sharp vector corners can reach well past half the weight.
  return (n.stroke.align === "OUTSIDE" ? w : w / 2) * (SHAPE_KINDS.has(n.kind) ? 2 : 1);
}

/** How far a layer's paint reaches past its bounds, children included (strokes, shadows, blurs). */
function extentOf(n: DesignNode): number {
  let e = Math.max(effectExtent(n.effects), strokeExtent(n));
  for (const c of n.children) if (c.visible) e = Math.max(e, extentOf(c));
  return e;
}

function expand(r: Rect, by: number): Rect {
  return { x: r.x - by, y: r.y - by, w: r.w + by * 2, h: r.h + by * 2 };
}

function hasMaskChild(n: DesignNode): boolean {
  return n.children.some((c) => c.visible && c.mask);
}

function subtreeHas(n: DesignNode, pred: (n: DesignNode) => boolean): boolean {
  if (pred(n)) return true;
  return n.children.some((c) => subtreeHas(c, pred));
}

/** A single-color vector drawn only with solid fills/strokes of one color: bake as a tintable mask. */
function singleColor(n: DesignNode): RGBA | null {
  let color: RGBA | null = null;
  let ok = true;
  const visit = (x: DesignNode) => {
    if (!x.visible || !ok) return;
    if (x.effects.some((e) => e.visible)) ok = false;
    const paints = [...visiblePaints(drawnFills(x)), ...(x.stroke ? visiblePaints(x.strokes) : [])];
    // A lone shape with one paint: its opacity is just that paint's alpha (with a fill and a
    // stroke, or children, layer opacity isn't the same as fading each part, so no).
    const lone = !x.children.length && paints.length === 1;
    if (x.opacity < 0.999 && !lone) ok = false;
    for (const p of paints) {
      if (p.type !== "SOLID") {
        ok = false;
        return;
      }
      const c = { ...p.color, a: p.color.a * p.opacity * (lone ? x.opacity : 1) };
      if (!color) color = c;
      else if (Math.abs(color.r - c.r) > 0.004 || Math.abs(color.g - c.g) > 0.004 || Math.abs(color.b - c.b) > 0.004 || Math.abs(color.a - c.a) > 0.004) ok = false;
    }
    x.children.forEach(visit);
  };
  visit(n);
  return ok ? color : null;
}

/**
 * An image layer recoloured by an inner shadow that covers all of it: the
 * usual Figma way to show a PNG icon in one colour (offset far beyond the
 * layer, so the shifted coverage never reaches it). Figma draws it as the
 * image's shape in the shadow colour, which is a tintable mask.
 */
function silhouetteColor(n: DesignNode): RGBA | null {
  const fx = n.effects.filter((e) => e.visible);
  if (fx.length !== 1 || fx[0].type !== "INNER_SHADOW") return null;
  const e = fx[0];
  const fills = visiblePaints(n.fills);
  if (!fills.length || fills.some((p) => p.type !== "IMAGE") || e.color.a < 0.999) return null;
  if (n.stroke && visiblePaints(n.strokes).length) return null; // a stroke is drawn over the shadow: keep the full bake
  if (n.blendMode !== "NORMAL" && n.blendMode !== "PASS_THROUGH") return null;
  const reach = e.radius * 1.5 + Math.max(0, e.spread); // 3 sigma of Figma's blur
  const clear = Math.abs(e.offset.x) >= n.size.x + reach || Math.abs(e.offset.y) >= n.size.y + reach;
  return clear ? { ...e.color, a: 1 } : null;
}

function solidOrLinear(p: Paint, node: DesignNode): PlanFill | null {
  if (p.type === "SOLID") return { kind: "solid", color: p.color, opacity: p.opacity, variable: p.variableRef, styleName: node.styleNames?.fill };
  if (p.type === "GRADIENT_LINEAR")
    return { kind: "linear", from: p.from, to: p.to, stops: p.stops.slice(0, 8), opacity: p.opacity };
  return null;
}

export type PlanOptions = {
  /** Treat each top-level child frame of the root as a named section function. */
  sections: boolean;
  /** True when an image can't contain transparency (e.g. JPEG); shadows on it are then drawn natively. */
  isOpaqueImage?: (hash: string) => boolean;
  /** Plan only these layers and their subtrees (still in the root's coordinates): a popup or toast inside a frame. */
  only?: DesignNode[];
  /** Layers (by id) left out with their subtrees: popups and toasts planned on their own. */
  skip?: Set<string>;
  /** Prefix for raster request ids, so plans of one project don't collide. */
  prefix?: string;
  /**
   * Layers (by id) a control draws itself (a checkbox's box and tick): a group holding one isn't
   * baked into one picture, so each keeps its own op for the control to take.
   */
  keepApart?: Set<string>;
};

export function planFrame(root: DesignNode, options: PlanOptions = { sections: true }): Plan {
  const ops: Op[] = [];
  const rasters: RasterRequest[] = [];
  const warnings: Plan["warnings"] = [];
  let rasterSeq = 0;

  const raster = (node: DesignNode, toRoot: Mat, reason: string, mode: RasterRequest["mode"] = "color", tint?: RGBA): RasterRequest => {
    const pad = Math.ceil(extentOf(node) + 1);
    const bounds = transformedBounds(toRoot, node.size.x, node.size.y);
    const own = cleanLayerName(node.name);
    const hint = own && !DEFAULT_LAYER_NAME.test(own) ? own : section ? `${section}${node.fills.some((p) => p.visible && p.type === "IMAGE") ? " picture" : ""}` : undefined;
    const req: RasterRequest = { id: `${options.prefix ?? ""}r${++rasterSeq}`, node, toRoot, rect: expand(bounds, pad), mode, tint, hint, reason };
    rasters.push(req);
    return req;
  };
  /** The top-level layer being planned (a screen's section), for naming images in it. */
  let section = "";
  const holdsPart = (n: DesignNode): boolean => !!options.keepApart?.size && n.children.some((c) => options.keepApart!.has(c.id) || holdsPart(c));

  const boxFor = (n: DesignNode, toRoot: Mat): PlanBox | null => {
    // Figma casts shadows from the layer's pixels. With a possibly transparent
    // image fill (a PNG logo tinted by an offset inner shadow, a cut-out with a
    // drop shadow) the shadow follows the image, not the rectangle: bake it.
    const hasShadow = n.effects.some((e) => e.visible && (e.type === "DROP_SHADOW" || e.type === "INNER_SHADOW"));
    if (hasShadow && visiblePaints(n.fills).some((p) => p.type === "IMAGE" && !(options.isOpaqueImage?.(p.hash) ?? false))) return null;
    const fills: PlanFill[] = [];
    for (const p of visiblePaints(n.fills)) {
      const f = solidOrLinear(p, n);
      if (f) fills.push(f);
      else if (p.type === "IMAGE" || p.type.startsWith("GRADIENT_")) {
        // Images and non-linear gradients are baked at the layer's size, then
        // drawn as an image fill so the corners stay rounded natively.
        // Square: the box rounds its corners when it draws it (and a photo baked whole can be a JPEG).
        const square = { tl: 0, tr: 0, br: 0, bl: 0, smoothing: 0 };
        fills.push({ kind: "image", asset: raster({ ...n, effects: [], stroke: null, strokes: [], children: [], fills: [p], corners: square }, toRoot, p.type === "IMAGE" ? "image" : "gradient", "fill-only"), opacity: 1 });
      }
    }
    if (fills.length > 3) warnings.push({ code: "fills-limit", message: "Only the top three fills are drawn.", nodeId: n.id, nodeName: n.name });
    let stroke: PlanStroke | null = null;
    const sp = n.stroke ? visiblePaints(n.strokes) : [];
    if (n.stroke && sp.length) {
      const p = sp[sp.length - 1];
      if (p.type === "SOLID") {
        stroke = {
          color: p.color,
          weight: n.stroke.weight,
          align: n.stroke.align === "INSIDE" ? "inside" : n.stroke.align === "OUTSIDE" ? "outside" : "center",
          sides: n.stroke.sides,
          opacity: p.opacity,
          variable: p.variableRef,
          styleName: n.styleNames?.stroke,
        };
      } else return null; // gradient/image strokes are baked
      if (n.stroke.dashes) return null;
    }
    const shadows: PlanShadow[] = [];
    let backdropBlur = 0;
    for (const e of n.effects) {
      if (!e.visible) continue;
      if (e.type === "DROP_SHADOW" || e.type === "INNER_SHADOW")
        shadows.push({ color: e.color, offset: e.offset, blur: e.radius, spread: e.spread, inner: e.type === "INNER_SHADOW", showBehind: e.showBehindNode });
      else if (e.type === "BACKGROUND_BLUR") backdropBlur = e.radius;
      else if (e.type === "LAYER_BLUR") return null;
    }
    if (shadows.length > 4) warnings.push({ code: "shadows-limit", message: "Only four shadows per layer are drawn.", nodeId: n.id, nodeName: n.name });
    // A clear plate keeps its corners: the looks a control adds on it (hover, press) take its shape.
    if (!fills.length && !stroke && !shadows.length && !backdropBlur) return { fills, radii: [n.corners.tl, n.corners.tr, n.corners.br, n.corners.bl], stroke: null, shadows, opacity: 1, backdropBlur };
    return {
      fills: fills.slice(-3),
      radii: [n.corners.tl, n.corners.tr, n.corners.br, n.corners.bl],
      stroke,
      shadows: shadows.slice(0, 4),
      opacity: 1,
      backdropBlur,
    };
  };

  const textOp = (n: DesignNode, toRoot: Mat, rect: Rect): Op | null => {
    const t = n.text!;
    if (!t.hasLayout) return null;
    const segments: TextSegment[] = [];
    const runAt = (ci: number) => t.runs.find((r) => ci >= r.start && ci < r.end) ?? t.runs[t.runs.length - 1];
    for (const line of t.lines) {
      const lineGlyphs = t.glyphs.filter((g) => g.char >= line.firstChar && g.char < line.endChar);
      let segStart = line.firstChar;
      let segRun = runAt(segStart);
      const flush = (end: number) => {
        // Drop the line's trailing break (\n, or Figma's U+2028 line / U+2029 paragraph separators).
        let text = t.characters.slice(segStart, end);
        while (text.length > 0 && isLineBreak(text.charCodeAt(text.length - 1))) text = text.slice(0, -1);
        if (text.length === 0 || !segRun) return;
        const first = lineGlyphs.find((g) => g.char >= segStart && g.char < end);
        const x = first ? first.x : line.baseline.x;
        const y = first ? first.y : line.baseline.y;
        segments.push({ text: applyCase(text, segRun.textCase), x: rect.x + x, y: rect.y + y, run: segRun });
      };
      for (let ci = line.firstChar + 1; ci <= line.endChar; ci++) {
        const r = ci < line.endChar ? runAt(ci) : null;
        if (ci === line.endChar || r !== segRun) {
          flush(ci);
          segStart = ci;
          segRun = r ?? segRun;
        }
      }
    }
    if (!segments.length) return null;
    void toRoot;
    const singleLine = t.lines.length === 1 && segments.length === 1;
    const align = t.alignH === "CENTER" ? "center" : t.alignH === "RIGHT" ? "end" : "start";
    return {
      kind: "text",
      node: n,
      rect,
      segments,
      singleLine,
      align,
      baseline: t.lines[0] ? t.lines[0].baseline.y : 0,
      truncate: t.truncated || t.autoResize === "TRUNCATE",
    };
  };

  // With `only`, the layers above those subtrees are walked (for coordinates)
  // but not drawn, and the subtrees are drawn in the design's paint order.
  const above = new Set<string>();
  const onlyIds = new Set((options.only ?? []).map((n) => n.id));
  if (options.only) {
    const path = (n: DesignNode): boolean => {
      let hit = onlyIds.has(n.id);
      for (const c of n.children) if (path(c) && !onlyIds.has(n.id)) hit = (above.add(n.id), true);
      return hit;
    };
    path(root);
  }
  let inside = !options.only;

  const visit = (n: DesignNode, parentToRoot: Mat, isRoot: boolean, depth: number) => {
    if (depth === 1) section = cleanLayerName(n.name) && !DEFAULT_LAYER_NAME.test(cleanLayerName(n.name)) ? cleanLayerName(n.name) : "";
    if (!n.visible || n.opacity <= 0 || n.kind === "SLICE" || n.mask) return;
    if (options.skip?.has(n.id)) return;
    const toRoot = isRoot ? IDENTITY : mul(parentToRoot, n.transform);
    if (!inside) {
      if (onlyIds.has(n.id)) {
        inside = true;
        visit(n, parentToRoot, isRoot, depth);
        inside = false;
        return;
      }
      if (!above.has(n.id)) return;
      const kids = n.layout?.reverseZ ? [...n.children].reverse() : n.children;
      for (const c of kids) visit(c, toRoot, false, depth + 1);
      return;
    }
    const rect = transformedBounds(toRoot, n.size.x, n.size.y);
    const axisAligned = isTranslation(toRoot) || (Math.abs(toRoot.m01) < 1e-4 && Math.abs(toRoot.m10) < 1e-4 && toRoot.m00 > 0 && toRoot.m11 > 0);
    const layerBlend = n.blendMode !== "NORMAL" && n.blendMode !== "PASS_THROUGH";
    const ownBlend = layerBlend ? undefined : paintBlend(n);
    const blended = layerBlend || !!ownBlend;
    const layerBlur = n.effects.some((e) => e.visible && e.type === "LAYER_BLUR" && e.radius > 0);

    // Whole subtrees that can't be drawn natively are baked (and stay static).
    if (!isRoot && (!axisAligned || blended || layerBlur || hasMaskChild(n) || (n.opacity < 0.999 && n.children.length > 0 && subtreeHas(n, (c) => c !== n && c.visible && (c.fills.length > 0 || !!c.text))))) {
      // Layers in it that blend with what's beneath it need that backdrop in the bake too.
      const through = !blended && n.blendMode === "PASS_THROUGH" && blendsThrough(n);
      const why = !axisAligned
        ? "rotated"
        : blended
          ? `${(ownBlend?.blendMode ?? n.blendMode).toLowerCase().replace("_", " ")} blend${ownBlend ? " on its paint" : ""}`
          : layerBlur
            ? "layer blur"
            : hasMaskChild(n)
              ? "mask"
              : "group opacity";
      // A blend mode mixes the layer with what's beneath it, so that's baked in too.
      const req = raster(n, toRoot, through ? `${why}, blending with what's beneath` : why, blended || through ? "blend" : "color");
      if (blended || through) {
        // Its bake crops renders of the whole frame: whole pixels, inside the frame.
        req.backdrop = root;
        const x0 = Math.max(0, Math.floor(req.rect.x));
        const y0 = Math.max(0, Math.floor(req.rect.y));
        const x1 = Math.min(Math.ceil(root.size.x), Math.ceil(req.rect.x + req.rect.w));
        const y1 = Math.min(Math.ceil(root.size.y), Math.ceil(req.rect.y + req.rect.h));
        req.rect = { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
      }
      ops.push({ kind: "raster", node: n, rect: blended || through ? req.rect : rect, raster: req });
      return;
    }

    if (SHAPE_KINDS.has(n.kind) || (n.kind === "ELLIPSE" && n.fillGeometry.length > 0 && !isFullEllipse(n))) {
      const tint = singleColor(n);
      ops.push({ kind: "raster", node: n, rect, raster: raster(n, toRoot, tint ? "icon" : "vector", tint ? "mask" : "color", tint ?? undefined) });
      return;
    }

    // An icon drawn as a group of vectors is one image (one tint), as the design treats it.
    if (!isRoot && (n.kind === "GROUP" || n.kind === "FRAME" || n.kind === "INSTANCE" || n.kind === "COMPONENT") && isCompositeIcon(n) && !n.fills.some((p) => p.visible) && !(n.stroke && n.strokes.some((p) => p.visible)) && !blendsThrough(n) && !holdsPart(n)) {
      const tint = singleColor(n);
      ops.push({ kind: "raster", node: n, rect, raster: raster(n, toRoot, tint ? "icon" : "vector", tint ? "mask" : "color", tint ?? undefined) });
      return;
    }

    if (n.kind === "TEXT") {
      const needsRaster = n.effects.some((e) => e.visible) || visiblePaints(n.fills).some((p) => p.type !== "SOLID") || !n.text?.hasLayout;
      const op = needsRaster ? null : textOp(n, toRoot, rect);
      if (op) ops.push(op);
      else ops.push({ kind: "raster", node: n, rect, raster: raster(n, toRoot, "styled text") });
      return;
    }

    const isSection = options.sections && !options.only && depth === 1 && n.children.length > 0 && (n.kind === "FRAME" || n.kind === "GROUP" || n.kind === "INSTANCE" || n.kind === "COMPONENT");
    if (isSection) ops.push({ kind: "section-begin", node: n, rect });

    const tint = n.kind !== "GROUP" ? silhouetteColor(n) : null;
    if (tint) {
      // The image's coverage, baked white and tinted with the shadow colour (exact: see svg.ts).
      const shape: DesignNode = { ...n, children: [], effects: [], stroke: null, strokes: [], fills: visiblePaints(n.fills).map((p) => ({ ...p, opacity: 1 })) };
      ops.push({ kind: "raster", node: shape, rect, raster: raster(shape, toRoot, "icon (image recoloured by an inner shadow)", "mask", tint) });
    } else if (n.kind !== "GROUP") {
      const box = boxFor(n, toRoot);
      if (box === null) ops.push({ kind: "raster", node: { ...n, children: [] }, rect, raster: raster({ ...n, children: [] }, toRoot, "stroke or effect") });
      else if (box.fills.length || box.stroke || box.shadows.length || box.backdropBlur) {
        if (n.opacity < 0.999) box.opacity = n.opacity;
        ops.push({ kind: "box", node: n, rect, box, ellipse: n.kind === "ELLIPSE" });
      }
    }

    const clip = n.clipsContent && n.children.some((c) => c.visible && !rectInside(transformedBounds(mul(toRoot, c.transform), c.size.x, c.size.y), rect));
    if (clip) ops.push({ kind: "clip-begin", node: n, rect });
    const kids = n.layout?.reverseZ ? [...n.children].reverse() : n.children;
    for (const c of kids) visit(c, toRoot, false, depth + 1);
    if (clip) ops.push({ kind: "clip-end", node: n });
    if (isSection) ops.push({ kind: "section-end", node: n });
  };

  visit(root, IDENTITY, true, 0);
  return { root, size: { x: root.size.x, y: root.size.y }, ops, rasters, warnings };
}

/** Line feed, carriage return, and Figma's line (U+2028) and paragraph (U+2029) separators. */
function isLineBreak(c: number): boolean {
  return c === 10 || c === 13 || c === 0x2028 || c === 0x2029;
}

function rectInside(inner: Rect, outer: Rect): boolean {
  return inner.x >= outer.x - 0.5 && inner.y >= outer.y - 0.5 && inner.x + inner.w <= outer.x + outer.w + 0.5 && inner.y + inner.h <= outer.y + outer.h + 0.5;
}

function isFullEllipse(n: DesignNode): boolean {
  // Ellipses whose saved geometry is just the ellipse (no arc/donut) draw natively.
  const d = n.fillGeometry[0]?.d ?? "";
  return n.fillGeometry.length <= 1 && (d.match(/M/g) ?? []).length <= 1 && !/L/.test(d);
}
