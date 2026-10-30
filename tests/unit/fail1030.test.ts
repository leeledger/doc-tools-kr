// FAIL1030 (handoff/ARCHITECT-BRIEF-FAIL1030.md test map): the wrong-file help of the photo and PDF tools (E), the
// PDF 용량 줄이기 → PDF 나누기 step (B) and the usage whitelist of every new fail code.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it, vi } from 'vitest';
import { onRequest as usageFn } from '../../functions/api/usage';
import { CODE_RE, FAIL_LABELS, validate } from '../../scripts/lib/usage.mjs';
import { WRONG_LINKS, WRONG_TEXT, wrongFile, wrongFileHelp, wrongGroup, type WrongGroup } from '../../src/lib/file/wrong-file';
import { MB } from '../../src/lib/ui/device';
import { checkFileBytes, LIMITS } from '../../src/tools/pdf-compress/limits';
import { KO } from '../../src/tools/pdf-compress/messages.ko';
import { LIMITS as SPLIT_LIMITS } from '../../src/tools/pdf-split/limits';
import { cfbNotHwp, docxLikeZip, hwpFixture } from '../helpers/hwp';

const fixture = (...p: string[]): Uint8Array => new Uint8Array(readFileSync(join(process.cwd(), 'tests', 'fixtures', ...p)));
const file = (bytes: Uint8Array, name: string): File => new File([bytes as Uint8Array<ArrayBuffer>], name);
const JARGON = /업로드|서버|브라우저|네트워크|메모리|(?<![A-Za-z])(?:px|dpi|exif)(?![A-Za-z])/i;

const NEW_CODES = [
  'cloud-copy-canvas',
  'cloud-copy-blob',
  'cloud-copy-size',
  'cloud-copy-meta',
  'not-hwp-empty',
  'not-hwp-unread',
  'not-hwp-old',
  'not-hwp-hwpml',
  'not-image-pdf',
  'not-image-hwp',
  'not-image-doc',
  'not-image-other',
  'not-pdf-img',
  'not-pdf-hwp',
  'not-pdf-other',
];

