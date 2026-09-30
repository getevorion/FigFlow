/**
 * Figma components as C++ components. Each component the app draws becomes a
 * function in src/ui/components/ (one file per component or component set),
 * called where each instance is, with what its instances change (texts, text
 * and box styles, images) as parameters: the design's component library, in
 * code.
 *
 * An instance becomes a call when its layers are drawn together (nothing else
 * between them) and hold no controls: controls have state and actions of
 * their own and stay in their screen, and so do instances holding them (the
 * components inside those are still found). Instances laid out differently
 * (resized, or with layers shown or hidden) get a function each.
 */
import type { DesignNode } from "../model/types";
import type { ScreenOp } from "./controls";
import { NameScope, Writer, cleanLayerName, comment, f, snake, str } from "./cpp";
import { type OpContext, type OpSwap, writeStaticOp } from "./emit";
import type { Op } from "./plan";

/** A component call standing in for an instance's layers. */
export type ComponentOp = { kind: "component"; node: DesignNode; header: string; call: (frame: string) => string };

export type ComponentUnit = { root: DesignNode; ops: ScreenOp[] };

type Drawn = Extract<Op, { kind: "box" | "text" | "raster" | "clip-begin" | "clip-end" }>;

/** What an instance may change of its component's layers: a one-line text, its style, a box's look, an image. */
type SlotKind = "text" | "style" | "box" | "image";

const PARAM_TYPE: Record<SlotKind, string> = { text: "const char*", style: "const ff::TextStyle&", box: "const ff::Box&", image: "images::Id" };

type Slot = { kind: SlotKind; op: Drawn };

type Found = {
  node: DesignNode;
  component: NonNullable<DesignNode["component"]>;
  unit: number;
  /** The unit's ops it replaces: [start, end). */
  start: number;
  end: number;
  /** Its layers, moved so the instance's top-left corner is the origin. */
  ops: Drawn[];
  slots: Slot[];
  /** Per slot: the instance's value, as C++. */
  values: string[];
  signature: string;
};

/** Fewer layers than this aren't worth a function (an icon is an image call already). */
const MIN_LAYERS = 2;

/** Figma's default layer names: no name for a parameter. */
const GENERIC = /^(vector|group|frame|rectangle|rect|ellipse|line|polygon|star|union|subtract|intersect|exclude|image|layer|shape|path|instance|component|text)\s*\d*$/i;

/** A parameter's identifier: `text` is fine for a local (the reserved word is a runtime namespace, and `ns::` lookups skip variables). */
function paramIdent(name: string, fallback: string): string {
  const id = snake(name, fallback);
  return id === "text_" ? "text" : id;
}

function isDrawn(op: ScreenOp): op is Drawn {
  return op.kind === "box" || op.kind === "text" || op.kind === "raster" || op.kind === "clip-begin" || op.kind === "clip-end";
}

function moved(op: Drawn, dx: number, dy: number): Drawn {
  const at = <T extends { x: number; y: number }>(r: T): T => ({ ...r, x: r.x - dx, y: r.y - dy });
  switch (op.kind) {
    case "box":
    case "clip-begin":
      return { ...op, rect: at(op.rect) };
    case "text":
      return { ...op, rect: at(op.rect), segments: op.segments.map(at) };
    case "raster":
      return { ...op, rect: at(op.rect), raster: { ...op.raster, rect: at(op.raster.rect) } };
    default:
      return op;
  }
}

function slotsOf(op: Drawn): SlotKind[] {
  if (op.kind === "box") return ["box"];
  if (op.kind === "text" && op.singleLine) return ["text", "style"];
  if (op.kind === "raster") return ["image"];
  return [];
}

/** The op's slot values as C++ (styles are named in the theme on the way). */
function valuesOf(op: Drawn, ctx: OpContext): string[] {
  if (op.kind === "box") return [ctx.theme.box(op.box, op.node.name, ctx.assetIdent)];
  if (op.kind === "text" && op.singleLine) return [str(op.segments[0].text), ctx.theme.text(op.segments[0], op.node.styleNames?.text)];
  if (op.kind === "raster") return [`images::${ctx.assetIdent(op.raster.id)}`];
  return [];
}

/** The swap for one op, from its slots' expressions (undefined: as designed). */
function swapOf(kinds: SlotKind[], exprs: Array<string | undefined>): OpSwap | undefined {
  const swap: OpSwap = {};
  kinds.forEach((k, i) => {
    const e = exprs[i];
    if (e === undefined) return;
    if (k === "text") swap.text = e;
    else if (k === "style") swap.textStyle = e;
    else if (k === "box") swap.box = e;
    else swap.image = e;
  });
  return Object.keys(swap).length ? swap : undefined;
}

/** Writes `ops`, each slot drawn with `expr(slot index)` (undefined: as designed). */
function writeOps(w: Writer, ops: Drawn[], ctx: OpContext, expr: (slot: number) => string | undefined): void {
  let k = 0;
  for (const op of ops) {
    const kinds = slotsOf(op);
    writeStaticOp(w, op, ctx, swapOf(kinds, kinds.map(() => expr(k++))));
  }
}

