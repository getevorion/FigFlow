/**
 * Popups and toasts inside one frame.
 *  - Popup: a layer group that starts with a full-frame translucent "dim"
 *    layer and holds a dialog panel; or anything named "popup: …".
 *  - Toast: a small panel with a message near the top or bottom edge, painted
 *    above the content; or anything named "notify: …".
 */
import { luminance } from "../model/math";
import { area, center, subtree, type El, type Scene } from "./scene";
import { parseTags } from "./tags";
import type { Popup, Toast } from "./types";

let seq = 0;

function isDim(e: El, frameArea: number): boolean {
  if (e.role !== "surface" || area(e.box) < frameArea * 0.88) return false;
  const blur = e.node.effects.some((x) => x.visible && x.type === "BACKGROUND_BLUR" && x.radius > 0);
  const f = e.fill;
  if (!f) return blur;
  return f.a >= 0.2 && f.a <= 0.97 && luminance(f) < 0.25;
}

function largestText(els: El[]): El | undefined {
  return els.filter((e) => e.role === "text" && e.text?.trim()).sort((a, b) => (b.node.text?.runs[0]?.fontSize ?? 0) - (a.node.text?.runs[0]?.fontSize ?? 0) || a.box.y - b.box.y)[0];
}

export function detectPopups(scene: Scene): Popup[] {
  const frameArea = scene.size.x * scene.size.y;
  const popups: Popup[] = [];
  const taken = new Set<El>();
  for (const e of scene.all) {
    if (e === scene.root || taken.has(e)) continue;
    const tag = parseTags(e.node.name).find((t) => t.kind === "popup");
    const kids = e.children;
    const dim = kids.find((k) => isDim(k, frameArea));
    const isContainer = e.role === "container" || e.node.kind === "GROUP" || e.node.kind === "FRAME";
    if (!tag && !(isContainer && dim && kids.indexOf(dim) === 0 && kids.length > 1)) continue;
    const rest = subtree(e).filter((x) => x !== e && x !== dim);
    const panel = rest
      .filter((x) => x.role === "surface" && area(x.box) < frameArea * 0.7 && area(x.box) > frameArea * 0.02)
      .sort((a, b) => Math.abs(center(a.box).x - scene.size.x / 2) + Math.abs(center(a.box).y - scene.size.y / 2) - (Math.abs(center(b.box).x - scene.size.x / 2) + Math.abs(center(b.box).y - scene.size.y / 2)) || area(b.box) - area(a.box))[0];
    const inPanel = panel ? rest.filter((x) => x.box.x >= panel.box.x - 1 && x.box.y >= panel.box.y - 1 && x.box.x + x.box.w <= panel.box.x + panel.box.w + 1 && x.box.y + x.box.h <= panel.box.y + panel.box.h + 1) : rest;
    const title = largestText(inPanel);
    popups.push({
      id: `popup${++seq}`,
      name: (tag && tag.kind === "popup" && tag.name) || title?.text?.trim() || e.node.name,
      root: e.node,
      backdrop: dim?.node,
      panel: panel?.node,
      title: title?.text?.trim(),
      rect: panel?.box ?? e.box,
      evidence: { score: tag ? 1 : 0.85, reasons: [tag ? `layer name "${e.node.name}"` : `full-frame dim layer over a dialog${title ? ` titled "${title.text!.trim()}"` : ""}`] },
    });
    for (const x of subtree(e)) taken.add(x);
  }
  return popups;
}

export function detectToasts(scene: Scene): Toast[] {
  const { x: W, y: H } = scene.size;
  const maxZ = scene.all.length;
  const toasts: Toast[] = [];
  const taken = new Set<El>();
  for (const e of scene.all) {
    if (e === scene.root || taken.has(e)) continue;
    const tag = parseTags(e.node.name).find((t) => t.kind === "notify");
    let ok = !!tag;
    if (!ok && e.role === "surface") {
      const { w, h } = e.box;
      const cy = center(e.box).y;
      const nearEdge = cy > H * 0.78 || cy < H * 0.18;
      const placed = Math.abs(center(e.box).x - W / 2) < W * 0.2 || e.box.x < W * 0.1 || e.box.x + w > W * 0.9;
      const texts = e.contents.filter((c) => c.role === "text" && c.text?.trim());
      // A toast is a lone banner: long and short, not one of a stack of look-alike rows
      // (a list, an accordion, a form's fields).
      const banner = w >= 160 && w / h >= 3.5;
      const lookAlike = scene.all.some(
        (o) => o !== e && o.role === "surface" && Math.abs(o.box.w - w) <= 3 && Math.abs(o.box.h - h) <= 3 && (Math.abs(o.box.x - e.box.x) <= 3 || Math.abs(o.box.y - e.box.y) <= 3),
      );
      ok = banner && !lookAlike && h >= 28 && h <= 96 && w <= 640 && nearEdge && placed && texts.length >= 1 && texts.length <= 3 && e.z > maxZ * 0.55;
    }
    if (!ok) continue;
    const els = subtree(e).concat(e.contents);
    const title = els.find((x) => x.role === "text" && x.text?.trim());
    // Content on the toast that isn't inside it in the layer tree belongs to it too.
    const inTree = new Set(subtree(e));
    const members = [e.node, ...e.contents.filter((c) => !inTree.has(c) && !e.contents.some((o) => o !== c && subtree(o).includes(c))).map((c) => c.node)];
    toasts.push({
      id: `toast${++seq}`,
      name: (tag && tag.kind === "notify" && tag.name) || title?.text?.trim().slice(0, 40) || e.node.name,
      root: e.node,
      members,
      title: title?.text?.trim(),
      rect: e.box,
      anchor: center(e.box).y < H / 2 ? "top" : "bottom",
      evidence: { score: tag ? 1 : 0.7, reasons: [tag ? `layer name "${e.node.name}"` : `${Math.round(e.box.w)}×${Math.round(e.box.h)} message panel near the ${center(e.box).y < H / 2 ? "top" : "bottom"} edge, above the content`] },
    });
    for (const x of els) taken.add(x);
  }
  return toasts;
}
