// PDF 나누기·쪽 편집 (TOOLS5 U2): the pure plan (edit state -> merge inputs, split syntax, partitions, names), the limits
// and mergePlus with one input and a page subset (signature check, outlines; brief unverified claim e).
import { PDFDocument } from '@cantoo/pdf-lib';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mergePlus } from '../../src/lib/pdf/mergePlus';
import { MB } from '../../src/lib/ui/device';
import { LIMITS, MOBILE_MAX_FILE_BYTES, fileLimitMessage, partsLimitMessage, softLimitMessage } from '../../src/tools/pdf-split/limits';
import { LIMITS as MERGE_LIMITS } from '../../src/tools/pdf-merge/limits';
import {
  editName,
  editPlan,
  everyN,
  extractName,
  extractPlan,
  initialState,
  keptPages,
  move,
  parseParts,
  parseSize,
  partName,
  splitPlans,
  splitZipName,
  turn,
  type PageState,
} from '../../src/tools/pdf-split/plan';
import { makeRuntimeFixtures } from '../fixtures/build.mjs';
import { fixture, outlineCount, pageTexts } from '../helpers/pdf';

/** 5 pages; delete page 2, turn page 3 once, move page 5 to the top. */
function edited(): PageState[] {
  let s = initialState(5);
  s[1]!.removed = true;
  s[2]!.rotate = turn(s[2]!.rotate);
  s = move(s, 4, 0);
  return s;
}

describe('edit state -> merge inputs', () => {
  it('initial state: every page, in order, no rotation', () => {
    expect(editPlan(initialState(3))).toEqual({ pages: [0, 1, 2], rotate: [0, 0, 0], first: 1, last: 3 });
  });

  it('order, rotation and removed pages carry into 편집한 PDF 하나로', () => {
    const s = edited();
    expect(s.map((p) => p.src)).toEqual([4, 0, 1, 2, 3]);
    expect(keptPages(s).map((p) => p.src)).toEqual([4, 0, 2, 3]);
    expect(editPlan(s)).toEqual({ pages: [4, 0, 2, 3], rotate: [0, 0, 90, 0], first: 1, last: 4 });
  });

  it('every page removed: no plan', () => {
    const s = initialState(2).map((p) => ({ ...p, removed: true }));
    expect(editPlan(s)).toBeNull();
    expect(extractPlan(s)).toBeNull();
  });

  it('고른 쪽만: selected kept pages in the shown order; a removed page never counts even if it was selected', () => {
    const s = edited();
    expect(extractPlan(s)).toBeNull();
    s[0]!.selected = true; // src 4
    s[3]!.selected = true; // src 2 (turned)
    s[2]!.selected = true; // src 1, removed
    expect(extractPlan(s)).toEqual({ pages: [4, 2], rotate: [0, 90], first: 1, last: 3 });
  });

  it('turn: 90° steps clockwise, wraps at 360, negative steps allowed', () => {
    expect(turn(0)).toBe(90);
    expect(turn(270)).toBe(0);
    expect(turn(0, -90)).toBe(270);
    expect(turn(90, 180)).toBe(270);
  });

  it('move: clamps the target, leaves the input untouched', () => {
    const a = [1, 2, 3];
    expect(move(a, 0, 9)).toEqual([2, 3, 1]);
    expect(move(a, 2, -4)).toEqual([3, 1, 2]);
    expect(move(a, 1, 1)).toEqual([1, 2, 3]);
    expect(a).toEqual([1, 2, 3]);
  });
});

describe('범위대로 나누기: one PDF per line', () => {
  it('valid lines, blank lines skipped, Windows line ends', () => {
    expect(parseParts('1-3\n4-6', 6)).toEqual({ ok: true, parts: [[1, 2, 3], [4, 5, 6]] });
    expect(parseParts('\n 2 \n\r\n1-2, 5\r\n', 5)).toEqual({ ok: true, parts: [[2], [1, 2, 5]] });
  });

  it('overlapping parts are allowed (each is its own PDF)', () => {
    expect(parseParts('1-3\n2-4', 4)).toEqual({ ok: true, parts: [[1, 2, 3], [2, 3, 4]] });
  });

  it('errors carry the line: reversed, out of range, junk', () => {
    expect(parseParts('1-2\n3-1', 5)).toEqual({ ok: false, error: 'reversed', line: 2 });
    expect(parseParts('9', 5)).toEqual({ ok: false, error: 'out-of-range', line: 1 });
    expect(parseParts('1-2\n\nabc', 5)).toEqual({ ok: false, error: 'junk', line: 3 });
    expect(parseParts('1-2;3-4', 5)).toEqual({ ok: false, error: 'junk', line: 1 });
  });

  it('nothing but blank lines (or a line of commas) is empty', () => {
    expect(parseParts('', 5)).toEqual({ ok: false, error: 'empty', line: 0 });
    expect(parseParts(' \n\n ', 5)).toEqual({ ok: false, error: 'empty', line: 0 });
    expect(parseParts('1\n , ', 5)).toEqual({ ok: false, error: 'empty', line: 2 });
  });

  it('page numbers count the edited document: page 1 is the first page left in the list', () => {
    const s = edited(); // kept: src 4, 0, 2 (turned), 3
    const r = parseParts('1-2\n3-4', keptPages(s).length);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(splitPlans(s, r.parts)).toEqual([
      { pages: [4, 0], rotate: [0, 0], first: 1, last: 2 },
      { pages: [2, 3], rotate: [90, 0], first: 3, last: 4 },
    ]);
    expect(parseParts('5', keptPages(s).length)).toEqual({ ok: false, error: 'out-of-range', line: 1 });
  });
});

