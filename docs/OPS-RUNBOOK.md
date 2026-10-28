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
- **캠페인별 유입 (블로그·앱 링크, REQ1014-A):** 블로그 글이나 앱에서 거는 링크 끝에 표시를 붙이면 `/admin/`의 「캠페인별 유입」 표와 주간 리포트에 들어온 곳·글별로 셉니다.
  - 형식: `https://docttak.com/<도구나 안내 글 주소>/?utm_source=<들어온 곳>&utm_campaign=<글 이름>`. 도구 설정이 있으면 앞에 둡니다: `https://docttak.com/id-photo/?preset=history&utm_source=naver_blog&utm_campaign=history-exam-photo`.
  - `utm_source`는 정해진 것만 이름으로 셉니다: `naver_blog`(네이버 블로그), `tistory`(티스토리), `play`(문서딱 앱, 이미 앱 시작 주소에 들어 있음). 그 밖의 값은 「기타」. 새 곳을 더하려면 `scripts/lib/usage.mjs` `UTM_SOURCES`와 `src/lib/ui/utm-land.ts`를 함께 고칩니다(단위 테스트가 둘을 맞춥니다).
  - `utm_campaign`은 영어 소문자·숫자·`-`로 60자까지(예: `history-exam-photo`). 대문자는 소문자로 바꿔 세고, 한글·띄어쓰기·61자 이상이면 「(목록 밖 이름)」, 없으면 「(캠페인 없음)」으로 셉니다. `utm_medium`·`utm_content`·`utm_term`은 읽지 않습니다(구글 애널리틱스는 그대로 받습니다).
  - 표 읽기: 「방문」은 표시가 붙은 링크로 홈·안내 글·도구를 연 횟수, 「처리 시작」·「성공」은 같은 탭에서 3시간 안에 이어진 도구 사용입니다. 위 방문(Cloudflare) 숫자와는 세는 방법이 달라 서로 맞지 않습니다. 영어 페이지(/en/)와 임베드 위젯은 세지 않습니다. 링크 공유 버튼은 표시를 떼고 공유합니다.
- **방문 표 읽기 (REQ1014-A):** 방문·페이지뷰 합계는 Cloudflare의 합계 노드, 표는 각자 따로 센 값이라 표본이 섞이면 합이 다를 수 있습니다(10%를 넘으면 표 아래 한 줄로 알려 줍니다). 「집계 정보」를 펼치면 노드마다 받은 행 수와 표본 간격이 보입니다. 「나라」는 한국어 페이지와 영어 페이지(/en/)로 나눕니다.
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

## 10. 인화 링크와 제휴 링크 (쿠팡 파트너스·링크프라이스)
**2026-10-28부터 다시 켜짐(LP1028, 대표 지시 「쿠팡 파트너스도 적극적으로 유치해봐」).** 도구 결과 화면에만 나오고, 안내 글·첫 화면·소개·문의에는 넣지 않습니다(11월 중순 애드센스 재심사 전까지, check-dist가 막습니다). 한 결과 화면에는 한 회사의 묶음만 나옵니다. 환경 변수를 넣지 않아도 켜져 있고, 끌 때만 `0`을 넣습니다. (2026-10-20~10-28에는 애드센스 재심사 준비로 코드에서 꺼 두었습니다, ADS1020.)

증명사진 결과 화면 아래에 링크 묶음이 있습니다. 「가까운 사진관 찾기 (네이버 지도, 새 창)」는 제휴가 아닌 정보 링크라 모든 빌드에 켜져 있습니다. 링크 주소는 `src/data/affiliate.ts`에 들어 있습니다(공개 링크라 비밀값이 아닙니다). 누른 횟수는 관리자 페이지 「상품·사진관 링크」 표와 주간 리포트에 자리(도구 이름)와 링크 종류별로 나옵니다(주문·가입했는지는 알 수 없습니다).

**링크가 나오는 곳 (2026-10-28).** 그림·배너 없이 글자 링크만, 광고 고지 문단이 언제나 먼저 나오고, 결과가 생긴 뒤에만 보입니다.

