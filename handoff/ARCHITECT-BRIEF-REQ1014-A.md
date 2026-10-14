# Architect Brief — REQ1014-A (analytics / admin)

Base: `req-1014` = origin/main ee4950c. Parallel briefs: -B (tool UX incl. HWP viewer / id-photo error screens), -C. Do not touch `handoff/ARCHITECT-BRIEF.md`.
Merge note: worktrees c2 / emb2 / rev6 have uncommitted edits to `scripts/lib/usage.mjs` and `scripts/lib/admin-view.mjs`. Keep edits there **additive** (append constants, add branches, new functions); put new logic in new modules (`scripts/lib/campaign.mjs`, `src/lib/ui/utm-land.ts`, `src/lib/file/sniff-format.ts`).

## Goal
/admin/ shows "캠페인별 유입" (utm_source + utm_campaign → 방문·처리 시작·성공), its 1-day 방문 numbers agree with its own tables, countries are split Korean pages vs /en/, the app referrer has a name, stamp-signature → pdf-sign hand-offs are counted, and HWP-viewer / id-photo failure codes say which format was really picked.

## Findings (code read 2026-10-14; Step 0 probe confirms the RUM ones)
- **F1 (UTM vs preset): confirmed safe.** `deeplink.parse()` uses `URLSearchParams.get(DEEP_PARAM)`, so `?preset=history&utm_*` gives preset history. Canonical/og:url: `Base.astro:48` `new URL(Astro.url.pathname, Astro.site)`, `BaseEn.astro:27` same, `Guide.astro:24` `guidePath(slug)`: a query can never reach them (static build). Nothing locks this today, so tests are added (T-E1).
- **F2 (UTM is stripped on 3 tools):** `quicklinks.readUrl()` (id-photo, pdf-compress, photo-compress) calls `writeUrl` → `history.replaceState` with only the deep param: utm_* is dropped right after load. GA4 is unaffected on purpose (`scripts/lib/ga.mjs` loaderSource reads `location.href` in the classic /ga.js before module scripts run; its comment says so). Our own capture must therefore happen before `readUrl`: `startUsage(tool)` already runs before `readUrl` in all three (id-photo entry.ts:20 vs :62, pdf-compress controller.ts:856 vs :858, photo-compress :852 vs :854). SiteScript sits at the end of `<body>` (Base.astro:157), after the tool scripts: too late for tool pages, fine for home/guides (they never strip).
- **F3 (2b, 방문 110 vs tables 210):** KPI 방문/페이지뷰 = `sum(cur.trend)` (visits.mjs shapeVisits `totals: sum(cur.trend)`), the sum of the **`datetimeHour` groups**. The tables are separate nodes (referrers/devices) in the same POST. The visits.mjs header already records that in a sampled tier "hour groups there even return visits 0": the hourly node can lose visits under sampling while dimension nodes extrapolate. Referrers (self excluded) = devices = 210, so the dimension nodes agree with each other; the hourly node is the odd one. Root cause: totals are taken from the most sampling-fragile node. Fix D9 (dimensionless `total` node) is right whichever node was wrong; Step 0 records per-node `avg.sampleInterval` to prove it.
- **F4 (2a, 많이 본 페이지 empty, visits 110):** the code has no filter or threshold on pages: `section()` prints "이 기간에는 기록이 없어요" only when `visits.pages` is `[]`, and `shapeVisits` only sorts/slices. So the `pages` node (`requestPath`, `orderBy: [count_DESC]`, limit 50) came back **empty from Cloudflare** while other nodes had rows (a `null` node would have thrown BAD_SHAPE and shown the notice instead). The same sampling path as F3 is the leading explanation; unproven without Step 0. Fix D10 does not depend on the cause (a second node ordered by visits + an honest message).
- **F5 (2d):** `com.docttak.app` is the TWA (`public/.well-known/assetlinks.json`, `twa/`). The TWA start URL is `https://docttak.com/?utm_source=play&utm_medium=twa` (twa/README.md), so it also lands in the new campaign table as source `play`. **Play status (fact):** commit e45f55f "[TWA 3] assetlinks: Play 앱 서명 키 SHA-256 추가" (2026-10-13 11:27 KST); the Play app-signing fingerprint only exists after an AAB was uploaded to Play Console. BUILD-LOG has **no entry** that the store listing is public in production; twa/README.md's checklist speaks of the 내부 테스트 트랙. 11 referrals/day prove installed copies open the site (testers or public). Owner confirms in Play Console; log the answer.
- **F6 (3, stamp → pdf-sign = 0): tracking gap.** The buttons exist: `#ss-to-pdf` and `#ss-pad-to-pdf` ("PDF에 넣기", src/pages/stamp-signature/index.astro:101,169). Their handlers (photo.ts:411-414, pad.ts:218-221) call `sendToPdfSign()` (src/lib/ui/sign-handoff.ts:77), which stores the PNG and navigates; **no `track({ e: 'next' })` anywhere on this path**. Only the generic next-steps slot (next-steps.ts:145) tracks `next`, and stamp-signature does not use it.
- **F7 (4):** `not-hwp` comes from src/lib/hwp/features.ts:196,199,240,242 and session.ts:412 (shared by hwp-viewer and hwp-to-pdf via `usageFail`). id-photo `corrupt` comes from controller.ts:452,503-504. `CODE_RE = ^[a-z-]{1,24}$` (no digits). Fail codes are free text within CODE_RE; labels live in `FAIL_LABELS` (unknown codes render raw).

