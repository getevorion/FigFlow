/**
 * Draw plan → C++ source: the palette, styles, fonts, images and screen files.
 */
import type { DesignNode, Rect, RGBA } from "../model/types";
import type { FontFace } from "./fonts";
import type { ImageAssetOut } from "./assets";
import type { Op, PlanBox, PlanFill, TextSegment } from "./plan";
import { NameScope, Writer, byte, cleanLayerName, col32, comment, f, pascal, snake, str } from "./cpp";

// ---------------------------------------------------------------------------
// Theme: palette + styles, deduplicated and named from the design.

type PaletteEntry = { name: string; color: RGBA; note: string; uses: number };
type BoxEntry = { name: string; code: string; note: string; uses: number };
type TextEntry = { name: string; code: string; note: string; uses: number };
type ControlEntry = { name: string; type: string; code: string; note: string; uses: number; bases: Set<string>; shared: Set<string>; nouns: Set<string> };

/** How a control style is named once different controls share it (see Theme.settleControlNames). */
export type SharedStyleName = { shared: string; noun: string };

/** Widget style types and the header that declares each. */
export const WIDGET_HEADERS: Record<string, string> = {
  "ui::ButtonStyle": "ui/components/button.h",
  "ui::ToggleStyle": "ui/components/toggle.h",
  "ui::CheckboxStyle": "ui/components/checkbox.h",
  "ui::SliderStyle": "ui/components/slider.h",
  "ui::TextFieldStyle": "ui/components/text_field.h",
  "ui::ComboStyle": "ui/components/combo.h",
  "ui::KeybindStyle": "ui/components/keybind.h",
};

export class Theme {
  readonly palette = new Map<string, PaletteEntry>();
  readonly boxes = new Map<string, BoxEntry>();
  readonly texts = new Map<string, TextEntry>();
  readonly controls = new Map<string, ControlEntry>();
  private paletteNames = new NameScope();
  private styleNames = new NameScope();

  constructor(private fonts: FontFace[]) {}

  /**
   * A styles:: constant for a control's look (a ui::*Style); identical looks share one. It's named
   * after its control (`base`) until settleControlNames(): one that different controls share is
   * then renamed after what those controls are (`naming`: "input_field", else "slider").
   */
  control(type: string, base: string, code: string, note: string, naming?: SharedStyleName): string {
    const key = `${type}|${code}`;
    const known = this.controls.get(key);
    const shared = naming?.shared ?? base;
    const noun = naming?.noun ?? base;
    if (known) {
      known.uses++;
      known.bases.add(base);
      known.shared.add(shared);
      known.nouns.add(noun);
      return `styles::${known.name}`;
    }
    const name = this.styleNames.take(base);
    this.controls.set(key, { name, type, code, note, uses: 1, bases: new Set([base]), shared: new Set([shared]), nouns: new Set([noun]) });
    return `styles::${name}`;
  }

  /**
   * Renames the control styles that differently named controls share: the password field's look
   * was "email_field", after the first field using it. Returns old → new for the code already written.
   */
  settleControlNames(): Map<string, string> {
    const renames = new Map<string, string>();
    for (const c of this.controls.values()) {
      if (c.bases.size < 2) continue;
      const base = c.shared.size === 1 ? [...c.shared][0] : c.nouns.size === 1 ? [...c.nouns][0] : "control";
      const name = this.styleNames.take(snake(base, "style"));
      renames.set(c.name, name);
      c.name = name;
    }
    return renames;
  }

  /** A palette constant for a color, named after its variable/style when it has one. */
  color(c: RGBA, role: string, hint?: { variable?: string; style?: string }): string {
    const key = `${byte(c.r)},${byte(c.g)},${byte(c.b)},${byte(c.a)}`;
    const known = this.palette.get(key);
    if (known) {
      known.uses++;
      return `palette::${known.name}`;
    }
    const hex = [c.r, c.g, c.b].map((v) => byte(v).toString(16).padStart(2, "0")).join("");
    const alpha = byte(c.a) < 255 ? `_a${Math.round(c.a * 100)}` : "";
    const named = hint?.variable ?? hint?.style;
    const base = named ? snake(named.split("/").join(" "), role) : `${role}_${hex}${alpha}`;
    const name = this.paletteNames.take(base);
    this.palette.set(key, { name, color: c, note: named ?? "", uses: 1 });
    return `palette::${name}`;
  }

