# Review Feedback — ADS1020 (애드센스 재신청 P0)
Date: 2026-10-20
Ready for Builder: NO (2 Must Fix, both small)

## Must Fix
- src/pages/privacy/index.astro (ADS_ON branch, 「거부 방법」 line) (confidence: 9/10) — new legal copy says 「브라우저 설정에서 쿠키를 막거나 광고 차단 기능을 쓰면 돼요.」. 브라우저 is on the banned list (docs/COPY.md:18 「법적 고지」 included; :25 maps 브라우저 → 「이 화면, 이 페이지, 지금 쓰는 앱」). The plain-language unit test does not catch it because it only runs on the ads-off dist (dist-bgcloud/privacy/index.html shows 3 hits: 2 from the GA section, 1 new). — Rephrase, e.g. 「쓰는 앱 설정에서 쿠키를 막거나 광고 차단 기능을 쓰면 돼요.」 Re-run the preloaded-font tripwire.
- handoff/BUILD-LOG.md (ADS1020 entry) and docs/OPS-RUNBOOK.md §11 (confidence: 9/10) — BUILD-LOG only records the escalation (「Escalated: … resource-summary:script:size is 229.6 KB … I did not apply the "drop /" fallback」); the resolution is not written anywhere. — Log the decision: the `resource-summary:script:size` budget (30 KB) stays unchanged and is enforced by Lighthouse CI on the ads-off build (what production ships until the owner sets PUBLIC_ADSENSE_ON); the ads-on build is held to perf/LCP/CLS/a11y/BP/SEO (all passed, numbers above); the overage is all Google script (adsbygoogle.js 57 KB + show_ads_impl 169 KB), the same precedent as GA's gtag.js; `/` stays in CONTENT_ROUTES because the breach is the same on every content route. Add one line to OPS-RUNBOOK §11 so whoever flips the flag knows Lighthouse on ads-on is not expected to pass script size.

## Should Fix
- tests/unit/postbuild.test.ts:947-962 (confidence: 8/10) — the plain-language test never sees the GA, ADS or cloud privacy sections (it runs on the ads-off, GA-off dist). The two existing 「브라우저」 in the GA section of /privacy/ shipped this way. — Run the same JARGON scan in check-dist over every built page, or add it to the cloud build; at minimum log the gap in BUILD-LOG and fix the GA lines with the ADS line.
- src/layouts/Hub.astro (confidence: 7/10) — hub guides keep the old dates line and the Organization author, so /guide/photo-sizes/ and the other hubs are the only guide articles without the byline. Bob says it is a 2-line change. — Apply the same 「글: {officer} · 소개」 byline and `author` to hubs.
- src/layouts/Base.astro:151-155 (confidence: 6/10) — with a contact set, the footer reads 「문의: email」 and then a 「문의」 link one line below. — Arch call; cheapest: label the foot-op line 「메일:」, or drop it when OPERATOR_ON (the /contact/ page has the mailto).
- tests/e2e/upload-guard.ts isAdsRequest (confidence: 5/10, verify) — only the frame's pathname is checked, not its origin, so an ad GET from any origin's `/` would pass. Test-only; add `page.origin === origin`.

## Escalate to Architect
- None beyond the orchestrator's settled answers. Preview probes still needed before production (not a blocker for this verdict). Run `curl -sI` on the Preview deploy built with `PUBLIC_ADSENSE_ON=1` and check:
  - `/`, `/guide/`, `/guide/passport-photo/`, `/about/`, `/contact/`: exactly one `content-security-policy` line, equal to CONTENT_CSP (contains `script-src 'self' https: 'unsafe-eval'` and `fenced-frame-src https:`).
  - `/pdf-merge/` and `/privacy/`: exactly one CSP, the `/*` site policy (no ` https:` scheme source; contains `'wasm-unsafe-eval'`). This proves `/` is an exact match, not a catch-all.
  - `/embed/id-photo/`: exactly one CSP, ending `frame-ancestors *`, plus `x-robots-tag: noindex`.
  - `/en/` and `/404-does-not-exist/` (any non-content 404): the site policy, one header.
  - `/ads-cfg.js`: 200, `cache-control: public, max-age=3600`, body = ADS_CFG_SOURCE.
  - Two CSP lines, or none, on any of these = stop.

