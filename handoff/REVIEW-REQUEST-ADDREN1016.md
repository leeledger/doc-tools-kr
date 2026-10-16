# Review Request — ADDREN1016 A1 + A2 (영문주소 변환기, /english-address/)
Date: 2026-10-16
Ready for Review: YES
Status: DONE (A1, A2). A3 (live key probe) and A4 (guide) not started, as instructed.
Branch: addr-en-1016 (not pushed), rebased onto main f3e423b. Commits: a999b9e (A1), 139d28b (A2 prep, refactor only), ec0c39b (A2), then the acting-Arch round (see the last section).

## Files Changed
A1
- functions/api/addr-en.ts:1-217 — Pages Function: flag → key → method/origin/size/type gates, capped body read (512 B), validateQuery, per-isolate limiter (20/60 s, 5,000 keys), upstream POST form with a 5 s timeout, mapUpstream (d9 codes, whitelist ≤ 10 items, ≤ 200 chars), no-store/noindex headers on every answer.
- scripts/lib/addren.mjs:1-38 — addrEnFlag / addrEnOn / API_PATH / ADDR_EN_PATH / privacyGate (mirrors bgcloud.mjs).
- astro.config.mjs — `__ADDR_EN__` define, joined privacy gate; (A2) injectRoute for /english-address/ only when on.
- src/tools/english-address/split.ts:1-59, detail.ts:1-35, messages.ts:1-38 — d10 split, on-device 상세주소 conversion, d13 messages + d17 fail codes.
- scripts/lib/usage.mjs, src/lib/ui/usage.ts — tool, labels, fail codes no-result / query / busy, setting `field` on download.
- scripts/check-dist.mjs:497-511 — JUSO_EN_KEY name/value and juso.go.kr/addrlink never in dist; flag-off traces.
- CLAUDE.md — d16 sentences.
- tests/unit/addren-split.test.ts, addren-function.test.ts, addren-flag.test.ts; usage.test.ts, bgcloud.test.ts (privacy-grep list).

A2
- src/tools/english-address/query.ts:1-24 — text rules shared by page and Function (prep commit, no behaviour change).
- src/tools/english-address/page.astro:1-92 — the page (CORE_PATHS); english-address.css inline.
- src/tools/english-address/entry.ts:1-51 — lazy controller (tool focus/press/submit, else first signal + idle); a submit before load is kept.
- src/tools/english-address/controller.ts:1-249 — search, cards, 더 보기, split card, copy, usage events.
- src/tools/english-address/search.ts:1-56 — the only fetch (POST JSON {q,page}); copy.ts:1-48 — clipboard → execCommand → select.
- src/data/tools.ts:184-226, 991 — ADDR_EN_TOOL and its gated place; site.ts HOME_DESC_ORDER; og.json; scripts/gen-brand.mjs FLAGGED_IMAGES.
- src/pages/privacy/index.astro:20-27, 45, 73-98, 137-146 — #addr section, numbering, officer when cloud or addr, change log; src/data/legal.ts PRIVACY_ADDR / REVISED / PRIVACY_TERMS_UPDATED.
- src/pages/terms/index.astro — 2항 sentence, 6항 `<p id="addr">`, change log.
- scripts/check-dist.mjs:512-551 — A2 on/off assertions, controller budget 4.5 KB.
- scripts/gen-sw.mjs, src/sw/sw.ts, lighthouserc.json, scripts/qa/visual.mjs, playwright.config.ts (CLOUD_SPEC), .github/workflows/ci.yml (checks + cloud builds get PUBLIC_ADDR_EN=1).
- tests/e2e/english-address.cloud.spec.ts:1-306 — 25 tests on the 5 cloud projects; tests/e2e/ga.cloud.spec.ts + usage.spec.ts privacy assertions follow #addr.
- tests/unit/postbuild.test.ts (builtLive / buildEnv + on/off test), polish.test.ts, network-guard.test.ts, addren-search.test.ts; docs/COPY.md.

## Gates (details in BUILD-LOG "ADDREN1016 A1" / "A2")
- astro check 0 / 0; vitest 87 files / 1,886 passed (default build and the CI checks build).
- check-dist OK: default (no page, no /api/addr-en, no tool name; precache 424.4 KB), AUTOFRAME=1 (426.6), cloud + ADDR (437.0), checks build (432.1). Core UI faces byte-identical to main.
- check:licenses OK (no new dependency); check:quotes --exact 248 verbatim.
- e2e: english-address.cloud 125/125 on 5 projects (Firefox goto timeouts under 8 workers only); usage + ga.cloud on 5 projects green; site + polish chromium (default) 152 passed / 1 skipped.
- LHCI /english-address/ (checks build, median of 5): all categories 1, LCP 1,678 ms, CLS 0.

