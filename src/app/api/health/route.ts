import { usesBlob } from "@/server/data/io";

export const dynamic = "force-dynamic";

/** Lightweight health check for uptime monitors and Vercel deployments. */
export async function GET() {
  return Response.json({
    ok: true,
    engine: process.env.VERCEL === "1" || process.env.FIGFLOW_ENGINE === "inline" ? "inline" : "worker",
    storage: usesBlob() ? "blob" : "disk",
  });
}
