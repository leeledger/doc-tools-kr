// 인화·사진관 링크 and 제휴 링크 (briefs handoff/ARCHITECT-BRIEF-REV2.md "Test map" and handoff/ARCHITECT-BRIEF-REV3.md
// "Test map", LP1028 "Test map"): the id-photo info link, the link data, the placement maps, affBlock (flag, missing dests,
// max 3), the LinkPrice links (verbatim hrefs, lpBlock, resultBlock) and the drift guard between src/data/affiliate.ts and
// the server whitelist in scripts/lib/usage.mjs.
import { describe, expect, it } from 'vitest';
import { AFF_COPY, AFF_DISCLOSURE, AFF_GUIDES, AFF_LINKS, AFF_MAX, COUPANG_DISCLOSURE, GUIDE_AFF, GUIDE_LEAD, LP_COPY, LP_ENABLED, LP_LINKS, TOOL_AFF, TOOL_LEAD, TOOL_LP, AFF_ENABLED, affBlock, affOn, lpBlock, lpOn, resultBlock, type AffLink, type LpLink } from '../../src/data/affiliate';
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
      // A0 legal rule (LP1028): the HWP result screens carry this link, and their page text never says 한컴오피스 / 한컴뷰어.
      expect(l.label).not.toMatch(/한컴\s*뷰어|한컴오피스/);
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

  it('affOn (LP1028, owner 2026-10-28): AFF_ENABLED is true; off only for "0" after trimming, anything else on', () => {
    expect(AFF_ENABLED).toBe(true);
    for (const v of [undefined, '', '1', 'true', 'on', '00', ' 1\n']) expect(affOn(v), String(v)).toBe(true);
    for (const v of ['0', ' 0\n']) expect(affOn(v), String(v)).toBe(false);
  });

  it('LP1028: no guide block while AFF_GUIDES is false, whatever the flag', () => {
    expect(AFF_GUIDES).toBe(false);
    for (const t of Object.keys(GUIDE_AFF)) expect(affBlock('guide', t, true), t).toBeNull();
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
    expect(idp.ad).toBe(AFF_DISCLOSURE);
    expect(affBlock('tool', 'jpg-to-pdf', true)).toMatchObject({ lead: '종이 서류를 자주 PDF로 만든다면', links: [{ dest: 'cp-mfp' }, { dest: 'cp-scanner' }] });
    expect(affBlock('tool', 'pdf-merge', true)).toMatchObject({ lead: '종이로 내야 하면', links: [{ dest: 'cp-mfp' }] });
    expect(affBlock('tool', 'remove-background', true)).toMatchObject({ lead: '다음에 흰 배경으로 찍으려면', links: [{ dest: 'cp-backdrop' }] });
    expect(affBlock('tool', 'hwp-viewer', true)).toMatchObject({ lead: '한글 파일을 자주 다룬다면', links: [{ dest: 'cp-hancom' }] });
    expect(affBlock('tool', 'pdf-sign', true)).toMatchObject({ lead: '실물 도장이 필요할 때', links: [{ dest: 'cp-stamp' }] });
  });

  it('affBlock: a dest without link data is skipped; a block left without links is not rendered; never more than 3', () => {
    const only = (...d: string[]): AffLink[] => AFF_LINKS.filter((l) => d.includes(l.dest));
    // A link not created yet (as cp-tripod was): the block ships with the others.
    expect(affBlock('tool', 'id-photo', true, only('cp-backdrop', 'cp-printer'))!.links.map((l) => l.dest)).toEqual(['cp-printer', 'cp-backdrop']);
    expect(affBlock('tool', 'jpg-to-pdf', true, only('cp-scanner'))!.links.map((l) => l.dest)).toEqual(['cp-scanner']);
    expect(affBlock('tool', 'pdf-merge', true, only('cp-scanner'))).toBeNull();
    expect(affBlock('tool', 'pdf-merge', true, [])).toBeNull();
    expect(affBlock('tool', 'id-photo', true, [...AFF_LINKS, ...AFF_LINKS])!.links).toHaveLength(3);
  });
});

