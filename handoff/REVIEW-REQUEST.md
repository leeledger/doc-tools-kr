# Review Request — ADMIN-VISITS round 2 (chunked windows, numbers as returned)
Date: 2026-10-08
Ready for Review: YES. Status **DONE** locally (not committed, not pushed). Brief: handoff/ARCHITECT-BRIEF-ADMIN-VISITS.md + the orchestrator's correction (2026-10-08 live probes): windows of 1/3/7 days answer from the fine tier (sampleInterval ~1); 14/31+ days switch to a coarse tier (sampleInterval 10) whose `count` / `sum{visits}` are **already extrapolated**, and hour groups there can return visits 0. Round 1's single request + count × sampleInterval was wrong and is removed. Round 1 Should Fix items from handoff/REVIEW-FEEDBACK.md are done.

## What changed since round 1
- scripts/lib/visits.mjs:1-260 (fetch layer rewritten)
  - `RUM_MAX_WINDOW_DAYS = 7` restored. `chunks(w)` (:86) splits a window into pieces of at most 7 days, oldest first, end to end: each piece ends 1 s before the next starts (datetime_leq is inclusive). 30 days → 2+7+7+7+7, 90 days → 13.
  - Two constant queries: `visitsQuery('full')` (trend + pages / referrers / countries / devices) for current-period pieces, `visitsQuery('trend')` (trend only) for previous-period pieces. Only `$accountTag` / `$filter` are variables; limits are literals (TREND_LIMIT 200 = 7×24+1 fits; CHUNK_TOP 50 rows per piece for the top tables; devices TOP_N).
  - `readGroups` (replaces estimateGroups): numbers **as returned**, never multiplied; `sampled` = some group's avg.sampleInterval > 1. `mergeRows` sums rows by key across pieces (the hour two pieces share is summed; no double count because the time ranges are disjoint).
  - `fetchVisits` (:217): one POST per piece; `pool` (:189) keeps at most MAX_IN_FLIGHT = 4 in flight, the first failure rejects and stops new starts; one shared `AbortSignal.timeout(8 s)` deadline for the whole call. Returns `{ cur, prev, estimated, approxTops, requests }`. `approxTops` = a top table of some piece came back full in a multi-piece period (the summed ranking may miss rows). `compare: false` skips the previous period (weekly report).
  - **Should Fix 1** (`post`, :160): a deadline hit while reading the body (`res.json()` rejecting with TimeoutError/AbortError, or the signal already aborted) is now `VisitsApiError(0, '시간 초과 (8초)')`, not "응답 형식이 올바르지 않음".
  - `shapeVisits` passes `estimated` / `approxTops` through.
- scripts/lib/admin-view.mjs:183-245
  - **Should Fix 2**: `ratioDelta` (:194) shows the ratio card's change in its own unit: "▲ +1.2회" / "▼ -0.5회" / "0회" (one decimal), sr "직전 7일보다 1.2회 늘었어요".
  - KPI labels are "방문" / "페이지뷰"; " (추정)" and the sentence "일부 숫자는 Cloudflare가 표본으로 세어 보정한 추정치예요." appear only when `estimated`.
  - With `approxTops`, a note under the tables: "7일씩 나눠 받은 순위를 더한 값이라 순위는 대략적이에요."
