# BUILD-LOG — 안올림 (doc-tools-kr)

## Decisions (locked, 2026-09-29)
- **Stack:** Astro 7 static site, TypeScript strict, module Web Workers, self-hosted lazy WASM. No UI framework, no backend.
  - Cloudflare Pages output directory becomes `dist/`. The owner changes the CF settings at the Step 1 deploy.
- **Release order:**
  1. PDF 합치기 (plus the site foundation)
  2. PDF 용량 줄이기
  3. 사진 용량 줄이기
  4. 여권·증명사진
  5. HWP→PDF, gated on a 100+ file corpus
- **Merge engine:** @cantoo/pdf-lib 2.11.1 plus a port of mergePlus. The original pdf-lib is banned.
- **Out of scope:**
  - 주민번호 가리기 (about zero demand)
  - HEIC decoding (only LGPL decoders exist)
  - background editing or retouching (policy)
- **Ads:** the AdSlot component is reserved and renders nothing while `ADS_ENABLED=false`.
- **Licenses:** MPL is allowed only in dev tooling (@axe-core/playwright). Shipped code must use the permissive allowlist.

## Steps
| Step | Status | Date |
|---|---|---|
| 1 Foundation + PDF 합치기 | **Live** — commit 44af82c; Cloudflare Pages builds `npm run build` → `dist`, Node 22 via .node-version | 2026-09-29 |
| 2 PDF 용량 줄이기 | Built by Bob; in review (handoff/REVIEW-REQUEST.md) | 2026-09-29 |

## Known Gaps
- Page-level merge editing (candidate Step 1b, after Step 2; owner to confirm)
- Password re-protection of output files
- qpdf fast path for very large merges, and a self-built qpdf-wasm with xref recovery
- JPX recompression for 강력 (Step 2 follow-up)
- "목표 용량" mode for PDF compression (e.g. "10 MB 이하로"); owner to decide
- Multi-file PDF compression in one run
- B/W scan conversion to CCITT G4 / JBIG2
- PDF/A conformance preservation when compressing (object streams break PDF/A-1)
- Signature warning *before* compression (pre-flight pass); Step 2 warns on the result
- Hand-off of a merged file straight into the compressor
- Manual iLovePDF comparison on 3–4 non-sensitive files (owner)
- Re-verification of the photo presets marked secondary (before Step 4)
- Expanding the HWP corpus to 100+ files (precondition for Step 5)

## Open questions for owner
- Privacy page contact channel: email or GitHub issues

## Step 1 build notes (Bob, 2026-09-29)

### Dependencies (exact pins; licenses)
- Runtime (shipped): `@cantoo/pdf-lib@2.11.1` (MIT; deps fflate MIT, culori MIT, tslib 0BSD, node-html-better-parser MIT, html-entities MIT), `pdfjs-dist@6.3.289` (Apache-2.0; wasm: openjpeg BSD-2, jbig2 BSD-3, qcms MIT; cmaps BSD-3; Foxit fonts BSD-3), `pretendard@1.3.9` (OFL-1.1).
  - `pdfjs-dist` has an optional dependency `@napi-rs/canvas@1.0.9` (MIT). It is Node-only and never shipped to the browser; the regression harness uses it for rendering.
- Dev only: `astro@7.3.5`, `typescript@6.0.3`, `@astrojs/check@0.9.10`, `vitest@5.0.2`, `@playwright/test@1.63.0`, `@axe-core/playwright@4.13.0` (MPL-2.0, dev only), `@lhci/cli@0.15.1`, `@types/node@22.19.1`, **`vite@8.3.1`** (MIT; same version astro/vitest already pull in; made explicit because the regression harness imports it), **`subset-font@2.9.0`** (BSD-3-Clause; deps harfbuzzjs MIT, fontverter BSD-3, wawoff2 MIT).
- TS: `@astrojs/check@0.9.10` peers `typescript ^5 || ^6`, so TS 7.0.2 is not usable; pinned 6.0.3 (latest 6.x). `astro check` is clean.
- `npm audit`: 10 advisories, all in `@lhci/cli`'s dev-only tree (tmp, uuid, inquirer). Nothing shipped. No fix without downgrading lhci.

