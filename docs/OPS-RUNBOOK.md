# 문서딱 운영 자동화 런북 (REVENUE-MODEL §3: A-1~A-6, M-3)

모든 작업은 GitHub Actions에서 돈다. AI 호출은 없고, 사이트에 추적 코드나 외부 스크립트를 넣지 않는다. 사람이 볼 일은 GitHub 이슈로만 올라온다(라벨 `ops:*`). 같은 라벨의 이슈는 하나만 열어 두고, 새 결과가 나오면 본문을 바꾸고 댓글을 단다(알림이 간다).

코드: `scripts/ops/*.mjs` (Node 22, 의존성 없음), 라이브 스모크 `tests/live/tools.spec.ts` + `playwright.live.config.ts`, 단위 테스트 `tests/unit/ops.test.ts`.

## 1. 작업 목록

| ID | 워크플로 | 언제 | 하는 일 | 이슈 라벨 |
|---|---|---|---|---|
| A-1 | `ops-post-deploy.yml` (job `verify`) | main 푸시마다 | 라이브 `<meta name="build-id">`가 커밋 SHA 앞 12자리와 같아질 때까지 20초 간격으로 최대 20분 기다린다. 그다음 `npm run smoke:assets -- https://docttak.com`, 그리고 라이브 Playwright 스모크(도구 5개를 저장소의 픽스처로 실제 처리하고 결과 파일을 검사, 사이트 밖 요청 0, 요청 본문 0, 모든 응답에 설계된 CSP `connect-src`(`'self'`, 방문 분석·GA가 켜져 있으면 `scripts/lib/analytics.mjs`·`ga.mjs`의 호스트만 더함, `scripts/lib/csp-connect.mjs`), 분석 요청은 차단(9절), 콘솔 오류·페이지 오류·CSP 위반 0). | `ops:deploy` — 실패 시 열기/갱신(단계별 결과와 로그 끝 60줄), 통과 시 자동 닫기 |
| A-2 | `ops-post-deploy.yml` (job `indexnow`) | A-1 통과 직후 | 라이브 sitemap을 지난번 성공한 핑 때의 sitemap(Actions 캐시 `indexnow-sitemap-*`)과 비교해 새 URL·lastmod가 바뀐 URL만 `scripts/indexnow.mjs`로 보낸다. 캐시가 없으면(첫 실행, 7일 미사용으로 만료) 전체를 한 번 보낸다(재제출은 무해). 핑이 실패하면 캐시를 갱신하지 않아 다음 배포 때 다시 보낸다. | `ops:deploy` — 핑 실패 시 |
| A-3 | `ops-source-watch.yml` | 매주 수요일 08:41 KST | 안내 페이지 frontmatter의 `sources`(url+quote)와 공식 증명사진 프리셋(`src/data/id-photo-presets.ts`의 `sourceUrls`+`quote`)을 모아, 출처 URL마다 한 번씩 차례로 가져온다(식별 UA `docttak-ops/1.0`, 요청 사이 1.5초, 429·5xx·네트워크 오류는 2·5·10초 뒤 재시도, EUC-KR 페이지도 디코딩). 인용 문구(“…”로 생략된 부분과 프리셋의 “ / ”로 이은 문장은 조각별로)가 페이지 텍스트에 그대로 있는지 본다. 비교는 공백·태그·HTML 엔티티·가운뎃점(·ㆍ)·물결표·대시·×를 무시한다. | `ops:source-changed` — 페이지, 출처 URL, 우리가 인용한 문구, 현재 페이지에서 가장 비슷한 부분. 가져오지 못한 출처도 같이 적는다. 사람이 고친 뒤 닫는다(다음 주에 모두 일치하면 그렇다고 댓글을 단다). |
| A-4 | `ops-health.yml` | 매일 07:17 KST | sitemap의 모든 URL을 브라우저와 같은 헤더로 요청한다(Cloudflare는 브라우저로 보이는 응답에만 스크립트를 삽입한다). 200, canonical(자기 주소), `og:title`·`og:description`·`og:image`·`og:url`, JSON-LD(파싱 가능; 법적 고지 3쪽은 원래 없음), 사이트 밖 `<script src>`와 Cloudflare 삽입 스크립트(`/cdn-cgi/`, Web Analytics 비컨, Rocket Loader, Email Obfuscation), 내부 링크 전부 200, 응답 시작 시간(TTFB) 2초 이하(두 번 중 나은 값). | `ops:health` — 실패 시 열기/갱신, 깨끗해지면 자동 닫기 |
| A-5 | `ops-weekly.yml` | 매주 월요일 09:23 KST | 서치콘솔(최근 7일·28일 클릭·노출·CTR·평균 순위, 상위 쿼리·페이지; 데이터 지연 3일 반영)과 Cloudflare GraphQL(요청·캐시 요청·대역폭·페이지뷰·일별 순방문자 합)을 가져와 `reports/growth/YYYY-WW.md`(실행일의 ISO 주)를 쓰고 main에 커밋한다(`[skip ci]`: CI와 Pages 빌드를 돌리지 않는다). 리포트 끝의 `<!-- growth-data {...} -->` 한 줄이 M-3의 입력이다. | `ops:growth` — 매주 새 요약 이슈, 지난주 것은 닫는다. 비밀값이 없으면 그 부분을 건너뛰고 메모, API 오류면 제목에 “(오류 있음)” |
| A-6 | `ops-weekly.yml` | A-5 직후 | 28일 쿼리에서 ① 노출 50회 이상·CTR 2% 미만, ② 노출 10회 이상인데 안내 페이지가 없는 쿼리(쿼리의 단어가 모두 한 안내의 slug·제목·대상 검색어에 들어 있으면 “있음”, 초안은 제외, 브랜드 검색 제외)를 골라 추천 도구 딥링크와 함께 올린다. | `ops:opportunity` — 열기/갱신 |
| M-3 | `ops-weekly.yml` | A-6 직후 | R1 조건: 라이브 sitemap URL 15개 이상, 그리고 커밋된 리포트의 최근 4개가 연속된 ISO 주이고 각 주 7일 클릭이 100 이상. 충족하면 애드센스 준비 체크리스트 이슈를 연다. 한 번만 연다(열렸든 닫혔든 `ops:monetize` 이슈가 있으면 다시 열지 않는다). | `ops:monetize` |

