// CARD1026 C11: the 명함 그림 layout (src/tools/business-card/layout.ts) with a fake measure: every line inside the text
// box and clear of the QR in both layouts, the all-max card included; shrink, then a 2-line 주소, then 「…」.
import { describe, expect, it } from 'vitest';
import { CARD_LAYOUTS, CARD_MIN_MODULE_PX, SPECS, cardModulePx, layoutCard, type CardPlan, type Measure } from '../../src/tools/business-card/layout';
import { CONTACT_MAX, type ContactFields } from '../../src/lib/qr/vcard';

/** Hangul and other wide letters 1 em, ASCII 0.6 em; bold a little wider. */
const measure: Measure = (text, px, weight) => [...text].reduce((w, c) => w + (c.codePointAt(0)! > 0x7f ? 1 : 0.6), 0) * px * (weight >= 700 ? 1.05 : 1);

const EMPTY: ContactFields = { last: '', first: '', org: '', dept: '', title: '', mobile: '', work: '', fax: '', email: '', url: '', address: '', note: '' };
const f = (x: Partial<ContactFields>): ContactFields => ({ ...EMPTY, ...x });
const max = (k: keyof ContactFields, ch = '가'): string => ch.repeat(CONTACT_MAX[k]);
const ALL_MAX: ContactFields = {
  last: max('last'),
  first: max('first'),
  org: max('org'),
  dept: max('dept'),
  title: max('title'),
  mobile: max('mobile', '0'),
  work: max('work', '0'),
  fax: max('fax', '0'),
  email: max('email'),
  url: max('url'),
  address: max('address'),
  note: max('note'),
};

function expectInside(plan: CardPlan, layout: 'wide' | 'tall'): void {
  const box = SPECS[layout].text;
  for (const l of plan.lines) {
    expect(measure(l.text, l.px, l.weight), l.text).toBeLessThanOrEqual(l.w);
    expect(l.x).toBe(box.x);
    expect(l.w).toBe(box.w);
    expect(l.y).toBeGreaterThanOrEqual(box.y);
    expect(l.y + l.h).toBeLessThanOrEqual(box.y + box.h);
    expect(l.px).toBeLessThanOrEqual(l.h);
    // Clear of the QR square.
    const q = plan.qr;
    const overlaps = l.x < q.x + q.w && l.x + l.w > q.x && l.y < q.y + q.h && l.y + l.h > q.y;
    expect(overlaps, l.text).toBe(false);
  }
  for (let i = 1; i < plan.lines.length; i++) expect(plan.lines[i]!.y).toBeGreaterThanOrEqual(plan.lines[i - 1]!.y + plan.lines[i - 1]!.h);
  expect(plan.qr.x + plan.qr.w).toBeLessThanOrEqual(plan.width);
  expect(plan.qr.y + plan.qr.h).toBeLessThanOrEqual(plan.height);
}

