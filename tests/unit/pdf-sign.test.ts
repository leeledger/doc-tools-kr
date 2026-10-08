// PDF 서명·도장 넣기 (TOOLS5 U3): the pure placement maths against real pdf.js viewports (rotation 0/90/180/270 × CropBox
// origin (0,0) and (36,36)), the box rules, 넣을 쪽, names, the limits, signPdf in the PDF 합치기 worker code, and the
// /stamp-signature/ hand-over through sessionStorage.
import { PDFDocument, PDFName, PDFDict, PDFRawStream, degrees } from '@cantoo/pdf-lib';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signPdf } from '../../src/lib/pdf/sign';
import { MB } from '../../src/lib/ui/device';
import { HANDOFF_FAILED, PDF_SIGN_PATH, SIGN_PNG_KEY, hasSignPng, sendToPdfSign, storeSignPng, takeSignPng } from '../../src/lib/ui/sign-handoff';
import { LIMITS, fileLimitMessage, imageLimitMessage } from '../../src/tools/pdf-sign/limits';
import { LIMITS as SPLIT_LIMITS } from '../../src/tools/pdf-split/limits';
import {
  MIN_EDGE,
  clampBox,
  moveBox,
  pagesOf,
  placeValue,
  reshapeBox,
  resizeBox,
  showsOn,
  signName,
  stampsFor,
  startBox,
  toPdfRect,
  type PageInfo,
  type Placement,
  type Stamp,
} from '../../src/tools/pdf-sign/place';
import { makeRuntimeFixtures } from '../fixtures/build.mjs';
import { withPdf } from '../helpers/pdf';

/** A one-page PDF: 600 × 800 MediaBox, optional /Rotate and CropBox origin. */
async function onePage(rotate: number, crop: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([600, 800]);
  if (crop) page.setCropBox(crop, crop, 600 - 2 * crop - 40, 800 - 2 * crop);
  page.setRotation(degrees(rotate));
  return doc.save();
}

/** The page as seen by pdf.js (what the controller hands to place.ts), plus the forward conversion for checks. */
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

/** Where pdf-lib's drawImage puts the picture's own corner (u, v) in [0,1]²: translate, rotate (ccw), scale. */
function corner(s: Omit<Stamp, 'page'>, u: number, v: number): [number, number] {
  const t = (s.rotate * Math.PI) / 180;
  const px = u * s.width;
  const py = v * s.height;
  return [s.x + Math.cos(t) * px - Math.sin(t) * py, s.y + Math.sin(t) * px + Math.cos(t) * py];
}

const close = (a: number[], b: number[]): void => {
  expect(a[0]).toBeCloseTo(b[0]!, 6);
  expect(a[1]).toBeCloseTo(b[1]!, 6);
};

describe('toPdfRect: the picture lands upright where it was placed (real pdf.js viewports)', () => {
  for (const rotate of [0, 90, 180, 270]) {
    for (const crop of [0, 36]) {
      it(`/Rotate ${rotate}, CropBox origin (${crop},${crop})`, async () => {
        const { info, toView } = await viewOf(await onePage(rotate, crop));
        expect(info.rotate).toBe(rotate);
        const box = { x: 50, y: 70, w: 120, h: 40 };
        const s = toPdfRect(box, info);
        expect(s.rotate).toBe(rotate);
        expect(s.width).toBeCloseTo(120, 6);
        expect(s.height).toBeCloseTo(40, 6);
        // The picture's top-left, top-right, bottom-left and bottom-right as seen = the box's corners.
        close(toView(...corner(s, 0, 1)), [50, 70]);
        close(toView(...corner(s, 1, 1)), [170, 70]);
        close(toView(...corner(s, 0, 0)), [50, 110]);
        close(toView(...corner(s, 1, 0)), [170, 110]);
      });
    }
  }

  it('a box hanging off the page is clamped first', async () => {
    const { info } = await viewOf(await onePage(90, 36));
    const s = toPdfRect({ x: info.width - 10, y: -20, w: 100, h: 50 }, info);
    expect(s.width).toBeCloseTo(100, 6);
    expect(s.height).toBeCloseTo(50, 6);
  });
});

