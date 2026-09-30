// @vitest-environment jsdom
// exportPdf: the per-page loop, the hybrid decision and the save (SPIKE-HWP-DIRECT §6.1, §6.9).
import { PDFDocument } from '@cantoo/pdf-lib';
import { describe, expect, it, vi } from 'vitest';
import { exportPdf, type ExportPage } from '../../src/lib/hwp/pdf/export';
import type { RasterPage } from '../../src/lib/hwp/pdf/raster-page';
import { FAMILY } from '../../src/lib/hwp/svg-string';
import { testFaces } from '../helpers/hwp-pdf';
import { pageTexts } from '../helpers/pdf';

const NS = 'xmlns="http://www.w3.org/2000/svg"';
const SANS = `'${FAMILY.sans}',sans-serif`;
const page = (text: string, extra = ''): ExportPage => ({
  svg: `<svg ${NS} width="200" height="100" viewBox="0 0 200 100">${extra}<text x="10" y="50" font-family="${SANS}" font-size="10">${text}</text></svg>`,
  runs: [],
  failed: false,
});
const infos = (n: number) => Array.from({ length: n }, () => ({ w: 200, h: 100 }));
const noRaster: RasterPage = async () => {
  throw new Error('raster called');
};

describe('exportPdf', () => {
  it('writes every page, reports progress per page, and the PDF reads back', async () => {
    const pages = [page('가나'), page('law05'), page('다')];
    const progress: [number, number][] = [];
    const { blob, stats } = await exportPdf({ infos: infos(3), getPage: async (i) => pages[i]!, onProgress: (d, n) => progress.push([d, n]), fonts: testFaces(), raster: noRaster });
    expect(blob.type).toBe('application/pdf');
    expect(progress).toEqual([[1, 3], [2, 3], [3, 3]]);
    expect(stats).toMatchObject({ pages: 3, failedPages: 0, fallbackPages: 0, missingGlyphs: 0, nonFinite: 0 });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(new TextDecoder().decode(bytes.subarray(0, 5))).toBe('%PDF-');
    expect((await pageTexts(bytes)).map((t) => t.replace(/\s/g, ''))).toEqual(['가나', 'law05', '다']);
  });

  it('an abort after page 2 rejects with AbortError and never saves', async () => {
    const save = vi.spyOn(PDFDocument.prototype, 'save');
    const ctl = new AbortController();
    const run = exportPdf({
      infos: infos(5),
      getPage: async () => page('가'),
      onProgress: (d) => {
        if (d === 2) ctl.abort();
      },
      signal: ctl.signal,
      fonts: testFaces(),
      raster: noRaster,
    });
    await expect(run).rejects.toMatchObject({ name: 'AbortError' });
    expect(save).not.toHaveBeenCalled();
    save.mockRestore();
  });

  it('a page with something unsupported goes to the raster function; a failed page becomes a blank page', async () => {
    const raster = vi.fn<RasterPage>(async (doc, _svg, w, h) => {
      doc.addPage([w * 0.75, h * 0.75]);
      return { glyphs: 1, invisibleGlyphs: 1, missingGlyphs: 0, shapes: 0, images: 0, unsupported: [], nonFinite: 0 };
    });
    const pages: ExportPage[] = [page('가', '<defs><rect id="r"/></defs><use href="#r"/>'), { svg: '<svg', runs: [], failed: false }, { svg: '', runs: [], failed: true }, page('나')];
    const { blob, stats } = await exportPdf({ infos: infos(4), getPage: async (i) => pages[i]!, fonts: testFaces(), raster });
    expect(raster).toHaveBeenCalledTimes(1);
    expect(stats).toMatchObject({ fallbackPages: 1, failedPages: 2, unsupported: { use: 1 } });
    const doc = await PDFDocument.load(await blob.arrayBuffer());
    expect(doc.getPageCount()).toBe(4);
    expect(doc.getPage(1).getSize()).toEqual({ width: 150, height: 75 });
  });
});
