import "server-only";
import { timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { pathExists, readBytes, removeTree, streamToPath, usesBlob } from "./data/io";
import { engine, openDesign } from "./engine/pool";
import { ownerId } from "./owner";
import { fontCacheDir, runtimeDir } from "./paths";
import {
  MAX_UPLOAD_BYTES,
  allUploads,
  createUpload,
  designPath,
  getProject,
  getUpload,
  newId,
  projectDir,
  saveProject,
  saveUpload,
  uploadDir,
  type ProjectRecord,
  type UploadRecord,
} from "./store";

/** The upload `id` when it belongs to this browser. */
export async function ownedUpload(id: string): Promise<UploadRecord | null> {
  const owner = await ownerId();
  const rec = owner ? await getUpload(id) : null;
  if (!owner || !rec) return null;
  const a = Buffer.from(rec.owner, "hex");
  const b = Buffer.from(owner, "hex");
  return a.length === b.length && timingSafeEqual(a, b) ? rec : null;
}

export class UploadError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function looksLikeFigBytes(file: Buffer): boolean {
  if (file.length < 4) return false;
  return file.subarray(0, 8).toString("latin1") === "fig-kiwi" || (file[0] === 0x50 && file[1] === 0x4b && file[2] === 0x03 && file[3] === 0x04);
}

async function looksLikeFig(path: string): Promise<boolean> {
  const file = await readBytes(path);
  return file ? looksLikeFigBytes(file) : false;
}

/** Live uploads one browser may have, and the space all uploads may take (FIGFLOW_MAX_STORE_GB). */
const MAX_PER_OWNER = 10;
const MAX_STORE_BYTES = Number(process.env.FIGFLOW_MAX_STORE_GB ?? 20) * 1024 ** 3;

/**
 * Streams a request body to storage as a new upload, counting bytes as they
 * arrive: nothing is buffered in memory, and the upload stops at the limit.
 */
export async function assertUploadAllowed(owner: string, declared: number | null): Promise<void> {
  if (declared !== null && declared > MAX_UPLOAD_BYTES) throw new UploadError(`The file is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`, 413);
  const live = await allUploads();
  if (live.filter((u) => u.owner === owner).length >= MAX_PER_OWNER)
    throw new UploadError(`You have ${MAX_PER_OWNER} files here already. Delete one, or wait for the oldest to expire.`, 429);
  if (live.reduce((n, u) => n + u.size, 0) + (declared ?? MAX_UPLOAD_BYTES) > MAX_STORE_BYTES)
    throw new UploadError("Figflow is full right now. Try again in a little while.", 503);
}

export async function prepareUpload(fileName: string, owner: string, declared: number | null): Promise<UploadRecord> {
  await assertUploadAllowed(owner, declared);
  const rec: UploadRecord = { id: newId(), owner, fileName, size: 0, createdAt: Date.now(), state: "reading" };
  await createUpload(rec);
  return rec;
}

export async function receiveUpload(body: ReadableStream<Uint8Array>, fileName: string, declared: number | null, owner: string): Promise<UploadRecord> {
  if (usesBlob()) throw new UploadError("Use client upload on this deployment.", 501);
  const rec = await prepareUpload(fileName, owner, declared);
  const path = designPath(rec.id);
  try {
    rec.size = await streamToPath(path, body, MAX_UPLOAD_BYTES);
    if (declared !== null && rec.size !== declared) throw new UploadError("The upload was cut short. Try again.", 400);
    if (rec.size === 0) throw new UploadError("The file is empty.", 400);
    if (!(await looksLikeFig(path))) throw new UploadError("That isn't a .fig file. In Figma, use File → Save local copy.", 415);
  } catch (e) {
    if (e instanceof Error && e.message === "too-large") throw new UploadError(`The file is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`, 413);
    await removeTree(uploadDir(rec.id));
    throw e instanceof UploadError ? e : new UploadError("The upload failed. Try again.", 400);
  }
  await saveUpload(rec);
  return rec;
}

/** A project name from the design's file name: "Cheat Loader (Community)" → "Cheat Loader". */
function projectNameOf(fileName: string): string | undefined {
  const name = fileName
    .replace(/\.fig$/i, "")
    .replace(/\s*[([][^)\]]*[)\]]\s*/g, " ")
    .trim();
  return /[\p{L}\p{N}]/u.test(name) ? name.slice(0, 60) : undefined;
}

