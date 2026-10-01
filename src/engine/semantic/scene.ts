/**
 * A flat, geometric view of a frame for recognition: every visible layer with
 * its root-space box, paint order and role, and each piece of content (text,
 * icon, image) attached to the innermost surface it sits on. Recognition works
 * on these "units" instead of the layer hierarchy, because real files rarely
 * group a control's parts (a button is often a rectangle with a text layer
 * simply placed over it).
 */
import { luminance } from "../model/math";
import { noOpBlend } from "../model/paint";
import type { DesignNode, Paint, Reaction, Rect, RGBA } from "../model/types";

export type Role = "surface" | "text" | "icon" | "image" | "line" | "container" | "other";

export type El = {
  node: DesignNode;
  box: Rect;
  /** Global paint order (depth-first), higher = on top. */
  z: number;
  depth: number;
  parent: El | null;
  children: El[];
  role: Role;
  /** Top-most visible solid fill, premultiplied into alpha by layer opacity. */
  fill?: RGBA;
  hasImage: boolean;
  radius: number;
  text?: string;
  /** For text: the box the glyphs actually cover (layer boxes are often taller). */
  ink: Rect;
  /** Content elements attached to this surface (text/icons/images/inner surfaces). */
  contents: El[];
  /** The surface this element sits on, if any. */
  host: El | null;
};

export type Scene = {
  root: El;
  all: El[];
  byId: Map<string, El>;
  size: { x: number; y: number };
};

const ICON_KINDS = new Set(["VECTOR", "BOOLEAN", "STAR", "POLYGON"]);
/** Shapes that are icons on their own but plates when something sits on them (stars are badges, not plates). */
const PLATE_KINDS = new Set(["VECTOR", "BOOLEAN", "POLYGON"]);

const CLICKS = new Set(["ON_CLICK", "ON_PRESS", "MOUSE_UP"]);

/**
 * A layer's prototype clicks. A composite icon is one element to recognition,
 * so a click set on one of its vectors (seen: a search button's magnifier
 * path) counts as the icon's.
 */
export function clickLinks(n: DesignNode): Reaction[] {
  const own = n.reactions.filter((r) => CLICKS.has(r.trigger));
  if (own.length || !n.children.length || !isCompositeIcon(n)) return own;
  const out: Reaction[] = [];
  const visit = (x: DesignNode) => {
    if (!x.visible) return;
    for (const r of x.reactions) if (CLICKS.has(r.trigger)) out.push(r);
    x.children.forEach(visit);
  };
  n.children.forEach(visit);
  return out;
}

function topSolid(paints: Paint[], opacity: number): RGBA | undefined {
  for (let i = paints.length - 1; i >= 0; i--) {
    const p = paints[i];
    if (!p.visible || p.opacity <= 0 || noOpBlend(p)) continue;
    if (p.type === "SOLID") return { ...p.color, a: p.color.a * p.opacity * opacity };
    if (p.type.startsWith("GRADIENT_") && "stops" in p && p.stops.length) {
      const mid = p.stops[Math.floor(p.stops.length / 2)].color;
      return { ...mid, a: mid.a * p.opacity * opacity };
    }
    return undefined;
  }
  return undefined;
}

/** A group/frame whose visible content is only small vectors: one icon. */
export function isCompositeIcon(n: DesignNode): boolean {
  if (n.box.w > 96 || n.box.h > 96 || n.children.length === 0) return false;
  let vectors = 0;
  let ok = true;
  const visit = (x: DesignNode) => {
    if (!x.visible || !ok) return;
    if (x.kind === "TEXT") ok = false;
    else if (ICON_KINDS.has(x.kind) || x.kind === "LINE" || x.kind === "ELLIPSE") vectors++;
    else if (x.kind === "RECTANGLE" && x.fills.some((p) => p.visible && p.type === "IMAGE")) ok = false;
    x.children.forEach(visit);
  };
  n.children.forEach(visit);
  if (!ok || vectors === 0 || n.fills.some((p) => p.visible && p.type === "IMAGE")) return false;
  // A filled plate covering most of the group is a surface with an icon on it
  // (an icon button), not icon art.
  const groupArea = Math.max(1, n.box.w * n.box.h);
  // Polygons count once the group is button-sized (a hexagon plate under a glyph).
  const plateKind = (x: DesignNode) =>
    x.kind === "RECTANGLE" || x.kind === "FRAME" || x.kind === "INSTANCE" || x.kind === "ELLIPSE" || (x.kind === "POLYGON" && Math.min(n.box.w, n.box.h) >= 32);
  const plate = (x: DesignNode): boolean =>
    x.visible && (plateKind(x) && x.fills.some((p) => p.visible && p.opacity > 0) && x.box.w * x.box.h >= groupArea * 0.5 ? true : x.children.some(plate));
  return !n.children.some(plate);
}

