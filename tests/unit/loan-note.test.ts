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
