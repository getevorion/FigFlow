/**
 * Control recognition on one frame. Each recognizer looks at "units" (a
 * surface plus the content sitting on it, see scene.ts) and scores how much
 * they look like a control, recording why. Explicit hints win over looks:
 * name tags, component/variant names, then prototype clicks, then anatomy.
 */
import { colorEq, luminance } from "../model/math";
import type { DesignNode, Rect, RGBA } from "../model/types";
import { area, buildScene, center, centeredIn, clickLinks, contrast, mostlyInside, sameRow, subtree, textColor, unionRect, type El, type Scene } from "./scene";
import { parseTags, widgetKindFromName } from "./tags";
import type { NavGroup, Widget, WidgetKind } from "./types";

type Candidate = Omit<Widget, "id"> & { claimed: El[] };

let seq = 0;
const nid = (p: string) => `${p}${++seq}`;

function directTexts(s: El): El[] {
  return s.contents.filter((c) => c.role === "text" && c.text && c.text.trim());
}
function directIcons(s: El): El[] {
  return s.contents.filter((c) => c.role === "icon" || c.role === "image");
}
function innerSurfaces(s: El): El[] {
  return s.contents.filter((c) => c.role === "surface");
}
function isRound(e: El): boolean {
  return e.node.kind === "ELLIPSE" || e.radius >= Math.min(e.box.w, e.box.h) / 2 - 1.5;
}
function nearestLabel(scene: Scene, box: Rect, maxGap: number, exclude: Set<El>): El | null {
  let best: El | null = null;
  let bestD = Infinity;
  for (const e of scene.all) {
    if (e.role !== "text" || exclude.has(e) || !e.text?.trim()) continue;
    if (!sameRow(e.box, box, 0.45)) continue;
    const gap = e.box.x >= box.x + box.w ? e.box.x - (box.x + box.w) : box.x >= e.box.x + e.box.w ? box.x - (e.box.x + e.box.w) : -1;
    if (gap < 0 || gap > maxGap) continue;
    if (gap < bestD) {
      bestD = gap;
      best = e;
    }
  }
  return best;
}

function claimedNodes(els: El[]): DesignNode[] {
  return els.map((e) => e.node);
}

function stroked(e: El): boolean {
  return !!e.node.stroke && e.node.strokes.some((p) => p.visible);
}

/** HSV saturation, 0 (gray) to 1. */
function saturation(c: RGBA | undefined): number {
  if (!c) return 0;
  const hi = Math.max(c.r, c.g, c.b);
  return hi <= 0 ? 0 : (hi - Math.min(c.r, c.g, c.b)) / hi;
}

/** How different two paints look: distance of their premultiplied colours (0..2). */
function paintDistance(a: RGBA | undefined, b: RGBA | undefined): number {
  const pa = a ? [a.r * a.a, a.g * a.a, a.b * a.a, a.a] : [0, 0, 0, 0];
  const pb = b ? [b.r * b.a, b.g * b.a, b.b * b.a, b.a] : [0, 0, 0, 0];
  return Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2], pa[3] - pb[3]);
}

function fontSizeOf(e: El): number {
  return e.node.text?.runs[0]?.fontSize ?? 0;
}

/**
 * The caption naming a control that has no label of its own (a key bind showing "Mouse 1", a
 * drop-down showing "Outlined"): the heading above it, lined up with it (the biggest text there,
 * so "Box" beats its smaller description), else a label on its left.
 */
function captionFor(s: El, scene: Scene, own: El[]): El | null {
  const skip = new Set(own);
  const above = scene.all.filter(
    (e) => e.role === "text" && !skip.has(e) && shortLine(e) && e.box.y + e.box.h <= s.box.y + 1 && s.box.y - (e.box.y + e.box.h) <= 56 && Math.abs(e.box.x - s.box.x) <= 32,
  );
  const heading = above.sort((a, b) => fontSizeOf(b) - fontSizeOf(a) || b.box.y - a.box.y)[0];
  if (heading) return heading;
  return scene.all.find((e) => e.role === "text" && !skip.has(e) && shortLine(e) && sameRow(e.box, s.box, 0.45) && e.box.x + e.box.w <= s.box.x && s.box.x - (e.box.x + e.box.w) <= 60) ?? null;
}

/**
 * A form field's own label: the short line just above it, lined up with it. Text beside a field
 * isn't taken: in a header that's the tab next to the search box.
 */
function fieldLabel(s: El, scene: Scene, own: El[]): El | null {
  const skip = new Set(own);
  return (
    scene.all
      .filter((e) => e.role === "text" && !skip.has(e) && shortLine(e) && e.box.y + e.box.h <= s.box.y + 1 && s.box.y - (e.box.y + e.box.h) <= 16 && Math.abs(e.box.x - s.box.x) <= 16)
      .sort((a, b) => b.box.y + b.box.h - (a.box.y + a.box.h))[0] ?? null
  );
}

/** A single short line of text: a label, a tab, a caption. */
function shortLine(e: El): boolean {
  const t = e.text?.trim() ?? "";
  return !!t && t.length <= 28 && !t.includes("\n") && (e.node.text?.lines.length ?? 1) <= 1;
}

// --- recognizers ----------------------------------------------------------------