### Decisions
- **UI font subset (deviation from A4).** Self-hosting the Pretendard dynamic subset as a render-blocking stylesheet made the landing page need ~13 woff2 slices (~330 KB) before first paint: mobile Lighthouse FCP/LCP 3.0–3.7 s, perf 0.81–0.89, CLS 0.04 from the font swap. Fix: `scripts/gen-ui-font.mjs` (prebuild) cuts one variable-font subset of every character in `src/` (~430 chars, 95 KiB), hashed by Vite and preloaded. Result: LCP 1.4 s (home) / 1.6 s (tool), CLS 0, perf 98–100. The dynamic subset is still copied (versioned: `public/fonts/pretendard/1.3.9/`), renamed to family "Pretendard Dynamic", and loaded by the merge tool on the first added file, so Korean file names outside the UI subset still render in Pretendard. The rendered look is unchanged (screenshot diff: only the PDF card and the footer links differ).
- **mergePlus `/P` detach (addition to the spike algorithm).** Spike mergePlus copied an orphan page object for multi-page AcroForms: widgets reached through a field's `/Kids` carry `/P` pointing at other pages, and copyPages followed it (irs_fw9: 7 page objects for 6 pages). Step 0 now removes `/P` from source annotations and re-sets it to the copied page. All spike metrics unchanged (regress table in REVIEW-REQUEST).
- pdf.js 6.x removed `isEvalSupported` (no eval path exists; `new Function`/`eval` do not occur in pdf.min.mjs or pdf.worker.min.mjs), so the option is not passed.
- Not shipped from pdf.js: `standard_fonts/Liberation*` (GPL-2.0 with font exception, outside the allowlist; pdf.js falls back to a system sans for non-embedded Helvetica/Arial in thumbnails only), `wasm/quickjs-eval.*` (scripting sandbox, never enabled), `iccs/` (CMYK ICC profile, CC0; pdf.js uses its built-in CMYK conversion).
- Home card copy for PDF 합치기 changed from "…페이지 순서를 바꾸거나 필요 없는 페이지를 빼세요" to "여러 PDF를 한 파일로 묶고, 파일 순서를 원하는 대로 바꾸세요": page-level editing is Step 1b, so the old copy promised a feature that does not exist.
- Merge errors with a file index (corrupt / not-pdf) mark that file in the list; the merge button stays disabled until the file is removed ("문제가 있는 파일을 목록에서 삭제하면 합칠 수 있습니다."). Truncated files are already caught by pdf.js at inspection time.
- Soft-limit confirmation is an inline panel ("계속 합치기" / "취소"), not `window.confirm`.
- `tests/e2e/serve.mjs` gzips text responses like the CDN does, so Lighthouse numbers are comparable to production.
- Playwright `retries: 1`: Playwright's Firefox on Windows occasionally misses the load/DOMContentLoaded event under parallel load while the page is already `readyState === 'complete'` (verified in a probe; serial runs never fail). Retried tests show up as "flaky" in the report; none were flaky in the final 3 full runs.

### Known Gaps (Step 1)
- The `/fonts/*` immutable cache rule now only covers versioned paths; keep it that way when adding fonts.
- Lighthouse locally needs `CHROME_PATH` (no system Chrome on this machine); CI runners have Chrome.
- Keyboard-only e2e runs on the 3 desktop projects; skipped on the 2 mobile projects (touch devices). The mobile soft-limit e2e runs only on the 2 mobile projects.
- Desktop hard/soft limits (500 MB / 200 MB / 1,500쪽) are unit-tested only (no e2e with 200+ MB fixtures).
- Password field uses `autocomplete="off"`; a browser password manager may still offer to save it (browser behaviour).
- Real-phone manual check (gate 11) not done by Bob.

