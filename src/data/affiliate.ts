// 제휴 링크 (briefs handoff/ARCHITECT-BRIEF-REV2.md Decisions 3-4 and handoff/ARCHITECT-BRIEF-REV3.md Decisions 1-3):
// the owner's Coupang Partners short links (public, not secrets) and where each shows. One flag shows them:
// PUBLIC_AFF_COUPANG=1 (anything else: no affiliate link in the HTML at all). Plain <a> links only, rel="sponsored
// noopener", new tab, the disclosure paragraph first, 「광고」 in every name; no Coupang script, iframe or image.
// The single placement map: TOOL_AFF (a tool's result screen) and GUIDE_AFF (a guide, keyed by its tools[0]);
// scripts/lib/usage.mjs copies both (TOOL_OUT, GUIDE_OUT) and tests/unit/affiliate.test.ts keeps them equal.
// A dest without an AFF_LINKS entry is skipped, a block without links is not rendered (src/components/OutLinks.astro).
// The visible text is left out of the preloaded UI font (stripComments in scripts/lib/ui-font-chars.mjs) and renders in
// the system font (.out-links). check-dist reads AFF_COPY.ad, AFF_COPY.top and COUPANG_DISCLOSURE from this file (keep
// them one-line strings).
import type { UsageTool } from '../lib/ui/usage';

/** 쿠팡 파트너스 지정 문구, verbatim from the Partners link page (confirmed 2026-10-12). */
export const COUPANG_DISCLOSURE = '이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.';

/**
 * ad: the disclosure that opens every block (공정위 심사지침: 링크 앞); top: a guide's first-part line (REV3 Decision 5);
 * heading: the guide block's heading; the others: the lead line above each block's links.
 */
export const AFF_COPY = {
  ad: '광고: 아래 링크로 주문하면 문서딱이 수수료를 받을 수 있어요.',
  top: '이 글에는 쿠팡 파트너스 광고 링크가 있어요. 링크로 사면 문서딱이 수수료를 받을 수 있어요.',
  heading: '도움이 되는 물건 (광고)',
  'id-photo': '집에서 인화하려면',
  'stamp-signature': '실물 도장이 필요할 때',
  hwp: '한글 파일을 자주 다룬다면',
  pdf: '종이로 내야 하면',
  scan: '종이 서류를 자주 PDF로 만든다면',
  'photo-guide': '집에서 직접 찍고 뽑으려면',
  backdrop: '다음에 흰 배경으로 찍으려면',
} as const;

export type AffLead = Exclude<keyof typeof AFF_COPY, 'ad' | 'top' | 'heading'>;
export type AffDest = 'cp-printer' | 'cp-paper' | 'cp-backdrop' | 'cp-stamp' | 'cp-hancom' | 'cp-mfp' | 'cp-scanner' | 'cp-tripod';

export interface AffLink {
  /** The usage `out` value (link kind, never the href). */
  dest: AffDest;
  label: string;
  href: string;
}

/** One entry per product. Generic names (no prices: they change). */
export const AFF_LINKS: readonly AffLink[] = [
  { dest: 'cp-printer', label: '포토프린터 (쿠팡, 광고, 새 창)', href: 'https://link.coupang.com/a/hM1VvrGKdg' },
  { dest: 'cp-paper', label: '포토프린터 인화지 (쿠팡, 광고, 새 창)', href: 'https://link.coupang.com/a/hM1W2wjBpA' },
  { dest: 'cp-backdrop', label: '흰색 촬영 배경천 (쿠팡, 광고, 새 창)', href: 'https://link.coupang.com/a/hM1XIN1hgO' },
  { dest: 'cp-stamp', label: '인감도장 (쿠팡, 광고, 새 창)', href: 'https://link.coupang.com/a/hM11MC94jA' },
  { dest: 'cp-hancom', label: '한컴오피스 가정 및 학생용 (쿠팡, 광고, 새 창)', href: 'https://link.coupang.com/a/hM106o2KC4' },
  { dest: 'cp-mfp', label: '가정용 복합기(인쇄·스캔) (쿠팡, 광고, 새 창)', href: 'https://link.coupang.com/a/hM4wFTvnPw' },
  { dest: 'cp-scanner', label: '휴대용 문서 스캐너 (쿠팡, 광고, 새 창)', href: 'https://link.coupang.com/a/hM4zbm4al2' },
  { dest: 'cp-tripod', label: '스마트폰 삼각대(리모컨) (쿠팡, 광고, 새 창)', href: 'https://link.coupang.com/a/hM4xVunZkq' },
];