| 자리 | 회사 | 링크 |
|---|---|---|
| 증명사진 결과 (여권 온라인 규격) | 링크프라이스 | 도시락eSIM, 유심사 eSIM |
| 증명사진 결과 (그 밖의 규격) | 쿠팡 | 포토프린터, 인화지, 흰색 촬영 배경천 |
| 배경 지우기 결과 | 쿠팡 | 흰색 촬영 배경천 |
| 서명·도장 만들기, PDF 서명·도장 넣기 결과, 도장 만들기(모양을 고른 뒤) | 링크프라이스 | 한국정보인증 공동인증서 |
| HWP 파일 보기, HWP PDF 변환, HWPX HWP 변환 결과 | 쿠팡 | 한글 문서 프로그램(가정·학생용) — 상품은 한컴오피스 가정 및 학생용, 화면에는 일반 이름만 |
| PDF 합치기, PDF 나누기 결과 | 쿠팡 | 가정용 복합기 |
| 사진 PDF 변환 결과 | 쿠팡 | 가정용 복합기, 휴대용 문서 스캐너 |
| 글자수 세기(글을 쓰고 있을 때) | 링크프라이스 | 숨고 이력서·자소서 컨설팅 |
| 사직서 만들기 결과 | 링크프라이스 | 숨고 이력서·자소서 컨설팅 |

안내 글, 홈, 안내 글 목록, 용량 줄이기·변환·암호 도구, 위임장·차용증·전자명함·QR코드, 카메라로 찍기, 404, 개인정보·약관·라이선스, 영어 페이지(/en/), 임베드 위젯(/embed/)에는 넣지 않습니다(check-dist가 막습니다).

**쿠팡 파트너스**
1. 가입과 사이트 `docttak.com` 등록: **완료 (2026-10-12)**. 링크는 쿠팡 파트너스 → 링크 생성에서 만든 단축 링크(`https://link.coupang.com/a/...`)입니다.
2. 고지 문구 확인: 쿠팡 파트너스 화면의 지정 문구가 `src/data/affiliate.ts`의 `COUPANG_DISCLOSURE`(「이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.」, 2026-10-12 확인)와 같은지 봅니다. 다르면 알려 주세요(한 줄만 고치면 됩니다). 쿠팡 링크 묶음은 「광고: 아래 링크로 주문하면 문서딱이 수수료를 받을 수 있어요.」와 이 지정 문구가 링크보다 먼저 나옵니다.
3. 확인: `https://docttak.com/pdf-merge/`에서 PDF 두 개를 합칩니다. 결과 화면 아래에 고지 문단이 링크보다 먼저 보이고, 링크 이름마다 「광고」가 붙어 있는지 봅니다. 링크를 누르면 새 창에서 쿠팡이 열립니다.
4. 최종 승인을 다시 요구받으면: 3번 화면(고지 문단과 링크가 함께 보이게)을 캡처해 쿠팡 파트너스 마이페이지에 올립니다.

- **끄기:** Cloudflare → Workers & Pages → 프로젝트 `doc-tools-kr` → Settings → Variables and Secrets (Production)에 텍스트 `PUBLIC_AFF_COUPANG` = `0`을 넣고 다시 배포합니다(Deployments → 최신 배포 → Retry deployment). 쿠팡 링크와 고지가 HTML에서 빠지고, 링크프라이스 자리는 그대로입니다. 예전처럼 `1`이 들어 있거나 비어 있으면 켜진 상태입니다.
- **링크 바꾸기·추가:** 새 단축 링크를 알려 주세요. 링크 하나는 `src/data/affiliate.ts`의 `AFF_LINKS` 한 줄입니다. 새 자리에 넣는 것은 Arch 결정이 필요합니다(`TOOL_AFF`와 `scripts/lib/usage.mjs`, check-dist의 `COUPANG_PAGES`가 함께 바뀝니다).
- **링크가 죽었을 때:** 쿠팡 상품 링크가 판매 종료되면 쿠팡 화면이 대신 열립니다. 새 링크를 만들어 `AFF_LINKS`의 주소만 바꿉니다.
- **수익 메모:** 쿠팡 파트너스 수익은 3.3%가 원천징수되고, 최소 지급액은 2만 원입니다.

