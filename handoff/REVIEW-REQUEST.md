# Review Request — REV2 (revenue plan realignment + id-photo 인화·사진관 links)
Date: 2026-10-12
Ready for Review: YES
Status: DONE_WITH_CONCERNS (stamp-signature and HWP placements deferred because of precache headroom; see below)

## Round 2 (2026-10-12, base 87486a7) — Richard's REVIEW-FEEDBACK + Arch's CI item
**Must Fix (done)**
- scripts/lib/print-links-check.mjs:20-23,47,53-57,66: a link counts as sponsored when `rel` contains the whole word `sponsored`, anywhere in the value (`SPONSORED`). H(a) uses the same test on every anchor. Every `link.coupang.com` anchor must be sponsored ("is not rel=sponsored"), and it also gets all the H(b)/H(c) checks even without `sponsored`. It can no longer pass as an info link.
- tests/unit/postbuild.test.ts:562-580: new fixtures on PRINT_PAGE.
  - A Coupang link with `rel="noopener noreferrer"` and no 「광고」, placed before the disclosure, gets 4 errors.
  - `rel="noopener sponsored"` passes when placed correctly and fails (2 errors) when it comes before the disclosure.
  - The same rel on a guide page fails H(a).

**Should Fix (all done)**
- src/pages/id-photo/index.astro:191: the disclosure is a plain `<p>`, no longer `.hint`, so it has body colour and size. It is the first element of the affiliate group, before the links. The cloud e2e checks that its computed colour and font size equal the lead paragraph's.
- tests/e2e/id-photo.spec.ts:667-675 and usage.spec.ts:303-311, 350-356: each dropped request must be `GET` + exactly the link URL + no body. usage.spec now also asserts `external.length > 0` and waits for the popup to load. upload-guard is not widened.
- src/pages/privacy/index.astro:103,117 (+ postbuild.test.ts:713-714, usage.spec.ts:~370): the wording is now 「사진관·인화 관련 링크와 상품 링크를 눌렀는지(링크 종류만)」 and 「…관련 링크와 상품 링크 누름을 더함」. Every glyph is already in the core faces: core stays 607/608 and font bytes are unchanged from round 1.
- scripts/lib/print-links-check.mjs:78,86-87 + postbuild.test.ts:582-600: the no-embed check now also covers `<link>`, `<source>`, `<object>`, `<embed>` and inline `<script>` bodies, with one fixture per tag plus a negative case.
- src/lib/ui/usage.ts:16: restored the space in `UsagePhase = 'load'`.
- BUILD-LOG: flag-on headroom (1.3 KB) is logged. CI now builds flag-on (next item).

**Arch: CI cloud build with PUBLIC_AFF_COUPANG=1**
- .github/workflows/ci.yml:101-102,112: `PUBLIC_AFF_COUPANG: '1'` is in the dist-bgcloud build env, with a comment. The 450 KB precache gate in CI now measures the production-like build: 448.7 KB.
- tests/e2e/usage.spec.ts:313-358 (new, cloud projects only): the flag-on block. It checks the disclosure text first in the group at body style, the three link names, `rel="sponsored noopener"` and `_blank`. Clicking 포토프린터 opens a popup to the stubbed `link.coupang.com` URL and sends exactly one `out` with `v=cp-printer` and no URL in the body. This closes round 1's open question that no e2e ran on a flag-on build.

**Hancom placement:** not done (REV3).

**Round 2 gates**
- vitest 1,404/1,404 (run with PUBLIC_ID_PHOTO_AUTOFRAME=1, as before).
- astro check: 0 errors.
- Default build: check-dist OK, core 607, 400: 44,836 B / 800: 48,400 B (same as round 1), precache 441.4.
- Cloud flag-off: check-dist OK, 447.9 KB.
- Cloud flag-on (= the CI env now): check-dist OK, core 608, 400: 45,028 B / 800: 48,492 B, precache 448.7 / 450.
- AUTOFRAME=1 build: OK, 443.5.
- `<script` counts: default 129, cloud 195 (= HEAD). `sponsored` appears only in the flag-on build's id-photo/index.html.
- e2e id-photo + usage + ga.cloud on chromium, mobile-chrome, manual-chromium, cloud-chromium and cloud-mobile-chrome: 132 passed, 21 skipped, 0 failed.
- All cloud specs (remove-background.cloud, usage, ga.cloud) on the 5 cloud projects against the flag-on dist-bgcloud: 131 passed, 12 skipped, 2 flaky. The 2 flaky are remove-background.cloud on WebKit (closed page under load, passed on retry). The new Coupang test passed in all 5.

