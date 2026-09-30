/**
 * The converter's API shapes, shared by the route handlers and the pages that
 * call them (types only).
 */
import type { AppElement } from "@/engine/codegen/app";
import type { FrameSummary, PageSummary } from "@/engine/fig/open";
import type { FileManifest, FrameFlow, ProjectManifest, UnitManifest } from "@/server/engine/protocol";

export type { AppElement, FileManifest, FrameFlow, FrameSummary, PageSummary, ProjectManifest, UnitManifest };

export type ProjectSummary = {
  id: string;
  frame: string;
  name?: string;
  state: "working" | "ready" | "failed";
  createdAt: number;
  error?: string;
  /** The generated project's name, once it's ready. */
  projectName?: string;
};

export type UploadView = {
  id: string;
  fileName: string;
  size: number;
  createdAt: number;
  expiresAt: number;
  state: "reading" | "ready" | "failed";
  error?: string;
  design?: { name: string; pages: PageSummary[] };
  /** The frame Figflow picked for the app to start on, and why. */
  start?: { frame: string; reason: string };
  projects?: ProjectSummary[];
};

export type ProjectView = {
  id: string;
  upload: string;
  frame: string;
  name?: string;
  createdAt: number;
  expiresAt: number;
  state: "working" | "ready" | "failed";
  error?: string;
  manifest?: ProjectManifest;
};

export type FileView = {
  path: string;
  size: number;
  lines: number;
  lang: string;
  /** Highlighted HTML (shiki), or the text when it's too large to highlight. */
  html?: string;
  text?: string;
  /** Only the first lines were sent. */
  truncated?: boolean;
};

/** Figma node ids ("12:34") travel in URLs as "12-34". */
export const frameParam = (frame: string) => frame.replace(":", "-");
