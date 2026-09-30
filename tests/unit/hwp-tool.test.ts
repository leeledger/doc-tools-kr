// HWP PDF 변환: svg-string, guidance, copy, watchdog, parse-error mapping, @page CSS, fixture cap, site data.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HwpError } from '../../src/lib/hwp/errors';
import { classifyParseError, openDocument, pageInfos, renderPage, type RhwpDocument } from '../../src/lib/hwp/engine';
import { MB_DEC, MIB } from '../../src/lib/hwp/limits';
import { route } from '../../src/lib/hwp/route';
import { pick, rewriteFonts, scopeIds } from '../../src/lib/hwp/svg-string';
import { LIVE_TOOLS, getTool } from '../../src/data/tools';
import { faqJsonLd } from '../../src/data/jsonld';
import { COPY, ERRORS, HANCOM_NOTICE, TRADEMARK_NOTICE, tooLargeMessage, viewerFirstMessage, viewerOnlyMessage } from '../../src/tools/hwp-to-pdf/messages';
import { createWatchdog, WATCHDOG_MS } from '../../src/tools/hwp-to-pdf/watchdog';
import { HWP_CORPUS } from '../helpers/hwp';

const ROOT = join(__dirname, '..', '..');

describe('svg-string: pick() (spike §4 table) and rewriteFonts', () => {
  const S = "'Anolim HWP Serif','Anolim HWP Fallback',serif";
  const SANS = "'Anolim HWP Sans','Anolim HWP Fallback',sans-serif";
  it.each([
    ["'함초롬바탕','HCR Batang','Noto Serif KR',serif", S, false],
    ["'한컴바탕',serif", S, false],
    ["'바탕','Batang',serif", S, false],
    ["'휴먼명조','Noto Serif KR',serif", S, false],
    ["'함초롬돋움','HCR Dotum',sans-serif", SANS, false],
    ["'굴림','Gulim',sans-serif", SANS, false],
    ["'돋움',sans-serif", SANS, false],
    ["'HY헤드라인M',sans-serif", SANS, true],
    ["'HY견고딕',sans-serif", SANS, true],
    ["'HY견명조',serif", SANS, true],
    ["'H2hdrM',serif", SANS, true],
    ["'나눔명조',serif", "'Anolim HWP Myeongjo','Anolim HWP Fallback',serif", false],
    ["'NanumGothic',sans-serif", "'Anolim HWP Gothic','Anolim HWP Fallback',sans-serif", false],
    ["'맑은 고딕','Malgun Gothic',sans-serif", "'Pretendard Variable','Anolim HWP Fallback',sans-serif", false],
    ["&apos;Pretendard&apos;,sans-serif", "'Pretendard Variable','Anolim HWP Fallback',sans-serif", false],
    ['Arial', SANS, false],
  ])('%s', (chain, family, bold) => {
    expect(pick(chain)).toEqual({ family, bold });
  });

  it('rewrites every font-family attribute, HEAVY adds font-weight 700', () => {
    const out = rewriteFonts('<text font-family="\'HY헤드라인M\',sans-serif">A</text><text font-family="\'바탕\',serif">B</text>');
    expect(out).toBe(`<text font-family="${SANS}" font-weight="700">A</text><text font-family="${S}">B</text>`);
  });
  it('a HEAVY face on an element that already has font-weight gets one font-weight="700", never two (XML error)', () => {
    const out = rewriteFonts(`<text x="1" font-family="'HY헤드라인M',sans-serif" font-size="20" font-weight="bold" fill="#000">A</text>`);
    expect(out.match(/font-weight=/g)).toHaveLength(1);
    expect(out).toContain('font-weight="700"');
    const plain = rewriteFonts(`<text font-family="'바탕',serif" font-weight="bold">B</text>`);
    expect(plain).toContain('font-weight="bold"');
  });
});