## Step 0: RUM probe (orchestrator, before Bob; owner's Chrome via chrome-cdp, logged-in dash.cloudflare.com tab, same method as handoff/rum-probe-query.js)
Chrome on 127.0.0.1:9333 was not running when this brief was written, so nothing below is probed yet.
Run, for the rolling 1-day window ending now and for the 7-day window, one POST with the **exact final query of D9 to D12** (total, trend, pages, pagesByVisits, referrers, countriesKo, countriesEn, devices; each with `avg { sampleInterval }`), plus a throwaway node `usBrowsers` (filter $filter + `countryName: "US"`, dims `userAgentBrowser requestPath`, limit 50). Record in BUILD-LOG "REQ1014-A probe": per node row count, Σvisits, Σcount, max sampleInterval; whether `requestPath_like` / `requestPath_notlike` are accepted.
Decision tree (Bob follows the logged result; if Step 0 could not run, build the defaults and the post-deploy check replaces it):
- `_like` rejected (errors[]): D11 fallback, one node `countryPaths` dims `{ countryName requestPath }`, limit 1000, orderBy sum_visits_DESC, split client-side by `requestPath.startsWith('/en/')`; a full answer sets approxTops.
- `pages` empty but `pagesByVisits` not: keep D10 as built (it already falls back).
- Both empty with total > 0: the D10 message stays; Known Gap "Cloudflare pages node empty in 1-day window", attach the probe JSON.
- `usBrowsers`: report only. No new bot filter in this step (no proven heuristic; a `userAgentBrowser_notin` would make our numbers silently differ from the dashboard). Known Gap with the numbers.

## Flow
```
blog link /id-photo/?preset=history&utm_source=naver_blog&utm_campaign=history-exam-photo
  |
  +-- tool page: entry -> startUsage(tool) -> tracker.start
  |      utmOf(search) -> stash {s,c,at} in sessionStorage 'docttak:utm'   (always, lang ko, not /embed/)
  |      sampled? -> beacon land {t:tool, us, uc}
  |   -> readUrl() strips utm (unchanged, F2)            (/ga.js already read the full URL)
  |
  +-- home / guide page: SiteScript (end of body)
  |      __USAGE_STATS__ && /[?&]utm_source=/ && lang ko && path is / or /guide/...
  |      -> import('./utm-land') (lazy, no runtime imports) -> stash + sampled? beacon land {t:home|guide, g?, us, uc}
  |
  later in the same tab (any tool, any page load, up to 3 h after `at`):
     track(start|success) -> payload gets us/uc from the stash
                                  |
/api/usage validate() -> blobs [..12 old.., us(blob13), uc(blob14)] -> Analytics Engine
                                  |
/admin/ usageTask + fetchCampaigns(SQL) -> shapeCampaigns -> "캠페인별 유입" table
growth.mjs (weekly)               -> same -> markdown table
```