function toggle(s: El, scene: Scene): Candidate | null {
  const { w, h } = s.box;
  if (h < 10 || h > 48 || w / h < 1.35 || w / h > 3.3 || !isRound(s)) return null;
  if (directTexts(s).length) return null;
  // The knob: a round surface, or a vector (a circle drawn as a path) on the track.
  const onTrack = (e: El) => e !== s && e.z > s.z && mostlyInside(e.box, { x: s.box.x - 2, y: s.box.y - 2, w: s.box.w + 4, h: s.box.h + 4 }, 0.95);
  const knob = [...innerSurfaces(s), ...directIcons(s)]
    .concat(scene.all.filter((e) => (e.role === "surface" || e.role === "icon") && onTrack(e)))
    .find(
      (k) =>
        (isRound(k) || (k.role === "icon" && !k.hasImage)) &&
        Math.abs(k.box.w - k.box.h) <= Math.max(2, k.box.h * 0.2) &&
        k.box.h >= h * 0.45 &&
        k.box.h <= h * 1.15 &&
        Math.abs(center(k.box).y - center(s.box).y) <= h * 0.2,
    );
  if (!knob) return null;
  const on = center(knob.box).x > center(s.box).x;
  const label = nearestLabel(scene, s.box, 260, new Set());
  const els = [s, knob, ...(label ? [label] : [])];
  return {
    kind: "toggle",
    nodes: claimedNodes([s, knob]),
    claimed: els,
    rect: unionRect(els.map((e) => e.box)),
    surface: s.node,
    label: label ? { node: label.node, text: label.text!.trim() } : undefined,
    parts: { track: s.node, knob: knob.node },
    value: on,
    evidence: { score: 0.85, reasons: [`pill ${Math.round(w)}×${Math.round(h)} with a round knob on the ${on ? "right (on)" : "left (off)"}`] },
  };
}

/** A small square or circle sitting inside another one is its mark (a radio's dot), not a control. */
function isMarkOf(s: El): boolean {
  const h = s.host;
  return !!h && h.role === "surface" && h.box.w <= 34 && Math.abs(h.box.w - h.box.h) <= Math.max(2, h.box.w * 0.15) && h.box.w > s.box.w && mostlyInside(s.box, h.box, 0.99);
}

function checkbox(s: El, scene: Scene): Candidate | null {
  const { w, h } = s.box;
  if (w < 9 || w > 34 || Math.abs(w - h) > Math.max(2, w * 0.15)) return null;
  if (directTexts(s).length || isMarkOf(s)) return null;
  const round = isRound(s);
  // The mark sits on the box; in a hollow (outline-only) box it may be painted under the
  // outline and still show (a radio's dot drawn before its ring).
  const hollow = !s.fill || s.fill.a < 0.05;
  const mark =
    [...directIcons(s), ...innerSurfaces(s)].find((c) => c.box.w <= w && c.box.h <= h) ??
    (hollow
      ? scene.all.find((e) => e !== s && e.z < s.z && (e.role === "surface" || e.role === "icon") && !e.contents.length && e.box.w < w && e.box.h < h && mostlyInside(e.box, s.box, 0.95) && centeredIn(e.box, s.box, w * 0.2, h * 0.2))
      : undefined);
  const label = nearestLabel(scene, s.box, 48, new Set());
  if (!label && !mark) return null;
  // Empty boxes are outlined or neutral: a filled dot with a caption is a status light
  // ("● Undetected"), a coloured square a swatch.
  if (!mark && !stroked(s) && (round || saturation(s.fill) > 0.35)) return null;
  const els = [s, ...(mark ? [mark] : []), ...(label ? [label] : [])];
  return {
    kind: round ? "radio" : "checkbox",
    nodes: claimedNodes([s, ...(mark ? [mark] : [])]),
    claimed: els,
    rect: unionRect(els.map((e) => e.box)),
    surface: s.node,
    label: label ? { node: label.node, text: label.text!.trim() } : undefined,
    parts: { box: s.node, mark: mark?.node },
    value: !!mark,
    evidence: { score: label ? 0.8 : 0.55, reasons: [`${round ? "circle" : "square"} ${Math.round(w)}px${mark ? " with a mark (checked)" : " (unchecked)"}${label ? `, label "${label.text!.trim()}"` : ""}`] },
  };
}

/** A layer named as a button: whole words only ("Rectangle" contains "cta"). */
const BUTTON_NAME = /\b(?:button|btn|cta)\b/i;
const SEARCH_HINT =/^(?:search|find|поиск|найти|ara|arama|buscar|suche|rechercher|recherche|cerca|pesquisar)\b/i;
const SEARCH_ICON = /search|magnif|loupe|lupa|поиск/i;
const PASSWORD = /password|passcode|пароль|şifre|parola|contraseña|passwort|mot de passe/i;

/** "3 ms", "5.4", "75%": a number with at most a short unit. */
const NUMERIC = /^[-−+]?\d+(?:[.,]\d+)?\s*[\p{L}%°]{0,4}$/u;

