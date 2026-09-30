import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { ownedProject } from "@/server/convert";
import { projectDir } from "@/server/store";
import { notFound } from "@/server/views";

/** The project as a ZIP (one folder named after it), streamed from disk. */
export async function GET(_req: Request, ctx: RouteContext<"/api/uploads/[id]/projects/[project]/zip">) {
  const { id, project } = await ctx.params;
  const found = await ownedProject(id, project);
  const zip = found?.project.manifest?.zip;
  if (!found || !zip) return notFound();
  const path = join(projectDir(id, project), zip.name);
  const info = await stat(path).catch(() => null);
  if (!info) return notFound();
  const body = Readable.toWeb(createReadStream(path)) as ReadableStream<Uint8Array>;
  return new Response(body, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": String(info.size),
      // The name is the engine's PascalCase identifier: ASCII letters and digits.
      "Content-Disposition": `attachment; filename="${zip.name.replace(/[^A-Za-z0-9._-]/g, "_")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
