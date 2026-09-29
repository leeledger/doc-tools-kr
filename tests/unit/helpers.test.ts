import { describe, expect, it } from 'vitest';
import { PdfCorruptError, PdfError, errorCode, hasPdfHeader, mapLoadError } from '../../src/lib/pdf/errors';
import { MB } from '../../src/lib/ui/device';
import { baseName, formatMB, formatPages } from '../../src/lib/ui/format';
import { mergedFileName } from '../../src/tools/pdf-merge/format';
import { LIMITS, MAX_FILES, checkAddBytes, checkFileCount, checkMerge } from '../../src/tools/pdf-merge/limits';

const enc = (s: string) => new TextEncoder().encode(s);

describe('mergedFileName', () => {
  it('uses the first base name and the count of the others', () => {
    expect(mergedFileName('건축허가신청서.pdf', 3)).toBe('건축허가신청서_외2건_합침.pdf');
    expect(mergedFileName('report.PDF', 2)).toBe('report_외1건_합침.pdf');
  });

  it('strips Windows-reserved and control characters', () => {
    const bs = String.fromCharCode(92);
    const name = `a${bs}b/c:d*e?f"g<h>i|j${String.fromCharCode(0)}k${String.fromCharCode(31)}l${String.fromCharCode(127)}m.pdf`;
    expect(mergedFileName(name, 2)).toBe('abcdefghijklm_외1건_합침.pdf');
  });

  it('never returns an empty or dot-ending base', () => {
    expect(mergedFileName('???.pdf', 2)).toBe('문서_외1건_합침.pdf');
    expect(mergedFileName('name. .pdf', 2)).toBe('name_외1건_합침.pdf');
  });

  it('limits the whole name to 80 characters without splitting a character', () => {
    const long = `${'가'.repeat(100)}😀.pdf`;
    const out = mergedFileName(long, 12);
    expect(Array.from(out).length).toBeLessThanOrEqual(80);
    expect(out.endsWith('_외11건_합침.pdf')).toBe(true);
    const emoji = mergedFileName(`${'a'.repeat(67)}😀😀😀.pdf`, 2);
    expect(Array.from(emoji).length).toBeLessThanOrEqual(80);
    expect(emoji).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  });
});

describe('format', () => {
  it('formats sizes and pages with a space before the unit', () => {
    expect(formatMB(3.4 * MB)).toBe('3.4 MB');
    expect(formatMB(1000)).toBe('0.1 MB');
    expect(formatPages(1500)).toBe('1,500쪽');
    expect(baseName('a.b.pdf')).toBe('a.b');
  });
});

describe('limits', () => {
  it('caps the number of files', () => {
    expect(checkFileCount(48, 2).level).toBe('ok');
    const r = checkFileCount(49, 3);
    expect(r.level).toBe('hard');
    expect(r.level !== 'ok' && r.message).toContain(`${MAX_FILES}개`);
  });

  it('desktop: soft above 200 MB or 1,500쪽, hard above 500 MB', () => {
    expect(checkMerge(200 * MB, 1500, 'desktop').level).toBe('ok');
    expect(checkMerge(200 * MB + 1, 10, 'desktop').level).toBe('soft');
    expect(checkMerge(10 * MB, 1501, 'desktop').level).toBe('soft');
    expect(checkMerge(500 * MB + 1, 10, 'desktop').level).toBe('hard');
    expect(checkAddBytes(500 * MB, 'desktop').level).toBe('ok');
    expect(checkAddBytes(500 * MB + 1, 'desktop').level).toBe('hard');
  });

  it('mobile: soft above 50 MB, hard above 150 MB, and messages state the number', () => {
    expect(checkMerge(50 * MB, 5000, 'mobile').level).toBe('ok');
    const soft = checkMerge(50 * MB + 1, 1, 'mobile');
    expect(soft.level).toBe('soft');
    expect(soft.level !== 'ok' && soft.message).toContain('50 MB');
    const hard = checkMerge(150 * MB + 1, 1, 'mobile');
    expect(hard.level).toBe('hard');
    expect(hard.level !== 'ok' && hard.message).toContain('150 MB');
    expect(LIMITS.mobile.hardBytes).toBe(150 * MB);
  });
});

describe('errors', () => {
  it('finds %PDF- only within the first 1024 bytes', () => {
    expect(hasPdfHeader(enc('%PDF-1.7\n'))).toBe(true);
    expect(hasPdfHeader(enc(`${' '.repeat(1000)}%PDF-1.4`))).toBe(true);
    expect(hasPdfHeader(enc(`${' '.repeat(1020)}%PDF-1.4`))).toBe(false);
    expect(hasPdfHeader(enc('%PNG'))).toBe(false);
    expect(hasPdfHeader(new Uint8Array())).toBe(false);
  });

  it('maps loader failures and out-of-memory to codes', () => {
    expect(errorCode(mapLoadError(new Error('NEEDS PASSWORD'), false))).toBe('password');
    expect(errorCode(mapLoadError(new Error('Password incorrect'), true))).toBe('wrong-password');
    expect(errorCode(mapLoadError(new Error('Expected instance of PDFDict'), false))).toBe('corrupt');
    expect(errorCode(new RangeError('Array buffer allocation failed'))).toBe('oom');
    expect(errorCode(new Error('out of memory'))).toBe('oom');
    expect(errorCode(new Error('something else'))).toBe('unknown');
    expect(new PdfCorruptError()).toBeInstanceOf(PdfError);
  });
});
