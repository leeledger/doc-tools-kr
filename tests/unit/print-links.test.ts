// 인화·사진관 링크 and 제휴 링크 (brief handoff/ARCHITECT-BRIEF-REV2.md "Test map", orchestrator update 2026-10-12):
// the link list, the flag, the disclosure and the link data.
import { describe, expect, it } from 'vitest';
import { AFF_COPY, AFF_DISCLOSURE, AFF_LINKS, COUPANG_DISCLOSURE, affLinks, affOn } from '../../src/data/affiliate';
import { PHOTO_STUDIO_URL, printDisclosure, printLinks } from '../../src/data/print-links';
import { OUT_DESTS, OUT_LABELS } from '../../scripts/lib/usage.mjs';

describe('printLinks (id-photo result)', () => {
  it('no env: only the info link (사진관 찾기), not sponsored, no disclosure', () => {
    const links = printLinks({});
    expect(links).toEqual([{ dest: 'photo-studio', href: PHOTO_STUDIO_URL, label: '가까운 사진관 찾기 (네이버 지도, 새 창)', sponsored: false }]);
    expect(PHOTO_STUDIO_URL).toBe('https://map.naver.com/p/search/%EC%82%AC%EC%A7%84%EA%B4%80');
    expect(printDisclosure(links)).toBeNull();
    for (const v of ['', '0', 'true', 'yes', ' 2 ']) expect(printLinks({ PUBLIC_PRINT_INFO: '1', PUBLIC_AFF_COUPANG: v })).toEqual(links);
  });

  it('PUBLIC_PRINT_INFO=0: no links at all (the block is not rendered)', () => {
    expect(printLinks({ PUBLIC_PRINT_INFO: '0' })).toEqual([]);
    expect(printLinks({ PUBLIC_PRINT_INFO: ' 0 ' })).toEqual([]);
  });

  it('PUBLIC_AFF_COUPANG=1: the three id-photo Coupang links after the info link, sponsored, 광고 in each name, the full disclosure', () => {
    const links = printLinks({ PUBLIC_AFF_COUPANG: ' 1 ' });
    expect(links.map((l) => [l.dest, l.sponsored])).toEqual([
      ['photo-studio', false],
      ['cp-printer', true],
      ['cp-paper', true],
      ['cp-backdrop', true],
    ]);
    expect(links.map((l) => l.href).slice(1)).toEqual(['https://link.coupang.com/a/hM1VvrGKdg', 'https://link.coupang.com/a/hM1W2wjBpA', 'https://link.coupang.com/a/hM1XIN1hgO']);
    for (const l of links.slice(1)) expect(l.label).toMatch(/\(쿠팡, 광고, 새 창\)$/);
    expect(printDisclosure(links)).toEqual({ disclosure: AFF_DISCLOSURE, head: '집에서 인화하려면' });
    expect(AFF_DISCLOSURE).toBe(`광고: 아래 링크로 주문하면 문서딱이 수수료를 받을 수 있어요. ${COUPANG_DISCLOSURE}`);
    expect(printLinks({ PUBLIC_PRINT_INFO: '0', PUBLIC_AFF_COUPANG: '1' }).map((l) => l.dest)).toEqual(['cp-printer', 'cp-paper', 'cp-backdrop']);
    // every rendered dest is whitelisted and labelled for the admin page
    expect(links.map((l) => l.dest)).toEqual(OUT_DESTS);
    for (const d of OUT_DESTS) expect(OUT_LABELS[d as keyof typeof OUT_LABELS]).toBeTruthy();
  });
});

describe('affiliate link data (src/data/affiliate.ts)', () => {
  it('COUPANG_DISCLOSURE is the Partners wording verbatim', () => {
    expect(COUPANG_DISCLOSURE).toBe('이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.');
  });

  it('every link: a link.coupang.com short link, a unique kind, 광고 in the name, no price, a placement with its line', () => {
    expect(AFF_LINKS.map((l) => [l.dest, l.placement])).toEqual([
      ['cp-printer', 'id-photo'],
      ['cp-paper', 'id-photo'],
      ['cp-backdrop', 'id-photo'],
      ['cp-stamp', 'stamp-signature'],
      ['cp-hancom', 'hwp'],
    ]);
    expect(new Set(AFF_LINKS.map((l) => l.dest)).size).toBe(AFF_LINKS.length);
    for (const l of AFF_LINKS) {
      expect(l.href).toMatch(/^https:\/\/link\.coupang\.com\/a\/[A-Za-z0-9]+$/);
      expect(l.label).toContain('광고');
      expect(l.label).not.toMatch(/[0-9,]+원|₩/);
      expect(AFF_COPY[l.placement]).toBeTruthy();
    }
  });

  it('affOn: only "1"; affLinks: none while off, the placement in order while on', () => {
    for (const v of [undefined, '', '0', 'true', 'on', '11']) expect(affOn(v), String(v)).toBe(false);
    expect(affOn('1')).toBe(true);
    expect(affOn(' 1\n')).toBe(true);
    expect(affLinks('stamp-signature', false)).toEqual([]);
    expect(affLinks('stamp-signature', true).map((l) => l.dest)).toEqual(['cp-stamp']);
    expect(affLinks('hwp', true).map((l) => l.dest)).toEqual(['cp-hancom']);
  });
});
