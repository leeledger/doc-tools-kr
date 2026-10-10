// @vitest-environment jsdom
// The PDF file name and the in-page download (SPIKE-HWP-DIRECT §6.2, §6.4 "File name").
import { describe, expect, it, vi } from 'vitest';
import { MAX_FILE_NAME } from '../../src/lib/ui/format';
import { pdfName, triggerDownload, withExt } from '../../src/tools/hwp-shared/download';

describe('pdfName', () => {
  it('the original name with .pdf', () => {
    expect(pdfName('law05.hwp')).toBe('law05.pdf');
    expect(pdfName('LAW05.HWP')).toBe('LAW05.pdf');
    expect(pdfName('a.b.hwpx')).toBe('a.b.pdf');
    expect(pdfName('소하천설계기준 (최종).hwpx')).toBe('소하천설계기준 (최종).pdf');
  });

  it('unsafe characters are dropped; nothing left → 문서.pdf; long names are cut', () => {
    expect(pdfName('a:b?c.hwp')).toBe('abc.pdf');
    expect(pdfName('<>:|?*.hwp')).toBe('문서.pdf');
    expect(pdfName('.hwp')).toBe('문서.pdf');
    const long = pdfName(`${'가'.repeat(255)}.hwp`);
    expect([...long].length).toBe(MAX_FILE_NAME);
    expect(long.endsWith('.pdf')).toBe(true);
  });
});

describe('withExt (HWPX2HWP H0)', () => {
  const HWPX = /\.hwpx$/i;
  it('strips a trailing .hwpx (any case) and adds .hwp; other names keep their dots and get .hwp appended', () => {
    expect(withExt('adm14.hwpx', '.hwp', HWPX)).toBe('adm14.hwp');
    expect(withExt('ADM14.HWPX', '.hwp', HWPX)).toBe('ADM14.hwp');
    expect(withExt('보고서', '.hwp', HWPX)).toBe('보고서.hwp');
    expect(withExt('a.b.c.hwpx', '.hwp', HWPX)).toBe('a.b.c.hwp');
    expect(withExt('report.v2', '.hwp', HWPX)).toBe('report.v2.hwp');
    expect(withExt('x.hwpx.zip', '.hwp', HWPX)).toBe('x.hwpx.zip.hwp');
    expect(withExt('.hwpx', '.hwp', HWPX)).toBe('문서.hwp');
    expect(withExt('a:b?.hwpx', '.hwp', HWPX)).toBe('ab.hwp');
  });

  it('default strip is the last extension (what pdfName uses)', () => {
    expect(withExt('a.b.hwpx', '.pdf')).toBe('a.b.pdf');
    expect(withExt('law05.hwp', '.pdf')).toBe(pdfName('law05.hwp'));
  });
});

describe('triggerDownload', () => {
  it('clicks a hidden in-page <a download> and removes it', () => {
    const clicks: { href: string; download: string; inDoc: boolean }[] = [];
    const spy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push({ href: this.getAttribute('href') ?? '', download: this.download, inDoc: document.body.contains(this) });
    });
    triggerDownload('blob:https://docttak.com/x', 'law05.pdf');
    expect(clicks).toEqual([{ href: 'blob:https://docttak.com/x', download: 'law05.pdf', inDoc: true }]);
    expect(document.querySelectorAll('a[download]')).toHaveLength(0);
    spy.mockRestore();
  });
});
