/**
 * The project's fonts and images compiled into the program as byte arrays, the
 * way Dear ImGui projects usually carry them: src/ui/assets/fonts.cpp,
 * icons.cpp and images.cpp (images spill into images_2.cpp and on when a file
 * would grow past a few megabytes, so the compiler builds them in parallel),
 * all declared in assets.h. Nothing to ship next to the program.
 */
import type { ImageAssetOut } from "./assets";
import { NameScope, Writer } from "./cpp";
import type { FontFace } from "./fonts";

export type Blob = { name: string; bytes: Uint8Array };

export type EmbedPlan = {
  /** The ff::Bytes (in namespace assets) holding each font file, by face identifier ("<face>", "<face>_full", "fallback"). */
  font: Map<string, string>;
  /** The ff::Bytes holding each image, by the image's identifier. */
  image: Map<string, string>;
  /** src/ui/assets/assets.h. */
  header: string;
  /** fonts.cpp, icons.cpp, and images_2.cpp on: complete files. */
  files: Array<{ path: string; contents: string }>;
  /** The images that go in images.cpp itself, above its table (see emitImages). */
  imagesBlock: string;
};

/** Raw bytes per images file before the next one starts (each takes a few seconds to compile). */
const MAX_FILE_BYTES = 3 * 1024 * 1024;
const PER_LINE = 24;

const HEX = Array.from({ length: 256 }, (_, i) => `0x${i.toString(16).padStart(2, "0")}`);

function arrayLines(bytes: Uint8Array): string {
  const lines: string[] = [];
  for (let i = 0; i < bytes.length; i += PER_LINE) {
    const row = new Array<string>(Math.min(PER_LINE, bytes.length - i));
    for (let j = 0; j < row.length; j++) row[j] = HEX[bytes[i + j]];
    lines.push(`    ${row.join(",")},`);
  }
  return lines.join("\n");
}

/** The blobs as byte arrays, each named by an ff::Bytes in namespace assets (declared in assets.h). */
export function dataBlock(blobs: Blob[]): string {
  if (!blobs.length) return "";
  const parts = ["namespace assets {", "", "namespace {", ""];
  for (const b of blobs) parts.push(`const unsigned char ${b.name}_data[] = {`, arrayLines(b.bytes), "};", "");
  parts.push("}", "");
  for (const b of blobs) parts.push(`const ff::Bytes ${b.name}{ ${b.name}_data, sizeof(${b.name}_data) };`);
  parts.push("", "}", "");
  return parts.join("\n");
}

/** A data file. Generated files carry no comments (the user's choice), so neither do these. */
function dataFile(blobs: Blob[]): string {
  return ['#include "ui/assets/assets.h"', "", dataBlock(blobs)].join("\n");
}

export function planEmbed(images: ImageAssetOut[], faces: FontFace[], fallback: Uint8Array): EmbedPlan {
  const names = new NameScope(["count"]);
  const font = new Map<string, string>();
  const image = new Map<string, string>();
  const fontBlobs: Blob[] = [];
  const addFont = (key: string, ext: string, bytes: Uint8Array) => {
    const name = names.take(`${key}_${ext}`);
    font.set(key, name);
    fontBlobs.push({ name, bytes });
  };
  addFont("fallback", "ttf", fallback);
  for (const face of faces) {
    addFont(face.ident, face.source === "design" ? "otf" : "ttf", face.bytes);
    if (face.full) addFont(`${face.ident}_full`, "ttf", face.full.bytes);
  }

  const iconBlobs: Blob[] = [];
  const imageBlobs: Blob[] = [];
  for (const a of images) {
    const name = names.take(`${a.ident}_${a.format === "jpeg" ? "jpg" : "png"}`);
    image.set(a.ident, name);
    (a.mask ? iconBlobs : imageBlobs).push({ name, bytes: a.png });
  }

  const files: Array<{ path: string; contents: string }> = [{ path: "src/ui/assets/fonts.cpp", contents: dataFile(fontBlobs) }];
  if (iconBlobs.length) files.push({ path: "src/ui/assets/icons.cpp", contents: dataFile(iconBlobs) });
  // Images in files of a few megabytes, biggest first so they split evenly; each file keeps the design's order.
  const chunks: Blob[][] = [];
  const size = (c: Blob[]) => c.reduce((n, x) => n + x.bytes.length, 0);
  for (const b of [...imageBlobs].sort((a, c) => c.bytes.length - a.bytes.length)) {
    const fit = chunks.find((c) => size(c) + b.bytes.length <= MAX_FILE_BYTES);
    if (fit) fit.push(b);
    else chunks.push([b]);
  }
  const order = new Map(imageBlobs.map((b, i) => [b, i]));
  for (const c of chunks) c.sort((a, b) => order.get(a)! - order.get(b)!);
  chunks.slice(1).forEach((c, i) => files.push({ path: `src/ui/assets/images_${i + 2}.cpp`, contents: dataFile(c) }));

  const h = new Writer()
    .line("#pragma once")
    .line()
    .line('#include "ff/bytes.h"')
    .line()
    .line("namespace assets {")
    .line();
  const declare = (blobs: Blob[]) => {
    if (!blobs.length) return;
    for (const b of blobs) h.line(`extern const ff::Bytes ${b.name};`);
    h.line();
  };
  declare(fontBlobs);
  declare(iconBlobs);
  declare(imageBlobs);
  h.line("}");
  return { font, image, header: h.toString(), files, imagesBlock: dataBlock(chunks[0] ?? []) };
}
