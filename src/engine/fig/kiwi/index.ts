/**
 * Low-level reader/writer for Figma's Kiwi archive format (`.fig` files and
 * clipboard HTML).
 *
 * Vendored from Grida's `@grida/io-figma/fig-kiwi` (Apache-2.0,
 * https://github.com/gridaco/grida), see NOTICE.md. Local changes:
 *  - no `base64-js` dependency (uses the platform's atob/Buffer)
 *  - both archive chunks accept zstd or raw deflate, detected by magic bytes
 *  - archive validation errors carry a stable `code` for user-facing messages
 *  - blob access helpers are typed and bounds-checked
 */
import { deflateSync, inflateSync, unzipSync } from "fflate";
import { decompress as zstdDecompress } from "fzstd";
import { compileSchema, decodeBinarySchema, encodeBinarySchema } from "kiwi-schema";
import defaultSchema, {
  type BlendMode,
  type Color,
  type Matrix,
  type Message,
  type NodeChange,
  type Paint,
  type Schema,
  type StrokeAlign,
  type StrokeCap,
  type StrokeJoin,
  type Vector,
} from "./schema";

export type { BlendMode, Color, Matrix, Message, NodeChange, Paint, Schema, StrokeAlign, StrokeCap, StrokeJoin, Vector };
export { parseCommandsBlob, parseVectorNetworkBlob, type VectorNetwork } from "./blob-parser";

export type Header = { prelude: string; version: number };

/** Every product writes a fixed 8-byte ASCII magic. FigJam's includes the trailing dot. */
export const PRELUDES = {
  design: "fig-kiwi",
  figjam: "fig-jam.",
  slides: "fig-deck",
} as const;
const FIG_KIWI_VERSION = 15;

const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];
const ZSTD_SIGNATURE = [0x28, 0xb5, 0x2f, 0xfd];

const HTML_MARKERS = {
  metaStart: "<!--(figmeta)",
  metaEnd: "(/figmeta)-->",
  figmaStart: "<!--(figma)",
  figmaEnd: "(/figma)-->",
};

export type FigErrorCode =
  | "empty"
  | "not-a-fig"
  | "json-renamed"
  | "zip-without-canvas"
  | "figjam"
  | "slides"
  | "truncated"
  | "schema"
  | "message";

/** A rejected archive. `code` is stable and safe to map to a user-facing message. */
export class FigFormatError extends Error {
  constructor(
    readonly code: FigErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "FigFormatError";
  }
}

export interface FigmaMeta {
  fileKey: string;
  pasteID: number;
  dataType: "scene";
}

export interface ParsedFigma {
  header: Header;
  /** Raw schema definitions (from decodeBinarySchema), not compiled. */
  schema: unknown;
  message: Message;
}

export interface ParsedFigmaHTML extends ParsedFigma {
  meta: FigmaMeta;
}

export interface ParsedFigmaArchive extends ParsedFigma {
  preview: Uint8Array | undefined;
  /** Every entry of the outer ZIP, when the file is a ZIP archive. */
  zip_files?: Record<string, Uint8Array>;
}

// --- Archive framing ---------------------------------------------------------

