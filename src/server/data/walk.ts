import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

export async function walk(root: string): Promise<string[]> {
  const out: string[] = [];
  async function visit(dir: string) {
    let names: string[];
    try {
      names = await readdir(dir);
    } catch {
      return;
    }
    for (const name of names) {
      const path = join(dir, name);
      const info = await stat(path).catch(() => null);
      if (!info) continue;
      if (info.isDirectory()) await visit(path);
      else out.push(path);
    }
  }
  await visit(root);
  return out;
}