describe('box rules', () => {
  it('clampBox: inside the page, aspect kept, never larger than the page, at least MIN_EDGE on the short side', () => {
    expect(clampBox({ x: -5, y: 790, w: 100, h: 50 }, 600, 800)).toEqual({ x: 0, y: 750, w: 100, h: 50 });
    const big = clampBox({ x: 0, y: 0, w: 1200, h: 300 }, 600, 800);
    expect(big).toEqual({ x: 0, y: 0, w: 600, h: 150 });
    const tall = clampBox({ x: 0, y: 0, w: 100, h: 2000 }, 600, 800);
    expect(tall.h).toBe(800);
    expect(tall.w).toBeCloseTo(40, 6);
    const tiny = clampBox({ x: 10, y: 10, w: 4, h: 2 }, 600, 800);
    expect(tiny.h).toBe(MIN_EDGE);
    expect(tiny.w).toBe(MIN_EDGE * 2);
    // A page smaller than the minimum wins.
    expect(clampBox({ x: 0, y: 0, w: 4, h: 4 }, 8, 8)).toEqual({ x: 0, y: 0, w: 8, h: 8 });
  });

  it('startBox: a quarter of the page width (at most 150 pt), 36 pt from the lower right corner', () => {
    expect(startBox(400, 200, 600, 800)).toEqual({ x: 600 - 36 - 150, y: 800 - 36 - 75, w: 150, h: 75 });
    expect(startBox(100, 100, 200, 300)).toEqual({ x: 200 - 36 - 50, y: 300 - 36 - 50, w: 50, h: 50 });
  });

  it('moveBox / resizeBox / reshapeBox keep the box inside', () => {
    const b = { x: 100, y: 100, w: 100, h: 50 };
    expect(moveBox(b, 10, -10, 600, 800)).toEqual({ x: 110, y: 90, w: 100, h: 50 });
    expect(moveBox(b, 1000, 1000, 600, 800)).toEqual({ x: 500, y: 750, w: 100, h: 50 });
    expect(resizeBox(b, 200, 600, 800)).toEqual({ x: 100, y: 100, w: 200, h: 100 });
    // Growing past the right edge: moved back in, size kept.
    expect(resizeBox({ ...b, x: 550 }, 200, 600, 800)).toEqual({ x: 400, y: 100, w: 200, h: 100 });
    expect(reshapeBox(b, 100, 100)).toEqual({ x: 100, y: 100, w: 100, h: 100 });
    // Not clamped to any one page: each page clamps the shared box when shown and when saved.
    expect(reshapeBox({ ...b, x: 550 }, 100, 200)).toEqual({ x: 550, y: 100, w: 100, h: 200 });
  });

  it('resizeBox never collapses: at least MIN_EDGE on both sides, finite aspect for 0, negative or NaN widths and degenerate boxes', () => {
    const b = { x: 100, y: 100, w: 100, h: 50 };
    for (const w of [0, -40, Number.NaN, Number.POSITIVE_INFINITY, 1]) {
      const r = resizeBox(b, w, 600, 800);
      for (const v of Object.values(r)) expect(Number.isFinite(v), `${w}: ${JSON.stringify(r)}`).toBe(true);
      expect(Math.min(r.w, r.h), String(w)).toBeGreaterThanOrEqual(MIN_EDGE);
      expect(r.h / r.w).toBeCloseTo(0.5, 6);
    }
    // A box that already collapsed (0 or NaN sides) comes back square at the minimum, never NaN.
    for (const bad of [{ x: 0, y: 0, w: 0, h: 0 }, { x: 0, y: 0, w: Number.NaN, h: 10 }]) {
      const r = resizeBox(bad, 0, 600, 800);
      expect(r).toEqual({ x: 0, y: 0, w: MIN_EDGE, h: MIN_EDGE });
      expect(clampBox(bad, 600, 800)).toEqual({ x: 0, y: 0, w: MIN_EDGE, h: MIN_EDGE });
    }
  });

  it('mixed page sizes: the shared box is clamped per page at save, and stays as placed for the large page', async () => {
    // A box at the lower right of a 600 × 800 page, put on a 200 × 300 page too (모든 쪽).
    const box = startBox(200, 100, 600, 800);
    const big: PageInfo = { width: 600, height: 800, rotate: 0, toPdf: (x, y) => [x, 800 - y] };
    const small: PageInfo = { width: 200, height: 300, rotate: 0, toPdf: (x, y) => [x, 300 - y] };
    const all: Placement = { id: 1, box, where: 'all', page: 0, range: '' };
    const r = await stampsFor([all], 2, async (i) => (i === 0 ? big : small));
    expect(r.ok && r.stamps).toEqual([
      { page: 0, x: 414, y: 36, width: 150, height: 75, rotate: 0 },
      { page: 1, x: 50, y: 0, width: 150, height: 75, rotate: 0 },
    ]);
    expect(all.box).toEqual(box);
  });
});

