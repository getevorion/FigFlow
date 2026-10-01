/**
 * The generated app: screens, popups and toasts as their own files, one
 * widget call per control (styled from the design), app::State holding every
 * control's value, actions.cpp with what each control does (filled in from
 * the design, yours to change), and the navigation that ties them together.
 */
import type { DesignNode, Rect, RGBA, SolidPaint } from "../model/types";
import type { Flow, FlowPopup, FlowScreen, FlowToast } from "../semantic/flow";
import type { NavGroup, PressAction, Widget } from "../semantic/types";
import { type ComponentOp, planComponents } from "./components";
import type { BoxOp, CheckControl, Control, ControlOp, RasterOp, ScreenOp, TextOp, ToggleControl } from "./controls";
import type { Scene } from "../semantic/scene";
import { stateFromName } from "../semantic/tags";
import { NameScope, Writer, cleanLayerName, comment, f, str, snake } from "./cpp";
import { type OpContext, type SharedStyleName, type Theme, WIDGET_HEADERS, writeStaticOp } from "./emit";
import { contentOn, disabledBox, emptyBox, fillAlpha, flipBox, mainColor, stateBox, withAlpha } from "./looks";
import type { Op, PlanBox, TextSegment } from "./plan";

export type ScreenUnit = { screen: FlowScreen; ops: ScreenOp[]; size: { x: number; y: number } };
export type PopupUnit = {
  popup: FlowPopup;
  ops: ScreenOp[];
  /** Where the popup's coordinates start on the screen (Figma overlay frames are placed; others share the screen's). */
  offset: { x: number; y: number };
  size: { x: number; y: number };
  panel: Rect;
  backdrop: Set<string>;
  dim: PlanBox | null;
  closeOnOutside: boolean;
};
export type ToastUnit = { toast: FlowToast; ops: Op[]; rect: Rect };

export type AppInput = {
  name: string;
  flow: Flow;
  screens: ScreenUnit[];
  popups: PopupUnit[];
  toasts: ToastUnit[];
  theme: Theme;
  assetIdent: (rasterId: string) => string;
  assetIsMask: (rasterId: string) => boolean;
  /** Whether the start screen is dark (derived hover looks lighten on dark, darken on light). */
  dark: boolean;
  accent: RGBA;
};

export type AppFiles = { path: string; contents: string }[];

/** What a screen or popup draws: layers, controls, and calls to components (components.ts). */
type UnitOp = ScreenOp | ComponentOp;

/** A control as the generated app draws it: for tools that show the project (the converter's Elements tab and preview). */
export type AppElement = {
  /** The screen or popup that draws it, by its identifier in the generated code. */
  unit: { kind: "screen" | "popup"; ident: string; name: string };
  kind: Control["kind"] | "nav";
  /** The control's name in the design, e.g. `"Login"`, or "Unnamed button". */
  name: string;
  /** Where it is in the unit's frame, in design pixels. */
  rect: Rect;
  /** The app::State field holding its value, if it has one. */
  state?: string;
  /** The actions:: function it calls, if it calls one. */
  action?: string;
  /** What the design says it does, e.g. `goes to "Home"`. */
  does?: string;
  /** The generated file that draws it, and the line of its widget call there. */
  file: string;
  call: string;
  disabled: boolean;
};

type StateField = { decl: string; note: string; group: string };
type Action = { name: string; what: string; places: string[]; params: string; body: string[] };
/** Where a control is written: its screen, its popup, and the section (top-level layer) whose function holds it. */
type Ctx = { screen: string; popup: PopupUnit | null; section?: string };

/** One nav across the screens showing it (a sidebar, a tab bar): one state field, one action. */
type NavState = {
  axis: NavGroup["axis"];
  /** Its items' labels ("" for icon items), to know it on another screen. */
  labels: string;
  /** Its centre, to tell apart two navs with the same items. */
  at: { x: number; y: number };
  field: string;
  action: string;
  count: number;
  pages: Map<number, Set<string>>;
  gos: Map<number, PressAction[]>;
  screens: Set<string>;
};

const GENERIC_NAME = /^(vector|group|frame|rectangle|rect|ellipse|union|subtract|intersect|exclude|line|polygon|star|image|instance|component|layer|shape|path|icon|button|btn|container|auto layout|bg|background)\s*\d*$/i;

