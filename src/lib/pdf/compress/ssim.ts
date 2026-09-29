// Luma SSIM (spike lib.mjs `compareCanvases`): mean over 8×8 windows with stride 4.
// The image-pass gate halves images wider than 1200 px first. The spike did that with canvas
// smoothing; here it is a pure-JS 2×2 box average, so the gate gives the same answer in every
// browser and in Node.

export interface Rgba {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
}

export interface Luma {
  g: Float32Array;
  width: number;
  height: number;
}

/** Images wider than this are compared at half resolution by the gate. */
export const GATE_HALF_ABOVE = 1200;

export function toLuma(img: Rgba): Luma {
  const { data, width, height } = img;
  const g = new Float32Array(width * height);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = 0.299 * data[j]! + 0.587 * data[j + 1]! + 0.114 * data[j + 2]!;
  return { g, width, height };
}

/** 2×2 box average (an odd last row or column is dropped). */
export function boxHalf(l: Luma): Luma {
  const width = Math.floor(l.width / 2);
  const height = Math.floor(l.height / 2);
  const g = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const r0 = 2 * y * l.width;
    const r1 = r0 + l.width;
    for (let x = 0; x < width; x++) {
      const k = 2 * x;
      g[y * width + x] = (l.g[r0 + k]! + l.g[r0 + k + 1]! + l.g[r1 + k]! + l.g[r1 + k + 1]!) / 4;
    }
  }
  return { g, width, height };
}

/** Mean SSIM over 8×8 windows, stride 4, on the common top-left area of two luma planes. */
export function ssimLuma(a: Luma, b: Luma): number {
  const w = Math.min(a.width, b.width);
  const h = Math.min(a.height, b.height);
  const C1 = (0.01 * 255) ** 2;
  const C2 = (0.03 * 255) ** 2;
  let s = 0;
  let n = 0;
  for (let y = 0; y + 8 <= h; y += 4) {
    for (let x = 0; x + 8 <= w; x += 4) {
      let ma = 0;
      let mb = 0;
      for (let yy = 0; yy < 8; yy++) {
        for (let xx = 0; xx < 8; xx++) {
          ma += a.g[(y + yy) * a.width + x + xx]!;
          mb += b.g[(y + yy) * b.width + x + xx]!;
        }
      }
      ma /= 64;
      mb /= 64;
      let va = 0;
      let vb = 0;
      let cov = 0;
      for (let yy = 0; yy < 8; yy++) {
        for (let xx = 0; xx < 8; xx++) {
          const da = a.g[(y + yy) * a.width + x + xx]! - ma;
          const db = b.g[(y + yy) * b.width + x + xx]! - mb;
          va += da * da;
          vb += db * db;
          cov += da * db;
        }
      }
      va /= 63;
      vb /= 63;
      cov /= 63;
      s += ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2));
      n++;
    }
  }
  return n ? s / n : 1;
}

/** The image-pass gate metric. */
export function ssimImages(a: Rgba, b: Rgba): number {
  let la = toLuma(a);
  let lb = toLuma(b);
  if (a.width > GATE_HALF_ABOVE) {
    la = boxHalf(la);
    lb = boxHalf(lb);
  }
  return ssimLuma(la, lb);
}