## Open Questions
1. Default build is not byte-identical to main: the late UI font faces gain 8 glyphs (controller copy under src/tools is scanned whatever the flags, as for remove-background), so build.css, every HTML, deploy-manifest and sw.js change hashes; sw.js also names '/english-address/' (RUNTIME_PAGES per d20; sw.ts is transpiled without defines). No page, route, JS chunk or visible string changes. Acceptable, or should the font scan skip src/tools/english-address when the flag is off?
2. d17 lists fail codes no-result / query / busy / engine / timeout only. I send `engine` for upstream / off / unknown answers too, and nothing when offline. Should upstream get its own code (`upstream`, 「주소 검색 서비스 오류」) so /admin/ can tell a key problem from a juso outage?
3. To record the copied field, the usage whitelist now accepts o/v on `download` (any tool), and the admin settings query counts `blob1 IN ('start','download')`. OK?
4. Split rule for 시+구 cities (flag b): if A3 shows sggNm like "Bundang-gu Seongnam-si" while roadAddr has ", Bundang-gu, Seongnam-si,", the d10 suffix and the whole-part search both miss and the card falls back to the one-line copy first. Unit test pins that today; A3 decides.
5. site.spec / polish.spec lists are not extended: an ADDR build always has the contact line in the footer (gate), which polish's footer test forbids, and CI runs them on the flag-off dist. Equivalent page checks run in english-address.cloud.spec on 5 projects. OK, or should the lists gain a flag-aware branch?
6. Deviations from the brief's copy: the privacy-line link text is 「개인정보 처리방침」, not 「자세히」 (LHCI SEO link-text audit 0.92); the core-glyph rephrasings are listed in BUILD-LOG A2 (2).
7. detail.ts drops symbols other than Latin / digits / `-` / `,` / space (`#1203` → `1203`) instead of asking for manual input. OK?

## Out of Scope (logged in BUILD-LOG)
- A3 live probe (needs O1-O3), A4 guide, English twin, Fallback B — untouched.

## Acting-Arch round (2026-10-16) — Ready for Review: YES
Decisions applied (BUILD-LOG "ADDREN1016 acting-Arch round"):
- Q3: no general widening. scripts/lib/usage.mjs DOWNLOAD_SETTING += `'english-address': 'field'`, SETTINGS.field = ADDR_FIELDS, SETTING_VALUE_LABELS.field; src/lib/ui/usage.ts sends o/v for that pair only. tests/unit/usage.test.ts: registered pairs only.
- Q1: late +8 glyphs accepted. src/sw/sw.ts RUNTIME_PAGES + `__RUNTIME_EXTRA__`; scripts/gen-sw.mjs flaggedRuntimePages(env) and buildServiceWorker(dist, env); scripts/check-dist.mjs builds the same sw.js and asserts /english-address/ appears exactly when the flag is on.
- Q2: src/tools/english-address/messages.ts failCode: engine (key) / upstream (juso down, HTTP error, timeout) / unknown (rest); FAIL_LABELS.upstream; e2e asserts each answer's fail code.
- Q6: e2e shows the stripped symbol case (「#1203호」 → line 2 「1203-ho」 and the one-line address) before copying.
- Q4 → A3; Q5, Q7 agreed.

Please look at:
1. The sw.js mechanism (header const from gen-sw, mirrored in check-dist) — acceptable, or would you rather drop /english-address/ from RUNTIME_PAGES altogether (it cannot search offline anyway, like /remove-background/)?
2. Timeout folded into `upstream` per the decision text; the Function still answers 504 `timeout`, so a split later needs only messages.ts.
3. The pre-existing 8-spawn postbuild test (111 s alone on the checks build here) is close to its 120 s limit on Windows; not touched.

## Round 2 (2026-10-16, after REVIEW-ADDREN1016.md CLEAR) — Ready for Review: YES
Rebased onto main 222cfb2. BUILD-LOG "ADDREN1016 round 2" has the details and gates.
- functions/api/addr-en.ts createLimiter — expired windows dropped on every call (+ unit case).
- src/pages/privacy/index.astro — section 1 heading and the meta / og descriptions correct for every flag combination; #addr rewritten per the acting-Arch legal decision (처리 위탁, address text only, IP about 1 minute, link to https://www.juso.go.kr/Privacy). scripts/check-dist.mjs asserts the heading / descriptions.
- src/tools/english-address/controller.ts — 더 보기 appends (focus to the first new card, picked mark and split card kept); download counted only on a real copy. english-address.css focus ring on cards. e2e: keyboard 더 보기 test; no download beacon on the manual fallback; privacy wording.
- src/sw/sw.ts comment; handoff/CLOUD-HANDOFF.md O4 checklist (PRIVACY_ADDR = real flag-on day).
Please look at:
1. The limiter prune runs on the next request in the same isolate; an idle isolate keeps an entry until eviction. The policy says 「1분 정도만 잠시 기억해 두고」. Accurate enough?
2. The cloud/addr meta description change also affects a production build with 배경 지우기 cloud on (the old 「개인정보를 받지 않아요」 was inaccurate there too).
