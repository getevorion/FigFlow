import "server-only";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { decodeTime, isValid, ulid } from "ulid";
import type { PageSummary } from "@/engine/fig/open";
import { site } from "@/lib/site";
import { listNames, pathExists, readText, removeTree, writeBytes } from "./data/io";
import type { ProjectManifest } from "./engine/protocol";
import { uploadsDir } from "./paths";

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
  await writeBytes(path, JSON.stringify(value));
}

async function readJson<T>(path: string): Promise<T | null> {
  const raw = await readText(path);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
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
  if (!(await pathExists(uploadDir(rec.id)))) return;
  await writeJson(join(uploadDir(rec.id), "upload.json"), rec);
}

export async function getUpload(id: string): Promise<UploadRecord | null> {
  if (!isId(id)) return null;
  const rec = await readJson<UploadRecord>(join(uploadDir(id), "upload.json"));
  return rec && !expired(rec.createdAt) ? rec : null;
}

/** Every live upload's record (for the storage limits). */
export async function allUploads(): Promise<UploadRecord[]> {
  const names = await listNames(uploadsDir);
  const recs = await Promise.all(names.filter(isId).map((id) => getUpload(id)));
  return recs.filter((r): r is UploadRecord => !!r);
}

export async function listUploads(owner: string): Promise<UploadRecord[]> {
  const names = await listNames(uploadsDir);
  const recs = await Promise.all(names.filter(isId).map((id) => getUpload(id)));
  return recs.filter((r): r is UploadRecord => !!r && r.owner === owner).sort((a, b) => b.createdAt - a.createdAt);
}

async function releaseDesign(id: string) {
  const { closeDesign } = await import("./engine/pool");
  closeDesign(id);
}

export async function deleteUpload(id: string): Promise<void> {
  if (!isId(id)) return;
  await releaseDesign(id);
  await removeTree(uploadDir(id));
}

export async function saveProject(rec: ProjectRecord): Promise<void> {
  const dir = projectDir(rec.upload, rec.id);
  if (!(await pathExists(uploadDir(rec.upload)))) return;
  await mkdir(dir, { recursive: true });
  await writeJson(join(dir, "project.json"), rec);
}

export async function getProject(upload: string, id: string): Promise<ProjectRecord | null> {
  if (!isId(upload) || !isId(id)) return null;
  return readJson<ProjectRecord>(join(projectDir(upload, id), "project.json"));
}

export async function listProjects(upload: string): Promise<ProjectRecord[]> {
  if (!isId(upload)) return [];
  const names = await listNames(join(uploadDir(upload), "projects"));
  const recs = await Promise.all(names.filter(isId).map((id) => getProject(upload, id)));
  return recs.filter((r): r is ProjectRecord => !!r).sort((a, b) => b.createdAt - a.createdAt);
}

/** Deletes every upload past its retention time. */
export async function sweep(): Promise<number> {
  const names = await listNames(uploadsDir);
  let removed = 0;
  for (const id of names) {
    if (!isId(id)) continue;
    const dir = uploadDir(id);
    const rec = await readJson<UploadRecord>(join(dir, "upload.json"));
    const created = rec?.createdAt ?? decodeTime(id);
    if (!expired(created)) continue;
    await releaseDesign(id);
    await removeTree(dir);
    removed++;
  }
  return removed;
}
