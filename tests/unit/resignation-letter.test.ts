// 사직서 만들기 (RESIGN1027 A3): the spec lints and is registered, the document text (the 「…자로 사직하고자」 line with a
// date and with room to write one, the 귀하 line, the sign line), and the real rhwp build — blank, sample, all-max (also
// with every line of 사직 사유 wrapped) and one build per preset fill are 1 page, reload with no loss, and draw every
// docLabel and docText.
import { describe, expect, it } from 'vitest';
import { BLANK_DATE, BLANK_SLOT, SIGN_MARK, buildForm, planParagraphs } from '../../src/lib/form/build';
import { lintSpec } from '../../src/lib/form/spec';
import { blankValues, docText, normalizeValues } from '../../src/lib/form/values';
import { getFormSpec } from '../../src/data/forms';
import { RESIGN_HWP, RESIGNATION_LETTER } from '../../src/data/forms/resignation-letter';
import { exportHwp } from '../../src/lib/hwp/export-hwp';
import { glyphText } from '../../src/lib/hwp/svg-string';
import { loadRhwp } from '../helpers/rhwp-node';
import { LINE_LENGTHS, SAMPLE_VALUES, allMaxLines, allMaxValues } from '../helpers/form-samples';

const SPEC = RESIGNATION_LETTER;
const SAMPLE = SAMPLE_VALUES['resignation-letter']!;
const flat = (s: string): string => s.replace(/\s+/g, '');
const field = (id: string) => SPEC.fields.find((f) => f.id === id)!;
const LINE = (date: string): string => `본인은 위와 같은 사유로 ${date}자로 사직하고자 하오니 처리하여 주시기 바랍니다.`;

describe('사직서 spec', () => {
  it('lints clean, is registered, has fixed files and the HWP switch on', () => {
    expect(lintSpec(SPEC)).toEqual([]);
    expect(getFormSpec('resignation-letter')).toBe(SPEC);
    expect(SPEC.fileBase).toBe('사직서');
    expect(RESIGN_HWP).toBe(true);
  });
  it('R1/R3: no 주민등록번호 or 주소; no 허락, 법적 or 효력 in the document; page labels are plain words', () => {
    const doc = JSON.stringify(SPEC.blocks) + JSON.stringify(SPEC.fields.map((f) => [f.docLabel, f.docBlank, f.presets]));
    for (const s of ['주민', '주소', '허락', '법적', '효력']) expect(doc).not.toContain(s);
    for (const f of SPEC.fields) expect(f.label).not.toMatch(/업로드|서버|브라우저/);
  });
  it('R3 fields, lengths and labels; R5 the seven presets (회사 권고 included)', () => {
    expect(SPEC.fields.map((f) => [f.id, f.kind, f.maxLength])).toEqual([
      ['dept', 'text', 30],
      ['position', 'text', 20],
      ['name', 'text', 20],
      ['birth', 'text', 20],
      ['phone', 'text', 20],
      ['joinDate', 'date', 10],
      ['leaveDate', 'date', 10],
      ['reason', 'multiline', 100],
      ['date', 'date', 10],
      ['to', 'text', 30],
    ]);
    expect(field('reason').maxLines).toBe(3);
    expect(field('reason').rowLines).toBe(3);
    expect(field('reason').presets?.map((p) => p.fill)).toEqual([
      '개인 사정',
      '다른 회사로 옮기게 되어서',
      '건강 문제(치료와 회복)',
      '학업(진학)',
      '가족 돌봄',
      '근로계약 기간 만료',
      '회사의 권고에 따른 퇴사(권고사직)',
    ]);
    expect(field('reason').presets?.find((p) => p.chip === '회사 권고')?.fill).toContain('권고사직');
  });
});

describe('사직서 document text', () => {
  it('sample: the 사직 line with the date, the date line, 「성명  홍길동  (서명 또는 인)」, 「○○ 주식회사 대표이사 귀하」', () => {
    const plan = planParagraphs(SPEC, normalizeValues(SPEC, SAMPLE)).map((p) => p.text);
    expect(plan).toContain(LINE('2026년 11월 30일'));
    expect(plan).toContain('2026년 10월 27일');
    expect(plan).toContain(`성명  홍길동  ${SIGN_MARK}`);
    expect(plan).toContain('○○ 주식회사 대표이사 귀하');
    expect(plan[0]).toBe('사 직 서');
  });
  it('blank: room to write the 퇴사 date in the line, the dates, the name and the 받는 사람 by hand', () => {
    const v = blankValues(SPEC);
    expect(docText(field('leaveDate'), v.leaveDate!)).toBe(BLANK_DATE);
    expect(docText(field('joinDate'), v.joinDate!)).toBe(BLANK_DATE);
    const plan = planParagraphs(SPEC, v).map((p) => p.text);
    expect(plan).toContain(LINE(BLANK_DATE));
    expect(plan).toContain(BLANK_DATE);
    expect(plan).toContain(`성명  ${BLANK_SLOT}  ${SIGN_MARK}`);
    expect(plan).toContain(`${BLANK_SLOT} 귀하`);
  });
});

describe('사직서 with the real rhwp', () => {
  const check = async (raw: Record<string, string>): Promise<{ pages: number; t: string; values: Record<string, string> }> => {
    const Doc = await loadRhwp();
    const values = normalizeValues(SPEC, raw);
    const doc = Doc.createEmpty();
    const pages = buildForm(doc, SPEC, values);
    const r = exportHwp(doc, Doc);
    const again = new Doc(r.bytes);
    const t = flat(glyphText(again.renderPageSvg(0)));
    again.free();
    expect(r.losses).toBe(0);
    expect(r.pagesIn).toBe(1);
    expect(r.pageShift).toBe(false);
    return { pages, t, values };
  };

  for (const [name, raw] of [
    ['blank', {}],
    ['sample', SAMPLE],
    ['all-max', allMaxValues(SPEC)],
  ] as const) {
    it(`${name}: 1 page, loss 0, reload 1 page, every docLabel and docText drawn`, async () => {
      const { pages, t, values } = await check(raw as Record<string, string>);
      expect(pages).toBe(1);
      for (const s of ['사직서', '인적사항', '재직사항', flat(SIGN_MARK), '귀하', flat('사직하고자 하오니 처리하여 주시기 바랍니다.')]) expect(t).toContain(s);
      for (const f of SPEC.fields) {
        if (f.docLabel) expect(t, f.id).toContain(flat(f.docLabel));
        const d = flat(docText(f, values[f.id]!));
        if (d) expect(t, f.id).toContain(d);
      }
      expect(t).toContain(flat(LINE(docText(field('leaveDate'), values.leaveDate!))));
    });
  }

  it('all-max with 사직 사유 wrapped on every line (lengths 15–40): always 1 page', async () => {
    const Doc = await loadRhwp();
    for (const n of LINE_LENGTHS) {
      const doc = Doc.createEmpty();
      try {
        expect(buildForm(doc, SPEC, normalizeValues(SPEC, allMaxLines(SPEC, n))), `line length ${n}`).toBe(1);
      } finally {
        doc.free();
      }
    }
  });

  it('each preset fill (on the sample) builds 1 page with the fill in the 사직 사유 row', async () => {
    for (const p of field('reason').presets!) {
      const { pages, t } = await check({ ...SAMPLE, reason: p.fill });
      expect(pages, p.chip).toBe(1);
      expect(t, p.chip).toContain(flat(p.fill));
    }
  });
});
