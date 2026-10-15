// PDF 글자 넣기·편집 (TOOLS1015 E1): items rules, text placement on turned and cropped pages (real pdf.js viewports), runs
// per face with the built HWP PDF face list (public/fonts/hwp, made by the build's gen-hwp-fonts), and editPdf in Node:
// the output opens, keeps its page count, and pdf.js reads the inserted text back (ToUnicode); a white box hides old
// text on the rendered page but the old text stays in the file.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDict, PDFDocument, PDFName, StandardFonts, degrees } from '@cantoo/pdf-lib';
import fontkit from '@cantoo/fontkit';
import { createCanvas } from '@napi-rs/canvas';
import { beforeAll, describe, expect, it } from 'vitest';
import pdfFaces from '../../src/generated/hwp-pdf-faces.json';
import { FaceTable, unpackFaces, type FontMetrics, type LoadedFace, type PackedFaces } from '../../src/lib/hwp/pdf/faces';
import { woffToSfnt } from '../../src/lib/hwp/pdf/woff';
import { MissingGlyphError, editPdf, runsOf, type EditDraw } from '../../src/lib/pdf/edit';
import { PRODUCER } from '../../src/lib/pdf/mergePlus';
import {
  ASCENT,
  FONT_CHAIN,
  LINE_HEIGHT,
  RGB,
  baselineOf,
  cleanText,
  clampSize,
  editName,
  fitSize,
  formatDate,
  itemsValue,
  linesOf,
  textBox,
  uncovered,
  type EditItem,
} from '../../src/tools/pdf-edit/items';
import { MAX_ITEMS, SIZE_DEFAULT, SIZE_MAX, SIZE_MIN } from '../../src/tools/pdf-edit/limits';
import { textOrigin, whiteRect } from '../../src/tools/pdf-edit/text-place';
import { coverageOf, covered } from '../../src/tools/pdf-edit/coverage';
import type { PageInfo } from '../../src/tools/pdf-sign/place';
import { pageTexts, withPdf } from '../helpers/pdf';

const PUBLIC = join(__dirname, '..', '..', 'public');

/** The face table the worker builds, reading the slices from public/ instead of fetching them. */
function diskFaces(): FaceTable {
  const packed = JSON.parse(readFileSync(join(PUBLIC, pdfFaces.json), 'utf8')) as PackedFaces;
  return new FaceTable(unpackFaces(packed), async (def): Promise<LoadedFace> => {
    const woff = new Uint8Array(readFileSync(join(PUBLIC, def.url)));
    const sfnt = woffToSfnt(woff);
    return { def, font: fontkit.create(sfnt) as unknown as FontMetrics, sfnt, woff };
  });
}

/** A one-page PDF: 600 × 800 MediaBox, optional /Rotate and CropBox origin. */
async function onePage(rotate: number, crop: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([600, 800]);
  if (crop) page.setCropBox(crop, crop, 600 - 2 * crop - 40, 800 - 2 * crop);
  page.setRotation(degrees(rotate));
  return doc.save();
}

async function viewOf(bytes: Uint8Array): Promise<{ info: PageInfo; toView(x: number, y: number): number[] }> {
  return withPdf(bytes, async (doc) => {
    const page = await doc.getPage(1);
    const vp = page.getViewport({ scale: 1 });
    return {
      info: { width: vp.width, height: vp.height, rotate: page.rotate, toPdf: (x, y) => vp.convertToPdfPoint(x, y) },
      toView: (x, y) => vp.convertToViewportPoint(x, y),
    };
  });
}

const close = (a: number[], b: number[]): void => {
  expect(a[0]).toBeCloseTo(b[0]!, 6);
  expect(a[1]).toBeCloseTo(b[1]!, 6);
};

