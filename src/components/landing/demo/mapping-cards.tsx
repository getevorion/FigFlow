"use client";

import { FileCode2Icon, FileIcon, FolderIcon, FrameIcon, ComponentIcon, TypeIcon, DiamondIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { MAPPING, useDemo } from "./context";

const LAYERS: Array<{ name: string; depth: number; icon: "frame" | "component" | "instance" | "text"; tag?: string }> = [
  { name: "Settings menu", depth: 0, icon: "frame" },
  { name: "Sidebar", depth: 1, icon: "frame" },
  { name: "Sidebar / Nav item", depth: 2, icon: "instance", tag: "nav" },
  { name: "Display", depth: 1, icon: "frame" },
  { name: "Toggle / On", depth: 2, icon: "instance", tag: "toggle" },
  { name: "Slider", depth: 2, icon: "instance", tag: "slider" },
  { name: "Dropdown", depth: 2, icon: "instance", tag: "combo" },
  { name: "Overlay", depth: 1, icon: "frame" },
  { name: "Checkbox / Checked", depth: 2, icon: "instance", tag: "checkbox" },
  { name: "Keybind", depth: 2, icon: "instance", tag: "keybind" },
  { name: "Accent swatches", depth: 2, icon: "component" },
  { name: "Button / Primary", depth: 1, icon: "instance", tag: "button" },
  { name: "notify: Saved", depth: 1, icon: "frame", tag: "toast" },
];

const FILES: Array<{ path: string; depth: number; dir?: boolean }> = [
  { path: "NovaMenu", depth: 0, dir: true },
  { path: "NovaMenu.sln", depth: 1 },
  { path: "CMakeLists.txt", depth: 1 },
  { path: "src/main.cpp", depth: 1 },
  { path: "app/actions.cpp", depth: 1 },
  { path: "ui/theme/palette.h", depth: 1 },
  { path: "ui/theme/styles.cpp", depth: 1 },
  { path: "ui/components/toggle.cpp", depth: 1 },
  { path: "ui/components/checkbox.cpp", depth: 1 },
  { path: "ui/components/slider.cpp", depth: 1 },
  { path: "ui/components/combo.cpp", depth: 1 },
  { path: "ui/components/keybind.cpp", depth: 1 },
  { path: "ui/components/button.cpp", depth: 1 },
  { path: "ui/toasts/saved.cpp", depth: 1 },
  { path: "ui/screens/settings.cpp", depth: 1 },
];

function LayerIcon({ kind }: { kind: (typeof LAYERS)[number]["icon"] }) {
  const cls = "size-3.5 shrink-0";
  if (kind === "frame") return <FrameIcon className={cn(cls, "text-[#9a9cab]")} />;
  if (kind === "component") return <ComponentIcon className={cn(cls, "text-[#c4b5fd]")} />;
  if (kind === "instance") return <DiamondIcon className={cn(cls, "text-[#c4b5fd]")} />;
  return <TypeIcon className={cn(cls, "text-[#9a9cab]")} />;
}

export function LayersCard({ className }: { className?: string }) {
  const { hover } = useDemo();
  const active = hover ? MAPPING[hover].layer : null;
  return (
    <div className={cn("bezel bezel-sm w-[236px] text-left", className)}>
      <div className="window p-3">
        <div className="mb-2 flex items-center justify-between px-1">
          <span className="text-[11px] font-medium text-[#e8e8f0]">Layers</span>
          <span className="rounded-md bg-white/5 px-1.5 py-0.5 font-mono text-[9.5px] text-[#8d8fa0]">settings-menu.fig</span>
        </div>
        <ul className="space-y-px">
          {LAYERS.map((l) => {
            const on = active === l.name;
            return (
              <li
                key={l.name}
                className={cn(
                  "flex h-[22px] items-center gap-1.5 rounded-[6px] pr-1.5 text-[11px] transition-colors duration-200",
                  on ? "bg-brand/20 text-[#f3f3f8]" : "text-[#a3a5b3]",
                )}
                style={{ paddingLeft: 6 + l.depth * 12 }}
              >
                <LayerIcon kind={l.icon} />
                <span className="truncate">{l.name}</span>
                {l.tag && <span className={cn("ml-auto font-mono text-[9px] transition-colors", on ? "text-brand-soft" : "text-[#5f6172]")}>{l.tag}</span>}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

export function FilesCard({ className }: { className?: string }) {
  const { hover } = useDemo();
  const active = hover ? MAPPING[hover].file : null;
  return (
    <div className={cn("bezel bezel-sm w-[236px] text-left", className)}>
      <div className="window p-3">
        <div className="mb-2 flex items-center justify-between px-1">
          <span className="text-[11px] font-medium text-[#e8e8f0]">Generated project</span>
          <span className="rounded-md bg-brand/20 px-1.5 py-0.5 font-mono text-[9.5px] text-brand-soft">C++20</span>
        </div>
        <ul className="space-y-px">
          {FILES.map((f) => {
            const on = active === f.path;
            const Icon = f.dir ? FolderIcon : f.path.endsWith(".cpp") || f.path.endsWith(".h") ? FileCode2Icon : FileIcon;
            return (
              <li
                key={f.path}
                className={cn(
                  "flex h-[22px] items-center gap-1.5 rounded-[6px] pr-1.5 font-mono text-[10.5px] transition-colors duration-200",
                  on ? "bg-brand/20 text-[#f3f3f8]" : "text-[#9a9cab]",
                )}
                style={{ paddingLeft: 6 + f.depth * 12 }}
              >
                <Icon className={cn("size-3.5 shrink-0", on ? "text-brand-soft" : "text-[#6c6e80]")} />
                <span className="truncate">{f.path}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
