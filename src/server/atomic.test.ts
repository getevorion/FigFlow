import { mkdtemp, open, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeFileAtomic } from "./atomic";

describe("writeFileAtomic", () => {
  let dir = "";
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("replaces a file a reader has open once the reader lets go (Windows refuses until then)", async () => {
    dir = await mkdtemp(join(tmpdir(), "ff-atomic-"));
    const path = join(dir, "upload.json");
    await writeFile(path, "old");
    const reader = await open(path, "r");
    setTimeout(() => void reader.close(), 60);
    await writeFileAtomic(path, "new");
    expect(await readFile(path, "utf8")).toBe("new");
    expect(await readdir(dir)).toEqual(["upload.json"]);
  });
});