describe('items rules', () => {
  it('dates in three forms, local time, two-digit month and day only in the dash form', () => {
    const d = new Date(2026, 9, 5);
    expect(formatDate(d, 'dot')).toBe('2026. 10. 5.');
    expect(formatDate(d, 'long')).toBe('2026년 10월 5일');
    expect(formatDate(d, 'dash')).toBe('2026-10-05');
    expect(formatDate(new Date(2026, 0, 15), 'dash')).toBe('2026-01-15');
  });

  it('sizes: whole points in 6-48, a non-number is the default', () => {
    expect([clampSize(1), clampSize(6), clampSize(11.4), clampSize(48), clampSize(100), clampSize(Number.NaN)]).toEqual([SIZE_MIN, 6, 11, 48, SIZE_MAX, SIZE_DEFAULT]);
    expect(MAX_ITEMS).toBe(200);
  });

  it('text: CR LF and CR become LF, tabs a space, at most 500 characters; lines are the person’s own breaks', () => {
    expect(cleanText('a\r\nb\rc\td')).toBe('a\nb\nc d');
    expect(Array.from(cleanText('가'.repeat(600)))).toHaveLength(500);
    expect(linesOf('홍길동\n\n2026')).toEqual(['홍길동', '', '2026']);
  });

  it('boxes: longest line wide, 1.3 lines high; an empty item keeps room for its placeholder; fitSize keeps text on the page', () => {
    const em = (l: string) => l.length * 0.5;
    expect(textBox(10, 20, 'abcd\nab', 10, em)).toEqual({ x: 10, y: 20, w: 20, h: 2 * LINE_HEIGHT * 10 });
    expect(textBox(0, 0, '', 10, em).w).toBe(60);
    expect(fitSize('a'.repeat(200), 20, 600, 800, em)).toBe(6);
    expect(fitSize('a'.repeat(40), 48, 600, 800, em)).toBe(30);
    expect(fitSize('ab', 11, 600, 800, em)).toBe(11);
  });

  it('baselines: half the extra line height plus the ascent, one line height apart', () => {
    expect(baselineOf(0, 10)).toBeCloseTo((0.15 + ASCENT) * 10, 9);
    expect(baselineOf(2, 10) - baselineOf(1, 10)).toBeCloseTo(13, 9);
  });

  it('uncovered: distinct characters no face has, in order, line breaks aside', () => {
    const covers = (cp: number) => cp < 0x1f000;
    expect(uncovered('가😀\n나😀👍', covers)).toEqual(['😀', '👍']);
    expect(uncovered('홍길동', covers)).toEqual([]);
  });

  it('usage value: the one kind, or mix', () => {
    const t = (kind: 'text' | 'date' | 'white'): EditItem =>
      kind === 'white' ? { id: 1, kind, page: 0, box: { x: 0, y: 0, w: 1, h: 1 } } : { id: 1, kind, page: 0, box: { x: 0, y: 0, w: 1, h: 1 }, text: 'a', size: 11, color: 'black', format: 'dot' };
    expect(itemsValue([t('text'), t('text')])).toBe('text');
    expect(itemsValue([t('date')])).toBe('date');
    expect(itemsValue([t('white')])).toBe('white');
    expect(itemsValue([t('text'), t('white')])).toBe('mix');
  });

  it('{base}_작성.pdf', () => {
    expect(editName('지원서.PDF')).toBe('지원서_작성.pdf');
    expect(RGB.blue).toEqual([0x1d, 0x4e, 0xd8]);
  });
});

describe('textOrigin: each line starts where it was placed, reading left to right as seen (real pdf.js viewports)', () => {
  for (const rotate of [0, 90, 180, 270]) {
    for (const crop of [0, 36]) {
      it(`/Rotate ${rotate}, CropBox origin (${crop},${crop})`, async () => {
        const { info, toView } = await viewOf(await onePage(rotate, crop));
        const box = { x: 50, y: 70, w: 120, h: 40 };
        for (const line of [0, 1]) {
          const o = textOrigin(box, info, ASCENT, 12, line);
          expect(o.rotate).toBe(rotate);
          close(toView(o.x, o.y), [50, 70 + baselineOf(line, 12)]);
          // pdf-lib draws the text along its rotated x axis: 10 points along it is 10 points to the right as seen.
          const t = (o.rotate * Math.PI) / 180;
          close(toView(o.x + 10 * Math.cos(t), o.y + 10 * Math.sin(t)), [60, 70 + baselineOf(line, 12)]);
        }
      });
    }
  }

  it('white boxes use the picture placement of pdf-sign', async () => {
    const { info } = await viewOf(await onePage(90, 36));
    const r = whiteRect({ x: 10, y: 20, w: 100, h: 30 }, info);
    expect(r.width).toBeCloseTo(100, 6);
    expect(r.height).toBeCloseTo(30, 6);
    expect(r.rotate).toBe(90);
  });
});

const HAVE_FACES = existsSync(join(PUBLIC, pdfFaces.json));

