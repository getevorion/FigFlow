/**
 * TEXT nodes → TextData: character runs from the style override table, and
 * Figma's own computed layout (lines, glyph positions, outlines) from
 * derivedTextData, so generated code can place text exactly where Figma did.
 */
import type { NodeChange } from "./kiwi/schema";
import type { RawIndex, VariableModes } from "./raw";
import type { GlyphTable } from "./geometry";
import { resolvePaints } from "./style";
import type { FontRef, Glyph, Paint, TextData, TextLine, TextRun } from "../model/types";

type AnyRec = Record<string, unknown>;

const WEIGHTS: Array<[RegExp, number]> = [
  [/thin|hairline/i, 100],
  [/extra\s*light|ultra\s*light/i, 200],
  [/light/i, 300],
  [/medium/i, 500],
  [/semi\s*bold|demi\s*bold/i, 600],
  [/extra\s*bold|ultra\s*bold/i, 800],
  [/black|heavy/i, 900],
  [/bold/i, 700],
  [/regular|normal|book|roman/i, 400],
];

export function weightFromStyle(style: string): number {
  for (const [re, w] of WEIGHTS) if (re.test(style)) return w;
  return 400;
}

export function fontRef(fontName: { family?: string; style?: string; postscript?: string } | undefined, weightHint?: number): FontRef {
  const family = fontName?.family ?? "Inter";
  const style = fontName?.style ?? "Regular";
  return {
    family,
    style,
    postscript: fontName?.postscript ?? "",
    weight: weightHint ?? weightFromStyle(style),
    italic: /italic|oblique/i.test(style),
  };
}

function numberPx(v: { value?: number; units?: string } | undefined, fontSize: number): number {
  if (!v || v.value === undefined) return 0;
  if (v.units === "PERCENT") return (v.value / 100) * fontSize;
  return v.value;
}

function lineHeightPx(v: { value?: number; units?: string } | undefined, fontSize: number): number | null {
  if (!v || v.value === undefined) return null;
  if (v.units === "PIXELS") return v.value;
  // Percent line heights of exactly 100 are Figma's "Auto" (the font's own metrics).
  if (v.units === "PERCENT") return v.value === 100 ? null : (v.value / 100) * fontSize;
  if (v.units === "RAW") return v.value * fontSize;
  return null;
}

type StyleLike = Partial<NodeChange> & AnyRec;

/** derivedTextData.fontMetaData: the font files Figma used for a text layer. */
type FontMeta = Array<{ key?: { family?: string; style?: string }; fontWeight?: number; fontLineHeight?: number }>;

/** What a text style sets on the text using it (fills come from fill styles). */
const TEXT_STYLE_PROPS = ["fontName", "fontSize", "lineHeight", "letterSpacing", "textCase", "textDecoration", "paragraphSpacing", "paragraphIndent", "fontVariations"];

/**
 * Text properties with their text style applied. Figma lays text out from the
 * style; a layer's own copies of the style's values can be stale (seen: a
 * layer saying Roboto Mono 16 whose style and saved glyphs are Inter). When
 * the saved layout names its fonts and the style's isn't among them, the
 * layer's own values are the ones Figma used, and they stay.
 */
function withTextStyle(index: RawIndex, props: StyleLike, fontMeta: FontMeta): StyleLike {
  const style = index.style(props.styleIdForText as never)?.node as StyleLike | undefined;
  if (!style) return props;
  const font = style.fontName as { family?: string; style?: string } | undefined;
  if (fontMeta.length && font && !fontMeta.some((m) => m.key?.family === font.family && m.key?.style === font.style)) return props;
  const out: StyleLike = { ...props };
  for (const k of TEXT_STYLE_PROPS) if (style[k] !== undefined) out[k] = style[k];
  return out;
}

function runStyle(index: RawIndex, base: StyleLike, over: StyleLike | undefined, size: { x: number; y: number }, weightHint: number | undefined, modes: VariableModes, fontMeta: FontMeta) {
  const s = { ...base, ...(over ?? {}) } as StyleLike;
  const fontSize = (s.fontSize as number) ?? 12;
  const font = fontRef(s.fontName as never, over?.fontName ? undefined : weightHint);
  const lineHeightEm = fontMeta.find((m) => m.key?.family === font.family && m.key?.style === font.style)?.fontLineHeight;
  if (lineHeightEm && lineHeightEm > 0) font.lineHeightEm = lineHeightEm;
  return {
    font,
    fontSize,
    letterSpacing: numberPx(s.letterSpacing as never, fontSize),
    lineHeight: lineHeightPx(s.lineHeight as never, fontSize),
    fills: resolvePaints(index, (s.fillPaints as never) ?? [], size, modes) as Paint[],
    decoration: ((s.textDecoration as string) ?? "NONE") as TextRun["decoration"],
    textCase: ((s.textCase as string) ?? "ORIGINAL") as TextRun["textCase"],
    hyperlink: (s.hyperlink as { url?: string } | undefined)?.url,
  };
}

