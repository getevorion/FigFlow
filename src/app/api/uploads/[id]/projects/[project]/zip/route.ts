import { join } from "node:path";
import { ownedProject } from "@/server/convert";
import { ownerId } from "@/server/owner";
import { projectDir } from "@/server/store";
import { notFound, zipResponse } from "@/server/views";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/uploads/[id]/projects/[project]/zip">) {
  await ownerId(true);
  const { id, project } = await ctx.params;
  const found = await ownedProject(id, project);
  const zip = found?.project.manifest?.zip;
  if (!found || !zip) return notFound();
  return zipResponse(join(projectDir(id, project), zip.name), zip.name);
}