describe('N쪽씩 / 한 쪽씩', () => {
  it('runs of N, the last one shorter', () => {
    expect(everyN(5, 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(everyN(4, 2)).toEqual([[1, 2], [3, 4]]);
    expect(everyN(3, 10)).toEqual([[1, 2, 3]]);
  });

  it('한 쪽씩 = N 1', () => {
    expect(everyN(3, 1)).toEqual([[1], [2], [3]]);
  });

  it('bad sizes give nothing; the field accepts whole numbers from 1 only', () => {
    expect(everyN(5, 0)).toEqual([]);
    expect(everyN(5, 1.5)).toEqual([]);
    expect(parseSize(' 3 ')).toBe(3);
    for (const t of ['', '0', '-1', '1.5', 'abc', '1e3', '1234567']) expect(parseSize(t), t).toBeNull();
  });
});

describe('names', () => {
  it('편집 / 추출 / 나누기 ZIP / parts', () => {
    expect(editName('계약서.PDF')).toBe('계약서_편집.pdf');
    expect(extractName('계약서.pdf')).toBe('계약서_추출.pdf');
    expect(splitZipName('계약서.pdf')).toBe('계약서_나누기.zip');
    expect(partName('계약서.pdf', { first: 2, last: 3 })).toBe('계약서_2-3.pdf');
    expect(partName('계약서.pdf', { first: 4, last: 4 })).toBe('계약서_4.pdf');
  });

  it('unsafe characters and long names are cut like the other tools', () => {
    expect(partName('a/b:c.pdf', { first: 1, last: 2 })).toBe('abc_1-2.pdf');
    expect(Array.from(editName(`${'가'.repeat(120)}.pdf`)).length).toBe(80);
  });
});

describe('limits', () => {
  it('file size: the PDF 합치기 hard limit on PCs, its own 100 MB on phones; thumbnails and parts caps per device', () => {
    expect(LIMITS.desktop).toEqual({ maxFileBytes: 500 * MB, maxThumbPages: 500, maxParts: 500 });
    expect(LIMITS.mobile).toEqual({ maxFileBytes: 100 * MB, maxThumbPages: 200, maxParts: 100 });
    expect(MOBILE_MAX_FILE_BYTES).toBe(100 * MB);
    // PDF 합치기 keeps its 150 MB phone limit.
    expect(MERGE_LIMITS.mobile.hardBytes).toBe(150 * MB);
    expect(fileLimitMessage(100 * MB, 'mobile')).toBeNull();
    expect(fileLimitMessage(100 * MB + 1, 'mobile')).toContain('100 MB');
    expect(fileLimitMessage(500 * MB, 'desktop')).toBeNull();
  });

  it('parts cap: the message names the cap and the count', () => {
    expect(partsLimitMessage(100, 'mobile')).toBeNull();
    const msg = partsLimitMessage(101, 'mobile')!;
    expect(msg).toContain('100개');
    expect(msg).toContain('101개');
    expect(partsLimitMessage(500, 'desktop')).toBeNull();
    expect(partsLimitMessage(501, 'desktop')).toContain('500개');
  });

  it('soft warnings: size first, then pages (PDF 합치기 soft limits)', () => {
    expect(softLimitMessage(10 * MB, 10, 'desktop')).toBeNull();
    expect(softLimitMessage(201 * MB, 10, 'desktop')).toContain('200 MB');
    expect(softLimitMessage(10 * MB, 1501, 'desktop')).toContain('1,500쪽');
    expect(softLimitMessage(51 * MB, 100_000, 'mobile')).toContain('50 MB');
    expect(softLimitMessage(10 * MB, 100_000, 'mobile')).toBeNull();
  });
});

describe('mergePlus with one input and a page subset (the /pdf-split/ runs)', () => {
  let tmp: string;
  let rt: Record<string, string>;
  beforeAll(async () => {
    tmp = mkdtempSync(join(tmpdir(), 'pdfsplit-'));
    rt = await makeRuntimeFixtures(tmp);
  });
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));

  it('order and rotation as planned; outlines of the kept pages survive, nothing crashes (unverified claim e)', async () => {
    const links = fixture('gen_links_outline.pdf');
    const { bytes, report } = await mergePlus([{ bytes: links, pages: [3, 0], rotate: [90, 0] }], { addFileBookmarks: false });
    expect(report.pageCount).toBe(2);
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    expect(doc.getPage(0).getRotation().angle).toBe(90);
    expect(doc.getPage(1).getRotation().angle).toBe(0);
    expect(await pageTexts(bytes)).toEqual(await pageTexts(links, undefined, [3, 0]));
    expect(await outlineCount(bytes)).toBeLessThanOrEqual(await outlineCount(links));
    expect(report.signed).toBeUndefined();
  });

  it('detectSignature: signed input -> signed, plain -> false; encrypted input opens with its password', async () => {
    const signed = new Uint8Array(readFileSync(rt.signed_fake!));
    expect((await mergePlus([{ bytes: signed, pages: [0] }], { detectSignature: true })).report.signed).toBe(true);
    const law = fixture('kr_law_form.pdf');
    expect((await mergePlus([{ bytes: law, pages: [0] }], { detectSignature: true })).report.signed).toBe(false);
    const enc = new Uint8Array(readFileSync(rt.encrypted_userpw_1234!));
    const out = await mergePlus([{ bytes: enc, password: '1234', pages: [1, 0] }]);
    expect(out.report.pageCount).toBe(2);
    expect(await pageTexts(out.bytes)).toEqual((await pageTexts(enc, '1234', [1, 0])));
  });
});
