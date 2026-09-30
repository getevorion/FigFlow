/**
 * What the converter understands about a design: which layers are controls,
 * which frames are screens, popups, toasts and pages, and how they connect.
 * Produced by analyze.ts from the design tree; consumed by the code generator
 * and shown in the app's "Elements" tab.
 */
import type { DesignNode, Rect, RGBA } from "../model/types";

export type WidgetKind =
  | "button"
  | "icon_button"
  | "checkbox"
  | "radio"
  | "toggle"
  | "slider"
  | "text_field"
  | "combo"
  | "keybind"
  | "nav_item"
  | "window_button";

/** How sure the analysis is, and which signals it used (shown to users). */
export type Evidence = { score: number; reasons: string[] };

export type Widget = {
  id: string;
  kind: WidgetKind;
  /** The layers that make up the control; drawn by the widget, not by the screen. */
  nodes: DesignNode[];
  /** Bounds in root-frame coordinates. */
  rect: Rect;
  /** The layer that forms the control's body (track, box, surface). */
  surface?: DesignNode;
  label?: { node: DesignNode; text: string };
  icon?: DesignNode;
  /** Kind-specific parts: knob, fill, thumb, chevron, check mark, placeholder… */
  parts: Record<string, DesignNode | undefined>;
  /** The state the design shows. */
  value?: boolean | number | string;
  /** Window buttons: what they do. */
  action?: "close" | "minimize" | "maximize";
  /** Filled by flow analysis: what pressing it does, in order (e.g. show a toast, then close the popup). */
  onPress?: PressAction[];
  /** Why flow analysis chose `onPress` (shown to users). */
  pressReason?: string;
  /** Explicit override from a name tag or the user's choice in "What is this?". */
  forced?: boolean;
  evidence: Evidence;
};

export type PressAction =
  /** `replace`: a lateral move between pages of one nav (no history entry, so Back skips it). */
  | { kind: "go"; screen: string; replace?: boolean }
  | { kind: "back" }
  | { kind: "open-popup"; popup: string }
  | { kind: "close-popup" }
  | { kind: "show-toast"; toast: string }
  | { kind: "select-page"; nav: string; index: number }
  | { kind: "window"; action: "close" | "minimize" | "maximize" }
  | { kind: "url"; url: string };

/** A group of items where exactly one is shown as selected (sidebar, tab bar). */
export type NavGroup = {
  id: string;
  items: Widget[];
  /** The selected item; -1 on a page that shows the nav with nothing selected (a hub, a store page). */
  selected: number;
  axis: "vertical" | "horizontal";
  rect: Rect;
  /** For `selected` -1: the same nav on another frame, where an item is selected (its looks come from there). */
  template?: NavGroup;
  evidence: Evidence;
};

/** A dialog drawn over a screen: dim layer, panel, controls. */
export type Popup = {
  id: string;
  name: string;
  root: DesignNode;
  backdrop?: DesignNode;
  panel?: DesignNode;
  title?: string;
  rect: Rect;
  /** Figma overlay frames: where it sits, the dim colour, and whether a click outside closes it. */
  overlay?: { position: string; offset?: { x: number; y: number }; dim?: RGBA; closeOnOutside: boolean };
  evidence: Evidence;
};

/** A notification the app shows from code (toast). */
export type Toast = {
  id: string;
  name: string;
  root: DesignNode;
  /** Every layer of the toast: its root and the content sitting on it (files often don't group them). */
  members: DesignNode[];
  title?: string;
  rect: Rect;
  anchor: "top" | "bottom";
  evidence: Evidence;
};

export type FrameAnalysis = {
  frameId: string;
  frameName: string;
  size: { x: number; y: number };
  widgets: Widget[];
  navs: NavGroup[];
  popups: Popup[];
  toasts: Toast[];
  /** Layers kept as plain visuals although they looked like controls ("static:" or user choice). */
  staticNodes: Set<string>;
  notes: string[];
};

export type ColorStats = { fill?: RGBA; luminance: number };