## Decisions
1. **Payload: two new keys `us` (utm source) and `uc` (utm campaign), appended as blob13 / blob14.** `BLOB_KEYS` gets `'us','uc'` appended; the first 12 stay in place (all existing SQL keeps working; old rows read `''`). 14 of 20 AE blobs. Allowed only on events `land`, `start`, `success` (ONLY map). Reason: start/success attribution needs the values on those rows; nothing else needs them; the payload stays far under 512 B.
2. **Whitelist (server `scripts/lib/usage.mjs`, single source):** `UTM_SOURCES = ['naver_blog', 'tistory', 'play']`; anything else present becomes `'other'`. Campaign: lowercase, then `CAMPAIGN_RE = /^[a-z0-9-]{1,60}$/`; fails → `'other'`; absent/empty → `'none'`. utm_medium/content/term are never read (medium is implied by source). No utm_source → nothing is stashed or sent (a bare utm_campaign is ignored). Pure function `utmOf(search: string): { us, uc } | null` in usage.mjs. Labels: `UTM_SOURCE_LABELS = { naver_blog: '네이버 블로그', tistory: '티스토리', play: '문서딱 앱(안드로이드)', other: '기타' }`; campaign `none` → '(캠페인 없음)', `other` → '(목록 밖 이름)'.
3. **New event `land`** (appended to EVENTS). Required: `us`, `uc`. `t`: one of TOOLS **or** `LAND_PAGES = ['home', 'guide']`, the latter only for `land` (validate: the `t` check becomes `TOOLS.includes(t) || (e === 'land' && LAND_PAGES.includes(t))`). `g` (guide slug, GUIDE_RE) is allowed on land only when `t === 'guide'` and is optional (the /guide/ index has none). via = 'direct' for land. Reason: home/guide landings need a row; `t` stays the AE index; existing per-tool readers filter `TOOLS.includes(tool)`.
4. **shapeUsage must ignore `land`:** add `r.event === 'land'` to the skip at usage.mjs:465 (else a tool's land row lands in its funnel cell). Regression unit test.
5. **Who sends `land`:** tool pages → `tracker.start()` in src/lib/ui/usage.ts (runs before readUrl, F2). Home `/` and `/guide/…` → the SiteScript lazy chunk `src/lib/ui/utm-land.ts`. Every other page (privacy, terms, /en/, /embed/, 404) sends nothing. One owner per page kind, so no double count. Reason: tool pages must capture before the strip; home/guides have no tracker and must not pay for one.
6. **utm-land.ts imports nothing at runtime** (type imports only), following the guide-out.ts precedent: its own copies of USAGE_PATH, MAX_EVENTS, UTM_SOURCES, CAMPAIGN_RE, BUILD_RE, the weight and the device rule; a unit test keeps every copy equal to usage.mjs / usage.ts and checks its payload passes `validate()`. site.ts gets only: `if (__USAGE_STATS__ && /[?&]utm_source=/.test(location.search)) void import('./utm-land').then((m) => m.land(), () => undefined);` Reason: importing usage.ts/usage.mjs from a site-chunk dynamic import changes their importer set and can split the shared chunk (EN1 Decision 8: +1 file on tool pages, LCP +150 ms). Gate G3 proves it did not happen.
7. **Stash:** `sessionStorage['docttak:utm'] = JSON {s, c, at}` (this tab only; dies with the tab). Written on every utm landing (last link wins), regardless of sampling (a later page load may be sampled). Read at send time by `start`/`success` in createTracker's `send` (not at module load: the stash may be written later). Ignored and removed when older than 3 h, malformed, or failing the whitelist. `at` is never sent. Storage errors (private mode, quota) → silently no attribution. Never on lang other than ko, never on /embed/.
8. **Keep the URL as is; no extra replaceState.** Tool pages with quicklinks already strip (unchanged, G.5); home/guides keep utm in the address bar. Reason: stripping buys nothing for SEO (canonical/og:url are path-only, F1; share.ts `SAFE_QUERY` already refuses any other query, so a shared tool link never carries utm) and adds another ordering risk for GA4. GA4: utm arrives automatically (session source/medium/campaign in 획득 reports); no GA code change.
9. **Visits totals from a dimensionless node (fixes 2b).** visits.mjs: new alias `total: rumPageloadEventsAdaptiveGroups(limit: 1, filter: $filter) { count sum { visits } avg { sampleInterval } }` (shape verified 2026-10-08 in rum-probe-query.js). `shapeVisits.totals` = Σ total over chunks; the trend stays the chart only. The previous-period query becomes `total` only (QUERY_TREND → QUERY_PREV; prev was only ever summed). New `readTotal()` (readGroups requires `dimensions`). If the device sum differs from totals.visits by more than 10%, shaped flag `mismatch` → one muted line under the tables: "표마다 Cloudflare가 따로 세어(표본) 합이 방문 수와 다를 수 있어요." Numbers are never scaled (existing rule).
10. **Pages fallback (2a).** Add node `pagesByVisits` (requestPath, limit CHUNK_TOP, orderBy sum_visits_DESC). `shapeVisits.pages` uses `pages` when it has rows, else `pagesByVisits` (flag `pagesSource: 'count'|'visits'|'none'`). If both are empty while `totals.pageViews > 0`, the section shows "Cloudflare가 이 기간의 페이지 목록을 보내지 않았어요. 7일 보기에서 확인해 주세요." instead of "이 기간에는 기록이 없어요".
11. **Countries split (2c).** Replace node `countries` by `countriesKo` (filter `$filterKo` = base AND `{ requestPath_notlike: "/en/%" }`) and `countriesEn` (`$filterEn` = base AND `{ requestPath_like: "/en/%" }`), both limit CHUNK_TOP, orderBy sum_visits_DESC. Filters are built in `filterOf` from constants only (the query string stays constant; test). Admin: two sections "나라 (한국어 페이지)" and "나라 (영어 페이지 /en/)", with the note under the second: "영어판은 2026년 10월 13일에 열었어요." Fallback per Step 0. Same POST, so request count and rate limits are unchanged (1 day = 1 POST; 90 days = 13).
12. **Diagnostics.** readGroups also returns `maxSi`; shapeVisits returns `diag: [{ node, rows, maxSi }]`; admin renders it inside `<details><summary>집계 정보</summary>` (muted table: node | 행 | 표본 간격) at the end of the 방문 block. Reason: the next mismatch can be diagnosed from the page without a dashboard probe.
13. **Referrer labels (2d).** visits.mjs `REFERRER_LABELS = { 'com.docttak.app': '문서딱 앱(안드로이드)' }`, applied in shapeVisits referrers (case-insensitive key). Only our own package; other app package names stay raw (no invented mapping).
14. **Campaign table.** New module `scripts/lib/campaign.mjs`: `campaignSql(dataset, days)` = `SELECT blob13 AS src, blob14 AS camp, blob1 AS event, SUM(_sample_interval * double1) AS n FROM ${dataset} WHERE timestamp > NOW() - INTERVAL '${days}' DAY AND blob13 != '' AND (blob1 = 'land' OR blob1 = 'start' OR blob1 = 'success') GROUP BY blob13, blob14, blob1 ORDER BY n DESC LIMIT 500 FORMAT JSON` (DATASET_RE + PERIODS checked, like usageSql); `fetchCampaigns(api)` through `runSql` (export it from usage.mjs: one word); `shapeCampaigns(rows)` → rows `{ src, srcLabel, camp, campLabel, land, start, success }`, dropping src outside UTM_SOURCES+other and camp failing CAMPAIGN_RE (except none/other), sorted land desc then start desc; top 30. Admin: section "캠페인별 유입" (columns 들어온 곳 | 캠페인 | 방문 | 처리 시작 | 성공) after the guide-arrival table, every period; note "블로그 링크 주소에 붙은 표시(utm)로 센 값이에요. 같은 탭에서 3시간 안에 이어진 처리 시작·성공도 그 링크 몫으로 셉니다. 위 방문(Cloudflare)과는 세는 방법이 달라요." Empty → the existing EMPTY_SECTION. Admin Function: `fetchCampaigns` runs inside usageTask's Promise.all with its own `.catch(() => null)`; null → the section shows "캠페인 표를 불러오지 못했어요." (the rest of usage is unaffected).
15. **Weekly report:** growth.mjs adds a "캠페인별 유입 (7일)" markdown table (same shape, top 10) after the usage tables; a fetch failure is one note line (existing pattern). Cheap: one SQL call.
16. **stamp-signature → pdf-sign (3).** `sendToPdfSign` gains the event: after `storeSignPng` succeeds and before `go()`, `track({ e: 'next', t: 'stamp-signature', o: 'next', v: 'pdf-sign' })`. Counted only when the hand-off was really stored (a failed store shows HANDOFF_FAILED and counts nothing). sendBeacon survives the navigation. Optional `track` dep param for the unit test. No UI change.
17. **Failure detail codes (4): naming + whitelist only.** UX/messages and the call sites belong to brief B. **Contract aligned with brief B D1** (B wrote its detection rules first; A adopts them so there is one helper).
   - Module `src/lib/file/sniff-format.ts`: `export type FileFamily = 'pdf' | 'image' | 'hwp' | 'office-old' | 'hwpx' | 'docx' | 'xlsx' | 'pptx' | 'zip' | 'text' | 'hwp3' | 'hwpml' | 'other';` `export function sniffFormat(head: Uint8Array, tail?: Uint8Array): FileFamily` (pure, never throws; detection rules exactly as brief B D1: `%PDF-` in the first 1,024 B; images via the existing `sniffImage`; CFB gives `hwp`, the caller turns it into `office-old` after the worker said not-hwp; ZIP: `mimetype` = `application/hwp+zip` gives hwpx, else central-directory names from `tail` give docx/xlsx/pptx, else zip; text rule; HWP3; HWPML). Whoever builds first creates it; the other only adds members, never renames.
   - A adds to the same module the two code mappers (pure, type-only imports):
     `export function notHwpCode(f: FileFamily): string`: pdf → `not-hwp-pdf`; hwpx → `not-hwp-hwpx`; docx → `not-hwp-docx`; xlsx, pptx → `not-hwp-office`; office-old, hwp → `not-hwp-cfb` (old .doc/.xls/.ppt are CFB); zip → `not-hwp-zip`; image → `not-hwp-img`; text → `not-hwp-text`; hwp3, hwpml, other → `not-hwp-other`.
     `export function corruptCode(f: ImageFormat): string` (`ImageFormat` from src/lib/image/sniff.ts, which the id-photo path already runs): heic → `corrupt-heic`, jpeg → `corrupt-jpg`, png → `corrupt-png`, webp → `corrupt-webp`, anything else → `corrupt-other`.
     Every code is at most 24 chars and matches CODE_RE (unit test over every member of both unions).
   - usage.mjs `FAIL_LABELS` appends (this is the one FAIL_LABELS block B D12 refers to; A owns it, B does not add a second): not-hwp-pdf 'HWP 아님: PDF', not-hwp-hwpx 'HWP 아님: HWPX로 보이나 읽지 못함', not-hwp-docx 'HWP 아님: 워드(DOCX)', not-hwp-office 'HWP 아님: 엑셀·파워포인트', not-hwp-cfb 'HWP 아님: 옛 오피스 문서(DOC·XLS 등)', not-hwp-zip 'HWP 아님: ZIP 압축 파일', not-hwp-img 'HWP 아님: 사진', not-hwp-text 'HWP 아님: 글자 파일(TXT 등)', not-hwp-other 'HWP 아님: 알 수 없는 형식', corrupt-heic '손상된 사진: HEIC', corrupt-jpg '손상된 사진: JPG', corrupt-png '손상된 사진: PNG', corrupt-webp '손상된 사진: WebP', corrupt-other '손상된 사진: 기타 형식'. Old `not-hwp` / `corrupt` stay (old rows).
   - B wires the call sites (session.ts not-hwp, id-photo corrupt) with `notHwpCode` / `corruptCode`. To keep initial JS unchanged, the call sites load the module with `await import()` on the error path only (G3 checks it). The admin fails query keeps LIMIT 20 (finer codes are fine at current volume; Known Gap if they crowd others out).
18. **Privacy (/privacy/, src/data/legal.ts, usage-stats build only).** New `PRIVACY_UTM` = deploy date (re-confirm at the gate; placeholder '2026년 10월 14일'); `PRIVACY_REVISED` → `__USAGE_STATS__ ? PRIVACY_UTM : PRIVACY_CHAIN`; `PRIVACY_TERMS_UPDATED` → deploy date. The usage field list gains one item: "어느 링크로 들어왔는지: 블로그 등 링크 주소에 붙은 표시 중 정해진 이름(예: 네이버 블로그, 티스토리, 문서딱 앱)과 글 이름. 정해진 형식이 아니면 '기타'로만 셉니다." The on-device storage paragraph gains: "이 표시는 이 창을 닫으면 지워지는 저장 공간에 최대 3시간 기억해, 같은 창에서 이어서 쓴 도구에도 함께 셉니다." plus a change-history line. Plain-language check applies (no 업로드/서버/브라우저…; the word "utm" is not on the page). /en/privacy/ unchanged (EN pages send no usage, D5/D7).

## Exact file list
Edit: `scripts/lib/usage.mjs` (BLOB_KEYS/EVENTS append, UTM_SOURCES, LAND_PAGES, CAMPAIGN_RE, UTM_SOURCE_LABELS, utmOf, ONLY us/uc/g, validate land branch + t rule, shapeUsage land skip, export runSql, FAIL_LABELS append, header comment rows) · `src/lib/ui/usage.ts` (internal land type, stash write in start, us/uc on start/success, land send) · `src/lib/ui/site.ts` (1 guarded lazy import) · `src/lib/ui/sign-handoff.ts` (D16) · `scripts/lib/visits.mjs` (D9 to D13) · `scripts/lib/admin-view.mjs` (campaign section, split countries, pages message, mismatch line, diag details) · `functions/admin/[[path]].ts` (fetchCampaigns in usageTask) · `scripts/ops/growth.mjs` (D15) · `scripts/qa/admin-preview.mjs` (stub routes for the total/pagesByVisits/countriesKo/countriesEn nodes and the campaign SQL; scenarios campaigns, pages-empty-with-total, mismatch) · `src/data/legal.ts` + the privacy page component that lists usage fields (D18) · `docs/OPS-RUNBOOK.md` §8 (utm link format for the blog team, sources list, how to read the table) · `handoff/BUILD-LOG.md`.
New: `scripts/lib/campaign.mjs` · `src/lib/ui/utm-land.ts` · `src/lib/file/sniff-format.ts` (unless -B landed it) · the tests below.
Untouched: functions/api/usage.ts (uses validate/toDataPoint; verify only), the Base/BaseEn/Guide layouts, quicklinks.ts, deeplink.ts, GA code.

## Failure modes
| Path | Realistic failure | Handling | User sees |
|---|---|---|---|
| utm parse | `utm_campaign=한능검 사진`, uppercase, 200 chars | lowercase, regex, else 'other' | nothing (admin row '(목록 밖 이름)') |
| stash | sessionStorage throws (Safari private, quota) | try/catch, no attribution | nothing; land still sent |
| stash | an old tab comes back the next day | 3 h TTL, entry removed | nothing |
| land on tool | quicklinks strips before capture | start() runs first (F2); e2e T-E2 on id-photo locks the order | nothing |
| land on home/guide | lazy chunk fails to load (offline/SW) | `.then(m => m.land(), () => undefined)` | nothing; no console error |
| double land | tool page also runs SiteScript | site.ts path rule: only `/` and `/guide/` | nothing (unit + e2e: exactly 1 land) |
| server | a client sends us on `pick` | validate returns null (rejected as today) | nothing |
| AE | campaign SQL 4xx | fetchCampaigns catch, section notice | owner sees "캠페인 표를 불러오지 못했어요" |
| shapeUsage | a tool's land rows counted in its funnel | D4 skip + test | nothing |
| RUM `_like` unsupported | errors[] makes the whole 방문 block a notice | Step 0 decides; fallback D11 | owner sees the notice (not silent) until fixed |
| RUM pages empty | Cloudflare returns [] | D10 fallback node + honest message | explicit message, never "기록 없음" when total > 0 |
| totals vs tables | sampling | D9 + mismatch line + diag | explanation on page |
| sign hand-off | store fails | no event, HANDOFF_FAILED as today | existing alert |
| sniffFormat | 0-byte or 3-byte file | 'other' (never throws) | (B UX) |
| EN page with utm | would pollute KO stats | lang not ko: nothing | nothing |
No silent + untested gap remains.

## Test map
Unit (vitest):
- usage.test: [GAP, add] validate land: tool/home/guide t; g only with t=guide; us/uc required on land, allowed on start/success, rejected on pick/fail/next/out/arrive; us outside the list rejected; uc regex/'none'/'other'; t='home' rejected for start; BLOB_KEYS first 12 unchanged and length 14 (max 20); toDataPoint blob13/14; shapeUsage ignores land rows (tool and home); FAIL_LABELS has every code `notHwpCode`/`corruptCode` can return; utmOf table (missing source, unknown source, uppercase, Hangul, 61 chars, empty campaign, extra params, `+`/`%20`).
- usage tracker (existing usage client test file): [GAP] start() stashes even when not sampled; land sent only when sampled and utm present; start/success carry us/uc from the stash, pick/download/fail/next/out never; TTL expiry; malformed stash ignored; lang en: no stash, no send; /embed/: nothing.
- utm-land.test (new): parity of every copied constant with usage.mjs/usage.ts; payload passes validate(); home gives t home; /guide/x/ gives t guide g x; /guide/ has no g; /privacy/ nothing; no utm_source nothing; storage throw tolerated.
- campaign.test (new): SQL constant shape, dataset/period refusal, shapeCampaigns sort/drop/labels/top 30.
- deeplink.test: [GAP] `parse('id-photo', '?preset=history&utm_source=naver_blog&utm_medium=blog&utm_campaign=history-exam-photo')` gives history; the same for the pdf-compress target param.
- share.test: [GAP] shareUrl with `?preset=history&utm_source=x` gives the pathname only (utm never shared); `?preset=history` kept [TESTED].
- visits.test: [GAP] the total node drives totals (trend sum differs in the fixture); the prev query is total-only; pagesByVisits fallback + pagesSource; both empty with total > 0 flag; countriesKo/En parse; the query string holds no interpolated values (existing test extended to $filterKo/$filterEn); filterOf builds the like/notlike filters; REFERRER_LABELS; diag maxSi; mismatch threshold at the 10% boundary.
- admin-view.test: [GAP] campaign section rows/empty/error notice, XSS in src/camp; split country sections; pages honest message; mismatch line; diag details; no "방문자" string [TESTED, keep].
- sign-handoff.test: [GAP] next tracked once on success, not on store failure, before go().
- sniff-format.test: detection cases are B's tests/unit/file-sniff.test.ts if B creates the module (else A writes them per B D1); A adds: notHwpCode over every FileFamily and corruptCode over every ImageFormat match CODE_RE, at most 24 chars, and each has a FAIL_LABELS entry.
- growth test: [GAP] campaign markdown table + failure note.
- admin Function test (if present): a campaign failure leaves the usage tables intact.
E2E (no-upload fixture on every test; beacon POSTs only in the cloud specs):
- T-E1 site.spec (default build, 5 projects): `/id-photo/?preset=history&utm_source=naver_blog&utm_medium=blog&utm_campaign=history-exam-photo`, `/guide/history-exam-photo/?utm_source=tistory&utm_campaign=x`, `/?utm_source=play&utm_medium=twa`: canonical and og:url equal the clean `https://docttak.com` + path; id-photo shows the 한국사능력검정시험 preset selected.
- T-E2 usage.spec (cloud x5): (a) id-photo utm URL gives exactly one land {t:'id-photo', us:'naver_blog', uc:'history-exam-photo'}; a run gives start and success carrying us/uc; the address bar ends `?preset=history`. (b) guide utm landing (bad campaign) gives land {t:'guide', g, us:'tistory', uc:'other'}; following the guide's tool link gives a start carrying us/uc and no land on the tool page. (c) `/?utm_source=play&utm_medium=twa` gives land {t:'home', us:'play', uc:'none'}. (d) `utm_source=evil` gives us 'other'. (e) no utm: no land beacon. (f) /en/ with utm: no beacon. (g) stamp-signature: draw, PDF에 넣기, next {t:'stamp-signature', v:'pdf-sign'}, and /pdf-sign/ opens with the PNG. Every captured body passes validate() and is at most 512 B.
- Usage-off build: check-dist "no sendBeacon / no /api/usage" stays green (utm-land chunk empty or absent).
- Brief B owns the e2e for the detailed fail codes in its UX flows; A adds one cloud usage check only if the B wiring merged first (else a Known Gap handed to B).

## Gates (CLOUD-HANDOFF §3)
- G1 `npm run check` 0 errors; `npm test` all green; `npm run check:licenses`.
- G2 build with `PUBLIC_SITE_URL=https://docttak.com`; check-dist OK on default, cloud flag-on (BG_REMOVE, BG_CLOUD, officer, contact, USAGE=1, GA test id, AFF_COUPANG=1) and autoframe. Precache within 450 KB each (report before/after vs ee4950c).
- G3 **Chunk graph:** for every tool page, home and one guide, the initial JS file list (normalized hashes) is identical to ee4950c in default and cloud builds; home/guide initial gzip delta at most +150 B (site chunk only); the utm-land chunk is lazy-only. Fonts unchanged (core chars).
- G4 e2e with no-upload on 5 projects: site, usage (cloud), id-photo, stamp-signature, pdf-sign, chain, growth, en, polish (privacy text), sw; cloud ga.cloud + usage x5.
- G5 Lighthouse median of 5: `/`, `/id-photo/`, `/guide/history-exam-photo/`, thresholds unchanged; the CI runner is the source of truth.
- G6 `npm run qa:admin` screenshots: 1/7 days, campaigns, pages-empty, mismatch, split countries, diag (light + dark); qa:visual on /privacy/.
- G7 regress `--fixtures-only` (hwp, idphoto) unchanged.
- Richard "clear", then deploy. Post-deploy live (orchestrator, owner Chrome): /admin/?days=1 and 7: 방문 KPI close to the device sum (or the mismatch line shown), pages non-empty or the honest message, two country tables, the app label, 집계 정보 present; open a test utm link on phone + PC and see a land row within minutes (?days=1); stamp, PDF에 넣기 shows in 이어서 하기. If any RUM node errors, revert the visits.mjs commit only (build order step 6 is its own commit).

## Build order (separate commits, reversible)
1. sniff-format module + tests (skip if B landed it).
2. usage.mjs whitelist (us/uc/land, labels, FAIL_LABELS, land skip, export runSql) + tests. Server first, so it accepts the new keys before any client sends them.
3. usage.ts stash/land/attribution + utm-land.ts + site.ts hook + tests + e2e T-E2.
4. sign-handoff next event + tests.
5. campaign.mjs + admin Function + admin-view section + growth table + qa:admin.
6. visits.mjs D9 to D13 + admin-view sections (after Step 0) + qa:admin.
7. legal.ts / privacy + OPS-RUNBOOK §8 + T-E1.

## Out of scope (to BUILD-LOG Known Gaps if they surface)
- Tool UX for the not-hwp / corrupt messages and their call-site wiring (brief B).
- Bot heuristics beyond `bot: 0` (Step 0 numbers logged only); per-country page tables.
- EN-page UTM / usage (EN2); embed widget UTM.
- utm_medium/content/term, first-touch vs multi-touch models, per-visitor dedupe.
- Labels for other Android app referrers.
- Changing the GA4 setup; stripping utm on home/guides.
- Play Console listing actions (owner).

## Acceptance
- All gates green; Richard clear.
- A blog link with `?preset=history&utm_…` opens the 한능검 preset, the page's canonical/og:url are clean, and within minutes /admin/?days=1 shows a "캠페인별 유입" row 네이버 블로그 | history-exam-photo with 방문 at least 1, plus 처리 시작/성공 when the photo was made in the same tab.
- /admin/?days=1: the 방문 KPI comes from the total node; 많이 본 페이지 has rows or the explicit Cloudflare message; 나라 is split KO / EN; `com.docttak.app` shows as 문서딱 앱(안드로이드); 집계 정보 lists per-node rows and sample intervals.
- stamp-signature PDF에 넣기 produces next stamp-signature to pdf-sign.
- `sniffFormat`, `notHwpCode`, `corruptCode` are exported from src/lib/file/sniff-format.ts with the signatures above (sniffFormat per brief B D1); every code is labelled in FAIL_LABELS.
- /privacy/ (usage build) lists the link-marker field and the 3-hour tab storage; date updated.
