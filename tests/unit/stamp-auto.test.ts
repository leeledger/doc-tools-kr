// 전자서명·도장 이미지: the automatic 진하기 ladder (REQ1014-B D15, test map "stamp-auto"). The ladder steps per status,
// and on synthetic photos: a faint signature is found only by the ladder, blank paper with noise and a dark page are
// never turned into a result by it (the acceptance in the brief's failure table).
import { describe, expect, it } from 'vitest';
import { processInk, type Rgba } from '../../src/lib/ink/key';
import { autoLadder } from '../../src/tools/stamp-signature/auto';
import { COPY } from '../../src/tools/stamp-signature/copy';

function image(w: number, h: number, px: (x: number, y: number) => [number, number, number]): Rgba {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, g, b] = px(x, y);
      data.set([r, g, b, 255], (y * w + x) * 4);
    }
  return { data, width: w, height: h };
}

/** Seeded LCG in 0..1. */
function rand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const W = 120;
const H = 90;
const paperPx = (x: number): [number, number, number] => {
  const l = 1 - 0.15 * (x / W);
  return [Math.round(236 * l), Math.round(232 * l), Math.round(222 * l)];
};
/** The first step of `ladder` that passes, as the photo tab picks it; null when none does. */
const ladderPick = (img: Rgba): number | null => {
  const first = processInk(img, { mode: 'auto', strength: 0 });
  if (first.status === 'ok') return 0;
  for (const s of autoLadder(first.status)) if (processInk(img, { mode: 'auto', strength: s }).status === 'ok') return s;
  return null;
};

describe('autoLadder', () => {
  it('noink goes up (+1, +2), allpaper goes down (-1, -2), ok does nothing', () => {
    expect(autoLadder('noink')).toEqual([1, 2]);
    expect(autoLadder('allpaper')).toEqual([-1, -2]);
    expect(autoLadder('ok')).toEqual([]);
  });
  it('the status line', () => {
    expect(COPY.autoStrength).toBe('진하기를 자동으로 맞췄습니다.');
  });
});

describe('the ladder on synthetic photos', () => {
  it('a faint signature (ink about 31 % darker than the paper): noink at 0, found at +2', () => {
    const faint = image(W, H, (x, y) => (y >= 40 && y < 46 && x > 20 && x < 100 ? [158, 158, 158] : [230, 230, 230]));
    expect(processInk(faint, { mode: 'auto', strength: 0 }).status).toBe('noink');
    expect(processInk(faint, { mode: 'auto', strength: 1 }).status).toBe('noink');
    expect(processInk(faint, { mode: 'auto', strength: 2 }).status).toBe('ok');
    expect(ladderPick(faint)).toBe(2);
    const lessFaint = image(W, H, (x, y) => (y >= 40 && y < 46 && x > 20 && x < 100 ? [150, 150, 150] : [230, 230, 230]));
    expect(ladderPick(lessFaint)).toBe(1);
  });
  it('blank paper with JPEG-like noise stays noink at +1 and +2', () => {
    for (const amp of [8, 16, 24]) {
      const r = rand(7);
      const blank = image(W, H, (x) => {
        const n = (r() - 0.5) * 2 * amp;
        return paperPx(x).map((v) => Math.round(v + n)) as [number, number, number];
      });
      for (const s of [0, 1, 2]) expect(processInk(blank, { mode: 'auto', strength: s }).status, `noise ${amp}, step ${s}`).toBe('noink');
      expect(ladderPick(blank)).toBeNull();
    }
  });
  it('a dark page stays allpaper at -1 and -2', () => {
    const dense = image(W, H, (x, y) => (x % 4 === 0 && y % 2 === 0 ? paperPx(x) : [30, 30, 30]));
    for (const s of [0, -1, -2]) expect(processInk(dense, { mode: 'auto', strength: s }).status).toBe('allpaper');
    expect(ladderPick(dense)).toBeNull();
  });
});
