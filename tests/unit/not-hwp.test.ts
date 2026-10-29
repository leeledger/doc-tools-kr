// 본 제품은 한컴의 HWP 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.
// "Not a HWP file" help (REQ1014-B D2-D4, test map "not-hwp"): every family × the three tools gives its line, next
// step and usage code; a CFB the worker refused is old Office; a read failure is the generic line; plain language.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { CODE_RE } from '../../scripts/lib/usage.mjs';
import { familyOf, helpText, notHwpHelp, type Family, type NotHwpTool } from '../../src/tools/hwp-shared/not-hwp';
import { ERRORS } from '../../src/tools/hwp-shared/messages';
import { HX_COPY } from '../../src/tools/hwpx-to-hwp/copy';
import { cfbNotHwp, docxLikeZip, hwpFixture, plainZip, xlsxLikeZip } from '../helpers/hwp';

const fixture = (...p: string[]): Uint8Array => new Uint8Array(readFileSync(join(process.cwd(), 'tests', 'fixtures', ...p)));
const file = (bytes: Uint8Array, name: string): File => new File([bytes as Uint8Array<ArrayBuffer>], name);
const TOOLS: NotHwpTool[] = ['hwp-viewer', 'hwp-to-pdf', 'hwpx-to-hwp'];
const FAMILIES: Family[] = ['pdf', 'docx', 'xlsx', 'pptx', 'office-old', 'zip', 'image', 'text', 'empty', 'unread', 'other'];
const SECURE = '한글 문서로 읽을 수 없는 파일입니다. 회사·기관에서 받은 보안 문서라면 보낸 곳에 PDF로 요청해 주세요.';
const SECURE_HX = '한글 문서로 읽을 수 없는 파일이에요. 회사·기관에서 받은 보안 문서라면 보낸 곳에 PDF로 요청해 주세요.';
const JARGON = /업로드|서버|브라우저|네트워크|메모리|(?<![A-Za-z])(?:px|dpi|exif)(?![A-Za-z])/i;

/** A .pptx whose central directory sits past the first 64 KB: a stored `front`-byte entry first (only the tail names it). */
function bigPptx(front: number): Uint8Array {
  return zipSync({ '[Content_Types].xml': [new Uint8Array(front).fill(32), { level: 0 }], 'ppt/presentation.xml': strToU8('<p/>') });
}

describe('notHwpHelp: what the file is, per tool', () => {
  const cases: [string, Uint8Array, 'cfb' | 'zip' | null, Family, string, 'pdf' | 'image' | null][] = [
    ['report-pdf.hwp', fixture('gen_already_small.pdf'), null, 'pdf', 'not-hwp-pdf', 'pdf'],
    ['photo.hwp', fixture('photo', 'scene_cc0.jpg'), null, 'image', 'not-hwp-img', 'image'],
    ['word.docx', docxLikeZip(), 'zip', 'docx', 'not-hwp-docx', null],
    ['sheet.xlsx', xlsxLikeZip(), 'zip', 'xlsx', 'not-hwp-office', null],
    ['deck.pptx', bigPptx(100_000), 'zip', 'pptx', 'not-hwp-office', null],
    ['archive.zip', plainZip(), 'zip', 'zip', 'not-hwp-zip', null],
    ['old-office.hwp', cfbNotHwp(), 'cfb', 'office-old', 'not-hwp-cfb', null],
    ['notes.txt', strToU8('회의 메모: 한글 문서가 아닙니다.\n'), null, 'text', 'not-hwp-text', null],
    ['noise.hwp', Uint8Array.from({ length: 4096 }, (_, i) => (i * 7919) & 255), null, 'other', 'not-hwp-other', null],
    ['empty.hwp', new Uint8Array(0), null, 'empty', 'not-hwp-empty', null],
    ['three.hwp', Uint8Array.from([0x48, 0x57, 0x50]), null, 'empty', 'not-hwp-empty', null],
    ['old.hwp', strToU8('HWP Document File V3.00 \x1a\x01\x02\x03\x04\x05'), null, 'other', 'not-hwp-old', null],
  ];
  for (const tool of TOOLS) {
    it.each(cases)(`${tool}: %s`, async (name, bytes, said, family, code, action) => {
      const h = await notHwpHelp(file(bytes, name), tool, said);
      expect(h.code).toBe(code);
      expect(h.action).toBe(action);
      expect(h.text).toBe(helpText(family, tool));
    });
  }

  it('a CFB the page sniff never sent to the worker is not called old Office; HWPX the worker refused is the generic line', async () => {
    expect((await notHwpHelp(file(hwpFixture('law05.hwp'), 'x.hwp'), 'hwp-viewer', null)).text).toBe(SECURE);
    const hwpx = await notHwpHelp(file(hwpFixture('adm14.hwpx'), 'x.hwpx'), 'hwp-viewer', 'zip');
    expect([hwpx.code, hwpx.text, hwpx.action]).toEqual(['not-hwp-hwpx', SECURE, null]);
  });

  it('a file that cannot be read: the 손상 line, not-hwp-unread (FAIL1030 D)', async () => {
    const gone = { size: 10, name: 'x.hwp', slice: () => ({ arrayBuffer: () => Promise.reject(new DOMException('gone', 'NotReadableError')) }) } as unknown as File;
    for (const tool of TOOLS) {
      const h = await notHwpHelp(gone, tool, null);
      expect(h).toMatchObject({ code: 'not-hwp-unread', action: null, text: helpText('unread', tool) });
    }
    expect(helpText('unread', 'hwp-viewer')).toBe(ERRORS.corrupt);
  });
});

