import type { Mat, Rect, RGBA, Vec2 } from "./types";

export const IDENTITY: Mat = { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0 };

export function mul(a: Mat, b: Mat): Mat {
  return {
    m00: a.m00 * b.m00 + a.m01 * b.m10,
    m01: a.m00 * b.m01 + a.m01 * b.m11,
    m02: a.m00 * b.m02 + a.m01 * b.m12 + a.m02,
    m10: a.m10 * b.m00 + a.m11 * b.m10,
    m11: a.m10 * b.m01 + a.m11 * b.m11,
    m12: a.m10 * b.m02 + a.m11 * b.m12 + a.m12,
  };
}

export function invert(m: Mat): Mat | null {
  const det = m.m00 * m.m11 - m.m01 * m.m10;
  if (Math.abs(det) < 1e-12) return null;
  const inv = 1 / det;
  return {
    m00: m.m11 * inv,
    m01: -m.m01 * inv,
    m02: (m.m01 * m.m12 - m.m11 * m.m02) * inv,
    m10: -m.m10 * inv,
    m11: m.m00 * inv,
    m12: (m.m10 * m.m02 - m.m00 * m.m12) * inv,
  };
}

export function apply(m: Mat, p: Vec2): Vec2 {
  return { x: m.m00 * p.x + m.m01 * p.y + m.m02, y: m.m10 * p.x + m.m11 * p.y + m.m12 };
}

export function translate(x: number, y: number): Mat {
  return { m00: 1, m01: 0, m02: x, m10: 0, m11: 1, m12: y };
}

export function scale(sx: number, sy: number): Mat {
  return { m00: sx, m01: 0, m02: 0, m10: 0, m11: sy, m12: 0 };
}

/** True when the matrix only translates (no rotation, skew, scale or flip). */
export function isTranslation(m: Mat, eps = 1e-4): boolean {
  return Math.abs(m.m00 - 1) < eps && Math.abs(m.m11 - 1) < eps && Math.abs(m.m01) < eps && Math.abs(m.m10) < eps;
}

/** Rotation in degrees, clockwise in screen space (y down), as Figma displays it negated. */
export function rotationDeg(m: Mat): number {
  return (Math.atan2(m.m10, m.m00) * 180) / Math.PI;
}

/** Axis-aligned bounds of a w×h box after transforming it. */
export function transformedBounds(m: Mat, w: number, h: number): Rect {
  const pts = [apply(m, { x: 0, y: 0 }), apply(m, { x: w, y: 0 }), apply(m, { x: w, y: h }), apply(m, { x: 0, y: h })];
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

export function rectUnion(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

export function rectIntersect(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const r = Math.min(a.x + a.w, b.x + b.w);
  const bot = Math.min(a.y + a.h, b.y + b.h);
  return r > x && bot > y ? { x, y, w: r - x, h: bot - y } : null;
}

export function rectContains(outer: Rect, inner: Rect, eps = 0.5): boolean {
  return inner.x >= outer.x - eps && inner.y >= outer.y - eps && inner.x + inner.w <= outer.x + outer.w + eps && inner.y + inner.h <= outer.y + outer.h + eps;
}

export function rectArea(r: Rect): number {
  return Math.max(0, r.w) * Math.max(0, r.h);
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function round(v: number, digits = 3): number {
  const k = 10 ** digits;
  return Math.round(v * k) / k;
}

export function colorEq(a: RGBA, b: RGBA, eps = 1 / 512): boolean {
  return Math.abs(a.r - b.r) < eps && Math.abs(a.g - b.g) < eps && Math.abs(a.b - b.b) < eps && Math.abs(a.a - b.a) < eps;
}

/** "#rrggbb" or "#rrggbbaa" (alpha omitted when opaque). */
export function colorHex(c: RGBA, withAlpha = true): string {
  const h = (v: number) =>
    Math.round(clamp(v, 0, 1) * 255)
      .toString(16)
      .padStart(2, "0");
  const base = `#${h(c.r)}${h(c.g)}${h(c.b)}`;
  return withAlpha && c.a < 0.999 ? base + h(c.a) : base;
}

/** WCAG relative luminance of an sRGB color. */
export function luminance(c: RGBA): number {
  const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
}

/** Composite `top` over `bottom` (straight alpha). */
export function over(top: RGBA, bottom: RGBA): RGBA {
  const a = top.a + bottom.a * (1 - top.a);
  if (a <= 0) return { r: 0, g: 0, b: 0, a: 0 };
  return {
    r: (top.r * top.a + bottom.r * bottom.a * (1 - top.a)) / a,
    g: (top.g * top.a + bottom.g * bottom.a * (1 - top.a)) / a,
    b: (top.b * top.a + bottom.b * bottom.a * (1 - top.a)) / a,
    a,
  };
}
