/**
 * Figma's background blur in raster space, for the reference renderer (see
 * backdrop() in svg.ts): render what's behind the layer inside its bounds,
 * blur it with mirrored edges (Figma's behaviour, measured against its own
 * render), and return it as a PNG data URL the SVG shows under the layer.
 *
 * Node only (resvg); synchronous so renderSvg stays synchronous.
 */
import { Resvg } from "@resvg/resvg-js";
import { zlibSync } from "fflate";

export type BackdropRequest = {
  /** A complete SVG document of what's behind the layer, at the root's size and origin, with images for rasterizing at `zoom`. */
  svgAt: (zoom: number) => string;
  /** That document's size. */
  canvas: { w: number; h: number };
  /** The layer's bounds in that document, whole pixels: the part that's blurred. */
  region: { x: number; y: number; w: number; h: number };
  /** Gaussian sigma in pixels. */
  sigma: number;
  /** The scale the page will be rasterized at: the backdrop needn't be sharper. */
  scale: number;
};

/** The blurred backdrop as an image, and the part of the document it covers (at least the region). */
export type BackdropImage = { href: string; x: number; y: number; w: number; h: number };

/** Mirror an index into [0, n): d c b a | a b c d | d c b a. */
function mirror(i: number, n: number): number {
  if (n === 1) return 0;
  const period = 2 * n;
  let m = ((i % period) + period) % period;
  if (m >= n) m = period - 1 - m;
  return m;
}

function kernel(sigma: number): Float32Array {
  const r = Math.max(1, Math.ceil(sigma * 3));
  const k = new Float32Array(r * 2 + 1);
  let sum = 0;
  for (let i = -r; i <= r; i++) sum += k[i + r] = Math.exp((-i * i) / (2 * sigma * sigma));
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  return k;
}

/** Separable Gaussian blur of premultiplied RGBA with mirrored edges. */
export function blurMirrored(px: Uint8Array, w: number, h: number, sigma: number): Float32Array {
  const src = Float32Array.from(px);
  if (sigma <= 0.01) return src;
  const k = kernel(sigma);
  const r = (k.length - 1) / 2;
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let x = 0; x < w; x++) {
      let a = 0, b = 0, c = 0, d = 0;
      for (let i = -r; i <= r; i++) {
        const o = row + mirror(x + i, w) * 4;
        const kw = k[i + r];
        a += src[o] * kw;
        b += src[o + 1] * kw;
        c += src[o + 2] * kw;
        d += src[o + 3] * kw;
      }
      const o = row + x * 4;
      tmp[o] = a;
      tmp[o + 1] = b;
      tmp[o + 2] = c;
      tmp[o + 3] = d;
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let a = 0, b = 0, c = 0, d = 0;
      for (let i = -r; i <= r; i++) {
        const o = (mirror(y + i, h) * w + x) * 4;
        const kw = k[i + r];
        a += tmp[o] * kw;
        b += tmp[o + 1] * kw;
        c += tmp[o + 2] * kw;
        d += tmp[o + 3] * kw;
      }
      const o = (y * w + x) * 4;
      out[o] = a;
      out[o + 1] = b;
      out[o + 2] = c;
      out[o + 3] = d;
    }
  }
  return out;
}

// --- a minimal PNG encoder (RGBA8, no filtering) ----------------------------

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** Encodes premultiplied float RGBA as a straight-alpha PNG. */
export function encodePng(premul: Float32Array, w: number, h: number): Uint8Array {
  const raw = new Uint8Array((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter: none
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const o = y * (w * 4 + 1) + 1 + x * 4;
      const a = premul[i + 3];
      const inv = a > 0.5 ? 255 / a : 0;
      raw[o] = Math.min(255, Math.round(premul[i] * inv));
      raw[o + 1] = Math.min(255, Math.round(premul[i + 1] * inv));
      raw[o + 2] = Math.min(255, Math.round(premul[i + 2] * inv));
      raw[o + 3] = Math.min(255, Math.round(a));
    }
  }
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w);
  dv.setUint32(4, h);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const parts = [sig, chunk("IHDR", ihdr), chunk("IDAT", zlibSync(raw, { level: 6 })), chunk("IEND", new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/**
 * Renders, blurs and encodes one backdrop.
 *
 * A blur leaves no detail finer than its sigma, so wide blurs are rendered and
 * blurred at 1/f of the size, f = sigma / 4 (up to 8), and drawn stretched
 * back: the same downsample-blur-upsample a GPU blur does (and the runtime's
 * DX11 one), and most of the render's cost gone.
 */
export function rasterBackdrop(req: BackdropRequest): BackdropImage | undefined {
  const f = Math.max(1, Math.min(8, Math.floor(req.sigma / 4)));
  const zoom = Math.min(1, req.scale) / f;
  const { x, y, w, h } = req.region;
  // The crop is in the zoomed render's pixels; it covers the region, rounded out.
  const left = Math.max(0, Math.floor(x * zoom));
  const top = Math.max(0, Math.floor(y * zoom));
  const right = Math.min(Math.max(left + 1, Math.round(req.canvas.w * zoom)), Math.ceil((x + w) * zoom));
  const bottom = Math.min(Math.max(top + 1, Math.round(req.canvas.h * zoom)), Math.ceil((y + h) * zoom));
  if (right <= left || bottom <= top) return undefined;
  let rendered;
  try {
    // Rendered whole and cropped: rendering only the region trips a resvg bug
    // (a panic on groups its smaller viewport culls entirely).
    rendered = new Resvg(req.svgAt(zoom), { fitTo: { mode: "zoom", value: zoom }, crop: { left, top, right, bottom }, font: { loadSystemFonts: false } }).render();
  } catch {
    return undefined;
  }
  const blurred = blurMirrored(rendered.pixels, rendered.width, rendered.height, req.sigma * zoom);
  const png = encodePng(blurred, rendered.width, rendered.height);
  return {
    href: `data:image/png;base64,${Buffer.from(png).toString("base64")}`,
    x: left / zoom,
    y: top / zoom,
    w: rendered.width / zoom,
    h: rendered.height / zoom,
  };
}
