"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type DemoKind = "toggle" | "checkbox" | "slider" | "dropdown" | "keybind" | "color" | "nav" | "button" | "toast";

/** An accent the demo menu can switch to, with the text color that reads on it. */
export type Accent = { color: string; on: string };

export const ACCENTS: Accent[] = [
  { color: "#7b61ff", on: "#ffffff" },
  { color: "#3d7bff", on: "#ffffff" },
  { color: "#b45cff", on: "#ffffff" },
  { color: "#f0508a", on: "#ffffff" },
  { color: "#fbbf24", on: "#1a1405" },
];

type DemoState = {
  hover: DemoKind | null;
  setHover: (k: DemoKind | null) => void;
  accent: Accent;
  setAccent: (a: Accent) => void;
};

const DemoContext = createContext<DemoState | null>(null);

export function DemoProvider({ children }: { children: ReactNode }) {
  const [hover, setHover] = useState<DemoKind | null>(null);
  const [accent, setAccent] = useState<Accent>(ACCENTS[0]);
  const value = useMemo(() => ({ hover, setHover, accent, setAccent }), [hover, accent]);
  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo(): DemoState {
  const ctx = useContext(DemoContext);
  if (!ctx) throw new Error("useDemo outside DemoProvider");
  return ctx;
}

/** Which Figma layer and which generated file each control maps to. */
export const MAPPING: Record<DemoKind, { layer: string; file: string }> = {
  toggle: { layer: "Toggle / On", file: "ui/components/toggle.cpp" },
  checkbox: { layer: "Checkbox / Checked", file: "ui/components/checkbox.cpp" },
  slider: { layer: "Slider", file: "ui/components/slider.cpp" },
  dropdown: { layer: "Dropdown", file: "ui/components/combo.cpp" },
  keybind: { layer: "Keybind", file: "ui/components/keybind.cpp" },
  color: { layer: "Accent swatches", file: "ui/theme/palette.h" },
  nav: { layer: "Sidebar / Nav item", file: "ui/components/button.cpp" },
  button: { layer: "Button / Primary", file: "ui/components/button.cpp" },
  toast: { layer: "notify: Saved", file: "ui/toasts/saved.cpp" },
};