## Orchestrator-approved change to the brief (2026-10-12, mid-build)
- Disclosure confirmed verbatim from the Coupang Partners link page: `COUPANG_DISCLOSURE` unchanged.
- The per-URL env vars `PUBLIC_AFF_PRINT_URL` / `PUBLIC_AFF_COUPANG_URL` (and their URL validation) are **replaced** by the owner's real Coupang short links in `src/data/affiliate.ts` (label + placement per link), shown with ONE flag `PUBLIC_AFF_COUPANG=1`. The `print-service` link is gone.
- Link kinds (usage `out` values) are now `photo-studio | cp-printer | cp-paper | cp-backdrop`. OUT_DESTS lists only the rendered kinds; `cp-stamp` / `cp-hancom` stay in the data file but are not whitelisted until rendered.
- Placements: id-photo is rendered now. stamp-signature and the HWP pages are **not** rendered. The flag-on cloud build is at 448.7/450 KB precache. /stamp-signature/ and /hwp-to-pdf/ are precached pages, and each block adds about 0.55 KB of HTML plus a listener. That would bring the total to about 450 KB, so I did id-photo only and did not raise the limit (orchestrator rule). Option for Arch: put the Hancom link on /hwp-viewer/ and /hwpx-to-hwp/ only. Those pages are not precached, so they cost nothing there.
- Naver Map info link stays on by default.

## Files Changed
- src/data/affiliate.ts:1-51 (new): COUPANG_DISCLOSURE, AFF_COPY (generic ad text + per-placement line), AFF_LINKS (5 Coupang short links with placement), affOn(), affLinks(), AFF_DISCLOSURE.
- src/data/print-links.ts:1-41 (new): PRINT_COPY (lead, info label), PHOTO_STUDIO_URL, printLinks(env) (info link unless PUBLIC_PRINT_INFO=0, then the id-photo Coupang links when PUBLIC_AFF_COUPANG=1), printDisclosure().
- src/pages/id-photo/index.astro:12,18-22,181-200: the static `.print-links#idp-print-links` block right after `#idp-print` inside `#idp-done`. The affiliate group is disclosure → placement line → links.
- src/styles/app.css:476-481,486: `.print-links` layout (3 small rules) and `.print-links` added to the existing system-font rule (fontcover reads the exemption from this sheet).
- scripts/lib/ui-font-chars.mjs:25-30: named-constant exclusions PRINT_COPY / AFF_COPY / AFF_LINKS / COUPANG_DISCLOSURE.
- src/tools/id-photo/controller.ts:18,693-697: one delegated click listener → `track({ e:'out', t:'id-photo', o:'out', v })`.
- src/lib/ui/usage.ts:14-15,36-37,75: OutDest type, the `out` UsageEvent, and buildPayload copies o/v for out.
- scripts/lib/usage.mjs:9,16,44,81-90,142,180-183,197,208,252-253,345,409-413,422,479-487,500,531: EVENTS += out, OUT_KEY, OUT_DESTS, validate (out needs t=id-photo, o=out, v in OUT_DESTS; o=out on other events rejected), the `outs` query in the same Promise.all, OUT_LABELS, shapeUsage.outs + the 8th table, and the events loop skips out.
- scripts/lib/admin-view.mjs:164-166,332,342: OUT_NOTE and the `s-out` section after `s-chain-tools`.
- scripts/lib/print-links-check.mjs:1-83 (new) + scripts/check-dist.mjs:19,405-409: H(a) no sponsored link outside id-photo; H(b) the disclosure comes before every sponsored link inside `.print-links`, a link.coupang.com link also needs COUPANG_DISCLOSURE, and no info link comes after the disclosure; H(c) new tab + 「광고」. Also coupangProblems: Coupang links on /id-photo/ exactly when PUBLIC_AFF_COUPANG=1, on no other page, and never as a script, iframe or image.
- src/data/legal.ts:16-19,26-28 + src/pages/privacy/index.astro:5,103,117: privacy sentence, PRIVACY_OUT (stats builds only), change-log line, PRIVACY_REVISED = OUT in stats builds, PRIVACY_TERMS_UPDATED 2026-10-12.
- scripts/ops/monetize.mjs:18-25: M-3 checklist text (Decision 11).
- docs/REVENUE-MODEL.md (rewrite, sections 0-8), docs/OPS-RUNBOOK.md:114-128 (§10, flag-based flow + screenshot upload for final approval), docs/COPY.md:11 (disclosure wording exception).
- Tests: tests/unit/print-links.test.ts (new), usage.test.ts:967+ and snapshot/queries/table-count updates, admin-view.test.ts:211+ and file snapshot, ops.test.ts:369+, postbuild.test.ts:461, 524+, 708-728, ga.test.ts:292 (lastmod), fixtures/usage-rows.mjs (outs), e2e id-photo.spec.ts:635-676, usage.spec.ts:282-309 and privacy date, ga.cloud.spec.ts:14,95.

