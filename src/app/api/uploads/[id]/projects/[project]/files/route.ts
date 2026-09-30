import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { NextRequest } from "next/server";
import { ownedProject } from "@/server/convert";
import { projectDir } from "@/server/store";
import { errorResponse, notFound } from "@/server/views";
import { highlight } from "@/lib/highlight";
import type { FileView } from "@/lib/app-types";

/** Files up to this size come highlighted; larger ones (Dear ImGui, embedded data) as plain text. */
const HIGHLIGHT_BYTES = 160 * 1024;
/** Larger than this (fonts and images as byte arrays): only the start. */
const FULL_BYTES = 1024 * 1024;
const HEAD_LINES = 400;

function langOf(path: string): string {
  if (/\.(cpp|h|hpp|c|cc|inl)$/i.test(path)) return "cpp";
  if (/CMakeLists\.txt$/i.test(path)) return "cmake";
  if (/\.json$/i.test(path)) return "json";
  return "text";
}

/** One generated file, for the code view. The path must be one of the project's files. */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/uploads/[id]/projects/[project]/files">) {
  const { id, project } = await ctx.params;
  const found = await ownedProject(id, project);
  const path = req.nextUrl.searchParams.get("path") ?? "";
  const file = found?.project.manifest?.files.find((f) => f.path === path);
  if (!found || !file) return notFound();
  try {
    const text = await readFile(join(projectDir(id, project), "files", ...file.path.split("/")), "utf8");
    const lines = text.split("\n").length;
    const lang = langOf(file.path);
    let view: FileView;
    if (file.size <= HIGHLIGHT_BYTES) view = { path, size: file.size, lines, lang, html: await highlight(text, lang) };
    else if (file.size <= FULL_BYTES) view = { path, size: file.size, lines, lang, text };
    else view = { path, size: file.size, lines, lang, text: text.split("\n").slice(0, HEAD_LINES).join("\n"), truncated: true };
    return Response.json(view, { headers: { "Cache-Control": "private, max-age=3600" } });
  } catch (e) {
    return errorResponse(e);
  }
}
