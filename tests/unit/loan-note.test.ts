// 차용증 만들기 (LOAN1022 L3): the spec lints, the document text of every value, and the real rhwp build — blank,
// sample and all-max (also with every line of 그 밖의 약속 wrapped) are 1 page, reload with no loss, and draw every
// docLabel and docText (the amount in 한글 and digits).
import { describe, expect, it } from 'vitest';
import { BLANK_DATE, BLANK_SLOT, SIGN_MARK, buildForm, planParagraphs } from '../../src/lib/form/build';
import { lintSpec } from '../../src/lib/form/spec';
import { blankValues, docText, normalizeValues } from '../../src/lib/form/values';
import { getFormSpec } from '../../src/data/forms';
import { LOAN_HWP, LOAN_NOTE } from '../../src/data/forms/loan-note';
import { exportHwp } from '../../src/lib/hwp/export-hwp';
import { glyphText } from '../../src/lib/hwp/svg-string';
import { loadRhwp } from '../helpers/rhwp-node';
import { LINE_LENGTHS, SAMPLE_VALUES, allMaxLines, allMaxValues } from '../helpers/form-samples';
import { DESC_MAX, DESC_MIN, HOME_DESC_ORDER, TITLE_MAX, TITLE_SUFFIX } from '../../src/data/site';
import { LIVE_TOOLS, TOOLS, getTool } from '../../src/data/tools';
import { faqJsonLd } from '../../src/data/jsonld';
import { FLOW } from '../../src/lib/ui/next-steps';
import { LN_COPY, LN_PROBLEMS } from '../../src/tools/loan-note/copy';
import { DOWNLOAD_SETTING, TOOLS as USAGE_TOOLS, TOOL_LABELS, validate } from '../../scripts/lib/usage.mjs';

const SAMPLE = SAMPLE_VALUES['loan-note']!;
const flat = (s: string): string => s.replace(/\s+/g, '');
const field = (id: string) => LOAN_NOTE.fields.find((f) => f.id === id)!;

describe('차용증 spec', () => {
  it('lints clean, is registered, has fixed files and the HWP switch on', () => {
    expect(lintSpec(LOAN_NOTE)).toEqual([]);
    expect(getFormSpec('loan-note')).toBe(LOAN_NOTE);
    expect(LOAN_NOTE.fileBase).toBe('차용증');
    expect(LOAN_HWP).toBe(true);
  });
  it('L-D1: no 보증, 공정증서 or 대부 in the document; page labels are plain words', () => {
    const doc = JSON.stringify(LOAN_NOTE.blocks) + JSON.stringify(LOAN_NOTE.fields.map((f) => [f.docLabel, f.docTemplate, f.docBlank, f.docZero]));
    for (const s of ['보증', '공정증서', '공증', '대부']) expect(doc).not.toContain(s);
    for (const f of LOAN_NOTE.fields) expect(f.label).not.toMatch(/업로드|서버|브라우저/);
  });
});

describe('차용증 document text', () => {
  it('sample: 「금 일천만원정 (10,000,000원)」, 「연 5%」, dates, sign lines', () => {
    const v = normalizeValues(LOAN_NOTE, SAMPLE);
    expect(docText(field('amount'), v.amount!)).toBe('금 일천만원정 (10,000,000원)');
    expect(docText(field('rate'), v.rate!)).toBe('연 5%');
    expect(docText(field('loanDate'), v.loanDate!)).toBe('2026년 10월 22일');
    const plan = planParagraphs(LOAN_NOTE, v).map((p) => p.text);
    expect(plan).toContain(`채무자  홍길동  ${SIGN_MARK}`);
    expect(plan).toContain(`채권자  김철수  ${SIGN_MARK}`);
    expect(plan).toContain('2026년 10월 22일');
  });
  it('rate 0 → 없음', () => {
    expect(docText(field('rate'), normalizeValues(LOAN_NOTE, { rate: '0' }).rate!)).toBe('없음');
  });
  it('blank: room to write the amount, the rate and the dates by hand; empty sign lines', () => {
    const v = blankValues(LOAN_NOTE);
    expect(docText(field('amount'), v.amount!)).toMatch(/^금 +원정 \( +원\)$/);
    expect(docText(field('rate'), v.rate!)).toMatch(/^연 +%$/);
    expect(docText(field('dueDate'), v.dueDate!)).toBe(BLANK_DATE);
    const plan = planParagraphs(LOAN_NOTE, v).map((p) => p.text);
    expect(plan).toContain(BLANK_DATE);
    expect(plan).toContain(`채무자  ${BLANK_SLOT}  ${SIGN_MARK}`);
  });
});

