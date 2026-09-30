/**
 * Recognized controls → widget calls. The layers that make up a control
 * (its surface, label, icon, knob…) leave the screen's static drawing and
 * become one widget call at the same place in the paint order, drawn by the
 * widget with its states. Layers the widget can't express stay static; a
 * control whose art is too complex for its widget becomes a hotspot (an
 * invisible button over the unchanged art).
 */
import type { DesignNode, Rect } from "../model/types";
import type { NavGroup, Widget } from "../semantic/types";
import type { Op, Plan } from "./plan";

export type BoxOp = Extract<Op, { kind: "box" }>;
export type TextOp = Extract<Op, { kind: "text" }>;
export type RasterOp = Extract<Op, { kind: "raster" }>;

type Base = { widget: Widget; rect: Rect };

export type ButtonControl = Base & {
  kind: "button";
  surface: BoxOp | null;
  /** A one-colour surface Dear ImGui can't draw (a hexagon plate), baked white and tinted per state. */
  plate?: RasterOp | null;
  label: TextOp | null;
  icon: RasterOp | null;
  nav?: { group: NavGroup; index: number };
};
/** `nav`: the nav item it is, when its artwork is baked (it keeps the nav's behaviour). */
export type HotspotControl = Base & { kind: "hotspot"; nav?: { group: NavGroup; index: number } };
export type ToggleControl = Base & { kind: "toggle"; track: BoxOp; knob: BoxOp | RasterOp; label: TextOp | null; on: boolean };
export type CheckControl = Base & { kind: "checkbox" | "radio"; box: BoxOp; mark: RasterOp | BoxOp | null; label: TextOp | null; on: boolean };
/** `shown`: the number the design shows for the value ("3 ms"), drawn by the slider. */
export type SliderControl = Base & { kind: "slider"; track: BoxOp; fill: BoxOp | null; thumb: BoxOp | null; thumbMark: BoxOp | RasterOp | null; value: number; shown: TextOp | null };
export type FieldControl = Base & { kind: "text_field"; surface: BoxOp; placeholder: TextOp | null; icon: RasterOp | null; password: boolean };
export type ComboControl = Base & { kind: "combo"; surface: BoxOp; value: TextOp | null; chevron: RasterOp | null };
export type KeybindControl = Base & { kind: "keybind"; surface: BoxOp; text: TextOp | null; key: string };

export type Control = ButtonControl | HotspotControl | ToggleControl | CheckControl | SliderControl | FieldControl | ComboControl | KeybindControl;

export type ControlOp = { kind: "control"; node: DesignNode; control: Control };
export type ScreenOp = Op | ControlOp;

export type ExtractResult = { ops: ScreenOp[]; controls: Control[]; notes: string[] };

function subtreeIds(n: DesignNode, out = new Set<string>()): Set<string> {
  out.add(n.id);
  for (const c of n.children) subtreeIds(c, out);
  return out;
}

function contains(outer: Rect, inner: Rect, tol = 1): boolean {
  return inner.x >= outer.x - tol && inner.y >= outer.y - tol && inner.x + inner.w <= outer.x + outer.w + tol && inner.y + inner.h <= outer.y + outer.h + tol;
}

function sameRect(a: Rect, b: Rect, tol = 1): boolean {
  return Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol && Math.abs(a.w - b.w) <= tol && Math.abs(a.h - b.h) <= tol;
}

