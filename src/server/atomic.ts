/**
 * Whole-or-nothing file writes for the store and the engine worker (no "server-only" here: the
 * worker is a plain Node process).
 */
import { rename, rm, writeFile } from "node:fs/promises";

/** What Windows answers, for a moment, while another handle has the file open (a reader, a virus scanner). */
const BUSY = new Set(["EPERM", "EACCES", "EBUSY"]);

/**
 * Moves `from` over `to`. Windows won't replace a file that some other handle has open, and the
 * site's own readers open upload.json several times a second while a design converts, so there it
 * retries with doubling pauses for up to about 5 s. npm does the same (npm/cli#9028); graceful-fs
 * only retries when `to` doesn't exist yet, which isn't this case.
 */
export async function replaceFile(from: string, to: string): Promise<void> {
  for (let pause = 10; ; pause *= 2) {
    try {
      await rename(from, to);
      return;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code ?? "";
      if (process.platform !== "win32" || !BUSY.has(code) || pause > 2560) throw e;
      await new Promise((resolve) => setTimeout(resolve, pause));
    }
  }
}

/** Writes a file whole or not at all: readers see the old contents or the new, never half of either. */
export async function writeFileAtomic(path: string, data: string | Uint8Array): Promise<void> {
  const tmp = `${path}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  await writeFile(tmp, data);
  try {
    await replaceFile(tmp, path);
  } catch (e) {
    await rm(tmp, { force: true }).catch(() => undefined);
    throw e;
  }
}