  private fill(p: PlanFill, assetIdent: (req: string) => string): string {
    if (p.kind === "solid") {
      const c = this.color(p.color, "fill", { variable: p.variable, style: p.styleName });
      return p.opacity < 0.999 ? `ff::solid(${c}, ${f(p.opacity)})` : `ff::solid(${c})`;
    }
    if (p.kind === "image") return `ff::image(images::${assetIdent(p.asset.id)}${p.opacity < 0.999 ? `, IM_COL32_WHITE, ${f(p.opacity)}` : ""})`;
    const stops = p.stops.map((s) => `{ ${f(s.position)}, ${this.color(s.color, "gradient")} }`).join(", ");
    return `ff::linear({ ${f(p.from.x)}, ${f(p.from.y)} }, { ${f(p.to.x)}, ${f(p.to.y)} }, { ${stops} }${p.opacity < 0.999 ? `, ${f(p.opacity)}` : ""})`;
  }

  /** A box look's designated initializers, one per line. */
  private boxFields(b: PlanBox, assetIdent: (req: string) => string): string[] {
    const lines: string[] = [];
    if (b.fills.length) lines.push(`.fills = { ${b.fills.map((x) => this.fill(x, assetIdent)).join(", ")} },`);
    const [tl, tr, br, bl] = b.radii;
    if (tl || tr || br || bl) lines.push(tl === tr && tr === br && br === bl ? `.radii = { ${f(tl)} },` : `.radii = { ${f(tl)}, ${f(tr)}, ${f(br)}, ${f(bl)} },`);
    if (b.stroke) {
      const s = b.stroke;
      const col = this.color(s.color, "stroke", { variable: s.variable, style: s.styleName });
      const parts = [`.color = ${col}`];
      if (s.sides) parts.push(`.weight = 0.f`, `.align = ff::StrokeAlign::${s.align}`, `.top = ${f(s.sides.top)}`, `.right = ${f(s.sides.right)}`, `.bottom = ${f(s.sides.bottom)}`, `.left = ${f(s.sides.left)}`);
      else parts.push(`.weight = ${f(s.weight)}`, `.align = ff::StrokeAlign::${s.align}`);
      if (s.opacity < 0.999) parts.push(`.opacity = ${f(s.opacity)}`);
      lines.push(`.stroke = { ${parts.join(", ")} },`);
    }
    if (b.shadows.length) {
      const sh = b.shadows.map((s) => {
        const parts = [`.color = ${this.color(s.color, "shadow")}`, `.offset = { ${f(s.offset.x)}, ${f(s.offset.y)} }`, `.blur = ${f(s.blur)}`];
        if (s.spread) parts.push(`.spread = ${f(s.spread)}`);
        if (s.inner) parts.push(`.inner = true`);
        if (s.showBehind && !s.inner) parts.push(`.show_behind = true`);
        return `{ ${parts.join(", ")} }`;
      });
      lines.push(sh.length === 1 ? `.shadows = { ${sh[0]} },` : `.shadows = {\n        ${sh.join(",\n        ")},\n    },`);
    }
    if (b.opacity < 0.999) lines.push(`.opacity = ${f(b.opacity)},`);
    if (b.backdropBlur > 0) lines.push(`.backdrop_blur = ${f(b.backdropBlur)},`);
    return lines;
  }

  /** A box look written in place, for a control's style: { .fills = …, .radii = … }. */
  boxInit(b: PlanBox, assetIdent: (req: string) => string): string {
    const fields = this.boxFields(b, assetIdent).map((l) => l.replace(/\s*\n\s*/g, " ").replace(/,$/, ""));
    return fields.length ? `{ ${fields.join(", ")} }` : "{}";
  }

