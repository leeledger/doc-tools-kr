// M-3: the R1 (AdSense) trigger (docs/REVENUE-MODEL.md §1, docs/OPS-RUNBOOK.md).
// ADS1020: the issue carries the owner checklist of docs/OPS-RUNBOOK.md §11 (the code side shipped in ADS1020).
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
    '## 애드센스 재신청 체크리스트 (docs/OPS-RUNBOOK.md §11, 대표만)',
    '- [ ] Cloudflare Pages → Production 변수 `PUBLIC_ADSENSE_ON` = `1` (`PUBLIC_ADSENSE_CLIENT`는 넣지 않아도 됨; 연락처·보호책임자는 이미 있음) → 재배포. 확인: 첫 화면과 안내 글의 페이지 소스에 adsbygoogle 코드가 있고, /pdf-merge/에는 없음',
    '- [ ] 애드센스 콘솔 → 광고 → 사이트별 → docttak.com: 자동 광고 끄기 (앵커·전면(비네트) 포함)',
    '- [ ] 검토 요청은 11월 중순 이후 한 번만, P1(안내 글 정리·보강)이 배포된 뒤에. 거절 뒤 반복해서 누르지 않기',
    '- [ ] 승인 전에는 광고가 나오지 않아요 (코드가 광고 요청을 멈춰 둠). 광고 단위는 승인 뒤 다음 스프린트에서',
    '- [ ] `PUBLIC_AFF_COUPANG`는 지워도, 그대로 둬도 돼요 (코드에서 꺼져 있음)',
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
