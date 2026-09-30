/**
 * The engine worker's protocol: one JSON object per line, requests on its
 * stdin and replies on its stdout (see worker.ts and pool.ts). Types only, so
 * both sides can import it.
 */
import type { AppElement } from "../../engine/codegen/app";
import type { PageSummary } from "../../engine/fig/open";
import type { StartPick } from "../../engine/semantic/start";

export type FrameFlow = {
  /** The screens the app will have, the first being the one it starts on. */
  screens: Array<{ id: string; name: string }>;
  popups: Array<{ id: string; name: string; screen: string; open: "start" | "enter" | "demand" | "code" }>;
  toasts: Array<{ name: string }>;
  notes: string[];
};

export type UnitManifest = {
  kind: "screen" | "popup" | "toast";
  ident: string;
  name: string;
  /** The frame it's drawn from, and its part of that frame (all of it, but for a toast). */
  frame: string;
  rect: { x: number; y: number; w: number; h: number };
  start?: boolean;
  /** For a popup: the screen it opens over. */
  over?: string;
};

export type FileManifest = { path: string; size: number; kind: "design" | "runtime" | "build" | "asset" };

export type ProjectManifest = {
  name: string;
  stats: { layers: number; ops: number; images: number; fonts: number; styles: number; colors: number; screens: number; popups: number; toasts: number; controls: number };
  warnings: Array<{ code: string; message: string; node?: string }>;
  units: UnitManifest[];
  elements: AppElement[];
  files: FileManifest[];
  zip: { name: string; size: number };
  ms: number;
  /** Milliseconds per stage: flow, plan, bake, fonts, emit, finish, save (files and ZIP). */
  timings: Record<string, number>;
};

export type WorkerRequest =
  | { id: number; op: "open"; path: string }
  | { id: number; op: "thumb"; frame: string; out: string; width: number }
  | { id: number; op: "flow"; frame: string }
  | { id: number; op: "generate"; frame: string; name?: string; dir: string; runtimeDir: string; fontCacheDir: string }
  | { id: number; op: "preview"; frame: string; rect?: { x: number; y: number; w: number; h: number }; out: string }
  | { id: number; op: "pick" };

export type WorkerResult = {
  open: { name: string; pages: PageSummary[] };
  thumb: { width: number; height: number };
  flow: FrameFlow;
  generate: ProjectManifest;
  preview: { width: number; height: number };
  pick: StartPick | null;
};

export type WorkerReply = { id: number; ok: true; result: unknown } | { id: number; ok: false; error: string };
