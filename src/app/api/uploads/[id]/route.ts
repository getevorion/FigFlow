import { ownedUpload } from "@/server/convert";
import { deleteUpload, listProjects } from "@/server/store";
import { noStore, notFound, uploadView } from "@/server/views";

/** The upload: its state while it's read, then its pages and frames, and the projects made from it. */
export async function GET(_req: Request, ctx: RouteContext<"/api/uploads/[id]">) {
  const { id } = await ctx.params;
  const rec = await ownedUpload(id);
  if (!rec) return notFound();
  return Response.json(uploadView(rec, await listProjects(id)), { headers: noStore });
}

/** Deletes the upload and everything made from it, now. */
export async function DELETE(_req: Request, ctx: RouteContext<"/api/uploads/[id]">) {
  const { id } = await ctx.params;
  const rec = await ownedUpload(id);
  if (!rec) return notFound();
  await deleteUpload(id);
  return new Response(null, { status: 204 });
}