describe('LinkPrice links (LP1028, src/data/affiliate.ts)', () => {
  it('L5: the hrefs are the exact strings LinkPrice issued (literals, never rebuilt)', () => {
    expect(LP_LINKS.map((l) => [l.dest, l.href])).toEqual([
      ['lp-signgate', 'https://click.linkprice.com/click.php?m=signgate&a=A100709304&l=0000'],
      ['lp-dosirak', 'https://click.linkprice.com/click.php?m=dosirak1&a=A100709304&l=0000'],
      ['lp-usimsa', 'https://click.linkprice.com/click.php?m=usimsa&a=A100709304&l=0000'],
      ['lp-soomgo', 'https://click.linkprice.com/click.php?m=soomgo&a=A100709304&l=9999&l_cd1=3&l_cd2=0&tu=https%3A%2F%2Fsoomgo.com%2Fhire%2F%25EC%259D%25B4%25EB%25A0%25A5%25EC%2584%259C-%25EC%259E%2590%25EC%2586%258C%25EC%2584%259C-%25EC%25BB%25A8%25EC%2584%25A4%25ED%258C%2585'],
    ]);
  });

  it('L6/L7: the disclosure and the lines; labels say 광고 and 새 창; no price, 공식 or Coupang words', () => {
    expect(LP_COPY.ad).toBe('광고: 아래 링크는 제휴마케팅 광고예요. 이 링크로 가입하거나 사면 문서딱이 수수료를 받아요.');
    for (const needle of ['link.coupang.com', AFF_COPY.top, AFF_COPY.ad, AFF_COPY.heading, COUPANG_DISCLOSURE, '쿠팡']) expect(LP_COPY.ad).not.toContain(needle);
    expect(LP_COPY.signgate).toBe('서명·도장 그림은 인증서가 아니에요. 인증서로 서명하라는 곳에는 공동인증서가 필요해요.');
    expect(LP_COPY.esim).toBe('해외에 나간다면 휴대폰 데이터도 미리 준비하세요. eSIM은 지원하는 휴대폰에서만 쓸 수 있으니 사기 전에 확인하세요.');
    expect(LP_COPY.careerCc).toBe('자소서를 다른 사람에게 봐 달라고 하고 싶다면');
    expect(LP_COPY.careerRs).toBe('다음 직장을 준비한다면 이력서·자소서도 함께 봐 달라고 할 수 있어요.');
    expect(LP_LINKS.map((l) => l.label)).toEqual(['한국정보인증 공동인증서 (광고, 새 창)', '도시락eSIM (광고, 새 창)', '유심사 eSIM (광고, 새 창)', '숨고 이력서·자소서 컨설팅 (광고, 새 창)']);
    for (const t of [...Object.values(LP_COPY), ...LP_LINKS.map((l) => l.label)]) expect(t).not.toMatch(/[0-9,]+원|₩|공식|최고|최저|1위/);
  });

  it('L9 lpOn: LP_ENABLED is true; off only for "0" after trimming, anything else (unset included) on', () => {
    expect(LP_ENABLED).toBe(true);
    for (const v of [undefined, '', '1', 'off', '00', ' 1\n']) expect(lpOn(v), String(v)).toBe(true);
    for (const v of ['0', ' 0\n']) expect(lpOn(v), String(v)).toBe(false);
  });

  it('L1 lpBlock: the six screens with their lead and links; off, unknown tool or no link left: null', () => {
    expect(Object.keys(TOOL_LP).sort()).toEqual(['char-count', 'id-photo', 'pdf-sign', 'resignation-letter', 'stamp-maker', 'stamp-signature']);
    const dests = (t: string) => lpBlock(t, true)!.links.map((l) => l.dest);
    for (const t of ['pdf-sign', 'stamp-signature', 'stamp-maker']) {
      expect(lpBlock(t, true), t).toMatchObject({ ad: LP_COPY.ad, lead: LP_COPY.signgate });
      expect(dests(t), t).toEqual(['lp-signgate']);
    }
    expect(lpBlock('id-photo', true)).toMatchObject({ ad: LP_COPY.ad, lead: LP_COPY.esim });
    expect(dests('id-photo')).toEqual(['lp-dosirak', 'lp-usimsa']);
    expect(lpBlock('char-count', true)).toMatchObject({ lead: LP_COPY.careerCc, links: [{ dest: 'lp-soomgo' }] });
    expect(lpBlock('resignation-letter', true)).toMatchObject({ lead: LP_COPY.careerRs, links: [{ dest: 'lp-soomgo' }] });
    for (const t of Object.keys(TOOL_LP)) expect(lpBlock(t, false), t).toBeNull();
    for (const t of ['id-photo-camera', 'loan-note', 'power-of-attorney', 'business-card', 'qr-code', 'pdf-merge', 'nope']) expect(lpBlock(t, true), t).toBeNull();
    const only = (...d: string[]): LpLink[] => LP_LINKS.filter((l) => d.includes(l.dest));
    expect(lpBlock('id-photo', true, only('lp-usimsa'))!.links.map((l) => l.dest)).toEqual(['lp-usimsa']);
    expect(lpBlock('char-count', true, [])).toBeNull();
  });

  it('L10 resultBlock: LinkPrice first, else Coupang, else null', () => {
    expect(resultBlock('pdf-sign', undefined, undefined)!.links.map((l) => l.dest)).toEqual(['lp-signgate']);
    expect(resultBlock('pdf-sign', '0', undefined)!.links.map((l) => l.dest)).toEqual(['cp-stamp']);
    expect(resultBlock('pdf-sign', '0', '0')).toBeNull();
    expect(resultBlock('pdf-merge', undefined, undefined)!.links.map((l) => l.dest)).toEqual(['cp-mfp']);
    expect(resultBlock('pdf-merge', undefined, '0')).toBeNull();
    expect(resultBlock('char-count', undefined, undefined)!.ad).toBe(LP_COPY.ad);
    expect(resultBlock('char-count', '0', undefined)).toBeNull();
    expect(resultBlock('resignation-letter', '1', '1')!.lead).toBe(LP_COPY.careerRs);
    expect(resultBlock('pdf-compress', undefined, undefined)).toBeNull();
  });
});

