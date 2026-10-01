/**
 * Kiwi paint / stroke / effect / corner fields → the normalized model.
 */
import type { NodeChange, Paint as KPaint } from "./kiwi/schema";
import { imageHashToString } from "./kiwi/index";
import type { RawIndex, VariableModes, VariableRefData } from "./raw";
import { apply, invert } from "../model/math";
import type { BlendMode, Corners, Effect, GradientPaint, Mat, Paint, RGBA, Stroke, Vec2 } from "../model/types";

type AnyRec = Record<string, unknown>;

export function rgba(c: { r?: number; g?: number; b?: number; a?: number } | undefined, fallbackAlpha = 1): RGBA {
  return { r: c?.r ?? 0, g: c?.g ?? 0, b: c?.b ?? 0, a: c?.a ?? fallbackAlpha };
}

function mat(m: { m00?: number; m01?: number; m02?: number; m10?: number; m11?: number; m12?: number } | undefined): Mat {
  return { m00: m?.m00 ?? 1, m01: m?.m01 ?? 0, m02: m?.m02 ?? 0, m10: m?.m10 ?? 0, m11: m?.m11 ?? 1, m12: m?.m12 ?? 0 };
}

function blend(b: string | undefined): BlendMode {
  return (b as BlendMode) ?? "NORMAL";
}

/**
 * Figma stores a gradient as a transform from the layer's unit square into
 * gradient space, where the gradient runs from (0, 0.5) to (1, 0.5). The
 * inverse maps the three handles back into the unit square; scaling by the
 * layer size gives pixel handles in the layer's local space.
 */
export function gradientHandles(transform: Mat, size: Vec2): { from: Vec2; to: Vec2; width: Vec2 } {
  const inv = invert(transform) ?? { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0 };
  const px = (p: Vec2) => ({ x: p.x * size.x, y: p.y * size.y });
  return {
    from: px(apply(inv, { x: 0, y: 0.5 })),
    to: px(apply(inv, { x: 1, y: 0.5 })),
    width: px(apply(inv, { x: 0, y: 1 })),
  };
}

const NO_MODES: VariableModes = new Map();

/** A colour bound to a variable, resolved under `modes`; Figma's cached value when it can't be. */
function boundColor(index: RawIndex, data: unknown, cached: RGBA, modes: VariableModes): RGBA {
  const v = index.resolveBound(data as VariableRefData | undefined, modes);
  return v?.colorValue ? rgba(v.colorValue) : cached;
}

function boundFloat(index: RawIndex, data: unknown, cached: number, modes: VariableModes): number {
  const v = index.resolveBound(data as VariableRefData | undefined, modes);
  return typeof v?.floatValue === "number" ? v.floatValue : cached;
}

export function resolvePaints(index: RawIndex, paints: KPaint[] | undefined, size: Vec2, modes: VariableModes = NO_MODES): Paint[] {
  if (!paints?.length) return [];
  const out: Paint[] = [];
  for (const p of paints) {
    const visible = p.visible !== false;
    const opacity = p.opacity ?? 1;
    const blendMode = blend(p.blendMode);
    const ext = p as KPaint & AnyRec;
    switch (p.type) {
      case "SOLID": {
        const colorVar = ext.colorVar as { value?: { alias?: { guid?: { sessionID: number; localID: number }; assetRef?: { key?: string } } } } | undefined;
        const variable = index.variable(colorVar?.value?.alias);
        // The paint's colour is Figma's cache of the variable; the variable (in the active mode) is the truth.
        const color = colorVar ? boundColor(index, colorVar, rgba(p.color), modes) : rgba(p.color);
        out.push({ type: "SOLID", color, opacity, visible, blendMode, variableRef: variable?.name });
        break;
      }
      case "GRADIENT_LINEAR":
      case "GRADIENT_RADIAL":
      case "GRADIENT_ANGULAR":
      case "GRADIENT_DIAMOND": {
        const bound = (ext.stopsVar as Array<{ colorVar?: unknown }> | undefined) ?? [];
        const stops = (p.stops ?? []).map((s, i) => ({ position: s.position ?? 0, color: bound[i]?.colorVar ? boundColor(index, bound[i].colorVar, rgba(s.color), modes) : rgba(s.color) }));
        const handles = gradientHandles(mat(p.transform), size);
        const g: GradientPaint = { type: p.type, stops, ...handles, opacity, visible, blendMode };
        out.push(g);
        break;
      }
      case "IMAGE": {
        const hash = p.image?.hash ? imageHashToString(p.image.hash as Uint8Array) : "";
        if (!hash) break;
        const mode = (p.imageScaleMode ?? "FILL") as "FILL" | "FIT" | "TILE" | "STRETCH";
        const w = ext.originalImageWidth as number | undefined;
        const h = ext.originalImageHeight as number | undefined;
        const filters = p.paintFilter as AnyRec | undefined;
        out.push({
          type: "IMAGE",
          hash,
          scaleMode: mode,
          transform: p.transform ? mat(p.transform) : undefined,
          scale: p.scale,
          rotation: p.rotation,
          opacity,
          visible,
          blendMode,
          imageSize: w && h ? { x: w, y: h } : undefined,
          filters: filters
            ? {
                exposure: filters.exposure as number | undefined,
                contrast: filters.contrast as number | undefined,
                saturation: filters.saturation as number | undefined,
                temperature: filters.temperature as number | undefined,
                tint: filters.tint as number | undefined,
                highlights: filters.highlights as number | undefined,
                shadows: filters.shadows as number | undefined,
              }
            : undefined,
        });
        break;
      }
      default:
        // VIDEO, NOISE, PATTERN, EMOJI… are not representable; callers warn.
        break;
    }
  }
  return out;
}