작업 자체가 죽으면(스크립트 오류, 권한 오류) 각 워크플로의 마지막 단계가 그 작업의 라벨로 이슈를 열거나 댓글을 단다. 라벨은 처음 쓸 때 자동으로 만들어진다.

**푸시마다 도는 것은 A-1·A-2(main)뿐이다.** 나머지는 일정(cron)과 수동 실행(`workflow_dispatch`)으로만 돈다. 일정 실행은 기본 브랜치(main)의 워크플로 파일로 돈다.

## 2. 비밀값 (Settings → Secrets and variables → Actions → New repository secret)

| 이름 | 쓰는 곳 | 없으면 | 값 |
|---|---|---|---|
| `GSC_SERVICE_ACCOUNT_JSON` | A-5, A-6 | 서치콘솔 부분을 건너뛰고 리포트·요약 이슈에 메모. A-6은 할 일이 없고, M-3 클릭 조건은 충족되지 않는다. | 서비스 계정 키 JSON 파일 내용 전체(아래 §3) |
| `CF_API_TOKEN` | A-5 | Cloudflare 부분을 건너뛰고 메모 | API 토큰, 권한 `Zone → Analytics → Read`, 범위 `docttak.com` 존. `CF_ZONE_ID`를 넣지 않으면 `Zone → Zone → Read`도 함께 준다(존 이름으로 ID를 찾는다). |
| `CF_ZONE_ID` (선택) | A-5 | 토큰으로 존 ID를 찾는다 | Cloudflare 대시보드 → docttak.com → 개요 오른쪽 아래 “Zone ID” |
| `AE_API_TOKEN` | A-5 | 도구 사용 부분을 건너뛰고 메모 | 읽기 전용 API 토큰, 권한 `Account → Account Analytics → Read`, 이 계정만(§8). Pages 비밀값 `AE_API_TOKEN`과 같은 값. 기존 `CF_API_TOKEN`은 그대로 둔다. |
| `CF_ACCOUNT_ID` | A-5 | 도구 사용 부분을 건너뛰고 메모 | Cloudflare 계정 홈 오른쪽의 “Account ID” |

`GITHUB_TOKEN`은 Actions가 자동으로 준다. 워크플로마다 필요한 권한만 적어 두었다(이슈 쓰기, A-5만 `contents: write`).

**main 보호 규칙을 켤 때:** A-5가 `github-actions[bot]`으로 main에 리포트를 커밋한다. 보호 규칙이 직접 푸시를 막으면 리포트 커밋이 실패하고 `ops:growth` 이슈가 열린다. 규칙(Rulesets)의 Bypass list에 “GitHub Actions” 앱을 넣거나, `reports/growth/**`만 예외로 둔다.

