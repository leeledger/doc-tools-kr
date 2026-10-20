// 양식 채우기 엔진 (FORM1020 test map): values.ts normalize rules, the spec lint, and build.ts with the real rhwp
// engine (each block type; blank / sample / all-max → loss 0, reload ok, 1 page, every value and docLabel drawn)
// and with a fake document (an ok:false or a throw → HwpError export; memory → oom).
import { describe, expect, it } from 'vitest';
import { BLANK_DATE, BLANK_SLOT, SIGN_MARK, buildForm, planParagraphs, type FormDocument } from '../../src/lib/form/build';
import { lintSpec, type FormSpec } from '../../src/lib/form/spec';
import { blankValues, formatDate, normalizeDate, normalizeField, normalizeValues } from '../../src/lib/form/values';
import { FORM_SPECS, getFormSpec } from '../../src/data/forms';
import { POWER_OF_ATTORNEY } from '../../src/data/forms/power-of-attorney';
import { exportHwp } from '../../src/lib/hwp/export-hwp';
import { HwpError } from '../../src/lib/hwp/errors';
import { glyphText } from '../../src/lib/hwp/svg-string';
import { loadRhwp } from '../helpers/rhwp-node';
import { LINE_LENGTHS, SAMPLE_VALUES, allMaxLines, allMaxValues } from '../helpers/form-samples';

const text = (maxLength: number) => ({ id: 't', label: 't', docLabel: 't', kind: 'text' as const, maxLength });
const multi = (maxLength: number, maxLines: number) => ({ id: 'm', label: 'm', docLabel: 'm', kind: 'multiline' as const, maxLength, maxLines });
const SAMPLE = SAMPLE_VALUES['power-of-attorney']!;

describe('values.ts', () => {
  it('NFC: decomposed Hangul becomes precomposed', () => {
    expect(normalizeField(text(20), '홍')).toBe('홍');
  });
  it('strips C0/C1 controls and lone surrogates; a single-line field turns line breaks and tabs into spaces', () => {
    expect(normalizeField(text(40), 'a\u0000b\u0007c\u0085d\u009fe')).toBe('abcde');
    expect(normalizeField(text(40), 'a\r\nb\tc\u2028d')).toBe('a b c d');
    expect(normalizeField(text(40), 'x\ud800y\udc00z')).toBe('xyz');
    expect(normalizeField(text(40), '😀')).toBe('😀');
  });
  it('multiline keeps line breaks (CRLF, CR, U+2028 → LF), drops empty edge lines, caps maxLines', () => {
    expect(normalizeField(multi(100, 3), '\n\na\r\nb\rc\u2028d\n\n')).toBe('a\nb\nc');
    expect(normalizeField(multi(100, 6), 'a  \n\nb')).toBe('a\n\nb');
  });
  it('cuts to maxLength by code points (an emoji counts once), newlines included', () => {
    expect(normalizeField(text(3), '가나다라')).toBe('가나다');
    expect(normalizeField(text(3), '😀😀😀😀')).toBe('😀😀😀');
    expect(normalizeField(multi(3, 6), 'a\nbc')).toBe('a\nb');
    expect(normalizeField(text(5), '  가  ')).toBe('가');
  });
  it('empty and non-string values are empty; unknown keys are dropped; missing fields are empty', () => {
    expect(normalizeField(text(5), undefined)).toBe('');
    expect(normalizeField(text(5), 42)).toBe('');
    const raw = JSON.parse('{"giverName":"홍길동","extra":"x","__proto__":"y"}') as Record<string, unknown>;
    const v = normalizeValues(POWER_OF_ATTORNEY, raw);
    expect(Object.keys(v).sort()).toEqual(POWER_OF_ATTORNEY.fields.map((f) => f.id).sort());
    expect(v.giverName).toBe('홍길동');
    expect(v.agentName).toBe('');
    expect(Object.values(blankValues(POWER_OF_ATTORNEY)).every((x) => x === '')).toBe(true);
  });
  it('dates: only a real calendar day YYYY-MM-DD; 「2026년 10월 20일」', () => {
    expect(normalizeDate('2026-10-20')).toBe('2026-10-20');
    expect(normalizeDate('2026-02-29')).toBe('');
    expect(normalizeDate('2024-02-29')).toBe('2024-02-29');
    expect(normalizeDate('2026-13-01')).toBe('');
    expect(normalizeDate('20261020')).toBe('');
    expect(normalizeDate('1899-01-01')).toBe('');
    expect(formatDate('2026-10-20')).toBe('2026년 10월 20일');
    expect(formatDate('2026-01-05')).toBe('2026년 1월 5일');
    expect(formatDate('')).toBe('');
  });
});