/** The instance `node`'s layers in `unit`, if a call can stand in for them. */
function find(unit: ComponentUnit, index: number, node: DesignNode, ctx: OpContext): Found | null {
  const ids = new Set<string>();
  const collect = (n: DesignNode) => {
    ids.add(n.id);
    for (const c of n.children) collect(c);
  };
  collect(node);
  let start = -1;
  let end = -1;
  for (let i = 0; i < unit.ops.length; i++) {
    if (!ids.has(unit.ops[i].node.id)) continue;
    if (start < 0) start = i;
    else if (i !== end) return null; // something else is drawn between its layers
    end = i + 1;
  }
  if (start < 0) return null;
  const range = unit.ops.slice(start, end);
  if (range.some((op) => op.kind === "control")) return null;
  const drawn = range.filter(isDrawn);
  if (drawn.filter((op) => op.kind !== "clip-begin" && op.kind !== "clip-end").length < MIN_LAYERS) return null;
  let depth = 0;
  for (const op of drawn) if ((depth += op.kind === "clip-begin" ? 1 : op.kind === "clip-end" ? -1 : 0) < 0) return null;
  if (depth !== 0) return null;

  const ops = drawn.map((op) => moved(op, node.box.x, node.box.y));
  const slots = ops.flatMap((op) => slotsOf(op).map((kind) => ({ kind, op })));
  const values = ops.flatMap((op) => valuesOf(op, ctx));
  // The layers as code with every slot a placeholder and no comments: equal means laid out alike.
  const w = new Writer();
  writeOps(w, ops, ctx, (k) => `@${k}@`);
  const code = w
    .toString()
    .split("\n")
    .map((l) => l.replace(/\s+\/\/ .*$/, ""))
    .filter((l) => l.trim() && !l.trim().startsWith("//"))
    .join("\n");
  const component = node.component!;
  return { node, component, unit: index, start, end, ops, slots, values, signature: `${component.id}\n${f(node.box.w)} ${f(node.box.h)}\n${code}` };
}

/** "State=Default, Size=Large" → { State: "Default", Size: "Large" }. */
function variantOf(name: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of name.split(",")) {
    const [k, v] = part.split("=").map((s) => s?.trim());
    if (k && v) out[k] = v;
  }
  return out;
}

/** A parameter's name: the component property it fills when there is one ("Label"), else its layer's. */
function paramName(group: Found[], slot: number): string {
  const { kind, op } = group[0].slots[slot];
  if (kind === "style") return `${paramName(group, slot - 1)}_style`;
  if (kind === "text" && op.kind === "text") {
    let names: string[] | null = null;
    for (const g of group) {
      const t = g.slots[slot].op;
      const value = t.kind === "text" ? t.segments[0].text.trim() : "";
      const here = Object.entries(g.node.props ?? {})
        .filter(([k, v]) => typeof v === "string" && v.trim() === value && /\p{L}/u.test(k) && !GENERIC.test(k.trim()))
        .map(([k]) => k);
      names = names ? names.filter((n) => here.includes(n)) : here;
    }
    if (names?.length) return paramIdent(names[0], "text");
  }
  const clean = cleanLayerName(op.node.name);
  const fallback = kind === "box" ? "look" : kind;
  // Figma names a text layer after its text: that's no name for a parameter.
  if (!clean || GENERIC.test(clean)) return fallback;
  if (op.kind === "text" && clean.toLowerCase() === op.segments[0].text.trim().toLowerCase()) return fallback;
  return paramIdent(clean, fallback);
}

export type ComponentPlan = {
  /** Each unit's ops, with the instances components draw replaced by calls. */
  ops: Array<Array<ScreenOp | ComponentOp>>;
  files: { path: string; contents: string }[];
};

