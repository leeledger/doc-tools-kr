// 제휴 링크 (briefs handoff/ARCHITECT-BRIEF-REV2.md Decisions 3-4, handoff/ARCHITECT-BRIEF-REV3.md Decisions 1-3 and
// handoff/ARCHITECT-BRIEF-LP1028.md L1-L10): two networks, one group per result screen.
// - Coupang Partners: the owner's short links (public, not secrets) and where each shows (TOOL_AFF a tool's result
//   screen, GUIDE_AFF a guide keyed by its tools[0]). LP1028 (owner 2026-10-28): on again, result screens only
//   (AFF_GUIDES = false keeps the guides free of them until the AdSense re-review); kill switch PUBLIC_AFF_COUPANG=0.
// - LinkPrice: text links whose hrefs are kept verbatim (LP_LINKS; never rebuilt, reformatted or given params);
//   TOOL_LP places them; kill switch PUBLIC_AFF_LINKPRICE=0.
// resultBlock picks the one group of a result screen: LinkPrice if the screen has one, else Coupang (/id-photo/ renders
// both and shows one, by preset). Plain <a> links only, rel="sponsored noopener", new tab, the block's disclosure (ad)
// first, 「광고」 in every name; no script, iframe or image of either network.
// scripts/lib/usage.mjs copies the maps (TOOL_OUT, GUIDE_OUT) and tests/unit/affiliate.test.ts keeps them equal.
// A dest without a link entry is skipped, a block without links is not rendered (src/components/OutLinks.astro).
// The visible text is left out of the preloaded UI font (stripComments in scripts/lib/ui-font-chars.mjs) and renders in
// the system font (.out-links). check-dist reads AFF_COPY.ad, AFF_COPY.top, COUPANG_DISCLOSURE, LP_COPY.ad and LP_LINKS
// from this file (keep them one-line strings).
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

export type LpDest = 'lp-signgate' | 'lp-dosirak' | 'lp-usimsa' | 'lp-soomgo';

/** A link of either network. */
export interface OutLink {
  /** The usage `out` value (link kind, never the href). */
  dest: AffDest | LpDest;
  label: string;
  href: string;
}
export interface AffLink extends OutLink {
  dest: AffDest;
}

/** One entry per product. Generic names (no prices: they change). */
export const AFF_LINKS: readonly AffLink[] = [
  { dest: 'cp-printer', label: '포토프린터 (쿠팡, 광고, 새 창)', href: 'https://link.coupang.com/a/hM1VvrGKdg' },
  { dest: 'cp-paper', label: '포토프린터 인화지 (쿠팡, 광고, 새 창)', href: 'https://link.coupang.com/a/hM1W2wjBpA' },
  { dest: 'cp-backdrop', label: '흰색 촬영 배경천 (쿠팡, 광고, 새 창)', href: 'https://link.coupang.com/a/hM1XIN1hgO' },
  { dest: 'cp-stamp', label: '인감도장 (쿠팡, 광고, 새 창)', href: 'https://link.coupang.com/a/hM11MC94jA' },
  // LP1028: a generic name; the HWP pages never print 한컴오피스 / 한컴뷰어 (A0 legal rule, tests/unit/hwp-viewer.test.ts).
  { dest: 'cp-hancom', label: '한글 문서 프로그램(가정·학생용) (쿠팡, 광고, 새 창)', href: 'https://link.coupang.com/a/hM106o2KC4' },
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
  'stamp-maker': ['cp-stamp'],
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
  'stamp-maker': ['cp-stamp'],
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
  'stamp-maker': 'stamp-signature',
  'hwp-viewer': 'hwp',
  'hwp-to-pdf': 'hwp',
  'hwpx-to-hwp': 'hwp',
  'pdf-merge': 'pdf',
  'pdf-split': 'pdf',
  'jpg-to-pdf': 'scan',
};
export const GUIDE_LEAD: Partial<Record<UsageTool, AffLead>> = { ...TOOL_LEAD, 'id-photo': 'photo-guide' };

/**
 * ADS1020 D1 turned the Coupang links off in code (2026-10-20); LP1028 (owner 2026-10-28) turns them back on for result
 * screens. check-dist reads this line: while false no dist text file may carry a Coupang link or a disclosure line.
 */
export const AFF_ENABLED = true;
/** Coupang blocks on guides: off (LP1028, owner 2026-10-28) until the AdSense re-review decision. */
export const AFF_GUIDES = false;

/** PUBLIC_AFF_COUPANG: off only for "0" (after trimming), anything else (unset included) is on, while AFF_ENABLED is true. */
export function affOn(value: string | undefined): boolean {
  return AFF_ENABLED && !(typeof value === 'string' && value.trim() === '0');
}

export interface AffBlock {
  /** The disclosure that opens the block (before every link). */
  ad: string;
  lead: string;
  links: readonly OutLink[];
}

/** The disclosure that opens a Coupang group. */
export const AFF_DISCLOSURE = `${AFF_COPY.ad} ${COUPANG_DISCLOSURE}`;

/**
 * The Coupang block of a tool's result screen (kind "tool") or of a guide whose tools[0] is `tool` (kind "guide"): its
 * lead line and up to AFF_MAX links in map order, dests without an AFF_LINKS entry skipped. null while the flag is off,
 * for every guide while AFF_GUIDES is false, for a screen without a block, and when no link is left. `pool`: the link
 * data (tests pass their own).
 */
