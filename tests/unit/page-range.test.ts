// Page range parser (TOOLS4 T0): valid, edge and invalid inputs.
import { describe, expect, it } from 'vitest';
import { parseRange } from '../../src/lib/pdf/page-range';

const pages = (text: string, n = 10): number[] => {
  const r = parseRange(text, n);
  if (!r.ok) throw new Error(`expected pages for "${text}", got ${r.error}`);
  return r.pages;
};
const error = (text: string, n = 10): string => {
  const r = parseRange(text, n);
  if (r.ok) throw new Error(`expected an error for "${text}", got ${r.pages.join(',')}`);
  return r.error;
};

describe('parseRange', () => {
  it('reads spans and single pages, sorted and unique', () => {
    expect(pages('1-3, 5')).toEqual([1, 2, 3, 5]);
    expect(pages('5, 1-3')).toEqual([1, 2, 3, 5]);
    expect(pages('2-4,3-6,4')).toEqual([2, 3, 4, 5, 6]);
    expect(pages('7')).toEqual([7]);
  });

  it('accepts spaces, other dashes, full-width commas and space separators', () => {
    expect(pages(' 1 - 3 ,  5 ')).toEqual([1, 2, 3, 5]);
    expect(pages('1~3')).toEqual([1, 2, 3]);
    expect(pages('1–3，8')).toEqual([1, 2, 3, 8]);
    expect(pages('1 3 5')).toEqual([1, 3, 5]);
    expect(pages('1,,3,')).toEqual([1, 3]);
  });

  it('edges: first and last page, a one-page span, a one-page document', () => {
    expect(pages('1-10')).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(pages('10')).toEqual([10]);
    expect(pages('4-4')).toEqual([4]);
    expect(pages('1', 1)).toEqual([1]);
    expect(pages('007')).toEqual([7]);
  });

  it('empty input', () => {
    expect(error('')).toBe('empty');
    expect(error('   ')).toBe('empty');
    expect(error(' , ,')).toBe('empty');
  });

  it('out of range', () => {
    expect(error('0')).toBe('out-of-range');
    expect(error('11')).toBe('out-of-range');
    expect(error('9-11')).toBe('out-of-range');
    expect(error('0-2')).toBe('out-of-range');
    expect(error('9', 3)).toBe('out-of-range');
  });

  it('reversed span', () => {
    expect(error('5-3')).toBe('reversed');
    expect(error('1, 9-2')).toBe('reversed');
  });

  it('junk', () => {
    expect(error('a')).toBe('junk');
    expect(error('1-')).toBe('junk');
    expect(error('-3')).toBe('junk');
    expect(error('1-2-3')).toBe('junk');
    expect(error('1.5')).toBe('junk');
    expect(error('3쪽')).toBe('junk');
    expect(error('-1')).toBe('junk');
  });
});
