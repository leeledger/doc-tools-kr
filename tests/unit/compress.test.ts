// PDF 용량 줄이기 engine (brief Step 2 "Tests → Unit"), run in Node with the same wasm the site ships.
import { PDFDocument, PDFName, PDFRawStream } from '@cantoo/pdf-lib';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { CompressDeps } from '../../src/lib/pdf/compress/deps';
import { compressPdf, optimizeArgs, qpdfFailure, type CompressOptions } from '../../src/lib/pdf/compress/engine';
import { LEVELS, type LevelName } from '../../src/lib/pdf/compress/levels';
import { imagePlacements } from '../../src/lib/pdf/compress/placements';
import { hasSignature } from '../../src/lib/pdf/compress/signature';
import { PdfError } from '../../src/lib/pdf/errors';
import { imagePdf, makeRuntimeFixtures, noisyJpeg, seededBytes } from '../fixtures/build.mjs';
import { nodeCompressDeps } from '../helpers/compress-deps';
import { fixture, pageCount, pageTexts } from '../helpers/pdf';

const law = fixture('kr_law_form.pdf');
const fw9 = fixture('irs_fw9.pdf');
const scan = fixture('gen_scan_a6.pdf');
const photo = fixture('gen_photo_resume.pdf');
const small = fixture('gen_already_small.pdf');
const MB = 1024 * 1024;

let deps: CompressDeps;
let tmp: string;
let rt: Record<string, string>;
const rtBytes = (k: string): Uint8Array => new Uint8Array(readFileSync(rt[k]!));

beforeAll(async () => {
  deps = await nodeCompressDeps();
  tmp = mkdtempSync(join(tmpdir(), 'anollim-cmp-'));
  rt = await makeRuntimeFixtures(tmp);
});
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const run = async (bytes: Uint8Array, level: LevelName, extra: Partial<CompressOptions> = {}) =>
  compressPdf(bytes, { level, expectedPages: await pageCount(bytes, extra.password), ...extra }, deps);

const reduction = (input: Uint8Array, out: Uint8Array): number => 1 - out.length / input.length;

async function errorOf(p: Promise<unknown>): Promise<PdfError> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(PdfError);
  return err as PdfError;
}

async function fieldCount(bytes: Uint8Array): Promise<number> {
  return (await PDFDocument.load(bytes, { updateMetadata: false })).getForm().getFields().length;
}

describe('levels on gen_scan_a6 (A6 page, 300 ppi scan)', () => {
  const out: Partial<Record<LevelName, Uint8Array>> = {};

  it.each([
    ['high', 0.4],
    ['recommended', 0.7],
    ['strong', 0.8],
  ] as const)('%s shrinks by at least %s, keeps the page, passes its SSIM gate', async (level, min) => {
    const r = await run(scan, level);
    expect(r.keptOriginal).toBe(false);
    expect(reduction(scan, r.bytes)).toBeGreaterThanOrEqual(min);
    expect(r.report.imagesReplaced).toBe(1);
    expect(r.report.minImageSsim).toBeGreaterThanOrEqual(LEVELS[level].minSsim);
    expect(await pageCount(r.bytes)).toBe(1);
    out[level] = r.bytes;
  });

  it('sizes are monotonic: 강력 ≤ 권장 ≤ 고화질', () => {
    expect(out.strong!.length).toBeLessThanOrEqual(out.recommended!.length);
    expect(out.recommended!.length).toBeLessThanOrEqual(out.high!.length);
  });
});

describe('text documents keep their text', () => {
  it('gen_photo_resume on 권장: at least 80 % smaller, same text on every page', async () => {
    const r = await run(photo, 'recommended');
    expect(reduction(photo, r.bytes)).toBeGreaterThanOrEqual(0.8);
    expect(await pageTexts(r.bytes)).toEqual(await pageTexts(photo));
  });

  it.each(['high', 'recommended', 'strong'] as const)('kr_law_form and irs_fw9 on %s: same pages, same text, same fields', async (level) => {
    for (const input of [law, fw9]) {
      const r = await run(input, level);
      expect(await pageCount(r.bytes)).toBe(await pageCount(input));
      expect(await pageTexts(r.bytes)).toEqual(await pageTexts(input));
    }
    const f = await run(fw9, level);
    expect(await fieldCount(f.bytes)).toBe(await fieldCount(fw9));
  });

  it('gen_already_small (our own 권장 output) comes back as the original, byte for byte', async () => {
    const r = await run(small, 'recommended');
    expect(r.keptOriginal).toBe(true);
    expect(r.report.keptReason).toBe('no-gain');
    expect(r.bytes).toBe(small);
  });

  it('metadata is left alone (no Producer is set)', async () => {
    const r = await run(scan, 'recommended');
    const before = await PDFDocument.load(scan, { updateMetadata: false });
    const after = await PDFDocument.load(r.bytes, { updateMetadata: false });
    expect(after.getProducer()).toBe(before.getProducer());
  });
});

