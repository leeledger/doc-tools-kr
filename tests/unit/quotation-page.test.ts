// 견적서·거래명세서 만들기 page (QUOTE1112 B1/B2): registration (tools.ts, meta lengths, JSON-LD FAQ, home order, chain,
// affiliate, usage whitelist with the doc enum), the in-tool lines, the totals box text (= the ledger), the seal message
// check in the worker, the sign hand-off to /quotation/, and the tool note's law quotes against the saved excerpt.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DESC_MAX, DESC_MIN, HOME_DESC_ORDER, TITLE_MAX } from '../../src/data/site';
import { LIVE_TOOLS, getTool } from '../../src/data/tools';
import { faqJsonLd } from '../../src/data/jsonld';
import { ITEM_NAME_MAX, ITEM_ROWS, ITEM_SPEC_MAX } from '../../src/data/forms/quotation';
import { FLOW } from '../../src/lib/ui/next-steps';
import { lpBlock, resultBlock } from '../../src/data/affiliate';
import { computeLedger } from '../../src/lib/form/ledger';
import { SEAL_MAX_PX, sealExtras, sealFit } from '../../src/lib/form/seal';
import { HANDOFF_FAILED_QUOTE, QUOTATION_PATH, SIGN_FROM_KEY, SIGN_PNG_KEY, sendToQuotation, takeSignPng } from '../../src/lib/ui/sign-handoff';
import { ITEMS_COPY, QT_COPY, QT_PROBLEMS, SEAL_COPY } from '../../src/tools/quotation/copy';
import { totalsText } from '../../src/tools/quotation/items';
import { QT_ROWS_SHOWN } from '../../src/tools/quotation/config';
import { DOWNLOAD_SETTING, FORM_DOCS, TOOLS as USAGE_TOOLS, TOOL_LABELS, validate } from '../../scripts/lib/usage.mjs';
import { sealPng } from '../helpers/form-samples';

const tool = getTool('quotation');

describe('견적서·거래명세서 만들기: registration', () => {
  it('a live tool right after 사직서 만들기; title and description within the meta limits; 5 FAQs in the JSON-LD', () => {
    const slugs = LIVE_TOOLS.map((t) => t.slug);
    expect(slugs.indexOf('quotation')).toBe(slugs.indexOf('resignation-letter') + 1);
    expect(HOME_DESC_ORDER.indexOf('quotation')).toBe(HOME_DESC_ORDER.indexOf('resignation-letter') + 1);
    expect([...tool.title].length).toBeLessThanOrEqual(TITLE_MAX);
    expect(tool.title).toBe('견적서·거래명세서 만들기 — 양식 무료, HWP·PDF | 문서딱');
    expect([...tool.description].length).toBeGreaterThanOrEqual(DESC_MIN);
    expect([...tool.description].length).toBeLessThanOrEqual(DESC_MAX);
    expect(tool.faq).toHaveLength(5);
    expect((faqJsonLd(tool) as { mainEntity: unknown[] }).mainEntity).toHaveLength(5);
    expect(tool.keywords).toEqual(expect.arrayContaining(['견적서 양식', '견적서양식 hwp', '거래명세서 양식', '거래명세표']));
  });
  it('FAQ numbers are the form\'s; the 엑셀 answer says what we make; the 세금계산서 answer links 홈택스', () => {
    const rows = tool.faq.find((f) => f.q.startsWith('품목은 몇 줄'))!.a;
    expect(rows).toContain(`${ITEM_ROWS}줄`);
    expect(rows).toContain(`${QT_ROWS_SHOWN}줄`);
    expect(rows).toContain(`${ITEM_NAME_MAX}자`);
    expect(rows).toContain(`${ITEM_SPEC_MAX}자`);
    expect(tool.faq.find((f) => f.q.includes('엑셀'))!.a).toMatch(/^엑셀 파일은 만들지 않습니다\./);
    const tax = tool.faq.find((f) => f.q.includes('세금계산서'))!;
    expect(tax.a).toContain('세금계산서는 따로 발급해야 합니다');
    expect(tax.links).toEqual([{ href: 'https://www.hometax.go.kr/', text: '국세청 홈택스' }]);
    for (const f of tool.faq) expect(f.q + f.a).not.toMatch(/업로드|서버|브라우저|공식|법정 서식/);
  });
  it('chain, affiliate (LinkPrice 전자서명 on the result, Coupang 도장 while it is off)', () => {
    expect(FLOW.quotation).toEqual(['pdf-sign', 'pdf-edit', 'pdf-compress']);
    expect(lpBlock('quotation', true)!.links.map((l) => l.dest)).toEqual(['lp-signgate']);
    expect(resultBlock('quotation', '0', undefined)!.links.map((l) => l.dest)).toEqual(['cp-stamp']);
  });
  it('usage: the tool, its label, the download format and the doc enum on start; never a value', () => {
    expect(USAGE_TOOLS).toContain('quotation');
    expect(TOOL_LABELS.quotation).toBe(tool.name);
    expect(DOWNLOAD_SETTING.quotation).toBe('format');
    expect(FORM_DOCS).toEqual(['quotation', 'transaction-statement']);
    const BASE = { t: 'quotation', via: 'direct', d: 'mobile', b: 'abc1234', w: 1 };
    const body = (o: Record<string, unknown>) => JSON.stringify(o);
    for (const v of FORM_DOCS) expect(validate(body({ ...BASE, e: 'start', o: 'doc', v })), v).not.toBeNull();
    expect(validate(body({ ...BASE, e: 'start', o: 'build', v: 'blank' }))).not.toBeNull();
    for (const v of ['견적서', '홍길동', '640000', 'sealed', 'quotation-blank']) expect(validate(body({ ...BASE, e: 'start', o: 'doc', v })), v).toBeNull();
    for (const v of ['hwp', 'pdf']) expect(validate(body({ ...BASE, e: 'download', o: 'format', v })), v).not.toBeNull();
    expect(validate(body({ ...BASE, e: 'next', o: 'next', v: 'pdf-sign' }))).not.toBeNull();
    expect(validate(body({ ...BASE, t: 'stamp-maker', e: 'next', o: 'next', v: 'quotation' }))).not.toBeNull();
  });
});

