# Review Feedback — CI fix after TOOLS4
Date: 2026-10-06
Ready for Builder: YES

## Must Fix
None.

## Should Fix
- astro.config.mjs:66 (confidence: 6/10) — `raster.ts` and `reorder.ts` (7.7 KB source, no imports, no top-level side effects, so no behaviour change) now ride in `ui-shared`, which every tool page loads (ui-shared is 7.1 KB gzip now). /hwp-to-pdf/, /hwp-viewer/, /id-photo/, /pdf-compress/ and the other tool pages that never used these modules each pay roughly 1 KB gzip more before first paint. That is the same mechanism you blame for the font-subset LCP regression, and you say those pages sit about 1,955–1,970 ms on CI. Local Lighthouse covered only /photo-compress/ and /pdf-merge/. Verify this: run 5 local Lighthouse runs on /pdf-compress/, /id-photo/ and /hwp-to-pdf/ before and after the change, then record the numbers in BUILD-LOG. If any page moves up a lantern step, use a narrower chunk (raster+reorder only for the pages that import them) instead. Budgets pass: every initial-JS page is under 30 KB, and the home page does not load ui-shared.

## Escalate to Architect
- /photo-compress/ LCP on the CI runner is still unresolved after the chunk fix. Bob's options (a) reword the 12 syllables, (b) narrow the gen-ui-font scope, (c) make the controller lazy are all product or scope choices. I agree no threshold should be lowered. I confirmed lighthouserc.json, scripts/check-dist.mjs, package.json and package-lock.json have no diff against HEAD.
- preload behaviour change: when the first real mouse move on a fresh page reports movement 0, it no longer counts, and the next move does. The user loses no signal in practice: any real mouse use sends many moves, and touchstart, pointerdown, keydown, scroll and focusin are untouched. An event with movementX undefined is not filtered (`undefined === 0` is false), so it still counts. Noted for the record; no action needed.

## Cleared
I reviewed the isRestingMove preload guard and its unit regression test, the two-step mouse moves in preload.spec, and the id-photo related-list test (it now compares `.related a` hrefs to live home cards minus /id-photo/, so a dropped or extra tool still fails it). I also reviewed the manualChunks addition, confirmed no thresholds changed, and confirmed node_modules restoration left package-lock untouched. All pass.