describe('넣을 쪽', () => {
  const p = (where: Placement['where'], range = '', page = 1): Placement => ({ id: 1, box: { x: 0, y: 0, w: 50, h: 20 }, where, page, range });

  it('pagesOf: one page, all pages, a range (0-based); a wrong range is an error', () => {
    expect(pagesOf(p('one'), 5)).toEqual({ ok: true, pages: [1] });
    expect(pagesOf(p('all'), 3)).toEqual({ ok: true, pages: [0, 1, 2] });
    expect(pagesOf(p('range', '1-2, 5'), 5)).toEqual({ ok: true, pages: [0, 1, 4] });
    expect(pagesOf(p('range', '9'), 5)).toEqual({ ok: false, error: 'out-of-range' });
    expect(pagesOf(p('range', '3-1'), 5)).toEqual({ ok: false, error: 'reversed' });
    expect(pagesOf(p('range', ''), 5)).toEqual({ ok: false, error: 'empty' });
    expect(pagesOf(p('range', 'abc'), 5)).toEqual({ ok: false, error: 'junk' });
  });

  it('showsOn: an unfinished range shows the picture on its own page only', () => {
    expect(showsOn(p('range', '2-3'), 2, 5)).toBe(true);
    expect(showsOn(p('range', '2-3'), 0, 5)).toBe(false);
    expect(showsOn(p('range', '2-'), 1, 5)).toBe(true);
    expect(showsOn(p('range', '2-'), 2, 5)).toBe(false);
  });

  it('stampsFor: every page of every placement, by page; the first wrong range stops it', async () => {
    const info = async (i: number): Promise<PageInfo> => ({ width: 600, height: 800, rotate: 0, toPdf: (x, y) => [x, 800 - y + i] });
    const r = await stampsFor([p('all'), { ...p('one', '', 0), id: 2 }], 2, info);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.stamps.map((s) => s.page)).toEqual([0, 0, 1]);
    expect(await stampsFor([p('one'), { ...p('range', '7'), id: 9 }], 2, info)).toEqual({ ok: false, id: 9, error: 'out-of-range' });
  });

  it('placeValue: 모든 쪽 > 범위 > 고른 쪽 (the usage value; no pages or positions)', () => {
    expect(placeValue([p('one')])).toBe('one');
    expect(placeValue([p('one'), p('range', '1')])).toBe('range');
    expect(placeValue([p('range', '1'), p('all')])).toBe('all');
  });

  it('signName: {base}_서명.pdf, unsafe characters removed', () => {
    expect(signName('계약서.pdf')).toBe('계약서_서명.pdf');
    expect(signName('a:b.PDF')).toBe('ab_서명.pdf');
    expect(signName('.pdf')).toBe('문서_서명.pdf');
  });
});

describe('limits', () => {
  it('the PDF limits of PDF 나누기·쪽 편집; the picture 50 MB on a PC, 30 MB on a phone', () => {
    expect(LIMITS.desktop.maxFileBytes).toBe(SPLIT_LIMITS.desktop.maxFileBytes);
    expect(LIMITS.mobile.maxFileBytes).toBe(SPLIT_LIMITS.mobile.maxFileBytes);
    expect(fileLimitMessage(LIMITS.mobile.maxFileBytes, 'mobile')).toBeNull();
    expect(fileLimitMessage(LIMITS.mobile.maxFileBytes + 1, 'mobile')).toBe('휴대폰에서는 100 MB까지의 PDF만 열 수 있습니다. 더 작은 파일을 고르거나 PC에서 이용해 주세요.');
    expect(imageLimitMessage(30 * MB, 'mobile')).toBeNull();
    expect(imageLimitMessage(50 * MB + 1, 'desktop')).toBe('이 기기에서는 50 MB까지의 그림만 쓸 수 있습니다. 더 작은 그림을 골라 주세요.');
  });
});

