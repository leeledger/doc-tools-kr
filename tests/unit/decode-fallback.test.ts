// decodeImage hardening (REQ1014-B D11, test map "decode.ts"): a decode that rejects only with the resize options
// falls through to the plain decode + canvas shrink; a plain decode failure is corrupt, or heic for a HEIC sniff.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodeImage } from '../../src/lib/image/decode';
import { PhotoError } from '../../src/lib/image/messages';
import type { Sniff } from '../../src/lib/image/sniff';

const sniff = (format: Sniff['format'], width = 4000, height = 3000): Sniff => ({
  format,
  width,
  height,
  hasGps: false,
  hasExif: false,
  hasXmp: false,
  cmyk: false,
  progressive: false,
  animated: false,
  alphaPossible: false,
  truncated: false,
});

const bitmap = (width: number, height: number) => ({ width, height, close: vi.fn() });

/** createImageBitmap stand-in: `withResize` / `plain` decide each call; a canvas source gives its own size. */
function stub(withResize: () => unknown, plain: () => unknown) {
  const calls: string[] = [];
  vi.stubGlobal('createImageBitmap', async (src: unknown, opts?: ImageBitmapOptions) => {
    if (src instanceof FakeCanvas) {
      calls.push('canvas');
      return bitmap(src.width, src.height);
    }
    if (opts?.resizeWidth) {
      calls.push('resize');
      return withResize();
    }
    calls.push('plain');
    return plain();
  });
  vi.stubGlobal('OffscreenCanvas', FakeCanvas);
  return calls;
}

class FakeCanvas {
  constructor(
    public width: number,
    public height: number,
  ) {}
  getContext() {
    return { imageSmoothingEnabled: false, imageSmoothingQuality: 'low', drawImage: () => undefined };
  }
}

afterEach(() => vi.unstubAllGlobals());

describe('decodeImage (D11)', () => {
  it('resize option rejected (non-RangeError) -> plain decode + shrink succeeds', async () => {
    const calls = stub(
      () => Promise.reject(new DOMException('The source image could not be decoded.', 'InvalidStateError')),
      () => bitmap(4000, 3000),
    );
    const d = await decodeImage(new Blob(['x']), sniff('jpeg'), { maxLongEdge: 2000 });
    expect(calls).toEqual(['resize', 'plain', 'canvas']);
    expect([d.width, d.height, d.sourceWidth, d.sourceHeight, d.capped]).toEqual([2000, 1500, 4000, 3000, true]);
  });

  it('both decodes reject -> corrupt; a HEIC sniff -> heic', async () => {
    const reject = () => Promise.reject(new DOMException('bad', 'InvalidStateError'));
    stub(reject, reject);
    await expect(decodeImage(new Blob(['x']), sniff('jpeg'), { maxLongEdge: 2000 })).rejects.toMatchObject({ code: 'corrupt' });
    await expect(decodeImage(new Blob(['x']), sniff('heic'), { maxLongEdge: 2000 })).rejects.toMatchObject({ code: 'heic' });
    await expect(decodeImage(new Blob(['x']), sniff('jpeg'), { maxLongEdge: 2000 })).rejects.toBeInstanceOf(PhotoError);
  });

  it('a RangeError on the resize decode is not retried (out of memory goes up as it is)', async () => {
    const calls = stub(() => Promise.reject(new RangeError('Out of memory')), () => bitmap(4000, 3000));
    await expect(decodeImage(new Blob(['x']), sniff('jpeg'), { maxLongEdge: 2000 })).rejects.toBeInstanceOf(RangeError);
    expect(calls).toEqual(['resize']);
  });

  it('the resize decode working is unchanged (one call)', async () => {
    const calls = stub(() => bitmap(2000, 1500), () => bitmap(4000, 3000));
    const d = await decodeImage(new Blob(['x']), sniff('jpeg'), { maxLongEdge: 2000 });
    expect(calls).toEqual(['resize']);
    expect([d.width, d.height]).toEqual([2000, 1500]);
  });
});