function slider(s: El, scene: Scene): Candidate | null {
  const { h } = s.box;
  if (h < 1.5 || h > 14 || s.box.w < 50 || s.box.w / h < 6) return null;
  const cy = center(s.box).y;
  // A bar can be drawn in pieces: the track, and a fill that may start before it or run past it.
  const bars = scene.all.filter(
    (e) => e.role === "surface" && Math.abs(e.box.h - h) <= 3 && Math.abs(center(e.box).y - cy) <= Math.max(2, h * 0.5) && e.box.x <= s.box.x + s.box.w + 2 && e.box.x + e.box.w >= s.box.x - 2,
  );
  // The slider is its first-painted bar's (the track); the bars over it are its fill.
  if (bars.some((b) => b.z < s.z)) return null;
  const x0 = Math.min(...bars.map((b) => b.box.x));
  const x1 = Math.max(...bars.map((b) => b.box.x + b.box.w));
  const span = x1 - x0;
  const near = scene.all.filter((e) => e !== s && e.z > s.z && (e.role === "surface" || e.role === "icon") && Math.abs(center(e.box).y - cy) <= Math.max(h, 4) && e.box.x >= x0 - 12 && e.box.x + e.box.w <= x1 + 12);
  const fill = bars.find((e) => e !== s && Math.abs(e.box.x - x0) <= 2 && e.box.w < span - 2 && (!s.fill || !e.fill || !colorEq(s.fill, e.fill)));
  const thumb = near.find((e) => e.role === "surface" && isRound(e) && e.box.h >= h && e.box.h <= 40 && Math.abs(e.box.w - e.box.h) <= e.box.h * 0.35);
  if (!fill && !thumb) return null;
  const pos = thumb ? center(thumb.box).x : fill ? fill.box.x + fill.box.w : x0;
  const value = Math.max(0, Math.min(1, (pos - x0) / span));
  const bar: Rect = { x: x0, y: s.box.y, w: span, h };
  // Its number: under or over the thumb (moving with it), or at the bar's end.
  const shown = scene.all.find(
    (e) =>
      e.role === "text" &&
      NUMERIC.test(e.text?.trim() ?? "") &&
      ((thumb && Math.abs(center(e.ink).x - center(thumb.box).x) <= 16 && Math.abs(center(e.ink).y - cy) <= 28) || (sameRow(e.box, bar, 0.6) && e.box.x >= x1 && e.box.x - x1 <= 60)),
  );
  // Its label: a text beside it on its row, else the heading above it, lined up with it.
  const left = nearestLabel(scene, bar, 80, new Set(shown ? [shown] : []));
  const beside = left && left.box.x + left.box.w <= bar.x ? left : null;
  const above = scene.all.filter((e) => e.role === "text" && e !== shown && !!e.text?.trim() && e.box.y + e.box.h <= bar.y + 1 && bar.y - (e.box.y + e.box.h) <= 64 && Math.abs(e.box.x - x0) <= 28);
  const label = (beside && !NUMERIC.test(beside.text!.trim()) ? beside : null) ?? above.sort((a, b) => fontSizeOf(b) - fontSizeOf(a) || b.box.y - a.box.y)[0] ?? null;
  // A grip or dot drawn on the thumb moves with it.
  const mark = thumb && thumb.contents.length === 1 && mostlyInside(thumb.contents[0].box, thumb.box, 0.95) ? thumb.contents[0] : undefined;
  const els = [...bars, ...(thumb ? [thumb] : []), ...(mark ? [mark] : []), ...(shown ? [shown] : [])];
  return {
    kind: "slider",
    nodes: claimedNodes(els),
    claimed: els,
    rect: unionRect(els.map((e) => e.box)),
    surface: s.node,
    label: label ? { node: label.node, text: label.text!.trim() } : undefined,
    parts: { track: s.node, fill: fill?.node, thumb: thumb?.node, thumbMark: mark?.node, value: shown?.node },
    value,
    evidence: { score: fill && thumb ? 0.9 : 0.7, reasons: [`track ${Math.round(span)}×${Math.round(h)}${fill ? " with a fill" : ""}${thumb ? " and a thumb" : ""}, value ${(value * 100).toFixed(0)}%${shown ? ` shown as "${shown.text!.trim()}"` : ""}`] },
  };
}

function field(s: El, scene: Scene): Candidate | null {
  const { w, h } = s.box;
  // Compact drop-downs in dense menus run 16-20 px tall; typing boxes are taller.
  if (h < 16 || h > 76 || w < h * 3) return null;
  const texts = directTexts(s);
  const icons = directIcons(s);
  // A magnifier at the right end makes a search box, not a drop-down.
  const searchy = SEARCH_HINT.test(texts[0]?.text?.trim() ?? "") || [s, ...icons].some((i) => SEARCH_ICON.test(i.node.name)) || SEARCH_ICON.test(s.parent?.node.name ?? "");
  const chevron = searchy ? undefined : icons.find((i) => i.box.x > s.box.x + w * 0.7 && i.box.w <= 28 && i.box.h <= 28);
  if (texts.length > 1) return null;
  const t = texts[0];
  const nameKind = widgetKindFromName(s.node.name) ?? (s.parent ? widgetKindFromName(s.parent.node.name) : null);
  if (t) {
    const leftAligned = t.ink.x - s.box.x <= Math.max(w * 0.3, 48) && center(t.ink).x < center(s.box).x;
    const vCentered = Math.abs(center(t.ink).y - center(s.box).y) <= h * 0.25;
    if (!vCentered) return null;
    // A wide row with a sentence and a chevron is an accordion or list item, not a drop-down.
    const value = t.text!.trim();
    const listRow = nameKind !== "combo" && ((w > 360 && /\?$/.test(value)) || (w > 480 && value.length > 32));
    if (chevron && leftAligned && !listRow && h >= 16) {
      const caption = captionFor(s, scene, [t]);
      return {
        kind: "combo",
        nodes: claimedNodes([s, t, chevron]),
        claimed: [s, t, chevron],
        rect: s.box,
        surface: s.node,
        label: caption ? { node: caption.node, text: caption.text!.trim() } : undefined,
        parts: { value: t.node, chevron: chevron.node },
        value: t.text!.trim(),
        evidence: { score: 0.85, reasons: [`box with a value "${t.text!.trim()}" and a chevron${caption ? `, captioned "${caption.text!.trim()}"` : ""}`] },
      };
    }
    const c = contrast(textColor(t), s.fill);
    // Placeholders are muted: gray or faded text. Contrast against a see-through
    // surface says nothing (it depends on what is behind it), and bright,
    // all-caps text is a caption, not a hint.
    const tc = textColor(t);
    const muted = !!tc && (tc.a < 0.75 || (luminance(tc) > 0.02 && luminance(tc) < 0.45));
    const caption = t.text!.trim() === t.text!.trim().toUpperCase() && /[A-Za-zА-Яа-я]/.test(t.text!) && t.text!.trim().length > 10;
    const hint = /enter|type|search|password|email|username|key|girin|введите|ключ/i.test(t.text!);
    const placeholder = hint || (muted && !caption && (c < 3.2 || (s.fill?.a ?? 0) < 0.25));
    if (!leftAligned || !(placeholder || nameKind === "text_field") || h < 22) return null;
    const search = icons.find((i) => i.box.w <= 28 && (i.box.x < t.box.x || (searchy && i.box.x > s.box.x + w * 0.6)));
    const label = searchy ? null : fieldLabel(s, scene, [t]);
    const password = PASSWORD.test(t.text!) || /password/i.test(s.node.name) || (!!label && PASSWORD.test(label.text!));
    return {
      kind: "text_field",
      nodes: claimedNodes([s, t, ...(search ? [search] : [])]),
      claimed: [s, t, ...(search ? [search] : [])],
      rect: s.box,
      surface: s.node,
      label: label ? { node: label.node, text: label.text!.trim() } : undefined,
      parts: { placeholder: t.node, icon: search?.node },
      value: password ? "password" : search ? "search" : "text",
      evidence: { score: placeholder ? 0.85 : 0.65, reasons: [`wide box with ${placeholder ? "placeholder" : "hint"} text "${t.text!.trim()}"${search ? " and a search icon" : ""}`] },
    };
  }
  // Empty box under a label.
  if (!icons.length && !innerSurfaces(s).length) {
    const above = scene.all.find((e) => e.role === "text" && e.text?.trim() && e.box.y + e.box.h <= s.box.y && s.box.y - (e.box.y + e.box.h) <= 14 && Math.abs(e.box.x - s.box.x) <= 16);
    if (above && h >= 28)
      return {
        kind: "text_field",
        nodes: claimedNodes([s]),
        claimed: [s],
        rect: s.box,
        surface: s.node,
        label: { node: above.node, text: above.text!.trim() },
        parts: {},
        value: "text",
        evidence: { score: 0.6, reasons: [`empty box under the label "${above.text!.trim()}"`] },
      };
  }
  return null;
}