function roleOf(n: DesignNode): Role {
  if (n.kind === "TEXT") return "text";
  if (n.kind === "LINE") return "line";
  if (ICON_KINDS.has(n.kind)) return n.box.w <= 96 && n.box.h <= 96 ? "icon" : "other";
  const visibleFills = n.fills.filter((p) => p.visible && p.opacity > 0 && !noOpBlend(p));
  const hasImage = visibleFills.some((p) => p.type === "IMAGE");
  const hasStroke = !!n.stroke && n.strokes.some((p) => p.visible);
  if ((n.kind === "GROUP" || n.kind === "FRAME" || n.kind === "INSTANCE" || n.kind === "COMPONENT") && isCompositeIcon(n) && !visibleFills.length && !hasStroke) return "icon";
  if (hasImage && visibleFills.length === 1 && !hasStroke) return "image";
  if (visibleFills.length || hasStroke || n.effects.some((e) => e.visible && e.type === "BACKGROUND_BLUR")) return "surface";
  if (n.kind === "GROUP" || n.kind === "FRAME" || n.kind === "INSTANCE" || n.kind === "COMPONENT" || n.kind === "COMPONENT_SET" || n.kind === "SECTION") return "container";
  return "other";
}

export function buildScene(root: DesignNode): Scene {
  const all: El[] = [];
  const byId = new Map<string, El>();
  let z = 0;
  const visit = (n: DesignNode, parent: El | null, depth: number, parentOpacity: number): El | null => {
    if (!n.visible || n.opacity <= 0.001) return null;
    const opacity = parentOpacity * n.opacity;
    const el: El = {
      node: n,
      box: n.box,
      z: z++,
      depth,
      parent,
      children: [],
      role: depth === 0 ? "container" : roleOf(n),
      fill: topSolid(n.fills, opacity),
      hasImage: n.fills.some((p) => p.visible && p.type === "IMAGE"),
      radius: Math.max(n.corners.tl, n.corners.tr, n.corners.br, n.corners.bl),
      text: n.text?.characters,
      ink: inkBox(n),
      contents: [],
      host: null,
    };
    all.push(el);
    byId.set(n.id, el);
    // Composite icons are atomic: their vectors belong to them.
    if (el.role !== "icon") for (const c of n.children) {
      const ce = visit(c, el, depth + 1, opacity);
      if (ce) el.children.push(ce);
    }
    return el;
  };
  const rootEl = visit(root, null, 0, 1)!;

  // A filled polygon, star or path with other layers painted on it (a hexagon button plate,
  // a custom-shaped backdrop) is a surface, not an icon.
  for (const e of all) {
    if ((e.role !== "icon" && e.role !== "other") || !e.fill || e.fill.a < 0.05 || !PLATE_KINDS.has(e.node.kind)) continue;
    if (e.role === "icon" && Math.min(e.box.w, e.box.h) < (e.node.kind === "VECTOR" || e.node.kind === "BOOLEAN" ? 32 : 20)) continue;
    const plate = area(e.box);
    if (all.some((o) => o.z > e.z && o.role !== "container" && o !== rootEl && mostlyInside(o.ink, e.box, 0.9) && area(o.ink) < plate * 0.7)) e.role = "surface";
  }

  // Attach every piece of content to the surface it sits on: the last one painted beneath it that
  // contains it. (The smallest would do for nested surfaces, but not for a glow circle of one card
  // reaching under the next card, which covers it.)
  const surfaces = all.filter((e) => e.role === "surface" || e.role === "image");
  for (const e of all) {
    if (e === rootEl || e.role === "container") continue;
    let best: El | null = null;
    for (const s of surfaces) {
      if (s === e || s.z >= e.z) continue;
      if (!mostlyInside(e.ink, s.box, 0.8)) continue;
      if (s.box.w * s.box.h < e.ink.w * e.ink.h * 1.02) continue; // must be bigger than the content
      if (!best || s.z > best.z) best = s;
    }
    if (best) {
      e.host = best;
      best.contents.push(e);
    }
  }
  return { root: rootEl, all, byId, size: { x: root.size.x, y: root.size.y } };
}

