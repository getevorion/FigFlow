import "server-only";

/** Lazy-loaded Vercel Blob client (avoids build-time side effects). */
export async function blob() {
  return import("@vercel/blob");
}
