// 사진 PDF 변환 (TOOLS4 T2): page layout, when a JPEG goes in as it is, the device limits and the page copy.
import { describe, expect, it } from 'vitest';
import { getTool } from '../../src/data/tools';
import { TOOL_FACTS } from '../../src/data/tool-facts';
import { MB } from '../../src/lib/ui/device';
import { canEmbedRaw } from '../../src/tools/jpg-to-pdf/embed';
import { A4_H, A4_W, PT_PER_MM, layout, rotatedSize, type LayoutOptions, type Rotation } from '../../src/tools/jpg-to-pdf/layout';
import { LIMITS, REDUCE_EDGE, planAdd } from '../../src/tools/jpg-to-pdf/limits';

const A4 = (orient: LayoutOptions['orient'], marginMm: LayoutOptions['marginMm']): LayoutOptions => ({ page: 'a4', orient, marginMm });
const FIT: LayoutOptions = { page: 'fit', orient: 'auto', marginMm: 0 };
const ROTATIONS: Rotation[] = [0, 90, 180, 270];
const SHAPES = { portrait: [3000, 4000], landscape: [4000, 3000], square: [2000, 2000] } as const;

describe('layout (A4 = 595.28 × 841.89 pt)', () => {
  for (const [shape, [w, h]] of Object.entries(SHAPES)) {
    for (const rotation of ROTATIONS) {
      for (const orient of ['auto', 'portrait'] as const) {
        for (const marginMm of [0, 10] as const) {
          it(`${shape} ${rotation}° ${orient} margin ${marginMm} mm: contain-fit, centred, inside the margin`, () => {
            const p = layout(w, h, rotation, A4(orient, marginMm));
            const r = rotatedSize(w, h, rotation);
            const portraitPage = orient === 'portrait' || r.w <= r.h;
            expect([p.pageW, p.pageH]).toEqual(portraitPage ? [A4_W, A4_H] : [A4_H, A4_W]);
            // Aspect kept.
            expect(p.w / p.h).toBeCloseTo(r.w / r.h, 6);
            // Centred.
            expect(p.x).toBeCloseTo((p.pageW - p.w) / 2, 6);
            expect(p.y).toBeCloseTo((p.pageH - p.h) / 2, 6);
            // Touches the margin on one axis, never crosses it.
            const m = marginMm * PT_PER_MM;
            expect(p.x).toBeGreaterThanOrEqual(m - 1e-6);
            expect(p.y).toBeGreaterThanOrEqual(m - 1e-6);
            expect(Math.min(p.x, p.y)).toBeCloseTo(m, 6);
          });
        }
      }
    }
  }

  it('자동: a landscape photo gets a landscape page, a portrait or square one a portrait page; 세로 always portrait', () => {
    expect(layout(4000, 3000, 0, A4('auto', 0))).toMatchObject({ pageW: A4_H, pageH: A4_W });
    expect(layout(3000, 4000, 0, A4('auto', 0))).toMatchObject({ pageW: A4_W, pageH: A4_H });
    expect(layout(2000, 2000, 0, A4('auto', 0))).toMatchObject({ pageW: A4_W, pageH: A4_H });
    expect(layout(3000, 4000, 90, A4('auto', 0))).toMatchObject({ pageW: A4_H, pageH: A4_W });
    expect(layout(4000, 3000, 0, A4('portrait', 0))).toMatchObject({ pageW: A4_W, pageH: A4_H });
  });

  it('10 mm margin = 28.35 pt; a portrait 3:4 photo on portrait A4 fills the width', () => {
    const p = layout(3000, 4000, 0, A4('auto', 10));
    expect(p.x).toBeCloseTo(28.3465, 3);
    expect(p.w).toBeCloseTo(A4_W - 2 * 28.3465, 3);
  });

  for (const [shape, [w, h]] of Object.entries(SHAPES)) {
    for (const rotation of ROTATIONS) {
      it(`사진 크기에 맞춤: ${shape} ${rotation}°: page = photo aspect, long side 841.89, no margin`, () => {
        const p = layout(w, h, rotation, FIT);
        const r = rotatedSize(w, h, rotation);
        expect(Math.max(p.pageW, p.pageH)).toBeCloseTo(A4_H, 6);
        expect(p.pageW / p.pageH).toBeCloseTo(r.w / r.h, 6);
        expect(p).toMatchObject({ x: 0, y: 0, w: p.pageW, h: p.pageH });
      });
    }
  }
});