describe('차용증 with the real rhwp', () => {
  for (const [name, raw] of [
    ['blank', {}],
    ['sample', SAMPLE],
    ['all-max', allMaxValues(LOAN_NOTE)],
  ] as const) {
    it(`${name}: 1 page, loss 0, reload 1 page, every docLabel and docText drawn`, async () => {
      const Doc = await loadRhwp();
      const values = normalizeValues(LOAN_NOTE, raw as Record<string, string>);
      const doc = Doc.createEmpty();
      const pages = buildForm(doc, LOAN_NOTE, values);
      const r = exportHwp(doc, Doc);
      const again = new Doc(r.bytes);
      const t = flat(glyphText(again.renderPageSvg(0)));
      again.free();
      expect(pages).toBe(1);
      expect(r.losses).toBe(0);
      expect(r.pagesIn).toBe(1);
      expect(r.pageShift).toBe(false);
      expect(t).toContain('차용증');
      for (const s of ['차용내용', '빌려준사람(채권자)', '빌린사람(채무자)', flat(SIGN_MARK), flat('위 돈을 틀림없이 빌렸으며, 위에 적은 대로 갚겠습니다.')]) expect(t).toContain(s);
      for (const f of LOAN_NOTE.fields) {
        if (f.docLabel) expect(t, f.id).toContain(flat(f.docLabel));
        const d = flat(docText(f, values[f.id]!));
        if (d) expect(t, f.id).toContain(d);
      }
      if (name === 'all-max') expect(t).toContain('금구천구백구십구억구천구백구십구만구천구백구십구원정(999,999,999,999원)');
    });
  }

  it('all-max with 그 밖의 약속 wrapped on every line (lengths 15–40): always 1 page', async () => {
    const Doc = await loadRhwp();
    for (const n of LINE_LENGTHS) {
      const doc = Doc.createEmpty();
      try {
        expect(buildForm(doc, LOAN_NOTE, normalizeValues(LOAN_NOTE, allMaxLines(LOAN_NOTE, n))), `line length ${n}`).toBe(1);
      } finally {
        doc.free();
      }
    }
  });
});

describe('차용증 만들기: tools.ts entry and registration (L-D2, L-D11)', () => {
  const t = getTool('loan-note');
  const len = (s: string): number => [...s].length;
  it('is live, right after 위임장 만들기; name = h1; SEO lengths; the 차용증 양식 keyword; no privacy lead', () => {
    expect(t.status).toBe('live');
    const slugs = TOOLS.map((x) => x.slug);
    expect(slugs.indexOf('loan-note')).toBe(slugs.indexOf('power-of-attorney') + 1);
    expect(LIVE_TOOLS.map((x) => x.slug)).toContain('loan-note');
    expect(t.h1).toBe(t.name);
    expect(t.name).toBe('차용증 만들기');
    expect(t.title.endsWith(TITLE_SUFFIX)).toBe(true);
    expect(len(t.title)).toBeLessThanOrEqual(TITLE_MAX);
    expect(len(t.description)).toBeGreaterThanOrEqual(DESC_MIN);
    expect(len(t.description)).toBeLessThanOrEqual(DESC_MAX);
    expect(t.description).toContain('차용증 양식');
    expect(t.description).not.toMatch(/밖으로|보내지 않/);
    expect(t.faq).toHaveLength(6);
    expect((faqJsonLd(t) as { mainEntity: unknown[] }).mainEntity).toHaveLength(6);
    // L-D1 / L-D9: no 보증 or 공증 form, no tax and no legal number in the core-font copy (the note quotes the law).
    expect(JSON.stringify({ ...t, keywords: [] })).not.toMatch(/보증|공증|공정증서|증여|세금|20퍼센트|20 ?%/);
  });
  it('home description order after 위임장 만들기; service worker stores it when visited', async () => {
    expect(HOME_DESC_ORDER.indexOf('loan-note')).toBe(HOME_DESC_ORDER.indexOf('power-of-attorney') + 1);
    const { NOT_PRECACHED } = await import('../../scripts/gen-sw.mjs');
    const { RUNTIME_PAGES } = await import('../../src/sw/sw');
    expect(NOT_PRECACHED('/loan-note/')).toBe(true);
    expect(RUNTIME_PAGES).toContain('/loan-note/');
  });
  it('이어서 하기 (L-D10): 도장·서명 first, then 글자 넣기 and 용량 줄이기', () => {
    expect(FLOW['loan-note']).toEqual(['pdf-sign', 'pdf-edit', 'pdf-compress']);
  });
});