describe('layoutCard', () => {
  it('sizes: 가로 1800×1000, 세로 1080×1350', () => {
    expect(layoutCard(f({ last: '홍' }), 'wide', measure)).toMatchObject({ width: 1800, height: 1000 });
    expect(layoutCard(f({ last: '홍' }), 'tall', measure)).toMatchObject({ width: 1080, height: 1350 });
  });

  it('reading order: name, 직함 · 부서, 회사, 휴대폰, 전화, FAX, 이메일, 홈페이지, 주소; no 메모; normal sizes, no cut', () => {
    const fields = f({ last: '홍', first: '길동', org: '예시 회사', dept: '영업부', title: '과장', mobile: '010-1234-5678', work: '02-123-4567', fax: '02-123-4568', email: 'hong@example.com', url: 'example.com', address: '서울 중구 세종대로 110', note: '메모는 그리지 않음' });
    for (const layout of CARD_LAYOUTS) {
      const plan = layoutCard(fields, layout, measure);
      expect(plan.lines.map((l) => l.text)).toEqual(['홍길동', '과장 · 영업부', '예시 회사', '휴대폰 010-1234-5678', '전화 02-123-4567', 'FAX 02-123-4568', 'hong@example.com', 'example.com', '서울 중구 세종대로 110']);
      expect(plan.lines.map((l) => l.role)).toEqual(['name', 'role', 'org', 'info', 'info', 'info', 'info', 'info', 'info']);
      const st = SPECS[layout].styles;
      for (const l of plan.lines) {
        expect(l.px).toBe(st[l.role].px);
        expect(l.ellipsis).toBe(false);
      }
      expectInside(plan, layout);
    }
  });

  it('company only: the company is the big line and is not repeated; a Latin name reads 이름 성', () => {
    expect(layoutCard(f({ org: '문서딱 상회', mobile: '010-1' }), 'wide', measure).lines.map((l) => l.text)).toEqual(['문서딱 상회', '휴대폰 010-1']);
    expect(layoutCard(f({ last: 'Hong', first: 'Gildong', org: 'ACME' }), 'wide', measure).lines.map((l) => l.text)).toEqual(['Gildong Hong', 'ACME']);
  });

  it('a long line shrinks first, never below its floor', () => {
    const plan = layoutCard(f({ last: '가'.repeat(10) }), 'wide', measure);
    const name = plan.lines[0]!;
    expect(name.px).toBeLessThan(SPECS.wide.styles.name.px);
    expect(name.px).toBeGreaterThanOrEqual(SPECS.wide.styles.name.floor);
    expect(name.ellipsis).toBe(false);
  });

  it('주소 too long even at the floor takes two lines, broken at a space; past that 「…」', () => {
    const address = '서울특별시 종로구 세종대로 일백칠십오 정부서울청사 별관 앞 길 건너편 가나다라마바사 빌딩 십층';
    const plan = layoutCard(f({ last: '홍', address }), 'tall', measure);
    const lines = plan.lines.filter((l) => l.role === 'info');
    expect(lines).toHaveLength(2);
    expect(lines[0]!.text.endsWith(' ')).toBe(false);
    expect(`${lines[0]!.text} ${lines[1]!.text}`.replace('…', '')).toContain(lines[0]!.text);
    expect(address.startsWith(lines[0]!.text)).toBe(true);
    expectInside(plan, 'tall');
    const huge = layoutCard(f({ last: '홍', address: max('address') }), 'tall', measure).lines.filter((l) => l.role === 'info');
    expect(huge).toHaveLength(2);
    expect(huge[1]!.ellipsis).toBe(true);
    expect(huge[1]!.text.endsWith('…')).toBe(true);
  });

  it('the all-max card fits both layouts: every line in its box, at most 2 주소 lines, cut lines flagged', () => {
    for (const layout of CARD_LAYOUTS) {
      const plan = layoutCard(ALL_MAX, layout, measure);
      expectInside(plan, layout);
      // name, role, org, 3 phones, email, url, 2 address lines.
      expect(plan.lines).toHaveLength(10);
      expect(plan.lines[0]!.ellipsis).toBe(true);
      expect(plan.lines.filter((l) => l.ellipsis).every((l) => l.text.endsWith('…'))).toBe(true);
      for (const l of plan.lines) expect(l.px).toBeGreaterThanOrEqual(SPECS[layout].styles[l.role].floor);
    }
  });

  it('several spaces in a value read as one', () => {
    expect(layoutCard(f({ org: '예시   회사' }), 'wide', measure).lines[0]!.text).toBe('예시 회사');
  });
});

describe('cardModulePx (review C: the card QR module floor)', () => {
  it('is the largest whole pixel size that fits the QR square with the 4-module quiet zone', () => {
    // 세로 460 px: version 22 (105 modules) still 4 px, version 23 (109) 3 px → the hint.
    expect(cardModulePx('tall', 105)).toBe(4);
    expect(cardModulePx('tall', 109)).toBe(3);
    // 가로 600 px: version 31 (141 modules) 4 px, version 32 (145) 3 px.
    expect(cardModulePx('wide', 141)).toBe(4);
    expect(cardModulePx('wide', 145)).toBe(3);
    // Version 40 (177 modules, the all-max contact): under the floor in both layouts.
    expect(cardModulePx('tall', 177)).toBe(2);
    expect(cardModulePx('wide', 177)).toBe(3);
    expect(CARD_MIN_MODULE_PX).toBe(4);
    for (const layout of CARD_LAYOUTS) for (const n of [21, 105, 177]) expect(cardModulePx(layout, n) * (n + 8)).toBeLessThanOrEqual(SPECS[layout].qr.w);
  });
});