/** At most this many links in one block. */
export const AFF_MAX = 3;

/** Result screens with a block (REV3 Decision 1 table): the dests in display order. Every other tool has none. */
export const TOOL_AFF: Partial<Record<UsageTool, readonly AffDest[]>> = {
  'id-photo': ['cp-printer', 'cp-paper', 'cp-backdrop'],
  'remove-background': ['cp-backdrop'],
  'stamp-signature': ['cp-stamp'],
  'pdf-sign': ['cp-stamp'],
  'hwp-viewer': ['cp-hancom'],
  'hwp-to-pdf': ['cp-hancom'],
  'hwpx-to-hwp': ['cp-hancom'],
  'pdf-merge': ['cp-mfp'],
  'pdf-split': ['cp-mfp'],
  'jpg-to-pdf': ['cp-mfp', 'cp-scanner'],
};

/** Guides with a block, keyed by the guide's tools[0]. A guide whose tools[0] is not here has none. */
export const GUIDE_AFF: Partial<Record<UsageTool, readonly AffDest[]>> = {
  'id-photo': ['cp-tripod', 'cp-backdrop', 'cp-printer'],
  'hwp-viewer': ['cp-hancom'],
  'hwp-to-pdf': ['cp-hancom'],
  'hwpx-to-hwp': ['cp-hancom'],
  'stamp-signature': ['cp-stamp'],
  'pdf-sign': ['cp-stamp'],
  'pdf-merge': ['cp-mfp'],
  'pdf-split': ['cp-mfp'],
  'jpg-to-pdf': ['cp-mfp', 'cp-scanner'],
  'remove-background': ['cp-backdrop'],
};

/** The lead line of each block (the same keys as TOOL_AFF and GUIDE_AFF; a unit test keeps them equal). */
export const TOOL_LEAD: Partial<Record<UsageTool, AffLead>> = {
  'id-photo': 'id-photo',
  'remove-background': 'backdrop',
  'stamp-signature': 'stamp-signature',
  'pdf-sign': 'stamp-signature',
  'hwp-viewer': 'hwp',
  'hwp-to-pdf': 'hwp',
  'hwpx-to-hwp': 'hwp',
  'pdf-merge': 'pdf',
  'pdf-split': 'pdf',
  'jpg-to-pdf': 'scan',
};
export const GUIDE_LEAD: Partial<Record<UsageTool, AffLead>> = { ...TOOL_LEAD, 'id-photo': 'photo-guide' };

/** PUBLIC_AFF_COUPANG: on only for "1" (after trimming). */
export function affOn(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim() === '1';
}

export interface AffBlock {
  lead: string;
  links: AffLink[];
}

/**
 * The block of a tool's result screen (kind "tool") or of a guide whose tools[0] is `tool` (kind "guide"): its lead
 * line and up to AFF_MAX links in map order, dests without an AFF_LINKS entry skipped. null while the flag is off,
 * for a screen without a block, and when no link is left. `pool`: the link data (tests pass their own).
 */
export function affBlock(kind: 'tool' | 'guide', tool: string, on: boolean, pool: readonly AffLink[] = AFF_LINKS): AffBlock | null {
  if (!on) return null;
  const dests = (kind === 'tool' ? TOOL_AFF : GUIDE_AFF)[tool as UsageTool] ?? [];
  const lead = (kind === 'tool' ? TOOL_LEAD : GUIDE_LEAD)[tool as UsageTool];
  const links = dests.flatMap((d) => pool.filter((l) => l.dest === d)).slice(0, AFF_MAX);
  return lead && links.length > 0 ? { lead: AFF_COPY[lead], links } : null;
}

/** The disclosure that opens an affiliate group (every link is a Coupang Partners link). */
export const AFF_DISCLOSURE = `${AFF_COPY.ad} ${COUPANG_DISCLOSURE}`;
