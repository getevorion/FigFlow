/**
 * Multi-frame analysis: starting from the frame the user picked, which frames
 * are screens of the same app, which frames are "a screen with a popup open"
 * (they contribute the popup, not a screen), and what every control does.
 *
 * Signals, strongest first: prototype links, layer-name tags, shared navs
 * (the same sidebar with a different item selected = pages of one menu), then
 * text: a button's label (or the title of the card it's on) against popup
 * titles/buttons and screen names. Screens are collected breadth-first from
 * the start; then every other frame the size of the app's window joins as a
 * screen too (a loading screen, an error state, a page the prototype never
 * linked), and so do full-window overlays. Identical copies of a frame share
 * one screen. Frames of other sizes, components and groups nothing links to
 * are left out.
 */
import type { FigFile, FrameSummary } from "../fig/open";
import type { BuildResult } from "../fig/build";
import { guidKey } from "../fig/raw";
import type { DesignNode, Rect, RGBA } from "../model/types";
import { detectWidgets } from "./detect";
import { detectPopups, detectToasts } from "./overlays";
import { area, buildScene, clickLinks, subtree, textColor, type El, type Scene } from "./scene";
import { parseTags } from "./tags";
import type { FrameAnalysis, NavGroup, Popup, PressAction, Toast, Widget } from "./types";

export type FlowScreen = {
  id: string;
  name: string;
  built: BuildResult;
  scene: Scene;
  analysis: FrameAnalysis;
};

export type FlowPopup = {
  popup: Popup;
  /** Screen it opens over. */
  screen: string;
  /** Frame it was designed in: the screen itself, a copy of the screen with the popup open, or a Figma overlay frame. */
  source: string;
  built: BuildResult;
  scene: Scene;
  widgets: Widget[];
  /** "start": open when the app starts (the picked frame shows it); "enter": whenever its screen is shown
   *  (the design shows it and nothing opens it); "demand": opened by a control; "code": only from your code. */
  open: "start" | "enter" | "demand" | "code";
};

export type FlowToast = { toast: Toast; source: string; built: BuildResult; scene: Scene };

export type Flow = {
  start: string;
  screens: FlowScreen[];
  popups: FlowPopup[];
  toasts: FlowToast[];
  /** Screens the start screen's controls lead to, directly or not (the start included). */
  fromStart: string[];
  notes: string[];
};

// --- text matching ---------------------------------------------------------

/** Lowercase with Turkish dotted/dotless i folded and accents removed. */
export function fold(s: string): string {
  return s.replace(/İ/g, "i").replace(/I/g, "i").toLowerCase().replace(/ı/g, "i").normalize("NFKD").replace(/\p{Mn}/gu, "");
}

function stems(s: string): string[] {
  return [...new Set(fold(s).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3).map((w) => w.slice(0, 6)))];
}

/** Share of the smaller word set found in the other (0..1). */
function overlap(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const B = new Set(b);
  return a.filter((w) => B.has(w)).length / Math.min(a.length, b.length);
}

const BACK_WORDS = /^(back|return|go back|geri|geri dön|назад|вернуться|zurück|retour|atrás|volver|indietro|voltar)$/i;
const CLOSE_WORDS = /^(close|cancel|dismiss|not now|later|ok|okay|got it|iptal|kapat|vazgeç|tamam|отмена|закрыть|ок|abbrechen|schließen|annuler|fermer|cancelar|cerrar|x|✕|×)$/i;

// --- frame analysis ----------------------------------------------------------

export function analyzeFrame(built: BuildResult): { analysis: FrameAnalysis; scene: Scene } {
  const root = built.root;
  const scene = buildScene(root);
  const popups = detectPopups(scene);
  const toasts = detectToasts(scene);
  // A toast's contents are the toast itself, not controls.
  const { widgets, navs } = detectWidgets(root, { scene, exclude: new Set(toasts.flatMap((t) => t.members.map((m) => m.id))) });
  const staticNodes = new Set<string>();
  for (const e of scene.all) if (parseTags(e.node.name).some((t) => t.kind === "static")) staticNodes.add(e.node.id);
  return {
    scene,
    analysis: { frameId: root.guid, frameName: root.name, size: { x: root.size.x, y: root.size.y }, widgets, navs, popups, toasts, staticNodes, notes: [] },
  };
}