describe('the lines (brief D3, word for word)', () => {
  it('/hwp-viewer/ and /hwp-to-pdf/ (합니다체)', () => {
    const pick = '한글 문서라면 .hwp 또는 .hwpx 파일을 골라 주세요.';
    expect(helpText('pdf', 'hwp-viewer')).toBe('PDF 파일입니다. PDF는 휴대폰·컴퓨터에서 바로 열 수 있습니다.');
    expect(helpText('pdf', 'hwp-to-pdf')).toBe('이미 PDF 파일입니다. 바꾸지 않아도 됩니다.');
    for (const tool of ['hwp-viewer', 'hwp-to-pdf'] as const) {
      expect(helpText('docx', tool)).toBe(`워드 파일(.docx)입니다. ${pick}`);
      expect(helpText('xlsx', tool)).toBe(`엑셀 파일(.xlsx)입니다. ${pick}`);
      expect(helpText('pptx', tool)).toBe(`파워포인트 파일(.pptx)입니다. ${pick}`);
      expect(helpText('office-old', tool)).toBe(`워드·엑셀 같은 다른 프로그램의 파일입니다. ${pick}`);
      expect(helpText('zip', tool)).toBe('압축 파일(ZIP)입니다. 압축을 푼 뒤 안에 있는 .hwp 또는 .hwpx 파일을 골라 주세요.');
      expect(helpText('image', tool)).toBe('사진 파일입니다. 사진을 PDF로 만들려면 아래 버튼을 누르세요.');
      expect(helpText('text', tool)).toBe(`글자만 있는 파일입니다. ${pick}`);
      expect(helpText('empty', tool)).toBe('빈 파일입니다. 파일을 다시 내려받은 뒤 시도해 주세요.');
      expect(helpText('other', tool)).toBe(SECURE);
    }
  });
  it('/hwpx-to-hwp/ (해요체)', () => {
    const pick = '확장자가 .hwpx인 한글 파일을 골라 주세요.';
    expect(helpText('pdf', 'hwpx-to-hwp')).toBe('PDF 파일이에요. HWP로 바꿀 필요 없이 바로 열 수 있어요.');
    expect(helpText('docx', 'hwpx-to-hwp')).toBe(`워드 파일(.docx)이에요. ${pick}`);
    expect(helpText('xlsx', 'hwpx-to-hwp')).toBe(`엑셀 파일(.xlsx)이에요. ${pick}`);
    expect(helpText('pptx', 'hwpx-to-hwp')).toBe(`파워포인트 파일(.pptx)이에요. ${pick}`);
    expect(helpText('office-old', 'hwpx-to-hwp')).toBe(`워드·엑셀 같은 다른 프로그램의 파일이에요. ${pick}`);
    expect(helpText('zip', 'hwpx-to-hwp')).toBe('압축 파일(ZIP)이에요. 압축을 푼 뒤 안에 있는 .hwpx 파일을 골라 주세요.');
    expect(helpText('image', 'hwpx-to-hwp')).toBe('사진 파일이에요. 사진을 PDF로 만들려면 아래 버튼을 누르세요.');
    expect(helpText('text', 'hwpx-to-hwp')).toBe(HX_COPY.notHwpx);
    expect(helpText('empty', 'hwpx-to-hwp')).toBe('빈 파일이에요. 파일을 다시 내려받은 뒤 시도해 주세요.');
    expect(helpText('unread', 'hwpx-to-hwp')).toBe('문서가 손상되었거나 끝까지 내려받아지지 않았어요. 파일을 다시 내려받은 뒤 시도해 주세요.');
    expect(helpText('other', 'hwpx-to-hwp')).toBe(SECURE_HX);
  });
  it('every line: two sentences, plain language', () => {
    for (const tool of TOOLS)
      for (const f of FAMILIES) {
        const t = helpText(f, tool);
        expect(t, `${tool} ${f}`).not.toMatch(JARGON);
        expect(t.split(/(?<=\.)\s/).length, `${tool} ${f}: ${t}`).toBe(2);
      }
  });
});

describe('helpers', () => {
  it('familyOf: a CFB is old Office only when the worker refused it; HWPX, HWP3 and HWPML get the generic line', () => {
    expect(familyOf('hwp', 'cfb')).toBe('office-old');
    expect(familyOf('hwp', null)).toBe('other');
    for (const f of ['hwpx', 'hwp3', 'hwpml', 'other'] as const) expect(familyOf(f, 'zip')).toBe('other');
    expect(familyOf('xlsx', 'zip')).toBe('xlsx');
  });
  it('the image type handed on follows the bytes, not the name', async () => {
    const h = await notHwpHelp(file(fixture('photo', 'scene_cc0.jpg'), 'photo.hwp'), 'hwp-viewer', null);
    expect(h.type).toBe('image/jpeg');
  });
  it('codes fit the usage CODE_RE', async () => {
    const h = await notHwpHelp(file(fixture('gen_already_small.pdf'), 'a.hwp'), 'hwp-viewer', null);
    expect(CODE_RE.test(h.code)).toBe(true);
  });
});
