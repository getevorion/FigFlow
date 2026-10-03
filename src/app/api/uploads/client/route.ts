import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { timingSafeEqual } from "node:crypto";
import { relative } from "node:path";
import { blob } from "@/server/data/blob";
import { finalizeBlobUpload } from "@/server/convert";
import { ownerId } from "@/server/owner";
import { dataDir } from "@/server/paths";
import { designPath, getUpload, MAX_UPLOAD_BYTES, sweep } from "@/server/store";

type Payload = { id: string; fileName: string; declared: number | null };

function pathnameForUpload(id: string): string {
  return relative(dataDir, designPath(id)).split("\\").join("/");
}

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as HandleUploadBody;
  const result = await handleUpload({
    request,
    body,
    onBeforeGenerateToken: async (pathname, clientPayload) => {
      const owner = await ownerId(true);
      let payload: Payload;
      try {
        payload = JSON.parse(clientPayload ?? "{}") as Payload;
      } catch {
        throw new Error("Invalid upload payload.");
      }
      const rec = payload.id ? await getUpload(payload.id) : null;
      if (!rec || rec.state !== "reading") throw new Error("Upload session expired. Try again.");
      const a = Buffer.from(rec.owner, "hex");
      const b = Buffer.from(owner, "hex");
      if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("Not allowed.");
      if (pathname !== pathnameForUpload(rec.id)) throw new Error("Invalid upload path.");
      if (payload.declared !== null && payload.declared > MAX_UPLOAD_BYTES)
        throw new Error(`The file is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`);
      return {
        maximumSizeInBytes: MAX_UPLOAD_BYTES,
        allowedContentTypes: ["application/octet-stream", "application/x-fig", "application/zip"],
        tokenPayload: JSON.stringify({ id: rec.id }),
      };
    },
    onUploadCompleted: async ({ tokenPayload, blob: blobResult }) => {
      const { id } = JSON.parse(tokenPayload ?? "{}") as { id: string };
      const rec = await getUpload(id);
      if (!rec) return;
      try {
        const { head } = await blob();
        const meta = await head(blobResult.pathname).catch(() => null);
        await finalizeBlobUpload(rec, meta?.size ?? 0);
        await sweep();
      } catch (e) {
        console.error("[figflow] client upload finalize failed:", e);
      }
    },
  });
  return Response.json(result);
}
