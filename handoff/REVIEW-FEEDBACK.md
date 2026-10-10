# Review Feedback — INTERNAL-TRAFFIC (rounds 1–2) + REVENUE-MODEL doc edit
Date: 2026-10-10
Ready for Builder: YES

## Must Fix
None.

## Should Fix
- scripts/lib/no-analytics.mjs:20 (confidence: 5/10, verify this) — `return u.pathname === USAGE_PATH;` is the only path rule that applies on any origin. A same-origin `/cdn-cgi/rum` (the endpoint Cloudflare uses when the zone itself injects RUM) and `https://www.google.com/g/collect` (allowed by GA_CONNECT_SRC `https://*.google.com`) are not matched. Today this leaks nothing, because the only senders (beacon.min.js on static.cloudflareinsights.com, gtag.js on www.googletagmanager.com) are blocked before they can run. Recommendation: for defence in depth, also match `/cdn-cgi/rum` on any origin and `/g/collect` on `*.google.com`, and add both to the block matrix in tests/unit/no-analytics.test.ts. Under 5 minutes.
- docs/REVENUE-MODEL.md, "수익화 시점 검증" → 단계 (confidence: 8/10) — "2027-01~03 증명사진 결과 화면 맥락형 제휴 시험(R2)" contradicts the R2 trigger in the §1 table: "R1 승인 이후, 월 5만 PV 이상". The doc's own base scenario (1,400 PV, +40%/month) reaches about 5,000–11,000 PV/month by Jan–Mar 2027. The R1 date is optimistic too: "2026-12~2027-01 애드센스 신청" needs about 100 real visits a day, but about 30/day at +40% only gets there around Feb 2027 (late Dec only in the +60% case). The "(R1 충족 시)" qualifier covers R1 but not R2. Recommendation: label R2 as an early trial outside the table trigger, or move it to "R1 승인 + 월 5만 PV" (base case about Aug–Sep 2027). Everything else checks out: 190+51+22+4=267; (267−146)/4 days ≈ 30/day; 372/267 ≈ 1.39 PV per visit → about 1,400 PV/month; ₩100k = 25k–50k PV and ₩300k = 75k–150k PV at RPM 2,000–4,000; 18–107× rounds to "20~100배"; each scenario's dates match compound growth.

## Escalate to Architect
None. (The four designed CSP variants are accepted on live, as the orchestrator decided.)

## Cleared
Reviewed:
- **Analytics blocking:** blockAnalytics/isAnalyticsUrl cover the CF beacon, cloudflareinsights.com/cdn-cgi/rum, gtag, *.google-analytics.com, *.analytics.google.com and /api/usage on any origin (sendBeacon goes to the exact USAGE_PATH, src/lib/ui/usage.ts:143).
- **Grep test:** it is meaningful. LAUNCHES finds every launcher under scripts/ and tests/. LOCAL_ONLY files are barred from --url, LIVE_URL and docttak goto. visual.mjs has exactly one context factory, which blocks. The live config sets noAnalytics and liveCsp; playwright.config.ts sets neither.
- **CI e2e:** keeps the strict SELF_ONLY / SELF_AND_GA check (designedCsp defaults to false).
- **csp-connect:** derives the four values from withAnalyticsCsp/withGaCsp (no hard-coded hosts), uses an exact match, and rejects extra hosts, reordering and wildcards.
- **smoke:assets:** same-origin only. dist has no absolute asset refs other than og:image (now onDeploy) and rel=canonical, which is not crawled, so no coverage is lost.
- **pipefail:** correct for all three tee steps. The default `bash -e {0}` lacks pipefail, and no defaults/shell override exists. The failure() step reports skipped outcomes correctly.
- **Tests:** no-analytics and postbuild pass (97 tests).
