import { prepareUpload, UploadError } from "@/server/convert";
import { ownerId } from "@/server/owner";
import { designPath } from "@/server/store";
import { noStore } from "@/server/views";
import { relative } from "node:path";
import { dataDir } from "@/server/paths";

function cleanName(raw: string): string {
  const safe = [...raw].map((ch) => (ch.charCodeAt(0) < 32 || '\\/:*?"<>|'.includes(ch) ? "_" : ch)).join("");
  return safe.trim().slice(-160) || "design.fig";
}

export async function POST(req: Request) {
  const owner = await ownerId(true);
  const body = (await req.json().catch(() => null)) as { fileName?: string; declared?: number } | null;
  const fileName = cleanName(body?.fileName ?? "design.fig");
  if (!/\.fig$/i.test(fileName)) return Response.json({ error: "Upload a .fig file." }, { status: 415, headers: noStore });
  const declared = typeof body?.declared === "number" && body.declared >= 0 ? body.declared : null;
  try {
    const rec = await prepareUpload(fileName, owner, declared);
    const pathname = relative(dataDir, designPath(rec.id)).split("\\").join("/");
    return Response.json({ id: rec.id, pathname }, { status: 201, headers: noStore });
  } catch (e) {
    if (e instanceof UploadError) return Response.json({ error: e.message }, { status: e.status, headers: noStore });
    throw e;
  }
}