**링크프라이스 (LP1028, 2026-10-28)**
링크프라이스 묶음은 「광고: 아래 링크는 제휴마케팅 광고예요. 이 링크로 가입하거나 사면 문서딱이 수수료를 받아요.」가 링크보다 먼저 나옵니다. 링크 주소는 링크프라이스가 준 그대로 씁니다(주소를 고치거나 뒤에 무엇을 붙이면 수수료가 안 잡혀요; 단위 시험과 check-dist가 한 글자도 다르지 않은지 봅니다).
1. 링크프라이스 실명인증, 정산 계좌, 세금 정보 입력(대표만). 이게 없으면 수수료가 지급되지 않습니다.
2. 링크프라이스 콘솔에서 signgate(한국정보인증), dosirak1(도시락eSIM), usimsa(유심사), soomgo(숨고)가 docttak.com으로 승인되어 있는지 봅니다.
3. 배포 뒤 확인: 위 표의 자리마다 링크를 한 번씩 눌러 새 창에 광고주 화면이 열리는지, 링크프라이스 실시간 리포트에 클릭이 잡히는지 봅니다.
4. 광고주가 게재 화면을 요구하면: 결과 화면(고지 문단과 링크가 함께 보이게)을 캡처해 보냅니다.

- **끄기:** 같은 곳에 텍스트 `PUBLIC_AFF_LINKPRICE` = `0`을 넣고 다시 배포합니다. 링크프라이스 링크와 고지가 HTML에서 빠지고(check-dist가 확인합니다), 그 자리(서명·도장, 도장 만들기, PDF 서명)에는 쿠팡 인감도장 링크가 대신 나옵니다. 글자수 세기·사직서·여권 규격에는 아무것도 나오지 않습니다.
- **링크 바꾸기:** 링크프라이스에서 새 링크를 만들어 알려 주세요. 링크 하나는 `src/data/affiliate.ts`의 `LP_LINKS` 한 줄이고, 주소는 받은 그대로 붙여 넣습니다. 새 광고주·새 자리는 Arch 결정이 필요합니다(`TOOL_LP`, `scripts/lib/usage.mjs`, check-dist의 `LP_PAGES`).
- **매달 한 번:** 링크를 눌러 광고주 화면이 열리는지 봅니다. 프로그램이 끝났으면 링크프라이스 오류 화면이 새 창에 열리니(도구 창은 그대로), 링크를 바꾸거나 끕니다.
- **쓰지 않는 것:** 바로빌(맞는 도구가 없음, PC 전용), 도시락eSIM 일본 링크(여권 사진이 일본 여행을 뜻하지 않음).

- **정보 링크 끄기:** `PUBLIC_PRINT_INFO` = `0`을 넣고 다시 배포합니다.

## 11. 애드센스 재신청 (대표만)
2026-10-20 애드센스가 「가치가 별로 없는 콘텐츠」로 거절된 뒤의 준비(ADS1020). 코드는 첫 화면·안내 글·소개·문의 페이지에만 애드센스 코드를 넣고, 광고 요청은 멈춰 두며(광고 단위가 아직 없음), 맞춤 광고가 아닌 광고만 요청합니다. 제휴 링크(쿠팡·링크프라이스)는 2026-10-28부터 도구 결과 화면에만 있고, 애드센스 코드가 있는 페이지에는 없습니다(§10).

1. Cloudflare Pages → Production 변수 `PUBLIC_ADSENSE_ON` = `1` (`PUBLIC_ADSENSE_CLIENT`는 넣지 않아도 됨; 연락처·보호책임자는 이미 있음) → 재배포. 확인: 첫 화면과 안내 글의 페이지 소스에 adsbygoogle 코드가 있고, /pdf-merge/에는 없음.
2. 애드센스 콘솔 → 광고 → 사이트별 → docttak.com: 자동 광고 끄기 (앵커·전면(비네트) 포함).
3. 검토 요청은 11월 중순 이후 한 번만, P1(안내 글 정리·보강)이 배포된 뒤에. 거절 뒤 반복해서 누르지 않기.
4. 승인 전에는 광고가 나오지 않아요 (코드가 광고 요청을 멈춰 둠). 광고 단위는 승인 뒤 다음 스프린트에서.
5. 쿠팡·링크프라이스 링크는 도구 결과 화면에만 있어요(안내 글·첫 화면에는 없음, LP1028). 끄려면 `PUBLIC_AFF_COUPANG`·`PUBLIC_AFF_LINKPRICE` = `0` (docs/OPS-RUNBOOK.md §10).