/** Geometry fingerprint of a frame, ignoring text content and the given subtrees. */
function signature(scene: Scene, exclude: Set<string>): Set<string> {
  const out = new Set<string>();
  const q = (v: number) => Math.round(v / 6);
  const skip = (e: El) => {
    for (let p: El | null = e; p; p = p.parent) if (exclude.has(p.node.id)) return true;
    return false;
  };
  for (const e of scene.all) {
    if (e === scene.root || skip(e)) continue;
    if (e.role === "text") out.add(`t:${q(e.box.x)}:${q(e.box.y)}:${q(e.box.h)}`);
    else out.add(`${e.role}:${q(e.box.x)}:${q(e.box.y)}:${q(e.box.w)}:${q(e.box.h)}`);
  }
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n / Math.max(1, a.size + b.size - n);
}

function idsUnder(scene: Scene, rootId: string): Set<string> {
  const e = scene.byId.get(rootId);
  return new Set(e ? subtree(e).map((x) => x.node.id) : []);
}

function widgetIn(w: Widget, ids: Set<string>): boolean {
  return w.nodes.some((n) => ids.has(n.id));
}

function sameNav(a: NavGroup, b: NavGroup): boolean {
  const t = 6;
  return (
    a.items.length === b.items.length &&
    a.axis === b.axis &&
    Math.abs(a.rect.x - b.rect.x) <= t &&
    Math.abs(a.rect.y - b.rect.y) <= t &&
    Math.abs(a.rect.w - b.rect.w) <= t &&
    Math.abs(a.rect.h - b.rect.h) <= t
  );
}

/** Same size as the app's window, give or take 2% (or 4 px): another screen of the same app. */
function sameWindow(a: { width: number; height: number }, b: { width: number; height: number }): boolean {
  return Math.abs(a.width - b.width) <= Math.max(4, b.width * 0.02) && Math.abs(a.height - b.height) <= Math.max(4, b.height * 0.02);
}

/** Everything a frame shows, layer by layer to 2 px, with colours, texts and images: identical copies match. */
function fingerprint(scene: Scene): Set<string> {
  const out = new Set<string>();
  const q = (v: number) => Math.round(v / 2);
  const rgba = (c?: RGBA) => (c ? `${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${Math.round(c.a * 100)}` : "");
  for (const e of scene.all) {
    if (e === scene.root) continue;
    const image = e.node.fills.find((p) => p.visible && p.type === "IMAGE");
    const look = e.role === "text" ? `${e.text?.trim() ?? ""}|${rgba(textColor(e))}` : rgba(e.fill);
    out.add(`${e.role}:${q(e.box.x)}:${q(e.box.y)}:${q(e.box.w)}:${q(e.box.h)}:${look}:${image?.type === "IMAGE" ? image.hash : ""}`);
  }
  return out;
}

/** A frame that paints its whole area: opaque fill, or a first layer covering it (a background picture). */
function opaque(root: DesignNode): boolean {
  const solid = (n: DesignNode) => n.fills.some((p) => p.visible && ((p.type === "SOLID" && p.color.a * p.opacity >= 0.95) || (p.type === "IMAGE" && p.opacity >= 0.95)));
  if (solid(root)) return true;
  const first = root.children.find((c) => c.visible && c.opacity > 0.001);
  return !!first && first.opacity >= 0.95 && first.box.w * first.box.h >= root.size.x * root.size.y * 0.95 && solid(first);
}

type Frame = { f: FrameSummary; built: BuildResult; scene: Scene; analysis: FrameAnalysis; base?: string };

const MAX_FRAMES = 80;
/** Names Figma gives new layers: they say nothing about a screen. */
const DEFAULT_NAME = /^(frame|group|component|instance|section|rectangle|ellipse|vector|polygon|star|line|slice|image)(\s+\d+)*$/i;
/** Screens nothing links to are added up to this many (a page of 200 look-alike frames is a kit, not an app). */
const MAX_UNLINKED = 48;

