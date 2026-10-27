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
import { DESC_MAX, DESC_MIN, HOME_DESC_ORDER, TITLE_MAX, TITLE_SUFFIX } from '../../src/data/site';
import { LIVE_TOOLS, TOOLS, getTool } from '../../src/data/tools';
import { faqJsonLd } from '../../src/data/jsonld';
import { FLOW } from '../../src/lib/ui/next-steps';
import { RS_COPY } from '../../src/tools/resignation-letter/copy';
import { RS_TODAY } from '../../src/tools/resignation-letter/config';
import { DOWNLOAD_SETTING, TOOLS as USAGE_TOOLS, TOOL_LABELS, validate } from '../../scripts/lib/usage.mjs';

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

describe('사직서 만들기: tools.ts entry and registration (R2, R4, R12)', () => {
  const t = getTool('resignation-letter');
  const len = (s: string): number => [...s].length;
  it('is live, right after 차용증 만들기; name = h1; SEO lengths; the 사직서 양식 keyword; no privacy lead', () => {
    expect(t.status).toBe('live');
    const slugs = TOOLS.map((x) => x.slug);
    expect(slugs.indexOf('resignation-letter')).toBe(slugs.indexOf('loan-note') + 1);
    expect(LIVE_TOOLS.map((x) => x.slug)).toContain('resignation-letter');
    expect(t.h1).toBe(t.name);
    expect(t.name).toBe('사직서 만들기');
    expect(t.title.endsWith(TITLE_SUFFIX)).toBe(true);
    expect(len(t.title)).toBeLessThanOrEqual(TITLE_MAX);
    expect(len(t.description)).toBeGreaterThanOrEqual(DESC_MIN);
    expect(len(t.description)).toBeLessThanOrEqual(DESC_MAX);
    expect(t.description).toContain('사직서 양식');
    expect(t.description).not.toMatch(/밖으로|보내지 않/);
    expect(t.keywords).toEqual(expect.arrayContaining(['사직서 양식', '사직서 양식 hwp', '권고사직서', '사직서 쓰는법']));
    expect(t.faq).toHaveLength(5);
    expect((faqJsonLd(t) as { mainEntity: unknown[] }).mainEntity).toHaveLength(5);
  });
  it('R6/R8: 권고사직 FAQ = the preset + the 고용24 / 1350 pointer; no 실업급여, legal-effect or official claim in the core-font copy', () => {
    const faq = t.faq.find((f) => f.q.includes('권고사직서'))!;
    expect(faq.a).toContain('「회사 권고」를 고르면 됩니다.');
    expect(faq.a).toContain('고용24');
    expect(faq.a).toContain('1350');
    expect(JSON.stringify({ ...t, keywords: [] })).not.toMatch(/실업급여|구직급여|법적|효력|공식|법정 서식/);
  });
  it('R7: the 워드 FAQ says what we make, no claim about Word opening HWP', () => {
    const faq = t.faq.find((f) => f.q.includes('워드'))!;
    expect(faq.a).toContain('워드 파일은 만들지 않습니다.');
    expect(faq.a).not.toMatch(/워드에서 (열|HWP)/);
  });
  it('home description order after 차용증 만들기; the service worker stores it when visited', async () => {
    expect(HOME_DESC_ORDER.indexOf('resignation-letter')).toBe(HOME_DESC_ORDER.indexOf('loan-note') + 1);
    const { NOT_PRECACHED } = await import('../../scripts/gen-sw.mjs');
    const { RUNTIME_PAGES } = await import('../../src/sw/sw');
    expect(NOT_PRECACHED('/resignation-letter/')).toBe(true);
    expect(RUNTIME_PAGES).toContain('/resignation-letter/');
  });
  it('이어서 하기 (R11): 도장·서명 first, then 글자 넣기 and 용량 줄이기', () => {
    expect(FLOW['resignation-letter']).toEqual(['pdf-sign', 'pdf-edit', 'pdf-compress']);
  });
  it('R3 defaults: only 내는 날 starts at today', () => {
    expect(RS_TODAY).toEqual(['date']);
  });
});

