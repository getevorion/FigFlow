import type { TextRun } from "./types";

/**
 * Text as Figma shows it under a run's text case: its saved glyphs are of this text ("CONTROL"
 * for "Control" in upper case). Small caps keep their letters: they're drawn as other glyphs of them.
 */
export function applyCase(s: string, c: TextRun["textCase"]): string {
  switch (c) {
    case "UPPER":
      return s.toUpperCase();
    case "LOWER":
      return s.toLowerCase();
    case "TITLE":
      return s.replace(/\b\p{L}/gu, (m) => m.toUpperCase());
    default:
      return s;
  }
}
