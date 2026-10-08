// @vitest-environment jsdom
// /hwp-viewer/ (G2 A0): zoom math, search folding and hit mapping, the page list window, the worker's glyph
// text, and the built page's legal lines (Hancom spec notice, trademark notice, no Hancom product names).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { glyphText } from '../../src/lib/hwp/svg-string';
import { HANCOM_NOTICE, TRADEMARK_NOTICE } from '../../src/tools/hwp-shared/messages';
import { VIEWER_COPY } from '../../src/tools/hwp-viewer/copy';
import { findAll, firstFrom, fold, glyphs, matchElements } from '../../src/tools/hwp-viewer/search';
import { joinGlyphs } from '../../src/tools/hwp-viewer/select';
import { TILE_H, VIRTUAL_ABOVE, visibleRows } from '../../src/tools/hwp-viewer/thumbs';
import { fitPage, fitWidth, initialMode, pageAt, percent, stepIn, stepOut, ZOOM_MAX, ZOOM_MIN } from '../../src/tools/hwp-viewer/zoom';
import { getTool } from '../../src/data/tools';
import { LIMITS, MB_DEC } from '../../src/lib/hwp/limits';

describe('zoom', () => {
  it('fit width uses the widest page; fit page the page in view', () => {
    expect(fitWidth({ w: 397, h: 500 }, [{ w: 794 }, { w: 1123 }])).toBeCloseTo(397 / 1123);
    expect(fitPage({ w: 800, h: 561 }, { w: 794, h: 1123 })).toBeCloseTo(0.5);
    expect(fitPage({ w: 300, h: 2000 }, { w: 600, h: 800 })).toBeCloseTo(0.5);
  });
  it('steps run 50–300 % and stop at the ends', () => {
    expect(stepIn(1)).toBe(1.25);
    expect(stepIn(0.46)).toBe(0.5);
    expect(stepOut(0.46)).toBe(ZOOM_MIN);
    expect(stepOut(1.3)).toBe(1.25);
    expect(stepIn(ZOOM_MAX)).toBe(ZOOM_MAX);
    expect(percent(0.4567)).toBe('46%');
  });
  it('phones open in fit width, wider screens in fit page', () => {
    expect(initialMode(412)).toBe('width');
    expect(initialMode(1280)).toBe('page');
  });
  it('the page in view is the last one whose top is above a third of the box', () => {
    const tops = (i: number): number => i * 1000;
    expect(pageAt(tops, 10, 0, 900)).toBe(0);
    expect(pageAt(tops, 10, 800, 900)).toBe(1);
    expect(pageAt(tops, 10, 99999, 900)).toBe(9);
  });
});

describe('search', () => {
  it('folds NFC and every space, so a word broken across lines is found', () => {
    expect(fold('한글 파일\n열기')).toBe('한글파일열기');
    expect(fold('가')).toBe('가');
    expect(findAll(fold('공무원 임용 공무원임용'), fold('공무원 임용'))).toEqual([0, 5]);
    expect(findAll('aaaa', 'aa')).toEqual([0, 2]);
    expect(findAll('abc', '')).toEqual([]);
  });
  it('the first hit shown is on or after the page in view', () => {
    const hits = [{ page: 1, k: 0 }, { page: 4, k: 0 }, { page: 4, k: 1 }];
    expect(firstFrom(hits, 3)).toBe(1);
    expect(firstFrom(hits, 9)).toBe(0);
    expect(firstFrom([], 0)).toBe(-1);
  });
  it('maps the k-th hit back to the glyph elements that draw it', () => {
    const els = ['가', '나', ' ', '다', '가', '나'].map((text, i) => ({ el: i, text }));
    const seq = glyphs(els);
    expect(seq.map((g) => g.ch).join('')).toBe('가나다가나');
    expect(matchElements(seq, '가나', 0)).toEqual([0, 1]);
    expect(matchElements(seq, '가나', 1)).toEqual([4, 5]);
    expect(matchElements(seq, '나다', 0)).toEqual([1, 3]);
    expect(matchElements(seq, '라', 0)).toEqual([]);
  });
});

describe('copy text', () => {
  const g = (text: string, x: number, y: number, size = 10) => ({ text, x, y, size });
  it('joins glyphs into words and lines: layer spaces kept, a new baseline breaks the line, a wide gap is a space', () => {
    const glyphs = [g('관', 0, 10), g('세', 10, 10), g(' ', 20, 10), g('법', 23, 10), g('표', 80, 10), g('다', 0, 30), g('음', 10, 30), g(' ', 20, 30)];
    expect(joinGlyphs(glyphs)).toBe('관세 법 표\n다음');
    expect(joinGlyphs([g(' ', 0, 0), g('a', 5, 0)])).toBe('a');
    expect(joinGlyphs([])).toBe('');
  });
});

