// 전자서명·도장 이미지 integration (Sprint C, C1): copy, limits, export retry, pad drawing, the tool entry and the
// two guides' red lines (no legal claim about images, no 인감).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getTool } from '../../src/data/tools';
import { INK_COLORS, INK_SIZES } from '../../src/lib/ink/key';
import { COPY, areaMessage, dims, sizeLabel, strengthLabel } from '../../src/tools/stamp-signature/copy';
import { LIMITS, checkDims, checkFileBytes } from '../../src/tools/stamp-signature/limits';
import { drawStrokes, PEN_SHARE } from '../../src/tools/stamp-signature/pad';
import { encodeWithRetry, nextSmaller } from '../../src/tools/stamp-signature/png';

const JARGON = /업로드|서버|브라우저|네트워크|메모리|(?<![A-Za-z])(?:px|dpi|exif)(?![A-Za-z])/i;
const root = join(__dirname, '..', '..');

describe('stamp-signature copy', () => {
  it('area check: a message for no ink and for the whole page, none when there is ink', () => {
    expect(areaMessage('noink')).toBe(COPY.noink);
    expect(areaMessage('allpaper')).toBe(COPY.allpaper);
    expect(areaMessage('ok')).toBeNull();
    expect(COPY.noink.startsWith('도장이나 서명을 찾지 못했습니다.')).toBe(true);
    expect(COPY.allpaper).toContain('종이만 나오게');
  });

  it('labels: 진하기 steps, sizes in 픽셀 (never px), pixel sizes with a thousands separator', () => {
    expect([-2, -1, 0, 1, 2].map(strengthLabel)).toEqual(['아주 연하게', '연하게', '보통', '진하게', '아주 진하게']);
    expect(strengthLabel(7)).toBe('보통');
    expect(INK_SIZES.map(sizeLabel)).toEqual(['원본 크기', '긴 변 1,000픽셀', '긴 변 600픽셀', '긴 변 300픽셀']);
    expect(dims(1200, 450)).toBe('1,200×450픽셀');
  });

  it('plain words in every string the page script shows', () => {
    const strings = Object.values(COPY).map((v) => (typeof v === 'function' ? v('도장.png' as never, 1 as never) : v));
    for (const s of strings) expect(s, s).not.toMatch(JARGON);
  });
});

describe('stamp-signature limits', () => {
  it('a 50 MP scan on a phone gets the limit with its number; a PC takes it', () => {
    expect(checkDims(8660, 5774, 'mobile')).toBe('휴대폰에서는 4,000만 화소(40 MP)까지의 사진만 열 수 있습니다. 더 큰 사진은 이 기기에서 처리하기에 너무 커서 화면이 멈출 수 있기 때문입니다.');
    expect(checkDims(8660, 5774, 'desktop')).toBeNull();
    expect(checkDims(20_000, 100, 'mobile')).toContain('16,384픽셀');
    expect(checkFileBytes(LIMITS.mobile.maxFileBytes + 1, 'mobile')).toContain('30 MB');
    expect(checkFileBytes(LIMITS.desktop.maxFileBytes, 'desktop')).toBeNull();
    expect([LIMITS.desktop.workEdge, LIMITS.mobile.workEdge]).toEqual([2400, 1600]);
  });
});

describe('stamp-signature export', () => {
  const px = (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });

  it('nextSmaller: the largest size below the long edge, downscale only', () => {
    expect(nextSmaller(2400)).toBe(1000);
    expect(nextSmaller(1000)).toBe(600);
    expect(nextSmaller(601)).toBe(600);
    expect(nextSmaller(300)).toBeNull();
  });

  it('toBlob null: retried once at the next smaller size, then gives up', async () => {
    const blob = new Blob(['png']);
    const asked: unknown[] = [];
    let calls = 0;
    const once = await encodeWithRetry(px(1500, 400), async (s) => (asked.push(s), px(1000, 267)), async (p) => (calls++, p.width === 1500 ? null : blob));
    expect(once).toBe(blob);
    expect(asked).toEqual([1000]);
    expect(calls).toBe(2);
    expect(await encodeWithRetry(px(1500, 400), async () => px(1000, 267), async () => null)).toBeNull();
    // Nothing smaller than a 200 px output: no second try.
    let tried = false;
    expect(await encodeWithRetry(px(200, 80), async () => ((tried = true), px(1, 1)), async () => null)).toBeNull();
    expect(tried).toBe(false);
  });
});