/** What a key-bind box shows: a key, a mouse button, or that none is set. Word keys only in capitals
 *  ("HOME", not "Home": a small "Home" button is a button). */
const KEY_NAME =
  /^(?:\[?[A-Z0-9]\]?|[Ff](?:[1-9]|1\d|2[0-4])|[Nn]one|NONE|\.\.\.|…|-|—|[LRM]MB|(?:MOUSE|Mouse|mouse)\s?[1-5]|M(?:B)?[1-5]|X[12]|INS(?:ERT)?|DEL(?:ETE)?|HOME|END|PG ?(?:UP|DN|DOWN)|[LR]?SHIFT|[LR]?CTRL|[LR]?ALT|TAB|CAPS(?: ?LOCK)?|SPACE|ESC(?:APE)?|ENTER|RETURN|BACKSPACE|UP|DOWN|LEFT|RIGHT|NUM ?\d|(?:Key|KEY|key)\s*["“'«][^"”'»]+["”'»])$/;
const KEY_CONTEXT = /\b(?:key|keys|bind|binds|keybind|hotkey|shortcut)\b|клавиш|бинд|tuş|tecla|taste/i;

function keybind(s: El, scene: Scene): Candidate | null {
  const { w, h } = s.box;
  if (h < 16 || h > 44 || w > 220 || w < h * 0.9) return null;
  const texts = directTexts(s);
  const icons = directIcons(s);
  // At most a keyboard glyph before the key's name.
  if (texts.length !== 1 || icons.length > 1 || (icons.length === 1 && icons[0].box.x > texts[0].box.x)) return null;
  const t = texts[0].text!.trim();
  if (!KEY_NAME.test(t)) return null;
  const content = unionRect([texts[0].ink, ...icons.map((i) => i.box)]);
  if (!centeredIn(content, s.box, w * 0.2, h * 0.3)) return null;
  // Wider than a key cap: only with a caption or layer name that says it binds a key.
  if (w > 110) {
    const names = [s.node.name, s.parent?.node.name ?? "", s.parent?.parent?.node.name ?? ""];
    const captions = scene.all.filter(
      (e) => e.role === "text" && e !== texts[0] && ((e.box.y + e.box.h <= s.box.y + 1 && s.box.y - (e.box.y + e.box.h) <= 56 && Math.abs(e.box.x - s.box.x) <= 32) || (sameRow(e.box, s.box, 0.45) && e.box.x + e.box.w <= s.box.x && s.box.x - (e.box.x + e.box.w) <= 60)),
    );
    if (!names.some((n) => KEY_CONTEXT.test(n)) && !captions.some((e) => KEY_CONTEXT.test(e.text ?? ""))) return null;
  }
  // Numbers in a row of look-alike boxes are pages ("1 2 3 …"), not keys.
  if (/^\d+$/.test(t) && !/key|bind|hotkey/i.test(s.node.name)) {
    const near = (e: El) => e !== s && e !== texts[0] && sameRow(e.box, s.box, 0.3) && Math.abs(center(e.box).x - center(s.box).x) <= w * 6;
    // Other page numbers may be boxed or bare text.
    const pages = scene.all.filter((e) => near(e) && e.role === "text" && /^(\d+|\.\.\.|…)$/.test(e.text?.trim() ?? ""));
    const boxes = scene.all.filter((e) => near(e) && e.role === "surface" && Math.abs(e.box.h - h) <= 2);
    if (pages.length >= 1 || boxes.length >= 2) return null;
  }
  const caption = captionFor(s, scene, [texts[0]]);
  return {
    kind: "keybind",
    nodes: claimedNodes([s, texts[0], ...icons]),
    claimed: [s, texts[0], ...icons],
    rect: s.box,
    surface: s.node,
    label: caption ? { node: caption.node, text: caption.text!.trim() } : undefined,
    parts: { key: texts[0].node, icon: icons[0]?.node },
    value: t,
    evidence: { score: 0.8, reasons: [`box with the key name "${t}"`] },
  };
}

