// REQ1014-A D17 / REQ1014-B D1: what a picked file really is (sniffFormat) and the usage fail codes built from it.
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { CODE_RE, FAIL_LABELS } from '../../scripts/lib/usage.mjs';
import { corruptCode, notHwpCode, sniffFormat, type FileFamily } from '../../src/lib/file/sniff-format';
import type { ImageFormat } from '../../src/lib/image/sniff';

const bytes = (...parts: (string | number[])[]): Uint8Array =>
  new Uint8Array(parts.flatMap((p) => (typeof p === 'string' ? Array.from(strToU8(p)) : p)));
const pad = (b: Uint8Array, n = 1024): Uint8Array => {
  const out = new Uint8Array(Math.max(n, b.length));
  out.set(b);
  return out;
};
/** Head and tail the way a caller reads them: first 1 KB, last 64 KB. */
const sniffWhole = (b: Uint8Array): FileFamily => sniffFormat(b.subarray(0, 1024), b.subarray(Math.max(0, b.length - 65536)));

const ALL_FAMILIES: FileFamily[] = ['pdf', 'image', 'hwp', 'office-old', 'hwpx', 'docx', 'xlsx', 'pptx', 'zip', 'text', 'hwp3', 'hwpml', 'other'];
const ALL_IMAGE_FORMATS: ImageFormat[] = ['jpeg', 'png', 'webp', 'gif', 'bmp', 'avif', 'heic', 'tiff', 'unknown'];