describe('stamp-signature pad drawing', () => {
  function fakeCtx() {
    const calls: string[] = [];
    const g = new Proxy(
      { lineWidth: 0, lineCap: '', lineJoin: '', strokeStyle: '', fillStyle: '' } as Record<string, unknown>,
      {
        get: (t, k: string) => (k in t ? t[k] : (...a: number[]) => calls.push(`${k}(${a.map((n) => Math.round(n)).join(',')})`)),
        set: (t, k: string, v) => ((t[k] = v), true),
      },
    );
    return { g: g as unknown as CanvasRenderingContext2D, calls, state: g as Record<string, unknown> };
  }

  it('a tap is a dot; a stroke is quadratic curves through the midpoints, ending on the last point', () => {
    const { g, calls, state } = fakeCtx();
    drawStrokes(g, [[[0.5, 0.5]], [[0, 0], [0.1, 0.5], [0.2, 0], [0.3, 0.5]]], 1000, 400, 'blue');
    expect(state.lineWidth).toBe(1000 * PEN_SHARE);
    expect(state.strokeStyle).toBe(`rgb(${INK_COLORS.blue.join(' ')})`);
    expect(calls).toEqual([
      'clearRect(0,0,1000,400)',
      'beginPath()',
      'arc(500,200,3,0,6)',
      'fill()',
      'beginPath()',
      'moveTo(0,0)',
      'quadraticCurveTo(100,200,150,100)',
      'quadraticCurveTo(200,0,250,100)',
      'lineTo(300,200)',
      'stroke()',
    ]);
  });
});

describe('stamp-signature tool entry and guides', () => {
  const tool = getTool('stamp-signature');

  it('title, H1 = name, a description with both keywords, 80–120 characters', () => {
    expect(tool.title).toBe('전자서명·도장 이미지 만들기 — 배경 없는 PNG 무료 | 문서딱');
    expect(tool.h1).toBe('전자서명·도장 이미지 만들기');
    expect(tool.name).toBe(tool.h1);
    expect(tool.description).toContain('도장 이미지 만들기');
    expect(tool.description).toContain('전자서명');
    expect([...tool.description].length).toBeGreaterThanOrEqual(80);
    expect([...tool.description].length).toBeLessThanOrEqual(120);
  });

  it('the FAQ says what the tool does: no law, no 인감, no promise of legal effect', () => {
    const all = [tool.description, tool.summary, ...tool.faq.flatMap((f) => [f.q, f.a])].join('\n');
    expect(all).not.toMatch(/전자서명법|인감|효력이 있|효력을 가|법적으로 인정|공식 색/);
    expect(all).toContain('법적 효력을 정하거나 본인 확인을 하지 않습니다');
    expect(all).not.toMatch(JARGON);
  });

  it('e-signature-law: never calls an image a 전자서명, never compares with 인감, ends with the 받는 곳 line', () => {
    const md = readFileSync(join(root, 'src', 'content', 'guides', 'e-signature-law.md'), 'utf8');
    expect(md).not.toContain('인감');
    expect(md).not.toMatch(/이미지[^.\n]{0,20}(?:는|도|가) [^.\n]{0,20}전자서명(?:이에요|입니다|이다|에 해당해요|으로 인정)/);
    expect(md).toContain('어떤 이미지가 법에서 말하는 전자서명에 해당하는지 판단하지 않아요');
    expect(md.trimEnd().endsWith('받는 곳(회사·기관)이 정한 방식이 있으면 그 방식을 따르세요.')).toBe(true);
    // Every quote is a law.go.kr article (the page quotes the law verbatim; check:quotes verifies them).
    const urls = [...md.matchAll(/^ {2}- url: (\S+)/gm)].map((m) => new URL(m[1]!).host);
    expect(urls.length).toBeGreaterThanOrEqual(4);
    expect(new Set(urls)).toEqual(new Set(['www.law.go.kr']));
  });

  it('stamp-image: the steps describe this page; no 인감, no legal claim', () => {
    const md = readFileSync(join(root, 'src', 'content', 'guides', 'stamp-image.md'), 'utf8');
    expect(md).not.toMatch(/인감|전자서명법|효력이 있/);
    expect(md).toContain('](/stamp-signature/)');
  });
});