  /** A styles:: constant for a box look; identical looks share one constant. */
  box(b: PlanBox, layerName: string, assetIdent: (req: string) => string): string {
    const code = this.boxFields(b, assetIdent).join("\n    ");
    const known = this.boxes.get(code);
    if (known) {
      known.uses++;
      return `styles::${known.name}`;
    }
    const name = this.styleNames.take(snake(cleanLayerName(layerName, { keepCounter: true }) || "box", "box"));
    this.boxes.set(code, { name, code, note: layerName, uses: 1 });
    return `styles::${name}`;
  }

  /** A styles:: constant for a text style. */
  text(seg: TextSegment, textStyleName: string | undefined): string {
    const run = seg.run;
    const face = this.fonts.find((x) => x.key.family === run.font.family && x.key.weight === run.font.weight && x.key.italic === run.font.italic) ?? this.fonts[0];
    const fill = run.fills.find((p) => p.visible && p.type === "SOLID");
    const color = fill && fill.type === "SOLID" ? this.color({ ...fill.color, a: fill.color.a * fill.opacity }, "text", { variable: fill.variableRef }) : "IM_COL32_WHITE";
    const parts = [`.font = &fonts::${face?.ident ?? "fallback"}`, `.size = ${f(run.fontSize)}`, `.color = ${color}`];
    if (run.letterSpacing) parts.push(`.letter_spacing = ${f(run.letterSpacing)}`);
    if (run.lineHeight) parts.push(`.line_height = ${f(run.lineHeight)}`);
    const code = parts.join(", ");
    const known = this.texts.get(code);
    if (known) {
      known.uses++;
      return `styles::${known.name}`;
    }
    const base = textStyleName ? snake(textStyleName.split("/").join(" "), "text") : snake(`${face?.ident ?? "text"} ${Math.round(run.fontSize)}`, "text");
    const name = this.styleNames.take(base);
    this.texts.set(code, { name, code, note: textStyleName ?? `${face?.label ?? ""} ${run.fontSize}px`, uses: 1 });
    return `styles::${name}`;
  }
}

// ---------------------------------------------------------------------------

export type OpContext = {
  theme: Theme;
  assetIdent: (rasterId: string) => string;
  assetIsMask: (rasterId: string) => boolean;
  /** The ff::Frame variable positions are relative to. */
  frame?: string;
  /** The section (top-level layer) being written: names layers that have only Figma's default names. */
  section?: string;
};

/** Names Figma gives new layers ("Rectangle 24", "Group 5", "Слой 3"): they say nothing about a look. */
const DEFAULT_LAYER = /^(frame|group|rectangle|rect|ellipse|vector|line|polygon|star|union|subtract|intersect|exclude|instance|component|layer|shape|path|image|mask group|слой)(\s+\d+)*$/i;

/** A name for a layer's look: its own name, or for a default one what it is in its section ("gamebar divider"). */
export function lookName(n: DesignNode, rect: Rect, section?: string): string {
  const own = cleanLayerName(n.name, { keepCounter: true });
  if (own && !DEFAULT_LAYER.test(own.trim())) return own;
  const role =
    Math.min(rect.w, rect.h) <= 3 ? "divider" : n.fills.some((p) => p.visible && p.type === "IMAGE") ? "picture" : n.kind === "ELLIPSE" ? "circle" : rect.w * rect.h >= 250_000 ? "panel" : "plate";
  if (section) return `${section} ${role}`;
  return role === "panel" ? "background" : role;
}

/** `f.rect({ x, y }, { w, h })` for a rectangle in design coordinates. */
export function rectExpr(r: Rect, frame = "f"): string {
  return `${frame}.rect({ ${f(r.x)}, ${f(r.y)} }, { ${f(r.w)}, ${f(r.h)} })`;
}

export function layerComment(n: DesignNode): string {
  const kind = n.component ? `${n.kind.toLowerCase()} of "${n.component.name}"` : n.kind.toLowerCase();
  return `// ${comment(n.name || kind)}${n.name && !n.name.toLowerCase().includes(n.kind.toLowerCase()) ? ` (${kind})` : ""}`;
}

