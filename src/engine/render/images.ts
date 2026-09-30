/**
 * The design's images for renders: each as its file, and at 1/2, 1/4… of its
 * size, averaged down with sharp. A render asks for an image at the largest
 * size it draws it (imageSizes() in svg.ts) and gets the smallest copy still
 * at least that big. Decoding a large image to draw it small is most of a
 * render's cost otherwise, and resvg samples rather than averages, so a large
 * image drawn small comes out jagged where Figma's is smooth.
 */
import sharp from "sharp";
import { isDrawableImage, sniffImageMime } from "../util/mime";
import type { Size } from "./svg";

const FACTORS = [2, 4, 8, 16, 32];
/** Copies no smaller than this, in pixels, whatever they're drawn at. */
const MIN_SIDE = 8;

export class ImageLevels {
  /** hash → downscale factor → data URL; factor 1 is the file itself. */
  private readonly levels = new Map<string, Map<number, string>>();
  private readonly sizes = new Map<string, Size | null>();
  /** Work under way, shared by renders that need the same thing: sizes by hash, copies by "hash@factor". */
  private readonly sizing = new Map<string, Promise<Size | null>>();
  private readonly making = new Map<string, Promise<void>>();

  constructor(private readonly images: Map<string, Uint8Array>) {}

  /** Makes the copies for renders drawing each image at most `drawn` (output pixels). */
  async prepare(drawn: Map<string, Size>): Promise<void> {
    await Promise.all([...drawn].map(([hash, want]) => this.ensure(hash, want)));
  }

  /** SvgOptions.imageHref: the smallest prepared copy at least `want` big, else the file; none for bytes that aren't an image. */
  readonly href = (hash: string, want?: Size): string | undefined => {
    const bytes = this.images.get(hash);
    if (!bytes || !isDrawableImage(bytes)) return undefined;
    const levels = this.levelsOf(hash, bytes);
    const size = this.sizes.get(hash);
    if (want && size) for (let f = factorFor(size, want); f > 1; f /= 2) if (levels.has(f)) return levels.get(f);
    return levels.get(1);
  };

  private async ensure(hash: string, want: Size): Promise<void> {
    const bytes = this.images.get(hash);
    if (!bytes || !isDrawableImage(bytes)) return;
    const size = await this.sizeOf(hash, bytes);
    if (!size) return;
    const f = factorFor(size, want);
    if (f === 1 || this.levelsOf(hash, bytes).has(f)) return;
    const key = `${hash}@${f}`;
    let work = this.making.get(key);
    if (!work) {
      work = this.make(hash, bytes, size, f);
      this.making.set(key, work);
    }
    await work;
  }

  private async make(hash: string, bytes: Uint8Array, size: Size, f: number): Promise<void> {
    try {
      const png = await sharp(bytes)
        .resize(Math.max(1, Math.round(size.w / f)), Math.max(1, Math.round(size.h / f)), { fit: "fill" })
        .png({ compressionLevel: 2 })
        .toBuffer();
      this.levelsOf(hash, bytes).set(f, `data:image/png;base64,${png.toString("base64")}`);
    } catch {
      // drawn from the file, at full size
    }
  }

  private levelsOf(hash: string, bytes: Uint8Array): Map<number, string> {
    let levels = this.levels.get(hash);
    if (!levels) {
      levels = new Map([[1, `data:${sniffImageMime(bytes)};base64,${Buffer.from(bytes).toString("base64")}`]]);
      this.levels.set(hash, levels);
    }
    return levels;
  }

  private sizeOf(hash: string, bytes: Uint8Array): Promise<Size | null> {
    let work = this.sizing.get(hash);
    if (!work) {
      work = sharp(bytes)
        .metadata()
        .then((meta) => (meta.width && meta.height ? { w: meta.width, h: meta.height } : null))
        .catch(() => null)
        .then((size) => {
          this.sizes.set(hash, size);
          return size;
        });
      this.sizing.set(hash, work);
    }
    return work;
  }
}

/** The largest downscale that keeps an image of `size` at least `want` big. */
function factorFor(size: Size, want: Size): number {
  let f = 1;
  for (const g of FACTORS) {
    const w = size.w / g;
    const h = size.h / g;
    if (w < want.w || h < want.h || w < MIN_SIDE || h < MIN_SIDE) break;
    f = g;
  }
  return f;
}