function button(s: El, scene: Scene): Candidate | null {
  const { w, h } = s.box;
  const frameArea = scene.size.x * scene.size.y;
  if (h < 16 || h > 110 || w < h * 0.7 || area(s.box) > frameArea * 0.2) return null;
  const texts = directTexts(s);
  const icons = directIcons(s);
  // A glyph drawn with small shapes (a hamburger's three bars) is the plate's icon too.
  const glyph = !texts.length && !icons.length ? innerSurfaces(s).filter((e) => !e.contents.length && area(e.box) < area(s.box) * 0.3) : [];
  if (!texts.length && !icons.length && (!glyph.length || glyph.length !== innerSurfaces(s).length)) return null;
  if (texts.length > 2 || icons.length > 3) return null;
  // Content grouped together and centered in the surface.
  const content = unionRect([...texts.map((e) => e.ink), ...icons.map((e) => e.box), ...glyph.map((e) => e.box)]);
  const centered = centeredIn(content, s.box, Math.max(6, w * 0.12), Math.max(4, h * 0.2));
  if (!centered && !(icons.length && texts.length && sameRow(icons[0].box, texts[0].box))) return null;
  // A wide row with its content bunched at one end is a header or list row, not a button.
  if (!centered && w > 320 && content.w < w * 0.4) return null;
  if (texts.length) {
    const c = contrast(textColor(texts[0]), s.fill);
    if (c < 2.2 && (s.fill?.a ?? 0) >= 0.25 && !BUTTON_NAME.test(s.node.name)) return null; // reads like a placeholder, not a label
    // A sentence on a plate is a message banner; button labels are a few words.
    const words = texts[0].text!.trim().split(/\s+/).length;
    if ((texts[0].text!.trim().length > 40 || words > 6) && !BUTTON_NAME.test(`${s.node.name} ${s.parent?.node.name ?? ""}`)) return null;
    // Chips and tags: outline-only (or nearly clear) small pills with small text stay static.
    const size = texts[0].node.text?.runs[0]?.fontSize ?? 14;
    if (h <= 32 && (s.fill?.a ?? 0) < 0.15 && size <= 13 && !BUTTON_NAME.test(s.node.name)) return null;
  }
  const iconOnly = !texts.length;
  if (iconOnly && (w / h > 1.8 || w > 96)) return null;
  // An icon plate with its caption underneath (a sidebar or tab-bar item): the caption is its label.
  const caption = iconOnly ? captionBelow(s, scene) : null;
  const label = texts[0] ?? caption ?? undefined;
  const els = [s, ...texts, ...icons, ...glyph, ...(caption ? [caption] : [])];
  return {
    kind: iconOnly && !caption ? "icon_button" : "button",
    nodes: claimedNodes(els),
    claimed: els,
    rect: caption ? unionRect([s.box, caption.box]) : s.box,
    surface: s.node,
    label: label ? { node: label.node, text: label.text!.trim() } : undefined,
    icon: icons[0]?.node,
    parts: {},
    evidence: {
      score: 0.7 + (BUTTON_NAME.test(s.node.name) || (s.parent && BUTTON_NAME.test(s.parent.node.name)) ? 0.15 : 0),
      reasons: [
        caption
          ? `${Math.round(w)}×${Math.round(h)} icon plate captioned "${caption.text!.trim()}"`
          : iconOnly
            ? `${Math.round(w)}×${Math.round(h)} surface with a centered icon`
            : `${Math.round(w)}×${Math.round(h)} surface with the centered label "${label!.text!.trim()}"`,
      ],
    },
  };
}

/** A short text right under a plate, centred on it, not sitting on a small surface of its own. */
function captionBelow(s: El, scene: Scene): El | null {
  const bottom = s.box.y + s.box.h;
  const cx = center(s.box).x;
  return (
    scene.all.find(
      (e) =>
        e.role === "text" &&
        shortLine(e) &&
        e.box.y >= bottom - 2 &&
        e.ink.y - bottom <= 20 &&
        Math.abs(center(e.ink).x - cx) <= Math.max(6, s.box.w * 0.15) &&
        e.ink.w <= s.box.w * 2.4 &&
        (!e.host || area(e.host.box) > area(s.box) * 4),
    ) ?? null
  );
}

/** Anything with a prototype click is interactive, whatever it looks like. */
function prototypeClick(e: El): Candidate | null {
  const click = clickLinks(e.node)[0];
  if (!click) return null;
  const els = subtree(e);
  const texts = els.filter((x) => x.role === "text" && x.text?.trim());
  return {
    kind: texts.length ? "button" : "icon_button",
    nodes: [e.node],
    claimed: els,
    rect: e.box,
    surface: e.node,
    label: texts[0] ? { node: texts[0].node, text: texts[0].text!.trim() } : undefined,
    parts: {},
    evidence: { score: 0.95, reasons: [`prototype: on click, ${click.action.kind.toLowerCase().replace("_", " ")}`] },
  };
}

