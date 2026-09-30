/**
 * Fonts for the generated project.
 *
 * Every text style needs a real font file the ImGui atlas can load. Figma saves
 * the outline and advance of every glyph it drew with the text layers, and
 * those are what the design looks like, whichever version of the font Figma
 * had. (A font downloaded today can differ: Google Fonts serves Inter 4, whose
 * advances are up to 0.07 em off Inter 3's.) So for each family/weight/italic
 * the design uses:
 *   1. the glyphs the design draws, rebuilt from Figma's outlines;
 *   2. behind them, the complete font from the provider (Google Fonts on the
 *      server), for characters the design never drew (typed at runtime);
 *   3. behind both, the bundled fallback (Inter).
 * Faces whose text Figma saved no layout for use the provider's font directly.
 *
 * ImGui lays text out without kerning, so each face also carries the kerning
 * Figma applied between the letter pairs the design uses (see ff::KernPair).
 */
import { createHash } from "node:crypto";
import opentype from "opentype.js";
import type { DesignNode } from "../model/types";
import { snake } from "./cpp";

export type FontKey = { family: string; weight: number; italic: boolean };

export type FontProvider = (key: FontKey) => Promise<Uint8Array | null>;

/** A kerning adjustment: [left code point, right code point, em]. */
export type KernPair = [number, number, number];

export type FontFace = {
  key: FontKey;
  /** C++ identifier, e.g. "inter_medium". */
  ident: string;
  label: string;
  /** The font file ImGui loads first. */
  bytes: Uint8Array;
  /**
   * design: the glyphs the design draws, rebuilt from Figma's outlines (`full` merged behind);
   * provider: the provider's font; fallback: neither was available, Inter stands in.
   */
  source: "design" | "provider" | "fallback";
  /** (hhea ascender - descender) / unitsPerEm, see runtime/ff/text.h. */
  emScale: number;
  /** Glyphs rebuilt from the design, when source is "design". */
  glyphCount: number;
  /** The provider's complete font, merged behind the design's glyphs. */
  full?: { bytes: Uint8Array; emScale: number };
  /** Kerning Figma applied, relative to `bytes`' advances; sorted by left, right. */
  kerning: KernPair[];
};

export function fontKeyString(k: FontKey): string {
  return `${k.family}|${k.weight}|${k.italic ? "i" : "n"}`;
}

const WEIGHT_NAMES: Record<number, string> = {
  100: "thin",
  200: "extralight",
  300: "light",
  400: "regular",
  500: "medium",
  600: "semibold",
  700: "bold",
  800: "extrabold",
  900: "black",
};

export function fontIdent(k: FontKey): string {
  return snake(`${k.family} ${WEIGHT_NAMES[k.weight] ?? k.weight}${k.italic ? " italic" : ""}`, "font");
}

/** Reads (hhea ascender - descender) / head.unitsPerEm, like the runtime does. */
export function emScale(bytes: Uint8Array): number {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 12) return 1;
  const tables = dv.getUint16(4);
  let upem = 0;
  let asc = 0;
  let desc = 0;
  for (let i = 0; i < tables; i++) {
    const rec = 12 + i * 16;
    if (rec + 16 > bytes.length) break;
    const tag = String.fromCharCode(bytes[rec], bytes[rec + 1], bytes[rec + 2], bytes[rec + 3]);
    const off = dv.getUint32(rec + 8);
    if (tag === "head" && off + 20 <= bytes.length) upem = dv.getUint16(off + 18);
    if (tag === "hhea" && off + 8 <= bytes.length) {
      asc = dv.getInt16(off + 4);
      desc = dv.getInt16(off + 6);
    }
  }
  return upem > 0 && asc - desc > 0 ? (asc - desc) / upem : 1;
}

/** Collected per font: every glyph Figma drew for it, by codepoint (em-space path, null = blank). */
type OutlineSet = {
  key: FontKey;
  glyphs: Map<number, { path: string | null; advanceEm: number }>;
  /**
   * How far Figma moved the pen from one glyph to the next, in em without
   * letter spacing, for each adjacent pair ("left,right" code points):
   * the left glyph's advance plus the pair's kerning.
   */
  steps: Map<string, number[]>;
  /** Characters drawn in more than one form (OpenType features, alternates): the first form is kept. */
  alternates: Set<number>;
  /** (ascender - descender) / unitsPerEm of the font file Figma used, when the file says. */
  lineHeightEm?: number;
  /** The font's ascender in em, as each line of its text implies (with lineHeightEm). */
  ascents: number[];
  /** Without lineHeightEm: the tallest line box's parts above and below the baseline, in em. */
  ascentEm: number;
  descentEm: number;
};