## 3. 서치콘솔 서비스 계정 만들기 (한 번, 약 10분)
1. https://console.cloud.google.com/ 에서 프로젝트를 하나 만든다(예: `docttak-ops`). 결제 정보는 필요 없다.
2. **API 및 서비스 → 라이브러리**에서 “Google Search Console API”를 찾아 **사용**을 누른다.
3. **IAM 및 관리자 → 서비스 계정 → 서비스 계정 만들기**. 이름 예: `docttak-gsc-reader`. 프로젝트 역할은 주지 않는다(건너뛰기).
4. 만든 서비스 계정 → **키** 탭 → **키 추가 → 새 키 만들기 → JSON**. JSON 파일이 내려받아진다. 이 파일은 비밀번호와 같다: 저장소·메신저에 올리지 않는다.
5. https://search.google.com/search-console → 속성 `docttak.com`(도메인 속성) → **설정 → 사용자 및 권한 → 사용자 추가**. 서비스 계정 이메일(`docttak-gsc-reader@<프로젝트>.iam.gserviceaccount.com`, JSON의 `client_email`)을 넣고 권한은 **제한됨**(읽기)으로 한다.
6. GitHub 저장소 → Settings → Secrets and variables → Actions → **New repository secret**: 이름 `GSC_SERVICE_ACCOUNT_JSON`, 값은 JSON 파일 내용 전체를 붙여 넣는다. 그 뒤 내려받은 JSON 파일은 지운다.
7. Actions → “Ops A-5/A-6/M-3 weekly growth” → **Run workflow**(dry run 체크)로 확인한다. 로그의 리포트에 “서치콘솔 오류: … 403”이 보이면 5단계(사용자 추가)를 다시 확인한다. 막 추가했으면 몇 분 뒤에 다시 돌린다.

토큰 교환은 `node:crypto`로 RS256 JWT를 서명해서 한다(googleapis 패키지 없음). 범위는 `webmasters.readonly`뿐이다.

## 4. Cloudflare 토큰 만들기
1. Cloudflare 대시보드 → 오른쪽 위 프로필 → **API 토큰 → 토큰 생성 → 사용자 지정 토큰**.
2. 권한: `Zone` / `Analytics` / `Read` (그리고 `CF_ZONE_ID`를 따로 넣지 않으면 `Zone` / `Zone` / `Read`). 영역 리소스: `Include` / `Specific zone` / `docttak.com`.
3. 만든 토큰을 `CF_API_TOKEN` 비밀값으로 넣는다.

## 5. 손으로 돌리기 (로컬, 모두 `--dry-run` 지원)
`--dry-run`은 이슈를 만들지 않고, 커밋할 파일을 쓰지 않고, IndexNow에 보내지 않는다. 대신 무엇을 할지 출력한다.

```sh
node scripts/ops/wait-deploy.mjs --sha $(git rev-parse HEAD) --dry-run   # A-1 대기 (한 번만 확인)
npm run smoke:assets -- https://docttak.com                               # A-1 자산 스모크
npx playwright install chromium && npx playwright test -c playwright.live.config.ts   # A-1 라이브 스모크
node scripts/ops/indexnow-diff.mjs --state .ops-state/sitemap.xml --dry-run          # A-2
node scripts/ops/source-watch.mjs --dry-run                               # A-3 (출처 10곳, 1~2분)
node scripts/ops/health.mjs --dry-run                                     # A-4
node scripts/ops/growth.mjs --out-json .ops-state/growth.json --dry-run   # A-5 (비밀값은 환경 변수로)
node scripts/ops/opportunities.mjs --data .ops-state/growth.json --dry-run   # A-6
node scripts/ops/monetize.mjs --dry-run                                   # M-3
node scripts/ops/issue.mjs open|close --label ops:x --title … --body-file f.md --dry-run
```

Actions에서는 각 워크플로의 **Run workflow**에 “Dry run” 체크박스가 있다. `.ops-state/`는 git에서 제외된다.

