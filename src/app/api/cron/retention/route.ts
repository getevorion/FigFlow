import { sweep } from "@/server/store";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Vercel Cron: delete uploads past retention (see vercel.json). */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  }
  const removed = await sweep();
  return Response.json({ removed });
}