## Step 1 round 2 (Bob, 2026-09-29, after REVIEW-FEEDBACK)
- **Field renaming.** A clashing root field now gets the first free name out of `name_<fileNo>`, then `name_<fileNo>_2`, and so on. A name counts as taken if an earlier file's final names, this file's original names, or names already assigned in this file contain it. Final names are recorded. Unit tests cover `{a, a_2}+{a}`, `{a}+{a}+{a_2}`, and `{a}+{a, a_2}`.
- **Error mapping.** Failures that read or copy the input (load, page tree, copyPages) map to `corrupt`. Any other exception inside a file's merge is `unknown`, with its fileIndex kept.
- **/P stripping.** /P is now also removed from every dict in the AcroForm field tree (`/Fields` → `/Kids`), in addition to page `/Annots`.
- **/DR fonts.** Later files' `/DR /Font` entries missing from the output /DR are added; the first file wins per key.
- **Merge run token.** The controller has a per-run token (`runId`). Cancel and reset invalidate it, so a merge whose file reads finish after a cancel never creates a worker.
- **robots.txt** is generated by `src/pages/robots.txt.ts` from `site` (PUBLIC_SITE_URL). `public/robots.txt` is removed.
- **Mobile FAQ.** It no longer names specific browsers (the Samsung Internet claim was unverified).
- **OFL Reserved Font Name (Arch decision).**
  - The UI subset's name table is rewritten by `scripts/font-rename.mjs`: every record containing "Pretendard" is renamed. Copyright, trademark and license records (IDs 0, 7, 13, 14) are kept. PostScript-style names contain no spaces. Checksums and table layout are rebuilt.
  - Font name: "Anolim UI Sans Variable". CSS family: "Anolim UI Sans". Files: `src/generated/anolim-ui.{woff2,css}`.
  - The build fails if any renamed record still contains the reserved name.
  - The official dynamic subset is now copied byte-identical, CSS included, with family "Pretendard Variable". It is only the fallback: stack `"Anolim UI Sans", "Pretendard Variable", Pretendard, …`.
  - /licenses/ keeps the Pretendard copyright and OFL text and names the modified subset.
  - New dev dependency: `fontverter@2.0.0` (BSD-3-Clause; it was already a transitive dependency of subset-font), used for the sfnt→woff2 conversion.
- **Look is unchanged.** The round-2 landing screenshot is pixel-identical to round 1 (0 differing pixels at 1280 px).

### Known Gaps (added in round 2)
- Outline entries whose action is not GoTo (URI, Named, JavaScript) are dropped; only their children are kept.
- `/DR` merging covers `/Font` only (other resource types come from the first form file).
- Privacy 시행일 is set at the deploy gate (Arch). The 문의처 placeholder stays until the owner answers.
- Gate 11 on the real Cloudflare preview is still owed: real Chrome/Firefox/Edge and a phone, `.mjs` MIME type under nosniff, `_headers` including the :hash noindex rule.

## Step 2 decisions (Arch, 2026-09-29)
- **Owner re-scope:** the opt-in "이미지로 변환" ships in Step 2 (it was out of v1). It sits behind a `details` element with a warning, and its result is discarded when not smaller.
- **Keep-original rule:** a result ≥ 0.99 × the input is not offered (no download). This avoids handing out a decrypted copy for no gain.
- **Runtime result check:** the main thread reopens the output with pdf.js (page count, plus the text of the first, middle and last page on the normal levels). Any mismatch discards the output (`verify`).
- **Signed PDFs:** detected in the engine; the done state warns that the signature is no longer valid. A pre-flight warning is a Known Gap.
- **qpdf glue** is vendored to `public/vendor/qpdf/12.2.0-w0.3.0/` as an ES module shim, not bundled by Vite. The wasm bytes are fetched once per worker, with a fresh module instance per qpdf call.
- **SSIM gate downsample** is a pure-JS 2×2 box average (the spike used canvas smoothing), so the gate is identical in every browser and in Node.
- **Limits:** desktop soft 40 MB / 1,000쪽, hard 100 MB; mobile soft 20 MB / 300쪽, hard 50 MB; raster desktop 200/500쪽, mobile 30/100쪽.
- **Fixtures:** scans are synthesised from kr_law_form (A6 at 300 ppi). `scan_keti_bizreg_bank.pdf` stays local only (it shows a bank account).
- **Step 1 follow-ups folded into Step 2:** the font-rename guard checks every name record plus a raw byte scan; `withFileIndex` is exported and unit-tested for the `unknown` mapping.
- **Deploy:** the orchestrator pushes `main` after Richard clears the step, then runs the live smoke test (standing owner instruction).

## Step 2 build notes (Bob, 2026-09-29)