describe('sniffFormat', () => {
  it('PDF: %PDF- within the first 1,024 bytes, not after', () => {
    expect(sniffFormat(bytes('%PDF-1.7\n'))).toBe('pdf');
    expect(sniffFormat(pad(bytes([0, 1, 2, 3], '%PDF-1.4')))).toBe('pdf');
    const late = new Uint8Array(1100);
    late.set(strToU8('%PDF-1.4'), 1050);
    expect(sniffFormat(late)).toBe('other');
  });

  it('images by their magic bytes', () => {
    expect(sniffFormat(bytes([0xff, 0xd8, 0xff, 0xe0, 0, 16]))).toBe('image');
    expect(sniffFormat(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image');
    expect(sniffFormat(bytes([0, 0, 0, 24], 'ftypheic', [0, 0, 0, 0], 'mif1heic'))).toBe('image');
    expect(sniffFormat(bytes('RIFF', [0, 0, 0, 0], 'WEBPVP8 '))).toBe('image');
  });

  it('CFB is hwp (the caller makes it office-old after the worker said not-hwp)', () => {
    expect(sniffFormat(pad(bytes([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])))).toBe('hwp');
  });

  it('HWP 3.0 and HWPML', () => {
    expect(sniffFormat(pad(bytes('HWP Document File V3.00 \x1a\x01\x02\x03\x04\x05')))).toBe('hwp3');
    expect(sniffFormat(bytes('<?xml version="1.0" encoding="UTF-8"?><HWPML Version="2.8">'))).toBe('hwpml');
  });

  it('ZIP: hwpx by its stored mimetype, docx/xlsx/pptx by central-directory names in the tail, else zip', () => {
    const hwpx = zipSync({ mimetype: [strToU8('application/hwp+zip'), { level: 0 }], 'Contents/section0.xml': strToU8('<a/>') });
    expect(sniffWhole(hwpx)).toBe('hwpx');
    expect(sniffFormat(hwpx.subarray(0, 1024))).toBe('hwpx');
    const docx = zipSync({ '[Content_Types].xml': strToU8('<Types/>'), 'word/document.xml': strToU8('<w/>') });
    expect(sniffWhole(docx)).toBe('docx');
    expect(sniffWhole(zipSync({ '[Content_Types].xml': strToU8('<T/>'), 'xl/workbook.xml': strToU8('<x/>') }))).toBe('xlsx');
    expect(sniffWhole(zipSync({ '[Content_Types].xml': strToU8('<T/>'), 'ppt/presentation.xml': strToU8('<p/>') }))).toBe('pptx');
    expect(sniffWhole(zipSync({ 'a.txt': strToU8('hello') }))).toBe('zip');
    expect(sniffWhole(zipSync({ mimetype: [strToU8('application/epub+zip'), { level: 0 }], 'b.txt': strToU8('x') }))).toBe('zip');
    // No tail: a docx cannot be told from any other zip.
    expect(sniffFormat(docx.subarray(0, 1024))).toBe('zip');
  });

  it('a partial tail (cut through a record) still finds the names before the cut', () => {
    const docx = zipSync({ '[Content_Types].xml': strToU8('<Types/>'), 'word/document.xml': strToU8('<w/>'), 'z.bin': strToU8('z') });
    expect(sniffFormat(docx.subarray(0, 1024), docx.subarray(0, docx.length - 30))).toBe('docx');
    expect(sniffFormat(docx.subarray(0, 64), new Uint8Array(0))).toBe('zip');
  });

  it('text: UTF-8 (Korean included) and UTF-16 with a BOM; binary noise is other', () => {
    expect(sniffFormat(strToU8('안녕하세요. 문서딱 메모입니다.\r\n두 번째 줄\tTAB'))).toBe('text');
    const u16 = new Uint8Array([0xff, 0xfe, ...Array.from('hello text', (c) => [c.charCodeAt(0), 0]).flat()]);
    expect(sniffFormat(u16)).toBe('text');
    const noise = new Uint8Array(512).map((_, i) => (i * 97 + 13) % 256);
    expect(sniffFormat(noise)).toBe('other');
    expect(sniffFormat(bytes('abc', [0], 'defghijkl'))).toBe('other');
  });

  it('empty, tiny and odd inputs give other and never throw', () => {
    expect(sniffFormat(new Uint8Array(0))).toBe('other');
    expect(sniffFormat(new Uint8Array(3))).toBe('other');
    expect(sniffFormat(undefined as unknown as Uint8Array)).toBe('other');
    expect(sniffFormat(bytes([0x50, 0x4b, 0x03, 0x04, 1]))).toBe('zip');
  });
});

describe('notHwpCode / corruptCode', () => {
  const codes = [...ALL_FAMILIES.map(notHwpCode), ...ALL_IMAGE_FORMATS.map(corruptCode)];

  it('maps every family and image format as the brief lists', () => {
    expect(Object.fromEntries(ALL_FAMILIES.map((f) => [f, notHwpCode(f)]))).toEqual({
      pdf: 'not-hwp-pdf',
      image: 'not-hwp-img',
      hwp: 'not-hwp-cfb',
      'office-old': 'not-hwp-cfb',
      hwpx: 'not-hwp-hwpx',
      docx: 'not-hwp-docx',
      xlsx: 'not-hwp-office',
      pptx: 'not-hwp-office',
      zip: 'not-hwp-zip',
      text: 'not-hwp-text',
      hwp3: 'not-hwp-other',
      hwpml: 'not-hwp-other',
      other: 'not-hwp-other',
    });
    expect(Object.fromEntries(ALL_IMAGE_FORMATS.map((f) => [f, corruptCode(f)]))).toEqual({
      jpeg: 'corrupt-jpg',
      png: 'corrupt-png',
      webp: 'corrupt-webp',
      heic: 'corrupt-heic',
      gif: 'corrupt-other',
      bmp: 'corrupt-other',
      avif: 'corrupt-other',
      tiff: 'corrupt-other',
      unknown: 'corrupt-other',
    });
  });

  it('every code passes the usage CODE_RE (at most 24 chars) and has an admin label', () => {
    for (const c of codes) {
      expect(c.length).toBeLessThanOrEqual(24);
      expect(c).toMatch(CODE_RE);
      expect(Object.hasOwn(FAIL_LABELS, c), c).toBe(true);
    }
  });
});
