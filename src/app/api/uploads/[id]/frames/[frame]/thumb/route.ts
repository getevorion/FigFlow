import { join } from "node:path";
import { cached, ownedUpload } from "@/server/convert";
import { engine } from "@/server/engine/pool";
import { designPath, frameFromParam, uploadDir } from "@/server/store";
import { errorResponse, notFound, pngResponse } from "@/server/views";

/** A frame's thumbnail, rendered on first request. */
export async function GET(_req: Request, ctx: RouteContext<"/api/uploads/[id]/frames/[frame]/thumb">) {
  const { id, frame: param } = await ctx.params;
  const frame = frameFromParam(param);
  const rec = frame ? await ownedUpload(id) : null;
  if (!frame || !rec || rec.state !== "ready" || !rec.design?.pages.some((p) => p.frames.some((f) => f.id === frame))) return notFound();
  const path = join(uploadDir(id), "thumbs", `${param}.png`);
  try {
    await cached(path, () => engine(id, designPath(id), "thumb", { frame, out: path, width: 640 }));
  } catch (e) {
    return errorResponse(e);
  }
  return pngResponse(path);
}
