/**
 * State looks the design doesn't draw. A Figma frame usually shows each
 * control once, in one state; the generated widgets still need hovered and
 * pressed looks (and on/off for switches). They're derived from the drawn
 * look the way design systems usually build them: a filled surface lightens
 * on hover and darkens when pressed; an outlined one gains a faint fill of
 * its outline colour; an invisible one (a ghost button, a nav item) shows a
 * faint wash of the text colour.
 */
import { luminance } from "../model/math";
import type { RGBA } from "../model/types";
import type { PlanBox, PlanFill } from "./plan";

const WHITE: RGBA = { r: 1, g: 1, b: 1, a: 1 };
const BLACK: RGBA = { r: 0, g: 0, b: 0, a: 1 };

export function mixRgb(a: RGBA, b: RGBA, t: number): RGBA {
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t, a: a.a };
}

export function withAlpha(c: RGBA, a: number): RGBA {
  return { ...c, a: Math.max(0, Math.min(1, a)) };
}

export function emptyBox(radii: PlanBox["radii"]): PlanBox {
  return { fills: [], radii, stroke: null, shadows: [], opacity: 1, backdropBlur: 0 };
}

function mapColors(b: PlanBox, fn: (c: RGBA) => RGBA): PlanBox {
  const fills: PlanFill[] = b.fills.map((f) => {
    if (f.kind === "solid") return { ...f, color: fn(f.color), variable: undefined, styleName: undefined };
    if (f.kind === "linear") return { ...f, stops: f.stops.map((s) => ({ ...s, color: fn(s.color) })) };
    return f;
  });
  return { ...b, fills };
}

/** How visible the box's fills are (0..1). */
export function fillAlpha(b: PlanBox): number {
  let a = 0;
  for (const f of b.fills) {
    if (f.kind === "solid") a = Math.max(a, f.color.a * f.opacity);
    else if (f.kind === "linear") a = Math.max(a, ...f.stops.map((s) => s.color.a * f.opacity));
    else a = Math.max(a, f.opacity);
  }
  return a * b.opacity;
}

/** The box's main colour: its top solid fill, or the middle of its top gradient. */
export function mainColor(b: PlanBox): RGBA | null {
  for (let i = b.fills.length - 1; i >= 0; i--) {
    const f = b.fills[i];
    if (f.kind === "solid") return withAlpha(f.color, f.color.a * f.opacity);
    if (f.kind === "linear" && f.stops.length) return f.stops[Math.floor(f.stops.length / 2)].color;
  }
  return null;
}

const hasImage = (b: PlanBox) => b.fills.some((f) => f.kind === "image");

/**
 * The hovered (`amount` > 0) or pressed (`amount` < 0) look of a surface.
 * `ink` is the colour of the content on it (label or icon), used to tint
 * invisible surfaces; `dark` says whether the screen behind is dark.
 */
export function stateBox(b: PlanBox, amount: number, ink: RGBA | null, dark: boolean): PlanBox {
  const strength = Math.abs(amount);
  if (fillAlpha(b) >= 0.12 && !hasImage(b)) {
    return mapColors(b, (c) => {
      if (amount < 0) return mixRgb(c, BLACK, 0.1 * strength);
      return luminance(c) < 0.55 ? mixRgb(c, WHITE, 0.1 * strength) : mixRgb(c, BLACK, 0.06 * strength);
    });
  }
  // Images can't be recoloured: lay a wash over them.
  if (hasImage(b)) {
    const wash: PlanFill = { kind: "solid", color: amount > 0 ? withAlpha(WHITE, 0.08 * strength) : withAlpha(BLACK, 0.12 * strength), opacity: 1 };
    return { ...b, fills: [...b.fills, wash].slice(-3) };
  }
  // Outlined or invisible: a faint fill of the outline (or content) colour.
  const tint = b.stroke ? b.stroke.color : ink ?? (dark ? WHITE : BLACK);
  const a = (amount > 0 ? 0.07 : 0.12) * strength;
  const wash: PlanFill = { kind: "solid", color: withAlpha(tint, a), opacity: 1 };
  const out: PlanBox = { ...b, fills: [...b.fills, wash].slice(-3) };
  if (b.stroke && amount > 0) out.stroke = { ...b.stroke, opacity: Math.min(1, b.stroke.opacity * 1.35) };
  return out;
}

export function disabledBox(b: PlanBox): PlanBox {
  return { ...b, opacity: b.opacity * 0.45 };
}

/**
 * The other state of a switch-like surface (track, checkbox square). `on`
 * is the look the design drew. Turning an "on" look off: a neutral track in
 * the screen's tone. Turning an "off" look on: the design's accent colour.
 */
export function flipBox(b: PlanBox, drawnOn: boolean, accent: RGBA, dark: boolean): PlanBox {
  if (drawnOn) {
    const neutral = dark ? withAlpha(WHITE, 0.16) : withAlpha(BLACK, 0.14);
    return { ...b, fills: [{ kind: "solid", color: neutral, opacity: 1 }], stroke: b.stroke ? { ...b.stroke, color: dark ? withAlpha(WHITE, 0.3) : withAlpha(BLACK, 0.25) } : null };
  }
  return { ...b, fills: [{ kind: "solid", color: withAlpha(accent, 1), opacity: 1 }], stroke: null };
}

/** The knob/mark colour that reads on `surface`. */
export function contentOn(surface: RGBA | null, dark: boolean): RGBA {
  if (!surface) return dark ? WHITE : BLACK;
  return luminance(surface) > 0.45 ? { r: 0.06, g: 0.07, b: 0.05, a: 1 } : WHITE;
}

/**
 * The design's accent: the most saturated, reasonably bright colour its
 * controls use (a selected nav item, a primary button), for looks the design
 * never drew (a switch turned on when it only shows it off, a field's focus
 * ring). A design in greys gets plain ink for its tone, so nothing foreign appears.
 */
export function pickAccent(colors: RGBA[], dark: boolean): RGBA {
  const fallback: RGBA = dark ? { r: 0.92, g: 0.92, b: 0.93, a: 1 } : { r: 0.12, g: 0.12, b: 0.12, a: 1 };
  let best: { c: RGBA; score: number } | null = null;
  for (const c of colors) {
    if (c.a < 0.5) continue;
    const max = Math.max(c.r, c.g, c.b);
    const min = Math.min(c.r, c.g, c.b);
    const sat = max === 0 ? 0 : (max - min) / max;
    const score = sat * 0.7 + max * 0.3;
    if (sat > 0.25 && max > 0.35 && (!best || score > best.score)) best = { c, score };
  }
  return best?.c ?? fallback;
}

export function isDark(c: RGBA | null | undefined): boolean {
  return !c || luminance(c) < 0.35;
}