/** A tiny RGBA PNG (2×1: red, transparent). */
function png(): Uint8Array<ArrayBuffer> {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Uint8Array): number => {
    let c = 0xffffffff;
    for (const x of b) c = crcTable[(c ^ x) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Uint8Array): Uint8Array => {
    const out = new Uint8Array(12 + data.length);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, data.length);
    out.set(new TextEncoder().encode(type), 4);
    out.set(data, 8);
    dv.setUint32(8 + data.length, crc(out.subarray(4, 8 + data.length)));
    return out;
  };
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, 2);
  dv.setUint32(4, 1);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const raw = new Uint8Array([0, 255, 0, 0, 255, 0, 0, 0, 0]);
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', new Uint8Array(deflateSync(raw))), chunk('IEND', new Uint8Array())];
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Image XObjects drawn on each page. */
function imagesPerPage(doc: PDFDocument): number[] {
  return doc.getPages().map((p) => {
    const xo = p.node.Resources()?.lookupMaybe(PDFName.of('XObject'), PDFDict);
    if (!xo) return 0;
    return xo.keys().filter((k) => {
      const o = doc.context.lookup(xo.get(k));
      return o instanceof PDFRawStream && o.dict.get(PDFName.of('Subtype')) === PDFName.of('Image');
    }).length;
  });
}

describe('signPdf (the `sign` message of the PDF 합치기 worker)', () => {
  let tmp = '';
  let rt: Record<string, string>;
  beforeAll(async () => {
    tmp = mkdtempSync(join(tmpdir(), 'pdfsign-'));
    rt = await makeRuntimeFixtures(tmp);
  });
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));

  const stamp = (page: number): Stamp => ({ page, x: 100, y: 100, width: 80, height: 40, rotate: 0 });

  it('draws the picture once per stamp on the given pages only; producer 문서딱; page count kept', async () => {
    const doc = await PDFDocument.create();
    for (let i = 0; i < 3; i++) doc.addPage([600, 800]);
    const out = await signPdf(await doc.save(), undefined, png(), [stamp(0), stamp(2)]);
    expect(out.pageCount).toBe(3);
    expect(out.signed).toBe(false);
    const back = await PDFDocument.load(out.bytes, { updateMetadata: false });
    expect(imagesPerPage(back)).toEqual([1, 0, 1]);
    expect(back.getProducer()).toMatch(/^문서딱/);
  });

  it('an encrypted PDF opened with its password is saved without one; a wrong password is wrong-password', async () => {
    const enc = new Uint8Array(readFileSync(rt.encrypted_userpw_1234!));
    const out = await signPdf(enc, '1234', png(), [stamp(0)]);
    const back = await PDFDocument.load(out.bytes, { updateMetadata: false });
    expect(back.isEncrypted).toBe(false);
    expect(back.getPageCount()).toBe(7);
    await expect(signPdf(enc, '0000', png(), [stamp(0)])).rejects.toMatchObject({ code: 'wrong-password' });
  });

  it('reports a digital signature; rejects a file that is not a PDF', async () => {
    const out = await signPdf(new Uint8Array(readFileSync(rt.signed_fake!)), undefined, png(), [stamp(0)]);
    expect(out.signed).toBe(true);
    await expect(signPdf(new Uint8Array(readFileSync(rt.not_a_pdf!)), undefined, png(), [stamp(0)])).rejects.toMatchObject({ code: 'not-pdf' });
  });

  it('a page whose content leaves the graphics state changed (unbalanced cm) does not move the picture', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([600, 800]);
    const leak = doc.context.flateStream('2 0 0 2 300 300 cm');
    page.node.set(PDFName.of('Contents'), doc.context.register(leak));
    const out = await signPdf(await doc.save(), undefined, png(), [stamp(0)]);
    // Replay pdf.js's operator list: the CTM when the image is painted must be exactly the stamp's
    // (x 100, y 100, 80 × 40), i.e. the page's leaked "2 0 0 2 300 300 cm" was undone by a Q first.
    const { OPS } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const painted = await withPdf(out.bytes, async (d) => {
      const p = await d.getPage(1);
      const ops = await p.getOperatorList();
      const mul = (m: number[], n: number[]): number[] => [
        m[0]! * n[0]! + m[2]! * n[1]!, m[1]! * n[0]! + m[3]! * n[1]!,
        m[0]! * n[2]! + m[2]! * n[3]!, m[1]! * n[2]! + m[3]! * n[3]!,
        m[0]! * n[4]! + m[2]! * n[5]! + m[4]!, m[1]! * n[4]! + m[3]! * n[5]! + m[5]!,
      ];
      let ctm = [1, 0, 0, 1, 0, 0];
      const stack: number[][] = [];
      const seen: string[] = [];
      const ctms: number[][] = [];
      ops.fnArray.forEach((fn, i) => {
        if (fn === OPS.save) {
          stack.push(ctm);
          seen.push('q');
        } else if (fn === OPS.restore) {
          ctm = stack.pop() ?? [1, 0, 0, 1, 0, 0];
          seen.push('Q');
        } else if (fn === OPS.transform) {
          ctm = mul(ctm, ops.argsArray[i] as number[]);
          seen.push('cm');
        } else if (fn === OPS.paintImageXObject) {
          ctms.push(ctm);
          seen.push('image');
        }
      });
      return { seen, ctms };
    });
    // q (wrap) cm (leak) Q (wrap) … image: the leak is closed before the picture's own stream.
    expect(painted.seen.slice(0, 3)).toEqual(['q', 'cm', 'Q']);
    expect(painted.seen.indexOf('image')).toBeGreaterThan(painted.seen.indexOf('Q'));
    expect(painted.ctms).toHaveLength(1);
    const [a, b, c, dd, e, f] = painted.ctms[0]!;
    expect([a, b, c, dd, e, f].map((v) => Math.round(v! * 1000) / 1000)).toEqual([80, 0, 0, 40, 100, 100]);
  });
});

