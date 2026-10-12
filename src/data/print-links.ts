// 인화·사진관 링크 (brief handoff/ARCHITECT-BRIEF-REV2.md, Decisions 3-6): the static link block of the id-photo result.
// The info link (사진관 찾기) is on in every build; PUBLIC_PRINT_INFO=0 removes it. The affiliate links of the id-photo
// placement (src/data/affiliate.ts) follow it, after their disclosure, only with PUBLIC_AFF_COUPANG=1.
// The block renders in the system font: PRINT_COPY is left out of the preloaded UI font (scripts/lib/ui-font-chars.mjs,
// stripComments) and the .print-links rule in src/styles/app.css sets the system stack.
import type { OutDest } from '../lib/ui/usage';
import { AFF_COPY, AFF_DISCLOSURE, affLinks, affOn } from './affiliate';

/** Visible text of the block outside the affiliate group. */
export const PRINT_COPY = {
  lead: '종이 사진이 필요하면 사진관에서 뽑을 수 있습니다.',
  'photo-studio': '가까운 사진관 찾기 (네이버 지도, 새 창)',
} as const;

/** 네이버 지도 search for 사진관 (non-affiliate). */
export const PHOTO_STUDIO_URL = 'https://map.naver.com/p/search/%EC%82%AC%EC%A7%84%EA%B4%80';

export interface PrintEnv {
  PUBLIC_PRINT_INFO?: string;
  PUBLIC_AFF_COUPANG?: string;
}

export interface PrintLink {
  dest: OutDest;
  href: string;
  label: string;
  sponsored: boolean;
}

/** The links of the block in display order: the info link first, then the affiliate links. */
export function printLinks(env: PrintEnv): PrintLink[] {
  const links: PrintLink[] = [];
  if (env.PUBLIC_PRINT_INFO?.trim() !== '0') links.push({ dest: 'photo-studio', href: PHOTO_STUDIO_URL, label: PRINT_COPY['photo-studio'], sponsored: false });
  for (const l of affLinks('id-photo', affOn(env.PUBLIC_AFF_COUPANG))) links.push({ dest: l.dest as OutDest, href: l.href, label: l.label, sponsored: true });
  return links;
}

/** The affiliate group's opening lines: '' without affiliate links, else the disclosure and the placement line. */
export function printDisclosure(links: PrintLink[]): { disclosure: string; head: string } | null {
  return links.some((l) => l.sponsored) ? { disclosure: AFF_DISCLOSURE, head: AFF_COPY['id-photo'] } : null;
}
