// 배경 지우기 pre/post-processing (Sprint C, C2; brief Flow). Pure functions on typed arrays: the controller, the
// inference worker and the unit tests share them.
// - Input: the photo resized to 512×512 (aspect not kept; Pillow's bilinear, as the Python reference), RGB scaled
//   to 0..1 and normalised with the ImageNet mean/std, planar NCHW float32 (the export's `input_image`, 1×3×512×512).
// - Output: `output_image`, 1×1×512×512, already a sigmoid in the graph (0..1).
// - Area check: under 1 % of the mask above 0.5 is "no subject" (no download).
// - The mask is upsampled to the work copy with bilinear sampling, half-pixel centres (cv2 INTER_LINEAR, which the
//   spike and parity.py used), and stored as 8-bit alpha (a quarter of a float plane).

export const SIZE = 512;
export const MEAN = [0.485, 0.456, 0.406] as const;
export const STD = [0.229, 0.224, 0.225] as const;
/** Brief Flow: area(a > 0.5) < 1 % -> nosubject. */
export const NOSUBJECT_AREA = 0.01;

/** RGBA (SIZE×SIZE×4, straight) -> planar normalised float32 (3×SIZE×SIZE). */
export function toInput(rgba: Uint8ClampedArray | Uint8Array, size: number = SIZE): Float32Array {
  const n = size * size;
  if (rgba.length !== n * 4) throw new Error(`toInput: expected ${n * 4} bytes, got ${rgba.length}`);
  const out = new Float32Array(3 * n);
  const k = [0, 1, 2].map((c) => ({ s: 1 / (255 * STD[c]!), o: MEAN[c]! / STD[c]! }));
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    out[i] = rgba[p]! * k[0]!.s - k[0]!.o;
    out[n + i] = rgba[p + 1]! * k[1]!.s - k[1]!.o;
    out[2 * n + i] = rgba[p + 2]! * k[2]!.s - k[2]!.o;
  }
  return out;
}

/** Fixed-point bits of Pillow's 8-bit resampler (libImaging/Resample.c: 32 − 8 − 2). */
const PRECISION_BITS = 22;

/** Pillow's bilinear (triangle) coefficients for one axis, as fixed-point integers, with the first source index. */
function pilCoeffs(inSize: number, outSize: number): { bounds: Int32Array; k: Int32Array[] } {
  const scale = inSize / outSize;
  const filterscale = scale < 1 ? 1 : scale;
  const support = filterscale; // bilinear support 1.0 × filterscale
  const bounds = new Int32Array(outSize * 2);
  const k: Int32Array[] = [];
  for (let xx = 0; xx < outSize; xx++) {
    const center = (xx + 0.5) * scale;
    let xmin = Math.trunc(center - support + 0.5);
    if (xmin < 0) xmin = 0;
    let xmax = Math.trunc(center + support + 0.5);
    if (xmax > inSize) xmax = inSize;
    xmax -= xmin;
    const w = new Float64Array(xmax);
    let ww = 0;
    for (let x = 0; x < xmax; x++) {
      const t = Math.abs((x + xmin - center + 0.5) / filterscale);
      w[x] = t < 1 ? 1 - t : 0;
      ww += w[x]!;
    }
    const fixed = new Int32Array(xmax);
    for (let x = 0; x < xmax; x++) {
      const v = ww !== 0 ? w[x]! / ww : 0;
      fixed[x] = Math.trunc(v < 0 ? v * (1 << PRECISION_BITS) - 0.5 : v * (1 << PRECISION_BITS) + 0.5);
    }
    bounds[xx * 2] = xmin;
    bounds[xx * 2 + 1] = xmax;
    k.push(fixed);
  }
  return { bounds, k };
}

const clip8 = (ss: number): number => {
  const v = Math.floor(ss / (1 << PRECISION_BITS));
  return v < 0 ? 0 : v > 255 ? 255 : v;
};

/**
 * RGBA (`sw`×`sh`) resized to `dw`×`dh` exactly as Pillow's `Image.resize(..., BILINEAR)` does for an 8-bit RGB
 * image (horizontal pass into an 8-bit image, then vertical; fixed-point weights). parity.py and the model's
 * Python reference resize this way, so the browser input matches it (C2: a canvas resize gave mask differences up
 * to 0.0086 on the real photos, over the 0.002 gate). Alpha is set to 255.
 */