/** A built frame's text: its tree and the glyph table its outline indexes point into. */
export type TextSource = { root: DesignNode; glyphs: string[] };

/** Walks text layers and gathers the glyph outlines each font drew, across frames. */
export function collectOutlines(sources: TextSource[]): Map<string, OutlineSet> {
  const sets = new Map<string, OutlineSet>();
  for (const { root, glyphs: glyphPaths } of sources) collectFrom(root, glyphPaths, sets);
  return sets;
}

function collectFrom(root: DesignNode, glyphPaths: string[], sets: Map<string, OutlineSet>) {
  const visit = (n: DesignNode) => {
    if (n.text && n.text.hasLayout) {
      const t = n.text;
      const runAt = (ci: number) => t.runs.find((r) => ci >= r.start && ci < r.end) ?? t.runs[0];
      const lineAt = (ci: number) => t.lines.findIndex((l) => ci >= l.firstChar && ci < l.endChar);
      // Glyph `char` indexes are UTF-16 offsets into `characters`, glyphs in text order.
      // A glyph is a single character's unless it's a ligature (it covers several).
      const single = (gi: number, cp: number) => {
        const nextChar = gi + 1 < t.glyphs.length ? t.glyphs[gi + 1].char : t.characters.length;
        return nextChar - t.glyphs[gi].char <= (cp > 0xffff ? 2 : 1);
      };
      for (let gi = 0; gi < t.glyphs.length; gi++) {
        const g = t.glyphs[gi];
        const run = runAt(g.char);
        if (!run) continue;
        const key: FontKey = { family: run.font.family, weight: run.font.weight, italic: run.font.italic };
        const ks = fontKeyString(key);
        let set = sets.get(ks);
        if (!set) sets.set(ks, (set = { key, glyphs: new Map(), steps: new Map(), alternates: new Set(), ascents: [], ascentEm: 0, descentEm: 0 }));
        const cp = t.characters.codePointAt(g.char);
        if (cp === undefined || g.fontSize <= 0) continue;
        if (!single(gi, cp) && g.outline >= 0) continue;
        const path = g.outline >= 0 ? (glyphPaths[g.outline] ?? null) : null;
        const known = set.glyphs.get(cp);
        if (!known) set.glyphs.set(cp, { path, advanceEm: g.advance / g.fontSize });
        else if (known.path !== path || Math.abs(known.advanceEm - g.advance / g.fontSize) > 1e-4) set.alternates.add(cp);

        // The step to the next glyph, when both are plain single characters of
        // this run on the same line, left to right.
        const h = t.glyphs[gi + 1];
        const cp2 = h ? t.characters.codePointAt(h.char) : undefined;
        if (!h || cp2 === undefined || runAt(h.char) !== run || h.fontSize !== g.fontSize || h.x <= g.x) continue;
        if (!single(gi, cp) || !single(gi + 1, cp2) || lineAt(g.char) !== lineAt(h.char) || isBreak(cp) || isBreak(cp2)) continue;
        const pair = `${cp},${cp2}`;
        const step = (h.x - g.x - run.letterSpacing) / g.fontSize;
        const steps = set.steps.get(pair);
        if (steps) steps.push(step);
        else set.steps.set(pair, [step]);
      }
      for (const line of t.lines) {
        const run = runAt(line.firstChar);
        if (!run || run.fontSize <= 0) continue;
        const set = sets.get(fontKeyString({ family: run.font.family, weight: run.font.weight, italic: run.font.italic }));
        if (!set) continue;
        const L = run.font.lineHeightEm;
        if (L) {
          // Figma centres the font's own line box (L em) in the line: whatever
          // the line height, the half-leading above the ascender is (height - L size) / 2.
          set.lineHeightEm ??= L;
          set.ascents.push((line.ascent - (line.height - L * run.fontSize) / 2) / run.fontSize);
        }
        if (line.ascent > 0) set.ascentEm = Math.max(set.ascentEm, line.ascent / run.fontSize);
        if (line.height > line.ascent) set.descentEm = Math.max(set.descentEm, (line.height - line.ascent) / run.fontSize);
      }
    }
    n.children.forEach(visit);
  };
  visit(root);
}