describe('placement maps == the server whitelist (scripts/lib/usage.mjs)', () => {
  it('TOOL_OUT is 사진관 찾기 (id-photo) + TOOL_AFF + TOOL_LP per tool; GUIDE_OUT is GUIDE_AFF', () => {
    const expected: Record<string, readonly string[]> = {};
    for (const t of new Set([...Object.keys(TOOL_AFF), ...Object.keys(TOOL_LP)]) as Set<keyof typeof TOOL_AFF>) {
      expected[t] = [...(t === 'id-photo' ? ['photo-studio'] : []), ...(TOOL_AFF[t] ?? []), ...(TOOL_LP[t]?.dests ?? [])];
    }
    expect(TOOL_OUT).toEqual(expected);
    expect(GUIDE_OUT).toEqual(GUIDE_AFF);
  });

  it('OUT_DESTS: 사진관 찾기 and every link kind, each labelled for the admin page', () => {
    expect([...OUT_DESTS].sort()).toEqual(['photo-studio', ...AFF_LINKS.map((l) => l.dest), ...LP_LINKS.map((l) => l.dest)].sort());
    expect(OUT_LABELS).toMatchObject({ 'lp-signgate': '공동인증서(한국정보인증)', 'lp-dosirak': '도시락eSIM', 'lp-usimsa': '유심사', 'lp-soomgo': '숨고 이력서 컨설팅' });
    for (const d of OUT_DESTS) expect(OUT_LABELS[d as keyof typeof OUT_LABELS], d).toBeTruthy();
    for (const dests of [...Object.values(TOOL_OUT), ...Object.values(GUIDE_OUT)]) for (const d of dests) expect(OUT_DESTS).toContain(d);
  });
});
