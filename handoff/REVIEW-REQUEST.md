# Review Request — CHAIN X2 (remaining senders) + X1 CI fix
Date: 2026-10-11
Ready for Review: YES
Status: DONE

## X1 CI fix (coordinator interrupt; CI run 38068648525, mobile-chrome, pdf-sign.spec.ts:387)
- Symptom: `#sg-range` bottom 775.3 > `#sg-actions` top 771 (+1). It reproduced locally on mobile-chrome 3 of 3 times, also with the **pre-X1** src (3e63d08 src rebuilt: same 775.3), so X1's code did not cause it.
- Root cause, from a diagnostic: choosing 쪽 범위 focuses the field. That focus scroll runs with the site's `scroll-behavior: smooth`.
  - Right after the click: scrollY 715, field bottom 826 (under the bar).
  - 1 s later: scrollY 1110, field bottom 431, bar top 520. The field ends clear of the bar.
  - The test read the box while the page was still scrolling. The product already meets WCAG 2.4.11 once the scroll ends; X1 only changed the timing on CI.
- Fix: tests/e2e/pdf-sign.spec.ts:396-399. `await settled(page)` (the spec's own helper) before measuring. The assertion is unchanged.
- Verified: that test × 4 on mobile-chrome + chromium: 8/8. pdf-sign.spec + chain.spec × 3 repeats on mobile-chrome + chromium: 159 passed, 9 skipped, 0 failed.
- Not done: `gh run download` of the CI artifact (the local repro was deterministic).

## Files Changed (X2)
- src/lib/ui/handoff-marker.ts:76-84 — `sweepIfDue()`: when the site flag is set, lazy-load handoff.ts and run `sweepLingering()`. With no flag, nothing loads.
- src/lib/ui/next-steps.ts:66-71, 78-90, 102, 132-133 — `NextMaker`: a result made on click (사진 배경 지우기 encodes the chosen background then). The buttons show before the file exists. The click makes the file once. null, a throw or more than 200 MB → the existing store-failed alert, buttons enabled again.
- src/lib/ui/next-steps-lazy.ts (new) — `showNextStepsLater`, for the two controllers that have no budget room for next-steps.ts. A real function, not a re-export: a dynamic import of the shared next-steps chunk made Rollup put its `__export` helper in the HWP export chunk. check-dist then counted 350 KB into every page using next-steps.
- Senders: each .astro gets an empty `<div id="<prefix>-next" class="next-steps" role="group" aria-labelledby="<prefix>-next-label" hidden>` after the download row (no text). Each controller hides the slot outside done and shows it at done:
  - pdf-merge: src/pages/pdf-merge/index.astro:76; controller.ts:14-15, 120, 200, 647, 734 (`sweepIfDue` at init).
  - pdf-split: index.astro:124; controller.ts:18, 161, 239, 817-818. Only when `!many && (edit | extract)`. One range in 범위대로 나누기 is one PDF, but it is not offered (brief decision 5).
  - pdf-sign: index.astro:138; controller.ts:20, 202-203, 281, 867. **Slot id `sg-chain`**: `sg-next` is already the 다음 쪽 button.
  - pdf-password: index.astro:107; controller.ts:79-84, 138, 407-417. Only an unlock result loads next-steps (via next-steps-lazy). A lock result offers nothing. Guard: still `done` with the same blob URL. This keeps the controller inside its 6 KB budget (5.5).
  - hwp-to-pdf: index.astro:66 (after the hw-done notice); hwp-shared/session.ts:23, 141-142, 242, 537. The slot is looked up only when `hooks.tool === 'hwp-to-pdf'` (the viewer has no slot and offers nothing). It covers the viewer-first (raster fallback) export too, which is the same `exportDocument`. hwp-to-pdf/controller.ts:4, 9 `sweepIfDue`.
  - image-to-jpg: index.astro:82; controller.ts:17, 198, 253, 543-544. Only for `out && count === 1`. entry.ts:7, 49-50 `sweepIfDue`.
  - photo-compress: index.astro:79; controller.ts:17, 122, 152-153, 266-283. `updateNext()` at the end of every setState: offered while done holds exactly one downloadable photo (result, or a kept original; the opposite of the ZIP rule). Rebuilt only when that row changes, so add/remove in done stays correct.
  - remove-background: page.astro:144; bg.ts:134-139, 196, 441-455. `NextMaker` = the existing encode(1) ?? encode(0.5) with the current 배경/형식 choice and `fileName()`. Loaded via next-steps-lazy, because the bg controller budget is 14.5 KB (static import was 15.3; now 14.3). entry.ts:9, 56-57 `sweepIfDue`.
  - id-photo: index.astro:172; controller.ts:23, 138, 168, 629-630, 661 (the main photo Blob). entry.ts:9, 54-55 `sweepIfDue`.
- Privacy sentence: unchanged. It is now true on every page that uses 이어서 하기. The flag check runs on all 6 receivers (X1) and on the 5 sender-only pages above (pdf-merge, hwp-to-pdf, image-to-jpg, remove-background, id-photo). pdf-split, pdf-sign, pdf-password and photo-compress already ran it as receivers.
- Tests:
  - tests/unit/next-steps.test.ts:111-145 — NextMaker: offered without making; made once and stored; null, throw and over 200 MB all go to the alert with nothing stored.
  - tests/unit/handoff-sweep.test.ts (new) — `sweepIfDue`: no flag → handoff.ts not loaded; flag → one sweep.
  - tests/e2e/chain.spec.ts:235-436, 9 tests:
    - pdf-merge → pdf-password.
    - pdf-split: ranges → no group; extract → pdf-sign; then the signed result → pdf-compress, with axe on the pdf-sign result.
    - pdf-password: lock → no group; unlock → pdf-compress, with axe.
    - hwp-to-pdf (law05.hwp) → pdf-compress.
    - image-to-jpg: 2 photos → no group; 1 photo → photo-compress.
    - photo-compress → jpg-to-pdf.
    - id-photo → jpg-to-pdf.
    - The sweep on the 4 new default-build sender pages.
    - Each arrival checks the notice, the file name and an empty store. Where the receiver is unsupported (Playwright WebKit on Windows), the test asserts the record was dropped.
  - tests/e2e/remove-background.cloud.spec.ts:398-460 — sweep on /remove-background/, then cut-out → 사진 PDF 변환. Arrival is checked, then the PDF is made and rendered with pdf.js: red subject present, 0 dark pixels (transparent shows as paper, never black). Axe on the result with the group.

## Correction to the brief (for Arch)
- The brief says remove-background alpha "flattens to white in raster.ts". That is true for photo-compress. jpg-to-pdf instead keeps the alpha (`embedPng` with an SMask, images.worker.ts:58-60), so the PDF page shows white paper there. The e2e asserts what a reader sees: no black.

## Gates
- vitest 1,381/1,381 (65 files); astro check 0 errors.
- Default build check-dist OK:
  - Core font 605/38, unchanged.
  - Precache 440.5 KB / 450 (X1 438.5).
  - No budget changed. pdf-password lazy 5.5/6, pdf-split 18.9/20.8, pdf-sign 16.7/18.4, image-to-jpg 19.7/22, jpg-to-pdf 12.2/13.1.
  - Initial JS: pdf-merge 17.5, photo-compress 22.4, id-photo 12.4, image-to-jpg 8.9, hwp-to-pdf 8.0, pdf-sign 9.7.
- Cloud build check-dist OK: core 606 (same as HEAD's cloud build, checked); precache 446.8 KB / 450 (X1 443.9); remove-background controller 14.3/14.5.
- e2e chain + polish + site × chromium, mobile-chrome, firefox, webkit, mobile-safari: 690 passed, 32 skipped, 3 Firefox flaky (polish 목표 용량 miss, site /licenses/ SEO and site 360 px /pdf-password/: goto timeouts), 0 failed.
- Cloud build: remove-background.cloud + usage specs × 5 cloud projects: 103 passed, 12 skipped. The CHAIN test skips on WebKit Windows only after asserting the record was dropped.
- Regression on the sender tools' own specs × chromium + mobile-chrome:
  - pdf-merge, pdf-split, pdf-password, image-to-jpg, photo-compress, hwp-to-pdf, jpg-to-pdf: green.
  - id-photo + chain on the AUTOFRAME=1 build (as CI builds dist/): 99 passed, 9 skipped. A first id-photo run failed 20 because my dist had been built without AUTOFRAME=1 (environment, not code).
  - The AUTOFRAME=1 build passes check-dist with precache 442.7 KB.
- Not run: Lighthouse, qa:visual, licenses.

## Open Questions
- Cloud precache is 446.8 / 450: little room for the next step.
- remove-background hands over whatever 배경/형식 is chosen when the button is pressed (default 투명 → PNG). Is that OK, or should it always be white JPG?
- photo-compress offers a kept original (already small enough) too, as the only downloadable photo. OK?

## Out of Scope (logged in BUILD-LOG)
- hwp-viewer PDF, pdf-to-jpg, multi-file (brief).
- next-steps-lazy exists because of the two budgets. Raising them would allow static imports (Arch call).
