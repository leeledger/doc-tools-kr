// Background check (brief Step 4 §2). Pure, over the output pixels. It samples the top 12 % strip and the
// outer 6 % side strips above 70 % of the height, and warns when the mean L* < 88, the mean chroma > 10, or
// the standard deviation of L* > 12. It never edits anything.

export const TOP_FRAC = 0.12;
export const SIDE_FRAC = 0.06;
export const SIDE_BOTTOM = 0.7;
export const MIN_L = 88;
export const MAX_CHROMA = 10;
export const MAX_STD_L = 12;

export interface BackgroundResult {
  meanL: number;
  meanChroma: number;
  stdL: number;
  /** True when the background looks white and even. */
  ok: boolean;
}

const lin = (c: number): number => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const f = (t: number): number => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);

/** sRGB (0–255) → CIE L*, a*, b* (D65). */
export function srgbToLab(r: number, g: number, b: number): [number, number, number] {
  const R = lin(r);
  const G = lin(g);
  const B = lin(b);
  const x = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
  const y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B;
  const z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883;
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function checkBackground(img: { data: ArrayLike<number>; width: number; height: number }): BackgroundResult {
  const { width: w, height: h, data } = img;
  const top = Math.max(1, Math.round(h * TOP_FRAC));
  const side = Math.max(1, Math.round(w * SIDE_FRAC));
  const bottom = Math.max(top, Math.round(h * SIDE_BOTTOM));
  let n = 0;
  let sumL = 0;
  let sumL2 = 0;
  let sumC = 0;
  const add = (x: number, y: number): void => {
    const i = (y * w + x) * 4;
    const [L, a, b] = srgbToLab(data[i]!, data[i + 1]!, data[i + 2]!);
    n++;
    sumL += L;
    sumL2 += L * L;
    sumC += Math.hypot(a, b);
  };
  for (let y = 0; y < top; y++) for (let x = 0; x < w; x++) add(x, y);
  for (let y = top; y < bottom; y++) {
    for (let x = 0; x < side; x++) add(x, y);
    for (let x = Math.max(side, w - side); x < w; x++) add(x, y);
  }
  const meanL = sumL / n;
  const stdL = Math.sqrt(Math.max(0, sumL2 / n - meanL * meanL));
  const meanChroma = sumC / n;
  return { meanL, meanChroma, stdL, ok: meanL >= MIN_L && meanChroma <= MAX_CHROMA && stdL <= MAX_STD_L };
}
