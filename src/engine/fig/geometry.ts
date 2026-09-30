/**
 * Figma path blobs → SVG path data.
 *
 * `fillGeometry` / `strokeGeometry` entries reference a commands blob: a byte
 * stream of command codes (0 Z, 1 M, 2 L, 3 Q, 4 C) followed by little-endian
 * float32 coordinates in the layer's local pixel space. Glyph outlines use the
 * same encoding in em units with y pointing up.
 */
import { parseCommandsBlob, parseVectorNetworkBlob } from "./kiwi/blob-parser";
import type { RawIndex } from "./raw";
import type { GeometryPath, WindingRule } from "../model/types";

const fmt = (v: number) => {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? "0" : String(r);
};

/** Converts parsed commands to SVG path data, optionally transforming each point. */
export function commandsToPath(cmds: Array<string | number>, map?: (x: number, y: number) => [number, number]): string {
  const out: string[] = [];
  let i = 0;
  // SVG path data must start with a moveto, and Figma's glyph blobs begin with a
  // stray close command. After a Z the current point is the subpath's start, so
  // drawing may continue; only commands before the first moveto are dropped.
  let hasPoint = false;
  let lastWasClose = false;
  const pt = () => {
    const x = cmds[i++] as number;
    const y = cmds[i++] as number;
    const [px, py] = map ? map(x, y) : [x, y];
    return `${fmt(px)} ${fmt(py)}`;
  };
  while (i < cmds.length) {
    const c = cmds[i++] as string;
    switch (c) {
      case "M":
        out.push(`M${pt()}`);
        hasPoint = true;
        lastWasClose = false;
        break;
      case "L":
      case "Q":
      case "C": {
        if (!hasPoint) {
          // A drawing command before any moveto: skip its coordinates.
          i += c === "L" ? 2 : c === "Q" ? 4 : 6;
          break;
        }
        out.push(c === "L" ? `L${pt()}` : c === "Q" ? `Q${pt()} ${pt()}` : `C${pt()} ${pt()} ${pt()}`);
        lastWasClose = false;
        break;
      }
      case "Z":
        if (hasPoint && !lastWasClose) out.push("Z");
        lastWasClose = true;
        break;
      default:
        return out.join("");
    }
  }
  return out.join("");
}

export function winding(rule: string | undefined): WindingRule {
  return rule === "ODD" ? "EVENODD" : "NONZERO";
}

type RawPath = { windingRule?: string; commandsBlob?: number; styleID?: number };

/** Resolves a node's fillGeometry/strokeGeometry list to SVG paths. */
export function resolvePaths(index: RawIndex, paths: RawPath[] | undefined): GeometryPath[] {
  if (!paths?.length) return [];
  const out: GeometryPath[] = [];
  for (const p of paths) {
    const bytes = index.blob(p.commandsBlob);
    if (!bytes) continue;
    const cmds = parseCommandsBlob(bytes);
    if (!cmds?.length) continue;
    const d = commandsToPath(cmds);
    if (d) out.push({ d, winding: winding(p.windingRule) });
  }
  return out;
}

/**
 * Builds fill paths from a vector network when Figma saved no fillGeometry.
 * Each region is one path; each loop is a closed subpath of its segments.
 * `scaleX/Y` map the network's normalized size onto the layer's size.
 */
export function vectorNetworkToPaths(bytes: Uint8Array, scaleX = 1, scaleY = 1): GeometryPath[] {
  const vn = parseVectorNetworkBlob(bytes);
  if (!vn) return [];
  const out: GeometryPath[] = [];
  const P = (x: number, y: number) => `${fmt(x * scaleX)} ${fmt(y * scaleY)}`;
  for (const region of vn.regions) {
    let d = "";
    for (const loop of region.loops) {
      let first = true;
      for (const si of loop.segments) {
        const s = vn.segments[si];
        const a = vn.vertices[s.start.vertex];
        const b = vn.vertices[s.end.vertex];
        if (first) {
          d += `M${P(a.x, a.y)}`;
          first = false;
        }
        const straight = s.start.dx === 0 && s.start.dy === 0 && s.end.dx === 0 && s.end.dy === 0;
        d += straight
          ? `L${P(b.x, b.y)}`
          : `C${P(a.x + s.start.dx, a.y + s.start.dy)} ${P(b.x + s.end.dx, b.y + s.end.dy)} ${P(b.x, b.y)}`;
      }
      if (!first) d += "Z";
    }
    if (d) out.push({ d, winding: region.windingRule === "ODD" ? "EVENODD" : "NONZERO" });
  }
  return out;
}

/**
 * Glyph outlines are stored per glyph in em units, y up. The document keeps a
 * deduplicated table of em-space paths (converted to y down) so repeated
 * letters share one outline; text layers reference entries by index.
 */
export class GlyphTable {
  readonly paths: string[] = [];
  private byBlob = new Map<number, number>();
  private byPath = new Map<string, number>();

  constructor(private index: RawIndex) {}

  /** Returns the outline's table index, or -1 when the glyph draws nothing. */
  intern(blobId: number | undefined): number {
    if (blobId === undefined) return -1;
    const known = this.byBlob.get(blobId);
    if (known !== undefined) return known;
    const bytes = this.index.blob(blobId);
    const cmds = bytes ? parseCommandsBlob(bytes) : null;
    let id = -1;
    if (cmds && cmds.length > 1) {
      const d = commandsToPath(cmds, (x, y) => [x, -y]);
      if (d && d !== "Z") {
        const existing = this.byPath.get(d);
        if (existing !== undefined) id = existing;
        else {
          id = this.paths.length;
          this.paths.push(d);
          this.byPath.set(d, id);
        }
      }
    }
    this.byBlob.set(blobId, id);
    return id;
  }
}