### Dependencies (exact pins; logged before use)
- Runtime (shipped, compress worker only):
  - `@neslinesli93/qpdf-wasm@0.3.0`: wrapper ISC (no LICENSE file in the repo or package; ISC text committed under `licenses/third-party/qpdf-wasm/`). Bundles qpdf 12.2.0 (Apache-2.0, commit 856d32c = tag v12.2.0), libjpeg-turbo 2.1.1 via the ImageMagick/jpeg-turbo fork 7aa2a89 (IJG AND BSD-3-Clause AND Zlib), zlib 1.2.12 (Zlib). No transitive npm dependencies.
  - `@jsquash/jpeg@1.6.0` (Apache-2.0; MozJPEG codec IJG/BSD-3/zlib, `codec/LICENSE.codec.md`). No transitive npm dependencies.
  - `@jsquash/resize@2.1.1` (Apache-2.0; squoosh_resize codec MIT, `lib/resize/LICENSE.codec.md`). No transitive npm dependencies. Only `lib/resize/pkg` is imported, so the hqx and magic-kernel wasm never reach `dist/`.
- Dev-time only (not new): `@napi-rs/canvas@1.0.9` (MIT) was already installed as pdfjs-dist's optional dependency; `tests/fixtures/build.mjs` uses it to synthesise the scan and photo fixtures.
- `check:licenses` green (23 production packages).

### Decisions
- **qpdf wasm loading (deviation from brief §2).** This qpdf-wasm build is compiled with `INCOMING_MODULE_JS_API=["noInitialRun","noFSInit","locateFile","preRun"]`, so the factory ignores `wasmBinary` (and `instantiateWasm`, `print`, `printErr`). Fetching the bytes once and passing them is not possible without patching the glue. Instead each fresh module instance loads the wasm through `locateFile` from the same versioned, immutable URL (`/vendor/qpdf/12.2.0-w0.3.0/qpdf.wasm`); after the first run it comes from the HTTP cache. The glue text is unmodified apart from the appended `export default Module;`.
- **qpdf logs.** The same build writes through `console.log`/`console.error`, bound when the factory runs. `runQpdf` (src/lib/pdf/compress/qpdf-run.ts) swaps both for a capture function around the synchronous factory call, so log lines go into the per-run array only (never to the console, never posted).
- **wasm-browser.ts** holds every wasm fetch of the worker (jsquash modules compiled once with `compileStreaming`, ArrayBuffer fallback on a wrong MIME type). The resize codec is initialised with a compiled module instead of `initResize(url)`, so its fetch also lives in this file.
- **Engine additions.** `assertPdfHeader` at the engine entry (unit test "not_a_pdf → not-pdf"); qpdf "invalid password" maps to `password` when no password was given, `wrong-password` otherwise; `ownerRestrictionRemoved` = no password given and the input has an `/Encrypt` key (byte scan); qpdf aborts with OOM surface as RangeError (→ `oom`).
- **Cheap checks before the placement parse** run in this order: SMask target, size, /ImageMask, /Decode, /Mask, filter (JPX/CCITT/JBIG2/other), colour space, Flate bpc/predictor. Filter comes before colour space so a JPX image without /ColorSpace counts as `jpx`.
- **Worker `done` for a kept result** posts `bytes: null` (the page already holds the input; nothing to download or transfer).
- **Shared helpers moved (Step 0):** `src/lib/ui/format.ts` (formatMB, formatPages, baseName, safeFileName), `src/lib/ui/device.ts` (MB, Device, detectDevice), `src/lib/ui/font.ts` (loadDynamicFont, used by both tools), `src/data/jsonld.ts` (tool-page JSON-LD for both pages), `scripts/regress/lib.mjs` (openPdf, pageText, renderRgba, unitSize). `inspect.ts` now exports `openPdf` and `renderPageCanvas`, used by the compress result check, previews and raster rendering.
- **`rasterScale` lives in `levels.ts`** (next to RASTER) so the main-thread raster renderer does not pull pdf-lib into the page bundle.
- **Closing "더 줄여야 하나요?" while 이미지로 변환 is selected** switches back to 권장 (announced), so a hidden option is never the active one.
- **Fixture noise:** `seededBytes` uses the high bits of the spike LCG (the low byte has a short period). gen_photo_resume uses ±3 noise to land at 536 KB (≤ 700 KB) with ≥ 80 % reduction on 권장.