describe('canEmbedRaw', () => {
  const jpeg = { format: 'jpeg' as const, orientation: undefined as number | undefined, cmyk: false, truncated: false };
  it('a plain JPEG (orientation 1 or absent), not turned, original size: as it is', () => {
    expect(canEmbedRaw(jpeg, 0, 'original')).toBe(true);
    expect(canEmbedRaw({ ...jpeg, orientation: 1 }, 0, 'original')).toBe(true);
  });
  it('re-encoded: EXIF orientation 2–8, CMYK/YCCK, a user rotation, 줄이기, a truncated JPEG, any other format', () => {
    for (const o of [2, 3, 4, 5, 6, 7, 8]) expect(canEmbedRaw({ ...jpeg, orientation: o }, 0, 'original'), `orientation ${o}`).toBe(false);
    expect(canEmbedRaw({ ...jpeg, cmyk: true }, 0, 'original')).toBe(false);
    for (const r of [90, 180, 270] as const) expect(canEmbedRaw(jpeg, r, 'original')).toBe(false);
    expect(canEmbedRaw(jpeg, 0, 'reduce')).toBe(false);
    expect(canEmbedRaw({ ...jpeg, truncated: true }, 0, 'original')).toBe(false);
    for (const format of ['png', 'webp', 'heic'] as const) expect(canEmbedRaw({ ...jpeg, format }, 0, 'original'), format).toBe(false);
  });
});

describe('limits', () => {
  it('the brief numbers: phone 50 photos / 50 MB each / 150 MB total / 4,096 px; PC 200 / 100 MB / 500 MB; 줄이기 2,000 px', () => {
    expect(LIMITS.mobile).toEqual({ maxImages: 50, maxFileBytes: 50 * MB, maxTotalBytes: 150 * MB, maxEdge: 4096 });
    expect(LIMITS.desktop).toMatchObject({ maxImages: 200, maxFileBytes: 100 * MB, maxTotalBytes: 500 * MB });
    expect(REDUCE_EDGE).toBe(2000);
  });

  it('planAdd keeps the order and leaves out what is over a limit, with the numbers in the message', () => {
    expect(planAdd([1, 2, 3], 0, 0, 'mobile')).toEqual({ accepted: [0, 1, 2], messages: [], codes: [] });
    const many = planAdd(Array(5).fill(1), 48, 0, 'mobile');
    expect(many.accepted).toEqual([0, 1]);
    expect(many.codes).toEqual(['too-many']);
    expect(many.messages[0]).toBe('한 번에 최대 50장까지 넣을 수 있어 3장은 추가하지 않았습니다. 나머지는 나눠서 만들어 주세요.');
    const big = planAdd([10 * MB, 51 * MB, 10 * MB], 0, 0, 'mobile');
    expect(big.accepted).toEqual([0, 2]);
    expect(big.codes).toEqual(['too-big']);
    expect(big.messages[0]).toBe('사진 한 장은 휴대폰에서 50 MB까지 넣을 수 있어 1장은 추가하지 않았습니다.');
    const total = planAdd([40 * MB, 40 * MB, 10 * MB], 0, 100 * MB, 'desktop');
    expect(total).toEqual({ accepted: [0, 1, 2], codes: [], messages: [] });
    const over = planAdd([60 * MB, 50 * MB], 0, 400 * MB, 'desktop');
    expect(over.accepted).toEqual([0]);
    expect(over.codes).toEqual(['too-big']);
    expect(over.messages[0]).toBe('사진 합계가 500 MB를 넘으면 이 기기에서 한 번에 만들 수 없어 1장은 추가하지 않았습니다. 나눠서 만들어 주세요.');
  });
});

describe('page copy (tools.ts)', () => {
  const tool = getTool('jpg-to-pdf');
  it('name = h1, the brief title, an 80–120 character description with the search keyword, 4–6 FAQ answers', () => {
    expect(tool.h1).toBe('사진 PDF 변환');
    expect(tool.name).toBe(tool.h1);
    expect(tool.status).toBe('live');
    expect(tool.title).toBe('사진 PDF 변환 — JPG·PNG·아이폰 사진을 PDF 하나로 무료 | 문서딱');
    expect(tool.description).toContain('사진 PDF 변환');
    expect([...tool.description].length).toBeGreaterThanOrEqual(80);
    expect([...tool.description].length).toBeLessThanOrEqual(120);
    expect(tool.faq.length).toBeGreaterThanOrEqual(4);
    expect(tool.faq.length).toBeLessThanOrEqual(6);
  });

  it('the FAQ numbers come from limits.ts; "never leaves" is only in the FAQ, never in the title, description or summary', () => {
    const answers = tool.faq.map((f) => f.a).join(' ');
    for (const s of ['200장', '50장', '100 MB', '50 MB', '500 MB', '150 MB', '4,096픽셀']) expect(answers).toContain(s);
    for (const text of [tool.title, tool.description, tool.summary]) expect(text).not.toMatch(/보내지 않|전송되지 않|밖으로/);
    expect(answers).toContain('어디로도 보내지 않습니다');
  });

  it('tool facts read the same limits', () => {
    expect(TOOL_FACTS['jpg-to-pdf.maxImages.desktop'].value).toBe(200);
    expect(TOOL_FACTS['jpg-to-pdf.maxImages.mobile'].value).toBe(50);
    expect(TOOL_FACTS['jpg-to-pdf.maxFileMb.mobile']).toEqual({ value: 50, unit: 'MB' });
    expect(TOOL_FACTS['jpg-to-pdf.maxTotalMb.desktop']).toEqual({ value: 500, unit: 'MB' });
  });
});