describe('차용증 만들기: usage whitelist (L-D8)', () => {
  const BASE = { t: 'loan-note', via: 'direct', d: 'desktop', b: 'dev', w: 1 };
  const body = (o: Record<string, unknown>): string => JSON.stringify(o);
  it('a tool with its label; start carries build blank|filled only; download format hwp|pdf only', () => {
    expect(USAGE_TOOLS).toContain('loan-note');
    expect(TOOL_LABELS['loan-note' as keyof typeof TOOL_LABELS]).toBe('차용증 만들기');
    expect(DOWNLOAD_SETTING['loan-note' as keyof typeof DOWNLOAD_SETTING]).toBe('format');
    for (const v of ['blank', 'filled']) expect(validate(body({ ...BASE, e: 'start', o: 'build', v })), v).not.toBeNull();
    for (const v of ['10000000', '홍길동', '5']) expect(validate(body({ ...BASE, e: 'start', o: 'build', v })), v).toBeNull();
    for (const v of ['hwp', 'pdf']) expect(validate(body({ ...BASE, e: 'download', o: 'format', v })), v).not.toBeNull();
    expect(validate(body({ ...BASE, e: 'download', o: 'format', v: '10000000' }))).toBeNull();
    for (const v of ['pdf-sign', 'pdf-edit', 'pdf-compress']) expect(validate(body({ ...BASE, e: 'next', o: 'next', v })), v).not.toBeNull();
  });
});

describe('차용증 만들기: in-tool lines', () => {
  it('plain words; the field errors; fixed file names', () => {
    const all: string[] = [...Object.values(LN_COPY as unknown as Record<string, unknown>).filter((v): v is string => typeof v === 'string'), LN_COPY.engine(50), LN_COPY.downloaded('차용증.pdf'), ...Object.values(LN_PROBLEMS)];
    for (const s of all) expect(s).not.toMatch(/업로드|서버|브라우저|네트워크|메모리/);
    expect(LN_PROBLEMS.number).toBe('숫자로만 써 주세요.');
    expect(LN_PROBLEMS.tooBig).toBe('1조 원보다 적게 써 주세요.');
    expect(LN_COPY.downloaded('차용증.hwp')).toBe('「차용증.hwp」를 내려받았어요. 「다운로드」 폴더를 확인하세요.');
  });
});

describe('차용증 만들기: the tool note quotes are in the source watch (check:quotes)', () => {
  it('readToolNotes lists the note with its law and 132 sources, path = the tool page', async () => {
    const { readToolNotes } = await import('../../scripts/ops/lib/guides.mjs');
    const note = readToolNotes().find((n: { slug: string }) => n.slug === 'loan-note');
    expect(note?.path).toBe('/loan-note/');
    const urls = (note?.sources ?? []).map((s: { url?: string }) => s.url);
    for (const seq of ['lsiSeq=268667', 'lsiSeq=230727', 'lsiSeq=284415', 'klac.or.kr']) expect(urls.some((u: string | undefined) => u?.includes(seq)), seq).toBe(true);
  });
});