export function analyzeFlow(fig: FigFile, startId: string): Flow {
  const notes: string[] = [];
  const page = fig.pages().find((p) => p.frames.some((f) => f.id === startId));
  if (!page) throw new Error(`Frame ${startId} is not a top-level frame of any page.`);
  const startSummary = page.frames.find((f) => f.id === startId)!;
  const startArea = Math.max(1, startSummary.width * startSummary.height);

  // Screen-sized frames on the same page are candidates.
  const candidates = page.frames.filter((f) => {
    if (f.id === startId) return true;
    if (f.kind === "COMPONENT_SET" || f.width < 120 || f.height < 120) return false;
    const r = (f.width * f.height) / startArea;
    return r >= 0.2 && r <= 5;
  });
  if (candidates.length > MAX_FRAMES) {
    notes.push(`The page has ${candidates.length} screen-sized frames; only the ${MAX_FRAMES} closest to "${startSummary.name}" were considered.`);
    const d = (f: FrameSummary) => Math.hypot(f.x - startSummary.x, f.y - startSummary.y);
    candidates.sort((a, b) => d(a) - d(b)).splice(MAX_FRAMES);
  }
  const frames = new Map<string, Frame>();
  for (const f of candidates) {
    const built = fig.build(f.id);
    const { analysis, scene } = analyzeFrame(built);
    frames.set(f.id, { f, built, scene, analysis });
  }

  // Frames that are another frame plus an open popup contribute the popup, not a screen.
  const excluded = (x: Frame) => new Set([...x.analysis.popups.map((p) => p.root.id), ...x.analysis.toasts.flatMap((t) => t.members.map((m) => m.id))]);
  const sigs = new Map([...frames.values()].map((x) => [x.f.id, signature(x.scene, excluded(x))]));
  for (const a of frames.values()) {
    if (!a.analysis.popups.length) continue;
    let best: { id: string; score: number } | null = null;
    for (const b of frames.values()) {
      if (b === a || b.analysis.popups.length) continue;
      const s = jaccard(sigs.get(a.f.id)!, sigs.get(b.f.id)!);
      if (!best || s > best.score) best = { id: b.f.id, score: s };
    }
    if (best && best.score >= 0.6) {
      a.base = best.id;
      notes.push(`"${a.f.name}" is "${frames.get(best.id)!.f.name}" with a popup open (${Math.round(best.score * 100)}% same layout).`);
    }
  }

  // Prototype links between the frames: which frames take part, and how many others each leads to.
  const topOf = (id: string): string | null => {
    for (let n = fig.index.get(id); n; n = fig.index.parentOf(n)) {
      const k = guidKey(n.guid);
      if (frames.has(k)) return k;
    }
    return null;
  };
  const linksOut = new Map<string, Set<string>>();
  const linked = new Set<string>();
  for (const x of frames.values()) {
    const out = new Set<string>();
    for (const e of x.scene.all)
      for (const r of e.role === "icon" ? [...e.node.reactions, ...clickLinks(e.node)] : e.node.reactions) {
        const a = r.action;
        if (r.trigger === "NONE" || (a.kind !== "NAVIGATE" && a.kind !== "OVERLAY" && a.kind !== "SWAP")) continue;
        const to = topOf(a.target);
        if (to && to !== x.f.id) out.add(to);
      }
    linksOut.set(x.f.id, out);
    if (out.size) linked.add(x.f.id);
    for (const to of out) linked.add(to);
  }

  // Identical copies of a frame (designers duplicate screens to prototype from) share one
  // screen. A copy with links of its own stays: it's another step of the prototype.
  const prints = new Map([...frames.values()].map((x) => [x.f.id, fingerprint(x.scene)]));
  const dupOf = new Map<string, string>();
  const displayName = new Map<string, string>();
  const plain = [...frames.values()].filter((x) => !x.base && sameWindow(x.f, startSummary));
  for (let i = 0; i < plain.length; i++) {
    const a = plain[i];
    if (dupOf.has(a.f.id)) continue;
    const group = [a, ...plain.slice(i + 1).filter((b) => !dupOf.has(b.f.id) && sameWindow(a.f, b.f) && jaccard(prints.get(a.f.id)!, prints.get(b.f.id)!) >= 0.98)];
    if (group.length < 2) continue;
    const rank = (x: Frame) => (x.f.id === startId ? 2 : 0) + (linked.has(x.f.id) ? 1 : 0);
    const keep = group.reduce((best, x) => (rank(x) > rank(best) ? x : best));
    const copies = group.filter((x) => x !== keep && !linksOut.get(x.f.id)?.size);
    if (!copies.length) continue;
    for (const x of copies) dupOf.set(x.f.id, keep.f.id);
    // "SEARCH LOGIC 1" made from a copy of "main": the plain name names the screen.
    const numbered = (s: string) => /\d\s*$/.test(s.trim());
    const better = numbered(keep.f.name) ? copies.find((x) => !numbered(x.f.name) && x.f.name.trim()) : undefined;
    if (better) displayName.set(keep.f.id, better.f.name.trim());
    const list = copies.map((x) => `"${x.f.name}"`).join(", ");
    notes.push(`${list} ${copies.length > 1 ? "are copies" : "is a copy"} of "${keep.f.name}", so ${copies.length > 1 ? "they share" : "it shares"} its screen.`);
  }
  for (const x of frames.values()) if (x.base && dupOf.has(x.base)) x.base = dupOf.get(x.base);
  const canonical = (id: string) => dupOf.get(id) ?? id;

  // A page showing a nav with nothing selected (a store, a hub) has the nav other frames show selected.
  for (const x of frames.values()) {
    for (const y of frames.values()) {
      if (y === x || y.base || dupOf.has(y.f.id)) continue;
      for (const nav of y.analysis.navs) {
        if (nav.selected < 0 || x.analysis.navs.some((n) => sameNav(n, nav))) continue;
        const items = nav.items.map((it) => x.analysis.widgets.find((w) => (w.kind === "button" || w.kind === "icon_button") && nearRect(w.rect, it.rect, 6)));
        if (items.some((w) => !w)) continue;
        const own = items as Widget[];
        for (const w of own) {
          w.kind = "nav_item";
          w.value = false;
        }
        x.analysis.navs.push({
          id: `${nav.id}@${x.f.id}`,
          items: own,
          selected: -1,
          axis: nav.axis,
          rect: unionOf(own.map((w) => w.rect)),
          template: nav,
          evidence: { score: 0.8, reasons: [`the ${nav.items.length} items of the nav in "${y.f.name}", none selected`] },
        });
      }
    }
  }

  // Distinctive words of frame names ("Lite [News]" among "Lite [...]" frames → "news").
  const nameStems = new Map([...frames.values()].map((x) => [x.f.id, stems(x.f.name)]));
  const common = new Set([...nameStems.values()].reduce<string[]>((acc, s, i) => (i === 0 ? s : acc.filter((w) => s.includes(w))), []));
  const distinctive = (id: string) => (frames.size > 1 ? nameStems.get(id)!.filter((w) => !common.has(w)) : nameStems.get(id)!);

  const startScreen = canonical(frames.get(startId)!.base ?? startId);
  /** Frames a label or layer name can lead to: screens with a real name (not "Group 175"), never a copy. */
  const namedScreen = (x: Frame) => !x.base && !dupOf.has(x.f.id) && (x.f.kind === "FRAME" || x.f.kind === "INSTANCE") && !DEFAULT_NAME.test(x.f.name.trim());
  const screens: FlowScreen[] = [];
  const screenIds = new Set<string>();
  const popups: FlowPopup[] = [];
  const toasts: FlowToast[] = [];
  const queue: string[] = [];
  const addScreen = (id: string) => {
    if (screenIds.has(id)) return;
    screenIds.add(id);
    queue.push(id);
  };
  addScreen(startScreen);

  const popupsOf = (screen: string) => popups.filter((p) => p.screen === screen);
  const overlayPopups = new Map<string, FlowPopup>();

  /** A Figma overlay frame (usually dialog-sized) opened from `screen`. */
  const overlayPopup = (target: string, screen: string): FlowPopup | null => {
    const key = `${screen}>${target}`;
    const known = overlayPopups.get(key);
    if (known) return known;
    const raw = fig.index.get(target);
    if (!raw) return null;
    const built = fig.build(target);
    const { analysis, scene } = analyzeFrame(built);
    const bg = raw.overlayBackgroundAppearance;
    const dim: RGBA | undefined = bg?.backgroundType === "SOLID_COLOR" && bg.backgroundColor ? { ...bg.backgroundColor } : undefined;
    const fp: FlowPopup = {
      popup: {
        id: `overlay_${target.replace(":", "_")}`,
        name: built.root.name,
        root: built.root,
        title: largestTextOf(scene),
        rect: { x: 0, y: 0, w: built.root.size.x, h: built.root.size.y },
        overlay: {
          position: raw.overlayPositionType ?? "CENTER",
          offset: raw.overlayRelativePosition ? { x: raw.overlayRelativePosition.x, y: raw.overlayRelativePosition.y } : undefined,
          dim,
          closeOnOutside: raw.overlayBackgroundInteraction === "CLOSE_ON_CLICK_OUTSIDE",
        },
        evidence: { score: 1, reasons: ["prototype overlay"] },
      },
      screen,
      source: target,
      built,
      scene,
      widgets: analysis.widgets,
      open: "demand",
    };
    overlayPopups.set(key, fp);
    popups.push(fp);
    for (const t of analysis.toasts) toasts.push({ toast: t, source: target, built, scene });
    return fp;
  };

  /** Where a prototype link to `target` leads when followed from `screen`. */
  const follow = (raw: string, overlay: boolean, screen: string): PressAction[] | null => {
    const target = frames.has(raw) ? canonical(raw) : raw;
    const fr = frames.get(target);
    if (fr?.base) {
      claimPopups(fr.base);
      const p = popups.find((x) => x.source === target);
      if (!p) return null;
      return fr.base === screen ? [{ kind: "open-popup", popup: p.popup.id }] : [{ kind: "go", screen: fr.base }, { kind: "open-popup", popup: p.popup.id }];
    }
    // An overlay the size of the window that paints all of it is another screen, not a dialog.
    const from = frames.get(screen);
    const fullWindow = !!fr && !!from && sameWindow(fr.f, from.f) && !fr.analysis.popups.length && opaque(fr.built.root);
    if (fr && (!overlay || fullWindow)) return [{ kind: "go", screen: target }];
    const op = overlayPopup(target, screen);
    return op ? [{ kind: "open-popup", popup: op.popup.id }] : null;
  };

  const wire = (w: Widget, screen: FlowScreen, popup: FlowPopup | null, navPages: Map<NavGroup, (string | null)[]>) => {
    const set = (actions: PressAction[], reason: string) => {
      w.onPress = actions;
      w.pressReason = reason;
      for (const a of actions) {
        if (a.kind === "go") addScreen(a.screen);
        if (a.kind !== "open-popup") continue;
        const p = popups.find((x) => x.popup.id === a.popup);
        if (p && p.open !== "start") p.open = "demand";
      }
    };
    if (w.kind === "window_button" && w.action) return set([{ kind: "window", action: w.action }], "window button");

    // 1. Prototype links.
    for (const n of w.nodes) {
      for (const r of clickLinks(n)) {
        const a = r.action;
        if (a.kind === "BACK") return set([popup ? { kind: "close-popup" } : { kind: "back" }], "prototype: Back");
        if (a.kind === "CLOSE") return set([{ kind: "close-popup" }], "prototype: Close overlay");
        if (a.kind === "URL") return set([{ kind: "url", url: a.url }], "prototype: Open link");
        if (a.kind === "NAVIGATE" || a.kind === "OVERLAY" || a.kind === "SWAP") {
          const to = follow(a.target, a.kind !== "NAVIGATE", screen.id);
          if (to) return set(popup && to[0].kind === "go" ? [{ kind: "close-popup" }, ...to] : to, `prototype: ${a.kind.toLowerCase()} to "${fig.index.get(a.target)?.name ?? a.target}"`);
        }
      }
    }

    // 2. Layer-name tags.
    for (const n of w.nodes) {
      for (const t of parseTags(n.name)) {
        if (t.kind === "back") return set([popup ? { kind: "close-popup" } : { kind: "back" }], `layer name "${n.name}"`);
        if (t.kind === "close") return set([{ kind: "close-popup" }], `layer name "${n.name}"`);
        if (t.kind === "go") {
          const s = [...frames.values()].find((x) => namedScreen(x) && fold(x.f.name) === fold(t.name)) ?? [...frames.values()].find((x) => namedScreen(x) && overlap(stems(t.name), nameStems.get(x.f.id)!) >= 0.6);
          if (s) return set([{ kind: "go", screen: s.f.id }], `layer name "${n.name}"`);
        }
        if (t.kind === "open") {
          const p = popups.find((x) => fold(x.popup.name) === fold(t.name)) ?? popups.find((x) => overlap(stems(t.name), stems(x.popup.name)) >= 0.6);
          if (p) return set([{ kind: "open-popup", popup: p.popup.id }], `layer name "${n.name}"`);
        }
        if (t.kind === "show") {
          const x = toasts.find((y) => fold(y.toast.name) === fold(t.name)) ?? toasts.find((y) => overlap(stems(t.name), stems(y.toast.name)) >= 0.6);
          if (x) return set([{ kind: "show-toast", toast: x.toast.id }], `layer name "${n.name}"`);
        }
      }
    }

    // 3. Pages of a nav: the same nav with another item selected in another frame.
    if (w.kind === "nav_item") {
      for (const [nav, pages] of navPages) {
        const i = nav.items.indexOf(w);
        if (i < 0) continue;
        if (i === nav.selected) return set([], "the current page");
        const target = pages[i];
        // From a page of the nav it's a lateral move (no history); from a hub showing none selected, a step in.
        if (target) return set([{ kind: "go", screen: target, replace: nav.selected >= 0 }], `frame "${frames.get(target)!.f.name}" shows this nav with item ${i + 1} selected`);
        return set([{ kind: "select-page", nav: nav.id, index: i }], "no frame shows this page; the nav just selects it");
      }
    }

    // 4. Words.
    const label = (w.label?.text ?? "").trim();
    const words = [label, ...w.nodes.map((n) => n.name.trim())];
    if (words.some((x) => BACK_WORDS.test(x))) return set([popup ? { kind: "close-popup" } : { kind: "back" }], `"${label || w.nodes[0].name}" means back`);
    if (popup && words.some((x) => CLOSE_WORDS.test(x))) return set([{ kind: "close-popup" }], `"${label || w.nodes[0].name}" closes`);
    if (popup && w.kind === "icon_button" && isCornerOf(w, popup)) return set([{ kind: "close-popup" }], "icon button in the dialog's top corner");
    if (!popup && label) {
      const ls = stems(label);
      let best: { p: FlowPopup; score: number; why: string } | null = null;
      for (const p of popupsOf(screen.id)) {
        const texts = [p.popup.title ?? "", p.popup.name, ...p.widgets.map((x) => x.label?.text ?? "")].filter(Boolean);
        for (const t of texts) {
          const score = overlap(ls, stems(t));
          if (score >= 0.5 && (!best || score > best.score)) best = { p, score, why: `"${label}" matches "${t.trim()}" in the popup` };
        }
      }
      if (best) return set([{ kind: "open-popup", popup: best.p.popup.id }], best.why);
      const named = (words: string[]) => {
        let bestScreen: { id: string; score: number } | null = null;
        for (const x of frames.values()) {
          if (!namedScreen(x) || x.f.id === screen.id) continue;
          const d = distinctive(x.f.id);
          const hit = words.filter((s) => d.includes(s)).length;
          if (!hit) continue;
          const score = hit / Math.max(d.length, words.length);
          if (score >= 0.5 && (!bestScreen || score > bestScreen.score)) bestScreen = { id: x.f.id, score };
        }
        return bestScreen;
      };
      const bestScreen = named(ls);
      if (bestScreen) return set([{ kind: "go", screen: bestScreen.id }], `"${label}" names frame "${frames.get(bestScreen.id)!.f.name}"`);
      // A button on a card ("View", "Open") leads to what the card's title names.
      const title = w.kind === "button" ? cardTitle(w, screen.scene) : null;
      const card = title ? named(stems(title)) : null;
      if (card) return set([{ kind: "go", screen: card.id }], `it's on the card "${title}", which names frame "${frames.get(card.id)!.f.name}"`);
    }

    // 5. A dialog's main button: show the toast designed with it (if any), then close.
    if (popup && (w.kind === "button" || w.kind === "icon_button") && primaryOf(popup) === w) {
      const t = toasts.find((x) => x.source === popup.source);
      if (t) return set([{ kind: "show-toast", toast: t.toast.id }, { kind: "close-popup" }], `the dialog's main button; "${t.toast.name}" is designed with it`);
      return set([{ kind: "close-popup" }], "the dialog's main button (put your logic in actions.cpp)");
    }
  };

  // Popups designed in copies of a screen belong to that screen.
  const claimed = new Set<string>();
  const claimPopups = (screen: string) => {
    for (const fr of frames.values()) {
      const own = fr.f.id === screen;
      if (!own && fr.base !== screen) continue;
      if (claimed.has(fr.f.id)) continue;
      claimed.add(fr.f.id);
      for (const p of fr.analysis.popups) {
        const ids = idsUnder(fr.scene, p.root.id);
        popups.push({
          popup: p,
          screen,
          source: fr.f.id,
          built: fr.built,
          scene: fr.scene,
          widgets: fr.analysis.widgets.filter((w) => widgetIn(w, ids)),
          open: fr.f.id === startId ? "start" : own ? "enter" : "code",
        });
      }
      for (const t of fr.analysis.toasts) toasts.push({ toast: t, source: fr.f.id, built: fr.built, scene: fr.scene });
    }
  };

  const wiredPopups = new Set<FlowPopup>();
  const drain = () => {
    while (queue.length) {
      const id = queue.shift()!;
      const fr = frames.get(id)!;
      const screen: FlowScreen = { id, name: displayName.get(id) ?? fr.f.name, built: fr.built, scene: fr.scene, analysis: fr.analysis };
      screens.push(screen);
      claimPopups(id);

      // Each item's page: a frame showing the same nav with that item selected. When several
      // do (a section's pages), its main page is the one leading to the most others.
      const navPages = new Map<NavGroup, (string | null)[]>();
      for (const nav of fr.analysis.navs) {
        const best: Array<{ id: string; links: number } | null> = nav.items.map(() => null);
        for (const other of frames.values()) {
          if (other === fr || other.base || dupOf.has(other.f.id)) continue;
          const match = other.analysis.navs.find((n) => sameNav(n, nav) && n.selected >= 0 && n.selected !== nav.selected);
          if (!match) continue;
          const links = linksOut.get(other.f.id)?.size ?? 0;
          const b = best[match.selected];
          if (!b || links > b.links) best[match.selected] = { id: other.f.id, links };
        }
        navPages.set(nav, best.map((b) => b?.id ?? null));
      }

      const inOverlay = new Set<string>();
      for (const p of fr.analysis.popups) for (const x of idsUnder(fr.scene, p.root.id)) inOverlay.add(x);
      for (const t of fr.analysis.toasts) for (const m of t.members) for (const x of idsUnder(fr.scene, m.id)) inOverlay.add(x);
      for (const w of fr.analysis.widgets) if (!widgetIn(w, inOverlay)) wire(w, screen, null, navPages);
      // Popups' controls, including popups that other popups open while being wired.
      for (let pending = popupsOf(id).filter((p) => !wiredPopups.has(p)); pending.length; pending = popupsOf(id).filter((p) => !wiredPopups.has(p))) {
        for (const p of pending) {
          wiredPopups.add(p);
          for (const w of p.widgets) wire(w, screen, p, new Map());
        }
      }
    }
  };
  drain();

  // Frames the size of the app's window that nothing links to are still its screens (a
  // loading screen, an error state, a page the prototype never reached): your code opens them.
  // Not ones named with a leading "_" or ".", Figma's mark for private parts: notes, templates.
  const isScreen = (x: Frame) =>
    !x.base && !dupOf.has(x.f.id) && (x.f.kind === "FRAME" || x.f.kind === "INSTANCE") && !/^[_.]/.test(x.f.name.trim()) && sameWindow(x.f, startSummary);
  const unlinked: Frame[] = [];
  const skipped: Frame[] = [];
  for (const x of frames.values()) {
    if (screenIds.has(x.f.id) || claimed.has(x.f.id) || popups.some((p) => p.source === x.f.id) || !isScreen(x)) continue;
    if (unlinked.length >= MAX_UNLINKED) {
      skipped.push(x);
      continue;
    }
    unlinked.push(x);
    addScreen(x.f.id);
    drain();
  }

  const reached = new Set<string>([startScreen]);
  const leadsTo = new Map<string, Set<string>>(screens.map((s) => [s.id, new Set<string>()]));
  const reach = (from: string, w: Widget) => {
    for (const a of w.onPress ?? []) {
      if (a.kind !== "go") continue;
      reached.add(a.screen);
      leadsTo.get(from)?.add(a.screen);
    }
  };
  for (const s of screens) s.analysis.widgets.forEach((w) => reach(s.id, w));
  for (const p of popups) p.widgets.forEach((w) => reach(p.screen, w));
  const fromStart = new Set<string>([startScreen]);
  for (const queue = [startScreen]; queue.length; ) {
    for (const to of leadsTo.get(queue.shift()!) ?? []) {
      if (fromStart.has(to)) continue;
      fromStart.add(to);
      queue.push(to);
    }
  }
  const quote = (xs: Frame[]) => xs.map((x) => `"${x.f.name}"`).join(", ");
  const orphans = unlinked.filter((x) => !reached.has(x.f.id));
  if (orphans.length) notes.push(`Nothing in the design leads to ${quote(orphans)}; ${orphans.length > 1 ? "they're screens" : "it's a screen"} your code opens with app::go().`);
  if (skipped.length) notes.push(`The page has more than ${MAX_UNLINKED} unlinked frames the size of "${startSummary.name}"; these were left out: ${quote(skipped)}.`);
  for (const p of popups) if (p.open === "code") notes.push(`Nothing in the design opens popup "${p.popup.name}"; open it from your code with app::open_popup().`);
  const left = [...frames.values()].filter((x) => !screenIds.has(x.f.id) && !claimed.has(x.f.id) && !dupOf.has(x.f.id) && !skipped.includes(x) && !popups.some((p) => p.source === x.f.id));
  if (left.length) notes.push(`Left out, as they aren't screens of this app (another size, a component or a group) and nothing links to them: ${quote(left)}.`);
  return { start: startScreen, screens, popups, toasts, fromStart: [...fromStart], notes };
}

