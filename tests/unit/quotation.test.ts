// 견적서·거래명세서 (QUOTE1112 A3): the two specs lint, share one field list and are registered; the document text
// (amount line, the 합 계 row, the closing line, the sign line with 「(인)」 or the seal); and the real rhwp build — both
// specs × blank / sample / all-max × 별도 / 포함 / 없음 × seal on / off are 1 page in memory, reload with no loss and
// draw every docLabel; the sealed reload draws an image.
import { describe, expect, it } from 'vitest';
import { BLANK_SLOT, ITEM_HEADER, ITEM_TOTAL, buildForm, itemGrid, planParagraphs, sealSize, type FormSeal } from '../../src/lib/form/build';
import { specLedger } from '../../src/lib/form/ledger';
import { lintSpec, type FormSpec } from '../../src/lib/form/spec';
import { blankValues, normalizeValues } from '../../src/lib/form/values';
import { getFormSpec } from '../../src/data/forms';
import { ITEM_ROWS, QUOTATION, QUOTE_FIELDS, QUOTE_HWP, TRANSACTION_STATEMENT } from '../../src/data/forms/quotation';
import { exportHwp } from '../../src/lib/hwp/export-hwp';
import { glyphText } from '../../src/lib/hwp/svg-string';
import { loadRhwp } from '../helpers/rhwp-node';
import { SAMPLE_VALUES, quoteMaxValues, sealPng } from '../helpers/form-samples';

const SAMPLE = SAMPLE_VALUES.quotation!;
const flat = (s: string): string => s.replace(/\s+/g, '');
const SPECS = [QUOTATION, TRANSACTION_STATEMENT] as const;
const MODES = ['separate', 'included', 'none'] as const;

const seal = (): FormSeal => sealPng();

describe('견적서·거래명세서 specs', () => {
  it('lint clean, registered, one shared field list, fixed files, HWP on', () => {
    for (const s of SPECS) {
      expect(lintSpec(s)).toEqual([]);
      expect(getFormSpec(s.id)).toBe(s);
    }
    expect(QUOTATION.fields).toBe(QUOTE_FIELDS);
    expect(TRANSACTION_STATEMENT.fields).toBe(QUOTE_FIELDS);
    expect(QUOTATION.fileBase).toBe('견적서');
    expect(TRANSACTION_STATEMENT.fileBase).toBe('거래명세서');
    expect(QUOTE_HWP).toBe(true);
  });
  it('the specs differ only in the title and the closing line', () => {
    const strip = (s: FormSpec) => JSON.stringify(s.blocks).replace('견 적 서', 'T').replace('거 래 명 세 서', 'T').replace('위와 같이 견적합니다.', 'C').replace('위와 같이 거래하였습니다.', 'C');
    expect(strip(QUOTATION)).toBe(strip(TRANSACTION_STATEMENT));
    expect(JSON.stringify(QUOTATION.blocks)).toContain('견 적 서');
    expect(JSON.stringify(TRANSACTION_STATEMENT.blocks)).toContain('거 래 명 세 서');
  });
  it('Q1: never official, never a 세금계산서 in the document; plain page labels; no 등록번호 format', () => {
    const doc = JSON.stringify([QUOTATION.blocks, TRANSACTION_STATEMENT.blocks, QUOTE_FIELDS.map((f) => [f.docLabel, f.presets])]);
    for (const s of ['세금계산서', '공식', '법정', '효력']) expect(doc).not.toContain(s);
    for (const f of QUOTE_FIELDS) expect(f.label).not.toMatch(/업로드|서버|브라우저/);
    expect(QUOTE_FIELDS.find((f) => f.id === 'bizNo')!.kind).toBe('text');
  });
});

