// PDF JPG 변환 (TOOLS4 T3): canvas size per page (iOS caps), run limits, output names, the streaming ZIP, page copy.
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { getTool } from '../../src/data/tools';
import { TOOL_FACTS } from '../../src/data/tool-facts';
import { MB } from '../../src/lib/ui/device';
import { LIMITS, PPI, fileLimitMessage, pageCap, runLimitMessage } from '../../src/tools/pdf-to-jpg/limits';
import { JpegZip, jpgName, zipName } from '../../src/tools/pdf-to-jpg/output';
import { pageScale } from '../../src/tools/pdf-to-jpg/scale';

const A4 = [595.28, 841.89] as const;
const A3 = [841.89, 1190.55] as const;
const { desktop, mobile } = { desktop: LIMITS.desktop.caps, mobile: LIMITS.mobile.caps };

describe('pageScale', () => {
  it('A4 at 96 / 150 / 300 ppi: exact pixels (points / 72 × ppi, rounded), not clamped on either device', () => {
    const want = { 96: [794, 1123], 150: [1240, 1754], 300: [2480, 3508] } as const;
    for (const caps of [desktop, mobile]) {
      for (const ppi of [96, 150, 300] as const) {
        const s = pageScale(A4[0], A4[1], ppi, caps);
        expect([s.width, s.height], `${ppi}`).toEqual(want[ppi]);
        expect(s.scale).toBeCloseTo(ppi / 72, 9);
        expect(s.clamped).toBe(false);
      }
    }
  });

  it('landscape pages (rotation applied by the caller) swap the sides', () => {
    expect(pageScale(A4[1], A4[0], 150, desktop)).toMatchObject({ width: 1754, height: 1240 });
  });

  it('phone edge cap: A3 at 300 ppi is drawn with a 4,096-pixel long edge, aspect kept, flagged', () => {
    const s = pageScale(A3[0], A3[1], 300, mobile);
    expect(s.clamped).toBe(true);
    expect(s.height).toBeLessThanOrEqual(4096);
    expect(s.height).toBeGreaterThanOrEqual(4095);
    expect(s.width / s.height).toBeCloseTo(A3[0] / A3[1], 3);
    // The PC draws the same page at full size.
    expect(pageScale(A3[0], A3[1], 300, desktop)).toMatchObject({ width: 3508, height: 4961, clamped: false });
  });

  it('area caps: a large square page stays within 16,000,000 pixels on a phone and 36,000,000 on a PC', () => {
    const phone = pageScale(2000, 2000, 300, mobile);
    expect(phone).toMatchObject({ width: 4000, height: 4000, clamped: true });
    const pc = pageScale(2000, 2000, 300, desktop);
    expect(pc).toMatchObject({ width: 6000, height: 6000, clamped: true });
  });

  it('never passes a cap, whatever the page (sizes from a business card to a banner)', () => {
    for (const caps of [desktop, mobile]) {
      for (const [w, h] of [[252, 144], [595.28, 841.89], [2384, 3370], [14400, 200], [200, 14400], [14400, 14400]] as const) {
        for (const ppi of Object.values(PPI)) {
          const s = pageScale(w, h, ppi, caps);
          expect(Math.max(s.width, s.height), `${w}×${h}@${ppi}`).toBeLessThanOrEqual(caps.maxEdge);
          expect(s.width * s.height, `${w}×${h}@${ppi}`).toBeLessThanOrEqual(caps.maxArea);
          expect(Math.min(s.width, s.height)).toBeGreaterThanOrEqual(1);
          expect(s.clamped).toBe(Math.round((w * ppi) / 72) !== s.width || Math.round((h * ppi) / 72) !== s.height);
        }
      }
    }
  });
});

