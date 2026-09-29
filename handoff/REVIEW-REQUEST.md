# Review Request — Step 2 (PDF 용량 줄이기 `/pdf-compress/`)
Date: 2026-09-29
Ready for Review: YES
Status: DONE (round 1b: Arch's decisions on the three blockers applied; all gates green, regress:compress 122/122)

## Gates (actual numbers)
| Gate | Result |
|---|---|
| 1 `npm run check` (astro check) | 0 errors, 0 warnings, 0 hints (74 files) |
| 1 `npm test` (Vitest, Node) | 7 files, **92/92 passed** (35 before Step 2; rerun after round 1b) |
| 2/3/5 `npx playwright test` (5 projects, no-upload fixture on every test) | **225 passed, 10 skipped, 0 flaky** (final run). The run before had 224 passed + 1 flaky (Firefox `goto` load-event race on `/`, the known Step 1 harness issue; passed on retry). |
| 7 axe | 0 serious/critical on `/`, `/pdf-merge/` (empty + listing), `/pdf-compress/` (empty, ready with "더 줄여야 하나요?" open, done), `/privacy/`, `/licenses/`, 404 — all 5 projects |
| 8 Lighthouse (lhci, mobile, 3 runs, median) | `/`, `/pdf-merge/`, `/pdf-compress/`: Perf 100, A11y 100, BP 100, SEO 100; LCP 1.56 / 1.71 / 1.71 s; CLS 0 / 0 / 0; script transfer 0 / 7.5 / 8.0 KB. All assertions pass. (Local run needs `CHROME_PATH`, Playwright's chromium-1243.) |
| 9 `check:licenses` | OK — 23 production packages (adds `@neslinesli93/qpdf-wasm` ISC, `@jsquash/jpeg` Apache-2.0, `@jsquash/resize` Apache-2.0; none has npm dependencies) |
| 10 `check-dist` | OK — 310 files, largest `vendor/qpdf/12.2.0-w0.3.0/qpdf.wasm` 1.27 MiB, no maps; budgets below |
| 4 `regress:merge` | Unchanged before/after Step 0 and at the end (only ms differ); tables below |
| 4 `regress:compress` | **122/122 pass** (after the raster re-baseline; round 1 was 121/122) |
| 11 Manual (real Chrome/Firefox/Edge, a phone) | Richard's. I checked the built page in headless Chromium at 1280 px and 360 px (ready, details open, done): layout and glyphs render in the UI font subset (470 characters, regenerated at build). |

### Bundle budgets (gzip -9, `scripts/check-dist.mjs`)
| Asset | Actual | Budget |
|---|---|---|
| Initial JS `/pdf-compress/` | 6.4 KB | 30 KB |
| Initial JS `/pdf-merge/` | 5.8 KB | 30 KB |
| `compress.worker*.js` | 255.9 KB | 330 KB |
| `vendor/qpdf/*/qpdf.wasm` | 439.1 KB | 480 KB |
| MozJPEG enc + dec wasm | 120.8 KB | 140 KB |
| resize wasm | 16.7 KB | 30 KB |
`/` has no module script. The gate fails the build with the file names and size on a breach, and also when a budgeted file is missing.

### regress:merge (Step 0.2 extraction of `scripts/regress/lib.mjs`)
Before (HEAD):
| Scenario | Result | Pages | Text eq (sampled) | SSIM min non-scan | Fields | Bookmarks | Links correct | ms | MB in → out |
|---|---|---|---|---|---|---|---|---|---|
| S1_mixed_office | PASS | 100/100 | 19/19 | 1 (scan 1) | 199/199 ✓fill | 79 | 18/18 (wrong 0, dropped 0) | 2109 | 2.8 → 2.62 |
| S2_same_form_twice | PASS | 12/12 | 12/12 | 1 (scan 1) | 46/46 ✓fill | 2 | 0/0 (wrong 0, dropped 0) | 369 | 0.27 → 0.11 |
| S3_subset_with_links | PASS | 13/13 | 12/12 | 1 (scan 1) | 0/0 | 7 | 3/15 (wrong 0, dropped 12) | 1189 | 2.37 → 1.28 |
| S4_user_password | PASS | 3/3 | 3/3 | 1 (scan 1) | 0/0 | 2 | 0/0 (wrong 0, dropped 0) | 60 | 0.21 → 0.2 |
| S5_damaged_input | PASS | 8/8 | 8/8 | 1 (scan 1) | 0/0 | 2 | 0/0 (wrong 0, dropped 0) | 51 | 0.2 → 0.18 |

After (end of Step 2):
| Scenario | Result | Pages | Text eq (sampled) | SSIM min non-scan | Fields | Bookmarks | Links correct | ms | MB in → out |
|---|---|---|---|---|---|---|---|---|---|
| S1_mixed_office | PASS | 100/100 | 19/19 | 1 (scan 1) | 199/199 ✓fill | 79 | 18/18 (wrong 0, dropped 0) | 2245 | 2.8 → 2.62 |
| S2_same_form_twice | PASS | 12/12 | 12/12 | 1 (scan 1) | 46/46 ✓fill | 2 | 0/0 (wrong 0, dropped 0) | 358 | 0.27 → 0.11 |
| S3_subset_with_links | PASS | 13/13 | 12/12 | 1 (scan 1) | 0/0 | 7 | 3/15 (wrong 0, dropped 12) | 1203 | 2.37 → 1.28 |
| S4_user_password | PASS | 3/3 | 3/3 | 1 (scan 1) | 0/0 | 2 | 0/0 (wrong 0, dropped 0) | 55 | 0.21 → 0.2 |
| S5_damaged_input | PASS | 8/8 | 8/8 | 1 (scan 1) | 0/0 | 2 | 0/0 (wrong 0, dropped 0) | 58 | 0.2 → 0.18 |

## Files Changed
Step 0 (behaviour-neutral refactors and Richard's two Step 1 items)
- src/lib/ui/format.ts (new, 1–32) — formatMB, formatPages, baseName and the shared sanitizer `safeFileName(base, suffix)` moved out of the merge tool.
- src/lib/ui/device.ts (new, 1–10) — MB, Device, detectDevice.
- src/lib/ui/font.ts (new, 1–11) — loadDynamicFont, moved from the merge controller (both tools use it).
- src/tools/pdf-merge/format.ts:1–6 — only `mergedFileName`, now calling `safeFileName`.
- src/tools/pdf-merge/limits.ts:2, 15, 19 — imports MB/Device from lib/ui; detectDevice removed.
- src/tools/pdf-merge/controller.ts:6–10, 34–35, 44 — imports; `verify` message entry (required by the widened `PdfErrorCode`, never sent by the merge worker).
- scripts/regress/lib.mjs (new, 1–52) — openPdf, pageText, renderRgba, unitSize (shared by both harnesses).
- scripts/regress/merge.mjs:10, 41–47 — uses lib.mjs; renderGray is a thin wrapper.
- scripts/font-rename.mjs:91–154 — `readAllNames` (every record: platform/encoding/language/nameID/value) and `reservedNameProblems` (every record, plus a raw name-table byte scan for ASCII and UTF-16BE, case-insensitive); `readNames` now built on readAllNames.
- scripts/gen-ui-font.mjs:15, 48–50 — build fails on any reserved-name problem.
- src/lib/pdf/mergePlus.ts:204–206 — `withFileIndex` exported, `@internal exported for tests`.
- tests/unit/font-rename.test.ts (new) — Win 3/1/0x409 clean + Mac 1/0/0 "Pretendard" for the same nameID is rejected; UTF-16BE/case; clean table passes.
- tests/unit/merge-errors.test.ts (new) — TypeError → unknown with fileIndex; PdfCorruptError keeps corrupt + gains fileIndex; RangeError('Array buffer allocation failed') returned unchanged (→ oom).
- tests/unit/helpers.test.ts:3–6 — import paths only.

Dependencies and licences
- package.json:21–27 — `@jsquash/jpeg` 1.6.0, `@jsquash/resize` 2.1.1, `@neslinesli93/qpdf-wasm` 0.3.0 (exact); script `regress:compress`. package-lock.json updated.
- licenses/third-party/** (new) — qpdf 12.2.0 LICENSE.txt + NOTICE.md, libjpeg-turbo LICENSE.md + README.ijg, zlib LICENSE, qpdf-wasm ISC LICENSE; SOURCES.md lists every URL and commit.
- licenses.manifest.json — `localFiles` entry type; `component` entries (qpdf, libjpeg-turbo, zlib) for code compiled into qpdf-wasm; @jsquash/jpeg (`LICENSE`, `codec/LICENSE.codec.md`), @jsquash/resize (`LICENSE`, `lib/resize/LICENSE.codec.md`); optional `homepage` override.
- scripts/gen-licenses.mjs:12–74 — embeds `localFiles`, handles `component` entries; fails on any missing file or empty entry.
- scripts/copy-vendor.mjs:44–61 — `public/vendor/qpdf/12.2.0-w0.3.0/{qpdf.wasm,qpdf.mjs}`; qpdf.mjs = original qpdf.js + `export default Module;`; asserts the wrapper version.

Engine (framework-free; Node and worker)
- src/lib/pdf/compress/levels.ts — LEVELS, RASTER, rasterScale, KEEP_ORIGINAL_RATIO, FLATE6_ABOVE.
- src/lib/pdf/compress/deps.ts — CompressDeps, mozjpegOptions, `codecDeps` (shared jsquash adapter).
- src/lib/pdf/compress/qpdf-run.ts — one qpdf run in a fresh instance; console capture; OOM abort → RangeError.
- src/lib/pdf/compress/contentOps.ts — tokenizer; 256-byte token cap; 200,000,000-byte limit.
- src/lib/pdf/compress/placements.ts — imagePlacements (depth ≤ 8, per-page content budget, parse-failure count).
- src/lib/pdf/compress/images.ts — skip rules (per-reason counts), cheapCheck, decode, unpredictPng, isGray, uniqueColors, recompress loop (placement parse only with candidates).
- src/lib/pdf/compress/ssim.ts — luma SSIM 8×8/stride 4; 2×2 box average above 1200 px.
- src/lib/pdf/compress/dedupe.ts, signature.ts, report.ts, raster.ts (RasterAssembler), engine.ts (compressPdf, normalizeArgs, optimizeArgs, qpdfOk, qpdfFailure, hasEncryptKey).
- src/lib/pdf/errors.ts:1–2 — `verify` added to PdfErrorCode.

Worker, wasm, page
- src/lib/pdf/compress/wasm-browser.ts — the only file with `fetch(` (network-guard allowlist): jsquash wasm via `?url` + compileStreaming (ArrayBuffer fallback); qpdf glue via `/* @vite-ignore */` import; QPDF_VENDOR_DIR.
- src/lib/pdf/compress.worker.ts — compress / raster-begin / raster-page / raster-end; progress, done, error, raster-ack; ordered message queue.
- src/lib/pdf/inspect.ts:1–112 — `openPdf` and `renderPageCanvas` extracted (inspect behaviour unchanged).
- src/lib/pdf/raster-render.ts — main-thread page → RGBA (150 dpi, long side ≤ 3000 px, canvas zeroed).
- src/tools/pdf-compress/{controller.ts, limits.ts, check.ts, format.ts} — states empty/ready/working/done/kept/error, run token, back-pressure, main-thread result check, previews, limits 5.4, file names.
- src/pages/pdf-compress/index.astro — page per 5.1/5.2.
- src/components/RelatedTools.astro, src/data/jsonld.ts (tool-page JSON-LD shared by both pages), src/pages/pdf-merge/index.astro:5–10, 89, 132 (JSON-LD helper, "PDF 용량 줄이기" link in the done state, RelatedTools).
- src/data/tools.ts:65–100 — pdf-compress `live`, description (93 chars), 6 FAQ, keywords.
- src/styles/app.css:132–166 — compress styles (levels, details, warn box, previews, kept, related).
- docs/COPY.md:7 — ppi/dpi allowed "쓸 때는 설명과 함께".
- scripts/check-dist.mjs — bundle budgets (initial JS per page by static-import closure; worker; qpdf; MozJPEG; resize) and the table.
- lighthouserc.json:8–9 — `/pdf-compress/` added.

Tests and harness
- tests/helpers/image-data.ts (Vitest `setupFiles`, regress), tests/helpers/compress-deps.ts (Node deps).
- tests/unit/compress.test.ts (30 tests), tests/unit/compress-helpers.test.ts (20 tests), tests/unit/network-guard.test.ts:8–12, 34–40 (allowlist = exactly wasm-browser.ts).
- tests/fixtures/build.mjs — committed generators (gen_scan_a6 606 KB, gen_photo_resume 536 KB, gen_already_small 92 KB; fixtures total 1.48 MB) and runtime ones (owner_restricted, signed_fake, jpx_only, cmyk_jpeg, junk_content); `imagePdf`, `noisyJpeg`, `seededBytes` exported for unit tests. SOURCES.md updated.
- tests/e2e/pdf-compress.spec.ts (12 tests × 5 projects), tests/e2e/site.spec.ts (axe/SEO/sitemap/home cards/licences/related/360 px for the new page), tests/e2e/pdf-merge.spec.ts:55 (link to /pdf-compress/), tests/e2e/global-setup.ts:12 (big_21mb).
- scripts/regress/compress.mjs, scripts/regress/compress-baseline.json (spike numbers per file × level) and scripts/regress/compress-raster-baseline.json (round 1b: MozJPEG raster baseline); names and numbers only.

## Deviations from the brief
1. **qpdf wasm is not passed as `wasmBinary`** (brief §2 "fetch once"). qpdf-wasm 0.3.0 is built with `INCOMING_MODULE_JS_API=["noInitialRun","noFSInit","locateFile","preRun"]` (its build.sh at tag 0.3.0), so the factory ignores `wasmBinary`, `instantiateWasm`, `print` and `printErr`. Each fresh instance loads the wasm via `locateFile` from the same versioned immutable URL (HTTP cache after the first run; 2 GETs per run, 3 on the repair path). The alternative, patching the minified glue, I did not do. Arch: accept, or ask for the patch.
2. **qpdf logs are captured by swapping `console.log/error` during the factory call** (the build binds them there). Nothing reaches the console.
3. **`initResize(url)` → compiled module.** The resize wasm is compiled in wasm-browser.ts and passed to the wasm-bindgen init, and only `lib/resize/pkg` is imported, so the hqx and magic-kernel wasm are not shipped (and need no licence entry).
4. **Engine returns `password` (not `wrong-password`) when qpdf says "invalid password" and no password was given**, to satisfy the unit row "no password → password-required". It also asserts the `%PDF-` header itself (unit row "not_a_pdf → not-pdf").
5. **Worker `done` carries `bytes: null` for a kept result** (no transfer of the input back).
6. **Kept state also offers "다른 단계로 다시 줄이기" and "처음부터"** (navigation only; no new behaviour).
7. **Closing "더 줄여야 하나요?" while 이미지로 변환 is selected switches back to 권장** and announces it.
8. **Small shared refactors beyond 0.1:** `loadDynamicFont` → `src/lib/ui/font.ts`, tool JSON-LD → `src/data/jsonld.ts`, inspect.ts exports `openPdf`/`renderPageCanvas`. All behaviour-neutral for PDF 합치기 (its e2e and regress unchanged).

## Blocked
None. Round 1 flagged three items; Arch decided them (2026-09-29) and they are applied:
1. **Raster rule re-baselined** to the shipped MozJPEG q70 pipeline. New file `scripts/regress/compress-raster-baseline.json` (22 corpus files, file names and numbers only, incl. kr_gongmun_msit 23.2 % at SSIMmin 0.9605). `scripts/regress/compress.mjs` now judges raster rows as: a result is offered only if it is ≥ 1 % smaller and its SSIMmin ≥ the raster gate; otherwise it must be kept; and kept/offered must match the baseline, with offered reduction ≥ baseline − 3. The raster gate is baseline-relative (baseline SSIMmin − 0.005, the same slack as the normal levels), since no absolute raster SSIM constant exists in the brief or the product; the named KPMG floor (≥ 71 %, SSIMmin ≥ 0.93) still applies. Normal-level thresholds are unchanged. The spike raster numbers stay in compress-baseline.json for the record but are no longer judged; the table's raster "Baseline" columns show the new baseline.
2. **qpdf-wasm ISC** kept as "Copyright (c) 2022 neslinesli93"; `licenses/third-party/SOURCES.md` now says it comes from the repository owner handle and creation year because the repo has no LICENSE file.
3. **zlib notice** from zlib.h lines 1–23: accepted, unchanged.

**One question for Arch:** "the raster gate" was not defined anywhere as a number, so I made it baseline-relative, as described in point 1. If you want an absolute value instead (for example 0.88; the lowest offered raster SSIMmin is gen_scan_a6 at 0.8857), it is one constant in compress.mjs.

## Timing flags (not failures; Node vs the spike's Chromium)
Normal levels over 2 × spike (round 1b run): irs_fw9 high/권장/강력 only (1.0–1.1 s vs 0.37–0.39 s in Chromium; reproducible in Node, the file is small, so it is Node overhead rather than a hotspot). kr_customs_cases 권장 (flagged in round 1 while other tests shared the CPU) is no longer over 2 ×. Every raster row is slower in Node (pdf.js renders through @napi-rs/canvas in software; the spike's raster ms was Chromium's GPU canvas), e.g. KPMG raster 36.5 s vs 9.9 s. The browser path is the one users get.

## Open Questions
- Richard: please look at `src/tools/pdf-compress/controller.ts` run-token paths (cancel during raster, `pendingAck` released by `stopWorker`, `finish` after a newer run) and at `hasEncryptKey` (byte scan for `/Encrypt`) as the owner-restriction signal.
- Gate 11: one real scan PDF and one text PDF in real Chrome, Firefox and Edge, plus a phone.

## Out of Scope (logged in BUILD-LOG Known Gaps)
- Real CMYK JPEG fixture (current one is an RGB JPEG with a /DeviceCMYK dictionary).
- Everything in the brief's Out of Scope list (target-size mode, batches, JPX for 강력, CCITT/JBIG2 conversion, PDF/A, pre-flight signature warning, re-protection, self-built qpdf-wasm, merge → compress hand-off).

## regress:compress — regress-out/compress.md (round 1b run)
Reduction % and SSIMmin (pdf.js 110 dpi, long side ≤ 1800 px, luma 8×8 stride 4, up to 7 sampled pages). "Baseline" columns: spike numbers (compress-baseline.json) for the normal levels, the MozJPEG raster baseline (compress-raster-baseline.json) for raster. Fixture rows have no baseline.

| File | Level | Result | Reduction % | Baseline % | SSIMmin | Baseline SSIMmin | Text | Images | ms | Spike ms | MB in → out | Problems |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| gen_already_small.pdf | high | PASS | 0 (kept) | – | 1 | – | 7/7 | 0/0 | 172 | – | 0.09 → 0.09 |  |
| gen_already_small.pdf | recommended | PASS | 0 (kept) | – | 1 | – | 7/7 | 0/0 | 121 | – | 0.09 → 0.09 |  |
| gen_already_small.pdf | strong | PASS | 0 (kept) | – | 1 | – | 7/7 | 0/0 | 129 | – | 0.09 → 0.09 |  |
| gen_already_small.pdf | raster | PASS | 0 (kept) | – | 1 | – | 7/7 | 0/0 | 1897 | – | 0.09 → 0.09 |  |
| gen_landscape_rotated.pdf | high | PASS | 15.3 | – | 1 | – | 2/2 | 0/0 | 57 | – | 0 → 0 |  |
| gen_landscape_rotated.pdf | recommended | PASS | 15.3 | – | 1 | – | 2/2 | 0/0 | 22 | – | 0 → 0 |  |
| gen_landscape_rotated.pdf | strong | PASS | 15.3 | – | 1 | – | 2/2 | 0/0 | 42 | – | 0 → 0 |  |
| gen_landscape_rotated.pdf | raster | PASS | 0 (kept) | – | 1 | – | 2/2 | 0/0 | 298 | – | 0 → 0 |  |
| gen_links_outline.pdf | high | PASS | 43.9 | – | 1 | – | 4/4 | 0/0 | 50 | – | 0 → 0 |  |
| gen_links_outline.pdf | recommended | PASS | 43.9 | – | 1 | – | 4/4 | 0/0 | 52 | – | 0 → 0 |  |
| gen_links_outline.pdf | strong | PASS | 43.9 | – | 1 | – | 4/4 | 0/0 | 59 | – | 0 → 0 |  |
| gen_links_outline.pdf | raster | PASS | 0 (kept) | – | 1 | – | 4/4 | 0/0 | 557 | – | 0 → 0 |  |
| gen_photo_resume.pdf | high | PASS | 88.4 | – | 0.9998 | – | 1/1 | 1/1 | 349 | – | 0.52 → 0.06 |  |
| gen_photo_resume.pdf | recommended | PASS | 89 | – | 0.9997 | – | 1/1 | 1/1 | 265 | – | 0.52 → 0.06 |  |
| gen_photo_resume.pdf | strong | PASS | 89.2 | – | 0.9992 | – | 1/1 | 1/1 | 259 | – | 0.52 → 0.06 |  |
| gen_photo_resume.pdf | raster | PASS | 79 | – | 0.957 | – | 0/1 | 0/0 | 1329 | – | 0.52 → 0.11 |  |
| gen_scan_a6.pdf | high | PASS | 61.9 | – | 0.9653 | – | 1/1 | 1/1 | 806 | – | 0.59 → 0.23 |  |
| gen_scan_a6.pdf | recommended | PASS | 93.1 | – | 0.9603 | – | 1/1 | 1/1 | 235 | – | 0.59 → 0.04 |  |
| gen_scan_a6.pdf | strong | PASS | 96.9 | – | 0.9244 | – | 1/1 | 1/1 | 180 | – | 0.59 → 0.02 |  |
| gen_scan_a6.pdf | raster | PASS | 94 | – | 0.8857 | – | 1/1 | 0/0 | 491 | – | 0.59 → 0.04 |  |
| irs_fw9.pdf | high | PASS | 12.4 | – | 1 | – | 6/6 | 0/0 | 1091 | – | 0.13 → 0.12 |  |
| irs_fw9.pdf | recommended | PASS | 12.4 | – | 1 | – | 6/6 | 0/0 | 1103 | – | 0.13 → 0.12 |  |
| irs_fw9.pdf | strong | PASS | 12.4 | – | 1 | – | 6/6 | 0/0 | 1064 | – | 0.13 → 0.12 |  |
| irs_fw9.pdf | raster | PASS | 0 (kept) | – | 1 | – | 6/6 | 0/0 | 2611 | – | 0.13 → 0.13 |  |
| kr_law_form.pdf | high | PASS | 11.6 | – | 1 | – | 7/7 | 0/0 | 146 | – | 0.1 → 0.09 |  |
| kr_law_form.pdf | recommended | PASS | 11.6 | – | 1 | – | 7/7 | 0/0 | 117 | – | 0.1 → 0.09 |  |
| kr_law_form.pdf | strong | PASS | 11.6 | – | 1 | – | 7/7 | 0/0 | 99 | – | 0.1 → 0.09 |  |
| kr_law_form.pdf | raster | PASS | 0 (kept) | – | 1 | – | 7/7 | 0/0 | 1715 | – | 0.1 → 0.1 |  |
| edge_damaged_badxref.pdf | high | PASS | 11.6 | 11.6 | 1 | 1 | 7/7 | 0/0 | 222 | 208 | 0.1 → 0.09 |  |
| edge_damaged_badxref.pdf | recommended | PASS | 11.6 | 11.6 | 1 | 1 | 7/7 | 0/0 | 220 | 198 | 0.1 → 0.09 |  |
| edge_damaged_badxref.pdf | strong | PASS | 11.6 | 11.6 | 1 | 1 | 7/7 | 0/0 | 201 | 241 | 0.1 → 0.09 |  |
| edge_damaged_badxref.pdf | raster | PASS | 0 (kept) | 0 (kept) | 1 | 1 | 7/7 | 0/0 | 1722 ⚠ | 624 | 0.1 → 0.1 |  |
| edge_damaged_truncated.pdf | high | PASS | error corrupt | ERR | – | – | – | – | – | – | 0.66 → – |  |
| edge_damaged_truncated.pdf | recommended | PASS | error corrupt | ERR | – | – | – | – | – | – | 0.66 → – |  |
| edge_damaged_truncated.pdf | strong | PASS | error corrupt | ERR | – | – | – | – | – | – | 0.66 → – |  |
| edge_damaged_truncated.pdf | raster | PASS | error corrupt | ERR | – | – | – | – | – | – | 0.66 → – |  |
| edge_encrypted_userpw_1234.pdf | high | PASS | 5.4 | 5.4 | 1 | 1 | 2/2 | 0/3 | 191 | 271 | 0.11 → 0.11 |  |
| edge_encrypted_userpw_1234.pdf | recommended | PASS | 14 | 14 | 0.9995 | 0.9995 | 2/2 | 1/3 | 159 | 239 | 0.11 → 0.1 |  |
| edge_encrypted_userpw_1234.pdf | strong | PASS | 18.1 | 18.1 | 0.999 | 0.9989 | 2/2 | 1/3 | 117 | 183 | 0.11 → 0.09 |  |
| edge_encrypted_userpw_1234.pdf | raster | PASS | 0 (kept) | 0 (kept) | 1 | 1 | 2/2 | 0/0 | 613 | 394 | 0.11 → 0.11 |  |
| en_iea_korea2025.pdf | high | PASS | 24.3 | 24.3 | 1 | 1 | 7/7 | 4/23 | 4695 | 4550 | 1.59 → 1.2 |  |
| en_iea_korea2025.pdf | recommended | PASS | 25.1 | 25.1 | 1 | 1 | 7/7 | 4/23 | 4568 | 4294 | 1.59 → 1.19 |  |
| en_iea_korea2025.pdf | strong | PASS | 25.6 | 25.6 | 1 | 1 | 7/7 | 4/23 | 4645 | 4410 | 1.59 → 1.18 |  |
| en_iea_korea2025.pdf | raster | PASS | 0 (kept) | 0 (kept) | 1 | 1 | 7/7 | 0/0 | 18403 ⚠ | 3052 | 1.59 → 1.59 |  |
| irs_f1040.pdf | high | PASS | 12 | 12 | 1 | 1 | 2/2 | 0/0 | 2411 | 2034 | 0.21 → 0.18 |  |
| irs_f1040.pdf | recommended | PASS | 12 | 12 | 1 | 1 | 2/2 | 0/0 | 2306 | 1267 | 0.21 → 0.18 |  |
| irs_f1040.pdf | strong | PASS | 12 | 12 | 1 | 1 | 2/2 | 0/0 | 2371 | 1235 | 0.21 → 0.18 |  |
| irs_f1040.pdf | raster | PASS | 0 (kept) | 0 (kept) | 1 | 1 | 2/2 | 0/0 | 967 ⚠ | 427 | 0.21 → 0.21 |  |
| irs_fw9.pdf | high | PASS | 12.4 | 12.4 | 1 | 1 | 6/6 | 0/0 | 1085 ⚠ | 392 | 0.13 → 0.12 |  |
| irs_fw9.pdf | recommended | PASS | 12.4 | 12.4 | 1 | 1 | 6/6 | 0/0 | 1026 ⚠ | 370 | 0.13 → 0.12 |  |
| irs_fw9.pdf | strong | PASS | 12.4 | 12.4 | 1 | 1 | 6/6 | 0/0 | 1117 ⚠ | 384 | 0.13 → 0.12 |  |
| irs_fw9.pdf | raster | PASS | 0 (kept) | 0 (kept) | 1 | 1 | 6/6 | 0/0 | 2547 ⚠ | 649 | 0.13 → 0.13 |  |
| kr_customs_cases.pdf | high | PASS | 17.7 | 17.7 | 1 | 1 | 7/7 | 1/388 | 6814 | 6100 | 3.75 → 3.09 |  |
| kr_customs_cases.pdf | recommended | PASS | 19.5 | 19.5 | 0.9997 | 0.9996 | 7/7 | 4/388 | 6561 | 5497 | 3.75 → 3.02 |  |
| kr_customs_cases.pdf | strong | PASS | 24.5 | 24.5 | 0.9976 | 0.9975 | 7/7 | 28/388 | 6263 | 5079 | 3.75 → 2.83 |  |
| kr_gongmun_ice.pdf | high | PASS | 8.9 | 8.9 | 1 | 1 | 7/7 | 11/2272 | 25005 | 28640 | 15.23 → 13.87 |  |
| kr_gongmun_ice.pdf | recommended | PASS | 13 | 13 | 1 | 1 | 7/7 | 51/2272 | 23229 | 23385 | 15.23 → 13.24 |  |
| kr_gongmun_ice.pdf | strong | PASS | 18.8 | 18.8 | 1 | 1 | 7/7 | 81/2272 | 21839 | 19897 | 15.23 → 12.36 |  |
| kr_gongmun_moleg.pdf | high | PASS | 4.1 | 4.1 | 1 | 1 | 2/2 | 0/3 | 125 | 162 | 0.11 → 0.11 |  |
| kr_gongmun_moleg.pdf | recommended | PASS | 12.8 | 12.8 | 0.9995 | 0.9995 | 2/2 | 1/3 | 103 | 146 | 0.11 → 0.1 |  |
| kr_gongmun_moleg.pdf | strong | PASS | 17 | 17 | 0.999 | 0.9989 | 2/2 | 1/3 | 103 | 149 | 0.11 → 0.09 |  |
| kr_gongmun_moleg.pdf | raster | PASS | 0 (kept) | 0 (kept) | 1 | 1 | 2/2 | 0/0 | 534 | 271 | 0.11 → 0.11 |  |
| kr_gongmun_msit.pdf | high | PASS | 10.8 | 10.8 | 1 | 1 | 1/1 | 1/5 | 135 | 165 | 0.12 → 0.1 |  |
| kr_gongmun_msit.pdf | recommended | PASS | 15.4 | 15.4 | 0.9995 | 0.9995 | 1/1 | 1/5 | 102 | 144 | 0.12 → 0.1 |  |
| kr_gongmun_msit.pdf | strong | PASS | 17 | 17 | 0.9994 | 0.9993 | 1/1 | 1/5 | 83 | 140 | 0.12 → 0.1 |  |
| kr_gongmun_msit.pdf | raster | PASS | 23.2 | 23.2 | 0.9605 | 0.9605 | 0/1 | 0/0 | 336 | 299 | 0.12 → 0.09 |  |
| kr_gongmun_opm.pdf | high | PASS | 13.9 | 13.9 | 1 | 1 | 4/4 | 0/227 | 393 | 290 | 0.27 → 0.23 |  |
| kr_gongmun_opm.pdf | recommended | PASS | 13.9 | 13.9 | 1 | 1 | 4/4 | 0/227 | 384 | 312 | 0.27 → 0.23 |  |
| kr_gongmun_opm.pdf | strong | PASS | 13.9 | 13.9 | 1 | 1 | 4/4 | 0/227 | 377 | 307 | 0.27 → 0.23 |  |
| kr_gongmun_opm.pdf | raster | PASS | 0 (kept) | 0 (kept) | 1 | 1 | 4/4 | 0/0 | 1327 | 677 | 0.27 → 0.27 |  |
| kr_kcc_briefing.pdf | high | PASS | 6.5 | 6.5 | 1 | 0.9999 | 20/20 | 2/29 | 1836 | 1629 | 0.78 → 0.73 |  |
| kr_kcc_briefing.pdf | recommended | PASS | 8.5 | 8.5 | 0.9992 | 0.9992 | 20/20 | 3/29 | 1697 | 1625 | 0.78 → 0.71 |  |
| kr_kcc_briefing.pdf | strong | PASS | 14.9 | 14.9 | 0.9884 | 0.9879 | 20/20 | 14/29 | 1595 | 1493 | 0.78 → 0.66 |  |
| kr_kcc_briefing.pdf | raster | PASS | 0 (kept) | 0 (kept) | 1 | 1 | 20/20 | 0/0 | 8729 ⚠ | 1855 | 0.78 → 0.78 |  |
| kr_kpmg_outlook.pdf | high | PASS | 19.4 | 19.7 | 1 | 1 | 51/51 | 3/78 | 37421 | 43110 | 38.78 → 31.25 |  |
| kr_kpmg_outlook.pdf | recommended | PASS | 20.7 | 20.9 | 0.9632 | 0.9637 | 51/51 | 5/78 | 36713 | 43693 | 38.78 → 30.77 |  |
| kr_kpmg_outlook.pdf | strong | PASS | 21.2 | 21.4 | 0.9577 | 0.9572 | 51/51 | 5/78 | 36470 | 41965 | 38.78 → 30.56 |  |
| kr_kpmg_outlook.pdf | raster | PASS | 79.9 | 79.9 | 0.9335 | 0.9335 | 51/51 | 0/0 | 36523 ⚠ | 9910 | 38.78 → 7.79 |  |
| kr_law_form.pdf | high | PASS | 11.6 | 11.6 | 1 | 1 | 7/7 | 0/0 | 109 | 225 | 0.1 → 0.09 |  |
| kr_law_form.pdf | recommended | PASS | 11.6 | 11.6 | 1 | 1 | 7/7 | 0/0 | 116 | 190 | 0.1 → 0.09 |  |
| kr_law_form.pdf | strong | PASS | 11.6 | 11.6 | 1 | 1 | 7/7 | 0/0 | 114 | 180 | 0.1 → 0.09 |  |
| kr_law_form.pdf | raster | PASS | 0 (kept) | 0 (kept) | 1 | 1 | 7/7 | 0/0 | 1813 ⚠ | 614 | 0.1 → 0.1 |  |
| kr_pen_doc.pdf | high | PASS | 9.4 | 9.4 | 1 | 1 | 1/1 | 0/3 | 76 | 94 | 0.1 → 0.09 |  |
| kr_pen_doc.pdf | recommended | PASS | 9.4 | 9.4 | 1 | 1 | 1/1 | 0/3 | 64 | 107 | 0.1 → 0.09 |  |
| kr_pen_doc.pdf | strong | PASS | 9.4 | 9.4 | 1 | 1 | 1/1 | 0/3 | 48 | 107 | 0.1 → 0.09 |  |
| kr_pen_doc.pdf | raster | PASS | 0 (kept) | 0 (kept) | 1 | 1 | 1/1 | 0/0 | 374 | 233 | 0.1 → 0.1 |  |
| pdfjs_tracemonkey.pdf | high | PASS | 21.3 | 21.3 | 1 | 1 | 14/14 | 0/178 | 712 | 710 | 0.97 → 0.76 |  |
| pdfjs_tracemonkey.pdf | recommended | PASS | 21.3 | 21.3 | 1 | 1 | 14/14 | 0/178 | 780 | 644 | 0.97 → 0.76 |  |
| pdfjs_tracemonkey.pdf | strong | PASS | 21.3 | 21.3 | 1 | 1 | 14/14 | 0/178 | 754 | 715 | 0.97 → 0.76 |  |
| pdfjs_tracemonkey.pdf | raster | PASS | 0 (kept) | 0 (kept) | 1 | 1 | 14/14 | 0/0 | 6244 ⚠ | 1353 | 0.97 → 0.97 |  |
| resume_racz_cc0.pdf | high | PASS | 2.2 | 2.2 | 1 | 1 | 7/7 | 0/0 | 486 | 681 | 1.28 → 1.25 |  |
| resume_racz_cc0.pdf | recommended | PASS | 2.2 | 2.2 | 1 | 1 | 7/7 | 0/0 | 493 | 588 | 1.28 → 1.25 |  |
| resume_racz_cc0.pdf | strong | PASS | 2.2 | 2.2 | 1 | 1 | 7/7 | 0/0 | 464 | 573 | 1.28 → 1.25 |  |
| resume_racz_cc0.pdf | raster | PASS | 0 (kept) | 0 (kept) | 1 | 1 | 7/7 | 0/0 | 22178 ⚠ | 3069 | 1.28 → 1.28 |  |
| scan_book_sangsomun.pdf | high | PASS | 0 (kept) | 0.5 | 1 | 1 | 7/7 | 0/192 | 1085 | 881 | 11.69 → 11.69 |  |
| scan_book_sangsomun.pdf | recommended | PASS | 0 (kept) | 0.5 | 1 | 1 | 7/7 | 0/192 | 1043 | 1024 | 11.69 → 11.69 |  |
| scan_book_sangsomun.pdf | strong | PASS | 0 (kept) | 0.5 | 1 | 1 | 7/7 | 0/192 | 1039 | 972 | 11.69 → 11.69 |  |
| scan_book_sangsomun.pdf | raster | PASS | 32.7 | 32.7 | 0.8913 | 0.8913 | 2/7 | 0/0 | 47758 | 39946 | 11.69 → 7.86 |  |
| scan_donga_1949.pdf | high | PASS | 0 (kept) | 0 | 1 | 1 | 2/2 | 0/2 | 110 | 114 | 2.3 → 2.3 |  |
| scan_donga_1949.pdf | recommended | PASS | 0 (kept) | 0 | 1 | 1 | 2/2 | 0/2 | 118 | 108 | 2.3 → 2.3 |  |
| scan_donga_1949.pdf | strong | PASS | 0 (kept) | 0 | 1 | 1 | 2/2 | 0/2 | 114 | 86 | 2.3 → 2.3 |  |
| scan_donga_1949.pdf | raster | PASS | 0 (kept) | 0 (kept) | 1 | 1 | 2/2 | 0/0 | 4764 ⚠ | 1169 | 2.3 → 2.3 |  |
| scan_keti_bizreg_bank.pdf | high | PASS | 1.1 | 1.1 | 1 | 1 | 2/2 | 0/2 | 378 | 536 | 0.11 → 0.11 |  |
| scan_keti_bizreg_bank.pdf | recommended | PASS | 9.8 | 9.8 | 0.9964 | 0.9963 | 2/2 | 1/2 | 353 | 459 | 0.11 → 0.1 |  |
| scan_keti_bizreg_bank.pdf | strong | PASS | 29.4 | 29.4 | 0.988 | 0.9879 | 2/2 | 2/2 | 302 | 396 | 0.11 → 0.08 |  |
| scan_keti_bizreg_bank.pdf | raster | PASS | 0 (kept) | 0 (kept) | 1 | 1 | 2/2 | 0/0 | 763 ⚠ | 186 | 0.11 → 0.11 |  |
| scan_us_nkarmy_history.pdf | high | PASS | 2 | 2 | 1 | 1 | 7/7 | 0/397 | 8334 | 10866 | 17.58 → 17.23 |  |
| scan_us_nkarmy_history.pdf | recommended | PASS | 3.5 | 3.5 | 0.9983 | 0.9983 | 7/7 | 23/397 | 7876 | 10152 | 17.58 → 16.97 |  |
| scan_us_nkarmy_history.pdf | strong | PASS | 5.8 | 5.8 | 0.9651 | 0.9649 | 7/7 | 33/397 | 7118 | 8128 | 17.58 → 16.56 |  |
| scan_us_nkarmy_history.pdf | raster | PASS | 0 (kept) | 0 (kept) | 1 | 1 | 7/7 | 0/0 | 101844 ⚠ | 25896 | 17.58 → 17.58 |  |
| synth_resume_kr_photo.pdf | high | PASS | 94.3 | 94.3 | 0.9997 | 0.9997 | 1/1 | 1/1 | 643 | 1161 | 1.38 → 0.08 |  |
| synth_resume_kr_photo.pdf | recommended | PASS | 95.6 | 95.6 | 0.9997 | 0.9997 | 1/1 | 1/1 | 606 | 1212 | 1.38 → 0.06 |  |
| synth_resume_kr_photo.pdf | strong | PASS | 96.1 | 96.1 | 0.9992 | 0.9992 | 1/1 | 1/1 | 650 | 1189 | 1.38 → 0.05 |  |
| synth_resume_kr_photo.pdf | raster | PASS | 85.1 | 85.1 | 0.9183 | 0.9183 | 0/1 | 0/0 | 8204 ⚠ | 1527 | 1.38 → 0.21 |  |
| synth_scan_mfp_gongmun.pdf | high | PASS | 87.3 | 87.3 | 0.9532 | 0.9531 | 4/4 | 4/4 | 5296 | 7048 | 8.66 → 1.1 |  |
| synth_scan_mfp_gongmun.pdf | recommended | PASS | 95.6 | 95.6 | 0.945 | 0.9449 | 4/4 | 4/4 | 2995 | 4363 | 8.66 → 0.38 |  |
| synth_scan_mfp_gongmun.pdf | strong | PASS | 98 | 98 | 0.9274 | 0.9273 | 4/4 | 4/4 | 2256 | 2816 | 8.66 → 0.17 |  |
| synth_scan_mfp_gongmun.pdf | raster | PASS | 96.1 | 96.1 | 0.9243 | 0.9243 | 4/4 | 0/0 | 23084 ⚠ | 457 | 8.66 → 0.34 |  |
| synth_scan_phone_cv.pdf | high | PASS | 54.1 | 54.1 | 0.9769 | 0.972 | 2/2 | 2/2 | 2315 | 2893 | 2.22 → 1.02 |  |
| synth_scan_phone_cv.pdf | recommended | PASS | 85.1 | 85.1 | 0.9682 | 0.968 | 2/2 | 2/2 | 1189 | 1457 | 2.22 → 0.33 |  |
| synth_scan_phone_cv.pdf | strong | PASS | 94 | 94 | 0.9301 | 0.9314 | 2/2 | 2/2 | 802 | 1260 | 2.22 → 0.13 |  |
| synth_scan_phone_cv.pdf | raster | PASS | 86.7 | 86.7 | 0.8873 | 0.8873 | 2/2 | 0/0 | 5342 ⚠ | 272 | 2.22 → 0.3 |  |

122/122 pass.

Slower than 2 × spike (flag, not a failure):
- edge_damaged_badxref.pdf [raster] 1722 ms vs spike 624 ms
- en_iea_korea2025.pdf [raster] 18403 ms vs spike 3052 ms
- irs_f1040.pdf [raster] 967 ms vs spike 427 ms
- irs_fw9.pdf [high] 1085 ms vs spike 392 ms
- irs_fw9.pdf [recommended] 1026 ms vs spike 370 ms
- irs_fw9.pdf [strong] 1117 ms vs spike 384 ms
- irs_fw9.pdf [raster] 2547 ms vs spike 649 ms
- kr_kcc_briefing.pdf [raster] 8729 ms vs spike 1855 ms
- kr_kpmg_outlook.pdf [raster] 36523 ms vs spike 9910 ms
- kr_law_form.pdf [raster] 1813 ms vs spike 614 ms
- pdfjs_tracemonkey.pdf [raster] 6244 ms vs spike 1353 ms
- resume_racz_cc0.pdf [raster] 22178 ms vs spike 3069 ms
- scan_donga_1949.pdf [raster] 4764 ms vs spike 1169 ms
- scan_keti_bizreg_bank.pdf [raster] 763 ms vs spike 186 ms
- scan_us_nkarmy_history.pdf [raster] 101844 ms vs spike 25896 ms
- synth_resume_kr_photo.pdf [raster] 8204 ms vs spike 1527 ms
- synth_scan_mfp_gongmun.pdf [raster] 23084 ms vs spike 457 ms
- synth_scan_phone_cv.pdf [raster] 5342 ms vs spike 272 ms

---

# Round 2 — Richard's Should Fix items (2026-09-29)
Status: DONE

| # | Fix | Where |
|---|---|---|
| 1 | `raster-end` throws `PdfCorruptError` unless pages received = `pageCount` (never partial, also in the worker). | src/lib/pdf/compress.worker.ts (raster-end, import) |
| 2 | Raster rows now report `pages out/in` as a problem on any mismatch (fixture rows included). | scripts/regress/compress.mjs (judge, raster branch) |
| 3 | `openPdf` returning null during 이미지로 변환 → `fail('unknown')` (terminates the worker, bumps the run token, error state). | src/tools/pdf-compress/controller.ts (runRaster) |
| 4 | qpdf `password` (none given) shows `MESSAGES.password` ("이 파일은 비밀번호로 보호되어 있습니다. 비밀번호를 입력해 주세요."); `wrong-password` keeps "비밀번호가 맞지 않습니다." | controller.ts (fail) |
| 5 | Done and kept panels: `scroll-margin-top: 76px` plus `revealThenFocus` (scrollIntoView block start, then `focus({preventScroll:true})`). Checked at 1280×700: panel top 75.7 px, header bottom 61 px, focus on 내려받기 / 다른 단계로 다시 줄이기. | controller.ts (revealThenFocus), src/styles/app.css |
| 6 | qpdf-run: log capture capped at `MAX_LOG_LINES = 200`. Two new unit tests: a throwing factory leaves console.log/error restored; a glue-style bound logger emitting 500 lines gives 200 captured lines and a restored console. | src/lib/pdf/compress/qpdf-run.ts, tests/unit/compress-helpers.test.ts |
| 7 | "level switch" e2e marked `test.slow()`. | tests/e2e/pdf-compress.spec.ts |

Gates rerun:
- check: 0 errors, 0 warnings, 0 hints.
- Unit tests: 94/94 (+2).
- Build and check-dist: OK, budgets unchanged (6.4 / 5.8 / 255.9 / 439.1 / 120.8 / 16.7 KB).
- check:licenses: OK, 23 packages.
- e2e `pdf-compress.spec.ts` on chromium, firefox and webkit: 33 passed, 3 skipped (mobile-only), 0 flaky.
- regress:compress `--levels raster` (only the raster branch changed): 29/29 pass. The normal-level judging did not change; its last full run was 122/122.

Decisions noted: the raster SSIM gate stays baseline-relative. Gate 11: the orchestrator runs the live smoke test in real Chrome, Edge and Firefox after deploy; the phone check stays owed.
