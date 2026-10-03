"use client";

import { Icon } from "@iconify/react";
import type { FileManifest } from "@/lib/app-types";
import { cn } from "@/lib/utils";
import { ensureIconCollections } from "./icon-collections";

const VI = "vscode-icons";

const FOLDER: Record<string, string> = {
  src: "folder-type-src",
  app: "folder-type-app",
  ui: "folder-type-component",
  screens: "folder-type-view",
  popups: "folder-type-view",
  toasts: "folder-type-notification",
  theme: "folder-type-theme",
  components: "folder-type-component",
  assets: "folder-type-asset",
  images: "folder-type-images",
  icons: "folder-type-images",
  fonts: "folder-type-fonts",
  include: "folder-type-include",
  lib: "folder-type-library",
  runtime: "folder-type-node",
  third_party: "folder-type-library",
  build: "folder-type-tools",
  cmake: "folder-type-cmake",
  files: "folder-type-common",
  ff: "folder-type-node",
  dear_imgui: "folder-type-library",
  imgui: "folder-type-library",
  projects: "folder-type-common",
};

const SPECIAL: Record<string, string> = {
  "actions.cpp": "file-type-cpp3",
  "app.cpp": "file-type-cpp3",
  "app.h": "file-type-cppheader",
  "state.h": "file-type-cppheader",
  "navigation.h": "file-type-cppheader",
  "look.h": "file-type-cppheader",
  "look.cpp": "file-type-cpp3",
  "draw.cpp": "file-type-cpp3",
  "CMakeLists.txt": "file-type-cmake",
  "README.md": "file-type-markdown",
  "LICENSE.md": "file-type-license",
  "icons.cpp": "file-type-image",
  "images.cpp": "file-type-image",
  "fonts.cpp": "file-type-font",
  ".gitignore": "file-type-git",
};

const EXT: Record<string, string> = {
  cpp: "file-type-cpp3",
  cc: "file-type-cpp3",
  cxx: "file-type-cpp3",
  c: "file-type-c",
  h: "file-type-cppheader",
  hpp: "file-type-cppheader",
  hh: "file-type-cppheader",
  inl: "file-type-cppheader",
  inc: "file-type-cppheader",
  json: "file-type-json",
  md: "file-type-markdown",
  txt: "file-type-text",
  cmake: "file-type-cmake",
  png: "file-type-image",
  svg: "file-type-svg",
  jpg: "file-type-image",
  jpeg: "file-type-image",
  webp: "file-type-image",
  ttf: "file-type-font",
  otf: "file-type-font",
  woff: "file-type-font",
  woff2: "file-type-font",
  zip: "file-type-zip",
  yaml: "file-type-yaml",
  yml: "file-type-yaml",
  fig: "file-type-sketch",
};

function vi(id: string) {
  return `${VI}:${id}`;
}

function pathHints(path: string, base: string): string | null {
  const p = path.toLowerCase();
  if (p.includes("/components/") && /\.(cpp|h|hpp)$/i.test(base)) return vi("file-type-class");
  if (p.includes("/screens/") && /\.cpp$/i.test(base)) return vi("file-type-cpp3");
  if (p.includes("/popups/") && /\.cpp$/i.test(base)) return vi("file-type-cpp3");
  if (p.includes("/toasts/") && /\.cpp$/i.test(base)) return vi("file-type-cpp3");
  if (p.includes("/theme/")) return vi("file-type-design-tokens");
  if (p.includes("/ff/") && /\.(cpp|h)$/i.test(base)) return vi("file-type-cpp3");
  if (p.includes("imgui") && /\.(cpp|h)$/i.test(base)) return vi("file-type-cpp3");
  return null;
}

export function folderIconId(name: string, open: boolean): string {
  const key = name.toLowerCase().replace(/-/g, "_");
  const base = FOLDER[key] ?? "default-folder";
  const id = open ? `${base}-opened` : base;
  return vi(id);
}

export function fileIconId(path: string, kind?: FileManifest["kind"]): string {
  const base = path.split("/").pop() ?? path;
  const lower = base.toLowerCase();

  if (SPECIAL[lower]) return vi(SPECIAL[lower]);
  if (SPECIAL[base]) return vi(SPECIAL[base]);

  const hinted = pathHints(path, base);
  if (hinted) return hinted;

  if (kind === "build") return vi("file-type-cmake");
  if (kind === "asset") {
    if (/font|\.(ttf|otf|woff2?)$/i.test(path)) return vi("file-type-font");
    if (/\.(png|svg|webp|jpe?g)$/i.test(path)) return vi("file-type-image");
    return vi("file-type-binary");
  }
  if (kind === "design") {
    if (/\.(cpp|h|hpp)$/i.test(base)) return vi("file-type-cpp3");
    return vi("file-type-design-tokens");
  }
  if (kind === "runtime") {
    if (/\.h(pp)?$/i.test(base)) return vi("file-type-cppheader");
    return vi("file-type-cpp3");
  }

  if (/CMakeLists\.txt$/i.test(base)) return vi("file-type-cmake");
  if (/^readme/i.test(lower)) return vi("file-type-markdown");
  if (/^license/i.test(lower)) return vi("file-type-license");
  if (/\.zip$/i.test(base)) return vi("file-type-zip");

  const ext = base.includes(".") ? base.split(".").pop()!.toLowerCase() : "";
  if (ext && EXT[ext]) return vi(EXT[ext]);

  return vi("default-file");
}

const ICON_PX = 20;

function IconBase({ icon, className, size = ICON_PX }: { icon: string; className?: string; size?: number }) {
  ensureIconCollections();
  return (
    <Icon
      icon={icon}
      width={size}
      height={size}
      className={cn("inline-block shrink-0 align-middle", className)}
      aria-hidden
      inline
    />
  );
}

export function FileTypeIcon({ path, kind, className, size }: { path: string; kind?: FileManifest["kind"]; className?: string; size?: number }) {
  return <IconBase icon={fileIconId(path, kind)} className={className} size={size} />;
}

export function FolderIcon({ name, open, className, size }: { name: string; open: boolean; className?: string; size?: number }) {
  return <IconBase icon={folderIconId(name, open)} className={className} size={size} />;
}

/** Figma / .fig upload rows */
export function FigUploadIcon({ className, size = 20 }: { className?: string; size?: number }) {
  ensureIconCollections();
  return (
    <Icon
      icon="logos:figma"
      width={size}
      height={size}
      className={cn("inline-block shrink-0", className)}
      aria-hidden
      inline
    />
  );
}