describe('wrong file in a photo or PDF tool (E)', () => {
  const cases: [string, Uint8Array, WrongGroup][] = [
    ['scan.jpg', fixture('gen_already_small.pdf'), 'pdf'],
    ['photo.pdf', fixture('photo', 'scene_cc0.jpg'), 'image'],
    ['notice.hwp', hwpFixture('law05.hwp'), 'hwp'],
    ['notice.hwpx', hwpFixture('adm14.hwpx'), 'hwp'],
    ['word.docx', docxLikeZip(), 'doc'],
    ['old.doc', cfbNotHwp(), 'doc'],
    ['notes.txt', strToU8('회의 메모\n'), 'other'],
    ['archive.zip', zipSync({ 'a.txt': strToU8('a') }), 'other'],
    ['noise.bin', Uint8Array.from({ length: 4096 }, (_, i) => (i * 7919) & 255), 'other'],
  ];

  it.each(cases)('%s is %s', async (name, bytes, group) => {
    const image = await wrongFile(file(bytes, name), 'image');
    const pdf = await wrongFile(file(bytes, name), 'pdf');
    expect(image).toEqual(wrongFileHelp(group, 'image'));
    expect(pdf).toEqual(wrongFileHelp(group, 'pdf', group === 'image' ? 'image/jpeg' : undefined));
  });

  it('photo tools: a PDF → PDF JPG 변환, a 한글 문서 → HWP PDF 변환, anything else keeps the tool line', () => {
    expect(wrongFileHelp('pdf', 'image')).toEqual({ code: 'not-image-pdf', text: WRONG_TEXT.pdfInImage, action: { kind: 'link', ...WRONG_LINKS.pdfToJpg } });
    expect(wrongFileHelp('hwp', 'image')).toEqual({ code: 'not-image-hwp', text: WRONG_TEXT.hwpInImage, action: { kind: 'link', ...WRONG_LINKS.hwpToPdf } });
    expect(wrongFileHelp('doc', 'image')).toEqual({ code: 'not-image-doc', text: null, action: null });
    expect(wrongFileHelp('other', 'image')).toEqual({ code: 'not-image-other', text: null, action: null });
    // A photo the tool's own check refused (an odd format) is not named a PDF or anything else.
    expect(wrongFileHelp('image', 'image')).toEqual({ code: 'not-image-other', text: null, action: null });
    expect(WRONG_LINKS).toEqual({ pdfToJpg: { href: '/pdf-to-jpg/', label: 'PDF JPG 변환' }, hwpToPdf: { href: '/hwp-to-pdf/', label: 'HWP PDF 변환' } });
  });

  it('PDF tools: a photo → 「사진 PDF 변환으로 열기」 with its type, a 한글 문서 → HWP PDF 변환, anything else keeps the tool line', () => {
    expect(wrongFileHelp('image', 'pdf', 'image/png')).toEqual({ code: 'not-pdf-img', text: WRONG_TEXT.imageInPdf, action: { kind: 'photo', label: '사진 PDF 변환으로 열기', type: 'image/png' } });
    expect(wrongFileHelp('hwp', 'pdf')).toEqual({ code: 'not-pdf-hwp', text: WRONG_TEXT.hwpInPdf, action: { kind: 'link', ...WRONG_LINKS.hwpToPdf } });
    for (const g of ['pdf', 'doc', 'other'] as const) expect(wrongFileHelp(g, 'pdf')).toEqual({ code: 'not-pdf-other', text: null, action: null });
  });

  it('the lines, word for word (brief E; 합니다체, plain language)', () => {
    expect(WRONG_TEXT).toEqual({
      pdfInImage: 'PDF 파일입니다. 이 도구는 사진만 엽니다. PDF 쪽을 사진으로 바꾸려면 PDF JPG 변환을 이용하세요.',
      imageInPdf: '사진 파일입니다. 먼저 PDF로 만들어 주세요.',
      hwpInPdf: '한글 문서입니다. HWP PDF 변환으로 PDF를 만든 뒤 다시 골라 주세요.',
      hwpInImage: '한글 문서입니다. 이 도구는 사진만 엽니다. 한글 문서를 PDF로 바꾸려면 HWP PDF 변환을 이용하세요.',
    });
    for (const t of Object.values(WRONG_TEXT)) expect(t).not.toMatch(JARGON);
  });

  it('a CFB is a 한글 문서 only by its .hwp name (an old .doc is a CFB too); HWPX, HWP 3 and HWPML always are', () => {
    expect(wrongGroup('hwp', 'a.HWP')).toBe('hwp');
    expect(wrongGroup('hwp', 'a.doc')).toBe('doc');
    for (const f of ['hwpx', 'hwp3', 'hwpml'] as const) expect(wrongGroup(f, 'x')).toBe('hwp');
    for (const f of ['docx', 'xlsx', 'pptx', 'office-old'] as const) expect(wrongGroup(f, 'x')).toBe('doc');
    for (const f of ['text', 'zip', 'other'] as const) expect(wrongGroup(f, 'x')).toBe('other');
  });

  it('a file that cannot be read is other: the tool keeps its line', async () => {
    const gone = { size: 10, name: 'x.pdf', slice: () => ({ arrayBuffer: () => Promise.reject(new DOMException('gone', 'NotReadableError')) }) } as unknown as File;
    expect(await wrongFile(gone, 'image')).toEqual({ code: 'not-image-other', text: null, action: null });
    expect(await wrongFile(gone, 'pdf')).toEqual({ code: 'not-pdf-other', text: null, action: null });
  });
});