describe('encrypted input', () => {
  it('no password → password required', async () => {
    expect((await errorOf(compressPdf(rtBytes('encrypted_userpw_1234'), { level: 'recommended', expectedPages: 7 }, deps))).code).toBe('password');
  });

  it('1234 → decrypted, text equals kr_law_form', async () => {
    const r = await run(rtBytes('encrypted_userpw_1234'), 'recommended', { password: '1234' });
    expect(await pageTexts(r.bytes)).toEqual(await pageTexts(law));
    expect(r.report.ownerRestrictionRemoved).toBe(false);
  });

  it('wrong password → wrong-password, and no qpdf log text in the error', async () => {
    const e = await errorOf(compressPdf(rtBytes('encrypted_userpw_1234'), { level: 'recommended', password: '0000', expectedPages: 7 }, deps));
    expect(e.code).toBe('wrong-password');
    expect(e.message).not.toMatch(/in\.pdf|qpdf:/);
  });

  it('owner-restricted → succeeds and reports the removed restriction', async () => {
    const r = await run(rtBytes('owner_restricted'), 'recommended');
    expect(r.report.ownerRestrictionRemoved).toBe(true);
    expect(await pageCount(r.bytes)).toBe(7);
    if (!r.keptOriginal) expect(await pageTexts(r.bytes)).toEqual(await pageTexts(law));
  });
});

describe('damaged input', () => {
  it('broken startxref → repaired by pdf-lib, then compressed', async () => {
    const r = await run(rtBytes('damaged_badxref'), 'recommended');
    expect(r.report.repairedBy).toBe('pdf-lib');
    expect(r.keptOriginal).toBe(false);
    expect(await pageTexts(r.bytes)).toEqual(await pageTexts(law));
  });

  it('truncated (engine called with the intact file’s page count) → corrupt, never partial output', async () => {
    const e = await errorOf(compressPdf(rtBytes('truncated'), { level: 'recommended', expectedPages: 6 }, deps));
    expect(e.code).toBe('corrupt');
  });

  it('not a PDF → not-pdf', async () => {
    expect((await errorOf(compressPdf(rtBytes('not_a_pdf'), { level: 'recommended', expectedPages: 1 }, deps))).code).toBe('not-pdf');
  });
});

describe('image skip rules', () => {
  it('JPX → skipped.jpx, original kept', async () => {
    const r = await run(rtBytes('jpx_only'), 'strong');
    expect(r.report.skipped.jpx).toBe(1);
    expect(r.keptOriginal).toBe(true);
  });

  it('CMYK JPEG → skipped.cmyk', async () => {
    const r = await run(rtBytes('cmyk_jpeg'), 'strong');
    expect(r.report.skipped.cmyk).toBe(1);
    expect(r.report.imagesReplaced).toBe(0);
  });

  it('SMask target → skipped, the colour image itself is still recompressed', async () => {
    const jpg = await noisyJpeg(900, 900);
    const bytes = await imagePdf({ Filter: 'DCTDecode', ColorSpace: 'DeviceRGB', BitsPerComponent: 8 }, jpg, 900, 900, {
      extra: (ctx: PDFDocument['context']) => ({
        SMask: ctx.register(
          ctx.stream(deflateSync(seededBytes(900 * 900, 3)), {
            Type: 'XObject',
            Subtype: 'Image',
            Width: 900,
            Height: 900,
            ColorSpace: 'DeviceGray',
            BitsPerComponent: 8,
            Filter: 'FlateDecode',
          }),
        ),
      }),
    });
    const r = await run(bytes, 'strong');
    expect(r.report.skipped['smask-target']).toBe(1);
    expect(r.report.imagesReplaced).toBe(1);
  });

  it('/ImageMask, /Decode and Flate line art are skipped', async () => {
    const mask = await imagePdf({ ImageMask: true, BitsPerComponent: 1, Filter: 'FlateDecode' }, deflateSync(seededBytes(200 * 1600, 5)), 1600, 1600);
    expect((await run(mask, 'strong')).report.skipped.imagemask).toBe(1);

    const decode = await imagePdf({ Filter: 'DCTDecode', ColorSpace: 'DeviceRGB', BitsPerComponent: 8, Decode: [1, 0, 1, 0, 1, 0] }, await noisyJpeg(900, 900), 900, 900);
    expect((await run(decode, 'strong')).report.skipped['decode-array']).toBe(1);

    // 1,000 distinct colours in a random arrangement: large as Flate, but line art for the rule (< 2048 colours).
    const w = 600;
    const idx = seededBytes(w * w * 2, 11);
    const rgb = new Uint8Array(w * w * 3);
    for (let i = 0; i < w * w; i++) {
      const c = ((idx[2 * i]! << 8) | idx[2 * i + 1]!) % 1000;
      rgb.set([c % 10 * 25, Math.floor(c / 10) % 10 * 25, Math.floor(c / 100) * 25], i * 3);
    }
    const lineart = await imagePdf({ Filter: 'FlateDecode', ColorSpace: 'DeviceRGB', BitsPerComponent: 8 }, deflateSync(rgb), w, w);
    expect((await run(lineart, 'strong')).report.skipped.lineart).toBe(1);
  });
});

