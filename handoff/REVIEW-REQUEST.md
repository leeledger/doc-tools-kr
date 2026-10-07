# Review Request — LCP round 2 (700 retired; on top of round 1's core/late split)
Date: 2026-10-07
Ready for Review: YES. Status **DONE** locally. All 23 lhci URLs pass. The CI checks job is the final word and has not run yet (not pushed). Not committed. Details: BUILD-LOG "LCP round 2" (round 1: "LCP fix after TOOLS4").

## Files Changed
Round 2:
- scripts/gen-ui-font.mjs:37-43 — UI_WEIGHTS = [400, 800], with a comment on why 700 is gone.
- src/styles/app.css (20 lines), src/styles/global.css (4), src/tools/hwp-viewer/viewer.css (2), src/tools/stamp-signature/stamp.css (2), src/tools/remove-background/bg.css (1) — `font-weight: 700` → `800`. Nothing else changed.
- scripts/check-dist.mjs:20-21 — UI_WEIGHTS {400, 800}.
- scripts/check-dist.mjs:308-331 — core exactly 2, late ≤ 2; tripwire 94,884 (no −2,048), comment cites 2909fe3 + JSON.
- scripts/check-dist.mjs:355-362 — CSS font-weight 700/bold fails with the reason (verified by injection).
- astro.config.mjs:63-64 — raster.ts / reorder.ts out of ui-shared (CI-fix move reverted), comment says why.
- scripts/gen-sw.mjs:78-79 — comment only (stale 700 note).
- tests/unit/postbuild.test.ts:371, 393-402 — 2 core + ≤ 2 late faces, no 700 file; the "core ≤ 600" assertion removed.
- tests/unit/postbuild.test.ts:452-466 — the /guide/ scoped `section h2` exemption applies on /guide/ only; tool-page h2s stay checked (reads dist/).
- tests/e2e/polish.spec.ts:334-368 — on / and /photo-compress/: no 700 request, no loaded 700 face, `.btn.primary` is 800, UA bold renders with the 800 face (ink 700 ≈ 800 within 2 %, ≥ 1.3× of 400).

Round 1 (unchanged since the last request): scripts/lib/ui-font-chars.mjs, scripts/lib/fontcover.mjs, the core/late split, the coverage check, and the late-face e2e tests.

## Measurements (local lhci, PUBLIC_BG_REMOVE=1, 5 runs, medians in ms)
| URL | HEAD | round 1 | round 2 |
|---|---|---|---|
| / | 1,974 | 1,848 | **1,659** |
| /photo-compress/ | 2,120 | 2,119 | **1,809** (max 1,816) |
| /pdf-merge/ | 1,971 | 1,974 | **1,813** |
| /pdf-compress/ | 1,975 | 1,969 | **1,809** |
| /id-photo/ | 1,975 | 1,975 | **1,808** |
Other tool pages 1,658–1,665, guides 1,659–1,665, /terms/ 1,657. CLS 0.000 and perf 0.99–1 on all 23 URLs; lhci exit 0.

Tripwire margins (94,884): dist-noauto 2,516 B, dist (AUTOFRAME=1) 2,112 B, dist-bg 2,468 B, dist-bgcloud 2,468 B.

## Screenshots for the owner (handoff/lcp-shots/)
`before-*` = with the 700 face (round 1), `after-*` = 800. Pages: home, photo-compress, pdf-merge, id-photo, stamp-signature, guide. Each has `-desktop` (1280), `-mobile` (360) and `-mobile-dark`. Example: handoff/lcp-shots/before-photo-compress-mobile.png vs handoff/lcp-shots/after-photo-compress-mobile.png. An overflow/wrap scan (buttons, tabs, chips, badges, status labels; horizontal scroll at 360 px) found nothing before or after, and the full-page heights are identical.

## Open Questions
- I took the screenshots with a one-off Playwright script, not the visual-qa skill. They cover the six pages and three modes the brief asked for, but there is no visual-qa health score. Run visual-qa at the deploy gate if you want one.
- The 36 PNGs are ~19 MB. Arch should decide whether they are committed or kept out (owner review only).
- WebKit: the existing "800 renders bolder than 400" test was flaky once (passed on retry); 3× repeat without retries gave 24/24.

## Out of Scope (logged in BUILD-LOG)
- The fallback 700 face (Playwright-derived subset) if the owner vetoes the heavier look: not built.
- WebKit pdf-merge flaky (existing Known Gap).