describe('견적서·거래명세서 만들기: in-tool lines and the totals box', () => {
  it('plain words; fixed file names in the download line', () => {
    const all = [
      ...Object.values(QT_COPY as unknown as Record<string, unknown>).filter((v): v is string => typeof v === 'string'),
      ...Object.values(QT_PROBLEMS),
      ...Object.values(SEAL_COPY as Record<string, unknown>).filter((v): v is string => typeof v === 'string'),
      ITEMS_COPY.pair(2),
      ITEMS_COPY.tooBig,
      QT_COPY.downloaded('견적서.pdf'),
    ];
    for (const s of all) expect(s).not.toMatch(/업로드|서버|브라우저|네트워크|메모리/);
    expect(ITEMS_COPY.pair(2)).toBe('품목 2: 수량과 단가를 함께 넣어 주세요.');
    expect(QT_COPY.downloaded('거래명세서.hwp')).toBe('「거래명세서.hwp」를 내려받았어요. 「다운로드」 폴더를 확인하세요.');
  });
  it('the box text is the ledger: 별도, 포함, 없음, nothing priced, too big', () => {
    const v = (vat: string) => ({ i1Name: 'a', i1Qty: '3', i1Price: '120000', i2Name: 'b', i2Qty: '10', i2Price: '25000', i3Name: 'c', i3Qty: '1', i3Price: '30000', vat });
    expect(totalsText(computeLedger(v('separate'), 8, 'separate'), ITEMS_COPY)).toEqual({
      rows: [
        ['공급가액 합계', '640,000원'],
        ['부가세', '64,000원'],
        ['합계', '704,000원'],
      ],
      hangul: '일금 칠십만사천원정',
    });
    expect(totalsText(computeLedger(v('included'), 8, 'included'), ITEMS_COPY).rows[1]).toEqual(['부가세', '58,181원']);
    expect(totalsText(computeLedger(v('none'), 8, 'none'), ITEMS_COPY).rows[1]).toEqual(['부가세', '없음']);
    expect(totalsText(computeLedger({}, 8, 'separate'), ITEMS_COPY)).toEqual({ rows: [['공급가액 합계', '0원'], ['부가세', '0원'], ['합계', '0원']], hangul: '' });
    expect(totalsText(computeLedger({ i1Qty: '2', i1Price: '9999999999' }, 8, 'none'), ITEMS_COPY).hangul).toBe('');
  });
});

