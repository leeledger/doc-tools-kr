// Hancom's HWP spec licence (G2 A0 "Legal"): the exact notice is the first-line comment of every source file
// under src/tools/hwp-shared/, src/tools/hwp-viewer/ and src/tools/hwpx-to-hwp/ (HWPX2HWP), and the page constant is the same text.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HANCOM_NOTICE, HANCOM_NOTICE_PDF } from '../../src/tools/hwp-shared/messages';

const NOTICE = '본 제품은 한컴의 HWP 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.';
const DIRS = ['src/tools/hwp-shared', 'src/tools/hwp-viewer', 'src/tools/hwpx-to-hwp'];

function files(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]));
}

describe('HWP spec notice', () => {
  it('HANCOM_NOTICE is the exact text of the licence', () => {
    expect(HANCOM_NOTICE).toBe(NOTICE);
  });

  const all = DIRS.flatMap(files);
  it('the scan finds the shared files', () => {
    expect(all.length).toBeGreaterThanOrEqual(10);
  });

  for (const f of all) {
    it(`${f.replace(/\\/g, '/')} starts with the notice comment`, () => {
      const first = readFileSync(f, 'utf8').split(/\r?\n/, 1)[0];
      const comment = f.endsWith('.css') ? `/* ${NOTICE} */` : `// ${NOTICE}`;
      expect(first).toBe(comment);
    });
  }

  // REV3 Decision 10: the product wording of the licence as a legal comment (kept by minifiers that keep /*! */) at the top
  // of the shared copy and the HWP tool entry files, and the same text as HANCOM_NOTICE_PDF (shown on /licenses/).
  it('HANCOM_NOTICE_PDF is a /*! */ legal comment in the first two lines of messages.ts and the three tool entries', () => {
    expect(HANCOM_NOTICE_PDF).toBe('본 제품은 한글과컴퓨터의 한글 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.');
    for (const f of ['src/tools/hwp-shared/messages.ts', 'src/tools/hwp-to-pdf/controller.ts', 'src/tools/hwp-viewer/app.ts', 'src/tools/hwpx-to-hwp/controller.ts']) {
      expect(readFileSync(f, 'utf8').split(/\r?\n/, 2), f).toContain(`/*! ${HANCOM_NOTICE_PDF} */`);
    }
  });
});