## Cleared
Reviewed against the brief: Coupang off by constant (affOn, check-dist rule f over html/js/json/xml/txt whatever PUBLIC_AFF_COUPANG says; 0 link.coupang.com in dist and dist-bgcloud); tag pair only on /, /guide/**, /about/, /contact/ in <head> after GA (verified 0 on /pdf-merge/, /privacy/, /404.html, /en/, /embed/id-photo/); ads-cfg body and citations; content-CSP blocks appended after GA/CF and before COEP/host rules, `/*` unchanged; siteHeaders refactor pure and off-path unchanged; noindex + no canonical on /licenses/ and /embed/, both out of the sitemap; x-default = ko; about/contact copy plain, no Docttak, milestones match git (all 7 hashes and dates verified); about never says ADDR_SEND; privacy section matches D6/D7 apart from the 브라우저 word; no thresholds changed (only the /embed/ → /about/ URL swap, approved); CLAUDE.md untouched; no new off-device data path (only the bodiless GET of Google's script on content pages, stubbed in e2e).

---
# Round 2 — 2026-10-20
Ready for Builder: YES

## Must Fix
None.

## Verified
- Must 1: the AdSense line in src/pages/privacy/index.astro now reads 「쓰는 앱 설정에서 쿠키를 막거나 광고 차단 기능을 쓰면 돼요.」, and the GA lines 131 and 143 no longer say 브라우저 either. The plain-words scan over the rebuilt dist-bgcloud (90 pages) and dist (85 pages) finds 0 problems.
- Must 2: BUILD-LOG 「ADS1020 round 2」 (lines 3485-3491) records the decision: budget unchanged, enforced on the ads-off build, ads-on held to perf/LCP/CLS/a11y/BP/SEO, GA precedent, `/` kept. OPS-RUNBOOK §11:163 has the Lighthouse bullet. The monetize ticks are still items 1-5.
- Should: scripts/lib/plain-words.mjs runs in check-dist:206 on every page of every build, and the unit test shares JARGON/userText. Hub.astro has the same byline and Person author as Guide.astro. In the footer, `footerContact('')` gives `contactLine('')` = null, so the email line drops when OPERATOR_ON and a business number would still show. `isAdsRequest` now checks the page origin.

## Timing (the two unit time-outs)
- The new scan is not the cause. Timed directly with `plainWordProblems` over every built page: 11 ms for 90 pages (dist-bgcloud) and 9 ms for 85 pages (dist), against Bob's 11-16 s check-dist. That is under 0.1% of a run, about 0.1 s across the test's 8 runs. Bob's same-dist comparison with main (15 s, file-open bound) fits this.
- CI (Linux): the test comment assumes about 5 s per check-dist run, so 8 runs is about 40 s against the 120 s budget. ADS1020 adds a few ms per run plus the new adsense/operator rules, which work on HTML already in memory. CI should still pass. Confirm it on the first CI run and do not raise the budget.
- char-count 「100,000 chars < 50 ms」 (61 ms under load): this diff does not touch char-count. It is load flake on a busy Windows PC and passes alone. Not a finding.

## Should Fix (log only)
- BUILD-LOG Known Gaps: the postbuild usage test is at roughly 100-128 s of its 120 s budget on the owner's Windows PC (8 × 11-16 s). It was already like this on main. A later step should cut the work (one check-dist run with several env sets, or check the pure rules in units) rather than raise the time limit.

## Cleared
Round 2 fixes all of round 1's Must and Should items without new drift, and no threshold or time limit was raised. ADS1020 is clear. Preview `curl -sI` probes as listed in round 1 must still pass before production.