describe('사직서 만들기: usage whitelist (R9)', () => {
  const BASE = { t: 'resignation-letter', via: 'direct', d: 'desktop', b: 'dev', w: 1 };
  const body = (o: Record<string, unknown>): string => JSON.stringify(o);
  it('a tool with its label; start carries build blank|filled only; download format hwp|pdf only; never a typed value or a preset', () => {
    expect(USAGE_TOOLS).toContain('resignation-letter');
    expect(TOOL_LABELS['resignation-letter' as keyof typeof TOOL_LABELS]).toBe('사직서 만들기');
    expect(DOWNLOAD_SETTING['resignation-letter' as keyof typeof DOWNLOAD_SETTING]).toBe('format');
    for (const v of ['blank', 'filled']) expect(validate(body({ ...BASE, e: 'start', o: 'build', v })), v).not.toBeNull();
    for (const v of ['홍길동', '회사 권고', '회사의 권고에 따른 퇴사(권고사직)', '2026-11-30']) {
      expect(validate(body({ ...BASE, e: 'start', o: 'build', v })), v).toBeNull();
      expect(validate(body({ ...BASE, e: 'start', o: 'preset', v })), v).toBeNull();
    }
    for (const v of ['hwp', 'pdf']) expect(validate(body({ ...BASE, e: 'download', o: 'format', v })), v).not.toBeNull();
    for (const v of ['pdf-sign', 'pdf-edit', 'pdf-compress']) expect(validate(body({ ...BASE, e: 'next', o: 'next', v })), v).not.toBeNull();
  });
});

describe('사직서 만들기: in-tool lines', () => {
  it('plain words, the right particle, fixed file names', () => {
    const all: string[] = [...Object.values(RS_COPY as unknown as Record<string, unknown>).filter((v): v is string => typeof v === 'string'), RS_COPY.engine(50), RS_COPY.downloaded('사직서.pdf')];
    for (const s of all) expect(s).not.toMatch(/업로드|서버|브라우저|네트워크|메모리|사직서을/);
    expect(RS_COPY.building).toBe('사직서를 만드는 중');
    expect(RS_COPY.stale).toBe('고친 내용으로 다시 만들어 주세요. 「사직서 만들기」를 누르면 새로 만들어요.');
    expect(RS_COPY.downloaded('사직서.hwp')).toBe('「사직서.hwp」를 내려받았어요. 「다운로드」 폴더를 확인하세요.');
  });
});

describe('사직서 만들기: the tool note quotes are in the source watch (check:quotes)', () => {
  it('readToolNotes lists the note with its 고용보험법 and 1350 sources, path = the tool page; no 실업급여 claim', async () => {
    const { readToolNotes } = await import('../../scripts/ops/lib/guides.mjs');
    const note = readToolNotes().find((n: { slug: string }) => n.slug === 'resignation-letter');
    expect(note?.path).toBe('/resignation-letter/');
    const urls = (note?.sources ?? []).map((s: { url?: string }) => s.url);
    for (const seq of ['lsiSeq=284449', '1350.moel.go.kr']) expect(urls.some((u: string | undefined) => u?.includes(seq)), seq).toBe(true);
    const { readFileSync } = await import('node:fs');
    const md = readFileSync('src/content/tool-notes/resignation-letter.md', 'utf8');
    expect(md).not.toMatch(/실업급여를 (받|못)|법적 효력|공식 (양식|서식)/);
  });
});

describe('사직서 만들기: the HWP kill switch (R13 RESIGN_HWP) and the presets are wired through', () => {
  it('page → FormTool hwp prop; the page inlines form-presets.css (POA / loan-note do not); controller → cfg.hwp', async () => {
    const { readFileSync } = await import('node:fs');
    const page = readFileSync('src/pages/resignation-letter/index.astro', 'utf8');
    expect(page).toMatch(/<FormTool [^>]*hwp=\{RESIGN_HWP\}/);
    expect(page).toContain('form-presets.css?inline');
    expect(page).toContain('set:html={formCss + presetsCss}');
    expect(readFileSync('src/tools/resignation-letter/controller.ts', 'utf8')).toContain('hwp: RESIGN_HWP');
    for (const other of ['loan-note', 'power-of-attorney']) expect(readFileSync(`src/pages/${other}/index.astro`, 'utf8'), other).not.toContain('form-presets.css');
  });
});
