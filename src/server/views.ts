import "server-only";
import { readFile } from "node:fs/promises";
import type { ProjectSummary, ProjectView, UploadView } from "@/lib/app-types";
import { RETENTION_MS, type ProjectRecord, type UploadRecord } from "./store";

/** What the browser sees of an upload: no owner hash. */
export function uploadView(rec: UploadRecord, projects?: ProjectRecord[]): UploadView {
  const { owner: _owner, ...rest } = rec;
  void _owner;
  return { ...rest, expiresAt: rec.createdAt + RETENTION_MS, ...(projects ? { projects: projects.map(projectSummary) } : {}) };
}

export function projectSummary(p: ProjectRecord): ProjectSummary {
  return { id: p.id, frame: p.frame, name: p.name, state: p.state, createdAt: p.createdAt, error: p.error, projectName: p.manifest?.name };
}

export function projectView(p: ProjectRecord, upload: UploadRecord): ProjectView {
  return { ...p, expiresAt: upload.createdAt + RETENTION_MS };
}

export const noStore = { "Cache-Control": "no-store" };

export const notFound = () => Response.json({ error: "Not found. Uploads are deleted two hours after they're made." }, { status: 404, headers: noStore });

export async function pngResponse(path: string): Promise<Response> {
  const body = await readFile(path);
  return new Response(new Uint8Array(body), {
    headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=7200, immutable", "X-Content-Type-Options": "nosniff" },
  });
}

export function errorResponse(e: unknown, status = 500): Response {
  return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status, headers: noStore });
}
