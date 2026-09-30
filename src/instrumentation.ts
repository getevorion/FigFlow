/** Runs once when the server starts. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Uploads are deleted two hours after they're made (src/server/retention.ts).
    const { startRetention } = await import("./server/retention");
    startRetention();
    // A worker process started ahead of the first upload.
    const { warmEngine } = await import("./server/engine/pool");
    warmEngine();
  }
}
