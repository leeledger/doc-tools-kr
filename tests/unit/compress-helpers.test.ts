// PDF 용량 줄이기: SSIM, raster, result checker, limits, formatting, tokenizer caps, vendor paths.
import { PDFDocument, PDFName, PDFRawStream } from '@cantoo/pdf-lib';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MAX_TOKEN_BYTES, contentOps } from '../../src/lib/pdf/compress/contentOps';
import { rasterScale } from '../../src/lib/pdf/compress/levels';
import { MAX_LOG_LINES, runQpdf, type QpdfFactory, type QpdfModule } from '../../src/lib/pdf/compress/qpdf-run';
import { RasterAssembler } from '../../src/lib/pdf/compress/raster';
import { GATE_HALF_ABOVE, boxHalf, ssimImages, ssimLuma, toLuma } from '../../src/lib/pdf/compress/ssim';
import { QPDF_VENDOR_DIR } from '../../src/lib/pdf/compress/wasm-browser';
import { checkResult, checkedPages, type TextDoc } from '../../src/tools/pdf-compress/check';
import { compressedFileName, reductionPercent, sizeChange } from '../../src/tools/pdf-compress/format';
import { LIMITS, checkFileBytes, checkPages, checkRun } from '../../src/tools/pdf-compress/limits';
import { nodeCompressDeps } from '../helpers/compress-deps';

const MB = 1024 * 1024;

function image(width: number, height: number, px: (x: number, y: number) => [number, number, number]): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = px(x, y);
      data.set([r, g, b, 255], (y * width + x) * 4);
    }
  }
  return new ImageData(data, width, height);
}

describe('SSIM gate metric', () => {
  it('identical images → 1', () => {
    const a = image(64, 48, (x, y) => [(x * 7) % 256, (y * 5) % 256, 90]);
    expect(ssimImages(a, a)).toBe(1);
  });

  it('two flat patches match the closed form', () => {
    const a = image(8, 8, () => [100, 100, 100]);
    const b = image(8, 8, () => [110, 110, 110]);
    const C1 = (0.01 * 255) ** 2;
    const la = 0.299 * 100 + 0.587 * 100 + 0.114 * 100;
    const lb = 0.299 * 110 + 0.587 * 110 + 0.114 * 110;
    expect(ssimImages(a, b)).toBeCloseTo((2 * la * lb + C1) / (la * la + lb * lb + C1), 6);
  });

  // Expected value from an independent Python reference of the same definition (float64: 0.93940349675).
  it('a known pair gives the checked-in value (± 1e-6)', () => {
    const a = image(32, 24, (x, y) => [(x * 8 + y * 3) % 256, (x * 5) % 256, (y * 9) % 256]);
    const b = image(32, 24, (x, y) => [(x * 8 + y * 3 + ((x * y) % 7)) % 256, (x * 5 + 3) % 256, (y * 9) % 256]);
    expect(ssimImages(a, b)).toBeCloseTo(0.9394034974, 6);
  });

  it(`compares images wider than ${GATE_HALF_ABOVE} px at half size with a 2×2 box average`, () => {
    // A 1-px checkerboard and flat mid-gray are identical after a 2×2 box average, not before.
    const w = GATE_HALF_ABOVE + 2;
    const checker = image(w, 16, (x, y) => ((x + y) % 2 ? [255, 255, 255] : [0, 0, 0]));
    const gray = image(w, 16, () => [127.5, 127.5, 127.5]);
    const narrowChecker = image(GATE_HALF_ABOVE, 16, (x, y) => ((x + y) % 2 ? [255, 255, 255] : [0, 0, 0]));
    const narrowGray = image(GATE_HALF_ABOVE, 16, () => [127.5, 127.5, 127.5]);
    expect(ssimImages(checker, gray)).toBeGreaterThan(0.999);
    expect(ssimImages(narrowChecker, narrowGray)).toBeLessThan(0.1);
    const half = boxHalf(toLuma(checker));
    expect([half.width, half.height]).toEqual([w / 2, 8]);
    expect(ssimLuma(half, boxHalf(toLuma(gray)))).toBeGreaterThan(0.999);
  });
});

