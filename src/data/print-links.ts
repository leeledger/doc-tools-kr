// 인화·사진관 링크 (brief handoff/ARCHITECT-BRIEF-REV2.md, Decisions 3-6): the static link block of the id-photo result.
// The info link (사진관 찾기) is on in every build; PUBLIC_PRINT_INFO=0 removes it. The affiliate group of the id-photo
// result (src/data/affiliate.ts, src/components/OutLinks.astro) follows it only with PUBLIC_AFF_COUPANG=1.
// The block renders in the system font: PRINT_COPY is left out of the preloaded UI font (scripts/lib/ui-font-chars.mjs,
// stripComments) and the .out-links rule in src/styles/app.css sets the system stack.
import type { OutDest } from '../lib/ui/usage';

/** Visible text of the block outside the affiliate group. */
export const PRINT_COPY = {
  lead: '종이 사진이 필요하면 사진관에서 뽑을 수 있습니다.',
  'photo-studio': '가까운 사진관 찾기 (네이버 지도, 새 창)',
} as const;

/** 네이버 지도 search for 사진관 (non-affiliate). */
export const PHOTO_STUDIO_URL = 'https://map.naver.com/p/search/%EC%82%AC%EC%A7%84%EA%B4%80';

export interface PrintEnv {
  PUBLIC_PRINT_INFO?: string;
}

export interface PrintLink {
  dest: OutDest;
  href: string;
  label: string;
}

/** The info links of the block (not sponsored): 사진관 찾기, unless PUBLIC_PRINT_INFO=0. */
export function printLinks(env: PrintEnv): PrintLink[] {
  return env.PUBLIC_PRINT_INFO?.trim() === '0' ? [] : [{ dest: 'photo-studio', href: PHOTO_STUDIO_URL, label: PRINT_COPY['photo-studio'] }];
}
