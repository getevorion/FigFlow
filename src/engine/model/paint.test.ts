import { describe, expect, it } from "vitest";
import { noOpBlend } from "./paint";
import type { BlendMode, Paint } from "./types";

const solid = (r: number, g: number, b: number, blendMode: BlendMode, opacity = 1): Paint => ({ type: "SOLID", color: { r, g, b, a: 1 }, opacity, visible: true, blendMode });

describe("paints whose blend mode changes nothing", () => {
  it("are white multiplied or darkened, and black screened, lightened or dodged, at any opacity", () => {
    expect(noOpBlend(solid(1, 1, 1, "MULTIPLY"))).toBe(true);
    expect(noOpBlend(solid(1, 1, 1, "DARKEN", 0.4))).toBe(true);
    expect(noOpBlend(solid(0, 0, 0, "SCREEN"))).toBe(true);
    expect(noOpBlend(solid(0, 0, 0, "LINEAR_DODGE"))).toBe(true);
  });

  it("aren't any other colour, any other mode, or a normal paint", () => {
    expect(noOpBlend(solid(0.9, 0.2, 0.2, "MULTIPLY"))).toBe(false);
    expect(noOpBlend(solid(1, 1, 1, "SCREEN"))).toBe(false);
    expect(noOpBlend(solid(0, 0, 0, "OVERLAY"))).toBe(false);
    expect(noOpBlend(solid(1, 1, 1, "NORMAL"))).toBe(false);
  });
});