describe('limits', () => {
  it('the brief numbers: phone 50 MB, 100 pages (50 at 300 ppi), 16,000,000 px / 4,096; PC 200 MB, 500 pages, 36,000,000 / 8,192', () => {
    expect(LIMITS.mobile).toEqual({ maxFileBytes: 50 * MB, maxPages: 100, maxPagesSharp: 50, caps: { maxArea: 16_000_000, maxEdge: 4096 } });
    expect(LIMITS.desktop).toEqual({ maxFileBytes: 200 * MB, maxPages: 500, maxPagesSharp: 500, caps: { maxArea: 36_000_000, maxEdge: 8192 } });
    expect(pageCap('p300', 'mobile')).toBe(50);
    expect(pageCap('p150', 'mobile')).toBe(100);
    expect(pageCap('p300', 'desktop')).toBe(500);
  });

  it('run limit: a message with the numbers asking for a range; none within the cap', () => {
    expect(runLimitMessage(100, 'p150', 'mobile')).toBeNull();
    expect(runLimitMessage(101, 'p150', 'mobile')).toBe('휴대폰에서는 한 번에 100쪽까지 변환할 수 있습니다. 고른 쪽은 101쪽입니다. 변환할 쪽에 「1-100」처럼 나눠 입력해 주세요.');
    expect(runLimitMessage(60, 'p300', 'mobile')).toBe('휴대폰에서는 선명으로는 한 번에 50쪽까지 변환할 수 있습니다. 고른 쪽은 60쪽입니다. 변환할 쪽에 「1-50」처럼 나눠 입력해 주세요.');
    expect(runLimitMessage(1200, 'p300', 'desktop')).toBe('이 기기에서는 한 번에 500쪽까지 변환할 수 있습니다. 고른 쪽은 1,200쪽입니다. 변환할 쪽에 「1-500」처럼 나눠 입력해 주세요.');
  });

  it('file limit', () => {
    expect(fileLimitMessage(50 * MB, 'mobile')).toBeNull();
    expect(fileLimitMessage(50 * MB + 1, 'mobile')).toContain('휴대폰에서는 50 MB까지');
    expect(fileLimitMessage(200 * MB + 1, 'desktop')).toContain('200 MB까지');
  });
});

describe('output', () => {
  it('names: {base}_p001.jpg (4 digits from 1,000 pages), {base}_jpg.zip; unsafe characters removed', () => {
    expect(jpgName('보고서.pdf', 1, 3)).toBe('보고서_p001.jpg');
    expect(jpgName('보고서.PDF', 12, 120)).toBe('보고서_p012.jpg');
    expect(jpgName('scan.pdf', 7, 1200)).toBe('scan_p0007.jpg');
    expect(zipName('보고서.pdf')).toBe('보고서_jpg.zip');
    expect(zipName('a:b?.pdf')).toBe('ab_jpg.zip');
  });

  it('JpegZip: a stored ZIP whose entries are the JPEG bytes as given, in order, with Korean names', async () => {
    const a = new Uint8Array([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]);
    const b = new Uint8Array([0xff, 0xd8, 9, 9, 0xff, 0xd9]);
    const zip = new JpegZip();
    zip.add('보고서_p001.jpg', a);
    zip.add('보고서_p002.jpg', b);
    const blob = await zip.finish();
    expect(blob.type).toBe('application/zip');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const files = unzipSync(bytes);
    expect(Object.keys(files)).toEqual(['보고서_p001.jpg', '보고서_p002.jpg']);
    expect(files['보고서_p001.jpg']).toEqual(a);
    expect(files['보고서_p002.jpg']).toEqual(b);
    // Local header compression method 0 (stored) at offset 8.
    expect(bytes[8] | (bytes[9]! << 8)).toBe(0);
  });
});

describe('page copy (tools.ts)', () => {
  const tool = getTool('pdf-to-jpg');
  it('name = h1, the brief title, an 80–120 character description with the search keyword, 4–6 FAQ answers', () => {
    expect(tool.h1).toBe('PDF JPG 변환');
    expect(tool.name).toBe(tool.h1);
    expect(tool.status).toBe('live');
    expect(tool.title).toBe('PDF JPG 변환 — 쪽마다 사진으로 저장 무료 | 문서딱');
    expect(tool.description).toContain('PDF JPG 변환');
    expect([...tool.description].length).toBeGreaterThanOrEqual(80);
    expect([...tool.description].length).toBeLessThanOrEqual(120);
    expect(tool.faq.length).toBeGreaterThanOrEqual(4);
    expect(tool.faq.length).toBeLessThanOrEqual(6);
  });

  it('the FAQ numbers come from limits.ts and scale.ts; "never leaves" only in the FAQ; ppi, never dpi', () => {
    const answers = tool.faq.map((f) => f.a).join(' ');
    for (const s of ['200 MB', '50 MB', '500쪽', '100쪽', '50쪽', '4,096픽셀', '794×1,123픽셀', '1,240×1,754픽셀', '2,480×3,508픽셀', '약 150 ppi']) expect(answers).toContain(s);
    for (const text of [tool.title, tool.description, tool.summary]) expect(text).not.toMatch(/보내지 않|전송되지 않|밖으로/);
    expect(answers).toContain('어디로도 보내지 않습니다');
    expect(answers).not.toMatch(/dpi/i);
  });

  it('tool facts read the same limits', () => {
    expect(TOOL_FACTS['pdf-to-jpg.maxFileMb.desktop']).toEqual({ value: 200, unit: 'MB' });
    expect(TOOL_FACTS['pdf-to-jpg.maxFileMb.mobile']).toEqual({ value: 50, unit: 'MB' });
    expect(TOOL_FACTS['pdf-to-jpg.maxPages.mobile'].value).toBe(100);
    expect(TOOL_FACTS['pdf-to-jpg.maxPagesSharp.mobile'].value).toBe(50);
  });
});
