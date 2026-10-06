# Review Request — TOOLS4 T3 (/pdf-to-jpg/ PDF JPG 변환) + T2 carry-overs
Date: 2026-10-06
Ready for Review: YES. Status **DONE**. Not committed. Notes, decisions, sizes, gates: BUILD-LOG "TOOLS4 T3 build notes".

## Files Changed
New
- src/tools/pdf-to-jpg/scale.ts:1-32 — pure `pageScale(wPt, hPt, ppi, caps)`: ppi / 72, rounded; over a cap, scale = min(edge, sqrt(area)) and floor, `clamped` flag.
- src/tools/pdf-to-jpg/limits.ts:1-44 — PPI p96/p150/p300 (default p150); phone 50 MB / 100 pages (50 at 300 ppi) / 16,000,000 px / 4,096; PC 200 MB / 500 / 36,000,000 / 8,192; file and run-limit messages with the numbers.
- src/tools/pdf-to-jpg/output.ts:1-49 — `{base}_p001.jpg` (4 digits from 1,000 pages), `{base}_jpg.zip` via safeFileName; `JpegZip` = fflate streaming `Zip` + `ZipPassThrough` (stored), chunks kept as Blob parts.
- src/tools/pdf-to-jpg/controller.ts:1-499 — empty → opening → locked → ready → working → done. pdf.js via inspect.ts `openPdf` on pick; password form (wrong → message, field selected, retry; one attempt per submit); range via `parseRange` (empty = all; errors under the field); run cap checked before start; per page: getPage → pageScale → canvas white fill → render → toBlob jpeg 0.92 → zip or single → canvas zeroed + page.cleanup; cancel = runId++ and renderTask.cancel(); clamped pages listed "N쪽은 W×H픽셀로 줄여 저장했습니다." (5 shown, then a count).
- src/tools/pdf-to-jpg/entry.ts:1-48 — startUsage + controller on first interaction (the /jpg-to-pdf/ pattern).
- src/pages/pdf-to-jpg/index.astro:1-154 — hero, picker ("밖으로 전송되지 않습니다" only beside it and in FAQ 6), file card + password form, 변환할 쪽, 선명도 chips 작게/보통/선명 (약 N ppi), progress + 취소, result (내려받기, 쪽·선명도 바꿔 다시 변환, 다른 파일 처리하기, Share), howto, 알아 두면 좋아요 (A4 width computed), FAQ, related jpg-to-pdf / pdf-compress / photo-compress, QuickLinks.
- tests/unit/pdf-to-jpg.test.ts — pageScale exact A4 96/150/300, landscape, phone edge clamp (A3 at 300), area clamps, never-over-cap sweep; limits + messages; names; JpegZip round trip (unzipSync, stored); page copy, FAQ numbers, tool facts.
- tests/e2e/pdf-to-jpg.spec.ts — generated 3-page PDF (A4 / Letter / A4 landscape) → ZIP of 3 JPEGs (SOI, SOF size = round(pt/72×150) ±1, names); range "2" → one JPEG; 선명 → 2480×3508; /Rotate 90 page → landscape; encrypted fixture → prompt → wrong message → 1234 works; range "9" and "3-1" messages; non-PDF; cancel during a 40-page 300 ppi run; controller and pdf.js not loaded with the page.

Changed
- src/data/tools.ts:3-5, 27-46, 248-287 — PDF_JPG_FAQ (numbers from limits.ts and pageScale), tool entry after jpg-to-pdf (brief title and description, 6 FAQ).
- src/data/site.ts:15-62 — E-T2-a: `HOME_DESC_ORDER`; long form → short form → "{names in order, as many as fit} 등 N가지 도구. 가입 없이 무료."; T2's "{names}. 무료." form removed.
- src/lib/image/raster.ts:25-48 — `SCAN_ROWS` 256, pure `bandsHaveTransparency`, `canvasHasTransparency` (getImageData per band, stops at the first hit).
- src/lib/pdf/images.worker.ts:9, 59 — uses `canvasHasTransparency` instead of one full-image `getImageData`.
- scripts/lib/usage.mjs — TOOLS += pdf-to-jpg; `PPI_LEVELS`; SETTINGS.ppi; labels PDF JPG 변환 / 선명도 / 작게(약 96 ppi) / 보통(약 150 ppi) / 선명(약 300 ppi). src/lib/ui/usage.ts — types.
- scripts/check-dist.mjs:134-149 — /pdf-to-jpg/ controller lazy (exactly one chunk owns #pj-range-error, not initial, budget 14.5 KB = 12.1 + 20 %); no pdf.js or ZipPassThrough in its initial JS.
- scripts/gen-sw.mjs:39-43 — /pdf-to-jpg/ in NOT_PRECACHED (483.7 KB with it).
- src/data/og.json, src/data/guides.ts (NEXT_GUIDES pdf-to-jpg: photo-kb, pdf-compress, email-attachment-limit), src/data/tool-facts.ts (5 facts), scripts/lib/bgcloud.mjs LOCAL_SCOPE_RE, lighthouserc.json, scripts/qa/visual.mjs, CLAUDE.md line 3, docs/COPY.md (description rule), src/styles/app.css:331 (`.range-input`).
- tests: jpg-to-pdf.spec.ts:144-174 (cancel e2e, 40 photos with 줄이기), jpg-to-pdf.test.ts (band scan), polish.test.ts P.6 (HOME_DESC_ORDER rule), bgremove.test.ts, bgcloud.test.ts, postbuild.test.ts, usage.test.ts, site / polish / usage e2e lists.

## Gates (local, 2026-10-06)
- astro check 0 errors / 0 warnings. Unit 50 files, 1054 passed (auto-frame dist).
- Builds + check-dist: default → dist-noauto 2,385 files; cloud → dist-bgcloud 2,402; auto-frame → dist 2,390. Precache 441.7 / 448.1 / 444.1 KB of 450.
- e2e chromium + mobile-chrome: pdf-to-jpg + jpg-to-pdf 30 passed; site + polish + growth 215 passed / 5 skipped; usage.spec cloud-chromium + cloud-mobile-chrome 12 passed (incl. the new pdf-to-jpg events test).

## Open Questions
- Home description: default (9 tools) keeps every name (short form, 117 characters); cloud (10) = "여권·증명사진 규격 맞추기·…·HWP·HWPX 파일 보기 등 10가지 도구. 가입 없이 무료." (111). HOME_DESC_ORDER lists `pdf-password` before it exists; a unit test pins it as the only non-tool id, so T4 must update that test.
- Owner-restricted PDFs (no open password) convert without any note. Fine, or do you want one?
- JPEGs carry the canvas default JFIF density (no 150/300 ppi stamp). Logged as a gap.
- Cloud precache 448.1 / 450 KB: T4 should put its page in NOT_PRECACHED from the start.

## Out of Scope (logged in BUILD-LOG)
- Lighthouse and qa:visual not run locally (URL added; CI is the source of truth). firefox / webkit / mobile-safari not run locally.