describe('PDF 용량 줄이기 over its limit → PDF 나누기 (B)', () => {
  for (const device of ['mobile', 'desktop'] as const) {
    const hard = LIMITS[device].hardBytes;
    const split = SPLIT_LIMITS[device].maxFileBytes;
    it(`${device}: just over ${hard / MB} MB → the split line and button; over ${split / MB} MB → the old line, no button`, () => {
      expect(checkFileBytes(hard, device, KO.limits)).toEqual({ level: 'ok' });
      const fits = checkFileBytes(hard + 1, device, KO.limits);
      expect(fits).toEqual({ level: 'hard', split: true, message: KO.limits.split!.fileBytes(hard, device) });
      expect(checkFileBytes(split, device, KO.limits)).toMatchObject({ split: true });
      const over = checkFileBytes(split + 1, device, KO.limits);
      expect(over).toEqual({ level: 'hard', message: KO.limits.fileBytes(hard, device) });
    });
  }

  it('the lines (brief B, 합니다체); a phone over both limits is pointed to a computer', () => {
    expect(KO.limits.split!.fileBytes(50 * MB, 'mobile')).toBe('휴대폰에서는 50 MB까지 줄일 수 있습니다. 쪽을 나눠 작은 파일 몇 개로 만든 뒤 하나씩 줄여 보세요.');
    expect(KO.limits.split!.button).toBe('PDF 나누기로 열기');
    expect(KO.limits.fileBytes(50 * MB, 'mobile')).toBe('휴대폰에서는 50 MB까지 줄일 수 있습니다. 이 기기에서 처리하기에 너무 커서 화면이 멈출 수 있기 때문입니다. 컴퓨터에서 해 보세요.');
    expect(KO.limits.fileBytes(100 * MB, 'desktop')).toBe('이 기기에서는 100 MB까지 줄일 수 있습니다. 이 기기에서 처리하기에 너무 커서 화면이 멈출 수 있기 때문입니다.');
  });

  it('a catalog without the split step (English) keeps its line and offers no button', async () => {
    const { EN } = await import('../../src/i18n/en/tools/pdf-compress');
    expect('split' in EN.limits).toBe(false);
    expect(checkFileBytes(LIMITS.mobile.hardBytes + 1, 'mobile', EN.limits)).toEqual({ level: 'hard', message: EN.limits.fileBytes(LIMITS.mobile.hardBytes, 'mobile') });
  });

  it('the limits themselves are unchanged (brief B: LIMITS not touched)', () => {
    expect([LIMITS.mobile.hardBytes, LIMITS.desktop.hardBytes]).toEqual([50 * MB, 100 * MB]);
    expect([SPLIT_LIMITS.mobile.maxFileBytes, SPLIT_LIMITS.desktop.maxFileBytes]).toEqual([100 * MB, 500 * MB]);
  });
});

describe('usage: every new fail code is labelled and accepted', () => {
  const BASE = { e: 'fail', p: 'parse', via: 'direct', d: 'mobile', b: 'dev', w: 1 };
  it.each(NEW_CODES)('%s', async (c) => {
    expect(c).toMatch(CODE_RE);
    expect(Object.hasOwn(FAIL_LABELS, c), c).toBe(true);
    const t = c.startsWith('cloud-') ? 'remove-background' : c.startsWith('not-hwp') ? 'hwp-viewer' : c.startsWith('not-image') ? 'id-photo' : 'pdf-sign';
    const text = JSON.stringify({ ...BASE, t, c, p: c.startsWith('cloud-') ? 'process' : 'parse' });
    expect(validate(text), c).not.toBeNull();
    const writeDataPoint = vi.fn();
    const headers = new Headers({ 'sec-fetch-site': 'same-origin', 'content-type': 'text/plain;charset=UTF-8', 'content-length': String(new TextEncoder().encode(text).length), 'user-agent': 'Mozilla/5.0 Chrome/131.0' });
    const res = await usageFn({ request: new Request('https://docttak.com/api/usage', { method: 'POST', headers, body: text }), env: { USAGE: { writeDataPoint } } });
    expect(res.status, c).toBe(204);
    expect(writeDataPoint).toHaveBeenCalledTimes(1);
  });
});
