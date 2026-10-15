// 인화·사진관 링크 and 제휴 링크 (briefs handoff/ARCHITECT-BRIEF-REV2.md "Test map" and handoff/ARCHITECT-BRIEF-REV3.md
// "Test map"): the id-photo info link, the link data, the placement maps, affBlock (flag, missing dests, max 3) and the
// drift guard between src/data/affiliate.ts and the server whitelist in scripts/lib/usage.mjs.
import { describe, expect, it } from 'vitest';
import { AFF_COPY, AFF_DISCLOSURE, AFF_LINKS, AFF_MAX, COUPANG_DISCLOSURE, GUIDE_AFF, GUIDE_LEAD, TOOL_AFF, TOOL_LEAD, affBlock, affOn, type AffLink } from '../../src/data/affiliate';
import { PHOTO_STUDIO_URL, printLinks } from '../../src/data/print-links';
import { GUIDE_OUT, OUT_DESTS, OUT_LABELS, TOOLS, TOOL_OUT } from '../../scripts/lib/usage.mjs';

describe('printLinks (id-photo result info link)', () => {
  it('every build: 사진관 찾기 (not sponsored); PUBLIC_PRINT_INFO=0 removes it', () => {
    expect(printLinks({})).toEqual([{ dest: 'photo-studio', href: PHOTO_STUDIO_URL, label: '가까운 사진관 찾기 (네이버 지도, 새 창)' }]);
    expect(PHOTO_STUDIO_URL).toBe('https://map.naver.com/p/search/%EC%82%AC%EC%A7%84%EA%B4%80');
    expect(printLinks({ PUBLIC_PRINT_INFO: '1' })).toHaveLength(1);
    expect(printLinks({ PUBLIC_PRINT_INFO: '0' })).toEqual([]);
    expect(printLinks({ PUBLIC_PRINT_INFO: ' 0 ' })).toEqual([]);
  });
});

