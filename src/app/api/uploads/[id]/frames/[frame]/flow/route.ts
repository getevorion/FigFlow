import { ownedUpload } from "@/server/convert";
import { engine } from "@/server/engine/pool";
import { designPath, frameFromParam } from "@/server/store";
import { errorResponse, noStore, notFound } from "@/server/views";

/** What an app starting at this frame would hold: its screens, popups and toasts. */
export async function GET(_req: Request, ctx: RouteContext<"/api/uploads/[id]/frames/[frame]/flow">) {
  const { id, frame: param } = await ctx.params;
  const frame = frameFromParam(param);
  const rec = frame ? await ownedUpload(id) : null;
  if (!frame || !rec || rec.state !== "ready" || !rec.design?.pages.some((p) => p.frames.some((f) => f.id === frame))) return notFound();
  try {
    return Response.json(await engine(id, designPath(id), "flow", { frame }), { headers: noStore });
  } catch (e) {
    return errorResponse(e);
  }
}
