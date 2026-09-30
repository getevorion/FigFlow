import type { DesignNode, Paint } from "./types";

/** Every fill a layer draws: its own, or, where vector regions are filled on their own, each region's. */
export function drawnFills(n: DesignNode): Paint[] {
  if (!n.fillGeometry.some((g) => g.fills)) return n.fills;
  return n.fillGeometry.flatMap((g) => g.fills ?? n.fills);
}

/**
 * A paint whose blend mode leaves what's beneath it unchanged (white multiplied or darkened, black
 * screened, lightened or dodged), at any opacity. Design kits use them as placeholders: they draw nothing.
 */
export function noOpBlend(p: Paint): boolean {
  if (p.type !== "SOLID" || p.blendMode === "NORMAL" || p.blendMode === "PASS_THROUGH") return false;
  const white = p.color.r > 0.999 && p.color.g > 0.999 && p.color.b > 0.999;
  const black = p.color.r < 0.001 && p.color.g < 0.001 && p.color.b < 0.001;
  switch (p.blendMode) {
    case "MULTIPLY":
    case "DARKEN":
    case "COLOR_BURN":
    case "LINEAR_BURN":
      return white;
    case "SCREEN":
    case "LIGHTEN":
    case "COLOR_DODGE":
    case "LINEAR_DODGE":
    case "DIFFERENCE":
    case "EXCLUSION":
      return black;
    default:
      return false;
  }
}