## Gates
- vitest: 1,402/1,403. The one failure was photo-engine "MozJPEG unable to fit…": a timing test that failed under the full-suite load and passed 41/41 when run alone (code not touched). Run with PUBLIC_ID_PHOTO_AUTOFRAME=1 because public/vendor holds MediaPipe from the last build; without it, ga.test's own build trips check-dist (environment, also seen in CHAIN-ADMIN).
- astro check: 0 errors.
- Default build (dist-noauto): check-dist OK. Core 605 → 607 characters (added: 눌, 렀, both from the privacy sentence 「눌렀는지」; the link block adds 0). Font bytes 400: 44,800 → 44,836 B; 800: 48,148 → 48,400 B; preloaded 91.1/92.66 KB. Precache 440.5 → 441.4 KB.
- Cloud build (CI env): check-dist OK. Core 606 → 608. Font 400: 44,880 → 45,028 B; 800: 48,244 → 48,492 B; preloaded 91.3 KB. Precache 446.8 → 447.9 KB / 450 (+1.1 KB, slightly above the brief's "< 1 KB" estimate).
- Cloud + PUBLIC_AFF_COUPANG=1: check-dist OK, precache 448.7 KB. The same dist checked with the flag off fails: "id-photo/index.html: a Coupang link while PUBLIC_AFF_COUPANG is off".
- AUTOFRAME=1 build: check-dist OK, precache 443.5.
- `<script` count: default 129 = HEAD, cloud 195 = HEAD, flag-on 195. `rel="sponsored`: only in the flag-on build's id-photo/index.html.
- e2e id-photo + polish + site on chromium, firefox, webkit, mobile-chrome, mobile-safari, manual-chromium and manual-firefox: 831 passed, 79 skipped, 8 flaky, 0 failed. The flaky ones failed first and passed on retry: Firefox goto timeouts and WebKit skia allocation crashes under load, none in REV2 tests. The new REV2 test passed in all 7 projects. axe on the done state (with the block) is green.
- e2e cloud usage + ga.cloud on the 5 cloud projects: 77 passed, 5 skipped, 3 flaky (WebKit skia crash or closed page, passed on retry). The new out-beacon test passed in all 5.
- check:licenses OK. check:quotes not run (network).
- Naver Map probe: `curl -sI https://map.naver.com/p/search/%EC%82%AC%EC%A7%84%EA%B4%80` → `HTTP/1.1 200 OK`.

Flag-on HTML (cloud + PUBLIC_AFF_COUPANG=1, id-photo):
```html
<div class="print-links" id="idp-print-links"><p>종이 사진이 필요하면 사진관에서 뽑을 수 있습니다.</p><ul><li><a href="https://map.naver.com/p/search/%EC%82%AC%EC%A7%84%EA%B4%80" rel="noopener noreferrer" target="_blank" data-out="photo-studio">가까운 사진관 찾기 (네이버 지도, 새 창)</a></li></ul><div class="print-links-ad"><p class="hint">광고: 아래 링크로 주문하면 문서딱이 수수료를 받을 수 있어요. 이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.</p><p>집에서 인화하려면</p><ul><li><a href="https://link.coupang.com/a/hM1VvrGKdg" rel="sponsored noopener" target="_blank" data-out="cp-printer">포토프린터 (쿠팡, 광고, 새 창)</a></li><li><a href="https://link.coupang.com/a/hM1W2wjBpA" rel="sponsored noopener" target="_blank" data-out="cp-paper">포토프린터 인화지 (쿠팡, 광고, 새 창)</a></li><li><a href="https://link.coupang.com/a/hM1XIN1hgO" rel="sponsored noopener" target="_blank" data-out="cp-backdrop">흰색 촬영 배경천 (쿠팡, 광고, 새 창)</a></li></ul></div></div>
```

## Open Questions
- The e2e popup tests drop the stubbed map.naver.com requests from the no-upload log after asserting they are bodiless GETs (id-photo.spec.ts:666-675, usage.spec.ts:303-308). Those requests are the user-opened tab's navigation, not data from the page. Please confirm that scoping is acceptable, rather than widening upload-guard.
- Copy: the lead line uses 합니다체 (「종이 사진이 필요하면 사진관에서 뽑을 수 있습니다.」). The disclosure keeps the brief's 해요체, recorded as an exception in COPY.md. The labels are generic, with no prices or model names.
- The id-photo listener ships in non-stats builds too (track is a no-op there), as the brief states. It costs a few bytes.
- No e2e clicks a Coupang link in a flag-on build (CI has no such build). Coverage there is check-dist on the flag-on dist plus the unit tests.

## Out of Scope (logged in BUILD-LOG)
- stamp-signature / HWP affiliate placements (precache), links on guide pages, W / R1 / R3 / sponsor, R1 numbers in report.mjs, CSP / _headers / CLAUDE.md (untouched).