/** Close / minimize / maximize marks along the top-right edge. */
function windowButtons(scene: Scene): Candidate[] {
  const { x: W, y: H } = scene.size;
  const zone: Rect = { x: W * 0.6, y: 0, w: W * 0.4, h: Math.max(48, H * 0.16) };
  const marks = scene.all.filter((e) => (e.role === "icon" || (e.role === "surface" && !e.contents.length)) && e.box.w >= 6 && e.box.w <= 40 && e.box.h <= 40 && mostlyInside(e.box, zone, 0.9) && !e.text);
  const named = (e: El) => {
    const n = `${e.node.name} ${e.parent?.node.name ?? ""}`.toLowerCase();
    if (/close|exit|\bx\b|cross|clear/.test(n)) return "close";
    if (/minimi[sz]e|\bmin\b|minus|dash|hide/.test(n)) return "minimize";
    if (/maximi[sz]e|\bmax\b|fullscreen|square|restore/.test(n)) return "maximize";
    return null;
  };
  // Must sit in a row near the right edge.
  // Marks line up along the edge, though their boxes may sit a few pixels apart (a minimize dash is drawn low).
  const row = marks.filter((m) => marks.some((o) => o !== m && Math.abs(center(o.box).y - center(m.box).y) <= Math.max(o.box.h, m.box.h) * 1.5 + 2)).sort((a, b) => b.box.x - a.box.x);
  const pool = row.length >= 2 ? row : marks.filter((m) => named(m));
  const out: Candidate[] = [];
  pool.slice(0, 3).forEach((m, i) => {
    const byName = named(m);
    const action = (byName ?? (["close", pool.length === 3 ? "maximize" : "minimize", "minimize"][i] as "close" | "minimize" | "maximize")) as "close" | "minimize" | "maximize";
    out.push({
      kind: "window_button",
      nodes: [m.node],
      claimed: [m],
      rect: { x: m.box.x - 6, y: m.box.y - 6, w: m.box.w + 12, h: m.box.h + 12 },
      surface: m.node,
      parts: {},
      action,
      evidence: { score: byName ? 0.95 : 0.8, reasons: [`${action} mark along the top-right edge${byName ? ` (named "${m.node.name}")` : ""}`] },
    });
  });
  return out;
}

/** Items of similar size in a line where exactly one looks different. */
function navGroups(scene: Scene, units: Candidate[]): { navs: NavGroup[]; items: Map<Candidate, number> } {
  const navs: NavGroup[] = [];
  const items = new Map<Candidate, number>();
  const pool = units.filter((u) => (u.kind === "button" || u.kind === "icon_button") && u.surface);
  const used = new Set<Candidate>();
  const similar = (a: Candidate, b: Candidate) =>
    Math.abs(a.rect.w - b.rect.w) <= Math.max(3, b.rect.w * 0.12) && Math.abs(a.rect.h - b.rect.h) <= Math.max(3, b.rect.h * 0.12);

  for (const axis of ["vertical", "horizontal"] as const) {
    const along = (u: Candidate) => (axis === "vertical" ? u.rect.y : u.rect.x);
    const size = (u: Candidate) => (axis === "vertical" ? u.rect.h : u.rect.w);
    const across = (u: Candidate) => (axis === "vertical" ? center(u.rect).x : center(u.rect).y);
    // Columns (or rows) of aligned items.
    const lanes: Candidate[][] = [];
    for (const u of pool) {
      if (used.has(u)) continue;
      const lane = lanes.find((l) => Math.abs(across(l[0]) - across(u)) <= 3);
      if (lane) lane.push(u);
      else lanes.push([u]);
    }
    for (const lane of lanes) {
      lane.sort((a, b) => along(a) - along(b));
      // Runs of similar items with a steady gap: find every maximal segment of
      // equal gaps, then give items to the longest segments first (an item that
      // borders two spacings belongs to the longer run).
      const gaps = lane.slice(1).map((u, i) => along(u) - (along(lane[i]) + size(lane[i])));
      const segments: Array<[number, number]> = [];
      for (let i = 0; i < gaps.length; i++) {
        if (gaps[i] < -1 || gaps[i] > Math.max(size(lane[i]), 8) * 1.5) continue;
        let j = i;
        while (j + 1 < gaps.length && Math.abs(gaps[j + 1] - gaps[i]) <= 4) j++;
        segments.push([i, j + 1]);
      }
      segments.sort((a, b) => b[1] - b[0] - (a[1] - a[0]));
      const inRun = new Set<number>();
      const runs: Candidate[][] = [];
      for (const [a, b] of segments) {
        const run: number[] = [];
        for (let k = a; k <= b; k++) {
          if (inRun.has(k)) {
            if (run.length) break;
            continue;
          }
          if (run.length && !similar(lane[k], lane[run[0]])) break;
          run.push(k);
        }
        if (run.length >= 2) {
          for (const k of run) inRun.add(k);
          runs.push(run.map((k) => lane[k]));
        }
      }

      for (const line of runs) {
        if (line.length < 2) continue;
        // The selected item looks different from all the others, which look alike: its plate
        // (a colour apart, not just lighter or darker) or its label.
        const looks = line.map((u) => {
          const label = u.label ? scene.byId.get(u.label.node.id) : undefined;
          return { fill: scene.byId.get(u.surface!.id)?.fill, ink: label ? textColor(label) : undefined };
        });
        const differ = (a: (typeof looks)[number], b: (typeof looks)[number]) => paintDistance(a.fill, b.fill) > 0.06 || (!!a.ink && !!b.ink && paintDistance(a.ink, b.ink) > 0.12);
        const alike = looks.map((l, i) => looks.filter((o, j) => j !== i && !differ(l, o)).length);
        const selected = alike.findIndex((c) => c === 0);
        if (selected < 0 || alike.filter((c) => c === 0).length !== 1 || alike.some((c, i) => i !== selected && c !== line.length - 2)) continue;
        const nav: NavGroup = {
          id: nid("nav"),
          items: [],
          selected,
          axis,
          rect: unionRect(line.map((u) => u.rect)),
          evidence: { score: 0.85, reasons: [`${line.length} ${axis === "vertical" ? "stacked" : "side-by-side"} items, item ${selected + 1} highlighted`] },
        };
        line.forEach((u, i) => {
          used.add(u);
          items.set(u, navs.length);
          u.kind = "nav_item";
          u.value = i === selected;
        });
        navs.push(nav);
      }
    }
  }
  return { navs, items };
}