/** Parses our own em-space path data (M/L/Q/C/Z, y down) into opentype commands in font units (y up). */
function pathFromEm(d: string, upm: number): opentype.Path {
  const p = new opentype.Path();
  const tokens = d.match(/[MLQCZ]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  let i = 0;
  const num = () => Number(tokens[i++]);
  const X = (v: number) => Math.round(v * upm);
  const Y = (v: number) => Math.round(-v * upm);
  while (i < tokens.length) {
    const c = tokens[i++];
    switch (c) {
      case "M": {
        const x = num(), y = num();
        p.moveTo(X(x), Y(y));
        break;
      }
      case "L": {
        const x = num(), y = num();
        p.lineTo(X(x), Y(y));
        break;
      }
      case "Q": {
        const x1 = num(), y1 = num(), x = num(), y = num();
        p.quadraticCurveTo(X(x1), Y(y1), X(x), Y(y));
        break;
      }
      case "C": {
        const x1 = num(), y1 = num(), x2 = num(), y2 = num(), x = num(), y = num();
        p.curveTo(X(x1), Y(y1), X(x2), Y(y2), X(x), Y(y));
        break;
      }
      case "Z":
        p.close();
        break;
      default:
        break;
    }
  }
  return p;
}

/** \n, \r and Figma's U+2028 line / U+2029 paragraph separators. */
function isBreak(cp: number): boolean {
  return cp === 0x0a || cp === 0x0d || cp === 0x2028 || cp === 0x2029;
}

/** Characters that draw nothing: a glyph Figma saved without an outline is only blank for these. */
function isBlank(cp: number): boolean {
  return /\s/u.test(String.fromCodePoint(cp)) || (cp >= 0x200b && cp <= 0x200d) || cp === 0x2060 || cp === 0xfeff;
}

/**
 * The glyphs of a set the rebuilt font can hold: outlines, and blanks for
 * whitespace. (A non-space glyph Figma saved without an outline, such as a
 * colour emoji, is left to the fonts behind it.)
 */
function drawable(set: OutlineSet): Array<[number, { path: string | null; advanceEm: number }]> {
  return [...set.glyphs.entries()].filter(([cp, g]) => g.path !== null || isBlank(cp)).sort((a, b) => a[0] - b[0]);
}

/** Units per em of rebuilt fonts: advances round to 1/2048 em (0.008 px at 16 px). */
const DESIGN_UPM = 2048;

/** Builds an OpenType (CFF) font from the glyphs Figma saved for one face. */
export function buildOutlineFont(set: OutlineSet): Uint8Array {
  const upm = DESIGN_UPM;
  // The original font's vertical metrics when the file has them (ImGui's caret
  // and selection use them); else the line boxes' extent.
  const ascents = [...set.ascents].sort((a, b) => a - b);
  const asc = set.lineHeightEm && ascents.length ? ascents[ascents.length >> 1] : set.ascentEm || 0.9;
  const desc = set.lineHeightEm && ascents.length ? set.lineHeightEm - asc : set.descentEm || 0.25;
  const ascender = Math.round(asc * upm);
  const descender = -Math.round(Math.max(0, desc) * upm);
  const glyphs: opentype.Glyph[] = [new opentype.Glyph({ name: ".notdef", unicode: 0, advanceWidth: Math.round(upm * 0.5), path: new opentype.Path() })];
  for (const [cp, g] of drawable(set)) {
    const path = g.path ? pathFromEm(g.path, upm) : new opentype.Path();
    glyphs.push(
      new opentype.Glyph({
        name: cp === 0x20 ? "space" : `uni${cp.toString(16).toUpperCase().padStart(4, "0")}`,
        unicode: cp,
        advanceWidth: Math.max(0, Math.round(g.advanceEm * upm)),
        path,
      }),
    );
  }
  // A neutral name: this is a subset of someone's font, not the font itself.
  const font = new opentype.Font({
    familyName: "Design glyphs",
    styleName: `${WEIGHT_NAMES[set.key.weight] ?? set.key.weight}${set.key.italic ? " italic" : ""}`,
    unitsPerEm: upm,
    ascender,
    descender,
    glyphs,
  });
  return new Uint8Array(font.toArrayBuffer());
}

/** Font files parsed before, by content: Inter and a family's download come back project after project. */
const parsed = new Map<string, opentype.Font | null>();
const PARSED_KEPT = 16;

/** `keep`: the file is likely to come back (not one built for this design), so it's kept parsed. */
function parseFont(bytes: Uint8Array, keep = false): opentype.Font | null {
  const key = keep ? createHash("sha1").update(bytes).digest("base64") : null;
  if (key && parsed.has(key)) return parsed.get(key)!;
  let font: opentype.Font | null = null;
  try {
    font = opentype.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  } catch {
    font = null;
  }
  if (key) {
    parsed.set(key, font);
    if (parsed.size > PARSED_KEPT) parsed.delete(parsed.keys().next().value!);
  }
  return font;
}

/**
 * The advance ImGui will use for a character, in em: from the first of the
 * face's merged fonts that has it (as ImGui picks them), or null.
 */
function advanceSource(fonts: Array<opentype.Font | null>): (cp: number) => number | null {
  const cache = new Map<number, number | null>();
  return (cp) => {
    const known = cache.get(cp);
    if (known !== undefined) return known;
    let adv: number | null = null;
    for (const font of fonts) {
      if (!font) continue;
      const index = font.charToGlyphIndex(String.fromCodePoint(cp));
      if (index > 0) {
        adv = (font.glyphs.get(index).advanceWidth ?? 0) / font.unitsPerEm;
        break;
      }
    }
    cache.set(cp, adv);
    return adv;
  };
}

/** Kerning below this (0.016 px at 16 px) is Figma's rounding, not the font's. */
const KERN_EPSILON = 0.001;

/**
 * The kerning that reproduces Figma's pen steps on top of the advances the
 * runtime will use: step - advance(left), for every pair the design draws.
 * Against the rebuilt glyphs this is exactly the font's kerning; against
 * another version of the font it also absorbs the advance differences.
 */
function kerningTable(set: OutlineSet | undefined, advance: (cp: number) => number | null): KernPair[] {
  if (!set) return [];
  const out: KernPair[] = [];
  for (const [pair, steps] of set.steps) {
    const [left, right] = pair.split(",").map(Number);
    const adv = advance(left);
    if (adv === null) continue;
    const sorted = [...steps].sort((a, b) => a - b);
    const kern = sorted[sorted.length >> 1] - adv;
    if (Math.abs(kern) >= KERN_EPSILON) out.push([left, right, Math.round(kern * 1e5) / 1e5]);
  }
  return out.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

export type FallbackFonts = Record<number, Uint8Array>; // by weight

function nearestFallback(fallback: FallbackFonts, weight: number): { weight: number; bytes: Uint8Array } {
  const weights = Object.keys(fallback).map(Number).sort((a, b) => Math.abs(a - weight) - Math.abs(b - weight));
  const w = weights[0];
  return { weight: w, bytes: fallback[w] };
}

/**
 * Resolves every face the design uses to its font files and kerning.
 * `keys` are the faces text layers use; glyph outlines come from the design.
 */
export async function resolveFonts(
  keys: FontKey[],
  sources: TextSource[],
  provider: FontProvider | null,
  fallback: FallbackFonts,
  warn: (message: string) => void,
): Promise<FontFace[]> {
  const outlines = collectOutlines(sources);
  const fallbackFont = parseFont(fallback[400] ?? nearestFallback(fallback, 400).bytes, true);
  const faces: FontFace[] = [];
  const seen = new Set<string>();
  for (const key of keys) {
    const ks = fontKeyString(key);
    if (seen.has(ks)) continue;
    seen.add(ks);
    const label = `${key.family} ${WEIGHT_NAMES[key.weight] ?? key.weight}${key.italic ? " Italic" : ""}`;
    let provided: Uint8Array | null = null;
    try {
      provided = provider ? await provider(key) : null;
    } catch {
      provided = null;
    }
    const set = outlines.get(ks);
    const glyphCount = set ? drawable(set).length : 0;
    let face: Omit<FontFace, "kerning">;
    if (set && glyphCount > 0) {
      const bytes = buildOutlineFont(set);
      face = { key, ident: fontIdent(key), label, bytes, source: "design", emScale: emScale(bytes), glyphCount, full: provided ? { bytes: provided, emScale: emScale(provided) } : undefined };
      if (!provided) warn(`${label} isn't a downloadable font: the ${glyphCount} characters the design uses are drawn from the outlines saved in the file, and other characters use Inter.`);
    } else if (provided) {
      face = { key, ident: fontIdent(key), label, bytes: provided, source: "provider", emScale: emScale(provided), glyphCount: 0 };
    } else {
      const fb = nearestFallback(fallback, key.weight);
      face = { key, ident: fontIdent(key), label, bytes: fb.bytes, source: "fallback", emScale: emScale(fb.bytes), glyphCount: 0 };
      warn(`${label} isn't available and the file saved no outlines for it; Inter ${fb.weight} is used instead.`);
    }
    if (set && set.alternates.size && face.source === "design")
      warn(`${label} draws ${set.alternates.size} character${set.alternates.size === 1 ? "" : "s"} in more than one form (OpenType features or alternates, e.g. "${String.fromCodePoint([...set.alternates][0])}"); ImGui draws one form of each, the first the design uses.`);
    const advance = advanceSource([parseFont(face.bytes, face.source !== "design"), face.full ? parseFont(face.full.bytes, true) : null, fallbackFont]);
    faces.push({ ...face, kerning: kerningTable(set, advance) });
  }
  return faces;
}
