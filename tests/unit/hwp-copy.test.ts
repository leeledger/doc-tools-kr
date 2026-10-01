// HWP copy in plain language (SPIKE-HWP-DIRECT §6.8; docs/COPY.md "쉬운 말"). The built page and its JS are
// scanned by postbuild.test.ts ("plain language", no HWP exemption since HWP direct); this checks the message
// functions with every variable filled in, and the particle after a file name.
import { describe, expect, it } from 'vitest';
import { MB_DEC, MIB } from '../../src/lib/hwp/limits';
import { route } from '../../src/lib/hwp/route';
import { COPY, ERRORS, tooLargeMessage, viewerFirstMessage, viewerOnlyMessage } from '../../src/tools/hwp-shared/messages';

const JARGON = /업로드|서버|브라우저|네트워크|메모리|인쇄|개발자 도구|(?<![A-Za-z])(?:px|dpi|exif|MiB)(?![A-Za-z])/i;

describe('HWP copy', () => {
  it('the done line picks the particle from the file name', () => {
    expect(COPY.done('law05.pdf', 26, '312 KB')).toBe('「law05.pdf」를 내려받았습니다 · 26쪽 · 312 KB');
    expect(COPY.done('보고서.pdf', 3, '1.2 MB')).toBe('「보고서.pdf」를 내려받았습니다 · 3쪽 · 1.2 MB');
    expect(COPY.done('공무원임용시험령.pdf', 1500, '9.8 KB')).toBe('「공무원임용시험령.pdf」를 내려받았습니다 · 1,500쪽 · 9.8 KB');
  });

  it('no jargon in any message, with every variable filled in', () => {
    const all: string[] = [...Object.values(ERRORS)];
    for (const v of Object.values(COPY)) all.push(typeof v === 'function' ? (v as (...a: unknown[]) => string)('law05.pdf', 26, '1 MB') : v);
    for (const d of ['mobile', 'desktop'] as const) {
      all.push(tooLargeMessage(d, 30 * MB_DEC, 25 * MB_DEC));
      const r = route({ device: d, fileBytes: 200 * MB_DEC, pages: 400, wasmBytes: 2048 * MIB, imageBytes: 90 * MB_DEC, textboxes: 9 });
      all.push(viewerFirstMessage(r.reasons), viewerOnlyMessage(d, r.reasons));
      for (const kind of ['bytes', 'pages', 'wasm', 'images'] as const) all.push(viewerOnlyMessage(d, [{ kind, limit: 10, value: 20 }]));
    }
    expect(all.filter((m) => JARGON.test(m))).toEqual([]);
  });
});