/**
 * Reads an upload in its worker, then converts it without asking: Figflow
 * picks the frame the app starts on and makes the project from it.
 */
export async function readDesign(rec: UploadRecord): Promise<void> {
  let design: NonNullable<UploadRecord["design"]>;
  try {
    design = await openDesign(rec.id, designPath(rec.id));
  } catch (e) {
    await saveUpload({ ...rec, state: "failed", error: `Figflow couldn't read this file: ${e instanceof Error ? e.message : String(e)}` });
    return;
  }
  if (!design.pages.some((p) => p.frames.length)) {
    await saveUpload({ ...rec, state: "failed", error: "The file has no frames to convert. Frames at the top level of a page are what Figflow converts." });
    return;
  }
  const start = await engine(rec.id, designPath(rec.id), "pick", {}).catch(() => null);
  const ready: UploadRecord = { ...rec, state: "ready", design, ...(start ? { start } : {}) };
  await saveUpload(ready);
  if (ready.start) {
    const project = await newProject(ready, ready.start.frame);
    after(() => buildProject(project));
  }
}

export async function finalizeBlobUpload(rec: UploadRecord, size: number): Promise<void> {
  if (size === 0) {
    await removeTree(uploadDir(rec.id));
    throw new UploadError("The file is empty.", 400);
  }
  if (!(await looksLikeFig(designPath(rec.id)))) {
    await removeTree(uploadDir(rec.id));
    throw new UploadError("That isn't a .fig file. In Figma, use File → Save local copy.", 415);
  }
  rec.size = size;
  await saveUpload(rec);
  after(() => readDesign(rec));
}

/** Starts a project, named after the design file; the record is saved as it goes (working, then ready or failed). */
export async function newProject(upload: UploadRecord, frame: string): Promise<ProjectRecord> {
  const name = projectNameOf(upload.design?.name ?? upload.fileName) ?? projectNameOf(upload.fileName);
  const rec: ProjectRecord = { id: newId(), upload: upload.id, frame, ...(name ? { name } : {}), createdAt: Date.now(), state: "working" };
  await saveProject(rec);
  return rec;
}

export async function buildProject(rec: ProjectRecord): Promise<void> {
  try {
    const manifest = await engine(rec.upload, designPath(rec.upload), "generate", {
      frame: rec.frame,
      name: rec.name,
      dir: projectDir(rec.upload, rec.id),
      runtimeDir,
      fontCacheDir,
    });
    await saveProject({ ...rec, state: "ready", manifest });
  } catch (e) {
    await saveProject({ ...rec, state: "failed", error: e instanceof Error ? e.message : String(e) });
  }
}

/** The project `id` of an upload this browser owns. */
export async function ownedProject(upload: string, id: string): Promise<{ upload: UploadRecord; project: ProjectRecord } | null> {
  const u = await ownedUpload(upload);
  const p = u ? await getProject(upload, id) : null;
  return u && p ? { upload: u, project: p } : null;
}

const making = new Map<string, Promise<unknown>>();

/** A file the worker makes on first request and keeps (thumbnails, previews); requests for it meanwhile share the one job. */
export async function cached(path: string, make: () => Promise<unknown>): Promise<string> {
  if (await pathExists(path)) return path;
  let job = making.get(path);
  if (!job) {
    job = make().finally(() => making.delete(path));
    making.set(path, job);
  }
  await job;
  return path;
}
