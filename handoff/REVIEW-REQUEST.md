# Review Request — INTERNAL-TRAFFIC round 2 (automation sends no analytics; live checks honest)
Date: 2026-10-10
Ready for Review: YES
Status: DONE

## Round 1 (unchanged, for context)
- scripts/lib/no-analytics.mjs:1-35 (new) — `isAnalyticsUrl` + `blockAnalytics(context)`: Playwright route abort for static.cloudflareinsights.com, cloudflareinsights.com, www.googletagmanager.com, google-analytics.com and *.google-analytics.com, *.analytics.google.com, and `/api/usage` on any origin.
- tests/e2e/no-upload.ts — fixture option `noAnalytics` (blocks before recording; `withoutBlockedAnalytics` drops the aborted requests from the guard). tests/live/tools.spec.ts:9,15-17,23 — ignores Chromium's `ERR_BLOCKED_BY_CLIENT` console line only for analytics URLs. scripts/qa/visual.mjs:12,99-106,156-157 — blocks in its single `newContext`.
- tests/unit/no-analytics.test.ts — URL matrix, fake context, grep checks (every browser launcher blocks or is LOCAL_ONLY, live wiring, workflows, fetch checks import no browser/jsdom).

## Round 2 — Files Changed
- .github/workflows/ops-post-deploy.yml:29-30,45,48,55 — the three `| tee` steps (wait, smoke:assets, live smoke) start with `set -o pipefail;` so a failed check fails the job; comment explains why.
- scripts/lib/csp-connect.mjs:1-28 (new) — `connectSrcOf(csp)`, `DESIGNED_CONNECT_SRC` and `isDesignedConnectSrc(csp)`. The allowed values are computed by running the real generators (`withAnalyticsCsp` from analytics.mjs, `withGaCsp` from ga.mjs, in gen-headers order) on a minimal policy: `'self'` / `+ cloudflareinsights` / `+ GA hosts` / `+ GA + cloudflareinsights`. Exact string match after whitespace collapse; any other host, order or wildcard fails.
- tests/e2e/upload-guard.ts:3,64-69,87 — `uploadProblems(..., designedCsp = false)`: with it, a response passes the CSP check when its connect-src is a designed one. Default behaviour unchanged (e2e projects still need `'self'` or the GA variant).
- tests/e2e/no-upload.ts:24-25,55-57,65 — fixture option `liveCsp` passed through `expectNoUpload` to the guard. playwright.live.config.ts:4-7,23-24 — `liveCsp: true` next to `noAnalytics: true`.
- scripts/smoke-assets.mjs:7-14,38,46-54,76-84,107,126-130 — (a) the CSP check uses `isDesignedConnectSrc` (message now "HTML without a designed CSP connect-src …"); (b) `toUrl` follows same-origin references only — off-site refs (the Cloudflare beacon) are no longer rewritten onto our host; (c) og:image (canonical host, may differ from the deploy under test) moved to `ogImageRefs` and is still checked on the deploy via `onDeploy`, as before.
- tests/unit/postbuild.test.ts:15-16,275-304 — smoke-assets with the production CSP (both analytics on) and a beacon `<script>`: no failures, beacon never fetched, every request on the deploy, og.png still checked; one page with an extra host fails, exactly that page. Fails on the old code (beacon rewritten → 404, CSP).
- tests/unit/no-analytics.test.ts:60-100 and grep additions — designed values equal the generator outputs; the production header from curl passes; 7 off-design values fail; guard passes the live CSP only with `designedCsp`; live config has `liveCsp: true`, the e2e config has neither option; every `| tee` line in workflows has `set -o pipefail;`.
- docs/OPS-RUNBOOK.md:11,102-113 — A-1 row describes the designed-CSP check and analytics blocking; §9 notes pipefail and what run 38020029020 really failed on.

## Run 38020029020 (2026-10-10 03:17Z, reported success) — classification
- `--log-failed` returns nothing because the job was green; read from `--log`.
- smoke:assets, 55 problems: 54 × "HTML without the CSP connect-src 'self'" (every page + the 404 page; the CSP was the designed analytics+GA one) and 1 × `https://docttak.com/beacon.min.js HTTP 404` (the off-site beacon src rewritten onto our host). All 55 were check bugs; none real.
- Live smoke, 5 failed × 2 attempts: all 10 failures are the single error "network activity that could carry file data", raised in fixture teardown after the test body had finished (merge, compress, photo 200 KB, passport, HWP→PDF all completed their downloads and assertions). Contents: `POST /api/usage` + request bodies (40), CF beacon/rum (10 each), gtag.js and GA collect (10 each), and "no CSP connect-src 'self'" on every same-origin response. No console error, page error, timeout or result assertion failed. Verdict for each of the 5: analytics requests + CSP mismatch, nothing real.

## Production check (read-only, analytics blocked)
- `npm run smoke:assets -- https://docttak.com`: `OK — 2472 URLs (manifest gen 48)`.
- `npx playwright test -c playwright.live.config.ts` (LIVE_URL default https://docttak.com): 5 passed on first attempt, 15.1 s. No production breakage found.

## Verification
- `npx vitest run`: 62 files, 1332 tests passed. `npm run check`: 0 errors. YAML of ops-post-deploy.yml parsed (yaml package), the three run lines carry pipefail.

## Open Questions
- With pipefail, the next push's A-1 will be the first honest run. Production passed both checks locally just now, so it should go green; if it goes red it is a real signal.
- The guard accepts any of the four designed variants on live (not only "both on"), so turning one analytics product off does not break A-1. Say if you want live pinned to the exact current variant.

## Out of Scope (logged in BUILD-LOG)
- The user-level visual-qa skill (outside the repo) can drive the live site without `blockAnalytics`.
- ops health (scripts/ops/lib/html.mjs) has its own beacon allowance (OWN_BEACON); untouched, not part of this check.
