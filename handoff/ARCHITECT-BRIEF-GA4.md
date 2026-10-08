# Architect Brief — GA4 (Google 애널리틱스 4)

Owner decision 2026-10-08: GA4 `G-TFP7W8X8BG` on every page; privacy policy updated (cookies, overseas transfer to
Google LLC/USA). Keep Cloudflare Web Analytics and /admin/ stats unchanged. No footer blog link.
Starts only after TOOLS5 U1 is committed. Separate commit.

## Goal
With `PUBLIC_GA_ID` set, every built HTML page loads GA4 (page_view only) through a self-hosted loader after the page
has loaded, under a CSP widened only for Google's GA hosts, and the privacy policy discloses cookies and the transfer;
unset, the build output is what it is today (no tag, no loader file, no CSP change, no policy change).

## Flow
```
build: PUBLIC_GA_ID ──invalid──► check-dist error (build fails)
            │ unset ──► nothing (no tag, no dist/ga.js, CSP unchanged, policy unchanged)
            ▼ valid /^G-[A-Z0-9]{6,12}$/
 postbuild: gen-ga ─► dist/ga.js (ID baked in) ─► check-dist (tag on every page, loader ok)
            ─► gen-headers (CSP + /ga.js no-cache) ─► carry-assets ─► gen-sw (ga.js NOT precached)

browser:  <head> <script defer src="/ga.js" data-site-ga>   (runs BEFORE the page's module scripts)
            │ 1. capture loc = location.href minus #hash   (before quicklinks.readUrl's replaceState strips utm_*)
            │ 2. dataLayer + gtag('js') + gtag('config', ID, {...})   (queued, nothing sent yet)
            │ 3. window load (or already complete) ─► requestIdleCallback(timeout 2000) | setTimeout fallback
            ▼
          inject <script async src="https://www.googletagmanager.com/gtag/js?id=ID">
            ▼
          gtag.js drains dataLayer ─► one page_view to *.google-analytics.com  (sets _ga, _ga_<id>)
          load fails (blocker/offline/CSP) ─► silent, site unaffected (intended)
```