/** Finds the components in `units` (screens and popups), writes them, and puts calls in their place. */
export function planComponents(units: ComponentUnit[], ctx: OpContext): ComponentPlan {
  const found: Found[] = [];
  units.forEach((unit, index) => {
    const visit = (n: DesignNode) => {
      if (!n.visible) return;
      if (n !== unit.root && n.kind === "INSTANCE" && n.component) {
        const hit = find(unit, index, n, ctx);
        if (hit) {
          found.push(hit);
          return;
        }
      }
      for (const c of n.children) visit(c);
    };
    visit(unit.root);
  });

  // A variant is named by what sets it apart from the other variants the app uses.
  const used = new Map<string, Map<string, Record<string, string>>>();
  for (const x of found) {
    if (!x.component.set) continue;
    const set = used.get(x.component.set.id) ?? new Map<string, Record<string, string>>();
    set.set(x.component.id, variantOf(x.component.name));
    used.set(x.component.set.id, set);
  }
  const nameOf = (c: Found["component"]): string => {
    if (!c.set) return cleanLayerName(c.name) || "component";
    const mine = variantOf(c.name);
    const others = [...used.get(c.set.id)!.values()];
    const apart = Object.keys(mine).filter((k) => others.some((o) => o[k] !== mine[k]));
    return [cleanLayerName(c.set.name) || "component", ...apart.map((k) => (/^\d/.test(mine[k]) ? `${k} ${mine[k]}` : mine[k]))].join(" ");
  };

  // Instances laid out alike share a function; a file holds a component or a component set.
  const groups = new Map<string, Found[]>();
  for (const x of found) {
    const g = groups.get(x.signature);
    if (g) g.push(x);
    else groups.set(x.signature, [x]);
  }
  type File = { name: string; title: string; decls: Writer; defs: Writer; includes: Set<string> };
  const fileNames = new NameScope();
  const fileOf = new Map<string, File>();
  const fnNames = new NameScope();
  const calls = new Map<Found, ComponentOp>();

  for (const group of groups.values()) {
    const first = group[0];
    const c = first.component;
    const fileKey = c.set?.id ?? c.id;
    let file = fileOf.get(fileKey);
    if (!file) {
      const title = c.set?.name ?? c.name;
      file = { name: fileNames.take(snake(cleanLayerName(title) || "component", "component")), title, decls: new Writer(), defs: new Writer(), includes: new Set() };
      fileOf.set(fileKey, file);
    }
    const fn = fnNames.take(snake(nameOf(c), "component"));
    const size = fnNames.take(`${fn}_size`);

    // A slot the instances disagree on is a parameter; one they agree on stays as designed.
    const scope = new NameScope(["dl", "at", "f"]);
    const param = first.values.map((v, k) => (group.every((g) => g.values[k] === v) ? null : scope.take(paramName(group, k))));
    const params = param.flatMap((p, k) => (p ? [`${PARAM_TYPE[first.slots[k].kind]} ${p}`] : []));
    for (const [k, p] of param.entries()) {
      if (!p) continue;
      const kind = first.slots[k].kind;
      if (kind === "style" || kind === "box") file.includes.add("ff/style.h");
      if (kind === "image") file.includes.add("ui/assets/images.h");
    }
    const signature = `void ${fn}(ImDrawList* dl, ImVec2 at${params.map((p) => `, ${p}`).join("")})`;
    const title = c.set ? `${c.set.name} (${c.name})` : c.name;

    file.decls.line(`inline constexpr ImVec2 ${size}{ ${f(first.node.box.w)}, ${f(first.node.box.h)} };`).line();
    file.decls.line(`// ${comment(title)}, drawn with its top-left corner at \`at\`.`).line(`${signature};`).line();
    file.defs.line(`// ${comment(title)}`).open(signature).line(`const ff::Frame f{ at, ${size} };`);
    writeOps(file.defs, first.ops, ctx, (k) => param[k] ?? undefined);
    file.defs.close().line();

    const header = `ui/components/${file.name}.h`;
    for (const g of group) {
      const args = g.values
        .filter((_, k) => param[k])
        .map((v) => `, ${v}`)
        .join("");
      const at = `{ ${f(g.node.box.x)}, ${f(g.node.box.y)} }`;
      calls.set(g, { kind: "component", node: g.node, header, call: (frame) => `components::${fn}(dl, ${frame}.at(${at})${args});` });
    }
  }

  const files: ComponentPlan["files"] = [];
  for (const file of fileOf.values()) {
    const header = new Writer()
      .line(`// Figma component "${comment(file.title)}", generated by Figflow.`)
      .line("#pragma once")
      .line()
      .line('#include "imgui.h"');
    for (const inc of [...file.includes].sort()) header.line(`#include "${inc}"`);
    header.line().line("namespace components {").line().raw(file.decls.toString().trimEnd()).line().line("} // namespace components");
    const source = new Writer()
      .line(`// Figma component "${comment(file.title)}", generated by Figflow.`)
      .line(`#include "ui/components/${file.name}.h"`)
      .line()
      .line('#include "ff/draw.h"')
      .line('#include "ff/layout.h"')
      .line('#include "ff/text.h"')
      .line('#include "ui/assets/images.h"')
      .line('#include "ui/theme/palette.h"')
      .line('#include "ui/theme/styles.h"')
      .line()
      .line("namespace components {")
      .line()
      .raw(file.defs.toString().trimEnd())
      .line()
      .line("} // namespace components");
    files.push({ path: `src/ui/components/${file.name}.h`, contents: header.toString() }, { path: `src/ui/components/${file.name}.cpp`, contents: source.toString() });
  }

  const ops = units.map((unit, index) => {
    const here = found.filter((x) => x.unit === index).sort((a, b) => a.start - b.start);
    const out: Array<ScreenOp | ComponentOp> = [];
    let i = 0;
    for (const x of here) {
      while (i < x.start) out.push(unit.ops[i++]);
      out.push(calls.get(x)!);
      i = x.end;
    }
    while (i < unit.ops.length) out.push(unit.ops[i++]);
    return out;
  });
  return { ops, files };
}