describe('spec lint', () => {
  it('every registered spec is valid; ids match; getFormSpec never reads the prototype', () => {
    for (const [id, spec] of Object.entries(FORM_SPECS)) {
      expect(spec.id).toBe(id);
      expect(lintSpec(spec)).toEqual([]);
    }
    expect(getFormSpec('power-of-attorney')).toBe(POWER_OF_ATTORNEY);
    expect(getFormSpec('toString')).toBeUndefined();
    expect(getFormSpec('nope')).toBeUndefined();
  });
  it('names the problems of a bad spec', () => {
    const bad: FormSpec = {
      id: 'x',
      fileBase: 'x',
      title: 'x',
      fields: [
        { id: 'a', label: 'a', kind: 'text', maxLength: 0 },
        { id: 'a', label: 'a', docLabel: 'a', kind: 'text', maxLength: 5 },
        { id: 'm', label: 'm', docLabel: 'm', kind: 'multiline', maxLength: 5 },
        { id: 'd', label: 'd', kind: 'date', maxLength: 10 },
      ],
      blocks: [
        { type: 'table', rows: ['a', 'a', 'd'], colWidths: [1, 2, 3], rowHeight: 1 },
        { type: 'para', doc: '{zz}' },
      ],
    };
    const p = lintSpec(bad).join('\n');
    for (const s of ['duplicate field a', 'a: maxLength', 'm: maxLines', 'unknown field zz', '3 widths for 2 columns', 'd: a date field belongs on a dateLine', 'a: placed 2 times', 'm: placed 0 times']) expect(p).toContain(s);
  });
  it('위임장: no 인감 in the document; fixed file name; plain page labels', () => {
    const doc = POWER_OF_ATTORNEY.blocks.map((b) => JSON.stringify(b)).join() + POWER_OF_ATTORNEY.fields.map((f) => f.docLabel ?? '').join();
    expect(doc).not.toContain('인감');
    expect(POWER_OF_ATTORNEY.fileBase).toBe('위임장');
    for (const f of POWER_OF_ATTORNEY.fields) expect(f.label).not.toMatch(/업로드|서버|브라우저/);
  });
});

describe('build.ts plan', () => {
  it('blank: the date line and the sign line leave room; the 귀중 line is left out', () => {
    const plan = planParagraphs(POWER_OF_ATTORNEY, blankValues(POWER_OF_ATTORNEY)).map((p) => p.text);
    expect(plan).toContain(BLANK_DATE);
    expect(plan).toContain(`위임인  ${BLANK_SLOT}  ${SIGN_MARK}`);
    expect(plan.some((t) => t.includes('귀중'))).toBe(false);
  });
  it('filled: the date, the name on the sign line, 「{제출할 곳} 귀중」', () => {
    const plan = planParagraphs(POWER_OF_ATTORNEY, normalizeValues(POWER_OF_ATTORNEY, SAMPLE)).map((p) => p.text);
    expect(plan).toContain('2026년 10월 20일');
    expect(plan).toContain(`위임인  홍길동  ${SIGN_MARK}`);
    expect(plan).toContain('종로구 행정복지센터 귀중');
  });
});

const flat = (s: string): string => s.replace(/\s+/g, '');

describe('build.ts with the real rhwp', () => {
  async function run(spec: FormSpec, raw: Record<string, string>) {
    const Doc = await loadRhwp();
    const values = normalizeValues(spec, raw);
    const doc = Doc.createEmpty();
    const pages = buildForm(doc, spec, values);
    const r = exportHwp(doc, Doc);
    const again = new Doc(r.bytes);
    const drawn = glyphText(again.renderPageSvg(0));
    again.free();
    return { pages, losses: r.losses, pagesIn: r.pagesIn, shift: r.pageShift, drawn, values };
  }

  for (const [name, raw] of [
    ['blank', {}],
    ['sample', SAMPLE],
    ['all-max', allMaxValues(POWER_OF_ATTORNEY)],
  ] as const) {
    it(`위임장 ${name}: 1 page, loss 0, reload 1 page, every value and docLabel drawn`, async () => {
      const r = await run(POWER_OF_ATTORNEY, raw as Record<string, string>);
      expect(r.pages).toBe(1);
      expect(r.losses).toBe(0);
      expect(r.pagesIn).toBe(1);
      expect(r.shift).toBe(false);
      const t = flat(r.drawn);
      expect(t).toContain('위임장');
      for (const f of POWER_OF_ATTORNEY.fields) {
        if (f.docLabel) expect(t).toContain(flat(f.docLabel));
        const v = r.values[f.id]!;
        if (v) expect(t).toContain(flat(f.kind === 'date' ? formatDate(v) : v));
      }
      for (const s of ['위임인', '대리인', '위임내용', flat(SIGN_MARK), flat('위 사람에게 위 내용에 관한 권한을 위임합니다.')]) expect(t).toContain(s);
      if (name === 'blank') expect(t).not.toContain('귀중');
      else expect(t).toContain('귀중');
    });
  }

  it('위임장 all-max with the multiline field wrapped on every line (lengths 15–40): always 1 page', async () => {
    const Doc = await loadRhwp();
    for (const n of LINE_LENGTHS) {
      const doc = Doc.createEmpty();
      try {
        expect(buildForm(doc, POWER_OF_ATTORNEY, normalizeValues(POWER_OF_ATTORNEY, allMaxLines(POWER_OF_ATTORNEY, n))), `line length ${n}`).toBe(1);
      } finally {
        doc.free();
      }
    }
  });

  it('the bold 20 pt centred title, plain body text and the cell line breaks reach the document', async () => {
    const Doc = await loadRhwp();
    const doc = Doc.createEmpty();
    buildForm(doc, POWER_OF_ATTORNEY, normalizeValues(POWER_OF_ATTORNEY, SAMPLE));
    expect(JSON.parse(doc.getCharPropertiesAt(0, 0, 0))).toMatchObject({ fontSize: 2000, bold: true });
    expect(JSON.parse(doc.getParaPropertiesAt(0, 0))).toMatchObject({ alignment: 'center' });
    const plan = planParagraphs(POWER_OF_ATTORNEY, normalizeValues(POWER_OF_ATTORNEY, SAMPLE));
    const body = plan.findIndex((p) => p.text.startsWith('위 사람에게'));
    expect(JSON.parse(doc.getCharPropertiesAt(0, body, 0))).toMatchObject({ fontSize: 1000, bold: false });
    // The 위임 내용 table: the merged section cell is 0, then [label, value] per row → the task value is cell 4.
    const tablePara = plan.findIndex((p) => p.table?.docSection === '위임 내용');
    expect(doc.getCellParagraphCount(0, tablePara, 0, 4)).toBe(2);
    expect(JSON.parse(doc.getCellInfo(0, tablePara, 0, 0))).toMatchObject({ row: 0, col: 0, rowSpan: 2 });
    doc.free();
  });
});

