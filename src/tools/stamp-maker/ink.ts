// 도장 만들기 (STAMP1015 D6): 인주 질감. A seeded, deterministic wear applied to the painted stamp before encoding:
// two octaves of value noise thin the ink (alpha kept at 60-100 %), the edge layer is roughened (up to 1 pixel eaten),
// and a few pin holes open (well under 2 % of the area). Same (pixels, seed) -> identical pixels. The noise lives in
// coordinates relative to the long edge, so a tile, the preview and the PNG show the same pattern at their own size.
// Alpha is only ever reduced; colour channels are untouched.

export interface Pixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** mulberry32: a small seeded PRNG in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Lattice {
  n: number;
  v: Float32Array;
}

function lattice(n: number, rnd: () => number): Lattice {
  const v = new Float32Array((n + 1) * (n + 1));
  for (let i = 0; i < v.length; i++) v[i] = rnd();
  return { n, v };
}

const smooth = (t: number): number => t * t * (3 - 2 * t);

/** Value noise in [0, 1] at (u, v) in [0, 1]². */
function noise(l: Lattice, u: number, v: number): number {
  const x = Math.min(u, 1) * l.n;
  const y = Math.min(v, 1) * l.n;
  const x0 = Math.min(Math.floor(x), l.n - 1);
  const y0 = Math.min(Math.floor(y), l.n - 1);
  const tx = smooth(x - x0);
  const ty = smooth(y - y0);
  const row = l.n + 1;
  const a = l.v[y0 * row + x0]!;
  const b = l.v[y0 * row + x0 + 1]!;
  const c = l.v[(y0 + 1) * row + x0]!;
  const d = l.v[(y0 + 1) * row + x0 + 1]!;
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}

/** Lowest share of the alpha the wear keeps away from edges and holes (D6: 60-100 %). */
export const INK_KEEP_MIN = 0.6;
const HOLES = 60;
/** Pin-hole radius as a share of the long edge. */
const HOLE_R = 0.006;

/** Wears `img` in place with `seed` (D6). */
export function applyInk(img: Pixels, seed: number): void {
  const { data, width, height } = img;
  const long = Math.max(width, height);
  const rnd = mulberry32(seed);
  const coarse = lattice(24, rnd);
  const fine = lattice(64, rnd);
  const edge = lattice(160, rnd);
  const holes = Array.from({ length: HOLES }, () => [rnd(), rnd(), HOLE_R * (0.5 + rnd())] as const);
  // The original alpha decides what an edge is, so the result does not depend on the scan order.
  const alpha = new Uint8ClampedArray(width * height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3]!;
  const at = (x: number, y: number): number => (x < 0 || y < 0 || x >= width || y >= height ? 0 : alpha[y * width + x]!);
  for (let y = 0; y < height; y++) {
    const v = (y + 0.5) / long;
    for (let x = 0; x < width; x++) {
      const a = alpha[y * width + x]!;
      if (!a) continue;
      const u = (x + 0.5) / long;
      const n = 0.65 * noise(coarse, u, v) + 0.35 * noise(fine, u, v);
      let keep = 1 - (1 - INK_KEEP_MIN) * Math.min(1, Math.max(0, (n - 0.3) / 0.6));
      if (a < 255 || !at(x - 1, y) || !at(x + 1, y) || !at(x, y - 1) || !at(x, y + 1)) {
        const e = noise(edge, u, v);
        if (e > 0.55) keep *= Math.max(0, 1 - (e - 0.55) / 0.3);
      }
      for (const [hu, hv, hr] of holes) {
        const du = u - hu;
        const dv = v - hv;
        if (du * du + dv * dv < hr * hr) {
          keep = 0;
          break;
        }
      }
      data[(y * width + x) * 4 + 3] = Math.floor(a * keep);
    }
  }
}
