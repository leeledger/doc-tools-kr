# Review Request — SEARCH1031 (사이트 찾기, 유사어 허용)
Date: 2026-10-31
Ready for Review: YES
Status: DONE (one environment note below; nothing escalated)

## Files Changed
- src/lib/search/normalize.ts:1-24 — NFKC + lower case + punctuation to spaces; maps the conjoining jamo NFKC makes of typed ㄱ-ㅎ back to compatibility jamo.
- src/lib/search/hangul.ts:1-72 — toJamo, choseong, isChoseongQuery, bounded OSA distance (early exit per row), fuzzyBudget (0 < 6 jamo, 1 for 6-11, 2 from 12).
- src/lib/search/synonyms.ts:1-78 — ALIASES (`word: true` = fold only at a word start), CONCEPTS (flag tools behind `__BG_REMOVE__` / `__ADDR_EN__`), POPULAR, STOPWORDS, PARTICLES.
- src/lib/search/match.ts:1-270 — tokenize (stopwords, particle strip keeping both forms, whole-query token), prepare (cached per index × table), D8 scoring, fuzzy only for tokens with no hit anywhere, coverage filter, sort covered → score → breadth → POPULAR order → name; search(index, query, table = CONCEPTS).
- src/lib/search/build.ts:1-21 — toolEntry / guideEntry / searchIndex, shared by the endpoint and the golden test.
- src/pages/search-index.json.ts:1-14 — /search-index.json from LIVE_TOOLS + publishedGuides + hubs.
- src/lib/search/ui.ts:1-223 — the combobox module (lazy): index fetch once (retry on next focus), render groups 도구/안내/많이 찾는 도구, keys, live count, none + fail lines, /search/ fragment sync on the page box only.
- src/lib/ui/search-boot.ts:1-67 + src/lib/ui/site.ts:1-12 — the boot in the shared site script: module script via `?worker&url` on first focusin/pointerdown in [data-search] (or at once on /search/); header link → disclosure button.
- src/components/SiteSearch.astro:1-45 — markup; header variant is a `<div role="search">` (no form), page variant a GET form to /search/; input has no name.
- src/layouts/Base.astro:13, 143-149 — header 「찾기」 item + overlay panel.
- src/pages/index.astro:4, 45-46 — hero box after .lead. src/pages/404.astro:3, 34-35 — box above the links.
- src/pages/search/index.astro:1-30 — /search/ (noindex, H1, box, every live tool, 안내 모두 보기).
- src/styles/app.css:56-105 — panel, box, popup, options, ≤ 380 px nav tightening; :550-553 — `.site-search, .search-page` joined to the one system-font rule. src/styles/global.css:74, 78 — `.ssh-toggle` shares the nav item rules.
- scripts/lib/ui-font-chars.mjs:64-67 — SYSTEM_FONT_PATHS += SiteSearch.astro, lib/search/, pages/search/.
- scripts/lib/en-check.mjs:112-113 — id parity ignores the Korean header search panel (D13).
- scripts/check-dist.mjs:1231-1290 — the SEARCH1031 block (index shape/budgets/pages/flags, module budget/lazy/no beacon/flag naming/not precached, /search/ noindex/no ads/no sponsored/form, not in sitemap/llms/rss, no markup on /en/ and /embed/, 찾기 link in every Korean header, no named input, box on home and 404).
- tests/unit/search-match.test.ts:1-195 — golden table (38 top-1 + top-k cases + 「pdf」 tie case), negatives (사진 ≠ 사직서, asdfgh, ㅁㄴㅇㄹㅁㄴㅇㄹ, empty, 300 chars < 50 ms, flag-off skip, popular skip), helpers, slug validity, flag-off table.
- tests/unit/network-guard.test.ts:25-29, 67-73 — lib/search/ui.ts allowlisted + pin test (one fetch of the fixed INDEX_URL, no beacon/XHR/method).
- tests/e2e/search.spec.ts:1-260 — lazy load, home 「사진 작게」 + Enter, header keys/Esc/focus, menu interplay + outside click, tap opens, /search/ fragment (never ?q=), no result, 404, index abort + retry, module abort, 320/360 px, axe light/dark ×3 pages, no-JS.
- tests/e2e/search.cloud.spec.ts:1-36 + playwright.config.ts:34 — cloud project: fragment and typed queries reach no GA/usage/other request.
- docs/OPS-RUNBOOK.md:195-204 — §13 how to add a synonym.
- handoff/BUILD-LOG.md — SEARCH1031 (build) entry.

