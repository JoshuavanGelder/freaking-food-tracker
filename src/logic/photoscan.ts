// Barcode lezen uit een foto, met ZXing (pure JavaScript).
// De live-scanner van Android (Google ML Kit) kan GS1 DataBar niet lezen; die zit
// op versproducten van o.a. Albert Heijn. ZXing kan dat wel.

import * as ZXns from '@zxing/library';
import * as jpegNs from 'jpeg-js';

const ZX: any = (ZXns as any).BarcodeFormat ? ZXns : (ZXns as any).default;
const jpeg: any = (jpegNs as any).decode ? jpegNs : (jpegNs as any).default;

function makeReader() {
  const hints = new Map();
  hints.set(ZX.DecodeHintType.POSSIBLE_FORMATS, [
    ZX.BarcodeFormat.RSS_EXPANDED,
    ZX.BarcodeFormat.RSS_14,
    ZX.BarcodeFormat.EAN_13,
    ZX.BarcodeFormat.EAN_8,
    ZX.BarcodeFormat.UPC_A,
    ZX.BarcodeFormat.CODE_128,
  ]);
  hints.set(ZX.DecodeHintType.TRY_HARDER, true);
  const reader = new ZX.MultiFormatReader();
  reader.setHints(hints);
  return { reader, hints };
}

/** RGBA-pixels naar grijswaarden; doorzichtig telt als wit. */
export function toGray(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height);
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    const a = rgba[p + 3] / 255;
    const lum = (rgba[p] * 299 + rgba[p + 1] * 587 + rgba[p + 2] * 114) / 1000;
    out[i] = lum * a + 255 * (1 - a);
  }
  return out;
}

/** Grijsbeeld 90° draaien (met de klok mee). */
export function rotate90(gray: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // nieuw beeld is height breed en width hoog
      out[x * height + (height - 1 - y)] = gray[y * width + x];
    }
  }
  return out;
}

/** Halveren in beide richtingen, voor grote foto's (sneller en vaak betrouwbaarder). */
export function halve(gray: Uint8ClampedArray, width: number, height: number): { gray: Uint8ClampedArray; width: number; height: number } {
  const w = Math.floor(width / 2);
  const h = Math.floor(height / 2);
  const out = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = 2 * y * width + 2 * x;
      out[y * w + x] = (gray[i] + gray[i + 1] + gray[i + width] + gray[i + width + 1]) / 4;
    }
  }
  return { gray: out, width: w, height: h };
}

function tryDecode(gray: Uint8ClampedArray, width: number, height: number): string | null {
  const { reader, hints } = makeReader();
  try {
    const source = new ZX.RGBLuminanceSource(gray, width, height);
    const bitmap = new ZX.BinaryBitmap(new ZX.HybridBinarizer(source));
    const result = reader.decode(bitmap, hints);
    const text = result?.getText?.();
    return text ? String(text) : null;
  } catch {
    return null;
  }
}

/** Probeert een barcode te vinden in grijswaarden, liggend en staand. */
export function decodeGray(gray: Uint8ClampedArray, width: number, height: number): string | null {
  let g = gray;
  let w = width;
  let h = height;
  while (Math.max(w, h) > 2000) ({ gray: g, width: w, height: h } = halve(g, w, h));
  return tryDecode(g, w, h) ?? tryDecode(rotate90(g, w, h), h, w);
}

export function decodeRGBA(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number): string | null {
  return decodeGray(toGray(rgba, width, height), width, height);
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/^data:[^,]*,/, '').replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = B64.indexOf(clean[i]);
    const b = B64.indexOf(clean[i + 1]);
    const c = i + 2 < clean.length ? B64.indexOf(clean[i + 2]) : 0;
    const d = i + 3 < clean.length ? B64.indexOf(clean[i + 3]) : 0;
    const n = (a << 18) | (b << 12) | (c << 6) | d;
    out[o++] = (n >> 16) & 255;
    if (i + 2 < clean.length) out[o++] = (n >> 8) & 255;
    if (i + 3 < clean.length) out[o++] = n & 255;
  }
  return out.subarray(0, o);
}

/** JPEG (base64) ontleden en de barcode eruit halen. */
export function decodeJpegBase64(b64: string): string | null {
  const img = jpeg.decode(base64ToBytes(b64), { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 256 });
  return decodeRGBA(img.data, img.width, img.height);
}
