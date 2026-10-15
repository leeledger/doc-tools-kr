// 도장 만들기 tests: the four HWP faces (the same @fontsource slices /fonts/hwp/ serves) on @napi-rs/canvas. Skia does not
// fall back between unicode-range slices of one family, so each slice is registered under its own name and the slice is
// picked from the fontsource CSS unicode-range, as a browser does. `measure` reads ink boxes as the page does.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GlobalFonts, createCanvas } from '@napi-rs/canvas';
import { emInk, type Face, type Ink, type Measure } from '../../src/tools/stamp-maker/layout';
import { REF_EM } from '../../src/tools/stamp-maker/limits';

const PKG: Record<Face, string> = { serif: 'noto-serif-kr', sans: 'noto-sans-kr', myeongjo: 'nanum-myeongjo', gothic: 'nanum-gothic' };

interface Slice {
  name: string;
  ranges: [number, number][];
}

const slices = new Map<string, Slice[]>();

function load(face: Face, weight: 400 | 700): Slice[] {
  const key = `${face}-${weight}`;
  const have = slices.get(key);
  if (have) return have;
  const base = join('node_modules', '@fontsource', PKG[face]);
  const css = readFileSync(join(base, `${weight}.css`), 'utf8');
  const out: Slice[] = [];
  for (const block of css.split('@font-face').slice(1)) {
    const file = /url\(\.\/files\/([^)]+\.woff2)\)/.exec(block)?.[1];
    const range = /unicode-range:\s*([^;]+);/.exec(block)?.[1];
    if (!file || !range) continue;
    const name = `T-${key}-${out.length}`;
    GlobalFonts.registerFromPath(join(base, 'files', file), name);
    out.push({
      name,
      ranges: range.split(',').map((r) => {
        const [a, b] = r.trim().slice(2).split('-');
        return [parseInt(a!, 16), parseInt(b ?? a!, 16)] as [number, number];
      }),
    });
  }
  slices.set(key, out);
  return out;
}

/** The registered slice name holding every code point of `text` (the first one's slice when they are split). */
export function sliceFont(text: string, face: Face, weight: 400 | 700, px: number): string {
  const list = load(face, weight);
  const cps = Array.from(text, (c) => c.codePointAt(0)!);
  const has = (s: Slice, cp: number): boolean => s.ranges.some(([a, b]) => cp >= a && cp <= b);
  const hit = list.find((s) => cps.every((cp) => has(s, cp))) ?? list.find((s) => has(s, cps[0]!));
  return `${weight} ${px}px "${hit?.name ?? 'serif'}"`;
}

const ctx = createCanvas(8, 8).getContext('2d');

/** Ink boxes from the real faces (as the page measures them). */
export const inkMeasure: Measure = (text, face, weight): Ink => {
  ctx.font = sliceFont(text, face, weight, REF_EM);
  const m = ctx.measureText(text);
  return { left: m.actualBoundingBoxLeft, right: m.actualBoundingBoxRight, ascent: m.actualBoundingBoxAscent, descent: m.actualBoundingBoxDescent };
};

/** The em-box fallback (a browser without actualBoundingBox*): advance width only. */
export const emMeasure: Measure = (text, face, weight): Ink => {
  ctx.font = sliceFont(text, face, weight, REF_EM);
  return emInk(ctx.measureText(text).width);
};