export function affBlock(kind: 'tool' | 'guide', tool: string, on: boolean, pool: readonly AffLink[] = AFF_LINKS): AffBlock | null {
  if (!on || (kind === 'guide' && !AFF_GUIDES)) return null;
  const dests = (kind === 'tool' ? TOOL_AFF : GUIDE_AFF)[tool as UsageTool] ?? [];
  const lead = (kind === 'tool' ? TOOL_LEAD : GUIDE_LEAD)[tool as UsageTool];
  const links = dests.flatMap((d) => pool.filter((l) => l.dest === d)).slice(0, AFF_MAX);
  return lead && links.length > 0 ? { ad: AFF_DISCLOSURE, lead: AFF_COPY[lead], links } : null;
}

// ---------- 링크프라이스 (LP1028) ----------

/** LP1028 L9: the LinkPrice links in code (like AFF_ENABLED). */
export const LP_ENABLED = true;

/** PUBLIC_AFF_LINKPRICE: off only for "0" (after trimming), anything else (unset included) is on, while LP_ENABLED is true. */
export function lpOn(value: string | undefined): boolean {
  return LP_ENABLED && !(typeof value === 'string' && value.trim() === '0');
}

/** ad: the disclosure (L6; never a Coupang string); the others: the lead line of each block (L7, facts only). */
export const LP_COPY = {
  ad: '광고: 아래 링크는 제휴마케팅 광고예요. 이 링크로 가입하거나 사면 문서딱이 수수료를 받아요.',
  signgate: '서명·도장 그림은 인증서가 아니에요. 인증서로 서명하라는 곳에는 공동인증서가 필요해요.',
  esim: '해외에 나간다면 휴대폰 데이터도 미리 준비하세요. eSIM은 지원하는 휴대폰에서만 쓸 수 있으니 사기 전에 확인하세요.',
  careerCc: '자소서를 다른 사람에게 봐 달라고 하고 싶다면',
  careerRs: '다음 직장을 준비한다면 이력서·자소서도 함께 봐 달라고 할 수 있어요.',
} as const;

export type LpLead = Exclude<keyof typeof LP_COPY, 'ad'>;

export interface LpLink extends OutLink {
  dest: LpDest;
}

/** L5: the hrefs exactly as LinkPrice issued them (no params, never rebuilt; a unit test and check-dist pin them). */
export const LP_LINKS: readonly LpLink[] = [
  { dest: 'lp-signgate', label: '한국정보인증 공동인증서 (광고, 새 창)', href: 'https://click.linkprice.com/click.php?m=signgate&a=A100709304&l=0000' },
  { dest: 'lp-dosirak', label: '도시락eSIM (광고, 새 창)', href: 'https://click.linkprice.com/click.php?m=dosirak1&a=A100709304&l=0000' },
  { dest: 'lp-usimsa', label: '유심사 eSIM (광고, 새 창)', href: 'https://click.linkprice.com/click.php?m=usimsa&a=A100709304&l=0000' },
  { dest: 'lp-soomgo', label: '숨고 이력서·자소서 컨설팅 (광고, 새 창)', href: 'https://click.linkprice.com/click.php?m=soomgo&a=A100709304&l=9999&l_cd1=3&l_cd2=0&tu=https%3A%2F%2Fsoomgo.com%2Fhire%2F%25EC%259D%25B4%25EB%25A0%25A5%25EC%2584%259C-%25EC%259E%2590%25EC%2586%258C%25EC%2584%259C-%25EC%25BB%25A8%25EC%2584%25A4%25ED%258C%2585' },
];

/** L1: the result screens with a LinkPrice block, their lead line and dests in display order. */
export const TOOL_LP: Partial<Record<UsageTool, { lead: LpLead; dests: readonly LpDest[] }>> = {
  'pdf-sign': { lead: 'signgate', dests: ['lp-signgate'] },
  'stamp-signature': { lead: 'signgate', dests: ['lp-signgate'] },
  'stamp-maker': { lead: 'signgate', dests: ['lp-signgate'] },
  'id-photo': { lead: 'esim', dests: ['lp-dosirak', 'lp-usimsa'] },
  'char-count': { lead: 'careerCc', dests: ['lp-soomgo'] },
  'resignation-letter': { lead: 'careerRs', dests: ['lp-soomgo'] },
};

/** The LinkPrice block of a tool's result screen, or null (flag off, no block, no link left). `pool`: tests pass their own. */
export function lpBlock(tool: string, on: boolean, pool: readonly LpLink[] = LP_LINKS): AffBlock | null {
  const entry = on ? TOOL_LP[tool as UsageTool] : undefined;
  if (!entry) return null;
  const links = entry.dests.flatMap((d) => pool.filter((l) => l.dest === d));
  return links.length > 0 ? { ad: LP_COPY.ad, lead: LP_COPY[entry.lead], links } : null;
}

/**
 * L10: the one group of a result screen: LinkPrice if the screen has one, else Coupang. `linkprice`, `coupang`: the
 * PUBLIC_AFF_LINKPRICE and PUBLIC_AFF_COUPANG values.
 */
export function resultBlock(tool: string, linkprice: string | undefined, coupang: string | undefined): AffBlock | null {
  return lpBlock(tool, lpOn(linkprice)) ?? affBlock('tool', tool, affOn(coupang));
}