describe('svg-string: scopeIds', () => {
  const svg = '<svg><defs><clipPath id="body-clip-3"><rect/></clipPath><pattern id="pat1"/></defs><g clip-path="url(#body-clip-3)"><use href="#pat1"/><use xlink:href="#pat1"/></g><g solid="x"/></svg>';
  it('scopes id, url(), href and xlink:href; solid= is untouched (word boundary)', () => {
    const out = scopeIds(svg, 'p3_');
    expect(out).toContain('id="p3_body-clip-3"');
    expect(out).toContain('id="p3_pat1"');
    expect(out).toContain('url(#p3_body-clip-3)');
    expect(out).toContain('href="#p3_pat1"');
    expect(out).toContain('xlink:href="#p3_pat1"');
    expect(out).toContain('solid="x"');
  });

  it('a scoped url(#…) resolves to a scoped id', () => {
    const out = scopeIds(svg, 'p7_');
    const ids = new Set([...out.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
    for (const m of out.matchAll(/url\(#([^)]+)\)/g)) expect(ids.has(m[1])).toBe(true);
    for (const m of out.matchAll(/href="#([^"]+)"/g)) expect(ids.has(m[1])).toBe(true);
  });

  it('the source uses the two characters backslash + b, never byte 0x08', () => {
    const src = readFileSync(join(ROOT, 'src', 'lib', 'hwp', 'svg-string.ts'));
    expect(src.includes(0x08)).toBe(false);
    expect(src.toString('utf8')).toContain('/\\bid="([^"]+)"/g');
  });
});

describe('copy', () => {
  it('verbatim notices', () => {
    expect(HANCOM_NOTICE).toBe('본 제품은 한컴의 HWP 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.');
    expect(TRADEMARK_NOTICE).toBe('한글, 한컴, HWP, HWPX는 한글과컴퓨터의 등록상표이며, 본 서비스는 한글과컴퓨터와 무관합니다.');
  });

  it('error copy per code; password verbatim', () => {
    expect(ERRORS.password).toBe('비밀번호가 걸린 문서는 열 수 없습니다. 한글 프로그램에서 암호를 해제한 뒤 다시 시도해 주세요.');
    expect(ERRORS['not-hwp'].startsWith('한글(HWP·HWPX) 문서가 아닙니다')).toBe(true);
    expect(ERRORS.distribution.startsWith('배포용 문서는 열 수 없습니다')).toBe(true);
    expect(tooLargeMessage('mobile', 26 * MB_DEC, 25 * MB_DEC)).toBe('휴대폰에서는 25 MB까지 열 수 있습니다 (이 파일 26 MB). 컴퓨터에서 열어 주세요.');
  });

  it('viewer-first banners: what may differ, then an invitation to check the preview (SPIKE-HWP-DIRECT §6.6)', () => {
    expect(viewerFirstMessage([{ kind: 'textboxes', value: 9 }])).toBe('글상자·도형이 많아 위치가 원본과 다를 수 있습니다. 미리보기로 확인한 뒤 내려받으세요.');
    expect(viewerFirstMessage([{ kind: 'long', value: 128 }])).toBe('100쪽 이상인 문서라 쪽 나눔이 원본과 다를 수 있습니다. 미리보기로 확인한 뒤 내려받으세요.');
    expect(viewerFirstMessage([{ kind: 'textboxes', value: 9 }, { kind: 'long', value: 128 }])).toBe('글상자·도형이 많고 100쪽 이상인 문서라 위치와 쪽 나눔이 원본과 다를 수 있습니다. 미리보기로 확인한 뒤 내려받으세요.');
  });

  it('viewer-only banners with numbers; desktop drops the last sentence', () => {
    const r = route({ device: 'mobile', fileBytes: 238_366, pages: 128, wasmBytes: 30 * MIB, imageBytes: 0, textboxes: 10 });
    expect(viewerOnlyMessage('mobile', r.reasons)).toBe('이 기기에서는 60쪽이 넘는 문서는 PDF로 내려받을 수 없어 보기만 할 수 있습니다 (이 문서 128쪽). 컴퓨터에서 열면 내려받을 수 있습니다.');
    const d = route({ device: 'desktop', fileBytes: 81 * MB_DEC, pages: 3, wasmBytes: 0, imageBytes: 0, textboxes: 0 });
    expect(viewerOnlyMessage('desktop', d.reasons)).toBe('이 기기에서는 80 MB가 넘는 문서는 PDF로 내려받을 수 없어 보기만 할 수 있습니다 (이 문서 81 MB).');
    const m = route({ device: 'mobile', fileBytes: 10_500_000, pages: 1, wasmBytes: 0, imageBytes: 0, textboxes: 0 });
    expect(viewerOnlyMessage('mobile', m.reasons)).toContain('10 MB가 넘는 문서');
    const i = route({ device: 'mobile', fileBytes: 9_300_000, pages: 11, wasmBytes: 0, imageBytes: 9_100_000, textboxes: 0 });
    expect(viewerOnlyMessage('mobile', i.reasons)).toContain('그림이 8 MB가 넘게');
    const w = route({ device: 'mobile', fileBytes: 1000, pages: 1, wasmBytes: 300 * MIB, imageBytes: 0, textboxes: 0 });
    expect(viewerOnlyMessage('mobile', w.reasons)).toContain('열 때 256 MB가 넘게 필요한 문서는');
    expect(COPY.note).toBe('원본 프로그램과 글꼴·줄바꿈이 조금 다를 수 있습니다.');
  });

  it('stage readouts and the export line (SPIKE-HWP-DIRECT §6.7, §6.8)', () => {
    expect(COPY.engine(43)).toBe('처음 한 번만 문서 여는 프로그램을 받는 중 · 43%');
    expect(COPY.firstPage(26)).toBe('1/26쪽 보여 드리는 중');
    expect(COPY.exporting(12, 26)).toBe('PDF 만드는 중 12/26쪽');
    expect(COPY.exporting(1200, 1500)).toBe('PDF 만드는 중 1,200/1,500쪽');
    expect(COPY.canceled).toBe('PDF 만들기를 취소했습니다.');
    expect(ERRORS.oom).toBe('이 기기에서 열기에는 문서가 너무 큽니다. 컴퓨터에서 열거나 Chrome·삼성 인터넷 등 다른 앱으로 열어 주세요.');
  });
});

describe('watchdog (fake timers)', () => {
  afterEach(() => vi.useRealTimers());
  it('fires after 90 s without a kick, never while kicked, never after stop', () => {
    vi.useFakeTimers();
    const fire = vi.fn();
    const w = createWatchdog(fire);
    w.kick();
    vi.advanceTimersByTime(WATCHDOG_MS - 1);
    w.kick();
    vi.advanceTimersByTime(WATCHDOG_MS - 1);
    expect(fire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fire).toHaveBeenCalledTimes(1);
    w.kick();
    w.stop();
    vi.advanceTimersByTime(WATCHDOG_MS * 2);
    expect(fire).toHaveBeenCalledTimes(1);
    expect(WATCHDOG_MS).toBe(90_000);
  });
});

describe('engine: parse errors and pages (fake rhwp)', () => {
  class Throwing {
    constructor() {
      throw new Error('invalid document');
    }
  }
  class Oom {
    constructor() {
      throw new RangeError('WebAssembly.Memory.grow(): Maximum memory size exceeded');
    }
  }
  const code = (fn: () => unknown): string => {
    try {
      fn();
      return 'none';
    } catch (e) {
      return e instanceof HwpError ? e.code : 'other';
    }
  };

  it('a throwing parse is corrupt, or distribution when the flag is set; RangeError / out of memory is oom', () => {
    const bytes = new Uint8Array(4);
    expect(code(() => openDocument(Throwing as never, bytes, { distribution: false }))).toBe('corrupt');
    expect(code(() => openDocument(Throwing as never, bytes, { distribution: true }))).toBe('distribution');
    expect(code(() => openDocument(Oom as never, bytes, { distribution: true }))).toBe('oom');
    expect(classifyParseError(new Error('out of memory'), { distribution: false })).toBe('oom');
  });

  it('renderPage scopes ids per page and maps fonts; pageInfos reads sizes; getPageText is never called', () => {
    const calls: string[] = [];
    const doc: RhwpDocument & { getPageText(): string } = {
      pageCount: () => 2,
      getPageInfo: (i) => JSON.stringify({ width: 793.7 + i, height: 1122.5 }),
      renderPageSvg: () => '<svg><clipPath id="c1"/><g clip-path="url(#c1)"><text font-family="\'바탕\',serif">가</text></g></svg>',
      getPageTextLayout: () => JSON.stringify({ runs: [{ text: 'a b', x: 1, y: 2, h: 3, charX: [0, 5, 10, 15], fontFamily: 'x' }, { text: 'ab', x: 0, y: 0, h: 1, charX: [0] }] }),
      getPageText: () => {
        calls.push('getPageText');
        return '';
      },
      free: () => undefined,
    };
    expect(pageInfos(doc, 2)).toEqual([{ w: 793.7, h: 1122.5 }, { w: 794.7, h: 1122.5 }]);
    const p = renderPage(doc, 1);
    expect(p.svg).toContain('id="p1_c1"');
    expect(p.svg).toContain('url(#p1_c1)');
    expect(p.svg).toContain("'Anolim HWP Serif'");
    expect(p.runs).toEqual([{ text: 'a b', x: 1, y: 2, h: 3, charX: [0, 5, 10, 15] }]);
    expect(calls).toEqual([]);
  });
});

describe('fixtures and site data', () => {
  it('tests/corpus/hwp stays within its 3 MB cap', () => {
    const total = readdirSync(HWP_CORPUS).reduce((a, f) => a + statSync(join(HWP_CORPUS, f)).size, 0);
    expect(total).toBeLessThanOrEqual(3 * 1024 * 1024);
  });

  it('hwp-to-pdf is live with the brief keywords and an 80–120 character description', () => {
    const t = getTool('hwp-to-pdf');
    expect(t.status).toBe('live');
    expect(t.name).toBe('HWP PDF 변환');
    expect(LIVE_TOOLS.map((x) => x.slug)).toContain('hwp-to-pdf');
    const n = [...t.description].length;
    expect(n).toBeGreaterThanOrEqual(80);
    expect(n).toBeLessThanOrEqual(120);
    expect(t.description).toContain('hwp pdf 변환');
    expect(t.description).toContain('한글파일 PDF로 변환');
    expect(t.description).toContain('밖으로 보내지 않습니다');
    expect(t.keywords).toEqual(['hwp pdf 변환', '한글파일 pdf로 변환', '한글파일 pdf 변환', 'hwp 뷰어', 'hwpx 변환', 'hwpx 열기']);
    expect(t.faq.map((f) => f.q)).toHaveLength(8);
    const ld = faqJsonLd(t) as { '@type': string; mainEntity: unknown[] };
    expect(ld['@type']).toBe('FAQPage');
    expect(ld.mainEntity).toHaveLength(8);
  });
});

describe('service worker and carry-forward cover the HWP assets (cache on use, never precached)', () => {
  it('SW routes /vendor/rhwp/ and /fonts/hwp/ as runtime (cache-first on use)', async () => {
    const { route: swRoute } = await import('../../src/sw/sw');
    const origin = 'https://doc-tools-kr.pages.dev';
    const req = (path: string) => ({ method: 'GET', url: `${origin}${path}`, mode: 'cors' });
    expect(swRoute(req('/vendor/rhwp/0.8.6/rhwp_bg.wasm'), origin)).toBe('runtime');
    expect(swRoute(req('/fonts/hwp/noto-serif-kr@5.3.0/noto-serif-kr-0-400-normal.woff2'), origin)).toBe('runtime');
    expect(swRoute(req('/fonts/hwp/hwp-fonts.0123456789.css'), origin)).toBe('runtime');
  });

  it('carry-forward treats both folders as immutable', async () => {
    const { IMMUTABLE, safePath } = await import('../../scripts/carry-assets.mjs');
    for (const p of ['vendor/rhwp/0.8.6/rhwp_bg.wasm', 'fonts/hwp/nanum-gothic@5.3.0/nanum-gothic-0-700-normal.woff2', 'fonts/hwp/fallback@noto-sans-cjk-kr-2.004/anolim-hwp-fallback.woff2']) {
      expect(IMMUTABLE.test(p)).toBe(true);
      expect(safePath(p)).toBe(true);
    }
  });
});

describe('downscale: photo vs line art (Arch F2)', () => {
  const img = (w: number, h: number, px: (x: number, y: number) => [number, number, number, number]): Uint8ClampedArray => {
    const d = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d.set(px(x, y), (y * w + x) * 4);
    return d;
  };
  it('noise is a photo; alpha, ≤ 64 colours or mostly flat rows are not', async () => {
    const { isOpaquePhoto } = await import('../../src/lib/hwp/downscale');
    let seed = 7;
    const rnd = (): number => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) & 255;
    expect(isOpaquePhoto(img(64, 64, () => [rnd(), rnd(), rnd(), 255]), 64)).toBe(true);
    expect(isOpaquePhoto(img(64, 64, () => [rnd(), rnd(), rnd(), 254]), 64)).toBe(false);
    expect(isOpaquePhoto(img(64, 64, (x) => [x % 2 ? 0 : 255, 0, 0, 255]), 64)).toBe(false);
    // 128 rows of one colour each: 128 distinct colours (over 64) but 100 % flat, so line art.
    expect(isOpaquePhoto(img(64, 128, (_x, y) => [y * 2, y, 255 - y, 255]), 64)).toBe(false);
  });
});
