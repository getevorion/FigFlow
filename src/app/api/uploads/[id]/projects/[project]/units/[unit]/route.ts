import { join } from "node:path";
import { cached, ownedProject } from "@/server/convert";
import { engine } from "@/server/engine/pool";
import { designPath, projectDir } from "@/server/store";
import { errorResponse, notFound, pngResponse } from "@/server/views";

/** A screen's, popup's or toast's preview ("screen-home", "popup-login"…), rendered on first request. */
export async function GET(_req: Request, ctx: RouteContext<"/api/uploads/[id]/projects/[project]/units/[unit]">) {
  const { id, project, unit } = await ctx.params;
  const found = await ownedProject(id, project);
  const u = found?.project.manifest?.units.find((x) => `${x.kind}-${x.ident}` === unit);
  if (!found || !u) return notFound();
  const path = join(projectDir(id, project), "units", `${u.kind}-${u.ident}.png`);
  try {
    await cached(path, () => engine(id, designPath(id), "preview", { frame: u.frame, ...(u.kind === "toast" ? { rect: u.rect } : {}), out: path }));
  } catch (e) {
    return errorResponse(e);
  }
  return pngResponse(path);
}