describe('견적서·거래명세서 만들기: the seal picture', () => {
  it('sealFit: the long side at most 600 px, the aspect kept', () => {
    expect(SEAL_MAX_PX).toBe(600);
    expect(sealFit(1200, 600)).toEqual({ w: 600, h: 300 });
    expect(sealFit(300, 900)).toEqual({ w: 200, h: 600 });
    expect(sealFit(120, 100)).toEqual({ w: 120, h: 100 });
  });
  it('the worker takes only a PNG of a sane size; anything else builds without a seal', () => {
    const s = sealPng(120, 100);
    const buf = s.bytes.slice().buffer;
    expect(sealExtras({ bytes: buf, w: 120, h: 100 }).seal).toMatchObject({ w: 120, h: 100, ext: 'png' });
    expect(sealExtras(undefined)).toEqual({});
    expect(sealExtras({ bytes: new Uint8Array([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0, 0]).buffer, w: 1, h: 1 })).toEqual({});
    expect(sealExtras({ bytes: buf, w: 601, h: 100 })).toEqual({});
    expect(sealExtras({ bytes: buf, w: 0, h: 100 })).toEqual({});
    expect(sealExtras({ bytes: 'x' as unknown as ArrayBuffer, w: 1, h: 1 })).toEqual({});
  });
  it('sendToQuotation stores the PNG with its source and opens /quotation/, which reads it once and removes it', async () => {
    const mem = new Map<string, string>();
    const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
    const g = globalThis as unknown as { window?: unknown };
    const had = 'window' in g;
    const prev = g.window;
    g.window = { sessionStorage: store };
    try {
      const went: string[] = [];
      const events: unknown[] = [];
      const ok = await sendToQuotation(new Blob([sealPng().bytes.slice()], { type: 'image/png' }), 'stamp-maker', (p) => went.push(p), (e) => events.push(e));
      expect(ok).toBe(true);
      expect(went).toEqual([QUOTATION_PATH]);
      expect(events).toEqual([{ e: 'next', t: 'stamp-maker', o: 'next', v: 'quotation' }]);
      expect(mem.get(SIGN_FROM_KEY)).toBe('stamp-maker');
      expect(mem.get(SIGN_PNG_KEY)).toMatch(/^data:image\/png;base64,/);
      const taken = takeSignPng(store);
      expect(taken && taken !== 'invalid' && taken.from).toBe('stamp-maker');
      expect(mem.size).toBe(0);
    } finally {
      if (had) g.window = prev;
      else delete g.window;
    }
    expect(HANDOFF_FAILED_QUOTE).toBe('PNG를 내려받은 뒤 견적서 만들기의 「직인 그림 넣기」에서 골라 주세요.');
  });
});

describe('견적서·거래명세서 만들기: the tool note quotes the saved 부가가치세법 excerpt', () => {
  it('each law quote is in handoff/sources/quote1112/vat-law.txt and in the body, fetched 2026-11-12; no tax-advice or official claim', async () => {
    const { readToolNotes } = await import('../../scripts/ops/lib/guides.mjs');
    const note = readToolNotes().find((n: { slug: string }) => n.slug === 'quotation');
    expect(note?.path).toBe('/quotation/');
    const excerpt = readFileSync('handoff/sources/quote1112/vat-law.txt', 'utf8').replace(/\s+/g, ' ');
    const md = readFileSync('src/content/tool-notes/quotation.md', 'utf8').replace(/\r\n/g, '\n');
    const body = md.slice(md.indexOf('\n---\n', 4) + 5);
    const sources = (note?.sources ?? []) as { url: string; quote: string; retrieved: string }[];
    expect(sources).toHaveLength(3);
    for (const s of sources) {
      expect(s.url).toContain('lsiSeq=276117');
      expect(excerpt, s.quote).toContain(s.quote);
      expect(body, s.quote).toContain(`「${s.quote}」`);
      expect(s.retrieved).toBe('2026-11-12');
    }
    expect(body).toContain('이 도구가 만드는 견적서와 거래명세서는 세금계산서가 아닙니다.');
    expect(md).not.toMatch(/공식 (양식|서식)|법정 서식|법적 효력/);
  });
});