describe('raster', () => {
  it('RasterAssembler: 2 pages with the given sizes; the gray page is a 1-channel JPEG', async () => {
    const asm = new RasterAssembler(await nodeCompressDeps());
    const gray = image(200, 300, (x, y) => [(x + y) % 256, (x + y) % 256, (x + y) % 256]);
    const colour = image(300, 200, (x, y) => [x % 256, y % 256, 40]);
    await asm.addPage(gray.data, 200, 300, 144, 216);
    await asm.addPage(colour.data, 300, 200, 216, 144);
    expect(asm.grayPages).toBe(1);
    const doc = await PDFDocument.load(await asm.finish(), { updateMetadata: false });
    expect(doc.getPages().map((p) => [p.getWidth(), p.getHeight()])).toEqual([
      [144, 216],
      [216, 144],
    ]);
    const spaces = doc.context
      .enumerateIndirectObjects()
      .map(([, o]) => o)
      .filter((o): o is PDFRawStream => o instanceof PDFRawStream && o.dict.get(PDFName.of('Subtype')) === PDFName.of('Image'))
      .map((o) => String(o.dict.get(PDFName.of('ColorSpace'))));
    expect(spaces.sort()).toEqual(['/DeviceGray', '/DeviceRGB']);
  });

  it('render scale: 150 dpi, long side capped at 3000 px', () => {
    expect(rasterScale(595, 842)).toBeCloseTo(150 / 72, 10);
    const a0 = rasterScale(2384, 3370);
    expect(a0).toBeCloseTo(3000 / 3370, 10);
    expect(Math.round(3370 * a0)).toBe(3000);
  });
});

describe('main-thread result check', () => {
  const doc = (texts: string[]): TextDoc => ({ numPages: texts.length, pageText: async (i) => texts[i]! });

  it('checks the first, middle and last page', () => {
    expect(checkedPages(1)).toEqual([0]);
    expect(checkedPages(2)).toEqual([0, 1]);
    expect(checkedPages(7)).toEqual([0, 3, 6]);
  });

  it('passes on equal text (whitespace ignored)', async () => {
    expect(await checkResult(doc(['가 나', 'b', 'c']), doc(['가나', 'b', ' c ']), true)).toBe(true);
  });

  it('fails on a page-count mismatch and on a text mismatch', async () => {
    expect(await checkResult(doc(['a', 'b', 'c']), doc(['a', 'b']), true)).toBe(false);
    expect(await checkResult(doc(['a', 'b', 'c']), doc(['a', 'b', 'x']), true)).toBe(false);
  });

  it('raster results are checked for the page count only', async () => {
    expect(await checkResult(doc(['a', 'b']), doc(['', '']), false)).toBe(true);
    expect(await checkResult(doc(['a', 'b']), doc(['']), false)).toBe(false);
  });
});

describe('limits (brief 5.4)', () => {
  it('desktop: confirm above 40 MB or 1,000쪽, block above 100 MB', () => {
    expect(checkRun(40 * MB, 1000, false, 'desktop').level).toBe('ok');
    expect(checkRun(40 * MB + 1, 1, false, 'desktop').level).toBe('soft');
    expect(checkRun(1, 1001, false, 'desktop').level).toBe('soft');
    expect(checkFileBytes(100 * MB, 'desktop').level).toBe('ok');
    const hard = checkFileBytes(100 * MB + 1, 'desktop');
    expect(hard.level).toBe('hard');
    expect(hard.level !== 'ok' && hard.message).toContain('100 MB');
  });

  it('mobile: confirm above 20 MB or 300쪽, block above 50 MB, with the number and the reason', () => {
    expect(checkRun(20 * MB, 300, false, 'mobile').level).toBe('ok');
    const soft = checkRun(20 * MB + 1, 1, false, 'mobile');
    expect(soft.level).toBe('soft');
    expect(soft.level !== 'ok' && soft.message).toContain('20 MB');
    expect(checkRun(1, 301, false, 'mobile').level).toBe('soft');
    const hard = checkFileBytes(50 * MB + 1, 'mobile');
    expect(hard.level !== 'ok' && hard.message).toBe('휴대폰에서는 50 MB까지 줄일 수 있습니다. 이 기기에서 처리하기에 너무 커서 화면이 멈출 수 있기 때문입니다.');
  });

  it('이미지로 변환: desktop confirm above 200쪽, block above 500쪽; mobile 30쪽 / 100쪽', () => {
    expect(checkRun(1, 200, true, 'desktop').level).toBe('ok');
    expect(checkRun(1, 201, true, 'desktop').level).toBe('soft');
    expect(checkPages(500, true, 'desktop').level).toBe('ok');
    expect(checkPages(501, true, 'desktop').level).toBe('hard');
    expect(checkRun(1, 501, true, 'desktop').level).toBe('hard');
    expect(checkRun(1, 30, true, 'mobile').level).toBe('ok');
    expect(checkRun(1, 31, true, 'mobile').level).toBe('soft');
    expect(checkPages(101, true, 'mobile').level).toBe('hard');
    // The normal levels have no page hard limit.
    expect(checkPages(100_000, false, 'mobile').level).toBe('ok');
  });

  it('matches the table', () => {
    expect(LIMITS).toEqual({
      desktop: { softBytes: 40 * MB, softPages: 1000, hardBytes: 100 * MB, rasterSoftPages: 200, rasterHardPages: 500 },
      mobile: { softBytes: 20 * MB, softPages: 300, hardBytes: 50 * MB, rasterSoftPages: 30, rasterHardPages: 100 },
    });
  });
});