describe('performance paths', () => {
  it('skips placement parsing when no image passes the cheap checks', async () => {
    const spy = vi.fn(imagePlacements);
    await run(law, 'strong', { imageHooks: { placements: spy } });
    expect(spy).not.toHaveBeenCalled();
    await run(scan, 'strong', { imageHooks: { placements: spy } });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('junk content (unbalanced q, garbage, a 1 MB token) does not throw; the image falls back to the page size', async () => {
    let placed = -1;
    const spy = vi.fn((doc: PDFDocument) => {
      const p = imagePlacements(doc);
      placed = p.place.size;
      return p;
    });
    const r = await run(rtBytes('junk_content'), 'recommended', { imageHooks: { placements: spy } });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(placed).toBe(0);
    expect(r.report.imagesSeen).toBe(1);
  });

  it('uses Flate level 6 above 30 MB and 9 otherwise', () => {
    expect(optimizeArgs(30 * MB)).toContain('--compression-level=9');
    expect(optimizeArgs(30 * MB + 1)).toContain('--compression-level=6');
    expect(optimizeArgs(1)).not.toContain('--compression-level=6');
  });
});

describe('signatures', () => {
  it('hasSignature: true on signed_fake, false on kr_law_form', async () => {
    const load = (b: Uint8Array) => PDFDocument.load(b, { updateMetadata: false });
    expect(hasSignature(await load(rtBytes('signed_fake')))).toBe(true);
    expect(hasSignature(await load(law))).toBe(false);
  });

  it('the engine reports a signed input', async () => {
    const r = await run(rtBytes('signed_fake'), 'recommended');
    expect(r.report.signed).toBe(true);
  });
});

describe('qpdf log mapping', () => {
  const failed = (logs: string[]) => ({ code: 2, out: null, logs });

  it('"invalid password" → wrong-password (password given) or password (none given)', () => {
    expect(qpdfFailure(failed(['qpdf: in.pdf: invalid password']), true).code).toBe('wrong-password');
    expect(qpdfFailure(failed(['qpdf: in.pdf: INVALID PASSWORD']), false).code).toBe('password');
  });

  it('anything else → corrupt, and the log text never reaches the error', () => {
    const e = qpdfFailure(failed(['WARNING: in.pdf: SECRET-FILE-DETAIL xref not found']), false);
    expect(e.code).toBe('corrupt');
    expect(e.message).not.toContain('SECRET-FILE-DETAIL');
  });
});

describe('report', () => {
  it('holds no file names, passwords or logs', async () => {
    const r = await run(rtBytes('encrypted_userpw_1234'), 'recommended', { password: '1234' });
    const json = JSON.stringify(r.report);
    expect(json).not.toContain('1234');
    expect(json).not.toMatch(/\.pdf|qpdf/i);
    expect(Object.keys(r.report.ms).sort()).toEqual(['images', 'normalize', 'optimize', 'verify']);
  });

  it('replaced images are real JPEG streams', async () => {
    const r = await run(scan, 'recommended');
    const doc = await PDFDocument.load(r.bytes, { updateMetadata: false });
    const images = doc.context
      .enumerateIndirectObjects()
      .map(([, o]) => o)
      .filter((o): o is PDFRawStream => o instanceof PDFRawStream && o.dict.get(PDFName.of('Subtype')) === PDFName.of('Image'));
    expect(images).toHaveLength(1);
    expect(images[0]!.dict.get(PDFName.of('Filter'))).toBe(PDFName.of('DCTDecode'));
  });
});
