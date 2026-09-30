/**
 * Google Fonts as a font provider: the CSS2 API serves a complete static TTF
 * per family/weight/style to clients that don't ask for WOFF2, and every font
 * it serves is under the SIL OFL or Apache 2.0, so it can ship in a project.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { FontKey, FontProvider } from "../codegen/fonts";

const MISS = new Uint8Array([0x4d, 0x49, 0x53, 0x53]); // cached "not on Google Fonts"

function cacheName(k: FontKey): string {
  return `${k.family.replace(/[^a-z0-9]+/gi, "_")}-${k.weight}${k.italic ? "i" : ""}.ttf`;
}

export function googleFontsProvider(cacheDir: string, fetchImpl: typeof fetch = fetch): FontProvider {
  mkdirSync(cacheDir, { recursive: true });
  return async (key) => {
    const file = join(cacheDir, cacheName(key));
    if (existsSync(file)) {
      const b = new Uint8Array(readFileSync(file));
      return b.length === MISS.length && b.every((v, i) => v === MISS[i]) ? null : b;
    }
    const family = encodeURIComponent(key.family).replace(/%20/g, "+");
    const url = `https://fonts.googleapis.com/css2?family=${family}:ital,wght@${key.italic ? 1 : 0},${key.weight}`;
    let css: string;
    try {
      // No browser user agent: Google then answers with plain TrueType files.
      const res = await fetchImpl(url, { headers: { "User-Agent": "figflow/1.0" } });
      if (res.status === 400 || res.status === 404) {
        writeFileSync(file, MISS);
        return null;
      }
      if (!res.ok) return null;
      css = await res.text();
    } catch {
      return null;
    }
    const src = css.match(/src:\s*url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.ttf)\)/);
    if (!src) {
      writeFileSync(file, MISS);
      return null;
    }
    try {
      const res = await fetchImpl(src[1]);
      if (!res.ok) return null;
      const bytes = new Uint8Array(await res.arrayBuffer());
      writeFileSync(file, bytes);
      return bytes;
    } catch {
      return null;
    }
  };
}