/** Glyph coverage of a text layer from Figma's saved line layout. */
function inkBox(n: DesignNode): Rect {
  const t = n.text;
  // An icon's frame is often padded (a 16px "Check" frame around an 11x7 tick): use what it draws.
  if (!t && n.children.length && isCompositeIcon(n)) {
    const boxes: Rect[] = [];
    const visit = (x: DesignNode) => {
      if (!x.visible) return;
      if (!x.children.length) boxes.push(x.box);
      x.children.forEach(visit);
    };
    n.children.forEach(visit);
    if (boxes.length) {
      const ink = unionRect(boxes);
      // What a clipping frame cuts off isn't drawn.
      if (!n.clipsContent) return ink;
      const x = Math.max(ink.x, n.box.x);
      const y = Math.max(ink.y, n.box.y);
      const r = Math.min(ink.x + ink.w, n.box.x + n.box.w);
      const b = Math.min(ink.y + ink.h, n.box.y + n.box.h);
      return r > x && b > y ? { x, y, w: r - x, h: b - y } : n.box;
    }
  }
  if (!t || !t.hasLayout || !t.lines.length) return n.box;
  const size = t.runs[0]?.fontSize ?? 12;
  let x0 = Infinity;
  let x1 = -Infinity;
  for (const g of t.glyphs) {
    x0 = Math.min(x0, g.x);
    x1 = Math.max(x1, g.x + g.advance);
  }
  if (!Number.isFinite(x0)) {
    x0 = t.lines[0].baseline.x;
    x1 = x0 + Math.max(...t.lines.map((l) => l.width));
  }
  const top = t.lines[0].baseline.y - size * 0.78;
  const bottom = t.lines[t.lines.length - 1].baseline.y + size * 0.22;
  return { x: n.box.x + x0, y: n.box.y + top, w: Math.max(1, x1 - x0), h: Math.max(1, bottom - top) };
}

// --- geometry helpers ---------------------------------------------------------

export function area(r: Rect): number {
  return Math.max(0, r.w) * Math.max(0, r.h);
}

export function intersection(a: Rect, b: Rect): number {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const r = Math.min(a.x + a.w, b.x + b.w);
  const bt = Math.min(a.y + a.h, b.y + b.h);
  return r > x && bt > y ? (r - x) * (bt - y) : 0;
}

export function mostlyInside(inner: Rect, outer: Rect, fraction: number): boolean {
  const a = area(inner);
  if (a <= 0) return inner.x >= outer.x - 1 && inner.y >= outer.y - 1 && inner.x + inner.w <= outer.x + outer.w + 1 && inner.y + inner.h <= outer.y + outer.h + 1;
  return intersection(inner, outer) >= a * fraction;
}

export function center(r: Rect): { x: number; y: number } {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

/** Is `inner` centered in `outer` (within `tol` px on each axis)? */
export function centeredIn(inner: Rect, outer: Rect, tolX: number, tolY: number): boolean {
  const a = center(inner);
  const b = center(outer);
  return Math.abs(a.x - b.x) <= tolX && Math.abs(a.y - b.y) <= tolY;
}

export function sameRow(a: Rect, b: Rect, tol = 0.35): boolean {
  const ca = a.y + a.h / 2;
  const cb = b.y + b.h / 2;
  return Math.abs(ca - cb) <= Math.max(a.h, b.h) * tol + 2;
}

export function unionRect(rs: Rect[]): Rect {
  const x = Math.min(...rs.map((r) => r.x));
  const y = Math.min(...rs.map((r) => r.y));
  return { x, y, w: Math.max(...rs.map((r) => r.x + r.w)) - x, h: Math.max(...rs.map((r) => r.y + r.h)) - y };
}

/** Visual weight of a text color on a surface: low values look like placeholders. */
export function contrast(fg: RGBA | undefined, bg: RGBA | undefined): number {
  if (!fg) return 0;
  const lf = luminance(fg) * fg.a + (bg ? luminance(bg) : 0) * (1 - fg.a);
  const lb = bg ? luminance(bg) : 0;
  const hi = Math.max(lf, lb);
  const lo = Math.min(lf, lb);
  return (hi + 0.05) / (lo + 0.05);
}

export function textColor(e: El): RGBA | undefined {
  const run = e.node.text?.runs[0];
  const p = run?.fills.find((x) => x.visible && x.type === "SOLID");
  return p && p.type === "SOLID" ? { ...p.color, a: p.color.a * p.opacity } : e.fill;
}

/** Descendants (including self) in paint order. */
export function subtree(e: El): El[] {
  const out: El[] = [];
  const visit = (x: El) => {
    out.push(x);
    x.children.forEach(visit);
  };
  visit(e);
  return out;
}