/**
 * Writes one static drawing operation. `textOverride` replaces a single-line
 * text layer's string with a C++ expression (a toast's message).
 */
/**
 * Expressions drawn instead of the design's text, text style, box style or
 * image: a component's parameters, or a toast's message (`nullableText`:
 * null draws the design's).
 */
export type OpSwap = { text?: string; nullableText?: boolean; textStyle?: string; box?: string; image?: string };

export function writeStaticOp(w: Writer, op: Op, ctx: OpContext, swap?: OpSwap): void {
  const { theme } = ctx;
  const fr = ctx.frame ?? "f";
  switch (op.kind) {
    case "box": {
      const style = swap?.box ?? theme.box(op.box, lookName(op.node, op.rect, ctx.section), ctx.assetIdent);
      w.line(layerComment(op.node));
      w.line(`ff::draw::${op.ellipse ? "ellipse" : "box"}(dl, ${rectExpr(op.rect, fr)}, ${style});`);
      break;
    }
    case "text": {
      w.line(layerComment(op.node));
      const styleName = op.node.styleNames?.text;
      if (op.singleLine || swap?.text) {
        const seg = op.segments[0];
        const ts = swap?.textStyle ?? theme.text(seg, styleName);
        // text_in re-aligns at runtime, so edited labels stay centered/right-aligned.
        const trunc = op.truncate ? ", 1.f, true" : "";
        const text = !swap?.text ? str(seg.text) : swap.nullableText ? `${swap.text} ? ${swap.text} : ${str(seg.text)}` : swap.text;
        w.line(`ff::text_in(dl, ${rectExpr(op.rect, fr)}, ${f(seg.y - op.rect.y)}, ff::Align::${op.align}, ${ts}, ${text}${trunc});`);
      } else {
        for (const seg of op.segments) {
          const ts = theme.text(seg, styleName);
          w.line(`ff::text(dl, ${fr}.at({ ${f(seg.x)}, ${f(seg.y)} }), ${ts}, ${str(seg.text)});`);
        }
      }
      break;
    }
    case "raster": {
      const ident = ctx.assetIdent(op.raster.id);
      const tint = ctx.assetIsMask(op.raster.id) && op.raster.tint ? theme.color(op.raster.tint, "icon") : null;
      w.line(`${layerComment(op.node)}: ${op.raster.reason}`);
      w.line(`ff::draw::image(dl, ${rectExpr(op.raster.rect, fr)}, ${swap?.image ?? `images::${ident}`}${tint ? `, ${tint}` : ""});`);
      break;
    }
    case "clip-begin":
      // ImGui's clip rect, not just the draw list's: controls inside are clipped for input too.
      w.line(`ImGui::PushClipRect(${fr}.at({ ${f(op.rect.x)}, ${f(op.rect.y)} }), ${fr}.at({ ${f(op.rect.x + op.rect.w)}, ${f(op.rect.y + op.rect.h)} }), true); // ${comment(op.node.name)} clips its content`);
      break;
    case "clip-end":
      w.line("ImGui::PopClipRect();");
      break;
    default:
      break;
  }
}

export function emitPalette(theme: Theme, frameName: string): string {
  const w = new Writer()
    .line(`// Colors used by "${comment(frameName)}", named after the design's variables and styles`)
    .line("// where it has them. Change a value here and every layer using it follows.")
    .line("#pragma once")
    .line()
    .line('#include "imgui.h"')
    .line()
    .line("namespace palette {")
    .line();
  const entries = [...theme.palette.values()].sort((a, b) => (a.note && !b.note ? -1 : !a.note && b.note ? 1 : b.uses - a.uses));
  const width = Math.max(...entries.map((e) => e.name.length), 8);
  for (const e of entries) {
    const note = e.note ? ` // ${comment(e.note)}` : e.uses > 1 ? ` // ${e.uses} layers` : "";
    w.line(`inline constexpr ImU32 ${e.name.padEnd(width)} = ${col32(e.color)};${note}`);
  }
  return w.line().line("} // namespace palette").toString();
}