/**
 * Tab bars drawn as plain words in a row, one coloured differently: the selected tab (often on
 * a plate, or underlined). Words already taken by a small button (the selected tab's plate, a
 * word with a prototype click) join as that button. Every item gets the selected tab's height.
 */
function textTabs(scene: Scene, accepted: Candidate[], taken: Set<El>, inNav: Map<Candidate, number>): Array<{ nav: NavGroup; members: Candidate[]; created: Candidate[] }> {
  const buttonOf = new Map<El, Candidate>();
  for (const c of accepted) {
    if ((c.kind !== "button" && c.kind !== "icon_button") || !c.label || inNav.has(c) || c.rect.w > 260 || c.rect.h > 96) continue;
    const t = scene.byId.get(c.label.node.id);
    if (t) buttonOf.set(t, c);
  }
  const words = scene.all.filter((e) => e.role === "text" && shortLine(e) && /[\p{L}\p{N}]/u.test(e.text ?? "") && (buttonOf.has(e) || !taken.has(e)));
  const rows: El[][] = [];
  for (const w of words) {
    const row = rows.find((r) => Math.abs(fontSizeOf(r[0]) - fontSizeOf(w)) <= 0.5 && Math.abs(center(r[0].ink).y - center(w.ink).y) <= 3);
    if (row) row.push(w);
    else rows.push([w]);
  }
  const out: Array<{ nav: NavGroup; members: Candidate[]; created: Candidate[] }> = [];
  for (const row of rows) {
    if (row.length < 3) continue;
    row.sort((a, b) => a.ink.x - b.ink.x);
    // Runs of words spaced like tabs: no overlaps, no gap far wider than the typical one.
    const gaps = row.slice(1).map((e, i) => e.ink.x - (row[i].ink.x + row[i].ink.w));
    const median = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
    const runs: El[][] = [[row[0]]];
    gaps.forEach((g, i) => {
      if (g < 6 || g > Math.max(48, median * 2.5)) runs.push([row[i + 1]]);
      else runs[runs.length - 1].push(row[i + 1]);
    });
    for (const run of runs) {
      if (run.length < 3) continue;
      const inks = run.map(textColor);
      const alike = inks.map((c, i) => inks.filter((o, j) => j !== i && paintDistance(c, o) <= 0.12).length);
      let selected = alike.findIndex((c) => c === 0);
      const uniform = selected >= 0 && alike.filter((c) => c === 0).length === 1 && alike.every((c, i) => i === selected || c === run.length - 2);
      if (!uniform) {
        // Same colours: the one word on a plate is the selected tab.
        const plated = run.map((e, i) => (buttonOf.get(e)?.surface && buttonOf.get(e)!.surface!.id !== e.node.id ? i : -1)).filter((i) => i >= 0);
        if (plated.length !== 1 || alike.some((c) => c !== run.length - 1)) continue;
        selected = plated[0];
      }
      // Hit areas: the selected tab's plate, or the words padded.
      const sel = buttonOf.get(run[selected]);
      const plate = sel?.surface && sel.surface.id !== run[selected].node.id ? sel.rect : null;
      const padX = plate ? Math.max(4, (plate.w - run[selected].ink.w) / 2) : 8;
      const members: Candidate[] = [];
      const created: Candidate[] = [];
      run.forEach((e, i) => {
        const rect: Rect = plate ? { x: e.ink.x - padX, y: plate.y, w: e.ink.w + padX * 2, h: plate.h } : { x: e.ink.x - padX, y: e.ink.y - 6, w: e.ink.w + padX * 2, h: e.ink.h + 12 };
        const own = buttonOf.get(e);
        const c: Candidate = own ?? {
          kind: "nav_item",
          nodes: [e.node],
          claimed: [e],
          rect,
          label: { node: e.node, text: e.text!.trim() },
          parts: {},
          evidence: { score: 0.8, reasons: [] },
        };
        if (own && i !== selected) c.rect = rect;
        c.kind = "nav_item";
        c.value = i === selected;
        c.evidence = { score: Math.max(c.evidence.score, 0.8), reasons: [...c.evidence.reasons, `word ${i + 1} of a ${run.length}-word tab bar`] };
        members.push(c);
        if (!own) created.push(c);
      });
      out.push({
        members,
        created,
        nav: {
          id: nid("nav"),
          items: [],
          selected,
          axis: "horizontal",
          rect: unionRect(members.map((m) => m.rect)),
          evidence: { score: 0.8, reasons: [`${run.length} words in a row, "${run[selected].text!.trim()}" ${uniform ? "coloured apart" : "on a plate"}`] },
        },
      });
    }
  }
  return out;
}

export type DetectResult = { scene: Scene; widgets: Widget[]; navs: NavGroup[] };

