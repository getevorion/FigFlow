import { after } from "next/server";
import { z } from "zod";
import { buildProject, newProject, ownedUpload } from "@/server/convert";
import { listProjects } from "@/server/store";
import { noStore, notFound, projectSummary } from "@/server/views";

const Body = z.object({ frame: z.string().regex(/^\d{1,10}:\d{1,10}$/) });

/** Converts a frame: starts a project and returns its id (poll it for progress). */
export async function POST(req: Request, ctx: RouteContext<"/api/uploads/[id]/projects">) {
  const { id } = await ctx.params;
  const rec = await ownedUpload(id);
  if (!rec) return notFound();
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Pick a frame to start on." }, { status: 400, headers: noStore });
  const { frame } = body.data;
  if (rec.state !== "ready" || !rec.design?.pages.some((p) => p.frames.some((f) => f.id === frame))) return notFound();
  const projects = await listProjects(id);
  if (projects.some((p) => p.state === "working")) return Response.json({ error: "A conversion of this file is already running." }, { status: 409, headers: noStore });
  if (projects.length >= 20) return Response.json({ error: "This file has 20 projects already. Upload it again for more." }, { status: 429, headers: noStore });
  const project = await newProject(rec, frame);
  after(() => buildProject(project));
  return Response.json(projectSummary(project), { status: 201, headers: noStore });
}

export async function GET(_req: Request, ctx: RouteContext<"/api/uploads/[id]/projects">) {
  const { id } = await ctx.params;
  const rec = await ownedUpload(id);
  if (!rec) return notFound();
  return Response.json({ projects: (await listProjects(id)).map(projectSummary) }, { headers: noStore });
}