- scripts/ops/growth.mjs:84-90, :108 — `fetchVisits({ days: 7, compare: false })` = 1 request; line "- 방문 7일: N회, 페이지뷰 M (Web Analytics)" with ", 추정" only when sampled.
- tests/fixtures/rum-rows.mjs — answers are built per request from its filter window (`rumAnswer(body, { tops, si })`, `windowOf`, `trendRows(start, end, si)`; the same made-up value per UTC hour whichever piece asks); TOPS / XSS_TOPS / RUM_EMPTY / RUM_ERRORS. Still probe-shaped, all fake.
- scripts/qa/admin-preview.mjs — per-request fixture answers, prints the GraphQL request count per scenario; new scenario visits-sampled (30 days, sampleInterval 10 → "(추정)").
- tests/unit/visits.test.ts (31 tests) — removed the per-bucket multiply test (28.5 vs 25.5). Added: chunk boundaries (≤7 days, 1 s steps, exact cover, 2/7/7/7/7), request counts (1일 2, 7일 2 or 1 without compare, 30일 5 while its previous window is before RUM_START, 90일 13), peak in flight = 4, **no multiplication** (sampleInterval 10 → the same totals as 1, only `estimated` flips), merging (boundary hour = 2× one piece, '/' = 5×40 / 5×25 over 30 days), approxTops on/off, one failing piece (429) fails all, body-read timeout → 시간 초과, ratioDelta units and no "%" on the ratio card, "(추정)" only when sampled, 90-day Function = 13 full queries each ≤ 7 days.
- tests/unit/ops.test.ts — visits line from returned numbers, exactly one RUM request.

## Request count per page view (limit: 300 GraphQL queries / 5 min per user)
| Period | Current | Previous | Total |
|---|---|---|---|
| 1일 | 1 | 1 | 2 |
| 7일 | 1 | 1 | 2 |
| 30일 | 5 | 5 | 10 |
| 90일 | 13 | – (no comparison, as before) | 13 |

The previous window is skipped while it starts before RUM_START: 7일 sends 1 until 2026-10-21, 30일 sends 5 until 2026-12-06. Weekly report: 1. Worst case 13 per load, about 23 loads per 5 minutes before the limit.

## Unchanged from round 1 (cleared by Richard)
Function allSettled + notices, chart, guide titles (scripts/lib/guide-titles.json, outside src/ because of the UI font scanner), preset labels, auth / CSP / headers.

## Gates
- `npx vitest run`: 53 files, **1151/1151 passed**.
- `npx astro check`: 0 errors, 0 warnings, 1 hint.
- Default build: check-dist OK (2392 files), precache 416.8 / 450 KB. Cloud build (CI dist-bgcloud env): check-dist OK (2411 files), 422.6 / 450 KB. Both unchanged.
- `npx wrangler@4.147.0 pages functions build functions`: "Compiled Worker successfully".
- qa:admin: 12 scenarios, every 360 px page has scrollWidth 360 (light and dark). Printed request counts today: 7일 1, 90일 13, visits-sampled (30일) 5.
- No lint script in package.json.

## Screenshots (before / after; after re-taken for round 2)
- Before: C:/Users/force/AppData/Local/Temp/claude/C--dev-doc-tools-kr/c205501f-e2a7-4258-9052-12a611236632/scratchpad/admin-visits-shots/before/<scenario>-{desktop-light,phone-light,phone-dark}.png
- After: C:/Users/force/AppData/Local/Temp/claude/C--dev-doc-tools-kr/c205501f-e2a7-4258-9052-12a611236632/scratchpad/admin-visits-shots/after/<scenario>-{desktop-light,phone-light,phone-dark}.png (full-7, full-90, empty, error, xss, visits-7, visits-1, visits-90, visits-error, visits-empty, visits-sampled, usage-error-visits-ok)

## Open Questions
- Hour grain inside a ≤7-day window is assumed to be the fine tier (the orchestrator's probes used day groups; my original 1.3-day probe used hour groups and matched the dashboard). If a live 7-day page shows near-zero hourly visits, the trend dimension needs to change; the post-deploy check on 1/7/30/90 should compare against the dashboard.
- Still unverified live: AE_API_TOKEN read access to RUM, `avg { sampleInterval }` on dimension groups, limits 200 / 50.
- Per-piece top tables are capped at 50 rows; for 30/90 days a page ranked low in every piece can be missed (flagged with the approximate-ranking note whenever a piece hits the cap).

## Out of Scope (logged in BUILD-LOG)
- Nothing new.
