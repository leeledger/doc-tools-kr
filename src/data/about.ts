// /about/ (ADS1020 D9): the milestone list of 「고친 기록」 and the sitemap lastmod of /about/ and /contact/. Every date is
// the day git first added the page file named in the comment (`git log --diff-filter=A --format=%ad --date=short -- <file>`),
// with that commit. Only what git proves; no plans. The text renders in the system font (.site-info; this file is in
// SYSTEM_FONT_PATHS of scripts/lib/ui-font-chars.mjs).

export interface Milestone {
  /** YYYY-MM-DD. */
  date: string;
  text: string;
  /** Shown only in a build with that tool (its flag on). */
  flag?: 'addrEn';
}

export const MILESTONES: readonly Milestone[] = [
  // src/pages/pdf-merge/index.astro, 44af82c
  { date: '2026-09-29', text: '첫 도구 PDF 합치기를 만들었어요.' },
  // src/pages/id-photo/index.astro, ee507ab
  { date: '2026-09-30', text: '여권·증명사진 규격 맞추기를 더했어요.' },
  // src/content/guides/ (first guide files), 370e655
  { date: '2026-09-30', text: '규격과 제출 방법을 정리한 안내 글을 쓰기 시작했어요.' },
  // src/pages/hwp-to-pdf/index.astro, 7c930c7
  { date: '2026-09-30', text: '한글(HWP) 파일을 PDF로 바꾸는 도구를 더했어요.' },
  // src/pages/hwp-viewer/index.astro, be3d693
  { date: '2026-10-01', text: '한글 프로그램 없이 HWP 파일을 보는 도구를 더했어요.' },
  // src/pages/english-name/index.astro, 0601e70
  { date: '2026-10-16', text: '영문 이름 변환기를 더했어요.' },
  // src/tools/english-address/page.astro, de6358a
  { date: '2026-10-16', text: '영문주소 변환기를 더했어요.', flag: 'addrEn' },
];

/** The sitemap lastmod of /about/ and /contact/ (ADS1020). */
export const ABOUT_UPDATED = '2026-10-20';