export function resolveStroke(n: NodeChange, hasStrokes: boolean): Stroke | null {
  const weight = n.strokeWeight ?? 0;
  const independent = n.borderStrokeWeightsIndependent === true;
  // A side the file sets no weight for draws nothing (Figma's own render of a divider set only on its left side).
  const sides = independent
    ? {
        top: n.borderTopHidden ? 0 : (n.borderTopWeight ?? 0),
        right: n.borderRightHidden ? 0 : (n.borderRightWeight ?? 0),
        bottom: n.borderBottomHidden ? 0 : (n.borderBottomWeight ?? 0),
        left: n.borderLeftHidden ? 0 : (n.borderLeftWeight ?? 0),
      }
    : undefined;
  const any = sides ? Math.max(sides.top, sides.right, sides.bottom, sides.left) : weight;
  if (!hasStrokes || any <= 0) return null;
  return {
    weight,
    sides,
    align: (n.strokeAlign ?? "INSIDE") as Stroke["align"],
    cap: (n.strokeCap ?? "NONE") as Stroke["cap"],
    join: (n.strokeJoin ?? "MITER") as Stroke["join"],
    miterLimit: n.miterLimit ?? 4,
    dashes: n.dashPattern?.length ? n.dashPattern : undefined,
  };
}

export function resolveEffects(effects: NodeChange["effects"], index?: RawIndex, modes: VariableModes = NO_MODES): Effect[] {
  if (!effects?.length) return [];
  const out: Effect[] = [];
  for (const e of effects) {
    const visible = e.visible !== false;
    const x = e as typeof e & { colorVar?: unknown; radiusVar?: unknown; spreadVar?: unknown; xVar?: unknown; yVar?: unknown };
    const color = index && x.colorVar ? boundColor(index, x.colorVar, rgba(e.color), modes) : rgba(e.color);
    const num = (data: unknown, cached: number) => (index && data ? boundFloat(index, data, cached, modes) : cached);
    switch (e.type) {
      case "DROP_SHADOW":
      case "INNER_SHADOW":
        out.push({
          type: e.type,
          color,
          offset: { x: num(x.xVar, e.offset?.x ?? 0), y: num(x.yVar, e.offset?.y ?? 0) },
          radius: num(x.radiusVar, e.radius ?? 0),
          spread: num(x.spreadVar, e.spread ?? 0),
          visible,
          blendMode: blend(e.blendMode),
          showBehindNode: e.showShadowBehindNode === true,
        });
        break;
      case "FOREGROUND_BLUR":
        out.push({ type: "LAYER_BLUR", radius: num(x.radiusVar, e.radius ?? 0), visible });
        break;
      case "BACKGROUND_BLUR":
        out.push({ type: "BACKGROUND_BLUR", radius: num(x.radiusVar, e.radius ?? 0), visible });
        break;
      default:
        break;
    }
  }
  return out;
}

export function resolveCorners(n: NodeChange): Corners {
  const smoothing = n.cornerSmoothing ?? 0;
  if (n.rectangleCornerRadiiIndependent) {
    return {
      tl: n.rectangleTopLeftCornerRadius ?? 0,
      tr: n.rectangleTopRightCornerRadius ?? 0,
      br: n.rectangleBottomRightCornerRadius ?? 0,
      bl: n.rectangleBottomLeftCornerRadius ?? 0,
      smoothing,
    };
  }
  const r = n.cornerRadius ?? 0;
  return { tl: r, tr: r, br: r, bl: r, smoothing };
}

/**
 * Scales opposing radii down together when they don't fit, the same
 * proportional rule SVG/CSS use for border-radius overlap.
 */
export function fitCorners(c: Corners, w: number, h: number): Corners {
  const f = Math.min(
    1,
    w / Math.max(1e-6, c.tl + c.tr),
    w / Math.max(1e-6, c.bl + c.br),
    h / Math.max(1e-6, c.tl + c.bl),
    h / Math.max(1e-6, c.tr + c.br),
  );
  return f >= 1 ? c : { tl: c.tl * f, tr: c.tr * f, br: c.br * f, bl: c.bl * f, smoothing: c.smoothing };
}
