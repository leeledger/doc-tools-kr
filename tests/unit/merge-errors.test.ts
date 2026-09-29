// `unknown` mapping of merge failures (Step 1 review follow-up), via the exported withFileIndex seam.
import { describe, expect, it } from 'vitest';
import { PdfCorruptError, PdfError, errorCode } from '../../src/lib/pdf/errors';
import { withFileIndex } from '../../src/lib/pdf/mergePlus';

describe('withFileIndex', () => {
  it('turns a TypeError into PdfError(unknown) with the file index', () => {
    const e = withFileIndex(new TypeError('x is undefined'), 3);
    expect(e).toBeInstanceOf(PdfError);
    expect((e as PdfError).code).toBe('unknown');
    expect((e as PdfError).fileIndex).toBe(3);
    expect(errorCode(e)).toBe('unknown');
  });

  it('keeps a PdfCorruptError as corrupt and adds the file index', () => {
    const src = new PdfCorruptError('bad xref');
    const e = withFileIndex(src, 1);
    expect(e).toBe(src);
    expect((e as PdfError).code).toBe('corrupt');
    expect((e as PdfError).fileIndex).toBe(1);
    expect(errorCode(e)).toBe('corrupt');
  });

  it('returns an allocation failure unchanged (the OOM path)', () => {
    const oom = new RangeError('Array buffer allocation failed');
    const e = withFileIndex(oom, 0);
    expect(e).toBe(oom);
    expect((e as { fileIndex?: number }).fileIndex).toBeUndefined();
    expect(errorCode(e)).toBe('oom');
  });
});
