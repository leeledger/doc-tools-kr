// 제휴 링크 (brief handoff/ARCHITECT-BRIEF-REV2.md Decisions 3-4, orchestrator update 2026-10-12): the owner's Coupang
// Partners short links (public, not secrets) with the result screen each belongs to. One flag shows them:
// PUBLIC_AFF_COUPANG=1 (anything else: no affiliate link in the HTML at all). Plain <a> links only, rel="sponsored
// noopener", new tab, the disclosure paragraph first, 「광고」 in every name; no Coupang script, iframe or image.
// Only the id-photo placement is rendered for now (src/data/print-links.ts); stamp-signature and the HWP pages wait for
// precache headroom (BUILD-LOG REV2). The visible text is left out of the preloaded UI font (stripComments in
// scripts/lib/ui-font-chars.mjs) and renders in the system font (.print-links). check-dist reads AFF_COPY.ad and
// COUPANG_DISCLOSURE from this file (keep them one-line strings).

/** 쿠팡 파트너스 지정 문구, verbatim from the Partners link page (confirmed 2026-10-12). */
export const COUPANG_DISCLOSURE = '이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.';

/** ad: the generic disclosure (공정위 심사지침: 첫 부분, 링크 앞); the others: the line above each placement's links. */
export const AFF_COPY = {
  ad: '광고: 아래 링크로 주문하면 문서딱이 수수료를 받을 수 있어요.',
  'id-photo': '집에서 인화하려면',
  'stamp-signature': '실물 도장이 필요할 때',
  hwp: '한글 파일을 자주 다룬다면',
} as const;

export type AffPlacement = 'id-photo' | 'stamp-signature' | 'hwp';

export interface AffLink {
  /** The usage `out` value (link kind, never the href). */
  dest: string;
  placement: AffPlacement;
  label: string;
  href: string;
}

/** Generic names (no prices: they change). */
export const AFF_LINKS: readonly AffLink[] = [
  { dest: 'cp-printer', placement: 'id-photo', label: '포토프린터 (쿠팡, 광고, 새 창)', href: 'https://link.coupang.com/a/hM1VvrGKdg' },
  { dest: 'cp-paper', placement: 'id-photo', label: '포토프린터 인화지 (쿠팡, 광고, 새 창)', href: 'https://link.coupang.com/a/hM1W2wjBpA' },
  { dest: 'cp-backdrop', placement: 'id-photo', label: '흰색 촬영 배경천 (쿠팡, 광고, 새 창)', href: 'https://link.coupang.com/a/hM1XIN1hgO' },
  { dest: 'cp-stamp', placement: 'stamp-signature', label: '인감도장 (쿠팡, 광고, 새 창)', href: 'https://link.coupang.com/a/hM11MC94jA' },
  { dest: 'cp-hancom', placement: 'hwp', label: '한컴오피스 가정 및 학생용 (쿠팡, 광고, 새 창)', href: 'https://link.coupang.com/a/hM106o2KC4' },
];

/** PUBLIC_AFF_COUPANG: on only for "1" (after trimming). */
export function affOn(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim() === '1';
}

/** The affiliate links of one placement, in order; none while the flag is off. */
export function affLinks(placement: AffPlacement, on: boolean): AffLink[] {
  return on ? AFF_LINKS.filter((l) => l.placement === placement) : [];
}

/** The disclosure that opens an affiliate group (every link is a Coupang Partners link). */
export const AFF_DISCLOSURE = `${AFF_COPY.ad} ${COUPANG_DISCLOSURE}`;
