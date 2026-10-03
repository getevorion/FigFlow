import { ownerId } from "@/server/owner";

/** Ensures the browser owner cookie (Route Handler — safe to set cookies). */
export async function POST() {
  await ownerId(true);
  return Response.json({ ok: true });
}