describe.skipIf(!HAVE_FACES)('faces and editPdf (built face list)', () => {
  let fonts: FaceTable;
  beforeAll(() => {
    fonts = diskFaces();
  });

  it('runs: Hangul, Latin and digits in Noto Sans KR slices, one run per slice; emoji has no face', async () => {
    const missing = new Set<string>();
    const runs = await runsOf('홍길동 Kim 2026', fonts, FONT_CHAIN, missing);
    expect(missing.size).toBe(0);
    expect(runs.map((r) => r.text).join('')).toBe('홍길동 Kim 2026');
    for (const r of runs) expect(r.face.def.url).toMatch(/\/noto-sans-kr@[^/]+\/noto-sans-kr-[\w-]+-400-normal\.woff$/);
    for (let i = 1; i < runs.length; i++) expect(runs[i]!.face).not.toBe(runs[i - 1]!.face);
    await runsOf('가😀', fonts, FONT_CHAIN, missing);
    expect([...missing]).toEqual(['😀']);
  });

  /** A 600 × 800 page with "OLDTEXT" at (100, 700) in Helvetica, plus a blank second page. */
  async function form(): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    doc.addPage([600, 800]).drawText('OLDTEXT', { x: 100, y: 700, size: 20, font });
    doc.addPage([600, 800]);
    return doc.save();
  }

  it('text and a white box: same page count, inserted text read back, old text hidden on the page but still in the file', async () => {
    const input = await form();
    const { info } = await viewOf(input);
    const box = { x: 100, y: 300, w: 200, h: 30 };
    const lines = ['홍길동 2026. 10. 15.', '두 번째 줄'].map((text, i) => {
      const o = textOrigin(box, info, ASCENT, 14, i);
      return { text, x: o.x, y: o.y };
    });
    const draws: EditDraw[] = [
      { kind: 'text', page: 0, lines, size: 14, rgb: RGB.black, rotate: 0 },
      // Over OLDTEXT (baseline y 700 → seen y 100; 20 pt high).
      { kind: 'white', page: 0, ...whiteRect({ x: 95, y: 80, w: 100, h: 26 }, info) },
    ];
    const out = await editPdf(input, undefined, draws, fonts, FONT_CHAIN);
    expect(out.pageCount).toBe(2);
    expect(out.signed).toBe(false);
    const doc = await PDFDocument.load(out.bytes, { updateMetadata: false });
    expect(doc.getPageCount()).toBe(2);
    expect(doc.getProducer()).toBe(PRODUCER);
    const texts = await pageTexts(out.bytes);
    expect(texts[0]!.replace(/\s+/g, '')).toContain('홍길동2026.10.15.');
    expect(texts[0]!.replace(/\s+/g, '')).toContain('두번째줄');
    // Honest scope: the white box only covers; the old text is still extractable.
    expect(texts[0]).toContain('OLDTEXT');
    // Rendered: white where OLDTEXT was, dark pixels inside the new text box.
    const at = await withPdf(out.bytes, async (pdf) => {
      const pg = await pdf.getPage(1);
      const vp = pg.getViewport({ scale: 1 });
      const c = createCanvas(600, 800);
      const ctx = c.getContext('2d');
      await pg.render({ canvasContext: ctx as unknown as CanvasRenderingContext2D, canvas: c as unknown as HTMLCanvasElement, viewport: vp }).promise;
      return (x0: number, y0: number, w: number, h: number) => {
        const d = ctx.getImageData(x0, y0, w, h).data;
        let dark = 0;
        for (let i = 0; i < d.length; i += 4) if (d[i]! < 128) dark++;
        return dark;
      };
    });
    expect(at(95, 80, 100, 26)).toBe(0);
    expect(at(box.x, box.y, box.w, box.h)).toBeGreaterThan(50);
    expect(at(box.x, box.y + box.h + 30, box.w, 30)).toBe(0);
  });

  it('each face is embedded once however many items use it', async () => {
    const input = await form();
    const { info } = await viewOf(input);
    const item = (y: number): EditDraw => {
      const o = textOrigin({ x: 50, y, w: 100, h: 20 }, info, ASCENT, 12);
      return { kind: 'text', page: 1, lines: [{ text: '가가', x: o.x, y: o.y }], size: 12, rgb: RGB.blue, rotate: 0 };
    };
    const out = await editPdf(input, undefined, [item(100), item(200), item(300)], fonts, FONT_CHAIN);
    const doc = await PDFDocument.load(out.bytes, { updateMetadata: false });
    const fontDict = doc.getPage(1).node.Resources()!.lookup(PDFName.of('Font'), PDFDict);
    // pdf-lib names the font once per drawText call; every name points at the one embedded font.
    expect(new Set(fontDict.values().map(String))).toHaveProperty('size', 1);
  });

  it('a character no face has stops the save with the list', async () => {
    const input = await form();
    const draws: EditDraw[] = [{ kind: 'text', page: 0, lines: [{ text: '가😀', x: 10, y: 10 }], size: 12, rgb: RGB.black, rotate: 0 }];
    await expect(editPdf(input, undefined, draws, fonts, FONT_CHAIN)).rejects.toBeInstanceOf(MissingGlyphError);
    await expect(editPdf(input, undefined, draws, fonts, FONT_CHAIN)).rejects.toMatchObject({ chars: '😀' });
  });
});

describe.skipIf(!HAVE_FACES)('coverage (the face list the item check reads)', () => {
  it('Hangul, Latin, digits and common punctuation are covered; emoji are not; unknown coverage blocks nothing', () => {
    const ranges = coverageOf(JSON.parse(readFileSync(join(PUBLIC, pdfFaces.json), 'utf8')) as PackedFaces);
    for (const ch of '홍길동가힣 ABCxyz 0123456789 .,-()·「」') expect(covered(ranges, ch.codePointAt(0)!), ch).toBe(true);
    for (const ch of ['😀', '👍', '🇰']) expect(covered(ranges, ch.codePointAt(0)!), ch).toBe(false);
    expect(covered(null, 0x1f600)).toBe(true);
  });
});