export function pilResizeRgba(src: Uint8ClampedArray | Uint8Array, sw: number, sh: number, dw: number, dh: number): Uint8ClampedArray {
  const h = pilCoeffs(sw, dw);
  const tmp = new Uint8ClampedArray(dw * sh * 4);
  for (let y = 0; y < sh; y++) {
    const row = y * sw * 4;
    for (let xx = 0; xx < dw; xx++) {
      const xmin = h.bounds[xx * 2]!;
      const n = h.bounds[xx * 2 + 1]!;
      const k = h.k[xx]!;
      let r = 1 << (PRECISION_BITS - 1);
      let g = r;
      let b = r;
      for (let x = 0; x < n; x++) {
        const p = row + (xmin + x) * 4;
        const c = k[x]!;
        r += src[p]! * c;
        g += src[p + 1]! * c;
        b += src[p + 2]! * c;
      }
      const o = (y * dw + xx) * 4;
      tmp[o] = clip8(r);
      tmp[o + 1] = clip8(g);
      tmp[o + 2] = clip8(b);
    }
  }
  const v = pilCoeffs(sh, dh);
  const out = new Uint8ClampedArray(dw * dh * 4);
  for (let yy = 0; yy < dh; yy++) {
    const ymin = v.bounds[yy * 2]!;
    const n = v.bounds[yy * 2 + 1]!;
    const k = v.k[yy]!;
    for (let x = 0; x < dw; x++) {
      let r = 1 << (PRECISION_BITS - 1);
      let g = r;
      let b = r;
      for (let y = 0; y < n; y++) {
        const p = ((ymin + y) * dw + x) * 4;
        const c = k[y]!;
        r += tmp[p]! * c;
        g += tmp[p + 1]! * c;
        b += tmp[p + 2]! * c;
      }
      const o = (yy * dw + x) * 4;
      out[o] = clip8(r);
      out[o + 1] = clip8(g);
      out[o + 2] = clip8(b);
      out[o + 3] = 255;
    }
  }
  return out;
}

/**
 * The model input of a decoded photo (work copy): its pixels read once from a 2d canvas, resized to SIZE×SIZE
 * (aspect not kept) with pilResizeRgba, then toInput. Null when no canvas is available (the device is short of
 * room). DOM only (page and harness).
 */
export function inputFromImage(img: ImageBitmap): Float32Array | null {
  const { width: w, height: h } = img;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g) return null;
  g.drawImage(img, 0, 0);
  const px = g.getImageData(0, 0, w, h).data;
  c.width = 0;
  c.height = 0;
  return toInput(pilResizeRgba(px, w, h, SIZE, SIZE));
}

/** Fraction of the mask above `threshold`. */
export function maskArea(mask: ArrayLike<number>, threshold = 0.5): number {
  if (mask.length === 0) return 0;
  let n = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i]! > threshold) n++;
  return n / mask.length;
}

export const hasSubject = (mask: ArrayLike<number>): boolean => maskArea(mask) >= NOSUBJECT_AREA;

/** True when every value is a finite number in 0..1 (the graph ends in a sigmoid; anything else is a broken run). */
export function validMask(mask: ArrayLike<number>): boolean {
  for (let i = 0; i < mask.length; i++) {
    const v = mask[i]!;
    if (!(v >= 0 && v <= 1)) return false;
  }
  return mask.length > 0;
}

/**
 * Bilinear upsample (or downsample) of a `sw`×`sh` float mask to `dw`×`dh` 8-bit alpha (0..255), half-pixel
 * centres and edge clamping, as cv2.resize INTER_LINEAR.
 */
export function resizeMask(mask: ArrayLike<number>, sw: number, sh: number, dw: number, dh: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(dw * dh);
  const fx = sw / dw;
  const fy = sh / dh;
  const x0s = new Int32Array(dw);
  const x1s = new Int32Array(dw);
  const wxs = new Float32Array(dw);
  for (let x = 0; x < dw; x++) {
    let sx = (x + 0.5) * fx - 0.5;
    if (sx < 0) sx = 0;
    const x0 = Math.min(Math.floor(sx), sw - 1);
    x0s[x] = x0;
    x1s[x] = Math.min(x0 + 1, sw - 1);
    wxs[x] = sx - x0;
  }
  for (let y = 0; y < dh; y++) {
    let sy = (y + 0.5) * fy - 0.5;
    if (sy < 0) sy = 0;
    const y0 = Math.min(Math.floor(sy), sh - 1);
    const y1 = Math.min(y0 + 1, sh - 1);
    const wy = sy - y0;
    const r0 = y0 * sw;
    const r1 = y1 * sw;
    const o = y * dw;
    for (let x = 0; x < dw; x++) {
      const a = x0s[x]!;
      const b = x1s[x]!;
      const wx = wxs[x]!;
      const top = mask[r0 + a]! + (mask[r0 + b]! - mask[r0 + a]!) * wx;
      const bot = mask[r1 + a]! + (mask[r1 + b]! - mask[r1 + a]!) * wx;
      out[o + x] = Math.round((top + (bot - top) * wy) * 255);
    }
  }
  return out;
}

/** Blur-fusion radii for a work copy whose long edge is `longEdge` (brief: r1 = 45·s, r2 = 4·s, s = long/1600). */
export function fusionRadii(longEdge: number): { r1: number; r2: number } {
  const s = longEdge / 1600;
  return { r1: Math.max(1, Math.round(45 * s)), r2: Math.max(1, Math.round(4 * s)) };
}
