// Ink IoU for regress:hwp: a port of spikes/hwp/scripts/compare.py ink_score (36 dpi gray, 5x5 min-filter
// dilation, < 200 is ink, IoU of the two masks; the second image is resized to the first).
export function gray({ rgba, w, h }) {
  const g = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = Math.round(0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]);
  return { g, w, h };
}
export function crop(img, x0, x1) {
  const w = x1 - x0;
  const g = new Uint8Array(w * img.h);
  for (let y = 0; y < img.h; y++) g.set(img.g.subarray(y * img.w + x0, y * img.w + x1), y * w);
  return { g, w, h: img.h };
}
export function resize(img, w, h) {
  const g = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[y * w + x] = img.g[Math.min(img.h - 1, Math.floor((y * img.h) / h)) * img.w + Math.min(img.w - 1, Math.floor((x * img.w) / w))];
  return { g, w, h };
}
export function mask(img) {
  const { g, w, h } = img;
  const m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let mn = 255;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const yy = Math.min(h - 1, Math.max(0, y + dy));
          const xx = Math.min(w - 1, Math.max(0, x + dx));
          mn = Math.min(mn, g[yy * w + xx]);
        }
      m[y * w + x] = mn < 200 ? 1 : 0;
    }
  return m;
}
export function iou(a, b) {
  const bb = resize(b, a.w, a.h);
  const A = mask(a);
  const B = mask(bb);
  let inter = 0;
  let uni = 0;
  for (let i = 0; i < A.length; i++) {
    if (A[i] && B[i]) inter++;
    if (A[i] || B[i]) uni++;
  }
  return uni ? inter / uni : 1;
}
