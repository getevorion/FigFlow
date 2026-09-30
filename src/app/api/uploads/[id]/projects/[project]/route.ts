import { ownedProject } from "@/server/convert";
import { noStore, notFound, projectView } from "@/server/views";

/** A project: working, then its manifest (files, previews, controls, warnings) or what went wrong. */
export async function GET(_req: Request, ctx: RouteContext<"/api/uploads/[id]/projects/[project]">) {
  const { id, project } = await ctx.params;
  const found = await ownedProject(id, project);
  if (!found) return notFound();
  return Response.json(projectView(found.project, found.upload), { headers: noStore });
}