describe('page list window', () => {
  it('lists every row up to 100 pages and only the visible rows (with overscan) above', () => {
    expect(visibleRows(VIRTUAL_ABOVE, 1, 5000, 600)).toEqual([0, VIRTUAL_ABOVE]);
    const [a, b] = visibleRows(400, 1, 100 * TILE_H, 4 * TILE_H);
    expect(a).toBe(97);
    expect(b).toBe(107);
    expect(visibleRows(400, 3, 0, 300)).toEqual([0, 5]);
  });
});

describe('glyphText (worker search text)', () => {
  it('joins every <text> content in drawing order, decoding entities and dropping inner tags', () => {
    const svg = '<svg><g><text x="1">가</text><text x="2">&amp;</text></g><text><tspan>&#xAC00;</tspan></text><text>&lt;b&gt;</text><rect/></svg>';
    expect(glyphText(svg)).toBe('가&가<b>');
    expect(glyphText('<svg><textPath>x</textPath></svg>')).toBe('');
  });
});

describe('tool entry and copy (legal)', () => {
  const t = getTool('hwp-viewer');
  it('the title, H1 and FAQ follow the brief; no Hancom product name anywhere in them', () => {
    expect(t.title).toBe('HWP 뷰어 — 한글 파일(hwp·hwpx) 설치 없이 열기 | 문서딱');
    expect(t.h1).toBe('HWP·HWPX 파일 보기');
    expect(t.status).toBe('live');
    const all = [t.title, t.name, t.h1, t.description, t.summary, ...t.faq.flatMap((f) => [f.q, f.a])].join('\n');
    expect(all).not.toMatch(/한컴\s*뷰어|한컴오피스/);
    expect(t.faq.some((f) => f.a.includes(HANCOM_NOTICE))).toBe(true);
  });
  it('the FAQ numbers are the limits the tool uses (25 MB / 150 MB to open, 10 MB or 60쪽 for a PDF on phones)', () => {
    const faq = t.faq.map((f) => f.a).join(' ');
    const mb = (b: number) => `${(b / MB_DEC).toLocaleString('ko-KR')} MB`;
    expect(faq).toContain(`${mb(LIMITS.mobile.hardBytes)}가 넘는 파일은 열 수 없습니다`);
    expect(faq).toContain(`PC에서는 ${mb(LIMITS.desktop.hardBytes)}까지 열 수 있습니다`);
    expect(faq).toContain(`${mb(LIMITS.mobile.capBytes)} 또는 ${LIMITS.mobile.capPages}쪽이 넘는 문서는 보기만`);
    expect([LIMITS.mobile.hardBytes, LIMITS.desktop.hardBytes, LIMITS.mobile.capBytes, LIMITS.mobile.capPages]).toEqual([25e6, 150e6, 10e6, 60]);
  });
  it('the line the brief fixes word for word', () => {
    expect(VIEWER_COPY.differ).toBe('원본과 다르게 보일 수 있어요.');
  });
});

const PAGE = join(__dirname, '..', '..', 'dist', 'hwp-viewer', 'index.html');
describe.skipIf(!existsSync(PAGE))('built /hwp-viewer/ (legal)', () => {
  const html = readFileSync(PAGE, 'utf8');
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const visible = (root: Element): string => {
    const c = root.cloneNode(true) as Element;
    for (const e of Array.from(c.querySelectorAll('script, style, [hidden]'))) e.remove();
    return c.textContent ?? '';
  };
  it('shows HANCOM_NOTICE (help and legal line), TRADEMARK_NOTICE and "원본과 다르게 보일 수 있어요."', () => {
    const text = visible(doc.body);
    expect(text.split(HANCOM_NOTICE).length - 1).toBeGreaterThanOrEqual(2);
    expect(text).toContain(TRADEMARK_NOTICE);
    expect(text).toContain(VIEWER_COPY.differ);
    // In the FAQ too (the details element and the FAQPage JSON-LD).
    expect(Array.from(doc.querySelectorAll('.faq details p')).some((p) => p.textContent?.includes(HANCOM_NOTICE))).toBe(true);
    const ld = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'), (s) => s.textContent ?? '').join('');
    expect(ld).toContain(HANCOM_NOTICE);
  });
  it('the name, title, OG, JSON-LD and page text never say 한컴뷰어 / 한컴 뷰어 / 한컴오피스', () => {
    const banned = /한컴\s*뷰어|한컴오피스/;
    const head = Array.from(doc.querySelectorAll('title, meta[property^="og:"], meta[name^="twitter:"], meta[name="description"]'), (e) => e.getAttribute('content') ?? e.textContent ?? '').join('\n');
    const ld = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'), (s) => s.textContent ?? '').join('');
    expect(head).not.toMatch(banned);
    expect(ld).not.toMatch(banned);
    expect(doc.body.textContent ?? '').not.toMatch(banned);
    expect(doc.querySelector('h1')?.textContent).toBe('HWP·HWPX 파일 보기');
    // No Hancom or 한글 logo: the page has no images beyond the site's own icon.
    expect(Array.from(doc.querySelectorAll('img')).map((i) => i.getAttribute('src'))).toEqual([]);
  });
});