describe('result formatting', () => {
  it('percent is floor(100 × (1 − out/in)), kept within 1–100', () => {
    expect(reductionPercent(1000, 105)).toBe(89);
    expect(reductionPercent(1000, 999)).toBe(1);
    expect(reductionPercent(1000, 0)).toBe(100);
    expect(reductionPercent(1000, 2000)).toBe(1);
  });

  it('"12.4 MB → 1.3 MB"', () => {
    expect(sizeChange(12.4 * MB, 1.3 * MB)).toBe('12.4 MB → 1.3 MB');
  });

  it('file names: _압축 / _이미지변환, sanitized, at most 80 characters', () => {
    expect(compressedFileName('건축허가신청서.pdf', false)).toBe('건축허가신청서_압축.pdf');
    expect(compressedFileName('scan.PDF', true)).toBe('scan_이미지변환.pdf');
    expect(compressedFileName('a/b:c?.pdf', false)).toBe('abc_압축.pdf');
    const long = compressedFileName(`${'가'.repeat(120)}.pdf`, true);
    expect(Array.from(long).length).toBe(80);
    expect(long.endsWith('_이미지변환.pdf')).toBe(true);
  });
});

describe('content tokenizer', () => {
  it('a 1 MB token does not blow the stack and is truncated', () => {
    const big = new TextEncoder().encode(`q ${'A'.repeat(1024 * 1024)} Q`);
    const ops = [...contentOps(big)];
    expect(ops.map((o) => o.op.length)).toEqual([1, MAX_TOKEN_BYTES, 1]);
  });

  it('stops at the byte limit', () => {
    const ops = [...contentOps(new TextEncoder().encode('q 1 0 0 1 0 0 cm Q'), 4)];
    expect(ops.map((o) => o.op)).toEqual(['q']);
  });
});

describe('vendored qpdf path', () => {
  it('copy-vendor and the worker agree on the versioned directory', () => {
    const script = readFileSync(join(__dirname, '..', '..', 'scripts', 'copy-vendor.mjs'), 'utf8');
    expect(script).toContain(`const QPDF_VENDOR_DIR = '${QPDF_VENDOR_DIR}';`);
  });
});

describe('qpdf run (console capture)', () => {
  const fakeModule = (): QpdfModule => ({
    FS: { writeFile: () => undefined, readFile: () => new Uint8Array([1]) },
    callMain: () => 0,
  });

  it('restores console.log and console.error when the factory throws', async () => {
    const { log, error } = console;
    const factory: QpdfFactory = () => {
      throw new Error('factory failed');
    };
    await expect(runQpdf(factory, undefined, [], new Uint8Array())).rejects.toThrow('factory failed');
    expect(console.log).toBe(log);
    expect(console.error).toBe(error);
  });

  it(`captures what the glue binds at factory time, capped at ${MAX_LOG_LINES} lines, and restores the console`, async () => {
    const { log, error } = console;
    let out: (...a: unknown[]) => void = () => undefined;
    const factory: QpdfFactory = () => {
      // Like the Emscripten glue: bind console.log once, synchronously, inside the factory.
      out = console.log.bind(console);
      return Promise.resolve({
        ...fakeModule(),
        callMain: () => {
          for (let i = 0; i < 500; i++) out(`warning ${i}`);
          return 3;
        },
      });
    };
    const r = await runQpdf(factory, undefined, ['in.pdf', 'out.pdf'], new Uint8Array());
    expect(console.log).toBe(log);
    expect(console.error).toBe(error);
    expect(r.code).toBe(3);
    expect(r.logs).toHaveLength(MAX_LOG_LINES);
    expect(r.logs[0]).toBe('warning 0');
  });
});
