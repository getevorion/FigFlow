/** Sniffs an image's MIME type from its magic bytes. */
export function sniffImageMime(b: Uint8Array): string {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image/gif";
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  if (b.length >= 4 && b[0] === 0x3c) return "image/svg+xml";
  return "application/octet-stream";
}

/** Pixel size of a PNG/JPEG/GIF/WebP from its header, without decoding. */
export function imageSize(b: Uint8Array): { width: number; height: number } | null {
  const mime = sniffImageMime(b);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  try {
    if (mime === "image/png") return { width: dv.getUint32(16), height: dv.getUint32(20) };
    if (mime === "image/gif") return { width: dv.getUint16(6, true), height: dv.getUint16(8, true) };
    if (mime === "image/jpeg") {
      let o = 2;
      while (o < b.length) {
        if (b[o] !== 0xff) return null;
        const marker = b[o + 1];
        const len = dv.getUint16(o + 2);
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { height: dv.getUint16(o + 5), width: dv.getUint16(o + 7) };
        }
        o += 2 + len;
      }
      return null;
    }
    if (mime === "image/webp") {
      const chunk = String.fromCharCode(b[12], b[13], b[14], b[15]);
      if (chunk === "VP8X") return { width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
      if (chunk === "VP8 ") return { width: dv.getUint16(26, true) & 0x3fff, height: dv.getUint16(28, true) & 0x3fff };
      if (chunk === "VP8L") {
        const bits = dv.getUint32(21, true);
        return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
      }
    }
  } catch {
    return null;
  }
  return null;
}