/** The headers generated UI files may include, and what a file uses when it needs one. */
const HEADER_USE: Array<[string, RegExp]> = [
  ["app/actions.h", /\bactions::/],
  ["app/navigation.h", /\bapp::(go|switch_to|back|current_screen|open_popup|close_popup|is_open|notify|open_url|Screen|Popup|Toast)\b/],
  ["app/state.h", /\bapp::(State|state|\w+_items)\b/],
  ["ff/draw.h", /\bff::draw::/],
  ["ff/flow.h", /\bff::(clicked_outside|start_screen|Screens|Popups|Toasts?)\b/],
  ["ff/layout.h", /\bff::(Frame|begin_frame|end_frame|place|push_clip|pop_clip|Stack|begin_stack|next|end_stack)\b/],
  ["ff/text.h", /\bff::(text|text_in|text_width|icon)\(/],
  ["ui/assets/images.h", /\bimages::/],
  ["ui/theme/palette.h", /\bpalette::/],
  ["ui/theme/styles.h", /\bstyles::/],
];

/**
 * Drops the includes of those headers a source file doesn't use (a screen with no images needs no
 * images.h), and sorts each block of includes.
 */
function pruneIncludes(source: string): string {
  let out = source;
  for (const [header, use] of HEADER_USE) {
    const line = `#include "${header}"\n`;
    if (out.includes(line) && !use.test(out.replace(line, ""))) out = out.replace(line, "");
  }
  const lines = out.split("\n");
  for (let i = 0; i < lines.length; ) {
    if (!lines[i].startsWith('#include "')) {
      i++;
      continue;
    }
    let j = i;
    while (j < lines.length && lines[j].startsWith('#include "')) j++;
    lines.splice(i, j - i, ...lines.slice(i, j).sort());
    i = j;
  }
  return lines.join("\n");
}

function textColor(op: TextOp): RGBA | null {
  const p = op.segments[0]?.run.fills.find((x) => x.visible && x.type === "SOLID");
  return p && p.type === "SOLID" ? withAlpha(p.color, p.color.a * p.opacity) : null;
}

function withTextColor(seg: TextSegment, color: RGBA): TextSegment {
  const fill: SolidPaint = { type: "SOLID", color: withAlpha(color, 1), opacity: color.a, visible: true, blendMode: "NORMAL" };
  return { ...seg, run: { ...seg.run, fills: [fill] } };
}

function knobBox(op: BoxOp): PlanBox {
  // An ellipse knob draws as a box with full radii.
  if (!op.ellipse) return op.box;
  const r = Math.min(op.rect.w, op.rect.h) / 2;
  return { ...op.box, radii: [r, r, r, r] };
}

function accentStroke(b: PlanBox, accent: RGBA): PlanBox {
  return { ...b, stroke: { color: withAlpha(accent, 1), weight: Math.max(1, b.stroke?.weight ?? 1), align: "inside", opacity: 1 } };
}

function imguiKey(text: string): string {
  // 'Key "Enter"' names the key in quotes; spaces and brackets don't matter ("Mouse 1", "[F5]").
  const quoted = /["“'«]([^"”'»]+)["”'»]/.exec(text);
  const t = (quoted ? quoted[1] : text).replace(/[[\]\s]/g, "").toUpperCase();
  const named: Record<string, string> = {
    INS: "Insert", INSERT: "Insert", DEL: "Delete", DELETE: "Delete", HOME: "Home", END: "End", PGUP: "PageUp", PAGEUP: "PageUp", PGDN: "PageDown", PGDOWN: "PageDown", PAGEDOWN: "PageDown",
    SHIFT: "LeftShift", LSHIFT: "LeftShift", RSHIFT: "RightShift", CTRL: "LeftCtrl", LCTRL: "LeftCtrl", RCTRL: "RightCtrl", ALT: "LeftAlt", LALT: "LeftAlt", RALT: "RightAlt",
    TAB: "Tab", CAPS: "CapsLock", CAPSLOCK: "CapsLock", SPACE: "Space", ESC: "Escape", ESCAPE: "Escape", ENTER: "Enter", RETURN: "Enter", BACKSPACE: "Backspace",
    UP: "UpArrow", DOWN: "DownArrow", LEFT: "LeftArrow", RIGHT: "RightArrow",
    LMB: "MouseLeft", M1: "MouseLeft", MB1: "MouseLeft", MOUSE1: "MouseLeft",
    RMB: "MouseRight", M2: "MouseRight", MB2: "MouseRight", MOUSE2: "MouseRight",
    MMB: "MouseMiddle", M3: "MouseMiddle", MB3: "MouseMiddle", MOUSE3: "MouseMiddle",
    M4: "MouseX1", MB4: "MouseX1", MOUSE4: "MouseX1", X1: "MouseX1", M5: "MouseX2", MB5: "MouseX2", MOUSE5: "MouseX2", X2: "MouseX2",
  };
  if (named[t]) return `ImGuiKey_${named[t]}`;
  if (/^F([1-9]|1\d|2[0-4])$/.test(t)) return `ImGuiKey_${t}`;
  const num = /^NUM(\d)$/.exec(t);
  if (num) return `ImGuiKey_Keypad${num[1]}`;
  if (/^[A-Z0-9]$/.test(t)) return `ImGuiKey_${t}`;
  return "ImGuiKey_None";
}

/**
 * Values keyed by what a control is and matched by where it is, with a little slack: the same
 * control on several screens (a page and its states, a shared sidebar) is often a pixel or
 * two apart, and position buckets split such pairs at their edges.
 */
class ByPlace<T> {
  private readonly map = new Map<string, Array<{ rect: Rect; value: T }>>();

  get(key: string, rect: Rect, slack = 2): T | undefined {
    const near = (a: Rect) => Math.abs(a.x - rect.x) <= slack && Math.abs(a.y - rect.y) <= slack && Math.abs(a.w - rect.w) <= slack && Math.abs(a.h - rect.h) <= slack;
    return this.map.get(key)?.find((e) => near(e.rect))?.value;
  }

  set(key: string, rect: Rect, value: T) {
    const list = this.map.get(key);
    if (list) list.push({ rect, value });
    else this.map.set(key, [{ rect, value }]);
  }
}

/** What a control is (kind, label, designed value) and where: see ByPlace. */
type Place = { key: string; rect: Rect };

/** A screen's top-level layer: its function's name and body. */
type SectionPlan = { name: string; base: string; note: string; ops: UnitOp[]; body: string };
/** A screen before it's written: its sections, and in Figma's order, its sections and the layers drawn directly. */
type ScreenPlan = { u: ScreenUnit; ident: string; sections: SectionPlan[]; order: Array<{ section: SectionPlan } | { ops: UnitOp[] }>; inline: Map<UnitOp[], string>; direct: UnitOp[] };
/** A top-level layer several screens draw the same way, written once as components::<name>. */
type SharedPart = { name: string; note: string; body: string; ops: UnitOp[]; screens: string[] };

/** The widget kinds' files in src/ui/components/ (a shared part can't take their names). */
const WIDGET_KINDS = ["button", "toggle", "checkbox", "slider", "text_field", "combo", "keybind", "look"];

export class AppEmitter {
  private readonly screenIdent = new Map<string, string>();
  private readonly popupIdent = new Map<string, string>();
  private readonly toastIdent = new Map<string, string>();
  private readonly actionNames = new NameScope(["close_window", "minimize_window", "maximize_window"]);
  private readonly stateNames = new NameScope(["state"]);
  /** The "##id" parts of widget labels: unique per control, apart from the state's field names. */
  private readonly idNames = new NameScope();
  /** Each control's section (the top-level layer whose function draws it), by widget. */
  private readonly sectionOf = new Map<Widget, string>();
  /** Field names several controls would take: those are named with their section too. */
  private readonly sharedBases = new Set<string>();
  private readonly fields: StateField[] = [];
  private readonly extras: string[] = []; // state.h additions after the struct (combo items)
  private readonly actions: Action[] = [];
  private readonly windowActions = new Set<"close" | "minimize" | "maximize">();
  private readonly navs = new Map<string, NavState>();
  private readonly navOfGroup = new Map<NavGroup, NavState>();
  /** State fields, actions and widget ids by the control they belong to (see placeOf). */
  private readonly fieldByPlace = new ByPlace<string>();
  private readonly actionByPlace = new ByPlace<Action>();
  private readonly idByPlace = new ByPlace<string>();
  /** A radio's group (the field holding the chosen option), or its own on/off field when it stands alone. */
  private readonly radioGroups = new Map<Widget, { field: string; index: number } | { field: string; alone: true }>();
  private readonly usedWidgets = new Set<string>();
  /** Controls per widget, to find a nav's idle and selected items. */
  private readonly controlOf = new Map<Widget, Control>();
  private readonly sceneOf = new Map<Widget, Scene>();
  /** Every control written, in drawing order (filled by emit()). */
  readonly elements: AppElement[] = [];
  /** Each screen's and popup's ops with its components' instances as calls (filled by emit()). */
  private readonly unitOps = new Map<ScreenUnit | PopupUnit, UnitOp[]>();
  /** The component files written (filled by emit()). */
  componentFiles = 0;
  /** Top-level layers several screens share, written once in src/ui/components/. */
  sharedParts = 0;

  constructor(private readonly input: AppInput) {
    const screens = new NameScope(["count"]);
    for (const u of input.screens) this.screenIdent.set(u.screen.id, screens.take(snake(u.screen.name, "screen")));
    const popups = new NameScope(["count"]);
    for (const u of input.popups) this.popupIdent.set(u.popup.popup.id, popups.take(snake(u.popup.popup.name, "popup")));
    const toasts = new NameScope(["count"]);
    for (const u of input.toasts) this.toastIdent.set(u.toast.toast.id, toasts.take(snake(u.toast.toast.name, "toast")));
    const own = (ops: ScreenOp[], scene: Scene) => {
      for (const op of ops) {
        if (op.kind !== "control") continue;
        this.controlOf.set(op.control.widget, op.control);
        this.sceneOf.set(op.control.widget, scene);
      }
    };
    for (const u of input.screens) own(u.ops, u.screen.scene);
    for (const u of input.popups) own(u.ops, u.popup.scene);
  }

  private get theme() {
    return this.input.theme;
  }

  private opCtx(frame: string, section?: string): OpContext {
    return { theme: this.theme, assetIdent: this.input.assetIdent, assetIsMask: this.input.assetIsMask, frame, section };
  }

  // --- naming ------------------------------------------------------------------

  /** The "##id" of a control: the same control keeps it on every screen showing it. */
  private idFor(c: Control, base: string): string {
    const key = `${c.kind}|${c.widget.label?.text ?? ""}`;
    const known = this.idByPlace.get(key, c.rect);
    if (known) return known;
    const id = this.idNames.take(base);
    this.idByPlace.set(key, c.rect, id);
    return id;
  }

  /** The name a control's state field starts from (see addField). */
  private fieldBase(c: Control): string {
    const base = this.baseName(c);
    if (c.kind === "text_field" && !c.widget.label?.text?.trim()) return c.placeholder?.segments[0]?.text ?? base;
    if (c.kind === "keybind") return /(^|_)(key|keys|bind|hotkey|keybind|shortcut)$/.test(base) ? base : `${base}_key`;
    return base;
  }

  /**
   * How a look several differently named controls share gets named: after their layer ("Input" →
   * input_field) when they agree on one, else what they are ("text_field").
   */
  private styleNaming(c: Control, noun: string, suffix: string): SharedStyleName {
    const layer = c.widget.surface?.name ? cleanLayerName(c.widget.surface.name) : "";
    if (!layer || GENERIC_NAME.test(layer)) return { shared: noun, noun };
    const own = snake(layer, noun);
    return { shared: own.split("_").includes(suffix) ? own : snake(`${layer} ${suffix}`, noun), noun };
  }

  private baseName(c: Control): string {
    const w = c.widget;
    const label = w.label?.text?.trim();
    if (label) return snake(label, w.kind);
    const layer = [w.icon, ...w.nodes, w.surface].map((n) => (n?.name ? cleanLayerName(n.name) : "")).find((name) => name && !GENERIC_NAME.test(name));
    if (layer) return snake(layer, w.kind);
    if (c.kind === "button" && c.nav) return "nav_item";
    return w.kind === "icon_button" ? "icon_button" : w.kind;
  }

  // --- style pieces ------------------------------------------------------------

  /** A look inside a control's style, written in place. */
  private box(b: PlanBox, name: string): string {
    void name;
    return this.theme.boxInit(b, this.input.assetIdent);
  }

  private labelInit(op: TextOp, rect: Rect): string {
    const seg = op.segments[0];
    const ts = this.theme.text(seg, op.node.styleNames?.text);
    const parts = [`.style = &${ts}`, `.pos = { ${f(op.rect.x - rect.x)}, ${f(op.rect.y - rect.y)} }`, `.size = { ${f(op.rect.w)}, ${f(op.rect.h)} }`, `.baseline = ${f(seg.y - op.rect.y)}`, `.align = ff::Align::${op.align}`];
    if (op.truncate) parts.push(".clip = true");
    return `{ ${parts.join(", ")} }`;
  }

  private iconInit(op: RasterOp, rect: Rect): string {
    const r = op.raster.rect;
    const tint = this.input.assetIsMask(op.raster.id) && op.raster.tint ? this.theme.color(op.raster.tint, "icon") : "IM_COL32_WHITE";
    return `{ images::${this.input.assetIdent(op.raster.id)}, { ${f(r.x - rect.x)}, ${f(r.y - rect.y)} }, { ${f(r.w)}, ${f(r.h)} }, ${tint} }`;
  }

  private iconTint(op: RasterOp | null): RGBA | null {
    return op && this.input.assetIsMask(op.raster.id) && op.raster.tint ? op.raster.tint : null;
  }

  private look(surface: string, label?: RGBA | null, icon?: RGBA | null, plate?: RGBA | null): string {
    const parts = [`.surface = ${surface}`];
    if (label) parts.push(`.label = ${this.theme.color(label, "text")}`);
    if (icon) parts.push(`.icon = ${this.theme.color(icon, "icon")}`);
    if (plate) parts.push(`.plate = ${this.theme.color(plate, "fill")}`);
    return `{ ${parts.join(", ")} }`;
  }

  // --- controls ------------------------------------------------------------------

  /** Whether the design shows the control disabled (its layer, or a component variant above it, says so). */
  private isDisabled(c: Control): boolean {
    const scene = this.sceneOf.get(c.widget);
    const node = c.widget.surface ?? c.widget.nodes[0];
    if (!scene || !node) return false;
    for (let e = scene.byId.get(node.id) ?? null; e; e = e.parent) {
      if (stateFromName(e.node.name) === "disabled") return true;
      if (e.node.props && Object.entries(e.node.props).some(([k, v]) => /state/i.test(k) && typeof v === "string" && /disabled/i.test(v))) return true;
      if (e.node.variant && Object.entries(e.node.variant).some(([k, v]) => /state/i.test(k) && /disabled/i.test(v))) return true;
    }
    return false;
  }

  /** A control of the same kind and size showing the other state: its looks beat derived ones. */
  private twinOf<T extends ToggleControl | CheckControl>(c: T): T | null {
    const size = (x: ToggleControl | CheckControl) => (x.kind === "toggle" ? x.track.rect : x.box.rect);
    const s = size(c);
    const disabled = this.isDisabled(c);
    for (const o of this.controlOf.values()) {
      if (o === c || o.kind !== c.kind) continue;
      const t = o as T;
      if (t.on === c.on || this.isDisabled(t) !== disabled) continue;
      const so = size(t);
      if (Math.abs(so.w - s.w) <= 2 && Math.abs(so.h - s.h) <= 2) return t;
    }
    return null;
  }

  /** Writes one control's widget call; `frame` is the ff::Frame variable it's placed in. */
  private writeControl(w: Writer, c: Control, frame: string, ctx: Ctx) {
    const mark = w.size;
    const disabled = this.isDisabled(c);
    if (disabled) {
      w.line("// Disabled in the design (remove BeginDisabled/EndDisabled to enable it); it's drawn dimmed already.");
      w.line("ImGui::PushStyleVar(ImGuiStyleVar_DisabledAlpha, 1.f);");
      w.line("ImGui::BeginDisabled();");
    }
    this.writeControlBody(w, c, frame, ctx);
    if (disabled) {
      w.line("ImGui::EndDisabled();");
      w.line("ImGui::PopStyleVar();");
    }
    this.noteElement(c, w.since(mark), ctx, disabled);
  }

  /** Records a control just written, from its code: the state it binds and the action it calls. */
  private noteElement(c: Control, code: string[], ctx: Ctx, disabled: boolean) {
    const text = code.join("\n");
    const unit = ctx.popup
      ? { kind: "popup" as const, ident: this.popupIdent.get(ctx.popup.popup.popup.id)!, name: ctx.popup.popup.popup.name }
      : { kind: "screen" as const, ident: this.screenIdent.get(ctx.screen)!, name: this.screenName(ctx.screen) };
    const state = /&s\.(\w+)/.exec(text)?.[1] ?? /\bs\.(\w+) ==/.exec(text)?.[1];
    const action = /actions::(\w+)\(/.exec(text)?.[1];
    this.elements.push({
      unit,
      kind: c.kind === "button" && c.nav ? "nav" : c.kind,
      name: this.displayName(c) ?? `Unnamed ${c.widget.kind.replace("_", " ")}`,
      rect: c.rect,
      ...(state ? { state } : {}),
      ...(action ? { action } : {}),
      ...(c.widget.onPress?.length ? { does: this.describe(c.widget.onPress) } : {}),
      file: `src/ui/${unit.kind === "popup" ? "popups" : "screens"}/${unit.ident}.cpp`,
      call: code.find((l) => /\bui::\w+\(/.test(l))?.trim() ?? "",
      disabled,
    });
  }

  private writeControlBody(w: Writer, c: Control, frame: string, ctx: Ctx) {
    const { dark, accent } = this.input;
    const base = this.baseName(c);
    const r = c.rect;
    const size = `{ ${f(r.w)}, ${f(r.h)} }`;
    const place = `ff::place(${frame}, { ${f(r.x)}, ${f(r.y)} });`;
    const labelText = (op: TextOp | null) => (op ? op.segments[0].text : "");
    const idLabel = (text: string, name: string) => str(`${text}##${name}`);
    const what = comment(this.displayName(c) ?? `Unnamed ${c.widget.kind.replace("_", " ")}`);

    switch (c.kind) {
      case "hotspot": {
        if (c.nav) {
          // A nav item whose artwork is baked: the design's picture of it, and the nav's action.
          const nav = this.navFor(c.nav.group, ctx.screen);
          const i = c.nav.index;
          this.noteNavGo(nav, c);
          w.line(`// ${what}: item ${i + 1} of the ${nav.field} nav (clickable artwork)`);
          w.line(place);
          w.line(`if (ui::hotspot(${str(`##${nav.field}_${i}`)}, ${size}))`);
          w.line(`    actions::${nav.action}(${i});`);
          this.usedWidgets.add("ui::ButtonStyle");
          return;
        }
        const name = this.actionFor(c, ctx);
        w.line(`// ${what}: clickable artwork`);
        w.line(place);
        w.line(`if (ui::hotspot(${str(`##${name}`)}, ${size}))`);
        w.line(`    actions::${name}();`);
        this.usedWidgets.add("ui::ButtonStyle");
        return;
      }
      case "button": {
        this.usedWidgets.add("ui::ButtonStyle");
        const ink = (c.label ? textColor(c.label) : null) ?? this.iconTint(c.icon);
        // Every state's look keeps the plate's shape: a round plate's hover is round too.
        const radii: PlanBox["radii"] = c.surface?.ellipse ? knobBox(c.surface).radii : (c.surface?.box.radii ?? [0, 0, 0, 0]);
        let idle = c.surface ? { ...c.surface.box, radii } : emptyBox(radii);
        let selected: PlanBox | null = null;
        let idleLabel: RGBA | null = null;
        let selLabel: RGBA | null = null;
        let idleIcon: RGBA | null = null;
        let selIcon: RGBA | null = null;
        // A tinted plate (a hexagon baked white): its colour per state.
        let idlePlate: RGBA | null = c.plate?.raster.tint ?? null;
        let selPlate: RGBA | null = null;
        if (c.nav) {
          // Idle and selected looks come from the nav's own items; a page showing the nav with
          // nothing selected (a hub) takes the selected look from a frame where an item is.
          const group = c.nav.group;
          const buttons = (g: NavGroup) => g.items.map((it) => this.controlOf.get(it)).filter((x): x is Extract<Control, { kind: "button" }> => !!x && x.kind === "button");
          const items = buttons(group);
          const source = group.selected < 0 && group.template ? group.template : group;
          const sel = buttons(source).find((x) => x.nav?.index === source.selected);
          const idleItem = items.find((x) => x.nav?.index !== group.selected);
          selected = sel?.surface?.box ?? emptyBox(radii);
          idle = idleItem?.surface?.box ?? emptyBox(selected.radii);
          idleLabel = idleItem?.label ? textColor(idleItem.label) : null;
          selLabel = sel?.label ? textColor(sel.label) : null;
          idleIcon = this.iconTint(idleItem?.icon ?? null);
          selIcon = this.iconTint(sel?.icon ?? null);
          idlePlate = idleItem?.plate?.raster.tint ?? idlePlate;
          selPlate = sel?.plate?.raster.tint ?? null;
        }
        const toward = (c: RGBA, to: RGBA, t: number): RGBA => ({ ...mixRgba(c, { ...to, a: c.a }, t), a: c.a });
        const white = { r: 1, g: 1, b: 1, a: 1 };
        const black = { r: 0, g: 0, b: 0, a: 1 };
        const hoverPlate = idlePlate ? (selPlate ? mixRgba(idlePlate, selPlate, 0.5) : toward(idlePlate, dark ? white : black, dark ? 0.12 : 0.06)) : null;
        const pressPlate = idlePlate ? toward(idlePlate, black, 0.1) : null;
        const wash = selected ? mainColor(selected) ?? ink : ink;
        const hovered = stateBox(idle, 1, wash, dark);
        const pressed = stateBox(idle, -1, wash, dark);
        const lines = [
          `.idle = ${this.look(this.box(idle, `${base} idle`), idleLabel, idleIcon, idlePlate)},`,
          `.hovered = ${this.look(this.box(hovered, `${base} hovered`), idleLabel && selLabel ? mixRgba(idleLabel, selLabel, 0.5) : idleLabel, idleIcon && selIcon ? mixRgba(idleIcon, selIcon, 0.5) : idleIcon, hoverPlate)},`,
          `.pressed = ${this.look(this.box(pressed, `${base} pressed`), idleLabel, idleIcon, pressPlate)},`,
        ];
        if (selected) lines.push(`.selected = ${this.look(this.box(selected, `${base} selected`), selLabel, selIcon, selPlate ?? idlePlate)},`);
        // A button the design shows disabled already looks it: keep that look.
        lines.push(
          `.disabled = ${this.isDisabled(c) ? this.look(this.box(idle, `${base} idle`), idleLabel, idleIcon, idlePlate) : this.look(this.box(disabledBox(idle), `${base} disabled`), null, null, idlePlate ? { ...idlePlate, a: idlePlate.a * 0.5 } : null)},`,
        );
        if (c.label) lines.push(`.label = ${this.labelInit(c.label, r)},`);
        // A plate smaller than the control (its caption underneath): the surface keeps its place.
        const plate = c.surface?.rect;
        if (plate && (Math.abs(plate.x - r.x) > 0.5 || Math.abs(plate.y - r.y) > 0.5 || Math.abs(plate.w - r.w) > 0.5 || Math.abs(plate.h - r.h) > 0.5))
          lines.push(`.surface_pos = { ${f(plate.x - r.x)}, ${f(plate.y - r.y)} },`, `.surface_size = { ${f(plate.w)}, ${f(plate.h)} },`);
        if (c.plate) lines.push(`.plate = ${this.iconInit(c.plate, r)},`);
        const kindNote = c.nav ? "nav item" : c.widget.kind === "window_button" ? "window button" : c.label ? "button" : "icon button";
        const style = this.theme.control("ui::ButtonStyle", snake(`${c.nav ? "nav item" : base}`, "button"), lines.join("\n"), `${kindNote} ${c.nav ? "" : what}`.trim(), this.styleNaming(c, c.nav ? "nav_item" : "button", c.nav ? "item" : "button"));
        const icon = c.icon ? `, ui::Icon${this.iconInit(c.icon, r)}` : "";
        const label = idLabel(labelText(c.label), this.idFor(c, base));

        if (c.nav) {
          const nav = this.navFor(c.nav.group, ctx.screen);
          const i = c.nav.index;
          this.noteNavGo(nav, c);
          w.line(`// ${what}: item ${i + 1} of the ${nav.field} nav`);
          w.line(place);
          w.line(`if (ui::selectable(${label}, s.${nav.field} == ${i}, ${size}, ${style}${icon}))`);
          w.line(`    actions::${nav.action}(${i});`);
          return;
        }
        if (c.widget.kind === "window_button" && c.widget.action) {
          this.windowActions.add(c.widget.action);
          w.line(`// ${c.widget.action} window`);
          w.line(place);
          w.line(`if (ui::button(${label}, ${size}, ${style}${icon}))`);
          w.line(`    actions::${c.widget.action}_window();`);
          return;
        }
        const name = this.actionFor(c, ctx);
        w.line(`// ${what}${c.widget.onPress?.length ? `: ${this.describe(c.widget.onPress)}` : ""}`);
        w.line(place);
        w.line(`if (ui::button(${label}, ${size}, ${style}${icon}))`);
        w.line(`    actions::${name}();`);
        return;
      }
      case "toggle": {
        this.usedWidgets.add("ui::ToggleStyle");
        const tr = c.track.rect;
        const kn = c.knob.rect;
        const twin = this.twinOf(c);
        const drawnTrack = c.track.box;
        const otherTrack = twin ? twin.track.box : flipBox(drawnTrack, c.on, accent, dark);
        const [on, off] = c.on ? [drawnTrack, otherTrack] : [otherTrack, drawnTrack];
        // Where the knob sits in the other state: as the twin shows it, else mirrored across the track.
        const knobDrawn = { x: kn.x - r.x, y: kn.y - r.y };
        const knobOther = twin
          ? { x: tr.x + (twin.knob.rect.x - twin.track.rect.x) - r.x, y: tr.y + (twin.knob.rect.y - twin.track.rect.y) - r.y }
          : { x: tr.x + (tr.x + tr.w) - (kn.x + kn.w) - r.x, y: kn.y - r.y };
        const [kOn, kOff] = c.on ? [knobDrawn, knobOther] : [knobOther, knobDrawn];
        const lines = [
          `.track_pos = { ${f(tr.x - r.x)}, ${f(tr.y - r.y)} },`,
          `.track_size = { ${f(tr.w)}, ${f(tr.h)} },`,
          `.track_off = ${this.box(off, `${base} off`)},`,
          `.track_on = ${this.box(on, `${base} on`)},`,
          `.track_off_hovered = ${this.box(stateBox(off, 0.6, null, dark), `${base} off hovered`)},`,
          `.track_on_hovered = ${this.box(stateBox(on, 0.6, null, dark), `${base} on hovered`)},`,
          `.knob_size = { ${f(kn.w)}, ${f(kn.h)} },`,
          `.knob_off = { ${f(kOff.x)}, ${f(kOff.y)} },`,
          `.knob_on = { ${f(kOn.x)}, ${f(kOn.y)} },`,
        ];
        if (c.knob.kind === "box") {
          const drawnKnob = knobBox(c.knob);
          const otherKnob = twin && twin.knob.kind === "box" ? knobBox(twin.knob) : drawnKnob;
          const [kbOn, kbOff] = c.on ? [drawnKnob, otherKnob] : [otherKnob, drawnKnob];
          lines.push(`.knob_look_off = ${this.box(kbOff, `${base} knob off`)},`, `.knob_look_on = ${this.box(kbOn, `${base} knob on`)},`);
        } else {
          // Artwork knob: tinted per state when it's single-colour (baked white).
          const mask = this.input.assetIsMask(c.knob.raster.id);
          const white: RGBA = { r: 1, g: 1, b: 1, a: 1 };
          const drawnTint = mask ? this.iconTint(c.knob) ?? white : white;
          const otherTint = !mask ? white : twin && twin.knob.kind === "raster" ? this.iconTint(twin.knob) ?? drawnTint : contentOn(mainColor(otherTrack), dark);
          const [tOn, tOff] = c.on ? [drawnTint, otherTint] : [otherTint, drawnTint];
          lines.push(`.knob_image = images::${this.input.assetIdent(c.knob.raster.id)},`, `.knob_tint_off = ${this.theme.color(tOff, "knob")},`, `.knob_tint_on = ${this.theme.color(tOn, "knob")},`);
        }
        if (c.label) lines.push(`.label = ${this.labelInit(c.label, r)},`);
        const style = this.theme.control("ui::ToggleStyle", snake(`${base} switch`, "switch"), lines.join("\n"), `switch ${what}`, this.styleNaming(c, "toggle", "switch"));
        const field = this.addField(base, `bool ${"%"} = ${c.on};`, `switch ${what}`, ctx, this.placeOf(c));
        w.line(`// ${what} (switch)`);
        w.line(place);
        w.line(`ui::toggle(${idLabel(labelText(c.label), field)}, &s.${field}, ${size}, ${style});`);
        return;
      }
      case "checkbox":
      case "radio": {
        this.usedWidgets.add("ui::CheckboxStyle");
        const bx = c.box.rect;
        const twin = this.twinOf(c);
        const drawn = knobBox(c.box);
        const other = twin ? knobBox(twin.box) : flipBox(drawn, c.on, accent, dark);
        const [on, off] = c.on ? [drawn, other] : [other, drawn];
        const lines = [
          `.box_pos = { ${f(bx.x - r.x)}, ${f(bx.y - r.y)} },`,
          `.box_size = { ${f(bx.w)}, ${f(bx.h)} },`,
          `.off = ${this.box(off, `${base} off`)},`,
          `.on = ${this.box(on, `${base} on`)},`,
          `.off_hovered = ${this.box(stateBox(off, 0.6, null, dark), `${base} off hovered`)},`,
          `.on_hovered = ${this.box(stateBox(on, 0.6, null, dark), `${base} on hovered`)},`,
        ];
        // The mark: this control's own (when it's shown checked), else the checked twin's, moved onto this box.
        const markSource = c.mark ? { mark: c.mark, box: c.box.rect } : twin?.mark ? { mark: twin.mark, box: twin.box.rect } : null;
        if (markSource?.mark.kind === "raster") {
          const m = markSource.mark;
          const shifted: RasterOp = { ...m, raster: { ...m.raster, rect: { ...m.raster.rect, x: m.raster.rect.x - markSource.box.x + bx.x, y: m.raster.rect.y - markSource.box.y + bx.y } } };
          lines.push(`.mark = ${this.iconInit(shifted, r)},`);
        }
        const markColor = markSource?.mark.kind === "box" ? mainColor(markSource.mark.box) : contentOn(mainColor(on), dark);
        lines.push(`.mark_color = ${this.theme.color(markColor ?? contentOn(accent, dark), "mark")},`);
        if (c.kind === "radio") lines.push(".round = true,");
        // A radio's dot as the design draws it (its share of the box).
        if (c.kind === "radio" && markSource?.mark.kind === "box") lines.push(`.dot = ${f(Math.round((markSource.mark.rect.w / 2 / Math.min(markSource.box.w, markSource.box.h)) * 1000) / 1000)},`);
        if (c.label) lines.push(`.label = ${this.labelInit(c.label, r)},`);
        // Designs often colour the label with the state ("● Enable" in the accent, "○ Auto Fire" grey).
        const ownInk = c.label ? textColor(c.label) : null;
        const twinInk = twin?.label ? textColor(twin.label) : null;
        if (ownInk && twinInk && !sameRgba(ownInk, twinInk)) {
          const [onInk, offInk] = c.on ? [ownInk, twinInk] : [twinInk, ownInk];
          lines.push(`.label_on = ${this.theme.color(onInk, "text")},`, `.label_off = ${this.theme.color(offInk, "text")},`);
        }
        const style = this.theme.control("ui::CheckboxStyle", snake(`${base} ${c.kind}`, c.kind), lines.join("\n"), `${c.kind} ${what}`, this.styleNaming(c, c.kind, c.kind));
        if (c.kind === "radio") {
          const g = this.radioGroup(c.widget, ctx);
          if ("alone" in g) {
            w.line(`// ${what} (on/off option)`);
            w.line(place);
            w.line(`if (ui::radio(${idLabel(labelText(c.label), g.field)}, s.${g.field}, ${size}, ${style}))`);
            w.line(`    s.${g.field} = !s.${g.field};`);
            return;
          }
          w.line(`// ${what} (option ${g.index + 1})`);
          w.line(place);
          w.line(`if (ui::radio(${idLabel(labelText(c.label), `${g.field}_${g.index}`)}, s.${g.field} == ${g.index}, ${size}, ${style}))`);
          w.line(`    s.${g.field} = ${g.index};`);
          return;
        }
        const field = this.addField(base, `bool % = ${c.on};`, `checkbox ${what}`, ctx, this.placeOf(c));
        w.line(`// ${what} (checkbox)`);
        w.line(place);
        w.line(`ui::checkbox(${idLabel(labelText(c.label), field)}, &s.${field}, ${size}, ${style});`);
        return;
      }
      case "slider": {
        this.usedWidgets.add("ui::SliderStyle");
        // The bar spans the track and a fill that may start before it (the value runs along both).
        const x0 = Math.min(c.track.rect.x, c.fill?.rect.x ?? Infinity);
        const x1 = Math.max(c.track.rect.x + c.track.rect.w, c.fill ? c.fill.rect.x + c.fill.rect.w : -Infinity);
        const tr = { ...c.track.rect, x: x0, w: x1 - x0 };
        const lines = [`.track_pos = { ${f(tr.x - r.x)}, ${f(tr.y - r.y)} },`, `.track_size = { ${f(tr.w)}, ${f(tr.h)} },`, `.track = ${this.box(c.track.box, `${base} track`)},`];
        // The number the design shows ("3 ms"): the slider starts on it, formats it the same
        // way, and its range puts the thumb where the design draws it.
        const shown = c.shown?.segments[0]?.text.trim() ?? "";
        const num = /^([-−+]?)(\d+)(?:[.,](\d+))?\s*(.*)$/u.exec(shown);
        let range = { max: 100, start: Math.round(c.value * 1000) / 10, note: "0 to 100" };
        const valueLines: string[] = []; // go after the thumb's: designated initializers keep the struct's order
        if (c.shown && num) {
          const n = Number(`${num[1] === "-" || num[1] === "−" ? "-" : ""}${num[2]}.${num[3] ?? "0"}`);
          // Whatever follows the number ("3 ms" → " ms") follows it in the format too.
          const unit = shown.slice(num[1].length + num[2].length + (num[3] ? num[3].length + 1 : 0));
          valueLines.push(`.value = ${this.labelInit(c.shown, r)},`, `.format = ${str(`%.${num[3]?.length ?? 0}f${unit.replace(/%/g, "%%")}`)},`);
          if (n > 0 && c.value > 0.02) range = { max: Math.round((n / c.value) * 1000) / 1000, start: n, note: `the design shows ${shown}` };
          const thumbX = tr.x + tr.w * c.value;
          const box = c.shown.rect;
          if (Math.abs(box.x + box.w / 2 - thumbX) <= 16) valueLines.push(".value_follows = true,", `.value_at = ${f(c.value)},`);
        }
        if (c.fill) lines.push(".has_fill = true,", `.fill = ${this.box(c.fill.box, `${base} fill`)},`, `.fill_min = ${f(Math.min(tr.h, c.fill.rect.w))},`);
        if (c.thumb) {
          const tb = knobBox(c.thumb);
          lines.push(
            ".has_thumb = true,",
            `.thumb_size = { ${f(c.thumb.rect.w)}, ${f(c.thumb.rect.h)} },`,
            `.thumb = ${this.box(tb, `${base} thumb`)},`,
            `.thumb_hovered = ${this.box(stateBox(tb, 0.6, null, dark), `${base} thumb hovered`)},`,
            `.thumb_active = ${this.box(stateBox(tb, 1.2, null, dark), `${base} thumb active`)},`,
          );
          // A grip or dot on the thumb, placed from the thumb's centre, moves with it.
          const mark = c.thumbMark;
          if (mark?.kind === "box") {
            const cx = c.thumb.rect.x + c.thumb.rect.w / 2;
            const cy = c.thumb.rect.y + c.thumb.rect.h / 2;
            lines.push(".has_thumb_mark = true,", `.thumb_mark = ${this.box(mark.box, `${base} thumb mark`)},`, `.thumb_mark_pos = { ${f(mark.rect.x - cx)}, ${f(mark.rect.y - cy)} },`, `.thumb_mark_size = { ${f(mark.rect.w)}, ${f(mark.rect.h)} },`);
          } else if (mark?.kind === "raster") lines.push(`.thumb_icon = ${this.iconInit(mark, c.thumb.rect)},`);
        }
        lines.push(...valueLines);
        const style = this.theme.control("ui::SliderStyle", snake(`${base} slider`, "slider"), lines.join("\n"), `slider ${what}`, this.styleNaming(c, "slider", "slider"));
        const field = this.addField(base, `float % = ${f(range.start)}; // 0..${f(range.max)}`, `slider ${what}`, ctx, this.placeOf(c));
        w.line(`// ${what} (slider, ${range.note === "0 to 100" ? "0 to 100" : `0 to ${f(range.max)}: ${range.note}`})`);
        w.line(place);
        w.line(`ui::slider(${str(`##${field}`)}, &s.${field}, 0.f, ${f(range.max)}, ${size}, ${style});`);
        return;
      }
      case "text_field": {
        this.usedWidgets.add("ui::TextFieldStyle");
        const idle = c.surface.box;
        const ph = c.placeholder;
        const seg = ph?.segments[0];
        const phColor = ph ? textColor(ph) : null;
        const surfaceColor = mainColor(idle);
        const onDark = surfaceColor && fillAlpha(idle) > 0.5 ? contentOn(surfaceColor, dark).r > 0.5 : dark;
        const typed = phColor ? { ...mixRgba(phColor, onDark ? { r: 1, g: 1, b: 1, a: 1 } : { r: 0.05, g: 0.05, b: 0.05, a: 1 }, 0.65), a: 1 } : onDark ? { r: 1, g: 1, b: 1, a: 1 } : { r: 0.05, g: 0.05, b: 0.05, a: 1 };
        const lines = [`.idle = ${this.box(idle, `${base} field`)},`, `.hovered = ${this.box(stateBox(idle, 0.5, phColor, dark), `${base} field hovered`)},`, `.focused = ${this.box(accentStroke(idle, accent), `${base} field focused`)},`];
        if (seg && ph) {
          lines.push(`.text = &${this.theme.text(withTextColor(seg, typed), undefined)},`, `.placeholder = &${this.theme.text(seg, ph.node.styleNames?.text)},`);
          const iconLeft = c.icon && c.icon.raster.rect.x > seg.x ? c.icon.raster.rect.x : r.x + r.w - (seg.x - r.x);
          lines.push(`.text_left = ${f(seg.x - r.x)},`, `.text_right = ${f(Math.max(0, r.x + r.w - iconLeft + 4))},`, `.baseline = ${f(seg.y - r.y)},`);
        }
        lines.push(`.selection = ${this.theme.color(withAlpha(accent, 0.35), "selection")},`);
        if (c.icon) lines.push(`.icon = ${this.iconInit(c.icon, r)},`);
        const style = this.theme.control("ui::TextFieldStyle", snake(`${base} field`, "field"), lines.join("\n"), `text field ${what}`, this.styleNaming(c, "text_field", "field"));
        const field = this.addField(this.fieldBase(c), "char %[256] = \"\";", `text field ${what}`, ctx, this.placeOf(c));
        w.line(`// ${what} (text field)`);
        w.line(place);
        w.line(`ui::text_field(${str(`##${field}`)}, s.${field}, sizeof(s.${field}), ${size}, ${style}, ${ph ? str(ph.segments[0].text) : "nullptr"}${c.password ? ", ImGuiInputTextFlags_Password" : ""});`);
        return;
      }
      case "combo": {
        this.usedWidgets.add("ui::ComboStyle");
        const idle = c.surface.box;
        const main = mainColor(idle);
        const panelFill = main && main.a > 0.9 ? main : dark ? { r: 0.1, g: 0.11, b: 0.1, a: 1 } : { r: 1, g: 1, b: 1, a: 1 };
        const panel: PlanBox = {
          ...idle,
          fills: [{ kind: "solid", color: withAlpha(panelFill, 1), opacity: 1 }],
          shadows: [{ color: { r: 0, g: 0, b: 0, a: 0.35 }, offset: { x: 0, y: 8 }, blur: 24, spread: 0, inner: false, showBehind: false }],
        };
        const rr = Math.min(6, idle.radii[0]);
        const lines = [`.idle = ${this.box(idle, `${base} combo`)},`, `.hovered = ${this.box(stateBox(idle, 0.5, null, dark), `${base} combo hovered`)},`, `.open = ${this.box(accentStroke(idle, accent), `${base} combo open`)},`];
        if (c.value) lines.push(`.value = ${this.labelInit(c.value, r)},`);
        if (c.chevron) lines.push(`.chevron = ${this.iconInit(c.chevron, r)},`);
        lines.push(`.panel = ${this.box(panel, `${base} list`)},`);
        if (c.value) {
          lines.push(`.item = &${this.theme.text(c.value.segments[0], c.value.node.styleNames?.text)},`, `.item_height = ${f(Math.max(28, r.h - 8))},`, `.item_indent = ${f(Math.max(4, c.value.segments[0].x - r.x - 4))},`);
        }
        lines.push(
          `.item_hovered = ${this.box({ ...emptyBox([rr, rr, rr, rr]), fills: [{ kind: "solid", color: dark ? withAlpha({ r: 1, g: 1, b: 1, a: 1 }, 0.07) : withAlpha({ r: 0, g: 0, b: 0, a: 1 }, 0.06), opacity: 1 }] }, `${base} item hovered`)},`,
          `.item_selected = ${this.box({ ...emptyBox([rr, rr, rr, rr]), fills: [{ kind: "solid", color: withAlpha(accent, 0.16), opacity: 1 }] }, `${base} item selected`)},`,
          `.item_selected_text = ${this.theme.color(withAlpha(accent, 1), "accent")},`,
        );
        const style = this.theme.control("ui::ComboStyle", snake(`${base} combo`, "combo"), lines.join("\n"), `drop-down ${what}`, this.styleNaming(c, "combo", "combo"));
        const fresh = !this.fieldByPlace.get(this.placeOf(c).key, c.rect);
        const field = this.addField(base, "int % = 0;", `drop-down ${what}: index into %_items`, ctx, this.placeOf(c));
        const value = c.value ? c.value.segments[0].text : "Option 1";
        if (fresh) this.extras.push(`// The drop-down's items: the design shows ${str(value)}; add the rest.`, `inline const char* const ${field}_items[] = { ${str(value)} };`);
        w.line(`// ${what} (drop-down)`);
        w.line(place);
        w.line(`ui::combo(${str(`##${field}`)}, &s.${field}, app::${field}_items, IM_COUNTOF(app::${field}_items), ${size}, ${style});`);
        return;
      }
      case "keybind": {
        this.usedWidgets.add("ui::KeybindStyle");
        const idle = c.surface.box;
        const lines = [`.idle = ${this.box(idle, `${base} key`)},`, `.hovered = ${this.box(stateBox(idle, 0.5, null, dark), `${base} key hovered`)},`, `.waiting = ${this.box(accentStroke(idle, accent), `${base} key waiting`)},`];
        if (c.text) lines.push(`.text = ${this.labelInit(c.text, r)},`);
        lines.push(`.waiting_color = ${this.theme.color(withAlpha(accent, 1), "accent")},`);
        const key = imguiKey(c.key);
        if (/^none$/i.test(c.key)) lines.push(`.none_text = ${str(c.key)},`);
        // The designed key keeps the design's wording ("Mouse 1"); other keys show their short names.
        else if (key !== "ImGuiKey_None") lines.push(`.design_key = ${key},`, `.design_text = ${str(c.key)},`);
        const style = this.theme.control("ui::KeybindStyle", snake(`${base} keybind`, "keybind"), lines.join("\n"), `key bind ${what}`, this.styleNaming(c, "keybind", "keybind"));
        // Named after its caption ("Aim key"), with "key" added only when the caption doesn't say it.
        const field = this.addField(this.fieldBase(c), `ImGuiKey % = ${key};`, `key bind (designed as ${str(c.key)})`, ctx, this.placeOf(c));
        w.line(`// ${what} (key bind)`);
        w.line(place);
        w.line(`ui::keybind(${str(`##${field}`)}, &s.${field}, ${size}, ${style});`);
        return;
      }
    }
  }

  /** A state field; with `identity`, the one field of that control on every screen showing it. */
  private addField(base: string, decl: string, note: string, ctx: Ctx, place?: Place): string {
    const known = place ? this.fieldByPlace.get(place.key, place.rect) : undefined;
    if (known) return known;
    // Two controls with one name ("Box" in three panels): the section tells them apart before a number does.
    const plain = snake(base, "value");
    const qualified = ctx.section && (this.sharedBases.has(plain) || this.stateNames.has(plain)) ? snake(`${ctx.section} ${base}`, "value") : plain;
    const name = this.stateNames.take(this.stateNames.has(qualified) ? plain : qualified);
    this.fields.push({ decl: decl.split("%").join(name), note, group: ctx.popup ? `Popup "${ctx.popup.popup.popup.name}"` : `Screen "${this.screenName(ctx.screen)}"` });
    if (place) this.fieldByPlace.set(place.key, place.rect, name);
    return name;
  }

  private screenName(id: string): string {
    return this.input.screens.find((s) => s.screen.id === id)?.screen.name ?? id;
  }

  private radioGroup(w: Widget, ctx: Ctx): { field: string; index: number } | { field: string; alone: true } {
    const known = this.radioGroups.get(w);
    if (known) return known;
    // Radios form a group when they line up in a column (or a row) with no other control
    // between them. A group never shows two options chosen; a radio on its own (an option
    // drawn as a radio, like "(•) Enable") is on/off.
    const unit = ctx.popup ?? this.input.screens.find((s) => s.screen.id === ctx.screen)!;
    const controls = unit.ops.filter((o): o is ControlOp => o.kind === "control").map((o) => o.control.widget);
    const radios = controls.filter((x) => x.kind === "radio");
    const col = radios.filter((x) => Math.abs(x.rect.x - w.rect.x) <= 4).sort((a, b) => a.rect.y - b.rect.y);
    const row = radios.filter((x) => Math.abs(x.rect.y - w.rect.y) <= 4).sort((a, b) => a.rect.x - b.rect.x);
    const vertical = col.length >= row.length;
    const line = vertical ? col : row;
    const runs: Widget[][] = [];
    for (const x of line) {
      const run = runs[runs.length - 1];
      const prev = run?.[run.length - 1];
      const between = (o: Widget) =>
        o !== x &&
        o !== prev &&
        o.kind !== "radio" &&
        (vertical
          ? o.rect.y >= prev!.rect.y + prev!.rect.h - 1 && o.rect.y + o.rect.h <= x.rect.y + 1 && o.rect.x < x.rect.x + x.rect.w && o.rect.x + o.rect.w > x.rect.x
          : o.rect.x >= prev!.rect.x + prev!.rect.w - 1 && o.rect.x + o.rect.w <= x.rect.x + 1 && o.rect.y < x.rect.y + x.rect.h && o.rect.y + o.rect.h > x.rect.y);
      const gap = prev ? (vertical ? x.rect.y - (prev.rect.y + prev.rect.h) : x.rect.x - (prev.rect.x + prev.rect.w)) : 0;
      // Options of one choice sit in one panel: a different section starts another group.
      const sameSection = !!prev && this.sectionOf.get(prev) === this.sectionOf.get(x);
      if (prev && sameSection && !controls.some(between) && gap <= Math.max(120, (vertical ? x.rect.h : x.rect.w) * 6)) run.push(x);
      else runs.push([x]);
    }
    for (const run of runs) {
      if (run.length < 2 || run.filter((x) => x.value === true).length > 1) {
        for (const x of run) {
          const cx = this.controlOf.get(x)!;
          const own = { ...ctx, section: this.sectionOf.get(x) ?? ctx.section };
          this.radioGroups.set(x, { field: this.addField(this.baseName(cx), `bool % = ${x.value === true};`, `option ${this.displayName(cx) ?? ""} (on/off)`.replace("  ", " "), own, this.placeOf(cx)), alone: true });
        }
        continue;
      }
      const on = Math.max(0, run.findIndex((x) => x.value === true));
      const own = { ...ctx, section: this.sectionOf.get(run[0]) ?? ctx.section };
      const field = this.addField(`${this.baseName(this.controlOf.get(run[0])!)}_option`, `int % = ${on};`, `radio group (${run.length} options)`, own, { key: run.map((x) => this.placeOf(this.controlOf.get(x)!).key).join("+"), rect: run[0].rect });
      run.forEach((x, index) => this.radioGroups.set(x, { field, index }));
    }
    return this.radioGroups.get(w)!;
  }

  private navFor(g: NavGroup, screen: string): NavState {
    const known = this.navOfGroup.get(g);
    if (known) return known;
    // The same nav on another screen: its items (by label), roughly where it was. Its
    // selected item's plate moves the items a little, so a pixel match would be too strict.
    const labels = g.items.map((w) => w.label?.text ?? "").join("|");
    const at = { x: g.rect.x + g.rect.w / 2, y: g.rect.y + g.rect.h / 2 };
    let nav = [...this.navs.values()].find((n) => n.axis === g.axis && n.count === g.items.length && n.labels === labels && Math.abs(n.at.x - at.x) <= 24 && Math.abs(n.at.y - at.y) <= 24);
    if (!nav) {
      // "sidebar" for the first vertical nav; a tab bar after its first tab ("aimbot_tabs"), else its section.
      const first = g.items[0]?.label?.text?.trim();
      const section = g.items[0] ? this.sectionOf.get(g.items[0]) : undefined;
      const base =
        g.axis === "vertical" ? (this.stateNames.has("sidebar") && section ? `${section}_nav` : "sidebar") : first ? `${snake(first, "tab")}_tabs` : section ? `${section}_tabs` : "tabs";
      const field = this.stateNames.take(base);
      this.fields.push({ decl: `int ${field} = ${g.selected};`, note: `${g.items.length}-item ${g.axis === "vertical" ? "sidebar" : "tab bar"}: the selected item (0 = first)`, group: `Screen "${this.screenName(screen)}"` });
      nav = { axis: g.axis, labels, at, field, action: this.actionNames.take(field), count: g.items.length, pages: new Map(), gos: new Map(), screens: new Set() };
      this.navs.set(`${this.navs.size}`, nav);
    }
    this.navOfGroup.set(g, nav);
    nav.screens.add(screen);
    const page = nav.pages.get(g.selected);
    if (page) page.add(screen);
    else nav.pages.set(g.selected, new Set([screen]));
    return nav;
  }

  /** Where item `i` leads from a screen showing another item selected: the design's own link first, else the page the analysis found. */
  private noteNavGo(nav: NavState, c: Control & { nav?: { group: NavGroup; index: number } }) {
    if (!c.nav) return;
    const i = c.nav.index;
    const goes = c.widget.onPress?.find((a) => a.kind === "go");
    const known = nav.gos.get(i)?.some((a) => a.kind === "go" && !a.replace);
    if (goes && i !== c.nav.group.selected && (!nav.gos.has(i) || (!known && goes.kind === "go" && !goes.replace))) nav.gos.set(i, c.widget.onPress!);
  }

  /** What makes two controls on different screens one control (a page and its states, a shared panel): kind, label and designed value, in (about) the same place. */
  private placeOf(c: Control): Place {
    return { key: `${c.kind}|${c.widget.label?.text ?? ""}|${String(c.widget.value ?? "")}`, rect: c.rect };
  }

  // --- actions -------------------------------------------------------------------

  private describe(actions: PressAction[]): string {
    return actions
      .map((a) => {
        switch (a.kind) {
          case "go":
            return `${a.replace ? "switches to" : "goes to"} "${this.screenName(a.screen)}"`;
          case "back":
            return "goes back";
          case "open-popup":
            return `opens "${this.input.popups.find((p) => p.popup.popup.id === a.popup)?.popup.popup.name ?? a.popup}"`;
          case "close-popup":
            return "closes the popup";
          case "show-toast":
            return `shows "${this.input.toasts.find((t) => t.toast.toast.id === a.toast)?.toast.toast.name ?? a.toast}"`;
          case "select-page":
            return `selects page ${a.index + 1}`;
          case "window":
            return `${a.action}s the window`;
          case "url":
            return `opens ${a.url}`;
        }
      })
      .join(", then ");
  }

  private actionCode(a: PressAction): string | null {
    switch (a.kind) {
      case "go": {
        const id = this.screenIdent.get(a.screen);
        return id ? `app::${a.replace ? "switch_to" : "go"}(app::Screen::${id});` : null;
      }
      case "back":
        return "app::back();";
      case "open-popup": {
        const id = this.popupIdent.get(a.popup);
        return id ? `app::open_popup(app::Popup::${id});` : null;
      }
      case "close-popup":
        return "app::close_popup();";
      case "show-toast": {
        const id = this.toastIdent.get(a.toast);
        return id ? `app::notify(app::Toast::${id});` : null;
      }
      case "window":
        return a.action === "maximize" ? "// The window keeps the design's size." : `ff::${a.action}_window();`;
      case "url":
        return `app::open_url(${str(a.url)});`;
      case "select-page":
        return null;
    }
  }

  /** How a control is named in comments: its label, a placeholder, or a meaningful layer name (null: none). */
  private displayName(c: Control): string | null {
    const w = c.widget;
    if (w.label?.text?.trim()) return `"${w.label.text.trim()}"`;
    if (c.kind === "text_field" && c.placeholder) return `"${c.placeholder.segments[0].text}"`;
    const layer = [w.icon, ...w.nodes, w.surface].find((n): n is DesignNode => !!n && !!n.name && !GENERIC_NAME.test(n.name.trim()));
    return layer ? `"${layer.name.trim()}"` : null;
  }

  /**
   * The action a control calls. The same control repeated on several screens
   * (a sidebar button, a header link) with the same behaviour shares one.
   */
  private actionFor(c: Control, ctx: Ctx): string {
    const where = ctx.popup ? `popup "${ctx.popup.popup.popup.name}"` : `"${this.screenName(ctx.screen)}"`;
    const does = c.widget.onPress ?? [];
    const code = does.map((a) => this.actionCode(a)).filter((x): x is string => !!x);
    const key = `${c.kind}|${c.widget.label?.text ?? ""}|${code.join(" ")}`;
    const known = this.actionByPlace.get(key, c.rect);
    if (known) {
      if (!known.places.includes(where)) known.places.push(where);
      return known.name;
    }
    const body: string[] = [];
    if (does.length && c.widget.pressReason) body.push(`// From the design: ${comment(c.widget.pressReason)}.`);
    body.push(...code);
    if (!code.length) body.push("// Nothing in the design says what this does: add your logic here.");
    const kind = c.kind === "hotspot" ? "clickable artwork" : c.widget.label ? "button" : "icon button";
    const shown = this.displayName(c);
    const action: Action = { name: this.actionNames.take(this.baseName(c)), what: shown ? `${shown} ${kind}` : `unnamed ${kind}`, places: [where], params: "", body };
    this.actionByPlace.set(key, c.rect, action);
    this.actions.push(action);
    return action.name;
  }

  // --- files ---------------------------------------------------------------------

  emit(): AppFiles {
    const files: AppFiles = [];
    const units = [...this.input.screens, ...this.input.popups];
    // Field names more than one control would take ("Box" in three panels): each gets its section's name too.
    const takers = new Map<string, Set<string>>();
    for (const u of units)
      for (const op of u.ops) {
        if (op.kind !== "control" || op.control.kind === "button" || op.control.kind === "hotspot") continue;
        const base = snake(this.fieldBase(op.control), "value");
        const place = this.placeOf(op.control);
        const q = (v: number) => Math.round(v / 4);
        const ids = takers.get(base) ?? new Set<string>();
        ids.add(`${place.key}|${q(place.rect.x)},${q(place.rect.y)}`);
        takers.set(base, ids);
      }
    for (const [base, ids] of takers) if (ids.size > 1) this.sharedBases.add(base);
    const components = planComponents(
      units.map((u) => ({ root: "screen" in u ? u.screen.built.root : u.popup.built.root, ops: u.ops })),
      this.opCtx("f"),
    );
    units.forEach((u, i) => this.unitOps.set(u, components.ops[i]));
    this.componentFiles = components.files.length / 2;
    const plans = this.input.screens.map((u) => this.planScreen(u));
    // Component files already taken: the widget kinds and the Figma components.
    const taken = [...WIDGET_KINDS, ...components.files.filter((x) => x.path.endsWith(".h")).map((x) => x.path.split("/").pop()!.replace(/\.h$/, ""))];
    const shared = this.shareSections(plans, taken);
    const screenFiles = plans.map((p) => this.writeScreen(p, shared));
    const partFiles = [...new Set(shared.values())].flatMap((x) => this.writePart(x));
    this.sharedParts = new Set(shared.values()).size;
    const popupFiles = this.input.popups.map((u) => this.emitPopup(u));
    const toastFiles = this.input.toasts.map((u) => this.emitToast(u));
    for (const x of [...screenFiles, ...popupFiles, ...toastFiles]) files.push(...x);
    files.push(...components.files, ...partFiles);
    // Looks that differently named controls share take a common name, now that every use is known.
    const renames = this.theme.settleControlNames();
    if (renames.size) {
      const used = new RegExp(`\\bstyles::(${[...renames.keys()].join("|")})\\b`, "g");
      for (const x of files) x.contents = x.contents.replace(used, (_, old: string) => `styles::${renames.get(old)}`);
    }
    for (const x of files) if (/^src\/ui\/.*\.cpp$/.test(x.path)) x.contents = pruneIncludes(x.contents);
    files.push({ path: "src/app/navigation.h", contents: this.navigationHeader() });
    files.push({ path: "src/app/state.h", contents: this.stateHeader() });
    const actions = this.actionFiles();
    files.push({ path: "src/app/actions.h", contents: actions.header }, { path: "src/app/actions.cpp", contents: actions.source });
    const app = this.appFiles();
    files.push({ path: "src/app/app.h", contents: app.header }, { path: "src/app/app.cpp", contents: app.source }, { path: "src/main.cpp", contents: app.main });
    return files;
  }

  /** Each screen's, popup's and toast's identifier in the generated code, by design id. */
  identOf(kind: "screen" | "popup" | "toast", id: string): string | undefined {
    return (kind === "screen" ? this.screenIdent : kind === "popup" ? this.popupIdent : this.toastIdent).get(id);
  }

  /** The widget style types used (styles.h includes their headers). */
  get widgetTypes(): string[] {
    return [...this.usedWidgets];
  }

  private includesFor(ops: UnitOp[]): string[] {
    const kinds = new Set(ops.filter((o): o is ControlOp => o.kind === "control").map((o) => o.control.kind));
    const out = new Set<string>();
    for (const o of ops) if (o.kind === "component") out.add(o.header);
    for (const k of kinds) {
      if (k === "button" || k === "hotspot") out.add(WIDGET_HEADERS["ui::ButtonStyle"]);
      if (k === "toggle") out.add(WIDGET_HEADERS["ui::ToggleStyle"]);
      if (k === "checkbox" || k === "radio") out.add(WIDGET_HEADERS["ui::CheckboxStyle"]);
      if (k === "slider") out.add(WIDGET_HEADERS["ui::SliderStyle"]);
      if (k === "text_field") out.add(WIDGET_HEADERS["ui::TextFieldStyle"]);
      if (k === "combo") out.add(WIDGET_HEADERS["ui::ComboStyle"]);
      if (k === "keybind") out.add(WIDGET_HEADERS["ui::KeybindStyle"]);
    }
    return [...out].sort();
  }

  /** Writes a list of ops (static layers, controls and component calls) into `w`. */
  private writeOps(w: Writer, ops: UnitOp[], frame: (op: UnitOp) => string, ctx: Ctx) {
    for (const op of ops) {
      if (op.kind === "control") this.writeControl(w, op.control, frame(op), ctx);
      else if (op.kind === "component") w.line(op.call(frame(op)));
      else if (op.kind !== "section-begin" && op.kind !== "section-end") writeStaticOp(w, op, this.opCtx(frame(op), ctx.section));
    }
  }

  private usesState(ops: UnitOp[]): boolean {
    return ops.some((o) => o.kind === "control" && o.control.kind !== "hotspot" && !(o.control.kind === "button" && !o.control.nav));
  }

  /**
   * A screen's code, planned before it's written: its top-level layers as function bodies
   * (rendered once, so their fields, actions and styles are registered once), in Figma's
   * layer order with the layers drawn straight in the screen's own function.
   */
  private planScreen(u: ScreenUnit): ScreenPlan {
    const ident = this.screenIdent.get(u.screen.id)!;
    const ops = this.unitOps.get(u) ?? u.ops;
    const fnScope = new NameScope([ident]);
    const sections: SectionPlan[] = [];
    const order: Array<{ section: SectionPlan } | { ops: UnitOp[] }> = [];
    let current: SectionPlan | null = null;
    for (const op of ops) {
      if (op.kind === "section-begin") {
        const base = snake(cleanLayerName(op.node.name) || "section", "section");
        current = { name: fnScope.take(base), base, note: op.node.name, ops: [], body: "" };
        sections.push(current);
        order.push({ section: current });
        continue;
      }
      if (op.kind === "section-end") {
        current = null;
        continue;
      }
      if (current) current.ops.push(op);
      else {
        const last = order[order.length - 1];
        if (last && "ops" in last) last.ops.push(op);
        else order.push({ ops: [op] });
      }
    }
    for (const sec of sections) for (const op of sec.ops) if (op.kind === "control") this.sectionOf.set(op.control.widget, sec.base);
    const ctx = (section?: string): Ctx => ({ screen: u.screen.id, popup: null, section });
    for (const sec of sections) {
      const w = new Writer();
      if (this.usesState(sec.ops)) w.line("app::State& s = app::state();");
      this.writeOps(w, sec.ops, () => "f", ctx(sec.base));
      sec.body = w.toString().trimEnd();
    }
    const direct = order.flatMap((x) => ("ops" in x ? x.ops : []));
    const inline = new Map<UnitOp[], string>();
    for (const x of order) {
      if (!("ops" in x)) continue;
      const w = new Writer();
      this.writeOps(w, x.ops, () => "f", ctx());
      inline.set(x.ops, w.toString().trimEnd());
    }
    return { u, ident, sections, order, inline, direct };
  }

  /**
   * Top-level layers several screens draw the same way (a sidebar, a header, window buttons)
   * become one function in src/ui/components/, called by each. "The same": identical code but
   * for positions within 1.5 px (copies of a layer drift by a pixel), the variant most screens
   * draw standing for the rest.
   */
  private shareSections(plans: ScreenPlan[], taken: Iterable<string>): Map<SectionPlan, SharedPart> {
    const FLOAT = /(?<![\w.])-?\d+(?:\.\d*)?f(?!\w)/g;
    const shape = (body: string) => body.replace(FLOAT, "#");
    const floats = (body: string) => (body.match(FLOAT) ?? []).map((t) => parseFloat(t));
    const close = (a: string, b: string) => {
      const x = floats(a);
      const y = floats(b);
      return x.length === y.length && x.every((v, i) => Math.abs(v - y[i]) <= 1.5);
    };
    type Group = { shape: string; members: Array<{ plan: ScreenPlan; section: SectionPlan }> };
    const groups: Group[] = [];
    for (const plan of plans)
      for (const section of plan.sections) {
        if (!section.body.trim()) continue;
        const sh = shape(section.body);
        const g = groups.find((x) => x.shape === sh && !x.members.some((m) => m.plan === plan) && close(x.members[0].section.body, section.body));
        if (g) g.members.push({ plan, section });
        else groups.push({ shape: sh, members: [{ plan, section }] });
      }
    const names = new NameScope(taken);
    const out = new Map<SectionPlan, SharedPart>();
    for (const g of groups) {
      if (g.members.length < 2) continue;
      // The body most screens draw stands for all of them.
      const counts = new Map<string, number>();
      for (const m of g.members) counts.set(m.section.body, (counts.get(m.section.body) ?? 0) + 1);
      const body = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
      const first = g.members.find((m) => m.section.body === body)!;
      const part: SharedPart = {
        name: names.take(first.section.base),
        note: first.section.note,
        body,
        ops: first.section.ops,
        screens: g.members.map((m) => m.plan.u.screen.name),
      };
      for (const m of g.members) out.set(m.section, part);
    }
    return out;
  }

  private writeScreen(plan: ScreenPlan, shared: Map<SectionPlan, SharedPart>): AppFiles {
    const { u, ident } = plan;
    const size = `${ident}_size`;
    const header = new Writer()
      .line(`// Screen "${comment(u.screen.name)}" (${Math.round(u.size.x)} x ${Math.round(u.size.y)}), generated by Figflow.`)
      .line("#pragma once")
      .line()
      .line('#include "imgui.h"')
      .line()
      .line("namespace screens {")
      .line()
      .line(`inline constexpr ImVec2 ${size}{ ${f(u.size.x)}, ${f(u.size.y)} };`)
      .line()
      .line("// Draws the screen at the current cursor position: its layers and controls.")
      .line(`void ${ident}();`)
      .line()
      .line("} // namespace screens")
      .toString();

    const local = plan.sections.filter((x) => !shared.has(x));
    const parts = [...new Set(plan.sections.map((x) => shared.get(x)).filter((x): x is SharedPart => !!x))];
    const src = new Writer()
      .line(`// Screen "${comment(u.screen.name)}", generated by Figflow. Each top-level layer is a`)
      .line(`// function${parts.length ? " (here, or in ui/components/ when other screens draw it too)" : " below"}, drawn in Figma's layer order; controls call actions.cpp.`)
      .line(`#include "ui/screens/${ident}.h"`)
      .line()
      .line('#include "app/actions.h"')
      .line('#include "app/state.h"')
      .line('#include "ff/draw.h"')
      .line('#include "ff/layout.h"')
      .line('#include "ff/text.h"')
      .line('#include "ui/assets/images.h"')
      .line('#include "ui/theme/palette.h"')
      .line('#include "ui/theme/styles.h"');
    const includes = new Set([...this.includesFor([...local.flatMap((x) => x.ops), ...plan.direct]), ...parts.map((x) => `ui/components/${x.name}.h`)]);
    for (const inc of [...includes].sort()) src.line(`#include "${inc}"`);
    src.line().line("namespace screens {").line();
    if (local.length) {
      src.line("namespace {").line();
      for (const x of local) {
        src.line(`// ${comment(x.note)}`);
        src.open(`void ${x.name}(ImDrawList* dl, const ff::Frame& f)`);
        if (x.body) src.raw(x.body);
        src.close();
        src.line();
      }
      src.line("} // namespace").line();
    }
    src.open(`void ${ident}()`);
    src.line(`const ff::Frame f = ff::begin_frame(${str(ident)}, ${size});`);
    src.line("ImDrawList* dl = ImGui::GetWindowDrawList();");
    if (this.usesState(plan.direct)) src.line("app::State& s = app::state();");
    for (const x of plan.order) {
      if ("ops" in x) {
        const text = plan.inline.get(x.ops);
        if (text) src.raw(text);
      } else {
        const part = shared.get(x.section);
        src.line(part ? `components::${part.name}(dl, f);` : `${x.section.name}(dl, f);`);
      }
    }
    src.line("ff::end_frame();");
    src.close();
    src.line().line("} // namespace screens");
    return [
      { path: `src/ui/screens/${ident}.h`, contents: header },
      { path: `src/ui/screens/${ident}.cpp`, contents: src.toString() },
    ];
  }

  /** src/ui/components/<part>.h and .cpp: a top-level layer several screens draw. */
  private writePart(part: SharedPart): AppFiles {
    const list = part.screens.map((x) => `"${comment(x)}"`).join(", ");
    const header = new Writer()
      .line(`// "${comment(part.note)}", drawn by the screens ${list}. Generated by Figflow.`)
      .line("#pragma once")
      .line()
      .line('#include "ff/layout.h"')
      .line('#include "imgui.h"')
      .line()
      .line("namespace components {")
      .line()
      .line(`// Draws "${comment(part.note)}" into the screen's frame f.`)
      .line(`void ${part.name}(ImDrawList* dl, const ff::Frame& f);`)
      .line()
      .line("} // namespace components")
      .toString();
    const src = new Writer()
      .line(`// "${comment(part.note)}": one function for every screen that draws it (${list}).`)
      .line(`#include "ui/components/${part.name}.h"`)
      .line()
      .line('#include "app/actions.h"')
      .line('#include "app/state.h"')
      .line('#include "ff/draw.h"')
      .line('#include "ff/text.h"')
      .line('#include "ui/assets/images.h"')
      .line('#include "ui/theme/palette.h"')
      .line('#include "ui/theme/styles.h"');
    for (const inc of this.includesFor(part.ops)) src.line(`#include "${inc}"`);
    src.line().line("namespace components {").line();
    src.open(`void ${part.name}(ImDrawList* dl, const ff::Frame& f)`);
    src.raw(part.body);
    src.close();
    src.line().line("} // namespace components");
    return [
      { path: `src/ui/components/${part.name}.h`, contents: header },
      { path: `src/ui/components/${part.name}.cpp`, contents: src.toString() },
    ];
  }

  private emitPopup(u: PopupUnit): AppFiles {
    const ident = this.popupIdent.get(u.popup.popup.id)!;
    const p = u.popup.popup;
    const header = new Writer()
      .line(`// Popup "${comment(p.name)}", generated by Figflow.`)
      .line("#pragma once")
      .line()
      .line("namespace popups {")
      .line()
      .line("// Draws the popup over the screen; `t` (0 to 1) is how far it has faded in.")
      .line(`void ${ident}(float t);`)
      .line()
      .line("} // namespace popups")
      .toString();
    const src = new Writer()
      .line(`// Popup "${comment(p.name)}", generated by Figflow.`)
      .line(`#include "ui/popups/${ident}.h"`)
      .line()
      .line('#include "app/actions.h"')
      .line('#include "app/navigation.h"')
      .line('#include "app/state.h"')
      .line('#include "ff/draw.h"')
      .line('#include "ff/flow.h"')
      .line('#include "ff/layout.h"')
      .line('#include "ff/text.h"')
      .line('#include "ui/assets/images.h"')
      .line('#include "ui/theme/palette.h"')
      .line('#include "ui/theme/styles.h"');
    const ops = this.unitOps.get(u) ?? u.ops;
    for (const inc of this.includesFor(ops)) src.line(`#include "${inc}"`);
    src.line().line("namespace popups {").line();
    src.open(`void ${ident}(float t)`);
    src.line(`const ff::Frame f = ff::begin_frame(${str(`popup_${ident}`)}, { ${f(u.size.x)}, ${f(u.size.y)} });`);
    src.line("ImDrawList* dl = ImGui::GetWindowDrawList();");
    if (this.usesState(ops)) src.line("app::State& s = app::state();");
    if (u.dim) src.line(`ff::draw::box(dl, f.rect(), ${this.theme.box(u.dim, `${p.name} dim`, this.input.assetIdent)}); // dims the screen`);
    const dimOps = ops.filter((o) => o.kind !== "control" && o.kind !== "section-begin" && o.kind !== "section-end" && u.backdrop.has(o.node.id));
    if (dimOps.length) this.writeOps(src, dimOps, () => "f", { screen: u.popup.screen, popup: u });
    src.line("// The dialog rises into place as it fades in.");
    src.line(`const ff::Frame p{ f.origin + ImVec2(${f(u.offset.x)}, ${f(u.offset.y)} + (1.f - t) * 10.f), f.size };`);
    const rest = ops.filter((o) => !dimOps.includes(o));
    this.writeOps(src, rest, () => "p", { screen: u.popup.screen, popup: u });
    if (u.closeOnOutside) {
      src.line("// A click outside the dialog closes it.");
      src.line(`if (ff::clicked_outside(p.rect({ ${f(u.panel.x)}, ${f(u.panel.y)} }, { ${f(u.panel.w)}, ${f(u.panel.h)} })))`);
      src.line("    app::close_popup();");
    }
    src.line("ff::end_frame();");
    src.close();
    src.line().line("} // namespace popups");
    return [
      { path: `src/ui/popups/${ident}.h`, contents: header },
      { path: `src/ui/popups/${ident}.cpp`, contents: src.toString() },
    ];
  }

  private emitToast(u: ToastUnit): AppFiles {
    const ident = this.toastIdent.get(u.toast.toast.id)!;
    const t = u.toast.toast;
    const r = u.rect;
    const header = new Writer()
      .line(`// Toast "${comment(t.name)}", generated by Figflow.`)
      .line("#pragma once")
      .line()
      .line('#include "imgui.h"')
      .line()
      .line("namespace toasts {")
      .line()
      .line(`// Where the design shows it, and its size.`)
      .line(`inline constexpr ImVec2 ${ident}_pos{ ${f(r.x)}, ${f(r.y)} };`)
      .line(`inline constexpr ImVec2 ${ident}_size{ ${f(r.w)}, ${f(r.h)} };`)
      .line()
      .line(`// Draws the toast with its top-left corner at \`at\`; \`text\` (null = as designed) replaces its message.`)
      .line(`void ${ident}(ImDrawList* dl, ImVec2 at, const char* text);`)
      .line()
      .line("} // namespace toasts")
      .toString();
    const src = new Writer()
      .line(`// Toast "${comment(t.name)}", generated by Figflow.`)
      .line(`#include "ui/toasts/${ident}.h"`)
      .line()
      .line('#include "ff/draw.h"')
      .line('#include "ff/layout.h"')
      .line('#include "ff/text.h"')
      .line('#include "ui/assets/images.h"')
      .line('#include "ui/theme/palette.h"')
      .line('#include "ui/theme/styles.h"')
      .line()
      .line("namespace toasts {")
      .line();
    src.open(`void ${ident}(ImDrawList* dl, ImVec2 at, const char* text)`);
    src.line("// Layers keep their design coordinates, relative to this frame.");
    src.line(`const ff::Frame f{ at - ${ident}_pos, ${ident}_size + ${ident}_pos };`);
    const message = u.ops.find((o): o is TextOp => o.kind === "text");
    let usedText = false;
    for (const op of u.ops) {
      if (op === message) {
        writeStaticOp(src, op, this.opCtx("f"), { text: "text", nullableText: true });
        usedText = true;
      } else writeStaticOp(src, op, this.opCtx("f"));
    }
    if (!usedText) src.line("(void)text;");
    src.close();
    src.line().line("} // namespace toasts");
    return [
      { path: `src/ui/toasts/${ident}.h`, contents: header },
      { path: `src/ui/toasts/${ident}.cpp`, contents: src.toString() },
    ];
  }

  private navigationHeader(): string {
    const w = new Writer()
      .line("// The app's screens, popups and toasts, and moving between them. Call these")
      .line("// from anywhere (actions.cpp does); they take effect from the next frame.")
      .line("#pragma once")
      .line()
      .line("namespace app {")
      .line();
    const enumBlock = (name: string, entries: { ident: string; note: string }[]) => {
      w.line(`enum class ${name} : int`).line("{");
      const width = Math.max(8, ...entries.map((e) => e.ident.length + 1));
      for (const e of entries) w.line(`    ${`${e.ident},`.padEnd(width + 1)} // ${comment(e.note)}`);
      w.line("    count,").line("};").line();
    };
    enumBlock(
      "Screen",
      this.input.screens.map((u) => ({ ident: this.screenIdent.get(u.screen.id)!, note: `"${u.screen.name}"${u.screen.id === this.input.flow.start ? " (start)" : ""}` })),
    );
    enumBlock(
      "Popup",
      this.input.popups.map((u) => ({ ident: this.popupIdent.get(u.popup.popup.id)!, note: `"${u.popup.popup.name}", over "${this.screenName(u.popup.screen)}"` })),
    );
    enumBlock(
      "Toast",
      this.input.toasts.map((u) => ({ ident: this.toastIdent.get(u.toast.toast.id)!, note: `"${u.toast.toast.name}"` })),
    );
    w.line("// Shows a screen; back() returns to the one before.")
      .line("void go(Screen screen);")
      .line("// Shows another page of the same nav (sidebar, tab bar): back() skips it.")
      .line("void switch_to(Screen screen);")
      .line("// Returns to the previous screen, if there is one.")
      .line("void back();")
      .line("Screen current_screen();")
      .line()
      .line("void open_popup(Popup popup);")
      .line("void close_popup();")
      .line("bool is_open(Popup popup);")
      .line()
      .line("// Shows a toast for `seconds`; `text` replaces its designed message.")
      .line("void notify(Toast toast, const char* text = nullptr, float seconds = 3.f);")
      .line()
      .line("// Opens a link in the default browser.")
      .line("void open_url(const char* url);")
      .line()
      .line("} // namespace app");
    return w.toString();
  }

  private stateHeader(): string {
    const w = new Writer()
      .line("// Everything the user can change: one field per control, starting the way the")
      .line("// design shows it. Read and write it anywhere through app::state().")
      .line("#pragma once")
      .line()
      .line('#include "imgui.h"')
      .line()
      .line("namespace app {")
      .line()
      .line("struct State")
      .line("{");
    let group = "";
    for (const fld of this.fields) {
      if (fld.group !== group) {
        if (group) w.line();
        w.line(`    // ${comment(fld.group)}`);
        group = fld.group;
      }
      w.line(`    ${fld.decl} // ${comment(fld.note)}`);
    }
    if (!this.fields.length) w.line("    // The design has no controls that hold a value.");
    w.line("};").line().line("State& state();").line();
    for (const x of this.extras) w.line(x);
    if (this.extras.length) w.line();
    w.line("} // namespace app");
    return w.toString();
  }

  private actionFiles(): { header: string; source: string } {
    const h = new Writer()
      .line("// What the controls do. The bodies in actions.cpp come from the design")
      .line("// (prototype links, layer names, matching labels): change them freely,")
      .line("// this is where your logic goes.")
      .line("#pragma once")
      .line()
      .line("namespace actions {")
      .line();
    const s = new Writer()
      .line('#include "app/actions.h"')
      .line()
      .line('#include "app/navigation.h"')
      .line('#include "app/state.h"')
      .line('#include "ff/host.h"')
      .line()
      .line("namespace actions {")
      .line();
    for (const a of this.actions) {
      const places = a.places.length > 1 ? `${a.places.slice(0, -1).join(", ")} and ${a.places[a.places.length - 1]}` : a.places[0];
      const note = `The ${a.what} on ${places}.`;
      h.line(`// ${comment(note)}`).line(`void ${a.name}(${a.params});`);
      s.line(`// ${comment(note)}`);
      s.open(`void ${a.name}(${a.params})`);
      for (const l of a.body) s.line(l);
      s.close().line();
    }
    for (const nav of this.navs.values()) {
      h.line(`// An item of the ${nav.field} was clicked (0 = first).`).line(`void ${nav.action}(int item);`);
      s.line(`// An item of the ${nav.field} was clicked (0 = first).`);
      s.open(`void ${nav.action}(int item)`);
      // Every screen showing this nav selects the item that is its page: that item is where you are.
      s.line(`if (app::state().${nav.field} == item)`).line("    return;");
      s.line(`app::state().${nav.field} = item;`);
      const cases: string[] = [];
      for (let i = 0; i < nav.count; i++) {
        // The design's link or the analysis' page for the item; else the one screen showing it selected.
        const page = nav.pages.get(i);
        const id = page && page.size === 1 ? this.screenIdent.get([...page][0]) : undefined;
        const code = (nav.gos.get(i) ?? []).map((a) => this.actionCode(a)).filter(Boolean);
        if (code.length) cases.push(`case ${i}:\n${code.map((c) => `    ${c}`).join("\n")}\n    break;`);
        else if (id && nav.screens.size > 1) cases.push(`case ${i}:\n    app::switch_to(app::Screen::${id});\n    break;`);
      }
      if (cases.length) {
        s.line("switch (item)").line("{");
        for (const c of cases) s.raw(c);
        s.line("default:").line("    break;").line("}");
      } else s.line(`// No frame shows the other pages, so the ${nav.field} only moves its highlight: draw each page's content by checking app::state().${nav.field}.`);
      s.close().line();
    }
    for (const a of ["close", "minimize", "maximize"] as const) {
      if (!this.windowActions.has(a)) continue;
      h.line(`// The ${a} button of the window.`).line(`void ${a}_window();`);
      s.line(`// The ${a} button of the window.`);
      s.open(`void ${a}_window()`);
      s.line(a === "maximize" ? "// The window keeps the design's size; nothing to do." : `ff::${a}_window();`);
      s.close().line();
    }
    if (!this.actions.length && !this.navs.size && !this.windowActions.size) h.line("// The design has no buttons.");
    h.line().line("} // namespace actions");
    s.line("} // namespace actions");
    return { header: h.toString(), source: s.toString() };
  }

  private appFiles(): { header: string; source: string; main: string } {
    const { screens, popups, toasts, flow, name } = this.input;
    const start = this.screenIdent.get(flow.start)!;
    const header = new Writer()
      .line("// The app: loads the design's fonts and images, then draws the current screen,")
      .line("// the open popup and any toasts every frame.")
      .line("#pragma once")
      .line()
      .line("namespace app {")
      .line()
      .line("void init();")
      .line("void frame();")
      .line()
      .line("} // namespace app")
      .toString();

    const s = new Writer().line('#include "app/app.h"').line().line('#include "app/navigation.h"').line('#include "app/state.h"').line('#include "ff/alpha.h"').line('#include "ff/flow.h"').line('#include "ff/host.h"').line('#include "ui/assets/images.h"').line('#include "ui/theme/fonts.h"');
    for (const u of screens) s.line(`#include "ui/screens/${this.screenIdent.get(u.screen.id)}.h"`);
    for (const u of popups) s.line(`#include "ui/popups/${this.popupIdent.get(u.popup.popup.id)}.h"`);
    for (const u of toasts) s.line(`#include "ui/toasts/${this.toastIdent.get(u.toast.toast.id)}.h"`);
    s.line().line("#include <windows.h>").line("#include <shellapi.h>").line().line("namespace app {").line().line("namespace {").line();
    s.line(`ff::Screens g_screens{ .current = ff::start_screen((int)Screen::${start}) };`).line("ff::Popups g_popups;").line("ff::Toasts g_toasts;").line();

    s.open("void draw_screen(int screen)").line("switch ((Screen)screen)").line("{");
    for (const u of screens) {
      const id = this.screenIdent.get(u.screen.id)!;
      s.line(`case Screen::${id}:`).line(`    screens::${id}();`).line("    break;");
    }
    s.line("default:").line("    break;").line("}").close().line();

    s.open("void draw_popup(int popup, float t)");
    if (popups.length) {
      s.line("switch ((Popup)popup)").line("{");
      for (const u of popups) {
        const id = this.popupIdent.get(u.popup.popup.id)!;
        s.line(`case Popup::${id}:`).line(`    popups::${id}(t);`).line("    break;");
      }
      s.line("default:").line("    break;").line("}");
    } else s.line("(void)popup;").line("(void)t;");
    s.close().line();

    s.line("// Newest first; each slides in from its edge and pushes older ones along.");
    s.open("void draw_toasts()");
    s.line("ImDrawList* dl = ImGui::GetWindowDrawList();");
    s.line("const ImVec2 origin = ImGui::GetWindowPos();");
    if (toasts.length) {
      s.line("float pushed_up = 0.f, pushed_down = 0.f;");
      s.open("for (int i = g_toasts.count - 1; i >= 0; i--)");
      s.line("const ff::Toast& t = g_toasts.items[i];");
      s.line("const float v = g_toasts.visibility(t);");
      s.line("ff::Fade fade(v);");
      s.line("const char* text = t.text[0] ? t.text : nullptr;");
      s.line("switch ((Toast)t.kind)").line("{");
      for (const u of toasts) {
        const id = this.toastIdent.get(u.toast.toast.id)!;
        const bottom = u.toast.toast.anchor === "bottom";
        s.line(`case Toast::${id}:`).line("{");
        s.line(bottom ? `    toasts::${id}(dl, origin + toasts::${id}_pos + ImVec2(0.f, (1.f - v) * 16.f - pushed_up), text);` : `    toasts::${id}(dl, origin + toasts::${id}_pos + ImVec2(0.f, (v - 1.f) * 16.f + pushed_down), text);`);
        s.line(`    ${bottom ? "pushed_up" : "pushed_down"} += (toasts::${id}_size.y + 8.f) * v;`);
        s.line("    break;").line("}");
      }
      s.line("default:").line("    break;").line("}");
      s.close();
      s.line("(void)pushed_up;").line("(void)pushed_down;");
    } else s.line("(void)dl;").line("(void)origin;");
    s.close().line();

    // Entering a screen: navs show the page it is, popups it shows by design open.
    s.line("// Entering a screen: its navs select the page it is; popups the design shows open, open.");
    s.open("void entered(Screen screen)");
    const enterCases: string[] = [];
    for (const u of screens) {
      const lines: string[] = [];
      for (const g of u.screen.analysis.navs) {
        const nav = this.navOfGroup.get(g);
        if (nav) lines.push(`state().${nav.field} = ${g.selected};`);
      }
      for (const p of popups) if (p.popup.screen === u.screen.id && p.popup.open === "enter") lines.push(`open_popup(Popup::${this.popupIdent.get(p.popup.popup.id)});`);
      if (lines.length) enterCases.push(`case Screen::${this.screenIdent.get(u.screen.id)}:\n${lines.map((l) => `    ${l}`).join("\n")}\n    break;`);
    }
    if (enterCases.length) {
      s.line("switch (screen)").line("{");
      for (const c of enterCases) s.raw(c);
      s.line("default:").line("    break;").line("}");
    } else s.line("(void)screen;");
    s.close().line();
    s.line("} // namespace").line();

    s.open("State& state()").line("static State s;").line("return s;").close().line();
    s.open("void go(Screen screen)").line("g_popups.close();").line("g_screens.go((int)screen);").line("entered(screen);").close().line();
    s.open("void switch_to(Screen screen)").line("g_popups.close();").line("g_screens.go((int)screen, false);").line("entered(screen);").close().line();
    s.open("void back()").line("g_popups.close();").line("if (g_screens.back())").line("    entered((Screen)g_screens.current);").close().line();
    s.open("Screen current_screen()").line("return (Screen)g_screens.current;").close().line();
    s.open("void open_popup(Popup popup)").line("g_popups.open((int)popup);").close().line();
    s.open("void close_popup()").line("g_popups.close();").close().line();
    s.open("bool is_open(Popup popup)").line("return g_popups.current == (int)popup;").close().line();
    s.open("void notify(Toast toast, const char* text, float seconds)").line("g_toasts.push((int)toast, text, seconds);").close().line();
    s.open("void open_url(const char* url)").line("::ShellExecuteA(nullptr, \"open\", url, nullptr, nullptr, SW_SHOWNORMAL);").close().line();

    s.open("void init()").line("fonts::load();").line("images::register_all();").line("entered(current_screen());");
    for (const p of popups) if (p.popup.open === "start") s.line(`open_popup(Popup::${this.popupIdent.get(p.popup.popup.id)});`).line("g_popups.t = 1.f; // already open when the app appears");
    s.close().line();

    s.open("void frame()");
    s.line("const float dt = ImGui::GetIO().DeltaTime;");
    s.line("g_screens.update(dt);").line("g_popups.update(dt);").line("g_toasts.update(dt);").line();
    s.line('if (ff::begin_design_window("##screens"))').line("{");
    s.line("    const ImVec2 origin = ImGui::GetCursorScreenPos();");
    s.line("    // The previous screen stays underneath while the new one fades in.");
    s.line("    if (g_screens.previous >= 0)").line("    {");
    s.line("        ImGui::PushItemFlag(ImGuiItemFlags_Disabled, true);");
    s.line("        draw_screen(g_screens.previous);");
    s.line("        ImGui::PopItemFlag();");
    s.line("        ImGui::SetCursorScreenPos(origin);").line("    }");
    s.line("    ff::Fade fade(g_screens.eased());");
    s.line("    draw_screen(g_screens.current);").line("}");
    s.line("ff::end_design_window();").line();
    s.line("// Popups sit in their own layer above the screen, which blocks its input.");
    s.line("if (g_popups.showing >= 0)").line("{");
    s.line('    if (ff::begin_design_layer("##popup", true))').line("    {");
    s.line("        ff::Fade fade(g_popups.eased());");
    s.line("        ImGui::PushItemFlag(ImGuiItemFlags_Disabled, !g_popups.is_open()); // closing: no more clicks");
    s.line("        draw_popup(g_popups.showing, g_popups.eased());");
    s.line("        ImGui::PopItemFlag();");
    s.line("        if (g_popups.is_open() && ImGui::IsKeyPressed(ImGuiKey_Escape, false) && !ImGui::IsAnyItemActive())");
    s.line("            close_popup();").line("    }");
    s.line("    ff::end_design_layer();").line("}").line();
    s.line("if (g_toasts.count > 0)").line("{");
    s.line('    if (ff::begin_design_layer("##toasts", false))');
    s.line("        draw_toasts();");
    s.line("    ff::end_design_layer();").line("}");
    s.close().line().line("} // namespace app");

    const main = new Writer()
      .line(`// ${comment(name)}: Win32 + DirectX 11 host, generated by Figflow.`)
      .line("#include <windows.h>")
      .line()
      .line('#include "app/app.h"')
      .line('#include "ff/host.h"')
      .line(`#include "ui/screens/${start}.h"`)
      .line()
      .open("int WINAPI wWinMain(HINSTANCE, HINSTANCE, PWSTR, int)")
      .line("ff::HostConfig config;")
      .line(`config.title = L${str(name)};`)
      .line(`config.size = screens::${start}_size;`)
      .line("config.style = ff::HostStyle::loader;")
      .line("if (!ff::host_create(config))")
      .line("    return 1;")
      .line()
      .line("app::init();")
      .line("while (ff::host_begin_frame())")
      .line("{")
      .line("    app::frame();")
      .line("    ff::host_end_frame();")
      .line("}")
      .line("ff::host_destroy();")
      .line("return 0;")
      .close()
      .toString();
    return { header, source: s.toString(), main };
  }
}

/** The same colour to 8 bits per channel. */
function sameRgba(a: RGBA, b: RGBA): boolean {
  const q = (v: number) => Math.round(v * 255);
  return q(a.r) === q(b.r) && q(a.g) === q(b.g) && q(a.b) === q(b.b) && q(a.a) === q(b.a);
}

function mixRgba(a: RGBA, b: RGBA, t: number): RGBA {
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t, a: a.a + (b.a - a.a) * t };
}
