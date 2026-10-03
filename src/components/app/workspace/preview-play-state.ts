import type { AppElement, UnitManifest } from "@/lib/app-types";

export function unitKey(u: Pick<UnitManifest, "kind" | "ident">) {
  return `${u.kind}-${u.ident}`;
}

export function parseSliderRange(call: string): { min: number; max: number } {
  const m = call.match(/,\s*([\d.]+)\s*f,\s*([\d.]+)\s*f/);
  if (m) {
    const a = parseFloat(m[1]);
    const b = parseFloat(m[2]);
    return { min: Math.min(a, b), max: Math.max(a, b) };
  }
  return { min: 0, max: 100 };
}

/** In-screen tab/page from `selects page 2` in `does`. */
export function parseSelectPage(does: string | undefined): number | null {
  const m = does?.match(/selects page (\d+)/i);
  if (!m) return null;
  return Math.max(0, parseInt(m[1], 10) - 1);
}

export const PLAY_PAGE_KEY = "__page";

/** Where a press goes, from the converter's `does` string. */
export function targetUnitKey(does: string | undefined, units: UnitManifest[]): string | null {
  if (!does) return null;
  const label = does.match(/"([^"]+)"/)?.[1]?.trim();
  if (!label) return null;
  const lower = label.toLowerCase();
  const hit =
    units.find((u) => u.name === label) ??
    units.find((u) => u.name.toLowerCase() === lower) ??
    units.find((u) => u.name.toLowerCase().includes(lower) || lower.includes(u.name.toLowerCase()));
  return hit ? unitKey(hit) : null;
}

export function buildPlayState(elements: AppElement[]): Record<string, string | number | boolean> {
  const state: Record<string, string | number | boolean> = {};
  for (const el of elements) {
    const field = el.state;
    if (!field || field in state) continue;
    switch (el.kind) {
      case "slider": {
        const { min, max } = parseSliderRange(el.call);
        state[field] = Math.round((min + max) / 2);
        break;
      }
      case "toggle":
      case "checkbox":
        state[field] = false;
        break;
      case "radio":
        state[field] = 0;
        break;
      case "combo":
        state[field] = 0;
        break;
      case "text_field":
        state[field] = "";
        break;
      case "keybind":
        state[field] = "None";
        break;
      default:
        break;
    }
  }
  if (elements.some((el) => el.kind === "nav" && parseSelectPage(el.does) !== null)) {
    state[PLAY_PAGE_KEY] = 0;
  }
  return state;
}