export function extractControls(plan: Plan, widgets: Widget[], navs: NavGroup[]): ExtractResult {
  const notes: string[] = [];
  const byNode = new Map<string, number[]>();
  plan.ops.forEach((op, i) => {
    if (op.kind === "section-end" || op.kind === "clip-end") return;
    const list = byNode.get(op.node.id);
    if (list) list.push(i);
    else byNode.set(op.node.id, [i]);
  });
  const removed = new Set<number>();
  const inserts = new Map<number, ControlOp[]>();
  const controls: Control[] = [];

  const opsOf = (n: DesignNode | undefined) => (n ? (byNode.get(n.id) ?? []).filter((i) => !removed.has(i)) : []);
  const pick = <K extends Op["kind"]>(n: DesignNode | undefined, kind: K): { i: number; op: Extract<Op, { kind: K }> } | null => {
    for (const i of opsOf(n)) if (plan.ops[i].kind === kind) return { i, op: plan.ops[i] as Extract<Op, { kind: K }> };
    return null;
  };
  const label = (n: DesignNode | undefined) => {
    const t = pick(n, "text");
    return t && t.op.singleLine ? t : null;
  };
  const add = (control: Control, parts: number[], node: DesignNode) => {
    for (const i of parts) removed.add(i);
    const at = parts.length ? Math.min(...parts) : firstIndexUnder(node);
    const list = inserts.get(at);
    const cop: ControlOp = { kind: "control", node, control };
    if (list) list.push(cop);
    else inserts.set(at, [cop]);
    controls.push(control);
  };
  const firstIndexUnder = (n: DesignNode) => {
    const ids = subtreeIds(n);
    const i = plan.ops.findIndex((op) => op.kind !== "section-end" && op.kind !== "clip-end" && ids.has(op.node.id));
    return i < 0 ? plan.ops.length : i;
  };
  const hotspot = (w: Widget, why: string) => {
    notes.push(`"${w.label?.text ?? w.nodes[0]?.name ?? w.kind}" keeps its artwork and gets an invisible hit area: ${why}.`);
    add({ kind: "hotspot", widget: w, rect: w.rect, nav: navOf.get(w) }, [], w.nodes[0]);
  };

  const navOf = new Map<Widget, { group: NavGroup; index: number }>();
  for (const g of navs) g.items.forEach((w, index) => navOf.set(w, { group: g, index }));

  for (const w of widgets) {
    const node = w.surface ?? w.nodes[0];
    if (!node) continue;
    switch (w.kind) {
      case "button":
      case "icon_button":
      case "nav_item":
      case "window_button": {
        const nav = navOf.get(w);
        // A group (tagged, or with a prototype click) whose parts weren't
        // identified: decompose it if it's one surface, one label, one icon.
        const whole = w.nodes.length === 1 && w.nodes[0].children.length > 0 && !w.label && !w.icon;
        const partOps = whole
          ? [...subtreeIds(w.nodes[0])].flatMap((id) => (byNode.get(id) ?? []).filter((i) => !removed.has(i)))
          : [];
        if (whole || (w.label && w.nodes[0].children.length > 0 && w.nodes.length === 1)) {
          const all = whole ? partOps : [...subtreeIds(w.nodes[0])].flatMap((id) => (byNode.get(id) ?? []).filter((i) => !removed.has(i)));
          const boxes = all.filter((i) => plan.ops[i].kind === "box");
          const texts = all.filter((i) => plan.ops[i].kind === "text");
          const rasters = all.filter((i) => plan.ops[i].kind === "raster");
          const other = all.filter((i) => !boxes.includes(i) && !texts.includes(i) && !rasters.includes(i));
          const text = texts.length === 1 ? (plan.ops[texts[0]] as TextOp) : null;
          const box = boxes.length === 1 ? (plan.ops[boxes[0]] as BoxOp) : null;
          const rect = box ? box.rect : w.rect;
          const ok =
            boxes.length <= 1 &&
            texts.length <= 1 &&
            rasters.length <= 1 &&
            other.length === 0 &&
            (!text || text.singleLine) &&
            [...texts, ...rasters].every((i) => contains(rect, (plan.ops[i] as TextOp | RasterOp).rect, 2));
          if (!ok) {
            hotspot(w, boxes.length > 1 || texts.length > 1 || rasters.length > 1 ? "it's drawn from several layers" : "its text wraps or sits outside it");
            break;
          }
          add({ kind: "button", widget: w, rect, surface: box, label: text, icon: rasters.length ? (plan.ops[rasters[0]] as RasterOp) : null, nav }, all, w.nodes[0]);
          break;
        }
        const surf = pick(w.surface, "box");
        const surfRaster = surf ? null : pick(w.surface, "raster");
        const lab = label(w.label?.node);
        if (w.label && !lab && pick(w.label.node, "text")) {
          hotspot(w, "its label wraps onto several lines");
          break;
        }
        let icon = pick(w.icon, "raster");
        let plate: { i: number; op: RasterOp } | null = null;
        if (surfRaster) {
          // A one-colour surface Dear ImGui can't draw natively (a hexagon, a custom path) is
          // baked white and tinted per state; any other baked surface is the control's artwork.
          if (surfRaster.op.raster.mode === "mask") plate = surfRaster;
          else if (icon) {
            hotspot(w, "its surface was baked to an image");
            break;
          } else icon = surfRaster;
        }
        const parts = [surf?.i, plate?.i, lab?.i, icon?.i].filter((i): i is number => i !== undefined);
        add({ kind: "button", widget: w, rect: w.rect, surface: surf?.op ?? null, plate: plate?.op ?? null, label: lab?.op ?? null, icon: icon?.op ?? null, nav }, parts, node);
        break;
      }
      case "toggle": {
        const track = pick(w.parts.track, "box");
        // A knob drawn as a vector is baked: the switch draws the image, tinted per state.
        const knob = pick(w.parts.knob, "box") ?? pick(w.parts.knob, "raster");
        if (!track || !knob) {
          notes.push(`The switch "${w.label?.text ?? node.name}" stays a picture: its ${!track ? "track" : "knob"} can't be drawn natively.`);
          break;
        }
        const lab = label(w.label?.node);
        add({ kind: "toggle", widget: w, rect: w.rect, track: track.op, knob: knob.op, label: lab?.op ?? null, on: w.value === true }, [track.i, knob.i, ...(lab ? [lab.i] : [])], node);
        break;
      }
      case "checkbox":
      case "radio": {
        const box = pick(w.parts.box, "box");
        if (!box) {
          notes.push(`The ${w.kind} "${w.label?.text ?? node.name}" stays a picture: its box can't be drawn natively.`);
          break;
        }
        const mark = pick(w.parts.mark, "raster") ?? pick(w.parts.mark, "box");
        const lab = label(w.label?.node);
        add(
          { kind: w.kind, widget: w, rect: w.rect, box: box.op, mark: mark?.op ?? null, label: lab?.op ?? null, on: w.value === true },
          [box.i, ...(mark ? [mark.i] : []), ...(lab ? [lab.i] : [])],
          node,
        );
        break;
      }
      case "slider": {
        const track = pick(w.parts.track, "box");
        if (!track) {
          notes.push(`The slider "${w.label?.text ?? node.name}" stays a picture: its track can't be drawn natively.`);
          break;
        }
        const fill = pick(w.parts.fill, "box");
        const thumb = pick(w.parts.thumb, "box");
        const shown = label(w.parts.value);
        const mark = thumb ? (pick(w.parts.thumbMark, "box") ?? pick(w.parts.thumbMark, "raster")) : null;
        add(
          { kind: "slider", widget: w, rect: w.rect, track: track.op, fill: fill?.op ?? null, thumb: thumb?.op ?? null, thumbMark: mark?.op ?? null, value: typeof w.value === "number" ? w.value : 0.5, shown: shown?.op ?? null },
          [track.i, ...(fill ? [fill.i] : []), ...(thumb ? [thumb.i] : []), ...(mark ? [mark.i] : []), ...(shown ? [shown.i] : [])],
          node,
        );
        break;
      }
      case "text_field": {
        const surf = pick(w.surface, "box");
        if (!surf) {
          notes.push(`The text field "${w.label?.text ?? node.name}" stays a picture: its box can't be drawn natively.`);
          break;
        }
        const ph = label(w.parts.placeholder);
        const icon = pick(w.parts.icon, "raster");
        add(
          { kind: "text_field", widget: w, rect: w.rect, surface: surf.op, placeholder: ph?.op ?? null, icon: icon?.op ?? null, password: w.value === "password" },
          [surf.i, ...(ph ? [ph.i] : []), ...(icon ? [icon.i] : [])],
          node,
        );
        break;
      }
      case "combo": {
        const surf = pick(w.surface, "box");
        if (!surf) {
          notes.push(`The drop-down "${node.name}" stays a picture: its box can't be drawn natively.`);
          break;
        }
        const value = label(w.parts.value);
        const chevron = pick(w.parts.chevron, "raster");
        add({ kind: "combo", widget: w, rect: w.rect, surface: surf.op, value: value?.op ?? null, chevron: chevron?.op ?? null }, [surf.i, ...(value ? [value.i] : []), ...(chevron ? [chevron.i] : [])], node);
        break;
      }
      case "keybind": {
        const surf = pick(w.surface, "box");
        if (!surf) {
          notes.push(`The key bind "${node.name}" stays a picture: its box can't be drawn natively.`);
          break;
        }
        const text = label(w.parts.key);
        add({ kind: "keybind", widget: w, rect: w.rect, surface: surf.op, text: text?.op ?? null, key: String(w.value ?? "") }, [surf.i, ...(text ? [text.i] : [])], node);
        break;
      }
    }
  }

  const ops: ScreenOp[] = [];
  plan.ops.forEach((op, i) => {
    const list = inserts.get(i);
    if (list) ops.push(...list);
    if (!removed.has(i)) ops.push(op);
  });
  const tail = inserts.get(plan.ops.length);
  if (tail) ops.push(...tail);
  // The widget draws its surface over its whole rect: they must be the same.
  for (const c of controls) if (c.kind === "button" && c.surface && !sameRect(c.surface.rect, c.rect)) c.rect = c.surface.rect;
  return { ops, controls, notes };
}