function readPrelude(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < 8 && i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

function isKiwiPrelude(prelude: string): boolean {
  return prelude === PRELUDES.design || prelude === PRELUDES.figjam || prelude === PRELUDES.slides;
}

function hasSignature(data: Uint8Array, signature: number[]): boolean {
  return data.length > signature.length && signature.every((byte, i) => data[i] === byte);
}

/** Splits a Kiwi archive into its header and length-prefixed chunks. */
export function splitArchive(data: Uint8Array): { header: Header; chunks: Uint8Array[] } {
  if (data.length < 12) throw new FigFormatError("truncated", "The file ends before its header.");
  const prelude = readPrelude(data);
  if (!isKiwiPrelude(prelude)) throw new FigFormatError("not-a-fig", `Unexpected prelude "${prelude}".`);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const header = { prelude, version: view.getUint32(8, true) };
  const chunks: Uint8Array[] = [];
  let offset = 12;
  while (offset + 4 <= data.length) {
    const size = view.getUint32(offset, true);
    offset += 4;
    if (offset + size > data.length) {
      throw new FigFormatError("truncated", "The file is truncated: a chunk runs past the end of the data.");
    }
    chunks.push(data.subarray(offset, offset + size));
    offset += size;
  }
  return { header, chunks };
}

/** Kiwi chunks are either zstd frames (newer files) or raw DEFLATE (older files). */
function decompressChunk(chunk: Uint8Array): Uint8Array {
  return hasSignature(chunk, ZSTD_SIGNATURE) ? zstdDecompress(chunk) : inflateSync(chunk);
}

function parseFigData(data: Uint8Array): ParsedFigmaArchive {
  const { header, chunks } = splitArchive(data);
  const [schemaChunk, dataChunk, preview] = chunks;
  if (!schemaChunk || !dataChunk) {
    throw new FigFormatError("truncated", "The archive is missing its schema or data chunk.");
  }

  let fileSchema: ReturnType<typeof decodeBinarySchema>;
  let compiled: Schema;
  try {
    fileSchema = decodeBinarySchema(decompressChunk(schemaChunk));
    compiled = compileSchema(fileSchema) as Schema;
  } catch (err) {
    throw new FigFormatError("schema", `The archive's schema could not be decoded: ${(err as Error).message}`);
  }

  let message: Message;
  try {
    message = compiled.decodeMessage(decompressChunk(dataChunk));
  } catch (err) {
    throw new FigFormatError("message", `The document could not be decoded: ${(err as Error).message}`);
  }
  return { header, schema: fileSchema, message, preview };
}

/**
 * Reads a `.fig` file: either a ZIP (canvas.fig + images/ + meta.json +
 * thumbnail.png, what "Save local copy" writes today) or a bare Kiwi archive.
 */
export function readFigFile(data: Uint8Array): ParsedFigmaArchive {
  if (data.length === 0) throw new FigFormatError("empty", "The file is empty.");

  const first = data.subarray(0, Math.min(64, data.length));
  const lead = new TextDecoder().decode(first).trimStart();
  if (lead.startsWith("{") || lead.startsWith("[")) {
    throw new FigFormatError("json-renamed", "This is a JSON file renamed to .fig, not a Figma archive.");
  }

  let archive = data;
  let zipFiles: Record<string, Uint8Array> | undefined;
  if (hasSignature(data, ZIP_SIGNATURE)) {
    try {
      zipFiles = unzipSync(data);
    } catch (err) {
      throw new FigFormatError("truncated", `The ZIP archive is damaged or truncated: ${(err as Error).message}`);
    }
    const keys = Object.keys(zipFiles);
    const main =
      keys.find((k) => isKiwiPrelude(readPrelude(zipFiles![k]))) ??
      keys.find((k) => k.endsWith(".fig") || k.endsWith(".deck"));
    if (!main) {
      throw new FigFormatError("zip-without-canvas", `The ZIP has no canvas.fig inside (found: ${keys.slice(0, 8).join(", ")}).`);
    }
    archive = zipFiles[main];
  }

  const parsed = parseFigData(archive);
  if (parsed.header.prelude === PRELUDES.figjam) {
    throw new FigFormatError("figjam", "This is a FigJam board. Save a local copy of a Figma Design file instead.");
  }
  if (parsed.header.prelude === PRELUDES.slides) {
    throw new FigFormatError("slides", "This is a Figma Slides deck. Save a local copy of a Figma Design file instead.");
  }
  return { ...parsed, zip_files: zipFiles };
}

// --- Clipboard ---------------------------------------------------------------

function decodeBase64(s: string): Uint8Array {
  const clean = s.replace(/\s+/g, "");
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(clean, "base64"));
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function encodeBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function extractBetween(html: string, start: string, end: string): string {
  const s = html.indexOf(start);
  const e = html.indexOf(end);
  if (s === -1 || e === -1 || s > e) throw new FigFormatError("not-a-fig", `Couldn't find ${start} in the clipboard HTML.`);
  return html.substring(s + start.length, e);
}

/** Figma puts the copied selection on the clipboard as base64 Kiwi inside HTML comments. */
export function parseHTMLString(html: string): { meta: FigmaMeta; figma: Uint8Array } {
  const meta = extractBetween(html, HTML_MARKERS.metaStart, HTML_MARKERS.metaEnd);
  const figma = extractBetween(html, HTML_MARKERS.figmaStart, HTML_MARKERS.figmaEnd);
  return {
    meta: JSON.parse(new TextDecoder().decode(decodeBase64(meta))),
    figma: decodeBase64(figma),
  };
}

export function composeHTMLString(data: { meta: FigmaMeta; figma: Uint8Array }): string {
  const meta = encodeBase64(new TextEncoder().encode(JSON.stringify(data.meta) + "\n"));
  const fig = encodeBase64(data.figma);
  return `<meta charset="utf-8" /><span data-metadata="${HTML_MARKERS.metaStart}${meta}${HTML_MARKERS.metaEnd}"></span><span data-buffer="${HTML_MARKERS.figmaStart}${fig}${HTML_MARKERS.figmaEnd}"></span><span style="white-space: pre-wrap"></span>`;
}

export function readHTMLMessage(html: string): ParsedFigmaHTML {
  const { figma, meta } = parseHTMLString(html);
  const parsed = parseFigData(figma);
  return { header: parsed.header, schema: parsed.schema, message: parsed.message, meta };
}

// --- Writing -----------------------------------------------------------------

/** Writes a bare Kiwi archive (deflate-compressed chunks, as older Figma builds did). */
export function writeFigFile(settings: { schema?: Schema; header?: Header; message: Message; preview?: Uint8Array }): Uint8Array {
  const { schema = defaultSchema, message, preview } = settings;
  const header = settings.header ?? { prelude: PRELUDES.design, version: FIG_KIWI_VERSION };
  // kiwi-schema's typings do not model the compiled encoder
  const compiled = compileSchema(schema as never) as unknown as Schema;
  const chunks: Uint8Array[] = [deflateSync(encodeBinarySchema(schema as never)), deflateSync(compiled.encodeMessage(message))];
  if (preview) chunks.push(preview);

  const total = chunks.reduce((n, c) => n + 4 + c.byteLength, 12);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) out[i] = header.prelude.charCodeAt(i);
  view.setUint32(8, header.version, true);
  let offset = 12;
  for (const c of chunks) {
    view.setUint32(offset, c.byteLength, true);
    out.set(c, offset + 4);
    offset += 4 + c.byteLength;
  }
  return out;
}

