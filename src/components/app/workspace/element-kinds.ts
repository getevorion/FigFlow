import {
  CircleDotIcon,
  KeyboardIcon,
  ListIcon,
  MousePointerClickIcon,
  PanelLeftIcon,
  SlidersHorizontalIcon,
  SquareCheckIcon,
  SquareMousePointerIcon,
  TextCursorInputIcon,
  ToggleRightIcon,
  type LucideIcon,
} from "lucide-react";
import type { AppElement } from "@/lib/app-types";

/** How each kind of control is named and drawn in the converter. */
export const ELEMENT_KINDS: Record<AppElement["kind"], { label: string; icon: LucideIcon }> = {
  button: { label: "Button", icon: MousePointerClickIcon },
  hotspot: { label: "Clickable artwork", icon: SquareMousePointerIcon },
  nav: { label: "Nav item", icon: PanelLeftIcon },
  toggle: { label: "Switch", icon: ToggleRightIcon },
  checkbox: { label: "Checkbox", icon: SquareCheckIcon },
  radio: { label: "Radio button", icon: CircleDotIcon },
  slider: { label: "Slider", icon: SlidersHorizontalIcon },
  text_field: { label: "Text field", icon: TextCursorInputIcon },
  combo: { label: "Dropdown", icon: ListIcon },
  keybind: { label: "Keybind", icon: KeyboardIcon },
};

/** Design names come quoted from the engine (`"Login"`); the UI shows them bare. */
export const bare = (name: string) => name.replace(/^"(.*)"$/, "$1");
