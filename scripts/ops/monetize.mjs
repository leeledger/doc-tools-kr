// M-3: the R1 (AdSense) trigger (docs/REVENUE-MODEL.md §1, docs/OPS-RUNBOOK.md).
//   node scripts/ops/monetize.mjs [--reports reports/growth] [--dry-run]
// Conditions: the live sitemap lists ≥ 15 pages, and the committed weekly reports show ≥ 100 Search Console
// clicks in each of the last 4 consecutive ISO weeks. When both hold, one ops:monetize issue with the AdSense
// checklist is opened — once ever (an existing issue, open or closed, means it was already announced).
import { join } from 'node:path';
import { ROOT, isMain, parseArgs } from './lib/common.mjs';
import { createGitHub } from './lib/github.mjs';
import { R1, r1Status } from './lib/report.mjs';
import { liveSitemapCount, readReports } from './growth.mjs';

export const LABEL = 'ops:monetize';

export function checklist(status) {
  return [
    `R1 조건을 충족했습니다(M-3): 색인 대상 페이지 ${status.sitemapCount}개(기준 ${R1.minPages}), 주 ${R1.minWeeklyClicks}클릭 이상 ${status.streak}주 연속(기준 ${R1.weeks}주: ${status.recent.map((r) => `${r.week} ${r.clicks}`).join(', ')}).`,
    '',
    '## 애드센스 신청 준비 체크리스트 (docs/REVENUE-MODEL.md §1·§4)',
    '- [ ] 개인정보처리방침 v2: 광고·쿠키, 보호책임자(아이로그와 같은 방식), 연락처 `robotncoding@kakao.com`',
    '- [ ] `PUBLIC_CONTACT_EMAIL` 설정(Cloudflare Pages 환경 변수). 없으면 광고를 켠 빌드가 실패한다(check-dist)',
    '- [ ] 동의 처리(CMP) — 구글 인증 CMP 또는 자체 동의 배너, 동의 전 광고 요청 없음',
    '- [ ] `public/ads.txt` (게시자 ID는 승인 화면에서 받는다)',
    '- [ ] CSP: 광고 출처만 허용(script-src·frame-src·img-src). `connect-src` 등 도구 영역은 그대로',
    '- [ ] 광고는 안내·결과 영역의 예약 슬롯(`AdSlot`)에만. 도구 처리 화면 안에는 넣지 않는다',
    '- [ ] e2e no-upload 검사가 광고 켠 빌드에서도 파일 바이트가 나가지 않음을 보장하는지 확인',
    '- [ ] (대표) 애드센스 계정 신청 버튼, 세금 정보, 지급 계좌',
    '- [ ] 승인 후 `ADS_ENABLED` 플래그를 켜고 M-4(수익 리포트)를 설정',
  ].join('\n');
}

export async function run(argv, io = {}) {
  const { opts, dryRun } = parseArgs(argv);
  const log = io.log ?? console.log;
  const dir = opts.reports ?? join(ROOT, 'reports', 'growth');
  const count = io.sitemapCount ?? (await liveSitemapCount(io.fetchImpl, io.wait));
  const status = r1Status(count, io.reports ?? readReports(dir));
  log(`monetize: 페이지 ${count}개(${status.pagesOk ? '충족' : '미충족'}), 주 ${R1.minWeeklyClicks}클릭 연속 ${status.streak}주(${status.clicksOk ? '충족' : '미충족'}) → ${status.met ? 'R1 충족' : '아직'}`);
  if (!status.met) return 0;
  const gh = io.github ?? createGitHub({ dryRun, log });
  if ((await gh.issues(LABEL, 'all')).length) {
    log('monetize: 이미 알린 적이 있습니다(ops:monetize 이슈 있음).');
    return 0;
  }
  await gh.create({ label: LABEL, title: '애드센스 신청 준비 완료 (R1 조건 충족)', body: checklist(status) });
  return 0;
}

if (isMain(import.meta)) process.exitCode = await run(process.argv.slice(2));