function nearRect(a: Rect, b: Rect, t: number): boolean {
  return Math.abs(a.x - b.x) <= t && Math.abs(a.y - b.y) <= t && Math.abs(a.w - b.w) <= t && Math.abs(a.h - b.h) <= t;
}

function unionOf(rs: Rect[]): Rect {
  const x = Math.min(...rs.map((r) => r.x));
  const y = Math.min(...rs.map((r) => r.y));
  return { x, y, w: Math.max(...rs.map((r) => r.x + r.w)) - x, h: Math.max(...rs.map((r) => r.y + r.h)) - y };
}

/** The title of the card a control sits on: the biggest other text of its smallest enclosing group. */
function cardTitle(w: Widget, scene: Scene): string | null {
  const own = new Set(w.nodes.map((n) => n.id));
  if (w.label) own.add(w.label.node.id);
  const frameArea = scene.size.x * scene.size.y;
  for (let e = scene.byId.get(w.nodes[0].id)?.parent ?? null; e && e !== scene.root; e = e.parent) {
    if (area(e.box) > frameArea * 0.4) break;
    const texts = subtree(e).filter((x) => x.role === "text" && x.text?.trim() && !own.has(x.node.id));
    if (!texts.length) continue;
    if (texts.length > 8) break;
    const size = (x: El) => x.node.text?.runs[0]?.fontSize ?? 0;
    return texts.sort((a, b) => size(b) - size(a) || a.box.y - b.box.y)[0].text!.trim();
  }
  return null;
}

