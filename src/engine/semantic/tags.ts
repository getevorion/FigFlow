/**
 * Layer-name tags: plain-text hints designers (or the Figma plugin) put in
 * layer names. Case-insensitive; a dash works instead of the colon.
 * Compatible with the tags lazyuis popularized, plus explicit widget kinds.
 */
import type { WidgetKind } from "./types";

export type Tag =
  | { kind: "popup"; name: string }
  | { kind: "open"; name: string }
  | { kind: "close"; name?: string }
  | { kind: "notify"; name: string }
  | { kind: "show"; name: string }
  | { kind: "progress" }
  | { kind: "go"; name: string }
  | { kind: "back" }
  | { kind: "window"; action: "close" | "minimize" | "maximize" }
  | { kind: "static"; name?: string }
  | { kind: "nav"; which: "main" | "sub" }
  | { kind: "tab"; name: string }
  | { kind: "page"; name: string }
  | { kind: "widget"; widget: WidgetKind; name?: string };

const WIDGET_WORDS: Record<string, WidgetKind> = {
  button: "button",
  btn: "button",
  checkbox: "checkbox",
  check: "checkbox",
  radio: "radio",
  switch: "toggle",
  slider: "slider",
  range: "slider",
  input: "text_field",
  field: "text_field",
  textfield: "text_field",
  "text field": "text_field",
  search: "text_field",
  dropdown: "combo",
  combo: "combo",
  select: "combo",
  keybind: "keybind",
  hotkey: "keybind",
};

/** Parses one layer name into its tags (a name can carry more than one, e.g. "open: Settings (selected)"). */
export function parseTags(raw: string): Tag[] {
  const name = raw.trim();
  const tags: Tag[] = [];
  const lower = name.toLowerCase();
  // "go: Settings", "go – Settings", "go - Settings". A hyphen inside a word doesn't count: icon
  // names are kebab-case ("radio-tower", "check-circle"), not tags.
  const m = lower.match(/^\s*([a-z ]+?)(?:\s*[:–]|\s+-)\s*(.*)$/);
  const rest = m ? name.slice(name.length - m[2].length).trim() : "";
  const head = m?.[1].trim();

  if (lower === "close window" || lower === "close app") tags.push({ kind: "window", action: "close" });
  else if (lower === "minimize window" || lower === "minimise window") tags.push({ kind: "window", action: "minimize" });
  else if (lower === "maximize window" || lower === "maximise window") tags.push({ kind: "window", action: "maximize" });
  else if (lower === "back") tags.push({ kind: "back" });
  else if (lower === "close") tags.push({ kind: "close" });
  else if (lower === "progress" || lower === "timer") tags.push({ kind: "progress" });
  else if (head) {
    switch (head) {
      case "popup":
      case "modal":
      case "dialog":
        tags.push({ kind: "popup", name: rest });
        break;
      case "open":
      case "toggle":
        tags.push({ kind: "open", name: rest });
        break;
      case "show":
        tags.push({ kind: "show", name: rest });
        break;
      case "close":
        tags.push({ kind: "close", name: rest });
        break;
      case "notify":
      case "notification":
      case "toast":
        tags.push({ kind: "notify", name: rest });
        break;
      case "go":
      case "goto":
      case "screen":
      case "navigate":
        tags.push({ kind: "go", name: rest });
        break;
      case "static":
        tags.push({ kind: "static", name: rest });
        break;
      case "nav":
        tags.push({ kind: "nav", which: rest.toLowerCase().startsWith("sub") ? "sub" : "main" });
        break;
      case "tab":
        tags.push({ kind: "tab", name: rest });
        break;
      case "widget":
      case "control": {
        const w = WIDGET_WORDS[rest.toLowerCase()];
        if (w) tags.push({ kind: "widget", widget: w });
        break;
      }
      default: {
        const w = WIDGET_WORDS[head];
        if (w) tags.push({ kind: "widget", widget: w, name: rest });
      }
    }
  }
  // "Menu | Page: Visuals" on frames
  const page = name.match(/page(?:\s*[:–]|\s+-)\s*(.+)$/i);
  if (page && !tags.some((t) => t.kind === "page")) tags.push({ kind: "page", name: page[1].trim() });
  return tags;
}

/** "Visuals (selected)" marks the current item of a nav or tab bar. */
export function isSelectedName(name: string): boolean {
  return /\((selected|active|current)\)\s*$/i.test(name) || /[\/,]\s*(state\s*=\s*)?(selected|active|on)\s*$/i.test(name);
}

/** "/ Hover", "State=Pressed", "Disabled" in a layer or variant name. */
export function stateFromName(name: string): "hover" | "pressed" | "disabled" | "focused" | null {
  const n = name.toLowerCase();
  if (/\bhover(ed)?\b/.test(n)) return "hover";
  if (/\b(pressed|active|down)\b/.test(n)) return "pressed";
  if (/\bdisabled\b/.test(n)) return "disabled";
  if (/\bfocus(ed)?\b/.test(n)) return "focused";
  return null;
}

/** Words in a widget's layer or component name that name its kind. */
export function widgetKindFromName(name: string): WidgetKind | null {
  const n = name.toLowerCase();
  // Whole words, and a hyphenated name is one word: "radio-tower" is an icon, not a radio.
  const has = (words: RegExp) => new RegExp(`(?<![\\w-])(?:${words.source})(?![\\w-])`).test(n);
  if (has(/toggles?|switch(?:es)?/)) return "toggle";
  if (has(/check\s*box(?:es)?/)) return "checkbox";
  if (has(/radio(?:\s*buttons?)?|radios/)) return "radio";
  if (has(/sliders?|range/)) return "slider";
  if (has(/input|text\s*field|textfield|search|password|email|username/)) return "text_field";
  if (has(/dropdown|combo|select|picker/)) return "combo";
  if (has(/keybind|hotkey|key\s*bind/)) return "keybind";
  if (has(/button|btn|cta/)) return "button";
  return null;
}