- **Lighthouse:** 애드센스를 켠 빌드는 첫 화면·안내 글·소개·문의에서 스크립트 크기 기준(30 KB)을 넘습니다(Google 스크립트 약 230 KB, GA와 같은 경우). 기준은 그대로이고 CI는 애드센스를 끈 빌드로 잽니다. 켠 빌드는 성능·LCP·CLS·접근성·권장사항·SEO 기준만 지키면 됩니다(ADS1020).
- **끄기:** `PUBLIC_ADSENSE_ON`을 지우고 다시 배포합니다. 코드·/ads-cfg.js·광고용 CSP·개인정보 처리방침의 애드센스 항목이 함께 빠집니다(check-dist가 확인합니다).

## 12. 무료 임베드 위젯 (REV5, 증명사진 규격 맞추기)
사진관·학원·행정사 누리집이 코드 두 줄을 붙이면, 그 누리집 안에서 손님이 증명사진 규격 맞추기 도구를 그대로 씁니다. 사진은 손님 기기 밖으로 나가지 않습니다(도구와 같은 코드, 같은 화면). 안내와 복사용 코드는 `https://docttak.com/embed/`에 있습니다.

- **무엇이 들어가나:** `/embed/id-photo/` 한 페이지. 사이트 머리글·메뉴·바닥글, 공유, 이어서 하기, 사진관·쿠팡 링크, 광고, Google 애널리틱스, 방문자 수 집계가 없습니다. 오프라인 저장(서비스 워커)도 쓰지 않습니다. 맨 아래 「문서딱 제공」 링크(새 창, `/id-photo/?via=embed`)만 밖으로 나갑니다. 검색에는 나오지 않습니다(noindex, 대표 주소는 `/id-photo/`).
- **보안 설정:** `public/_headers`의 `/embed/id-photo/*` 묶음만 다른 누리집이 틀(iframe)로 넣는 것을 허용합니다(사이트 전체 정책을 떼어 낸 뒤 `frame-ancestors *`만 다른 같은 정책). 나머지 모든 페이지는 지금처럼 넣을 수 없습니다(check-dist, 단위 테스트, e2e가 막습니다).
- **사용량 보기:** 관리자 페이지 「어디서 왔는지에 따른 성공률」 표와 주간 리포트의 「다른 누리집」 칸입니다(via=embed). 위젯에서 쓴 횟수는 도구별 표의 증명사진 줄에도 함께 더해집니다.
- **어느 누리집이 넣었는지:** 우리 통계에는 넣은 누리집 주소를 보내지 않습니다. Cloudflare 대시보드 → 도메인 `docttak.com` → Analytics & Logs(또는 Web Analytics가 아닌 일반 트래픽 화면)의 참조 사이트(Referrers)에서 `/embed/id-photo/` 요청을 보낸 곳을 봅니다. 서버 쪽 기록이라 새로 보내는 것은 없습니다.
- **화이트라벨 메일이 오면:** (로고 바꾸기, 「문서딱 제공」 빼기) 가격과 조건은 대표가 정합니다. 답하기 전에 Arch와 상의해 주세요. 지금은 무료판(표시와 링크 유지)만 있습니다.
- **멈추기:** `src/pages/embed/id-photo/`를 지우고 `public/_headers`의 `/embed/id-photo/*` 묶음을 지운 뒤 배포합니다. 이미 넣은 누리집에는 빈 틀(찾을 수 없음 페이지)이 보입니다. 약관 11항(넣어 쓰기, 바뀌거나 멈출 수 있음)이 이 경우를 덮습니다.
