import { readFileSync } from "node:fs";
import { join } from "node:path";
import opentype from "opentype.js";
import { describe, expect, it } from "vitest";
import type { DesignNode, Glyph, TextData, TextRun } from "../model/types";
import { resolveFonts, type FontKey } from "./fonts";

const fallback = { 400: new Uint8Array(readFileSync(join(__dirname, "../../../runtime/fonts/Inter-Regular.ttf"))) };
const key: FontKey = { family: "Test Sans", weight: 600, italic: false };

// Em-space outlines (y down), as the fig reader stores them: a box and a triangle.
const paths = ["M0.05 0L0.55 0L0.55 -0.7L0.05 -0.7Z", "M0 -0.7L0.6 -0.7L0.3 0Z"];

/**
 * One line of text as Figma saves it: glyph advances, and positions that
 * include kerning (`kern`: em between the characters at i and i + 1).
 */
function textNode(characters: string, size: number, kern: Record<number, number>, extra: Partial<TextRun> = {}): DesignNode {
  const advanceEm: Record<string, number> = { A: 0.6, V: 0.62, " ": 0.25 };
  const glyphs: Glyph[] = [];
  let x = 0;
  for (let i = 0; i < characters.length; i++) {
    const ch = characters[i];
    const advance = advanceEm[ch] * size;
    glyphs.push({ outline: ch === "A" ? 0 : ch === "V" ? 1 : -1, x, y: size * 0.97, fontSize: size, char: i, advance, rotation: 0 });
    x += advance + (kern[i] ?? 0) * size + (extra.letterSpacing ?? 0);
  }
  const lineHeight = 1.5 * size; // explicit: the half-leading goes above the ascender
  const run: TextRun = {
    start: 0,
    end: characters.length,
    font: { family: key.family, style: "Semi Bold", postscript: "", weight: 600, italic: false, lineHeightEm: 1.21 },
    fontSize: size,
    letterSpacing: 0,
    lineHeight,
    fills: [],
    decoration: "NONE",
    textCase: "ORIGINAL",
    ...extra,
  };
  const text: TextData = {
    characters,
    runs: [run],
    alignH: "LEFT",
    alignV: "TOP",
    autoResize: "WIDTH_AND_HEIGHT",
    paragraphSpacing: 0,
    truncated: false,
    lines: [{ baseline: { x: 0, y: 0 }, width: x, top: 0, height: lineHeight, ascent: 0.97 * size + (lineHeight - 1.21 * size) / 2, firstChar: 0, endChar: characters.length }],
    glyphs,
    hasLayout: true,
  };
  return { text, children: [] } as unknown as DesignNode;
}

describe("resolveFonts", () => {
  it("rebuilds the design's glyphs and measures Figma's kerning", async () => {
    const root = { children: [textNode("AVA A", 20, { 0: -0.05, 1: -0.04 })] } as unknown as DesignNode;
    const warnings: string[] = [];
    const [face] = await resolveFonts([key], [{ root, glyphs: paths }], null, fallback, (m) => warnings.push(m));
    expect(face.source).toBe("design");
    expect(face.glyphCount).toBe(3); // A, V and the space
    expect(warnings.join()).toMatch(/isn't a downloadable font/);

    const font = opentype.parse(face.bytes.buffer.slice(face.bytes.byteOffset, face.bytes.byteOffset + face.bytes.byteLength) as ArrayBuffer);
    const adv = (ch: string) => font.charToGlyph(ch).advanceWidth! / font.unitsPerEm;
    expect(adv("A")).toBeCloseTo(0.6, 3);
    expect(adv("V")).toBeCloseTo(0.62, 3);
    // Only characters the design drew: others fall through to the fonts merged behind.
    expect(font.charToGlyphIndex("B")).toBe(0);

    const kern = new Map(face.kerning.map(([l, r, em]) => [`${String.fromCodePoint(l)}${String.fromCodePoint(r)}`, em]));
    expect(kern.get("AV")).toBeCloseTo(-0.05, 3);
    expect(kern.get("VA")).toBeCloseTo(-0.04, 3);
    expect(kern.has("A ")).toBe(false); // unkerned pairs aren't listed
    expect(face.kerning.map(([l, r]) => l * 0x110000 + r)).toEqual([...face.kerning.map(([l, r]) => l * 0x110000 + r)].sort((a, b) => a - b));

    // The original font's vertical metrics, recovered through the explicit line height.
    expect(font.ascender / font.unitsPerEm).toBeCloseTo(0.97, 2);
    expect(face.emScale).toBeCloseTo(1.21, 2);
  });

  it("measures kerning net of letter spacing", async () => {
    const root = { children: [textNode("AV", 10, { 0: -0.06 }, { letterSpacing: 1.5 })] } as unknown as DesignNode;
    const [face] = await resolveFonts([key], [{ root, glyphs: paths }], null, fallback, () => {});
    expect(face.kerning).toHaveLength(1);
    expect(face.kerning[0][2]).toBeCloseTo(-0.06, 3);
  });

  it("uses the provider's font when the file saved no layout", async () => {
    const node = textNode("AV", 10, {});
    node.text!.hasLayout = false;
    const provided = fallback[400];
    const [face] = await resolveFonts([key], [{ root: { children: [node] } as unknown as DesignNode, glyphs: paths }], async () => provided, fallback, () => {});
    expect(face.source).toBe("provider");
    expect(face.bytes).toBe(provided);
    expect(face.kerning).toEqual([]);
  });
});