describe('build.ts with a fake document', () => {
  const ok = '{"ok":true,"charOffset":1,"paraIdx":1,"controlIdx":0,"cellParaIndex":1}';
  function fake(over: Partial<Record<keyof FormDocument, () => string | number>> = {}): FormDocument {
    const base: Record<string, () => string | number> = {
      createBlankDocument: () => '{"ok":true}',
      insertText: () => ok,
      splitParagraph: () => ok,
      applyCharFormat: () => '{"ok":true}',
      applyParaFormat: () => '{"ok":true}',
      createTableEx: () => ok,
      insertTextInCell: () => ok,
      splitParagraphInCell: () => ok,
      applyParaFormatInCell: () => '{"ok":true}',
      setCellProperties: () => '{"ok":true}',
      mergeTableCells: () => '{"ok":true}',
      pageCount: () => 1,
      ...over,
    };
    return base as unknown as FormDocument;
  }
  const spec: FormSpec = {
    id: 't',
    fileBase: 't',
    title: 't',
    fields: [{ id: 'a', label: 'a', docLabel: 'a', kind: 'text', maxLength: 5 }],
    blocks: [
      { type: 'title', doc: 'T', size: 20 },
      { type: 'table', docSection: 'S', rows: ['a', 'a'], colWidths: [1, 1, 1], rowHeight: 1 },
    ],
  };
  const codeOf = (fn: () => unknown): string => {
    try {
      fn();
    } catch (e) {
      return e instanceof HwpError ? e.code : 'other';
    }
    return 'none';
  };
  const boom = (e: Error) => () => {
    throw e;
  };

  it('every call that answers ok:false is export', () => {
    for (const k of ['createBlankDocument', 'insertText', 'splitParagraph', 'applyCharFormat', 'applyParaFormat', 'createTableEx', 'insertTextInCell', 'setCellProperties', 'applyParaFormatInCell', 'mergeTableCells'] as const) {
      expect(codeOf(() => buildForm(fake({ [k]: () => '{"ok":false,"error":"x"}' }), spec, { a: 'v' })), k).toBe('export');
    }
  });
  it('a throw is export; a RangeError is oom; a missing offset or index is export; 0 pages is export', () => {
    expect(codeOf(() => buildForm(fake({ insertText: boom(new Error('x')) }), spec, { a: '' }))).toBe('export');
    expect(codeOf(() => buildForm(fake({ insertText: boom(new RangeError('x')) }), spec, { a: '' }))).toBe('oom');
    expect(codeOf(() => buildForm(fake({ createTableEx: () => '{"ok":true}' }), spec, { a: '' }))).toBe('export');
    expect(codeOf(() => buildForm(fake({ splitParagraph: () => '{"ok":true,"paraIdx":5}' }), spec, { a: '' }))).toBe('export');
    expect(codeOf(() => buildForm(fake({ pageCount: () => 0 }), spec, { a: '' }))).toBe('export');
    expect(codeOf(() => buildForm(fake({ pageCount: boom(new Error('x')) }), spec, { a: '' }))).toBe('export');
    expect(codeOf(() => buildForm(fake(), spec, { a: 'v' }))).toBe('none');
  });
});