## Build Order
1. `scripts/lib/ga.mjs` (pure, unit-tested; mirror scripts/lib/analytics.mjs):
   - `GA_ID_RE = /^G-[A-Z0-9]{6,12}$/`; `gaId(value)` → trimmed id, '' when unset/blank, throws on invalid.
   - CSP host lists from Google's doc, "without Ads features"
     (https://developers.google.com/tag-platform/security/guides/csp, fetched 2026-10-08), plus the regional collect host:
     script-src `https://www.googletagmanager.com`;
     img-src `https://www.googletagmanager.com https://*.google-analytics.com`;
     connect-src `https://www.googletagmanager.com https://*.google-analytics.com https://*.analytics.google.com https://*.google.com`.
     No doubleclick / googlesyndication / frame-src (Ads features stay off).
   - `withGaCsp(headers)`: extends script-src, connect-src, img-src of the single site-wide CSP line; throws like
     withAnalyticsCsp if not exactly one line or nothing changed. Must compose with withAnalyticsCsp in either order.
   - `loaderSource(id)`: returns the ga.js text (ES5-safe IIFE, no eval, under 1 KB). Exactly, in this order:
     capture `loc` (href without hash) first; `window.dataLayer = window.dataLayer || []`;
     `function gtag(){dataLayer.push(arguments);}` (MUST push `arguments`, not an array: gtag ignores arrays);
     `gtag('js', new Date())`;
     `gtag('config', ID, { page_location: loc, allow_google_signals: false, allow_ad_personalization_signals: false,
       cookie_expires: 34128000, cookie_flags: 'SameSite=Lax;Secure' })` (34128000 s = 395 days, about 13 months);
     then load gtag.js after load + idle as in the flow. No other gtag calls. Do not expose gtag on window.
   - Flag: no custom events (decision below). page_title stays default (static titles; grep 2026-10-08 found no
     document.title assignment in src/ - add a unit grep test that keeps it so).
2. `scripts/gen-ga.mjs`: when `gaId(env.PUBLIC_GA_ID)` → write `dist/ga.js`; unset → ensure it is absent.
   package.json postbuild: prepend `node scripts/gen-ga.mjs && ` before check-dist (rest unchanged).
3. `src/data/ga.ts`: like src/data/analytics.ts → `GA_ID`, `GA_ON` (invalid renders nothing; check-dist fails the build).
   `src/env.d.ts`: `PUBLIC_GA_ID`.
4. `src/layouts/Base.astro` head: `{GA_ON && <script is:inline defer src="/ga.js" data-site-ga></script>}` placed
   BEFORE any processed/module script so it executes first (classic defer and module scripts run in document order).
   Verify in built HTML. Sits next to the CF beacon line; both coexist.
5. `scripts/gen-headers.mjs`: when on → `withGaCsp`, and append a `/ga.js` block with `Cache-Control: no-cache`
   (unhashed file; an ID change must not stick). Log line like the CF one.
6. `scripts/check-dist.mjs`: on → every HTML page has exactly one `src="/ga.js"` tag with data-site-ga; dist/ga.js exists,
   contains the id and both signal flags false (match the emitted form); no HTML contains `googletagmanager` or an
   inline `gtag(`. Off → no page has the tag, no dist/ga.js, `googletagmanager` appears nowhere in dist (whitelist by
   file only if third-party license text contains it).
7. Service worker: precacheList takes module entries only, so the classic /ga.js is skipped - add a gen-sw unit test
   that it is never precached. `src/sw/sw.ts route()`: Google origins already go 'default' (other origin); same-origin
   /ga.js must go to the network (never cache-first). Add route() tests for both. No Google hosts anywhere in sw.
8. Ops health `scripts/ops/lib/html.mjs`: /ga.js is same-origin, so offSiteScripts already passes it. Add tests: page
   with GA tag + CF beacon → no problems; page with a raw `<script src="https://www.googletagmanager.com/gtag/js...">`
   (dashboard/Zaraz injection) → still flagged. Comment near OWN_BEACON that GA is loaded first-party via /ga.js.
9. Privacy (`src/data/legal.ts`, `src/pages/privacy/index.astro`):
   - `PRIVACY_GA = '2026년 10월 8일'` (Arch re-confirms at the deploy gate = the day it goes live);
     `PRIVACY_REVISED = GA_ON ? PRIVACY_GA : <current chain>`; `PRIVACY_TERMS_UPDATED = GA_ON ? '2026-10-08' : '2026-10-07'`.
     Grep /terms/ for 쿠키/분석 wording; change only what becomes false.
   - Section 1, GA on: `... 이름·연락처 같은 개인정보를 받지 않아요. 방문 분석을 위해 Google 애널리틱스 쿠키를 써요(N항).`
     (N = the GA section number). Off → unchanged. The usage-stats "보내지 않는 것: ...쿠키" line stays (true for that beacon).
   - New section `id="ga"` right after "사이트를 여는 기록" (renumber with the existing n() scheme; test the numbers).
     Heading `Google 애널리틱스(방문 분석)`. Plain 해요체 content:
     - 목적: 어떤 페이지가 많이 읽히고 어디서 들어오는지 알아 사이트를 고치는 데 써요.
     - 쿠키(자동 수집 장치): `_ga`, `_ga_<번호>` - 다시 온 방문인지 구분하는 임의의 번호. 최대 13개월 보관.
     - 모으는 정보: 연 페이지 주소, 들어온 곳, 쿠키의 임의 번호, 기기·브라우저 종류, 화면 크기, 언어, 대략적인 지역
       (IP로 추정하며 IP 주소 자체는 Google 애널리틱스에 저장되지 않아요). 고른 파일의 이름과 내용은 담기지 않아요.
     - 국외 이전(개인정보 보호법 제28조의8): 받는 자 Google LLC(연락처: Google 개인정보 문의 양식 링크 - builder verifies a
       live Korean URL from policies.google.com/privacy), 이전 국가 미국, 이전 일시·방법 페이지를 열 때마다 인터넷으로 전송,
       이전 항목 위와 같음, 이용 목적 방문 통계, 보유·이용 기간 Google 애널리틱스에 2개월 보관 후 삭제(쿠키는 최대 13개월).
     - Google 신호와 광고 개인화는 꺼 두었고, 광고에 쓰지 않아요.
     - 거부 방법: 브라우저 설정에서 쿠키를 막거나 Google 애널리틱스 차단 부가 기능
       (https://tools.google.com/dlpage/gaoptout?hl=ko)을 쓰면 돼요. 막아도 모든 도구를 그대로 쓸 수 있어요.
     Change log item: `{PRIVACY_GA}: Google 애널리틱스(방문 분석, 쿠키)와 국외 이전 내용을 더함`.
   - Section 광고: unchanged (still true).
10. `docs/COPY.md`: add a GA bullet under the CF analytics bullet: `PUBLIC_GA_ID`(G-로 시작)가 있을 때만 켬; 켜면 처리방침에
    "Google 애널리틱스" 항, 1항 문장, 시행일, 변경 이력이 바뀜; GA 관리 화면 설정(Owner steps)은 코드 밖이라 손으로 확인.
11. CI (`.github/workflows/ci.yml`): add `PUBLIC_GA_ID: 'G-TEST000000'` to the dist-bgcloud build only (the
    everything-on build). Default and checks builds stay GA-off. Extend CLOUD_SPEC in playwright config with `ga.cloud`.

## Decisions (locked)
- Loader = self-hosted `/ga.js` generated at postbuild, ID baked in. No inline script, no 'unsafe-inline', no nonce.
- Timing = after window load + idle (max 2 s). Page LCP/TBT untouched; loss = visitors who leave before load (pages load
  under 2 s), acceptable. First-interaction-only rejected: silently drops non-interacting visitors. If the measured run
  fails perf/LCP, fall back to "first interaction OR 5 s after load" and record numbers - never loosen a gate.
- page_view only; no tool events to Google. First-party usage stats already cover tools; each extra event widens the
  Google disclosure. Known Gap "GA tool events mirroring the usage whitelist" if marketing asks.
- page_location = URL captured before replaceState, hash dropped, query kept (utm_* survive for the blog routines;
  deep-link params are whitelisted values). Files never enter the URL.
- Cookie lifetime 13 months via cookie_expires. Signals and ad personalization off in code AND in the property.
- No cookie banner: Korean practice is disclosure of the 자동 수집 장치 and how to refuse in the policy; EU traffic is
  negligible. Owner accepts the EU ePrivacy residual risk. Known Gap "consent banner if EU traffic grows or ads come".
- /admin/ (Pages Function) gets no GA. 404 and /offline/ get it like every page (offline: load fails silently).
- CF Web Analytics and usage stats unchanged.

## Failure modes
| Path | Realistic failure | Handling | User sees |
|---|---|---|---|
| env | typo'd ID (g-..., UA-...) | gaId throws → check-dist fails build | build red (owner) |
| loader order | ga.js runs after readUrl → utm lost | tag before module scripts + e2e asserts page_location keeps `?utm_source=` | tested |
| gtag call | pushes an array instead of `arguments` → zero hits, silent | unit asserts emitted source; e2e asserts a config entry in dataLayer | tested |
| CSP | Google uses a host not in the list → collect blocked, silent | Google doc hosts + `*.analytics.google.com`; owner checks GA Realtime after deploy (Owner step 5) | silent → covered by realtime check |
| blockers/offline | gtag.js blocked | ignored; no console error from our code; site works | nothing |
| SW | ga.js cached forever / Google proxied | not precached; route tests | tested |
| perf | gtag.js (100+ KB) hurts score | loads after load; GA-on lhci run measured | measured |
| file privacy | file name reaches dataLayer/URL | page_view only; e2e picks `비밀-파일명.pdf`, asserts dataLayer and every Google request URL lack it | tested |
| off build | GA leftovers | check-dist off-mode assertions | build red |

## Test map
- [GAP→add] unit `tests/unit/ga.test.ts`: gaId (unset/blank/valid/invalid), withGaCsp (exact directives, single line,
  throws, composes with withAnalyticsCsp both orders), loaderSource (id baked, `arguments`, both flags false,
  cookie_expires, loc captured first, no eval/innerHTML/document.write, under 1 KB).
- [GAP→add] unit postbuild/check-dist on/off (extend tests/unit/postbuild.test.ts pattern).
- [GAP→add] unit gen-sw: /ga.js never precached; sw route(): /ga.js → network, Google URLs → default.
- [GAP→add] unit ops.test.ts: GA tag accepted; raw gtag/js script flagged.
- [GAP→add] unit: src/ never assigns document.title.
- [GAP→add] unit privacy: GA on → section, section-1 sentence, numbering, change log, PRIVACY_REVISED; off → unchanged.
- [GAP→add] e2e default build (GA off): no request to googletagmanager/google-analytics, no /ga.js tag,
  `window.dataLayer` undefined.
- [GAP→add] e2e `tests/e2e/ga.cloud.spec.ts` on dist-bgcloud (G-TEST000000), served with real _headers: route
  `https://www.googletagmanager.com/gtag/js*` → stub script; route `https://*.google-analytics.com/**` → 204, record
  URLs. Assert: tag present; gtag/js requested only after load; zero CSP-violation console messages;
  `/pdf-compress/?utm_source=blog` → config page_location contains utm_source; fixture renamed `비밀-파일명.pdf` run
  through a tool → serialized dataLayer and all recorded Google URLs lack the name; CSP header has the exact GA hosts;
  no-upload fixture passes.
- [TESTED] CF beacon, usage beacon, existing CSP tests - must stay green unchanged (regression).
- Lighthouse: CI gate unchanged (GA-off build). PLUS a local measured run on a GA-on build (say whether gtag.js was
  real or stubbed) over `/`, `/pdf-compress/`, `/id-photo/`, `/guide/passport-photo/`: perf ≥ 0.95, LCP ≤ 2,000 ms,
  CLS ≤ 0.01, best-practices ≥ 0.95 (median of 5). `resource-summary:script:size` (30 KB) is a first-party budget,
  asserted on the GA-off build; record the GA-on value in BUILD-LOG; do not change lighthouserc.

## Out of Scope
- GA custom/tool events; Google Ads/AdSense; consent banner / Consent Mode; footer blog link; /admin/ changes;
  replacing CF Web Analytics; GTM container. → BUILD-LOG Known Gaps.

## Acceptance
- All tests above green; build with and without PUBLIC_GA_ID passes postbuild; GA-off dist identical to U1 HEAD dist.
- GA-on lhci numbers recorded in BUILD-LOG.
- CLAUDE.md proposal (orchestrator applies), in REVIEW-REQUEST, replacing the "only third-party script" sentence:
  "Third-party scripts: the cookieless Cloudflare Web Analytics beacon (`PUBLIC_CF_ANALYTICS_TOKEN`,
  scripts/lib/analytics.mjs) and Google Analytics 4 (`PUBLIC_GA_ID`, scripts/lib/ga.mjs; owner-approved 2026-10-08):
  a self-hosted /ga.js loads gtag.js after `load`, page_view only, Google signals and ad personalization off, never
  file data. Each widens the CSP only when its env var is set; otherwise CSP `script-src`/`connect-src 'self'`."

## Owner steps (after merge)
1. Cloudflare Pages → Settings → Environment variables (Production): `PUBLIC_GA_ID = G-TFP7W8X8BG`, then redeploy.
2. GA 관리 → 데이터 수집 및 수정 → 데이터 보관: 이벤트 데이터 2개월 (the policy says 2개월; must match).
3. GA 관리 → 데이터 수집: Google 신호 데이터 수집 OFF, 광고 개인 최적화 OFF; no Google Ads / other product links.
4. 데이터 스트림 → 향상된 측정: "브라우저 기록 이벤트 기반 페이지 변경" OFF (quicklinks replaceState would double
   page_view); 파일 다운로드, 양식 상호작용 OFF (keep Google out of tool actions); 스크롤 OFF recommended.
5. After deploy: GA 실시간 보고서에서 내 방문 1건 확인; 페이지 소스에 /ga.js, 개인정보 처리방침 새 항 확인.
