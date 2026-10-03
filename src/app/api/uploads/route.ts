import type { NextRequest } from "next/server";
import { UploadError, readDesign, receiveUpload } from "@/server/convert";
import { usesBlob } from "@/server/data/io";
import { ownerId } from "@/server/owner";

export const maxDuration = 300;
import { listUploads, sweep } from "@/server/store";
import { noStore, uploadView } from "@/server/views";

/** A file name safe to show and store: no path separators or control characters. */
function cleanName(raw: string | null): string {
  let name = "design.fig";
  try {
    if (raw) name = decodeURIComponent(raw);
  } catch {
    // keep the default
  }
  const safe = [...name].map((ch) => (ch.charCodeAt(0) < 32 || '\\/:*?"<>|'.includes(ch) ? "_" : ch)).join("");
  return safe.trim().slice(-160) || "design.fig";
}

/**
 * Upload a .fig: the raw file is the request body (not multipart), its name
 * in X-File-Name. The body is streamed to disk and checked as it arrives.
 */
export async function POST(req: NextRequest) {
  if (usesBlob()) {
    return Response.json({ error: "Direct upload is disabled here. Refresh the page and try again." }, { status: 501, headers: noStore });
  }
  const owner = await ownerId(true);
  const fileName = cleanName(req.headers.get("x-file-name"));
  if (!/\.fig$/i.test(fileName)) return Response.json({ error: "Upload a .fig file. In Figma, use File → Save local copy." }, { status: 415, headers: noStore });
  if (!req.body) return Response.json({ error: "The upload was empty." }, { status: 400, headers: noStore });
  const length = req.headers.get("content-length");
  const declared = length && /^\d+$/.test(length) ? Number(length) : null;
  try {
    const rec = await receiveUpload(req.body, fileName, declared, owner);
    await readDesign(rec);
    await sweep();
    return Response.json({ id: rec.id }, { status: 201, headers: noStore });
  } catch (e) {
    if (e instanceof UploadError) return Response.json({ error: e.message }, { status: e.status, headers: noStore });
    throw e;
  }
}

/** This browser's uploads from the last two hours. */
export async function GET() {
  const owner = await ownerId();
  const uploads = owner ? await listUploads(owner) : [];
  return Response.json({ uploads: uploads.map((u) => uploadView(u)) }, { headers: noStore });
}
