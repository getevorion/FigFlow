import "server-only";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The repository root: the folder whose package.json is named "figflow".
 * The dev server can be started from another directory (next dev <dir>), so
 * process.cwd() isn't trusted; FIGFLOW_ROOT overrides the search.
 */
function findRoot(): string {
  if (process.env.FIGFLOW_ROOT) return resolve(process.env.FIGFLOW_ROOT);
  const starts: string[] = [];
  try {
    starts.push(dirname(fileURLToPath(import.meta.url)));
  } catch {
    // not a file: URL once bundled; the other starts cover it
  }
  if (process.argv[1]) starts.push(dirname(process.argv[1]));
  starts.push(process.cwd());
  for (const start of starts) {
    for (let dir = resolve(start); ; dir = dirname(dir)) {
      const pkg = join(dir, "package.json");
      if (existsSync(pkg)) {
        try {
          if ((JSON.parse(readFileSync(pkg, "utf8")) as { name?: string }).name === "figflow") return dir;
        } catch {
          // unreadable package.json: keep looking
        }
      }
      if (dirname(dir) === dir) break;
    }
  }
  throw new Error("Figflow's folder (the package.json named figflow) wasn't found; set FIGFLOW_ROOT.");
}

export const root = findRoot();
export const dataDir = join(root, ".data");
export const uploadsDir = join(dataDir, "uploads");
export const fontCacheDir = join(dataDir, "font-cache");
export const runtimeDir = join(root, "runtime");
export const workerScript = join(root, "src", "server", "engine", "worker.ts");