describe('/stamp-signature/ → /pdf-sign/ hand-over (sessionStorage)', () => {
  class Store {
    m = new Map<string, string>();
    full = false;
    getItem(k: string): string | null {
      return this.m.get(k) ?? null;
    }
    setItem(k: string, v: string): void {
      if (this.full) throw new DOMException('quota', 'QuotaExceededError');
      this.m.set(k, v);
    }
    removeItem(k: string): void {
      this.m.delete(k);
    }
  }
  const URL_PNG = `data:image/png;base64,${Buffer.from(png()).toString('base64')}`;

  it('stores under docttak:sign-png, reads once and removes', async () => {
    const s = new Store();
    expect(SIGN_PNG_KEY).toBe('docttak:sign-png');
    expect(storeSignPng(URL_PNG, s)).toBe(true);
    expect(hasSignPng(s)).toBe(true);
    const b = takeSignPng(s);
    expect(b).toBeInstanceOf(Blob);
    expect(new Uint8Array(await (b as Blob).arrayBuffer())).toEqual(png());
    expect(hasSignPng(s)).toBe(false);
    expect(takeSignPng(s)).toBeNull();
  });

  it('a full or missing storage is reported (QuotaExceeded → the download message); a stored value that is not a PNG is invalid', () => {
    const s = new Store();
    s.full = true;
    expect(storeSignPng(URL_PNG, s)).toBe(false);
    expect(storeSignPng(URL_PNG, null)).toBe(false);
    expect(HANDOFF_FAILED).toBe('PNG를 내려받은 뒤 PDF 서명·도장 넣기에서 골라 주세요.');
    const t = new Store();
    t.setItem(SIGN_PNG_KEY, 'data:text/html;base64,PGI+');
    expect(takeSignPng(t)).toBe('invalid');
    expect(t.getItem(SIGN_PNG_KEY)).toBeNull();
  });

  it('sendToPdfSign opens /pdf-sign/ only when the PNG was stored', async () => {
    const opened: string[] = [];
    const g = globalThis as { window?: unknown };
    const before = g.window;
    const store = new Store();
    g.window = { sessionStorage: store };
    try {
      expect(await sendToPdfSign(new Blob([png() as Uint8Array<ArrayBuffer>], { type: 'image/png' }), (p) => opened.push(p))).toBe(true);
      expect(opened).toEqual([PDF_SIGN_PATH]);
      expect(store.getItem(SIGN_PNG_KEY)).toBe(URL_PNG);
      store.full = true;
      store.m.clear();
      expect(await sendToPdfSign(new Blob([png() as Uint8Array<ArrayBuffer>], { type: 'image/png' }), (p) => opened.push(p))).toBe(false);
      expect(opened).toEqual([PDF_SIGN_PATH]);
    } finally {
      g.window = before;
    }
  });
});
