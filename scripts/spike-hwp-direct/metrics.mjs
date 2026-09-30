// SSIM for the SPIKE-HWP-DIRECT scorer (grey images {g,w,h}; 8x8 windows, stride 4).
import { resize } from '../regress/hwp-ink.mjs';

export function ssim(a, b) {
  // Compare on the common area (renders are made at matched scales; a 1 px size difference must not become
  // a resampling shift).
  if (b.w !== a.w || b.h !== a.h) {
    const w = Math.min(a.w, b.w), h = Math.min(a.h, b.h);
    const cut = (im) => { const g = new Uint8Array(w * h); for (let y = 0; y < h; y++) g.set(im.g.subarray(y * im.w, y * im.w + w), y * w); return { g, w, h }; };
    if (Math.abs(a.w - b.w) > 3 || Math.abs(a.h - b.h) > 3) b = resize(b, a.w, a.h);
    else { a = cut(a); b = cut(b); }
  }
  const C1 = (0.01 * 255) ** 2, C2 = (0.03 * 255) ** 2;
  const W = 8, S = 4;
  let tot = 0, n = 0;
  for (let y = 0; y + W <= a.h; y += S)
    for (let x = 0; x + W <= a.w; x += S) {
      let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
      for (let j = 0; j < W; j++) {
        const o = (y + j) * a.w + x;
        for (let i = 0; i < W; i++) {
          const p = a.g[o + i], q = b.g[o + i];
          sa += p; sb += q; saa += p * p; sbb += q * q; sab += p * q;
        }
      }
      const N = W * W;
      const ma = sa / N, mb = sb / N;
      const va = saa / N - ma * ma, vb = sbb / N - mb * mb, cov = sab / N - ma * mb;
      tot += ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2));
      n++;
    }
  return n ? tot / n : 1;
}