## 6. 이슈를 받았을 때
- **`ops:deploy`**: 이슈의 단계 표를 본다. “라이브 빌드 대기”가 실패면 Cloudflare Pages 배포 로그(빌드 실패, 또는 20분 넘게 대기 중). 스모크 실패면 실행 기록의 `live-smoke` 아티팩트(trace)를 연다. 고친 커밋이 통과하면 자동으로 닫힌다.
- **`ops:health`**: “외부·삽입 스크립트”는 Cloudflare 대시보드 설정 문제다(Web Analytics/RUM, Rocket Loader, Scrape Shield → Email Address Obfuscation을 끈다). 다음 날 점검이 깨끗하면 자동으로 닫힌다.
- **`ops:source-changed`**: 출처 페이지를 열어 규격이 실제로 바뀌었는지 본다. 바뀌었으면 안내 페이지·프리셋의 수치와 `quote`·`retrieved`를 고친다(공식 출처에서 그대로 옮긴다). 문구만 다듬어졌으면 `quote`만 새 문장으로 바꾼다. 출처를 가져오지 못한 경우가 몇 주 이어지면 URL이 바뀐 것이다.
- **`ops:opportunity`**: A-7(콘텐츠 루프) 또는 사람이 후보를 골라 새 안내 페이지를 만든다. 공식 출처를 직접 가져올 수 있는 것만.
- **`ops:monetize`**: 체크리스트대로 광고 설계를 마치고 대표가 애드센스 신청 버튼을 누른다.

## 7. 기준값을 바꿀 때
- R1 조건: `scripts/ops/lib/report.mjs`의 `R1` (REVENUE-MODEL §1과 함께 바꾼다).
- A-6 기준: `scripts/ops/opportunities.mjs`의 `LOW_CTR`, `UNCOVERED`.
- A-4 TTFB: `scripts/ops/health.mjs`의 `TTFB_LIMIT_MS`.
- A-1 대기 시간: `ops-post-deploy.yml`의 `--timeout 1200`(초).

## 8. 익명 사용 통계와 관리자 페이지 켜기 (한 번, 약 15분)
도구가 얼마나 쓰이고 어디서 막히는지 합계로 봅니다(쿠키·식별값 없음, 기록은 3개월 뒤 자동 삭제). 켜기 전까지 사이트에는 통계 코드가 없고, `/admin/`은 404입니다.

1. Cloudflare → Workers & Pages → 프로젝트 `doc-tools-kr` → Settings → Bindings → Add → **Analytics engine**: Variable name `USAGE`, Dataset `docttak_usage` (Production). 데이터셋은 첫 기록 때 생깁니다.
2. 오른쪽 위 내 프로필 → API Tokens → Create Token → Custom token: 권한 `Account → Account Analytics → Read`, Account Resources는 이 계정만. 만든 토큰을 복사해 둡니다.
3. Pages → Settings → Variables and Secrets (Production)에 넣습니다.
   - 비밀값(Secret) `AE_API_TOKEN`: 2번의 토큰
   - 텍스트 `CF_ACCOUNT_ID`: 계정 홈 오른쪽의 Account ID
   - 비밀값(Secret) `ADMIN_PASSWORD`: 아무렇게나 만든 16자 이상(비밀번호 관리 앱에 보관). 16자보다 짧거나 없으면 `/admin/`은 404입니다.
   - 텍스트 `PUBLIC_USAGE_STATS` = `1` (선택: `PUBLIC_USAGE_SAMPLE` = 0.01~1, 일부 방문만 보낼 때. 합계는 자동으로 다시 맞춰집니다)
   - `PUBLIC_CONTACT_EMAIL`이 있어야 합니다(없으면 빌드 실패). `PUBLIC_ERROR_BEACON_PATH`가 있으면 지웁니다(없어진 설정이라 빌드 실패).
4. GitHub → Settings → Secrets and variables → Actions: `AE_API_TOKEN`, `CF_ACCOUNT_ID` (§2 표). 주간 성장 리포트에 "도구 사용 (지난 7일)" 표가 붙습니다.
5. Pages → Deployments → 최신 배포 → Retry deployment. 확인: `https://docttak.com/admin/`이 비밀번호를 묻습니다(사용자 이름 `admin`). 도구를 한 번 써 보고 몇 분 뒤 새로고침하면 표에 줄이 생깁니다.
6. Security → WAF → Rate limiting rules: **설정됨 (2026-10-08)** — `/api/`로 시작하는 요청이 같은 IP·같은 데이터센터에서 10초에 100회를 넘으면 10초 차단(무료 요금제 규칙 1개). 시험: 250회 연속 요청 중 79회가 429, 홈은 영향 없음, 10초 뒤 자동 해제. (선택) Zero Trust → Access로 `docttak.com/admin*`에 한 겹 더 잠금.

