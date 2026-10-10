# Review Request — STICKY-HEADER
Date: 2026-10-10
Ready for Review: YES
Status: DONE

CI run 38043135267 (after FOOTER-BLOGS, ce07a21): mobile-chrome pdf-split.spec.ts:251 axe target-size. After
`#ps-list.scrollIntoView({block:'start'})` the sticky site header covered the first row (「1쪽 빼기」 44×14.7 px visible).
Root cause: nothing reserved the sticky header's height for scrolling; only four result panels had a hard-coded
`scroll-margin-top: 76px`, so any other scrollIntoView, focus scroll or in-page anchor ended under the header.

## Files Changed
- src/styles/global.css:12-15 — `--top-h: 60px` (header height) and `--top-clear: calc(var(--top-h) + 16px)` (= the old 76 px: header + 1 px border + 15 px air).
- src/styles/global.css:35-37 — `html { scroll-padding-top: var(--top-clear) }` with the reason; anchors, focus scrolls and scrollIntoView all clear the header on every Base page (only Base has the sticky header; /admin/ has its own layout).
- src/styles/global.css:68 — `.top-inner` height now `var(--top-h)`, so header and padding can't drift.
- src/styles/app.css:38 — header menu sheet max-height uses `var(--top-clear)` instead of 76 px.
- src/styles/app.css (old 295-296, 333, 401) — removed `scroll-margin-top: 76px` from #cmp-result/#cmp-kept/#merge-result/#idp-headline, .ph-done-bar and .idp-done: margin adds to padding (would have been 152 px); the html padding gives the same 76 px.
- src/pages/guide/index.astro:76 — removed `section h2 { scroll-margin-top: 16px }` for the same reason (it used to put topic headings 45 px under the header).
- src/tools/id-photo/controller.ts:659, src/tools/pdf-compress/controller.ts:725 — comments only (scroll-margin → html scroll-padding-top).
- tests/e2e/polish.spec.ts (end) — new tests: home 「도구 둘러보기」 → #tools, home #faq (hash), /guide/ topic chip → #topic-2 each settle 0–16 px under the header (or at page bottom). They fail without the fix (target top = header top, gap ≈ -61 px). The existing scroll-padding-bottom rule is unchanged; pdf-split axe test not touched.

## Verification
- Default build (and the AUTOFRAME=1 build) check-dist OK; preloaded fonts unchanged 90.8 KB.
- pdf-split + pdf-sign + polish + growth, mobile-chrome --repeat-each=3: 258 passed, 0 flaky, 0 failed.
- Same four specs, chromium + webkit + mobile-safari once: 256 passed, 2 flaky (passed on retry): chromium pdf-split:271 pointer drag (one slot off) — pre-existing: at HEAD without this change it failed 1/16 too; mobile-safari polish:503 merge-list inspection timeout ("2쪽" not yet shown), unrelated to scrolling.
- Extra (panels that lost scroll-margin): pdf-compress, photo-compress, image-to-jpg, jpg-to-pdf, site on mobile-chrome 126/126; id-photo on mobile-chrome + chromium (AUTOFRAME=1 build) 68 passed, 1 flaky (adjust test, then 6/6 on repeat).

## Open Questions
- 16 px of air kept (same as the old 76 px panels). A smaller value (e.g. 8 px) would show more content but changes where result panels land.

## Out of Scope (logged in BUILD-LOG)
- pdf-split.spec.ts:271 pointer-drag flake on chromium (~1/16 at HEAD).