describe('견적서 document text', () => {
  it('sample 별도: amount line, rows compacted, 합 계 sums, sign line with 「(인)」', () => {
    const v = normalizeValues(QUOTATION, SAMPLE);
    const plan = planParagraphs(QUOTATION, v).map((p) => p.text);
    // 3 × 120,000 + 10 × 25,000 + 30,000 = 640,000; tax 64,000; total 704,000.
    expect(plan).toContain('합계 금액  일금 칠십만사천원정 (704,000원) (부가세 포함)');
    expect(plan).toContain('위와 같이 견적합니다.');
    expect(plan).toContain('2026년 11월 12일');
    expect(plan).toContain('공급자  홍길동  (인)');
    const b = QUOTATION.blocks.find((x) => x.type === 'items')!;
    const grid = itemGrid(b as Extract<typeof b, { type: 'items' }>, specLedger(QUOTATION, v)!);
    expect(grid[0]).toEqual([...ITEM_HEADER]);
    expect(grid[1]).toEqual(['1', '사무용 의자', '메시', '3', '120,000', '360,000', '36,000']);
    expect(grid[4]).toEqual(['4', '설치 포함', '', '', '', '', '']);
    expect(grid[5]).toEqual(['', '', '', '', '', '', '']);
    expect(grid.at(-1)).toEqual([ITEM_TOTAL, '', '', '', '', '640,000', '64,000']);
    expect(grid).toHaveLength(ITEM_ROWS + 2);
  });
  it('포함 and 없음: the note and the tax cells', () => {
    const inc = planParagraphs(QUOTATION, normalizeValues(QUOTATION, { ...SAMPLE, vat: 'included' })).map((p) => p.text);
    expect(inc).toContain('합계 금액  일금 육십사만원정 (640,000원) (부가세 포함)');
    const none = normalizeValues(QUOTATION, { ...SAMPLE, vat: 'none' });
    expect(planParagraphs(QUOTATION, none).map((p) => p.text)).toContain('합계 금액  일금 육십사만원정 (640,000원) (부가세 없음)');
    const b = QUOTATION.blocks.find((x) => x.type === 'items') as Extract<FormSpec['blocks'][number], { type: 'items' }>;
    const grid = itemGrid(b, specLedger(QUOTATION, none)!);
    expect(grid[1]![6]).toBe('');
    expect(grid.at(-1)![6]).toBe('');
  });
  it('blank: room to write the amount, no vat note, an empty grid; a seal replaces 「(인)」', () => {
    const plan = planParagraphs(QUOTATION, blankValues(QUOTATION)).map((p) => p.text);
    expect(plan).toContain(`합계 금액  일금 ${BLANK_SLOT}원정 (${BLANK_SLOT}원)`);
    expect(plan).toContain(`공급자  ${BLANK_SLOT}  (인)`);
    const sealed = planParagraphs(QUOTATION, normalizeValues(QUOTATION, SAMPLE), true);
    const line = sealed.find((p) => p.seal)!;
    expect(line.text).toBe('공급자  홍길동  ');
  });
  it('the seal box: 15 mm (4252 HU) on the long side, aspect kept', () => {
    expect(sealSize(600, 600)).toEqual({ width: 4252, height: 4252 });
    expect(sealSize(600, 300)).toEqual({ width: 4252, height: 2126 });
    expect(sealSize(100, 400)).toEqual({ width: 1063, height: 4252 });
  });
  it('a ledger problem is not built', async () => {
    const Doc = await loadRhwp();
    const doc = Doc.createEmpty();
    try {
      expect(() => buildForm(doc, QUOTATION, normalizeValues(QUOTATION, { i1Qty: '1' }))).toThrow(/ledger/);
      expect(() => buildForm(doc, QUOTATION, normalizeValues(QUOTATION, { i1Qty: '999999', i1Price: '9999999999' }))).toThrow(/ledger/);
    } finally {
      doc.free();
    }
  });
});

describe('견적서·거래명세서 with the real rhwp: 1 page in every case', () => {
  const cases: [string, Record<string, string>][] = [
    ['blank', {}],
    ['sample', SAMPLE],
  ];
  for (const s of SPECS)
    for (const mode of MODES)
      for (const [name, raw0] of [...cases, ['all-max', quoteMaxValues(s, ITEM_ROWS, mode)] as [string, Record<string, string>]])
        for (const sealed of [false, true]) {
          it(`${s.fileBase} ${name} ${mode}${sealed ? ' sealed' : ''}`, async () => {
            const Doc = await loadRhwp();
            const raw = { ...raw0, vat: mode };
            const values = normalizeValues(s, raw);
            const doc = Doc.createEmpty();
            const pages = buildForm(doc, s, values, sealed ? { seal: seal() } : {});
            expect(pages).toBe(1);
            const r = exportHwp(doc, Doc);
            expect(r.losses).toBe(0);
            expect(r.pageShift).toBe(false);
            const again = new Doc(r.bytes);
            const svg = again.renderPageSvg(0);
            again.free();
            const t = flat(glyphText(svg));
            for (const f of s.fields) if (f.docLabel) expect(t).toContain(flat(f.docLabel));
            for (const x of ['공급받는자', '공급자', ...ITEM_HEADER, ITEM_TOTAL, '합계금액', '일금']) expect(t).toContain(flat(x));
            expect(t).toContain(s.id === 'quotation' ? '위와같이견적합니다.' : '위와같이거래하였습니다.');
            for (const p of planParagraphs(s, values, sealed)) if (p.text.trim()) expect(t).toContain(flat(p.text));
            const b = s.blocks.find((x) => x.type === 'items') as Extract<FormSpec['blocks'][number], { type: 'items' }>;
            for (const row of itemGrid(b, specLedger(s, values)!)) for (const c of row) if (c) expect(t).toContain(flat(c));
            expect(/<image/.test(svg)).toBe(sealed);
            if (!sealed) expect(t).toContain('(인)');
          });
        }
});