### Known Gaps (Step 2)
- `cmyk_jpeg` fixture: the JPEG bytes are RGB with a `/DeviceCMYK` dictionary (the rule only reads the dictionary). A real CMYK JPEG needs an encoder we do not have.
- qpdf-wasm has no WORKERFS/xref recovery in this build (already a Known Gap: self-built qpdf-wasm).
- Signature detection is on the result only (pre-flight is an existing Known Gap).
- Gate 11 (real Chrome/Firefox/Edge, one phone) is Richard's.

### Step 2 status (Bob)
- DONE_WITH_CONCERNS. check 0 errors; unit 92/92; e2e 225 passed / 10 skipped / 0 flaky (5 projects); axe 0 serious/critical; Lighthouse 100/100/100/100 on all three pages (LCP ≤ 1.71 s, CLS 0); licences OK; dist budgets OK; regress:merge unchanged; regress:compress 121/122.
- Blocked for Arch (details in REVIEW-REQUEST): the raster rule "spike raster < 0 % ⇒ kept" fails on kr_gongmun_msit (MozJPEG gray raster is −23 %); the qpdf-wasm ISC copyright line; zlib notice taken from zlib.h.

### Step 2 round 1b (Bob, after Arch decisions)
- Raster regress rows re-baselined to the MozJPEG q70 pipeline (`scripts/regress/compress-raster-baseline.json`). Rule: raster offered only if ≥ 1 % smaller and SSIMmin ≥ baseline − 0.005, otherwise kept; kept/offered must match the baseline. Normal-level thresholds unchanged.
- qpdf-wasm ISC copyright line kept; its source is explained in licenses/third-party/SOURCES.md. zlib notice from zlib.h accepted.
- regress:compress 122/122; unit 92/92. Status DONE.

## Step 3 decisions (Arch, 2026-09-29; staged in handoff/ARCHITECT-BRIEF-STEP3.md, promoted after Step 2 ships)
- **Slug:** `/photo-compress/` stays, because a Korean slug gets percent-encoded in shares. The secondary keywords go in the copy.
- **Target units:** a target in KB is KB × 1000 bytes, which is safe under both conventions. Displayed sizes use 1024 and round up.
- **Pipeline:** EXIF orientation via createImageBitmap, then sRGB, then a canvas probe (q floor 0.50, downscale below it), then lanczos3 plus baseline MozJPEG (canvas fallback, with a note). The result is verified to be ≤ target.
- **Formats:** JPG output by default. A transparent PNG is flattened onto white, with a note. WebP output is opt-in and keeps alpha. AVIF and PNG output are out of scope.
- **Kept or already small:** the input is returned as a lossless metadata-stripped JPEG: APP1, APP13, MPF and COM are dropped along with any trailer after EOI; ICC and Adobe are kept. This applies only when orientation is 1 or absent and the image is not CMYK.
- **Limits:**
  - desktop: 50 files, 100 MB per file, 150 MP hard, 50 MP soft, 32,767 px per side
  - mobile: 20 files, 50 MB per file, 64 MP hard, 16,384 px per side, working long edge 4,096
- **Dependencies:** @jsquash/webp 1.5.0 (Apache-2.0, plus wasm-feature-detect), and fflate 0.8.3 (MIT) made a direct dependency. The jsquash loaders move to src/lib/codecs/ and are shared with Step 2.
- **Regress:** runs in real Chromium through Vite, with spike byte targets, SSIM/PSNR floors, and a blockiness guard comparing naive output against MozJPEG. The absolute blockiness cap will be set after the first run.

### Step 2 round 2 (Bob, Richard's Should Fix)
- Worker checks the raster page count at raster-end; regress judges raster page counts; null openPdf in raster → error; `password` from qpdf shows the password prompt copy; done/kept panels scroll below the sticky header (scroll-margin-top 76 px); qpdf log capture capped at 200 lines with console-restore tests; level-switch e2e is `test.slow()`.
- Gates: check 0 errors; unit 94/94; build/budgets OK; licences OK; compress e2e 33/33 on 3 desktop browsers; regress raster 29/29.
- Known Gap: a real-phone check (Gate 11) is still owed; real Chrome/Edge/Firefox are covered by the orchestrator's post-deploy live smoke.
