// 위임장 만들기 (FORM1020 test map "registration", D7–D9): tools.ts entry, home order, service-worker lists, the usage
// whitelist (blank|filled and hwp|pdf only, never a typed value), the 이어서 하기 row, the in-tool copy and the UI-font
// rule that leaves a form's document text out of the UI glyph sets.
import { describe, expect, it } from 'vitest';
import { DESC_MAX, DESC_MIN, HOME_DESC_ORDER, TITLE_MAX, TITLE_SUFFIX } from '../../src/data/site';
import { LIVE_TOOLS, TOOLS, getTool } from '../../src/data/tools';
import { faqJsonLd } from '../../src/data/jsonld';
import { FLOW } from '../../src/lib/ui/next-steps';
import { PA_COPY } from '../../src/tools/power-of-attorney/copy';
import { GOV24_INGAM_URL } from '../../src/tools/power-of-attorney/sources';
import { FORM_HWP, POWER_OF_ATTORNEY } from '../../src/data/forms/power-of-attorney';
import { DOWNLOAD_SETTING, TOOLS as USAGE_TOOLS, TOOL_LABELS, validate } from '../../scripts/lib/usage.mjs';
import { stripComments } from '../../scripts/lib/ui-font-chars.mjs';

const len = (s: string): number => [...s].length;
const BASE = { t: 'power-of-attorney', via: 'direct', d: 'desktop', b: 'dev', w: 1 };
const body = (o: Record<string, unknown>): string => JSON.stringify(o);

describe('위임장 만들기: tools.ts entry', () => {
  const t = getTool('power-of-attorney');
  it('is live, right after 전자서명·도장 이미지 만들기; name = h1; SEO lengths; the 위임장 양식 keyword; no privacy lead', () => {
    expect(t.status).toBe('live');
    expect(LIVE_TOOLS.map((x) => x.slug)).toContain('power-of-attorney');
    const slugs = TOOLS.map((x) => x.slug);
    expect(slugs.indexOf('power-of-attorney')).toBe(slugs.indexOf('stamp-signature') + 1);
    expect(t.name).toBe('위임장 만들기');
    expect(t.h1).toBe(t.name);
    expect(t.title.endsWith(TITLE_SUFFIX)).toBe(true);
    expect(len(t.title)).toBeLessThanOrEqual(TITLE_MAX);
    expect(len(t.description)).toBeGreaterThanOrEqual(DESC_MIN);
    expect(len(t.description)).toBeLessThanOrEqual(DESC_MAX);
    expect(t.description).toContain('위임장 양식');
    expect(t.description).not.toMatch(/밖으로|보내지 않/);
  });
  it('6 FAQ entries (FAQPage JSON-LD); 「인감」 nowhere in the entry (D10: only the page caution names it)', () => {
    expect(t.faq).toHaveLength(6);
    expect((faqJsonLd(t) as { mainEntity: unknown[] }).mainEntity).toHaveLength(6);
    expect(JSON.stringify({ ...t, keywords: [] })).not.toContain('인감');
  });
  it('home description order: right after stamp-signature (D9)', () => {
    expect(HOME_DESC_ORDER.indexOf('power-of-attorney')).toBe(HOME_DESC_ORDER.indexOf('stamp-signature') + 1);
  });
  it('service worker: not precached, stored when visited', async () => {
    const { NOT_PRECACHED } = await import('../../scripts/gen-sw.mjs');
    const { RUNTIME_PAGES } = await import('../../src/sw/sw');
    expect(NOT_PRECACHED('/power-of-attorney/')).toBe(true);
    expect(RUNTIME_PAGES).toContain('/power-of-attorney/');
  });
});

describe('위임장 만들기: usage whitelist (D7, D9)', () => {
  it('a tool with its label; start carries build blank|filled only', () => {
    expect(USAGE_TOOLS).toContain('power-of-attorney');
    expect(TOOL_LABELS['power-of-attorney' as keyof typeof TOOL_LABELS]).toBe('위임장 만들기');
    for (const v of ['blank', 'filled']) expect(validate(body({ ...BASE, e: 'start', o: 'build', v })), v).not.toBeNull();
    for (const v of ['홍길동', '위임장', '010-1234-5678', 'full', '3']) expect(validate(body({ ...BASE, e: 'start', o: 'build', v })), v).toBeNull();
  });
  it('download carries format hwp|pdf only, and format rides on nothing else', () => {
    expect(DOWNLOAD_SETTING['power-of-attorney' as keyof typeof DOWNLOAD_SETTING]).toBe('format');
    for (const v of ['hwp', 'pdf']) expect(validate(body({ ...BASE, e: 'download', o: 'format', v })), v).not.toBeNull();
    expect(validate(body({ ...BASE, e: 'download', o: 'format', v: 'docx' }))).toBeNull();
    expect(validate(body({ ...BASE, e: 'start', o: 'format', v: 'pdf' }))).toBeNull();
    expect(validate(body({ ...BASE, t: 'english-name', e: 'download', o: 'format', v: 'pdf' }))).toBeNull();
    expect(validate(body({ ...BASE, e: 'download' }))).not.toBeNull();
  });
  it('success, fail and next to the PDF tools', () => {
    expect(validate(body({ ...BASE, e: 'success' }))).not.toBeNull();
    for (const c of ['export', 'unverified', 'engine', 'oom', 'timeout', 'pdf']) expect(validate(body({ ...BASE, e: 'fail', c, p: 'save' })), c).not.toBeNull();
    for (const v of ['pdf-sign', 'pdf-edit', 'pdf-compress']) expect(validate(body({ ...BASE, e: 'next', o: 'next', v })), v).not.toBeNull();
  });
});

describe('위임장 만들기: chain, copy, sources, spec', () => {
  it('이어서 하기 (D8): 도장·서명 first, then 글자 넣기 and 용량 줄이기', () => {
    expect(FLOW['power-of-attorney']).toEqual(['pdf-sign', 'pdf-edit', 'pdf-compress']);
  });
  it('the in-tool lines: plain words; the stale line; fixed file names in the downloaded line', () => {
    const all: string[] = [...Object.values(PA_COPY as Record<string, unknown>).filter((v): v is string => typeof v === 'string'), PA_COPY.engine(50), PA_COPY.downloaded('위임장.pdf')];
    for (const s of all) expect(s).not.toMatch(/업로드|서버|브라우저|네트워크|메모리/);
    // The brief's 「바뀐」 would add 뀐 to the late UI face (8 KB budget, full): 「고친」 says the same.
    expect(PA_COPY.stale).toContain('고친 내용으로 다시 만들어 주세요');
    expect(PA_COPY.downloaded('위임장.hwp')).toBe('「위임장.hwp」를 내려받았어요. 「다운로드」 폴더를 확인하세요.');
  });
  it('the 인감증명서 link is the 정부24 service page of F0; the HWP download is on (D12)', () => {
    expect(GOV24_INGAM_URL).toBe('https://www.gov.kr/mw/AA020InfoCappView.do?CappBizCD=13100000025');
    expect(FORM_HWP).toBe(true);
    expect(POWER_OF_ATTORNEY.fileBase).toBe('위임장');
  });
  it('UI font: a form\'s document text (doc, docLabel, docSection) is left out of the glyph sets; page labels are not', () => {
    const src = "{ id: 'a', label: '부탁할 일', docLabel: '맡기는 일', kind: 'text' }, { type: 'para', doc: '{a} 귀중' }, { docSection: '위임인' }";
    const kept = stripComments(src);
    expect(kept).toContain('부탁할 일');
    for (const s of ['맡기는', '귀중', '위임인']) expect(kept).not.toContain(s);
  });
});