## Gate results
- npm test (checks build, ci.yml first build env): 2456 passed / 2461; the 5 failures are timeouts or timing thresholds under this machine's load (another sprint testing in parallel): char-count 100k < 50 ms (130 ms), ga.test + postbuild check-dist subprocess tests at 60/120 s. Rerun alone: char-count and ga.test pass, postbuild plain-language passes; postbuild 「usage statistics (brief USAGE)」 (3 check-dist runs, 120 s) times out the same on main 54a080e in the same session (measured side by side), so not a regression. search-match 60/60 and network-guard 12/12 also in the worktree.
- Builds + check-dist OK: default (precache 397.3 → 408.8 KB), production-flag / ci dist-bgcloud env (407.7 → 419.2 KB), PUBLIC_ID_PHOTO_AUTOFRAME=1 (410.9 KB), checks env (414.5 KB); cap 450 untouched. Index 22.0 KB raw / 6.1 KB gzip (prod 23.2 / 6.4); search module 5.3 KB gzip; shared site script 1.5 → 1.8 KB gzip. gen-ui-font core/late 615/82 default and 616/82 production-flag = main; preload tripwire 92.1 / 92.66 KB.
- e2e (E2E_PORT=4373): search.spec 57/57 on chromium, webkit, mobile-chrome; site.spec chromium 121/121 and webkit + mobile-chrome green except one pre-existing webkit flake (site.spec:26 /pdf-compress/ axe waits 15 s for 「1쪽」; flakes the same on main 54a080e: 1 flaky of 3 with --repeat-each=3); hubs, en, embed, preload, sw, affiliate, polish chromium green; cloud-chromium search.cloud + ga.cloud + ads.cloud + usage 52 passed, 1 flaky (usage.spec:534 embed widget, passed on retry, no search on /embed/).
- npm run check: 0 errors, 0 warnings, 12 hints (as main). It caught `set(panel.hidden)` (string | boolean in the DOM lib) → `panel.hidden === true`, as menu.ts; rebuilt and search.spec re-run 57/57 on the three projects after it.

## Screenshots (360 px)
- C:\Users\force\AppData\Local\Temp\claude\C--dev-doc-tools-kr\9d6bbb7a-d5e8-43a5-a67d-a6f70a5f50a0\scratchpad\search1031-shots\header-panel-light.png
- C:\Users\force\AppData\Local\Temp\claude\C--dev-doc-tools-kr\9d6bbb7a-d5e8-43a5-a67d-a6f70a5f50a0\scratchpad\search1031-shots\header-panel-dark.png
- C:\Users\force\AppData\Local\Temp\claude\C--dev-doc-tools-kr\9d6bbb7a-d5e8-43a5-a67d-a6f70a5f50a0\scratchpad\search1031-shots\home-box-light.png
- C:\Users\force\AppData\Local\Temp\claude\C--dev-doc-tools-kr\9d6bbb7a-d5e8-43a5-a67d-a6f70a5f50a0\scratchpad\search1031-shots\home-box-dark.png
- C:\Users\force\AppData\Local\Temp\claude\C--dev-doc-tools-kr\9d6bbb7a-d5e8-43a5-a67d-a6f70a5f50a0\scratchpad\search1031-shots\home-results-light.png
- C:\Users\force\AppData\Local\Temp\claude\C--dev-doc-tools-kr\9d6bbb7a-d5e8-43a5-a67d-a6f70a5f50a0\scratchpad\search1031-shots\home-results-dark.png
(Taken on the final default build: 「pdf」 lists PDF 합치기, PDF 용량 줄이기 first; guides whose slug is a popular tool get the same tie-break.)

## Open Questions
- D8 tie-breaks: I added breadth then the 많이 찾는 도구 order before the name (logged). Without them 「pdf」 dropped PDF 합치기 from the six and 「hwpx」 put HWP 보기 above HWPX HWP 변환. Please confirm this is within D8's intent.
- D4 boot listens to focusin + pointerdown, not keydown (a key in a box always follows its focusin; a capture keydown listener broke polish.spec's drag-listener count).
- Header variant without `<form>` (check-dist forbids a form on /qr-code/ and /business-card/; the header panel only exists with JS anyway).
- At 360 px the home box sits below a long .lead (the live-tools sentence), so results open below the fold until the phone scrolls the focused field up. Brief placement kept; a shorter .lead is a copy decision for Arch.

## Out of Scope (logged in BUILD-LOG)
- English search on /en/ (D13), guide body text in the index, any search analytics, indexable /search/.
- Environment: the main checkout's node_modules is empty, so astro build/check fail inside wt/ worktrees (Vite resolves the main tsconfig); all builds ran from a mirror outside C:\dev\doc-tools-kr. `npm ci` in C:\dev\doc-tools-kr fixes it (refused to me by the permission guard).
- Pre-existing webkit flake site.spec:26 (/pdf-compress/ axe, 15 s page-count wait under load).
