// HWPX HWP 변환 (HWPX2HWP brief, test map "tools.ts" and "usage"): registration, SEO lengths, FAQ numbers from the
// limits, home order, service-worker lists, usage whitelist, the in-tool copy and the new error codes.
import { describe, expect, it } from 'vitest';
import { DESC_MAX, DESC_MIN, HOME_DESC_ORDER, TITLE_MAX, TITLE_SUFFIX } from '../../src/data/site';
import { LIVE_TOOLS, getTool } from '../../src/data/tools';
import { faqJsonLd } from '../../src/data/jsonld';
import { HWP_ERROR_CODES } from '../../src/lib/hwp/errors';
import { LIMITS, MB_DEC } from '../../src/lib/hwp/limits';
import { ERRORS } from '../../src/tools/hwp-shared/messages';
import { HX_COPY, LOSS_OTHER } from '../../src/tools/hwpx-to-hwp/copy';
import { FAIL_LABELS, TOOLS, TOOL_LABELS, validate } from '../../scripts/lib/usage.mjs';

const len = (s: string): number => [...s].length;
const BASE = { t: 'hwpx-to-hwp', via: 'direct', d: 'desktop', b: 'dev', w: 1 };
const body = (o: Record<string, unknown>): string => JSON.stringify(o);

describe('HWPX HWP 변환: tools.ts entry', () => {
  const t = getTool('hwpx-to-hwp');

  it('is live; name = h1; title ≤ 40 with the suffix, description 40–80 with the keyword; no 한컴 product names; no privacy claim', () => {
    expect(t.status).toBe('live');
    expect(LIVE_TOOLS.map((x) => x.slug)).toContain('hwpx-to-hwp');
    expect(t.name).toBe('HWPX HWP 변환');
    expect(t.h1).toBe(t.name);
    expect(t.title.endsWith(TITLE_SUFFIX)).toBe(true);
    expect(len(t.title)).toBeLessThanOrEqual(TITLE_MAX);
    expect(len(t.description)).toBeGreaterThanOrEqual(DESC_MIN);
    expect(len(t.description)).toBeLessThanOrEqual(DESC_MAX);
    expect(t.description).toMatch(/hwpx.*hwp로/);
    for (const s of [t.name, t.title]) expect(s).not.toMatch(/한컴뷰어|한컴오피스/);
    expect(t.description).not.toMatch(/밖으로|보내지 않/);
  });

  it('6 FAQ entries (FAQPage JSON-LD); the size answer reads the HWP hard limits', () => {
    expect(t.faq).toHaveLength(6);
    expect((faqJsonLd(t) as { mainEntity: unknown[] }).mainEntity).toHaveLength(6);
    const phone = t.faq.find((f) => f.q.startsWith('휴대폰'))!.a;
    expect(phone).toContain(`${(LIMITS.mobile.hardBytes / MB_DEC).toLocaleString('ko-KR')} MB`);
    expect(phone).toContain(`${(LIMITS.desktop.hardBytes / MB_DEC).toLocaleString('ko-KR')} MB`);
    expect(t.faq.find((f) => f.q.includes('비밀번호'))!.a).toContain('비밀번호가 걸린 문서는 바꿀 수 없습니다.');
    expect(t.faq.find((f) => f.q.includes('저장'))!.a).toContain('.hwp');
  });

  it('home description order: right after HWP PDF 변환', () => {
    expect(HOME_DESC_ORDER.indexOf('hwpx-to-hwp')).toBe(HOME_DESC_ORDER.indexOf('hwp-to-pdf') + 1);
  });

  it('service worker: not precached, stored when visited', async () => {
    const { NOT_PRECACHED } = await import('../../scripts/gen-sw.mjs');
    const { RUNTIME_PAGES } = await import('../../src/sw/sw');
    expect(NOT_PRECACHED('/hwpx-to-hwp/')).toBe(true);
    expect(RUNTIME_PAGES).toContain('/hwpx-to-hwp/');
  });
});

describe('HWPX HWP 변환: copy and error codes', () => {
  it('the new codes have plain Korean copy (no English, no raw code)', () => {
    for (const c of ['already-hwp', 'unverified', 'export'] as const) {
      expect(HWP_ERROR_CODES).toContain(c);
      expect(ERRORS[c]).toMatch(/[가-힣]/);
      expect(ERRORS[c].replace(/HWP|PDF/g, '')).not.toMatch(/[A-Za-z]/);
    }
    expect(ERRORS['already-hwp'].startsWith('이미 HWP 파일이에요.')).toBe(true);
    expect(ERRORS.export).toContain('바꾸지 못했어요');
  });

  it('loss warning: the brief sentence with the count; the only label is 기타 (rhwp documents no loss kinds)', () => {
    expect(HX_COPY.losses(2)).toBe('HWP로 옮기지 못한 내용이 2곳 있어요. 한글에서 꼭 확인한 뒤 내세요.');
    expect(HX_COPY.lossItem(LOSS_OTHER, 2)).toBe('기타 2곳');
    expect(HX_COPY.ready('adm14.hwp')).toBe('「adm14.hwp」를 만들었어요. 「HWP 내려받기」를 누르세요.');
    expect(HX_COPY.downloaded('보고서.hwp')).toBe('「보고서.hwp」를 내려받았어요. 「다운로드」 폴더를 확인하세요.');
  });
});

describe('HWPX HWP 변환: usage whitelist (no file data)', () => {
  it('tool and label are whitelisted; every fail code the page sends passes and has a Korean label; no settings', () => {
    expect(TOOLS).toContain('hwpx-to-hwp');
    expect(TOOL_LABELS['hwpx-to-hwp' as keyof typeof TOOL_LABELS]).toBe('HWPX HWP 변환');
    for (const e of ['pick', 'start', 'success', 'download']) expect(validate(body({ ...BASE, e })), e).not.toBeNull();
    const SENT = ['not-hwp', 'already-hwp', 'unsupported', 'password', 'distribution', 'corrupt', 'too-large', 'oom', 'timeout', 'engine', 'unverified', 'export'];
    for (const c of SENT) {
      expect(validate(body({ ...BASE, e: 'fail', c, p: 'parse' })), c).not.toBeNull();
      expect(FAIL_LABELS[c as keyof typeof FAIL_LABELS], c).toMatch(/[가-힣]/);
    }
    // A start event never carries a setting for this tool (no SETTINGS key), so no page count or loss kind can ride on one.
    expect(validate(body({ ...BASE, e: 'start', o: 'pages', v: '9' }))).toBeNull();
  });
});