export function emitStyles(theme: Theme): { header: string; source: string } {
  const types = [...new Set([...theme.controls.values()].map((c) => c.type))].sort();
  const h = new Writer()
    .line("// Layer, text and control styles, deduplicated: things that look the same share one.")
    .line("#pragma once")
    .line()
    .line('#include "ff/style.h"');
  for (const t of types) h.line(`#include "${WIDGET_HEADERS[t]}"`);
  h.line().line("namespace styles {").line();
  const s = new Writer()
    .line('#include "ui/theme/styles.h"')
    .line()
    .line('#include "ui/assets/images.h"')
    .line('#include "ui/theme/fonts.h"')
    .line('#include "ui/theme/palette.h"')
    .line()
    .line("namespace styles {")
    .line();
  for (const b of theme.boxes.values()) {
    h.line(`extern const ff::Box ${b.name};${b.uses > 1 ? ` // ${b.uses} layers` : ""}`);
    s.line(`// ${comment(b.note)}`);
    s.line(`const ff::Box ${b.name}{`);
    s.line(`    ${b.code}`);
    s.line("};");
    s.line();
  }
  if (theme.texts.size) h.line();
  for (const t of theme.texts.values()) {
    h.line(`extern const ff::TextStyle ${t.name}; // ${comment(t.note)}`);
    s.line(`const ff::TextStyle ${t.name}{ ${t.code} };`);
  }
  // Controls last: they copy the boxes and point at the text styles above
  // (same file, so those are initialized first).
  if (theme.controls.size) {
    h.line().line("// Controls: every state of each one (hover and pressed looks derived from the design).");
    s.line();
  }
  for (const c of theme.controls.values()) {
    h.line(`extern const ${c.type} ${c.name};${c.note ? ` // ${comment(c.note)}` : ""}${c.uses > 1 ? ` (${c.uses} controls)` : ""}`);
    s.line(`// ${comment(c.note)}`);
    s.line(`const ${c.type} ${c.name}{`);
    s.raw(c.code.split("\n").map((l) => `    ${l}`).join("\n"));
    s.line("};");
    s.line();
  }
  h.line().line("} // namespace styles");
  s.line().line("} // namespace styles");
  return { header: h.toString(), source: s.toString() };
}

export function emitFonts(faces: FontFace[], fallbackIdent: string, bytesOf: (ident: string) => string): { header: string; source: string } {
  const h = new Writer()
    .line("// Fonts the design uses. Sizes in styles.h are Figma's pixel sizes: each font is")
    .line("// loaded with its em scale so ImGui draws text at exactly the designed size.")
    .line("#pragma once")
    .line()
    .line('#include "imgui.h"')
    .line()
    .line("namespace fonts {")
    .line();
  const note = (face: FontFace) =>
    face.source === "design" ? `the design's ${face.glyphCount} characters as Figma drew them${face.full ? ", then the complete font" : ", then Inter"}` : face.source === "fallback" ? "not available: Inter instead" : "";
  for (const face of faces) h.line(`inline ImFont* ${face.ident} = nullptr; // ${comment(face.label)}${note(face) ? `: ${note(face)}` : ""}`);
  h.line(`inline ImFont* ${fallbackIdent} = nullptr; // Inter, for characters the design fonts lack`);
  h.line().line("// Loads every font into ImGui's atlas. Call once after ImGui::CreateContext().").line("void load();").line().line("} // namespace fonts");

  const s = new Writer().line('#include "ui/theme/fonts.h"').line().line('#include "ff/text.h"').line('#include "ui/assets/assets.h"').line().line("namespace fonts {").line();
  const kerned = faces.filter((x) => x.kerning.length);
  s.line("namespace {").line();
  if (kerned.length) {
    s.line("// The kerning Figma applied between the letter pairs the design uses, in em");
    s.line("// (ImGui lays text out without kerning). Sorted by left, then right character.");
    for (const face of kerned) {
      s.line(`const ff::KernPair ${face.ident}_kerning[] = {`);
      const hex = (cp: number) => `0x${cp.toString(16).padStart(4, "0")}`;
      for (let i = 0; i < face.kerning.length; i += 4)
        s.line(`    ${face.kerning.slice(i, i + 4).map(([l, r, em]) => `{ ${hex(l)}, ${hex(r)}, ${f(em, 5)} }`).join(", ")},`);
      s.line("};");
    }
    s.line();
  }
  s.line("// A font file compiled in (src/ui/assets/fonts.cpp).");
  s.open("ff::FontSource file(const ff::Bytes& bytes, float em_scale, const char* name, const ff::KernPair* kerning = nullptr, int kerning_count = 0)");
  s.line("return { .data = bytes.data, .size = bytes.size, .em_scale = em_scale, .name = name, .kerning = kerning, .kerning_count = kerning_count };");
  s.close();
  s.line().line("} // namespace").line();
  s.open("void load()");
  s.line(`${fallbackIdent} = ff::add_font(file(${bytesOf(fallbackIdent)}, 0.f, "Inter"));`);
  for (const face of faces) {
    if (face.source === "design")
      s.line(`// ${comment(face.label)}: the characters the design draws come from the outlines Figma saved,`).line(`// identical to the design${face.full ? "; the complete font covers any others" : ""}.`);
    const kerning = face.kerning.length ? `, ${face.ident}_kerning, IM_COUNTOF(${face.ident}_kerning)` : "";
    s.line(`${face.ident} = ff::add_font(file(${bytesOf(face.ident)}, ${f(face.emScale, 5)}, ${str(face.label)}${kerning}));`);
    if (face.full) s.line(`ff::add_font(file(${bytesOf(`${face.ident}_full`)}, ${f(face.full.emScale, 5)}, ${str(`${face.label} (complete)`)}), ${face.ident});`);
    s.line(`ff::add_font(file(${bytesOf(fallbackIdent)}, 0.f, "Inter (fallback)"), ${face.ident});`);
  }
  s.close().line().line("} // namespace fonts");
  return { header: h.toString(), source: s.toString() };
}

/** src/ui/assets/images.h and images.cpp: the images (`data`: their byte arrays), and the table registering every image and icon. */
export function emitImages(assets: ImageAssetOut[], bytesOf: (ident: string) => string, data: string): { header: string; source: string } {
  const h = new Writer()
    .line("// Images and baked artwork (vectors, blurs, masks) the design uses.")
    .line("#pragma once")
    .line()
    .line("namespace images {")
    .line()
    .line("enum Id : int");
  h.line("{");
  for (const a of assets) h.line(`    ${a.ident}, // ${a.width}x${a.height}${a.mask ? ", white: tinted when drawn" : ""}, ${comment(a.reason)}`);
  h.line("    count,");
  h.line("};").line().line("// Makes the images available to ff::draw. Call once at startup.").line("void register_all();").line().line("} // namespace images");

  // images.cpp is a data file: like the rest of the generated code, it carries no comments.
  const s = new Writer()
    .line('#include "ui/assets/images.h"')
    .line()
    .line('#include "ff/image.h"')
    .line('#include "ui/assets/assets.h"')
    .line();
  if (data) s.raw(data);
  s.line("namespace images {").line();
  if (!assets.length) {
    s.open("void register_all()").line("ff::register_images(nullptr, 0);").close();
  } else {
    s.line("namespace {").line();
    s.line("struct Entry").line("{").line("    const ff::Bytes* bytes;").line("    int width;").line("    int height;").line("};").line();
    s.line("constexpr Entry entries[count] = {");
    for (const a of assets) s.line(`    { &assets::${bytesOf(a.ident)}, ${a.width}, ${a.height} },`);
    s.line("};").line();
    s.line("ff::ImageAsset table[count];").line().line("}").line();
    s.open("void register_all()");
    s.line("for (int i = 0; i < count; i++)");
    s.line("    table[i] = { entries[i].bytes->data, entries[i].bytes->size, entries[i].width, entries[i].height };");
    s.line("ff::register_images(table, count);");
    s.close();
  }
  s.line().line("}");
  return { header: h.toString(), source: s.toString() };
}

export { pascal };