describe('affiliate link data (src/data/affiliate.ts)', () => {
  it('COUPANG_DISCLOSURE is the Partners wording verbatim; the disclosure and the guide line', () => {
    expect(COUPANG_DISCLOSURE).toBe('이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.');
    expect(AFF_DISCLOSURE).toBe(`광고: 아래 링크로 주문하면 문서딱이 수수료를 받을 수 있어요. ${COUPANG_DISCLOSURE}`);
    expect(AFF_COPY.top).toBe('이 글에는 쿠팡 파트너스 광고 링크가 있어요. 링크로 사면 문서딱이 수수료를 받을 수 있어요.');
    expect(AFF_COPY.heading).toBe('도움이 되는 물건 (광고)');
  });

  it('every link: a link.coupang.com short link, a unique kind, 광고 and 새 창 in the name, no price, never 공식/정품/한컴 제공', () => {
    expect(AFF_LINKS.map((l) => l.dest)).toEqual(['cp-printer', 'cp-paper', 'cp-backdrop', 'cp-stamp', 'cp-hancom', 'cp-mfp', 'cp-scanner', 'cp-tripod']);
    expect(new Set(AFF_LINKS.map((l) => l.dest)).size).toBe(AFF_LINKS.length);
    for (const l of AFF_LINKS) {
      expect(l.href).toMatch(/^https:\/\/link\.coupang\.com\/a\/[A-Za-z0-9]+$/);
      expect(l.label).toMatch(/\(쿠팡, 광고, 새 창\)$/);
      expect(l.label).not.toMatch(/[0-9,]+원|₩|공식|정품|한컴 제공/);
    }
    expect(AFF_LINKS.find((l) => l.dest === 'cp-mfp')!.label).toBe('가정용 복합기(인쇄·스캔) (쿠팡, 광고, 새 창)');
    expect(AFF_LINKS.find((l) => l.dest === 'cp-scanner')!.label).toBe('휴대용 문서 스캐너 (쿠팡, 광고, 새 창)');
    expect(AFF_LINKS.find((l) => l.dest === 'cp-tripod')!.label).toBe('스마트폰 삼각대(리모컨) (쿠팡, 광고, 새 창)');
  });

  it('the placement maps: the REV3 table, at most 3 dests, every key a tool with a lead line', () => {
    expect(TOOL_AFF).toEqual({
      'id-photo': ['cp-printer', 'cp-paper', 'cp-backdrop'],
      'remove-background': ['cp-backdrop'],
      'stamp-signature': ['cp-stamp'],
      'pdf-sign': ['cp-stamp'],
      'stamp-maker': ['cp-stamp'],
      'hwp-viewer': ['cp-hancom'],
      'hwp-to-pdf': ['cp-hancom'],
      'hwpx-to-hwp': ['cp-hancom'],
      'pdf-merge': ['cp-mfp'],
      'pdf-split': ['cp-mfp'],
      'jpg-to-pdf': ['cp-mfp', 'cp-scanner'],
    });
    expect(GUIDE_AFF['id-photo']).toEqual(['cp-tripod', 'cp-backdrop', 'cp-printer']);
    // The No-block screens (Decision 1): the upload-size tools have neither a result block nor guide blocks.
    for (const t of ['pdf-compress', 'photo-compress', 'image-to-jpg', 'pdf-to-jpg', 'pdf-password'] as const) {
      expect(TOOL_AFF[t], t).toBeUndefined();
      expect(GUIDE_AFF[t], t).toBeUndefined();
    }
    for (const [map, leads] of [
      [TOOL_AFF, TOOL_LEAD],
      [GUIDE_AFF, GUIDE_LEAD],
    ] as const) {
      expect(Object.keys(leads).sort()).toEqual(Object.keys(map).sort());
      for (const [t, dests] of Object.entries(map)) {
        expect(TOOLS).toContain(t);
        expect(dests!.length).toBeLessThanOrEqual(AFF_MAX);
        expect(AFF_COPY[leads[t as keyof typeof leads]!]).toBeTruthy();
      }
    }
    expect(GUIDE_LEAD['id-photo']).toBe('photo-guide');
  });

  it('affOn: only "1"', () => {
    for (const v of [undefined, '', '0', 'true', 'on', '11']) expect(affOn(v), String(v)).toBe(false);
    expect(affOn('1')).toBe(true);
    expect(affOn(' 1\n')).toBe(true);
  });

  it('affBlock: none while off or without a block; the links in map order with the lead line while on', () => {
    for (const t of Object.keys(TOOL_AFF)) expect(affBlock('tool', t, false)).toBeNull();
    for (const t of Object.keys(GUIDE_AFF)) expect(affBlock('guide', t, false)).toBeNull();
    expect(affBlock('tool', 'pdf-compress', true)).toBeNull();
    expect(affBlock('guide', 'photo-compress', true)).toBeNull();
    expect(affBlock('tool', 'nope', true)).toBeNull();
    const idp = affBlock('tool', 'id-photo', true)!;
    expect(idp.lead).toBe('집에서 인화하려면');
    expect(idp.links.map((l) => l.dest)).toEqual(['cp-printer', 'cp-paper', 'cp-backdrop']);
    expect(affBlock('guide', 'id-photo', true)).toEqual({ lead: '집에서 직접 찍고 뽑으려면', links: ['cp-tripod', 'cp-backdrop', 'cp-printer'].map((d) => AFF_LINKS.find((l) => l.dest === d)) });
    expect(affBlock('tool', 'jpg-to-pdf', true)).toMatchObject({ lead: '종이 서류를 자주 PDF로 만든다면', links: [{ dest: 'cp-mfp' }, { dest: 'cp-scanner' }] });
    expect(affBlock('tool', 'pdf-merge', true)).toMatchObject({ lead: '종이로 내야 하면', links: [{ dest: 'cp-mfp' }] });
    expect(affBlock('tool', 'remove-background', true)).toMatchObject({ lead: '다음에 흰 배경으로 찍으려면', links: [{ dest: 'cp-backdrop' }] });
    expect(affBlock('guide', 'hwp-viewer', true)).toMatchObject({ lead: '한글 파일을 자주 다룬다면', links: [{ dest: 'cp-hancom' }] });
    expect(affBlock('tool', 'pdf-sign', true)).toMatchObject({ lead: '실물 도장이 필요할 때', links: [{ dest: 'cp-stamp' }] });
  });

  it('affBlock: a dest without link data is skipped; a block left without links is not rendered; never more than 3', () => {
    const only = (...d: string[]): AffLink[] => AFF_LINKS.filter((l) => d.includes(l.dest));
    // A link not created yet (as cp-tripod was): the id-photo guides ship with the other two.
    expect(affBlock('guide', 'id-photo', true, only('cp-backdrop', 'cp-printer'))!.links.map((l) => l.dest)).toEqual(['cp-backdrop', 'cp-printer']);
    expect(affBlock('tool', 'jpg-to-pdf', true, only('cp-scanner'))!.links.map((l) => l.dest)).toEqual(['cp-scanner']);
    expect(affBlock('tool', 'pdf-merge', true, only('cp-scanner'))).toBeNull();
    expect(affBlock('tool', 'pdf-merge', true, [])).toBeNull();
    expect(affBlock('guide', 'id-photo', true, [...AFF_LINKS, ...AFF_LINKS])!.links).toHaveLength(3);
  });
});

describe('placement maps == the server whitelist (scripts/lib/usage.mjs)', () => {
  it('TOOL_OUT is TOOL_AFF plus 사진관 찾기 first on id-photo; GUIDE_OUT is GUIDE_AFF', () => {
    const expected: Record<string, readonly string[]> = { ...TOOL_AFF, 'id-photo': ['photo-studio', ...TOOL_AFF['id-photo']!] };
    expect(TOOL_OUT).toEqual(expected);
    expect(GUIDE_OUT).toEqual(GUIDE_AFF);
  });

  it('OUT_DESTS: 사진관 찾기 and every link kind, each labelled for the admin page', () => {
    expect([...OUT_DESTS].sort()).toEqual(['photo-studio', ...AFF_LINKS.map((l) => l.dest)].sort());
    for (const d of OUT_DESTS) expect(OUT_LABELS[d as keyof typeof OUT_LABELS], d).toBeTruthy();
    for (const dests of [...Object.values(TOOL_OUT), ...Object.values(GUIDE_OUT)]) for (const d of dests) expect(OUT_DESTS).toContain(d);
  });
});