export function resolveText(index: RawIndex, n: NodeChange, glyphTable: GlyphTable, modes: VariableModes = new Map()): TextData {
  const td = (n.textData ?? {}) as AnyRec;
  const characters = (td.characters as string) ?? "";
  const size = { x: n.size?.x ?? 0, y: n.size?.y ?? 0 };
  const derived = n.derivedTextData as AnyRec | undefined;
  const fontMeta = (derived?.fontMetaData as FontMeta | undefined) ?? [];
  const base = withTextStyle(index, n as StyleLike, fontMeta);
  const baseFont = base.fontName as { family?: string; style?: string } | undefined;
  const baseWeight = fontMeta.find((m) => m.key?.family === baseFont?.family && m.key?.style === baseFont?.style)?.fontWeight;

  // Runs: characterStyleIDs[i] selects an entry of styleOverrideTable (0 = the node's own style).
  const ids = (td.characterStyleIDs as number[] | undefined) ?? [];
  const table = new Map<number, StyleLike>();
  for (const o of (td.styleOverrideTable as StyleLike[] | undefined) ?? []) {
    if (typeof o.styleID === "number") table.set(o.styleID, withTextStyle(index, o, fontMeta));
  }
  const runs: TextRun[] = [];
  let start = 0;
  const idAt = (i: number) => (i < ids.length ? ids[i] : 0);
  for (let i = 1; i <= characters.length; i++) {
    if (i === characters.length || idAt(i) !== idAt(start)) {
      const over = idAt(start) ? table.get(idAt(start)) : undefined;
      runs.push({ start, end: i, ...runStyle(index, base, over, size, over ? undefined : baseWeight, modes, fontMeta) });
      start = i;
    }
  }
  if (!runs.length) runs.push({ start: 0, end: 0, ...runStyle(index, base, undefined, size, baseWeight, modes, fontMeta) });

  // Figma's layout.
  const lines: TextLine[] = [];
  for (const b of (derived?.baselines as AnyRec[] | undefined) ?? []) {
    const pos = (b.position as { x: number; y: number }) ?? { x: 0, y: 0 };
    lines.push({
      baseline: { x: pos.x, y: pos.y },
      width: (b.width as number) ?? 0,
      top: (b.lineY as number) ?? 0,
      height: (b.lineHeight as number) ?? 0,
      ascent: (b.lineAscent as number) ?? 0,
      firstChar: (b.firstCharacter as number) ?? 0,
      endChar: (b.endCharacter as number) ?? 0,
    });
  }
  const glyphs: Glyph[] = [];
  for (const g of (derived?.glyphs as AnyRec[] | undefined) ?? []) {
    const pos = (g.position as { x: number; y: number }) ?? { x: 0, y: 0 };
    const fontSize = (g.fontSize as number) ?? 0;
    glyphs.push({
      outline: glyphTable.intern(g.commandsBlob as number | undefined),
      x: pos.x,
      y: pos.y,
      fontSize,
      char: (g.firstCharacter as number) ?? 0,
      advance: ((g.advance as number) ?? 0) * fontSize,
      rotation: (g.rotation as number) ?? 0,
    });
  }

  const truncation = (derived?.truncationStartIndex as number | undefined) ?? -1;
  return {
    characters,
    runs,
    alignH: (n.textAlignHorizontal ?? "LEFT") as TextData["alignH"],
    alignV: (n.textAlignVertical ?? "TOP") as TextData["alignV"],
    autoResize: (n.textTruncation === "ENDING" ? "TRUNCATE" : (n.textAutoResize ?? "NONE")) as TextData["autoResize"],
    paragraphSpacing: (base.paragraphSpacing as number | undefined) ?? 0,
    maxLines: n.maxLines && n.maxLines > 0 ? n.maxLines : undefined,
    truncated: truncation >= 0,
    lines,
    glyphs,
    hasLayout: lines.length > 0 && glyphs.length > 0,
  };
}