export function detectWidgets(root: DesignNode, opts: { exclude?: Set<string>; scene?: Scene } = {}): DetectResult {
  const scene = opts.scene ?? buildScene(root);
  const candidates: Candidate[] = [];
  const staticRoots = new Set<El>();
  for (const e of scene.all) for (const t of parseTags(e.node.name)) if (t.kind === "static") staticRoots.add(e);
  const inStatic = (e: El) => {
    for (let p: El | null = e; p; p = p.parent) if (staticRoots.has(p)) return true;
    return false;
  };

  // 1. Explicit: widget tags and prototype clicks.
  const excluded = (e: El) => {
    for (let p: El | null = e; p; p = p.parent) if (opts.exclude?.has(p.node.id)) return true;
    return false;
  };
  for (const e of scene.all) {
    if (e === scene.root || inStatic(e) || excluded(e)) continue;
    const tags = parseTags(e.node.name);
    const w = tags.find((t) => t.kind === "widget");
    const nav = tags.find((t) => t.kind === "go" || t.kind === "back" || t.kind === "open" || t.kind === "show" || t.kind === "close" || t.kind === "window");
    if (w || nav) {
      const texts = subtree(e).filter((x) => x.role === "text" && x.text?.trim());
      const kind: WidgetKind = w && w.kind === "widget" ? w.widget : nav?.kind === "window" ? "window_button" : texts.length ? "button" : "icon_button";
      candidates.push({
        kind,
        nodes: [e.node],
        claimed: subtree(e),
        rect: e.box,
        surface: e.node,
        label: texts[0] ? { node: texts[0].node, text: texts[0].text!.trim() } : undefined,
        parts: {},
        action: nav?.kind === "window" ? nav.action : undefined,
        forced: true,
        evidence: { score: 1, reasons: [`layer name "${e.node.name}"`] },
      });
      continue;
    }
    const proto = prototypeClick(e);
    if (proto) candidates.push(proto);
  }

  // 2. Anatomy on every surface.
  for (const s of scene.all) {
    if (s === scene.root || (s.role !== "surface" && s.role !== "image") || inStatic(s) || excluded(s)) continue;
    // A picture can be a button (a thumbnail, a logo), never a box, track or field.
    for (const rec of s.role === "image" ? [button] : ([toggle, checkbox, slider, field, keybind, button] as const)) {
      const c = rec(s, scene);
      if (c) {
        candidates.push(c);
        break;
      }
    }
  }
  candidates.push(...windowButtons(scene).filter((c) => !c.claimed.some((e) => inStatic(e) || excluded(e))));

  // A prototype click on a group that is also a recognised button keeps the button's anatomy
  // (plate, label, icon: its looks), with the click. The group stays first in its layers.
  for (const p of candidates) {
    if (!p.evidence.reasons[0]?.startsWith("prototype") || p.kind !== "button" && p.kind !== "icon_button") continue;
    const root = scene.byId.get(p.nodes[0].id);
    if (!root || root.role !== "container") continue;
    const inside = new Set(subtree(root));
    const anat = candidates.find((c) => c !== p && (c.kind === "button" || c.kind === "icon_button") && c.surface && c.claimed.every((e) => inside.has(e)) && area(c.rect) >= area(p.rect) * 0.6);
    if (!anat) continue;
    Object.assign(p, { kind: anat.kind, surface: anat.surface, label: anat.label, icon: anat.icon, parts: anat.parts, rect: anat.rect, nodes: [p.nodes[0], ...anat.nodes] });
    p.evidence = { score: p.evidence.score, reasons: [...p.evidence.reasons, ...anat.evidence.reasons] };
  }

  // 3. Resolve overlaps: best score wins; an element belongs to one control.
  candidates.sort((a, b) => b.evidence.score - a.evidence.score || area(a.rect) - area(b.rect));
  const taken = new Set<El>();
  const accepted: Candidate[] = [];
  for (const c of candidates) {
    const els = new Set(c.claimed.flatMap(subtree));
    if ([...els].some((e) => taken.has(e))) continue;
    // A control inside another control's surface (e.g. an icon button in a button) loses.
    if (accepted.some((a) => a.surface && c.surface && mostlyInside(c.rect, a.rect, 0.9) && area(c.rect) < area(a.rect) && a.kind !== "nav_item")) continue;
    accepted.push(c);
    for (const e of els) taken.add(e);
  }

  // Tags: a grid of look-alike small pills with small words, none picked out and none linked,
  // lists things (features, keywords); it isn't a set of buttons.
  const pill = (c: Candidate) => c.kind === "button" && !c.forced && c.label && !c.icon && c.rect.h <= 26 && (c.label.node.text?.runs[0]?.fontSize ?? 99) <= 11 && !c.nodes.some((n) => clickLinks(n).length);
  const pills = accepted.filter(pill);
  const tagSets: Candidate[][] = [];
  for (const c of pills) {
    const set = tagSets.find((t) => Math.abs(t[0].rect.w - c.rect.w) <= Math.max(3, c.rect.w * 0.1) && Math.abs(t[0].rect.h - c.rect.h) <= 2);
    if (set) set.push(c);
    else tagSets.push([c]);
  }
  for (const set of tagSets) {
    if (set.length < 6) continue;
    const look = (c: Candidate) => ({ fill: c.surface ? scene.byId.get(c.surface.id)?.fill : undefined, ink: textColor(scene.byId.get(c.label!.node.id)!) });
    const first = look(set[0]);
    if (!set.every((c) => paintDistance(look(c).fill, first.fill) <= 0.06 && paintDistance(look(c).ink, first.ink) <= 0.12)) continue;
    for (const c of set) accepted.splice(accepted.indexOf(c), 1);
  }

  // 4. Navigation groups among the accepted buttons, then tab bars of plain words.
  const { navs, items } = navGroups(scene, accepted);
  for (const t of textTabs(scene, accepted, taken, items)) {
    accepted.push(...t.created);
    navs.push(t.nav);
    for (const m of t.members) items.set(m, navs.length - 1);
  }
  const widgets: Widget[] = accepted.map((c) => {
    const { claimed, ...w } = c;
    void claimed;
    return { ...w, id: nid(c.kind === "nav_item" ? "nav_item" : c.kind) };
  });
  for (const [cand, navIndex] of items) {
    const w = widgets[accepted.indexOf(cand)];
    navs[navIndex].items.push(w);
  }
  for (const n of navs) n.items.sort((a, b) => (n.axis === "vertical" ? a.rect.y - b.rect.y : a.rect.x - b.rect.x));
  return { scene, widgets, navs };
}
