import "server-only";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { decodeTime, isValid, ulid } from "ulid";
import type { PageSummary } from "@/engine/fig/open";
import { site } from "@/lib/site";
import { writeFileAtomic } from "./atomic";
import { closeDesign } from "./engine/pool";
import type { ProjectManifest } from "./engine/protocol";
import { uploadsDir } from "./paths";

/**
 * Uploads and the projects made from them, on disk under .data/uploads:
 *
 *   <upload>/upload.json          the record below
 *   <upload>/design.fig           the file as uploaded
 *   <upload>/thumbs/<frame>.png   frame thumbnails
 *   <upload>/projects/<project>/  project.json, files/…, <Name>.zip, units/…
 *
 * Everything is deleted RETENTION_MS after the upload.
 */

export const RETENTION_MS = site.retentionHours * 3_600_000;
export const MAX_UPLOAD_BYTES = site.maxUploadMb * 1024 * 1024;

export type UploadRecord = {
  id: string;
  /** SHA-256 of the uploader's owner cookie. */
  owner: string;
  fileName: string;
  size: number;
  createdAt: number;
  state: "reading" | "ready" | "failed";
  error?: string;
  design?: { name: string; pages: PageSummary[] };
  /** The frame Figflow picked for the app to start on, and why. */
  start?: { frame: string; reason: string };
};

export type ProjectRecord = {
  id: string;
  upload: string;
  frame: string;
  name?: string;
  createdAt: number;
  state: "working" | "ready" | "failed";
  error?: string;
  manifest?: ProjectManifest;
};

/** Ids are ULIDs; checking the shape first keeps paths built from them inside the store. */
export function isId(id: string): boolean {
  return /^[0-9A-HJKMNP-TV-Z]{26}$/.test(id) && isValid(id);
}

export const newId = () => ulid();
export const uploadDir = (id: string) => join(uploadsDir, id);
export const designPath = (id: string) => join(uploadDir(id), "design.fig");
export const projectDir = (upload: string, project: string) => join(uploadDir(upload), "projects", project);

/** Figma node ids ("12:34") travel in URLs as "12-34". */
export function frameFromParam(param: string): string | null {
  const m = /^(\d{1,10})-(\d{1,10})$/.exec(param);
  return m ? `${m[1]}:${m[2]}` : null;
}
export const frameParam = (frame: string) => frame.replace(":", "-");

async function writeJson(path: string, value: unknown) {
  // Write then rename: readers never see half a file.
  await writeFileAtomic(path, JSON.stringify(value));
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return null;
  }
}

export const expired = (createdAt: number, now = Date.now()) => now - createdAt > RETENTION_MS;

export async function createUpload(rec: UploadRecord): Promise<void> {
  await mkdir(uploadDir(rec.id), { recursive: true });
  await writeJson(join(uploadDir(rec.id), "upload.json"), rec);
}

export async function saveUpload(rec: UploadRecord): Promise<void> {
  if (!existsSync(uploadDir(rec.id))) return; // deleted meanwhile
  await writeJson(join(uploadDir(rec.id), "upload.json"), rec);
}

export async function getUpload(id: string): Promise<UploadRecord | null> {
  if (!isId(id)) return null;
  const rec = await readJson<UploadRecord>(join(uploadDir(id), "upload.json"));
  return rec && !expired(rec.createdAt) ? rec : null;
}

/** Every live upload's record (for the storage limits). */
export async function allUploads(): Promise<UploadRecord[]> {
  let names: string[];
  try {
    names = await readdir(uploadsDir);
  } catch {
    return [];
  }
  const recs = await Promise.all(names.filter(isId).map((id) => getUpload(id)));
  return recs.filter((r): r is UploadRecord => !!r);
}

export async function listUploads(owner: string): Promise<UploadRecord[]> {
  let names: string[];
  try {
    names = await readdir(uploadsDir);
  } catch {
    return [];
  }
  const recs = await Promise.all(names.filter(isId).map((id) => getUpload(id)));
  return recs.filter((r): r is UploadRecord => !!r && r.owner === owner).sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteUpload(id: string): Promise<void> {
  if (!isId(id)) return;
  closeDesign(id);
  await rm(uploadDir(id), { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
}

export async function saveProject(rec: ProjectRecord): Promise<void> {
  const dir = projectDir(rec.upload, rec.id);
  if (!existsSync(uploadDir(rec.upload))) return;
  await mkdir(dir, { recursive: true });
  await writeJson(join(dir, "project.json"), rec);
}

export async function getProject(upload: string, id: string): Promise<ProjectRecord | null> {
  if (!isId(upload) || !isId(id)) return null;
  return readJson<ProjectRecord>(join(projectDir(upload, id), "project.json"));
}

export async function listProjects(upload: string): Promise<ProjectRecord[]> {
  if (!isId(upload)) return [];
  let names: string[];
  try {
    names = await readdir(join(uploadDir(upload), "projects"));
  } catch {
    return [];
  }
  const recs = await Promise.all(names.filter(isId).map((id) => getProject(upload, id)));
  return recs.filter((r): r is ProjectRecord => !!r).sort((a, b) => b.createdAt - a.createdAt);
}

/** Deletes every upload past its retention time. */
export async function sweep(): Promise<number> {
  let names: string[];
  try {
    names = await readdir(uploadsDir);
  } catch {
    return 0;
  }
  let removed = 0;
  for (const id of names) {
    const dir = uploadDir(id);
    const rec = isId(id) ? await readJson<UploadRecord>(join(dir, "upload.json")) : null;
    // No readable record: a failed upload, aged by its id's timestamp.
    const created = rec?.createdAt ?? (isId(id) ? decodeTime(id) : 0);
    if (!expired(created)) continue;
    closeDesign(id);
    await rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }).catch(() => undefined);
    removed++;
  }
  return removed;
}