export function writeHTMLMessage(m: { meta: FigmaMeta; schema: Schema; header?: Header; message: Message }): string {
  return composeHTMLString({ meta: m.meta, figma: writeFigFile(m) });
}

// --- Blobs & archive entries -------------------------------------------------

/** Resolves a blob reference (commandsBlob, vectorNetworkBlob, …) to its bytes. */
export function getBlobBytes(blobId: number, message: Message): Uint8Array | null {
  const index = blobId - (message.blobBaseIndex ?? 0);
  if (index < 0) return null;
  return message.blobs?.[index]?.bytes ?? null;
}

/** Image paints reference their bytes by SHA-1; the ZIP stores them as images/<hex>. */
export function imageHashToString(hash: Uint8Array | ArrayLike<number>): string {
  let s = "";
  for (let i = 0; i < hash.length; i++) s += (hash[i] as number).toString(16).padStart(2, "0");
  return s;
}

export function extractImages(zipFiles: Record<string, Uint8Array> | undefined): Map<string, Uint8Array> {
  const images = new Map<string, Uint8Array>();
  if (!zipFiles) return images;
  for (const key of Object.keys(zipFiles)) {
    if (key.startsWith("images/") && key.length > "images/".length) images.set(key.slice("images/".length), zipFiles[key]);
  }
  return images;
}

export function getThumbnail(zipFiles: Record<string, Uint8Array> | undefined): Uint8Array | undefined {
  return zipFiles?.["thumbnail.png"];
}

export function getMeta(zipFiles: Record<string, Uint8Array> | undefined): unknown {
  const bytes = zipFiles?.["meta.json"];
  if (!bytes) return undefined;
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return undefined;
  }
}
