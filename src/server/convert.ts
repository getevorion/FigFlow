import "server-only";
import { createWriteStream, existsSync } from "node:fs";
import { open as openFile, rm } from "node:fs/promises";
import { once } from "node:events";
import { timingSafeEqual } from "node:crypto";
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

/** A .fig starts with the kiwi header or is a ZIP holding one. */
async function looksLikeFig(path: string): Promise<boolean> {
  const f = await openFile(path, "r");
  try {
    const head = Buffer.alloc(8);
    await f.read(head, 0, 8, 0);
    return head.toString("latin1") === "fig-kiwi" || (head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04);
  } finally {
    await f.close();
  }
}

/** Live uploads one browser may have, and the space all uploads may take (FIGFLOW_MAX_STORE_GB). */
const MAX_PER_OWNER = 10;
const MAX_STORE_BYTES = Number(process.env.FIGFLOW_MAX_STORE_GB ?? 20) * 1024 ** 3;

/**
 * Streams a request body to disk as a new upload, counting bytes as they
 * arrive: nothing is buffered in memory, and the upload stops at the limit.
 */
export async function receiveUpload(body: ReadableStream<Uint8Array>, fileName: string, declared: number | null, owner: string): Promise<UploadRecord> {
  if (declared !== null && declared > MAX_UPLOAD_BYTES) throw new UploadError(`The file is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`, 413);
  const live = await allUploads();
  if (live.filter((u) => u.owner === owner).length >= MAX_PER_OWNER)
    throw new UploadError(`You have ${MAX_PER_OWNER} files here already. Delete one, or wait for the oldest to expire.`, 429);
  // Uploads count at their size, or at the limit while the size isn't known.
  if (live.reduce((n, u) => n + u.size, 0) + (declared ?? MAX_UPLOAD_BYTES) > MAX_STORE_BYTES)
    throw new UploadError("Figflow is full right now. Try again in a little while.", 503);
  const rec: UploadRecord = { id: newId(), owner, fileName, size: 0, createdAt: Date.now(), state: "reading" };
  await createUpload(rec);
  const path = designPath(rec.id);
  const out = createWriteStream(path, { flags: "wx" });
  const reader = body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      rec.size += value.byteLength;
      if (rec.size > MAX_UPLOAD_BYTES) throw new UploadError(`The file is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`, 413);
      if (!out.write(value)) await once(out, "drain");
    }
    out.end();
    await once(out, "finish");
    if (declared !== null && rec.size !== declared) throw new UploadError("The upload was cut short. Try again.", 400);
    if (rec.size === 0) throw new UploadError("The file is empty.", 400);
    if (!(await looksLikeFig(path))) throw new UploadError("That isn't a .fig file. In Figma, use File → Save local copy.", 415);
  } catch (e) {
    reader.cancel().catch(() => undefined);
    out.destroy();
    await rm(uploadDir(rec.id), { recursive: true, force: true }).catch(() => undefined);
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
  // Only the engine's verdict on the file is "couldn't read": the store's own errors are the server's.
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
  if (ready.start) await buildProject(await newProject(ready, ready.start.frame));
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
  if (existsSync(path)) return path;
  let job = making.get(path);
  if (!job) {
    job = make().finally(() => making.delete(path));
    making.set(path, job);
  }
  await job;
  return path;
}