- **끄기:** `PUBLIC_USAGE_STATS`를 지우고 다시 배포합니다(통계 코드가 사이트에서 빠집니다). 쌓인 기록은 3개월 안에 지워집니다.
- **요청 한도:** `/api/usage`와 배경 지우기(`/api/remove-bg`), `/admin/`은 Workers 무료 한도(하루 10만 요청)를 함께 씁니다. 방문이 늘어 한도에 가까워지면 `PUBLIC_USAGE_SAMPLE`을 낮춥니다(예: 0.2). Analytics Engine은 하루 기록 10만 건·조회 1만 건까지 포함입니다.
- **표가 비어 있을 때:** 1번 바인딩이 빠지면 `/api/usage`가 503을 돌려주고 아무것도 쌓이지 않습니다. `/admin/`에 "통계를 불러오지 못했어요 (HTTP 403)"이 보이면 토큰 권한이나 Account ID를 확인합니다.

## 9. 자동화 트래픽 제외 (2026-10-10, INTERNAL-TRAFFIC)

우리 자동화가 라이브 사이트(https://docttak.com)를 실제 브라우저로 열 때는 **Cloudflare Web Analytics(방문 수), Google 애널리틱스, 익명 사용 통계(`/api/usage`)에 아무것도 보내지 않는다.** 사이트 자체는 바뀌지 않았고, 브라우저 쪽에서 막는다.

- 공용 도구: `scripts/lib/no-analytics.mjs`의 `blockAnalytics(context)`. 첫 페이지를 열기 전에 Playwright 브라우저 컨텍스트에서 `static.cloudflareinsights.com`, `cloudflareinsights.com`(`/cdn-cgi/rum`), `www.googletagmanager.com`, `*.google-analytics.com`, `*.analytics.google.com`, 그리고 어느 주소든 `/api/usage`로 가는 요청(sendBeacon 포함)을 중단시킨다. 서비스 워커는 막아 둔 채로 쓴다(`serviceWorkers: 'block'`).
- 쓰는 곳: A-1 라이브 도구 스모크(`playwright.live.config.ts`의 `noAnalytics: true` → `tests/e2e/no-upload.ts` 픽스처), `npm run qa:visual -- --url https://docttak.com`(배포 게이트). 막힌 분석 요청은 브라우저 밖으로 나가지 않으므로 업로드 검사와 콘솔 오류 검사에서 빼고 센다.
- 브라우저를 쓰지 않는 점검(`smoke:assets`, A-4 건강 점검, 배포 대기, IndexNow, 주간 성장)은 HTML과 파일을 `fetch`로 받기만 하고 페이지 스크립트를 실행하지 않으므로 비컨이 나가지 않는다. Lighthouse(`npm run lhci`)는 로컬 dist만 잰다.
- 지키는 장치: `tests/unit/no-analytics.test.ts`가 `scripts/`·`tests/`에서 브라우저를 띄우는 모든 파일이 `blockAnalytics`를 쓰거나 로컬 전용 목록(127.0.0.1·file://·가짜 주소만 여는 회귀·스파이크 스크립트)에 있는지, 라이브 설정이 `noAnalytics: true`인지, 워크플로가 라이브 대상 Playwright를 `playwright.live.config.ts`로만 돌리는지 검사한다. 새 라이브 브라우저 스크립트를 만들면 `blockAnalytics`를 부르거나, 로컬 전용이면 그 목록에 이유와 함께 넣는다.
- **이전 데이터 주의:** 2026-10-07(방문 분석 시작)부터 이 변경이 배포된 2026-10-10까지의 방문 수·GA·사용 통계에는 자동화(GitHub Actions 미국 러너의 배포 후 스모크, 재시도 포함)가 섞여 있다. 미국 방문과 배포가 많았던 날의 급증이 그 흔적이다. 수익화 판단은 2026-10-11 이후 데이터로 하거나, 그 이전 기간은 국가를 KR로 걸러 본다.
- 로그를 `tee`로 남기는 A-1 단계는 `set -o pipefail`로 돈다. 2026-10-10 이전에는 이것이 없어 라이브 스모크·자산 스모크가 실패해도 작업이 통과로 표시됐다(실행 38020029020: 실패 원인은 위 CSP 검사 불일치와 분석 요청이었고, 도구 처리 자체는 성공).
- 운영자 본인의 방문(브라우저로 사이트 확인)은 제외되지 않는다.