function largestTextOf(scene: Scene): string | undefined {
  return scene.all
    .filter((e) => e.role === "text" && e.text?.trim())
    .sort((a, b) => (b.node.text?.runs[0]?.fontSize ?? 0) - (a.node.text?.runs[0]?.fontSize ?? 0) || a.box.y - b.box.y)[0]
    ?.text?.trim();
}

/** The dialog's main action: its biggest, most opaque button. */
function primaryOf(p: FlowPopup): Widget | undefined {
  const buttons = p.widgets.filter((w) => w.kind === "button");
  const weight = (w: Widget) => area(w.rect) * (w.surface ? Math.max(0.2, maxFillAlpha(w)) : 0.2);
  return buttons.sort((a, b) => weight(b) - weight(a))[0];
}

function maxFillAlpha(w: Widget): number {
  const fills = w.surface?.fills.filter((f) => f.visible) ?? [];
  return Math.max(0, ...fills.map((f) => (f.type === "SOLID" ? f.color.a * f.opacity : f.opacity)));
}

function isCornerOf(w: Widget, p: FlowPopup): boolean {
  const r = p.popup.panel?.box ?? p.popup.rect;
  const cx = w.rect.x + w.rect.w / 2;
  const cy = w.rect.y + w.rect.h / 2;
  return cx > r.x + r.w * 0.75 && cy < r.y + Math.min(r.h * 0.3, 64);
}
