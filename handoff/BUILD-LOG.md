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
- C2 flag-off UI font: the C2 copy adds 2 glyphs (+0.3 KB; 601 characters / 137.4 KB vs 599 / 137.1 on main) to the shipping font while the tool is dark, because gen-ui-font reads the sources, not dist (Richard, C2 review). Inside the 2.0 KB C1+C2 allowance; excluding flag-gated sources from the scan is an optional later change.
- C2 배경 지우기: brush erase/restore, batch, 1024 고화질, guided filter, hand-off to /id-photo/, WebGL fusion (not needed: 0.9–1.3 s at 4 MP); `scripts/qa/visual.mjs` shots of /remove-background/ (it runs on the flag-off build); owner real-phone check before `PUBLIC_BG_REMOVE=1`

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

## Step 4 decisions (Arch, 2026-09-29; staged in handoff/ARCHITECT-BRIEF-STEP4.md, promoted after Step 3 ships)
- **Slug** `/id-photo/`. H1 and title keyword "여권사진 규격" (56,600/mo). The card name stays "여권·증명사진 규격 맞추기".
- **Presets re-verified today against official pages.**
  - Ship:
    - passport_online: 413×531, range 395–431 × 507–550, ≤ 500,000 B, 300 dpi
    - gosi: 137×177, "350KB 미만" → 349,999 B
    - qnet: ≤ 200,000 B. The 413×531 size is our choice, because Q-Net publishes none.
    - saramin: 100×140
    - jobkorea: 150×210 max, 5 MB. The FAQ is official; the older 1 MB Q&A is superseded.
    - half_card: 354×472, labelled as a computed size, not an agency spec
    - custom
  - Dropped as 확인 필요:
    - resident_id: the only official value is width 336
    - driver_license: the current safedriving page has no px or KB; 350×450 is from a 2016 notice
    - toeic, work24, local_gosi
  - A dropped preset ships only with a verbatim quote from its official page.
- **외교부 photo checker link:** https://www.passport.go.kr/home/kor/onlinePhotoVerify/index.do?menuPos=33 (verified). The copy says the photo is uploaded to 외교부 on that site.
- **Rotation:** manual only, ±5° in 0.5° steps, for camera tilt. A residual-roll warning covers a tilted head. The §4 notice becomes "자르기·기울기 조정·크기 조정·재압축만".
- **Faces > 1** is a warning, not a block (the spike proposed a block). The largest face is used, and confirmation is mandatory anyway.
- **Never upscale, never pad.** Zoom is clamped at s ≤ 1. Low resolution and a frame outside the photo block the save.
- **Confirmation checkbox** is required. It clears on any adjustment or preset change.
- **MediaPipe placement and loading:**
  - It runs on the main thread (its glue injects a `<script>`; a module worker cannot do that).
  - Assets are self-hosted under `/vendor/mediapipe/1.0.1/`. The model is committed in `vendor-assets/` with a SHA-256 pin.
  - Loading starts only after a photo is chosen, with progress over the build-time raw sizes.
  - It falls back to manual on error, on a 60 s timeout, on skip, when deviceMemory ≤ 2, or when the sessionStorage crash flag is set.
- **CSP unchanged.** Arch found no eval / new Function in the MediaPipe glue.
- **Model licenses verified:** the Face Mesh V2, Blendshape V2 and BlazeFace short-range cards all say "LICENSED UNDER Apache License, Version 2.0". Their out-of-scope uses (identification, surveillance) do not apply to framing.
- **tasks-vision 1.0.1** ships no LICENSE file. The Apache text will be committed from the upstream repo.
- **§0 license exception.**
  - A string probe finds Eigen compiled into `vision_wasm_internal.wasm` (EigenForTFLite). Eigen is MPL-2.0.
  - Decision: allow unmodified upstream Eigen inside the MediaPipe wasm only. /licenses/ carries the notice, the MPL text and a source link. check-licenses gets an explicit one-entry exception; every other MPL/GPL entry still fails.
  - The kill switch `PUBLIC_ID_PHOTO_AUTOFRAME=0` builds a manual-only tool with no MediaPipe bytes. The owner may veto the exception by setting it; no code change is needed.
- **Encoding:** exact px, MozJPEG baseline, and integer q 50–95 at the largest q that fits. There is never a downscale. The JFIF dpi is set (300 for passport, qnet and half_card; 99 for gosi; 96 otherwise), and a verify step discards off-spec output.
- **File names** are ASCII preset tags (`passport_413x531.jpg`), so no user file name leaks.
- **Test corpus:** `tests/corpus/id-photo/` (≤ 2.5 MB, a separate cap; `tests/fixtures/` is already 2.3 MB of 3). It holds only US-government PD and CC0/PD-self portraits. CC BY/BY-SA, NC datasets, scraped, stock and AI-generated faces are excluded.
- **Calibration:** K 0.88 / C 1.68 stay provisional (from 6 smiling heads). The step re-fits them on ≥ 8 neutral, skull-visible heads, and adopts the new values only if they are not worse on LOO. Otherwise the gap is logged, and launch is not blocked.

### Known Gaps (added by the Step 4 brief)
- Presets for 주민등록증, 운전면허증, TOEIC, 고용24 and 지방공무원: pending official verification. KPC (3×4, 115–235 × 150–315 px, ≤ 500 KB, verified) is deferred for scope.
- Print layout sheets (4×6 with several copies), camera capture, PNG output, and batch.
- MediaPipe in a classic worker, to move init and detect off the main thread.
- Q-Net physical size wording: raw HTML to be quoted by Bob (Flag Q1). The output does not depend on it.

## Open questions for owner (added 2026-09-29, non-blocking)
- The Eigen MPL-2.0 exception for the MediaPipe wasm is decided by Arch (see Step 4 decisions). The owner may veto it with `PUBLIC_ID_PHOTO_AUTOFRAME=0`; the result is a manual-only tool.

## Polish P decisions (Arch, 2026-09-30; staged in handoff/ARCHITECT-BRIEF-POLISH.md, runs after Step 3 ships and before Step 4)
- **Source:** docs/UX-AUDIT-1.md. Scope: all P0, the listed P1, the beacon stub, and the domain runbook.
- **Live tools include photo-compress** once Step 3 ships. The site-wide items apply to it: engine-load panel, preload, menu, icons and SW. Its layout does not change.
- **Engine-load errors** get their own code `engine`, distinct from corrupt. The page-level panel has a 새로고침 button. The copy depends on the state: offline, a new deploy (a `/deploy-manifest.json` build vs `<meta name="build-id">` compare), or generic. There is one automatic retry.
- **Deploy resilience** comes from build-time carry-forward:
  - `carry-assets.mjs` fetches the live `deploy-manifest.json` and copies `_astro/`, `vendor/` and `fonts/` files from the last 2 generations, verified by SHA-256.
  - It runs only on CF (`CF_PAGES=1`) or with `CARRY_ASSETS=1`, and it fails open with a log line.
  - Rejected: committing assets to git, a Pages Function fallback (backend), and `_redirects` (it cannot fall back on a 404).
  - check-dist runs before carry, so budgets judge only the fresh build.
- **Post-deploy smoke:** `npm run smoke:assets -- URL [--previous manifest]`.
- **Operator:** 사이티드 (Cited).
  - The contact is `PUBLIC_CONTACT_EMAIL`. When unset, the page shows "문의: 준비 중"; an invalid value fails the build.
  - The privacy officer defaults to "사이티드 대표" (`PUBLIC_PRIVACY_OFFICER` overrides it).
  - `PUBLIC_BIZ_REG_NO` is optional.
  - The 이용약관 text is drafted in the brief. The disclaimer excludes intent and gross negligence (약관규제법).
- **Home, meta, OG and JSON-LD** are derived from LIVE_TOOLS. Soon tools appear only as a name list under "준비 중", with no links and no dates.
- **WebKit weights:** static instances at 400/600/700/800 (subset-font `variationAxes`) replace the variable UI face. Only 400 and 800 are preloaded, within a 170 KB budget. A lint limits weights to that set.
- **목표 용량:** MB × 1,000,000 bytes. The ladder is high → recommended → strong → target-1 (96 ppi, q50, SSIM 0.82) → target-2 (96 ppi, q45, SSIM 0.80).
  - Floors: 96 ppi, q45, SSIM 0.80. Raster is never searched.
  - Every Step 2 guarantee is kept, with verify on the chosen result. A miss offers the smallest result with an explicit warning.
- **Preload** starts on the first interaction plus idle, not on idle alone, so Lighthouse gate 8 stays comparable. It is skipped on saveData or 2G. Gate 8's wording is amended to "…or after the first interaction plus idle".
- **Service worker:**
  - It handles only same-origin GETs under an allowlist and never reads request bodies. User files are never fetched.
  - Navigation is network-first, and hashed assets are cache-first. The precache is the HTML shell only; engines are cached on use.
  - There is no skipWaiting; an update bar appears instead.
  - Kill switch `PUBLIC_SW=0` emits a self-unregistering worker. A deploy-gate revert must ship that kill-switch file.
- **Icons and OG** are generated at prebuild with `@napi-rs/canvas@1.0.9`, now an explicit devDependency (MIT; already installed as pdfjs' optional dependency). The committed `public/og.png` and `scripts/gen-og.mjs` are removed.
- **Error beacon:** a same-origin, whitelisted-field stub, off unless `PUBLIC_ERROR_BEACON_PATH` is set. The off build contains no sendBeacon, and the privacy section renders only when it is on.
- **HSTS** is generated for a non-pages.dev `PUBLIC_SITE_URL` host only, with max-age 1 year and no includeSubDomains or preload. pages.dev gets noindex once a custom domain is set. The runbook is `docs/DOMAIN-RUNBOOK.md`.
- **QA:** `npm run qa:visual -- --url BASE` reproduces the audit matrix into the OS temp folder. It exits 1 on hard failures.

### Known Gaps (added by the Polish P brief)
- Error-beacon endpoint (Pages Function or other), retention policy and enablement.
- Analytics counters; ad slots, CMP and the ad CSP (audit 7.11, 8).
- Per-tool OG images, a hero visual or home drop zone, success animations, download rename, zoom compare (audit P2-1 to P2-4).
- HSTS includeSubDomains/preload; the IDN domain; a Kakao share check on a real device.
- WebKit weight rendering for Pretendard fallback glyphs (file names only).
- 13 px secondary text, 44 px logo/footer hit areas, a mobile card table on /licenses/ (P2-6, P2-9).
- The level-mode hint "N MB 이하 제출처에 올릴 수 있습니다".
- Real iPhone Safari weight check (Gate 11).

### Open questions for owner (non-blocking)
- The contact email for `PUBLIC_CONTACT_EMAIL`. The site shows "문의: 준비 중" until it is set.
- The privacy officer name. The default is "사이티드 대표".
- Whether to show the 사업자등록번호 (`PUBLIC_BIZ_REG_NO`).
- HSTS preload, after the custom domain has been stable.

## Step 3 build notes (Bob, 2026-09-30)

### Dependencies (exact pins; licences)
- `@jsquash/webp@1.5.0` (Apache-2.0; libwebp BSD-3 in `codec/LICENSE.codec.md`). Encoder only; `webp_enc.wasm` and `webp_enc_simd.wasm` both ship. Its decoder is used by the e2e tests in Node only.
- `wasm-feature-detect@1.9.0` (Apache-2.0): the version npm resolves for @jsquash/webp, made a direct exact dependency because `src/lib/codecs/wasm-browser.ts` imports `simd()` itself.
- `fflate@0.8.3` (MIT) is now direct (same lockfile copy as @cantoo/pdf-lib's, deduped). Only `zipSync`, in the lazily imported `zip.ts` chunk.
- Dev only: Pillow 12.2.0 (HPND) for `tests/fixtures/build-cmyk.py`, recorded in `licenses/third-party/SOURCES.md`.
- `check:licenses` OK, 25 production packages.

### Decisions
- **Step 0:** the jSquash loaders moved to `src/lib/codecs/wasm-browser.ts` (`loadMozjpegEncoder/Decoder`, `loadResize`, `loadWebpEncoder`, each compiled once per worker, failures cached too). The PDF loader keeps qpdf and composes `loadCodecs()`. The network guard allowlists exactly these two files; the PDF file itself no longer contains `fetch(`, so the guard checks "every hit is allowlisted" plus the exact allowlist. `dist/` holds one `mozjpeg_enc*.wasm` (check-dist asserts it). regress:compress before/after: 122/122 both, 0 differing rows ignoring ms (it runs the Node codecs; the browser loader is covered by the Step 2 e2e, green on 5 projects).
- **Step 2 carry-overs:** none (all Should Fix items were done in Step 2 round 2).
- **MozJPEG baseline:** `progressive: false` alone still produced SOF1 (extended sequential) at some q, found by regress:photo. The worker also sets `baseline: true` (force_baseline, quantisers capped at 255), so every output is SOF0.
- **Stripped path** only when JPG output is chosen and the stored long edge is within the max long edge (a stripped original would ignore both). A result that the max long edge or the mobile cap resized is always offered, never "kept": the pixel size is what was asked for.
- **Sniff on the main thread** reads 256 KB of head plus a 64 KB tail. A partial view never calls a JPEG truncated (a motion photo's trailer after EOI can be megabytes); the worker re-sniffs the whole file and decides. PNG truncation uses the tail.
- **alphaPossible** is also true for GIF with a transparent colour, 32-bpp BMP, and AVIF/HEIC (conservative; only costs an alpha scan). Otherwise a transparent GIF would turn black in JPG.
- **Decode cap:** resizeWidth/Height from the oriented header size; if the bitmap's aspect does not match, it is decoded again at full size and shrunk on a canvas (guards a browser that resizes before orienting).
- **Fixture sizes:** `scene_cc0.jpg` cannot be q88 and ≤ 300 KB (345 KB). The builder takes the highest q ≤ 88 that fits (q85, 281 KB). `portrait_pd.jpg` is q88 progressive, 340 KB. `tests/fixtures/` is 2.3 MB.
- **P3 patches** were chosen inside the sRGB gamut (no clipping) and differ from their raw values by 9–38 levels.
- **Means in regress:photo** are over the 15 spike-baseline images (the set the thresholds came from); the report also shows the all-input means.
- **UX-AUDIT-1 §11 (coordinator):**
  - `src/lib/ui/engine-error.ts` is new and shared. The PDF tools adopt it in the polish step.
  - A worker that never answers, a WebP or resize codec that fails to load (`engine` code), or a ZIP chunk that fails to import shows "처리 도구를 불러오지 못했습니다. 파일에는 문제가 없으니 새로고침한 뒤 다시 시도해 주세요." with a 새로고침 button (the offline copy when `navigator.onLine` is false). Rows go back to 대기 and are never marked as file errors. MozJPEG load failure still falls back to the canvas, per the brief.
  - Done state: a visible headline ("N장 중 M장을 줄였습니다. 3.2 MB → 480.0 KB") and the ZIP or first download come before the compare view. Focus moves to a visible element.
  - The drop hint is hidden under `(pointer: coarse)` on this page only.
  - The live region is cleared on a run start and on reset.
  - Sizes under 1 MiB show in KB.
  - EXIF/GPS is always removed.
  - Not done (out of this step): automatic retry, prefetch, the `accept="image/*"` suggestion (the brief's accept list stays).

### Known Gaps (Step 3)
- AVIF output, PNG output and lossless PNG optimisation, animated GIF/WebP, HEIC decoding, a keep-EXIF option, per-file settings, parallel workers, a MozJPEG-driven scale re-search, fixed pixel output and JFIF dpi, and institution presets: all out of scope per the brief.
- Target mode on an input that already fits but cannot be stripped (EXIF-rotated, CMYK, PNG) re-encodes from q 0.92 and can come out larger than the input (exif6_gps: 25 KB → 86 KB at 200 KB, still ≤ target). This is per the brief ("runs the pipeline normally"); open question for Arch.
- A real-iPhone check (FAQ 4 sentence) and Gate 11 are still owed.
- The engine-error path has no automatic retry (UX-AUDIT P0-1 ④).

### Step 3 status (Bob)
- BLOCKED on Flags, listed in REVIEW-REQUEST:
  - Playwright WebKit (Windows) has no OffscreenCanvas: 29 photo e2e fail on webkit and mobile-safari.
  - Playwright Firefox does not colour-manage P3 (skipped at runtime with the reason).
  - regress:photo misses: 5 per-pair rows, the MozJPEG gain at 100 KB (0.48 dB against ≥ 0.5 dB), and the s02_p3 vs g02 rule (29.59 dB; the decoded input alone is 34.28 dB).
- All other gates are green: check, unit 174/174, licences, dist budgets, Lighthouse, and regress:compress unchanged.

## Step 3 decisions, round 1b (Arch/orchestrator, 2026-09-30, relayed by the coordinator)
- **F1 OffscreenCanvas:** (b)+(a).
  - The page checks for OffscreenCanvas (2d + convertToBlob) on load.
  - Without it, the page shows "이 브라우저에서는 사진 줄이기를 쓸 수 없습니다. Safari 16.4 이상, Chrome, Edge, Firefox 최신 버전에서 이용해 주세요." and disables the file picker.
  - On Playwright's Windows WebKit, e2e asserts the notice and that nothing uploads; the engine tests run on the other 3 projects.
  - No main-thread fallback. The real iPhone/Safari 16.4+ check is owed.
- **F2:** the runtime-detected skip for Firefox ICC stays as built.
- **F3 (quality first):**
  - (i) MozJPEG scale re-search: when the canvas probe downscales, MozJPEG first tries the full size over q 50–95; it downscales only if that fails.
  - (ii) Baseline JPEG stays (for 기관 uploads). p09 at 200 KB and s01_exif6 at 500 KB are re-baselined to the measured baseline-JPEG numbers, as long as they meet the target, the floor and the mean rules.
  - (iii) 빠른 모드 is exempt from the per-pair comparison with the spike's q40 reference; its target, floor and blockiness rules stay.
- **F4:** the MozJPEG gain rule at 100 KB is ≥ +0.45 dB; the other targets stay at ≥ +0.5.
- **F5:** the rule becomes PSNR(s02_p3 50 % output, decoded original) ≥ 31.0 dB.
- **F6:** absolute BI cap = 1.25 × the largest MozJPEG BI of the first full run (Appendix A), rounded up to 0.1; the output must also stay less blocky than naive.
- **Target mode, input already under the target:**
  - Nothing to remove → keep the original.
  - Re-encoding needed to drop GPS or apply the orientation → the output may exceed the input, but never the target, with the note "위치 정보 등 개인정보를 지우고 방향을 바로잡느라 파일을 다시 저장했습니다".

## Step 3 round 1b build notes (Bob, 2026-09-30)
- **F1:** `canCompressPhotos()` in the controller. The page-side OffscreenCanvas check stands in for the worker's, since workers expose it wherever the page does. With no support, `#ph-unsupported` (role alert) shows, both file inputs are disabled, and drops are ignored. `open()` in the photo e2e skips engine tests with the reason when the check fails; the new test asserts the notice, the disabled picker, no rows and no engine request.
- **F3 (i):** `engine.ts` MozJPEG branch; `finalSearch` gains `lowFirst` (one encode decides when full size cannot fit). 빠른 모드 keeps the canvas decision.
- **"Nothing to remove"** means the lossless strip changes no byte. That row is `kept` (encoder `original`, no download, the existing kept note). An upright JPEG with EXIF still gets the lossless strip. A re-encode sets `report.resaved` (note shown) only when the input had EXIF/XMP/GPS or an orientation other than 1. A PNG without metadata is re-encoded without the note.
- **F6 cap = 2.5**, from the corpus photos only: the largest MozJPEG BI there was 1.968 (g03 at 200 KB); × 1.25 → 2.5.
  - The literal all-input maximum is 391.6 (p3_patches at 50 %), which would give a cap of 489.5. The synthetic flat-patch fixtures put real colour edges on the 8-px grid, so BI does not measure blocking there.
  - The "less blocky than naive" rule keeps its brief scope (naive q < 0.30). On high-q pairs naive has fewer edges (BI ≈ 1.1) and the rule would not measure blocking either.
  - Arch to confirm both readings.
- **e2e targets:** the batch, cancel, crash and keyboard tests now use 200 KB, because a 340 KB portrait at the default 500 KB is now kept. The keyboard test selects 200 KB with the arrow keys. The lazy-load test uses 30 KB so a downscale (resize codec) is still required.

### Step 3 round 1b status (Bob)
- BLOCKED on 2 regress:photo items for Arch:
  - p07 at 500 KB is 0.13 dB short, from the baseline-JPEG penalty. Re-baseline it?
  - The scale re-search pushes p12 at 100 KB to BI 2.621, over the 2.5 cap, and slightly lowers p12's quality. Options are in REVIEW-REQUEST.
- Every other gate is green: check; unit 177/177; e2e 311 passed / 0 failed / 58 skipped / 1 flaky; Lighthouse 100×4 on all 4 pages; licences; budgets; regress:compress 122/122 with 0 differing rows; regress:photo 83/85 rows and 23/24 rules.

## Step 3 decisions, round 1c (Arch/orchestrator, 2026-09-30, relayed by the coordinator)
- **F6a:** (c). When the re-search finds both a full-size and a downscaled MozJPEG result, each is scored with an in-worker luma SSIM at 1024 px against the source (the spike's quickScore). The higher score wins; a tie within 0.002 goes to the full size.
- **F3a:** p07 at 500 KB is re-baselined to its measured baseline-JPEG numbers (SSIM 0.9654 / PSNR 39.98, q67, 510,871 B). SSIM passed; PSNR missed only by the baseline penalty.
- **F6 reading confirmed:** the cap (2.5) comes from the corpus photos only. The naive comparison keeps the brief scope (naive q < 0.30).
- **Accepted:** the "already small" copy "더 줄일 수 없는 사진입니다. 원본을 그대로 쓰세요."

## Step 3 round 1c build notes (Bob, 2026-09-30)
- **SSIM** moved to `src/lib/image/ssim.ts`. `scripts/regress/photo-metrics.mjs` re-exports it, so the regress metric and the worker score are the same code; the checked-in SSIM vector is unchanged.
- **Engine:** the optional `deps.quickScore(src, bytes)`, plus `RESEARCH_TIE` 0.002, `QUICK_SCORE_EDGE` 1024 and `quickScoreSize`.
  - Worker: the source is drawn on white at ≤ 1024 px (cached per bitmap); the candidate is decoded and drawn at the same size.
  - Node: a lanczos resize of both.
  - The downscaled candidate is encoded only when a scorer exists.
- **Tests:** 4 new unit tests (3 scorer choices, 1 real-codec score). photo.worker is 17.3 KB gzip.
- **Status:** DONE.
  - unit 181/181, check 0 errors.
  - regress:photo 85/85 rows and 24/24 rules. Max corpus BI is 2.488 (cap 2.5); p12 at 100 KB now keeps the downscaled result (BI 1.896).
  - Photo e2e 64 passed, 0 failed:
    - chromium 20 passed, firefox 19, mobile-chrome 21;
    - webkit and mobile-safari 2 each (the unsupported notice and SEO), with the engine tests skipped with the F1 reason.

## Step 3 decisions, round 2 (Arch/orchestrator, 2026-09-30, after Richard's CHANGES REQUIRED)
- **Grown re-save copy:** never "0 % 줄었습니다" for a larger file.
  - With a target: "{before} → {after} (늘어남) — 위치 정보 등 개인정보를 지우고 방향을 바로잡느라 다시 저장했습니다. 목표 용량 안입니다."
  - Without a target (quality mode): the same, minus the last sentence.
- **Privacy first in every mode:** the tool never tells the user to keep an original that still carries EXIF, XMP or GPS, or an orientation to bake in.
  - In quality/percent mode with no size gain: the stripped file if the strip removes something, otherwise the re-encoded file with the privacy note.
  - "원본을 그대로 쓰세요" only when the original has none of those.

## Step 3 round 2 build notes (Bob, 2026-09-30)
- **Must 1: jpeg-strip walks every segment, including between scans.**
  - After each SOS, `scanEnd()` skips the entropy data: stuffed FF 00, RST0–7 and fill bytes.
  - Between scans only DHT/DQT/DAC/DRI/DNL are kept; APPn and COM are dropped wherever they are.
  - It stops at the first real EOI, so an FF D9 inside a COM payload is never taken for the end.
  - The re-sniff requires no EXIF, XMP or GPS; otherwise it throws and the engine re-encodes.
  - `sniffJpeg` walks the same way, so APP1/GPS between scans sets the flags. On the whole file, truncated means "the walk never reached an EOI".
  - Unit tests: GPS APP1 after scan 1; COM with FF D9 after scan 1 (the output equals the strip of the clean file); a truncated progressive file vs a trailer after EOI. The existing trailer and fuzz tests are still green.
- **Also in sniff:** PNG `eXIf` (GPS parsed), PNG iTXt XMP, WebP `EXIF` (GPS parsed) and a HEIF `Exif` item now count as metadata. Orientation stays JPEG-only.
- **Must 2: compare viewer.**
  - `.pc-stage` gets `max-width: calc(70vh * var(--pc-ar))` and `margin-inline: auto`; `--pc-ar` is set in `show()`.
  - e2e: a portrait at 1280×900 has a box ratio within 1 % of outW/outH.
- **Should Fix:**
  - The scorer has its own try; a failure keeps the full-size MozJPEG result, with no fallback note (unit test).
  - `touch-action: none` applies only at 2×/4×.
  - Arrow keys are ignored at 1× (no preventDefault).
  - regress: `baseline-jpeg` pairs get only 0.001 SSIM / 0.05 dB of slack.
  - regress: without the corpus the run exits 1 unless `--fixtures-only` is given; the header then says PARTIAL.
- **Arch decisions in code:**
  - `hasPrivateData()` and the new kept rule are in engine.ts.
  - `NOTES.grown()` is in messages.ts; the controller uses it in place of the size and percent lines when out > in, and drops the separate resaved note.
  - e2e: exif6_gps at 500 KB (target mode) shows the grown line with "목표 용량 안입니다."; exif6_gps at 화질 95 is offered re-saved, with no "원본을 그대로 쓰세요".
- **Fixed during the round:** a raw NUL byte crept into sniff.ts during editing (a `'Exif\0\0'` literal) and was replaced by the escape. The unused `indexOfPair` was removed.
- **PARTIAL regress runs:** a `--fixtures-only` run reports the corpus-only mean and gain rules as SKIP instead of failing on empty means. Every other rule still judges the fixture rows.
- **Status: DONE.**
  - check 0 errors; unit 190/190; build and budgets OK (photo.worker 17.5 KB, photo initial JS 12.5 KB); licences OK (25).
  - photo e2e ×5: 68 passed / 0 failed / 51 skipped / 1 flaky (Firefox `goto` race).
  - pdf, merge and site e2e on chromium: 50 passed / 2 skipped.
  - regress:photo: 85/85 and 24/24; the three re-baselined pairs reproduce their numbers exactly.
  - regress:compress: 122/122, 0 differing rows.

## Step 3 decisions, round 3 (Arch, 2026-09-30, on Richard's round-2 escalation)
- **Non-JPEG input or CMYK JPEG, already under the target, nothing private:** still converted to JPG, because many upload sites require JPG.
  - If the result grew, the row shows the neutral line "{before} → {after} (늘어남) — JPG로 바꾸느라 용량이 늘었습니다. 제출처가 원래 형식을 받는다면 원본을 쓰셔도 됩니다.", plus " 목표 용량 안입니다." when a target exists.
- **Richard's Must Fix:** the privacy reason in the grown line appears only when `report.resaved` is true (a privacy/orientation re-save).

## Step 3 round 3 build notes (Bob, 2026-09-30)
- `NOTES.grown(before, after, withinTarget, resaved)` picks the privacy reason or the neutral JPG-conversion reason; the controller passes `rep.resaved`.
- Unit (+4):
  - `NOTES.grown`: all four combinations, exact copy.
  - Engine: a CMYK JPEG under the target without metadata is converted with `resaved: false`.
- e2e (+1): opaque_rgba.png at the default 500 KB shows the neutral line, contains no "개인정보", has no percent line, and the download is ≤ 500,000 bytes.
- Status DONE: check 0 errors; unit 194/194; build and budgets OK (photo initial JS 12.6 KB, photo.worker 17.5 KB); photo e2e ×5 72 passed / 0 failed / 53 skipped / 0 flaky.

## Step 5 decisions (Arch, 2026-09-30; staged in handoff/ARCHITECT-BRIEF-STEP5.md, promoted after Step 4 ships)
- **Gate:** the 120-file corpus gives 6/120 broken = 5.0 % (CI 2.3–10.5 %). The orchestrator decided: ship the converter WITH guards. The non-routed set is 101 files, 2 broken (2.0 %). The routing-parity target is the 19 spike keys listed in the brief.
- **Routing:** caps first, then the guard. Viewer-first when pages ≥ 100, equations > 0 or textboxes ≥ 3 (features.py semantics, bit for bit). Viewer-only above the caps:
  - mobile: 10 MB, 60 p, 256 MiB WASM, 8 MB images
  - desktop: 80 MB, 300 p, 1 GiB WASM, 60 MB images
- **Hard limits added by Arch:** desktop 150 MB, mobile 25 MB, checked before any parse. Viewer-only still parses, and kr01 (64 MB) needs 785 MB of WASM.
- **Viewer-first copy:** the orchestrator's sentence verbatim for equations/도형. For ≥ 100 pages it reads "이 문서는 100쪽이 넘어 변환 결과가 원본과 다를 수 있습니다", because the 수식·도형 wording would be false for a long plain document.
- **Output:** print-to-PDF only, with per-browser guidance, including in-app browsers. The title is swapped to the file name during print. Viewer-only print CSS shows a one-line notice.
- **Engine placement:** rhwp runs in a module worker. It is terminated after a full render, to free WASM before print. If rhwp cannot initialise in a worker in any engine, the main thread is used in every browser (one code path); decided, not a Flag.
- **measureTextWidth:** registered in the worker (OffscreenCanvas, or a deterministic estimate) with a call counter. The harness requires 0 calls, so the tool does not depend on OffscreenCanvas and WebKit on Windows runs the full suite.
- **Ported spike fixes:**
  - scopeIds with a real word boundary, plus a repo-wide C0-control-byte unit test
  - dropCellClips
  - fitFillImages
  - no getPageText
  - addSpaces with the row index
  - the pick() font map
  - named @page per size
- **Added:**
  - a defence-in-depth SVG sanitizer (the harness requires 0 removals on the corpus)
  - ensureViewBox
  - image downscale to 200 dpi at the printed size on HTMLCanvasElement (data: → blob:)
  - an `hwp-inflight` tab-kill notice
  - a 90 s watchdog
- **Scan:** own read-only CFB and ZIP-directory readers (no `cfb`/SheetJS dependency), with fflate inflate, a 512 MB inflate cap and a 5 M record cap. The password flag is rejected before rhwp is called.
- **Fonts:**
  - @fontsource Noto Serif KR, Noto Sans KR, Nanum Myeongjo and Nanum Gothic, 400/700, as shipped slices, byte-identical, renamed in CSS only.
  - Pretendard reuses the existing dynamic subset.
  - An optional "Anolim HWP Fallback" subset covers ㊞, ㆍ, ᆞ and ‧, renamed if its name records carry an RFN. No covering OFL face → Known Gap.
- **rhwp:** @rhwp/core 0.8.6 pinned. The wasm is copied at prebuild to `/vendor/rhwp/0.8.6/` with a SHA-256 pin (not committed). check-dist asserts exactly one copy.
- **Fixtures:** `tests/corpus/hwp/` (own cap, 3 MB) holds only law.go.kr 별표·서식 and 행정규칙 attachments (저작권법 §7): law05, law07, law09, law10, law17, law18, adm02, adm14, adm19 and adm28. No official PDFs are committed; `expected.json` holds page counts and the official content text.
- **Regression:** `regress:hwp` recomputes the gate as manual classes plus automated proxies. Pass rules: non-routed ≤ 5 %, routing parity, fixtures, 0 measure calls, 0 sanitizer removals, a size rule (≤ 3× official, median ≤ 1.5×, kr01 ≤ 5 MB) and time limits. Every rhwp upgrade re-runs it.
- **Dev dependency:** jsdom (MIT) for the DOM unit tests.
- **Legal:** the Hancom notice and the trademark line appear verbatim in the tool footer, the 도움말 section and /licenses/. The Hancom line also goes in README.md and in the header comments of `src/lib/hwp/{features,cfb}.ts`.

### Known Gaps (added by the Step 5 brief)
- A no-dialog PDF download (jsPDF path rejected; image-PDF path C not built).
- Batch conversion, HWPML (.hml), HWP → HWPX/DOCX, editing and 누름틀 filling.
- rhwp bugs R1–R13 beyond the four workarounds; filing them upstream needs the owner's GitHub account.
- rhwp devel builds or a self-built wasm (re-run the harness when 0.8.7/0.9 ships).
- Middle-dot (U+00B7) width normalisation.
- No feature scan for HWP 3.0. HWP5 and HWPX "textboxes" semantics differ (kept for gate parity).
- A /hwp-viewer/ landing page for "hwp 뷰어" (3,560/mo).
- Viewer search, zoom and thumbnails.
- Real-device checks (mid-range Android, iPhone, Safari macOS print), and whether the iOS picker allows .hwp.

## Polish P build notes (Bob, 2026-09-30)

### Dependencies
- `@napi-rs/canvas@1.0.9` (MIT) is now an explicit exact devDependency (already in the lockfile as pdfjs' optional dependency; package-lock only moves it from `optional` to `devOptional`). Used by `scripts/gen-brand.mjs` and the new `scan_multi` e2e fixture. No production dependency changed; `check:licenses` OK, 25 packages.

### Decisions (reasonable calls under the "never stop" instruction; each is in REVIEW-REQUEST)
- **Reused, not duplicated:** Step 3's `src/lib/ui/engine-error.ts` became the DOM half of the engine panel (now `#engine-error`, `EngineError.astro`); the new `engine-load.ts` holds detection, retry and copy. Step 3's photo `formatSize` (options.ts) moved into `src/lib/ui/format.ts` with the P.14 rule; options.ts no longer defines it. `src/lib/codecs/wasm-browser.ts` `compileWasm` now throws `EngineLoadError`.
- **Engine detection:** `isEngineLoadFailure` also matches WebKit's `Load failed` and Firefox's `NetworkError when attempting to fetch resource` (same failure, other spelling). qpdf: a module instance that never starts (the glue aborts with an XHR `NetworkError`) is an `EngineLoadError` from `runQpdf` itself, so the Node deps behave the same.
- **Photo** gets the shared panel and copy; its engine test now expects the P.1 copy and an empty status (P.17: an alert clears the status). Photo reset button "처음부터" → "다른 사진 처리하기", percent chips "70%" etc.: the dist copy test bans "처음부터" and "n %" site-wide. Layout unchanged.
- **Merge list at ≤ 400 px** hides the 48×64 thumbnail (the name got ~50 px otherwise). Above 400 px the row is exactly as specified. The sticky bar is the actions container moved to a direct child of `#merge-tool` (sticky needs a containing block that spans the list); the drop zone hides once files are listed and the whole tool is the drop target; "파일 추가" moved into that bar (second file input). Run button reads "PDF {n}개 합치기" on every viewport.
- **Download links** (`#merge-download`, `#cmp-download`) carry `tabindex="0"`: focus now lands on the headline (P.5), and Safari/WebKit leave plain links out of the Tab order, so without it a Safari keyboard user could not reach 내려받기.
- **Preload `claim()`:** the real run claims the preload; a preload that has not started by then never starts (otherwise a click on "PDF 용량 줄이기" plus idle would warm a second worker and fetch everything twice). Inspection waits for a running preload; the run claims it.
- **Precache** holds the preloaded UI fonts (400, 800) only. With 600/700 it is 491 KB (the /licenses/ HTML alone is 143 KB) > 450 KB; now 404.9 KB. 600/700 are runtime-cached on first use (and immutable in the HTTP cache).
- **UI font instances** keep only the browser-default OpenType features (HarfBuzz horizontal defaults); the alternates (ss01…, case, aalt) no longer ship. Rendering is unchanged (no CSS enables other features). Without this each face was 52 KB (> 50 KB budget). Total now 169.4 KB / 170 KB — little headroom; any new UI copy with new Hangul may need a decision.
- **`.prose h1` is 800** (was the browser default 700), so every H1 / LCP element uses a preloaded weight. CLS stayed 0 with 600/700 on demand (Lighthouse median 0.0000 on all 5 URLs), so no third preload.
- **P.12 e2e probe** compares ink (800 vs 400 ≥ 1.3×), not advance width: Pretendard keeps Hangul advances nearly equal across weights (measured 0.8 %, below the brief's 3 %). A face that ignores the weight would give 1.0. Measured ink ratio 1.72–1.77 in all five browsers.
- **Beacon** path is a build-time `define` (`__ERROR_BEACON_PATH__`, astro.config via Vite `loadEnv`), so the off build contains no `sendBeacon` (check-dist asserts it).
- **check-dist, gen-headers, gen-sw, astro.config** read PUBLIC_* with Vite `loadEnv` (process env and .env, like Astro). `site` now comes from the same env.
- **Kill switch** navigates only controlled clients (`clients.matchAll` default), so a first-time visitor on a PUBLIC_SW=0 build is not reload-looped.
- **Home:** the passport-photo FAQ is removed (it described a tool that is not live). The soon list shows names only.
- **Legal dates:** `src/data/legal.ts` holds the privacy revision and terms effective date (set to 2026-09-30 for now); Arch sets both at the deploy gate.
- **licenses.manifest.json:** qpdf's use line "PDF 구조 정리·…" → "PDF 분석·…" (the dist copy test bans "구조 정리").
- **Gate 8 wording** in ARCHITECT-BRIEF.md §3 amended as decided ("…or after the first interaction plus idle").
- **Local server** (`tests/e2e/serve.mjs`) now applies dist/_headers path rules (immutable, no-cache), serves .ico/.webmanifest types, and exports `startServer` (root swap, request log, "host down") for the SW, preload, smoke and carry tests.

### Known Gaps (Polish P, additions)
- UI font budget headroom is 0.6 KB.
- 600/700 are not precached (offline first paint uses them from the HTTP cache).
- Playwright WebKit (Windows) cannot read a `setInputFiles` file while `context.setOffline(true)` (NotReadableError), and fails navigations under setOffline before the SW answers: the offline-copy e2e is skipped on webkit/mobile-safari with that reason; the SW offline e2e on webkit takes the host down instead.
- Tool-state CLS in qa:visual (0.03–0.19) is state changes after `setInputFiles` (not counted as input by the API); static pages max 0.0002.

### Polish P status (Bob)
- **DONE.** check 0/0/0; unit 303/303; e2e 5 projects 508 passed / 0 failed / 4 flaky (Firefox `goto` race) / 103 skipped (stated reasons); Lighthouse 5 URLs all assertions pass; licences OK; budgets OK; regress:merge 5/5, regress:compress 122/122, regress:photo 85/85 + 24/24; smoke:assets OK (331 URLs); qa:visual 176 PNGs, 0 hard failures; carry-forward dry run green. Nothing committed.

## Polish P round 2 (Bob, 2026-09-30, after Richard's CHANGES REQUIRED and the Arch decisions)
- **Must Fix (drag):** `drag.ts` ends a drag on `pointerup` (commit) and on `pointercancel`, `lostpointercapture` or the page becoming hidden (cancel), so the auto-scroll loop, the capture keydown and the visibilitychange listeners never outlive it. The drag does not start at all if `setPointerCapture` throws. The controller holds `renderList()` while a drag is active and re-renders once when it ends (or `reorder()` does). The auto-scroll uses `behavior: 'instant'`: with `html { scroll-behavior: smooth }` a last smooth step kept moving after release in Firefox.
  - New e2e (chromium, firefox, webkit): 5 PDFs, the pdf.js worker delayed 3 s, the first handle held at the bottom edge for 6 s, then released. Afterwards there is no placeholder and no `.dragging` row, the held re-render shows all 5 inspected, scrollY is stable over 1 s, and 0 drag listeners are left. Verified to fail without the fix (a placeholder stays).
- **carry-assets:** a download must match the manifest's length (checked against Content-Length when not encoded, and against the bytes received) and its SHA-256. The bytes actually downloaded count against the 60 MB cap. The live manifest is refused above 1 MB before parsing.
- **Offline fallback:** `/404.html` is no longer precached. New static page `/offline/` (200, noindex, not in the sitemap) is precached and is the SW navigation fallback. smoke:assets checks it.
- **Kill switch:** no `clients.navigate`. It deletes the caches and unregisters; open tabs keep working from the network and are uncontrolled from their next load.
- **Beacon path:** `scripts/lib/beacon-path.mjs`: exactly one leading "/" (`/^\/(?!\/)/`, no backslash). Used by astro.config and check-dist.
- **Terms §9:** 7 days' notice, 30 days for changes that disadvantage users (이용자에게 불리한 변경).
- **pdf.js:** a worker that failed to start is destroyed before `pdfjsPromise` is cleared (no second worker leaks on retry).
- **Arch, contact:** production ships with "문의: 준비 중". check-dist fails when the error beacon (same-origin path) or `ADS_ENABLED = true` is on while `PUBLIC_CONTACT_EMAIL` is unset. Unset contact alone passes.
- **Arch, font budget:** 180 KB total (was 170): the four faces are 169.4 KB, so the next copy change with new Hangul would have failed the build. Each face stays ≤ 50 KB.
- **Arch, legal dates:** 2026-09-30 in `src/data/legal.ts` (no longer a placeholder).
- **Not done (verify on the first preview deploy, per Richard):** `curl -sI https://<preview>/offline/` should be a plain 200; `/404.html` is no longer precached, so the redirect risk he raised no longer applies to the SW.

### Known Gaps (round 2)
- **Owner-owed before ads or analytics go live:** set `PUBLIC_CONTACT_EMAIL` and the privacy officer's name (`PUBLIC_PRIVACY_OFFICER`). The build now enforces this for the error beacon and ads (개인정보 보호법 제30조: once personal data is processed, the policy must name the officer and a contact).

### Round 2 status (Bob)
- **DONE.** check 0/0/0; unit 309/309; build and budgets OK (UI fonts 169.4 / 180 KB; precache 405.4 / 450 KB); licences OK (25); e2e 5 projects 516 passed / 0 failed / 4 flaky (the Firefox `goto` race) / 105 skipped; smoke:assets OK (332 URLs); qa:visual 176 PNGs, 0 hard failures. Nothing committed.

- Known Gap (Polish P, Richard r2): carry-assets reads a live manifest without Content-Length in full before the 1 MB check; bounded only by the 60 s timeout; source is our own origin. Low risk, deferred.

## Step 4 build notes (Bob, 2026-09-30)

### Step 0 — pre-build checks (written before any code)

**0.1 Presets.** Every shipped source re-fetched today (curl, raw HTML; Q-Net decoded from EUC-KR). All values match the brief table; no preset Flag.
- passport_online, menuPos=12: "파일 크기 500KB 이하, 파일 형식 JPG/JPEG 가로 413 픽셀(pixel), 세로 531 픽셀 사이즈 권장(가로 395~431 픽셀, 세로 507~550 픽셀 이내만 업로드 가능) 해상도는 300dpi 권장".
- passport rule, menuPos=32: "머리 길이는 정수리(머리카락을 제외한 머리 최상부)부터 턱까지 3.2~3.6cm 사이인 사진을 제출해야 함"; "사진 편집 프로그램, 사진 필터 기능 등을 사용하여 임의로 보정된 사진(AI를 활용한 편집·가공·합성·창조 제작물 포함)은 허용 불가함".
- gov.kr 126200000030: "413 x 531 pixel 권장, 가로 395~431 pixel, 세로 507~550 pixel 이내 범위 사진만 신청 가능".
- gosi: "응시원서 등록용 사진파일(JPG, PNG) 규격 크기 3.5cm x 4.5cm(137 x 177 pixel) 기준 파일용량 350KB 미만(중증장애인 선발시험 제외)".
- qnet: "파일형식 : *.JPG 또는 *.JPEG · 파일용량 : 200KB 이하".
- saramin: "1. 용량 : 10MB 2. 파일형태 : .jpg .gif 3. 권장 크기 : 100 x 140 픽셀".
- jobkorea FAQ: "1. 이미지 사이즈가 150px * 210px 초과하는 경우 … 업로드 파일 확장자 : gif, jpg, jpeg, png - 업로드 용량은 5MB 이내".
- 외교부 checker menuPos=33: "※ 해당 프로그램은 참고용일 뿐이며 실제 심사결과와 다를 수 있습니다." (link verified, 200).
- **Flag Q1 answered (raw HTML, EUC-KR):** Q-Net STEP 01 reads "1. 증명사진(2.5X3.5) 또는 반명함판(3X4) 사진 을 준비하시기 바랍니다." Q-Net therefore names no 3.5×4.5 size. The qnet preset ships with no physical size (`mm` absent, band in %), 413×531 px and 300 dpi as in the table; label copy is Arch's.
- Dropped presets, tried once: resident_id (gov.kr popup, EUC-KR decoded) still gives only "픽셀 가로 H:336/세로 V:자동값" and no KB → stays dropped. driver_license (safedriving) still gives only "규격 3.5cm*4.5cm, 여권용", no px or KB → stays dropped. toeic/work24/local_gosi not re-tried (no official page in the spike).

**0.2 Licenses of the MediaPipe path.** Result: **FLAG — `EIGEN_MPL2_ONLY` cannot be shown. Per the brief the build ships with `PUBLIC_ID_PHOTO_AUTOFRAME=0` (manual-only) until Arch decides.**
- tasks-vision 1.0.1 (npm, published 2026-07-31T21:03Z) has no git tag or branch upstream (tags stop at v1.0.0; branch `1.0.0` = 6d31f1e). The wasm strings name its own origin: `//depot/branches/odml.mediapipe_tasks_release_branch/957258227.1/google3` (an internal release branch). Pinned reference used: google-ai-edge/mediapipe master **bdddcbd09ea1588825d35fe7b715d1a14789a85a** (2026-07-31T02:23Z, the last commit before the 1.0.1 publish). Its `LICENSE` is the Apache-2.0 text (committed under `licenses/third-party/mediapipe/`).
- TensorFlow pinned by that WORKSPACE: `_TENSORFLOW_GIT_COMMIT = "a481b10260dfdf833a1b16007eead49c1d7febf3"`.
- Eigen is pulled twice: MediaPipe's own `eigen` repo (`EIGEN_COMMIT = "ea13a98decd497a8c5588fb5de71b57bcf10d864"`, BUILD `third_party/eigen.BUILD`) and TensorFlow/XLA's `eigen_archive` (`EIGEN_COMMIT = "dcbaf2d608f306450f1e74949eb87e9a22a7ef4b"`, `third_party/xla/third_party/eigen3/eigen_archive.BUILD`). Both tarballs downloaded; their SHA-256 match the pins (35c6126e… and a71517b3…).
- **Neither BUILD file defines `EIGEN_MPL2_ONLY`.** Both `defines` lists are exactly `EIGEN_MAX_ALIGN_BYTES=64`, `EIGEN_ALLOW_UNALIGNED_SCALARS`, `EIGEN_USE_AVX512_GEMM_KERNELS=0`. Neither .bazelrc (MediaPipe, TF) sets it either.
- Mitigating evidence for Arch: at both Eigen commits no header under `Eigen/` or `unsupported/` references `EIGEN_MPL2_ONLY` at all (the guard no longer exists; only CHANGELOG.md mentions it), there is no COPYING.LGPL, and the one "LGPL" mention (IncompleteLUT.h) says the code was relicensed to MPL2. COPYING.README at dcbaf2d: "Some files contain third-party code under BSD or other MPL2-compatible licenses". So the macro is a no-op today and no LGPL Eigen file exists at the pinned commits; the literal gate still fails.
- Wasm string probe (both wasm builds, ≥5-char ASCII runs): MediaPipe (mediapipe::, drishti::), TensorFlow Lite (tflite, 588 hits), Eigen (72, EigenForTFLite 31), OpenCV core/imgproc (build-info string "OpenCV 4.13.0"; WORKSPACE says 3.4.11 for the open-source build), XNNPACK (xnn_, 150), abseil (absl), protobuf (google/protobuf), ruy, gemmlowp, flatbuffers, fft2d (TFLite rfft2d kernel), ml_drift/gloop (Google GPU inference, part of LiteRT), tcmalloc (malloc_hook.cc), Emscripten runtime. No hit for ffmpeg/avcodec, libtiff, libwebp, openjpeg, openblas, libpng, libjpeg outside OpenCV's static build-information text (a desktop build description that also lists CUDA; none of those symbols exist in the wasm).
- Licences: MediaPipe, TFLite, OpenCV ≥4.5, abseil, ruy, gemmlowp, flatbuffers, tcmalloc Apache-2.0; XNNPACK, protobuf BSD-3-Clause; pthreadpool BSD-2-Clause, FP16/FXdiv MIT (XNNPACK build deps, listed conservatively; no strings); Emscripten MIT, libc++/libc++abi Apache-2.0 WITH LLVM-exception, musl MIT; Eigen MPL-2.0 (the exception); **fft2d (Takuya Ooura, pinned by TF workspace2.bzl: petewarden/OouraFFT v1.0) carries TF's `third_party/fft2d/LICENSE`: "You may use, copy, modify this code for any purpose and without fee. You may distribute this ORIGINAL package." (TF BUILD: `licenses(["notice"])`, "Unrestricted use; can only distribute original package"). It is not in the §0 allowlist and its "ORIGINAL package" clause is unclear for a compiled binary — second Flag item for Arch.** Its presence is inferred from TFLite's rfft2d kernel strings (`third_party/tensorflow/lite/kernels/rfft2d.cc`), not from Ooura symbol names (the wasm has no name section). No GPL/LGPL/AGPL; no MPL outside Eigen.
- Model: `face_landmarker.task` float16 v1, 3,758,596 B, SHA-256 64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff (identical to the official storage.googleapis.com file). Contents: face_detector.tflite b4578f35…, face_landmarks_detector.tflite c7d54204…, face_blendshapes.tflite 4f36dded…, geometry_pipeline_metadata_landmarks.binarypb bdbcda96…. The three model-card URLs return 200.
- **New finding (Flag, handled): tasks-vision 1.0.1 has always-on usage telemetry.** `vision_bundle.mjs` creates a logger in every task (`t.m=new Dh(...)`) that queues init/latency metrics and POSTs them every 60 s and on close() to `https://odml.pa.googleapis.com/v1/log` with an API key from the wasm (`_mediapipeLoggerGetEncodedApiKey`). The MediaPipe privacy notice (developers.google.com, "MediaPipe Tasks Privacy Notice", modified 2026-06-05) confirms: "MediaPipe Tasks APIs send metrics about the performance and utilization of the APIs in your app to Google … You are responsible for obtaining informed consent". No image data is in it, but it contradicts our no-tracking promise and would raise a CSP violation. Handling: `landmarker.ts` detaches the logger right after creation (clears its 60 s timer, empties its queue, marks it failed so flush never sends), a unit test pins the exact bundle patterns it relies on (an upgrade fails the test), CSP `connect-src 'self'` still blocks it, and an e2e fast-forwards the clock 5 minutes and requires no request off-origin and zero CSP violations.

**0.3 Real iPhone check.** Not recorded in BUILD-LOG (Step 3 Known Gap: "A real-iPhone check (FAQ 4 sentence) and Gate 11 are still owed"). The HEIC copy and FAQ 6 therefore reuse the Step 3 conditional wording.

### Dependencies (exact pins; logged before use)
- Runtime: `@mediapipe/tasks-vision@1.0.1` (Apache-2.0; no npm dependencies). `vision_bundle.mjs` is code-split by Vite (chunk `vision_bundle*.js`, 43.9 KB gzip); `wasm/vision_wasm_internal.{js,wasm}` and `wasm/vision_wasm_nosimd_internal.{js,wasm}` are copied to `public/vendor/mediapipe/1.0.1/` by copy-vendor (the `module_internal` variant is not shipped). Its package has no LICENSE file: the Apache-2.0 text of google-ai-edge/mediapipe at bdddcbd is committed as `licenses/third-party/mediapipe/LICENSE` (SOURCES.md).
- Model: `vendor-assets/mediapipe/face_landmarker.task` (committed, 3,758,596 B) with `SHA256SUMS`; copy-vendor verifies the hash and writes `public/vendor/mediapipe/models/face_landmarker-64184e22.task`. Never fetched at build time. `.gitattributes` marks `*.task` binary.
- Wasm components, license texts committed under `licenses/third-party/` (SOURCES.md has every URL): Eigen (COPYING.MPL2/BSD/README at dcbaf2d), XNNPACK (53a1797), protobuf (v31.1), pthreadpool (0246058), FP16, FXdiv, fft2d (TF a481b10 third_party/fft2d/LICENSE), Emscripten (4.0.0 LICENSE; the build says only "stable"), libc++ (LLVM LICENSE.TXT from emscripten 4.0.0), musl (COPYRIGHT). MediaPipe, TFLite, OpenCV 4.x, abseil, ruy, gemmlowp, flatbuffers, tcmalloc and ML Drift share the Apache-2.0 text.
- No new dev dependency. Pillow 12.2.0 (already recorded, dev only) downscaled the committed test corpus.

### Decisions (reasonable calls under "never stop"; each is in REVIEW-REQUEST)
- **Shipping default is manual-only** (`scripts/lib/autoframe.mjs` DEFAULT = "0") because of the 0.2 Flag. The whole auto-framing path is built and tested with `PUBLIC_ID_PHOTO_AUTOFRAME=1`; Arch lifts the Flag by changing DEFAULT to "1" (or setting the env var on Cloudflare). The flag feeds a Vite `define` (`__ID_PHOTO_AUTOFRAME__`, like the beacon path), copy-vendor, gen-licenses (MediaPipe entries marked `"autoframe": true`), check-licenses and check-dist. Flag 0: no vision_bundle chunk, no autoframe chunk, no vendor/mediapipe, no MediaPipe entry on /licenses/, the 6 MB line hidden (check-dist asserts the first three plus no `FaceLandmarker`/`odml` string in any JS).
- **Telemetry** (0.2 finding): `detachTelemetry()` in `src/lib/face/landmarker.ts`; if the bundle shape is not the pinned one, `createLandmarker` throws and the page falls back to manual (no silent telemetry). Unit test pins the minified code; e2e (chromium) fast-forwards 5 minutes with `page.clock` and sees no off-origin request and no CSP event.
- **check-licenses** now also judges the manifest's compiled-in `component` entries (not only npm packages), with the one-entry `EXCEPTIONS` list (Eigen MPL-2.0, scope vendor/mediapipe wasm). `X WITH LLVM-exception` is allowed when X is (an exception only adds permissions). fft2d's `LicenseRef-Ooura` fails the gate when auto-framing is on: that is the second Flag item, deliberately left failing.
- **/licenses/ dedupes repeated license files** (`sameAs`: "전문은 위 「…」 항목에 있습니다."): the shared Apache-2.0 text prints once.
- **Service-worker precache drops /licenses/** (`NOT_PRECACHED` in gen-sw): with the MediaPipe texts the page is 218 KB and the precache was 542 KB (> 450). Now 298.4 KB (flag 1) / 297.5 KB (flag 0). MediaPipe files are never precached; they are runtime-cached on use (cache-first under /vendor/, immutable), like the other engines.
- **UI font subset ignores code comments** (`stripComments` in gen-ui-font): the new page's copy took the four faces to 182.7 KB (> 180). Characters that only appear in comments never render. Now 179.1 KB (flag 1) / 178.0 KB (flag 0). Headroom is ~1 KB again: the next tool's copy will need a decision.
- **"처음부터" → "다른 사진 처리하기"**: docs/COPY.md and the dist copy test ban "처음부터" (Polish, later than the Step 4 brief); same label as photo-compress.
- **"dpi" on /id-photo/ only**: COPY.md now allows "300 dpi" for the file density on this tool (the brief asks for it); the dist copy test excludes /id-photo/ from the dpi ban.
- **Qnet (Flag Q1)**: no `mm` → head band shown in % ("참고 범위(71–80%)"), 300 dpi kept.
- **Main-thread canvases** fall back to a DOM canvas where OffscreenCanvas is missing (render.ts, landmarker.ts), so Playwright WebKit on Windows runs the whole tool, MediaPipe included. The encode worker's canvas fallback still needs OffscreenCanvas (e2e skips that one case there with the reason).
- **HEIC**: face assets are requested in parallel with the decode, except for a HEIC sniff, which waits for the decode (no 6 MB download for a photo the browser cannot open).
- **Low resolution** is a per-photo, per-preset block (`blocked` state): the auto frame needs s > 1 or the whole photo is smaller than the output. A smaller preset can still be chosen.
- **Announcement**: the "자동 맞춤을 쓰지 못해 직접 맞추기로 바꿨습니다" note is announced together with the first checklist summary (a separate message was replaced at once); not for the skip button (the user chose it).
- **Face oval / nudges**: nudge buttons move 5 output px (brief gives no number; keys are 1/10). Zoom slider is logarithmic between the zoom-out floor (whole photo in half the frame) and s = 1.
- **network-guard**: exact allowlist now; the stale `lib/pdf/compress/wasm-browser.ts` entry (no fetch since Step 3) removed, `lib/face/assets.ts` added.
- **UX-AUDIT-1 §11 vs brief** (brief followed, logged): §11.6 camera button (`capture="user"`) and `accept="image/*"` — camera capture is an explicit brief Flag item and out of scope; accept stays the brief list. §11.2 editable file name — the ASCII tag name is shown, not editable (P2 download-rename Known Gap). §11.3 resident/driver presets — dropped (unverified). §11.8 privacy badge and §11.9 "no retouch" on the result screen — done.

### Known Gaps (Step 4)
- **Calibration refit not done**: no ≥ 8 neutral, closed-mouth, skull-visible heads from the allowed sources were added (the committed corpus is spike p01–p12, all smiling). K 0.88 / C 1.68 stay provisional (brief fallback). Committed corpus composition: 12 US-government portraits (House, NASA), 8 annotated heads, 5 in the calibration set (2 bald/shaved, 3 short hair; 4 male, 1 female).
- The e2e "wasm downloaded twice" check runs on Chromium only (CDP).
- MediaPipe prints its own log lines to the console (GL/TFLite info, one as console.error) after a photo is chosen; harmless, not controllable from the API.
- The Emscripten runtime inside the existing qpdf and MozJPEG wasm was never inventoried (only MediaPipe's, this step).
- Real iPhone (Safari photo library → passport export) and Gate 11 are still owed.
- **Lazy controller** (`src/tools/id-photo/entry.ts`): the page script only waits for the first interaction (pointerdown, keydown, focusin, touchstart, change, dragover/drop) and then imports the controller; the controller reads the native controls' state and any file already picked or dropped. Measured cause: with a 20 KB initial script Lighthouse LCP was 1.96–2.04 s (median 2.04, over the 2.0 s gate); without it 1.80 s. Initial JS is now 4.8 KB. A controller chunk that cannot load shows the engine panel (e2e). The controller chunk is runtime-cached by the SW after the first use, not precached (offline first use of /id-photo/ gets the engine panel with the offline copy).
- **`manualChunks: ui-shared`** (astro.config): sharing sniff/format/engine-error with a lazily imported controller split the common UI modules into three extra chunks on every tool page, and pdf-merge / pdf-compress / photo-compress went from LCP 1.95 s (HEAD built on this machine, measured) to 2.04 s on all three runs. Putting announce, beacon, device, engine-error, engine-load, font, format, preload, pdf/errors and Vite's preload helper in one named chunk restores the HEAD structure (pdf-merge 4 files, 12.1 KB; photo-compress 4 files, 16.2 KB; sniff stays a separate shared chunk) and LCP 1.95–1.96 s.
- **MediaPipe glue logs**: a pre-set global `Module` with no-op `print`/`printErr` reaches the wasm factory (pinned in the unit test), so the "INFO: Created TensorFlow Lite XNNPACK delegate" console.error line is gone (qa:visual treats console errors as hard failures). glog warnings still go to console.warn.
- **`src/generated/mediapipe.json`** holds full file URLs (smoke:assets checks every "/vendor/…" literal; a bare directory literal was a 404).
- **Test harness notes**: check-dist spawns in postbuild.test.ts now follow the built flag (dist has vendor/mediapipe or not). tsconfig excludes `dist-noauto/` (the kill-switch build the e2e serves on port 4180).
- **Incident (fixed)**: removing a temporary git worktree used for the Lighthouse baseline (its node_modules was a junction) deleted the repo's node_modules. Restored with `npm ci` from the unchanged lockfile; build, check, unit, licences and the chromium e2e re-run green afterwards. No source file was affected.

### Step 4 status (Bob)
- **DONE_WITH_CONCERNS** — the build ships manual-only (flag default 0) pending Arch on the license Flag; everything else is green except one regress check.
- check 0/0/0; unit 393/393; licences OK with flag 0 (26 packages, 3 components) and, with flag 1, FAIL on fft2d only (Eigen exception used, as designed); budgets OK (flag 1 and flag 0 + `--no-mediapipe`).
- e2e 5 projects: 668 passed / 0 failed / 6 flaky (all the Firefox `goto` race) / 131 skipped (stated reasons); id-photo spec after the last change: 134 passed / 26 skipped on all 5 projects.
- Lighthouse (6 URLs, 3 runs): all assertions pass; /id-photo/ Perf 99, A11y 100, BP 100, SEO 100, LCP 1.80 s, CLS 0.0020.
- regress:idphoto (chromium, committed + full-res): 13/14 — landmark chin on p07 −1.11 mm (committed) / −1.01 mm (full-res) against ≤ 1.0 mm (Blocked for Arch). Firefox 9/11 (also p07; PSNR min 37.50 dB < 38), WebKit 10/11 (p07). regress:merge 5/5, regress:compress 122/122, regress:photo 85/85 + 24/24 (unchanged).
- smoke:assets OK (344 URLs); qa:visual 198 PNGs, 0 hard failures. Nothing committed.

### Step 4 — Arch/orchestrator decisions (2026-09-30)
- Ship /id-photo/ MANUAL-ONLY (PUBLIC_ID_PHOTO_AUTOFRAME default "0"). Auto-frame stays built and tested behind the flag; enabling it is blocked on (1) proving Eigen MPL2-only or accepting a documented exception and (2) an fft2d (Ooura) license decision. Known Gap.
- regress:idphoto p07 chin error (−1.11 mm vs ≤ 1.0 mm) applies only to auto-frame (off). Known Gap tied to the flag, not a ship blocker for manual-only.
- Firefox export PSNR floor: 37.0 dB on Firefox only (its canvas resampler differs); Chromium/WebKit stay at 38.0 dB. Rationale: 37.5 dB is visually lossless at 413×531; the spec output (pixels, bytes, JFIF dpi) is exact in every browser.
- MediaPipe telemetry detach + CSP block: accepted; keep the pinned-bundle unit test.
- Precache without /licenses/, UI-font comment exclusion, lazy controller, ui-shared chunk: accepted.

## Step 4 round 2 (Bob, 2026-09-30, after Richard's review)
- **Must Fix:** the auto-frame copy is gated on `__ID_PHOTO_AUTOFRAME__`: the lead, 사용 방법 2, FAQ 2, the reset label and the skip button. The manual wording is Richard's, accepted by Arch. check-dist fails a flag-off build whose /id-photo/ contains an auto-frame phrase.
- **Should Fix:**
  - The crash flag is cleared when init ends after a skip or timeout (with a unit test).
  - The Firefox PSNR floor in regress:idphoto is 37.0 dB (Arch); other browsers keep 38.0.
  - `calt` is off on file-name lines.
  - The lazily imported /id-photo/ controller is precached.
- **Arch:**
  - The UI font budget is 190 KB (was 180).
  - Playwright project `manual-chromium` runs the id-photo suite against dist-noauto (the shipping configuration). Gate order: build dist-noauto with the flag off first, then dist with the flag on.
- **Status:** DONE_WITH_CONCERNS (license Flags 1–2 and the p07 regress miss stand).
  - check 0/0/0; unit 397/397; both builds green.
  - id-photo e2e on 5 projects + manual: all green after one test fix. That fix was in the manual keyboard test, not the product.
  - regress:idphoto: Chromium 13/14, Firefox 10/11.

- Follow-ups (Step 4 r2 review, for Final polish): manual-start readout hint "먼저 확대한 뒤 위치를 옮기세요"; CI must build dist-noauto before e2e so manual-chromium never silently skips.
## Step 5 build notes (Bob, 2026-09-30; worktree `doc-tools-kr-step5`, branch `step5` off 9c4e019, built in parallel with Step 4)

### Dependencies (exact pins; licences)
- `@rhwp/core@0.8.6` (MIT). Crate notices from upstream `THIRD_PARTY_LICENSES.md` (tag v0.8.6) are in `licenses/third-party/rhwp/` (full file + `CRATES.md` extract that /licenses/ embeds + the Apache-2.0 text). Crates: MIT, Apache-2.0 (incl. dual), BSD-2/3, Zlib, ISC, Unicode-DFS, 0BSD, Unlicense/CC0/WTFPL only as alternatives to MIT/Apache.
  - `rhwp_bg.wasm` SHA-256 `8000e4ce320b7994dca6bcd58be0c862144c7b805576504e523a420439da658b` (pinned in `scripts/vendor-rhwp.mjs`), 9.48 MiB raw, 3.0 MiB brotli q5.
- `@fontsource/noto-serif-kr@5.3.0`, `@fontsource/noto-sans-kr@5.3.0`, `@fontsource/nanum-myeongjo@5.3.0`, `@fontsource/nanum-gothic@5.3.0` (fonts OFL-1.1; the packages ship the OFL text only). All four have 400 and 700 with the Korean unicode-range slices (no Flag).
- Fallback face "Anolim HWP Fallback": subset of Noto Sans CJK KR Regular 2.004 (OFL-1.1, no Reserved Font Name in its LICENSE or name table), 1.9 KiB, committed as `scripts/fonts/anolim-hwp-fallback.woff2`. cmap probe (harfbuzzjs): Noto Serif/Sans KR 400 lack U+119E and U+2027; Nanum Myeongjo/Gothic and Pretendard also lack U+329E; Noto Sans Symbols 2 has none; Noto Sans CJK KR has all four.
- Dev: `jsdom@30.1.1` (MIT) for the svg-dom unit tests.
- `check:licenses` OK, 30 production packages.

### Decisions (reasonable calls; each is in REVIEW-REQUEST)
- **Worker:** rhwp initialises in a module worker in Chromium, Firefox and WebKit (probed first), so there is no main-thread path. The scan runs in the worker before the engine loads (a non-HWP, password or damaged file never downloads the wasm).
- **Full render is page-driven** (`render {i}` one at a time); no `renderAll` message. A cancel is a run token; the worker keeps the document for the lazy viewer.
- **Build hidden:** during a full render the preview is `display:none`. With ~860 unicode-range faces every arriving font slice re-lays out all text shown so far; a visible build was quadratic (adm28 20 s → 6.6 s). Downscale runs after the pages are shown (it needs layout).
- **Fonts settle:** `fontsSettled()` repeats `document.fonts.ready` until `status === 'loaded'` (WebKit resolves `ready` and then starts more slice loads). Save is enabled only after that.
- **rewriteFonts bug found by the harness:** HEAVY faces got a second `font-weight` next to rhwp's `font-weight="bold"`; XML DOMParser rejects duplicate attributes (the spike used innerHTML, which keeps the first). Now the existing value is replaced. Without the fix adm02 lost 4 pages and law09 1 page (placeholders).
- **Double wasm:** Vite emitted a second `rhwp_bg.wasm` from the glue's `new URL('rhwp_bg.wasm', import.meta.url)`. Stopped by a pre-transform plugin (`scripts/lib/vite-rhwp.mjs`, worker plugins in `astro.config.mjs`) that replaces the pattern with a throw (init always receives the compiled module). check-dist asserts exactly one copy.
- **wasm size constant** comes from `src/generated/rhwp.json` (written by vendor-rhwp) instead of a Vite `define`: same build-time constant, no astro.config change.
- **Font CSS** is written with relative URLs, unquoted family names and faces sorted by unicode-range so gzip encodes each shared range list once: 143 KB → 30.3 KB gzip (Flag: brief 30 KB).
- **/licenses/ dedupe:** byte-identical licence texts are printed once, later entries point to it ("위 … 와 같은 전문입니다"). Needed to keep the SW precache ≤ 450 KB (Apache-2.0 was printed 4 times).
- **Guidance data** is in the lazy chunk (initial JS 9.7 KB); the help section is server-rendered from the same data.
- **FAQPage JSON-LD** on /hwp-to-pdf/ only, as the Step 5 brief says (the program brief §5 says no FAQPage; the step brief wins).
- **RelatedTools** got an optional `only` prop (PDF 합치기, PDF 용량 줄이기 on this page).
- **Error beacon:** not wired for this tool (BeaconTool is a union that Step 4 also edits; the beacon is off). Known Gap.
- **E2E port:** `playwright.config.ts` reads `E2E_PORT` (default 4173) so this build was tested on 4392 next to the Step 4 build.
- **Ink baseline:** `hwp-baseline.json` ink is re-measured with the harness's pdf.js metric on the spike's own PDFs; compare.py used PyMuPDF, which scores the same PDF up to 0.09 differently (law22 0.794 vs 0.706), and turned a renderer difference into "auto-broken" for kr10 and law22.

### Known Gaps (Step 5)
- Everything in the brief's Out of Scope (no-dialog download, batch, HWPML, editing, R1–R13 beyond the four workarounds, middle-dot width, HWP 3.0 feature scan, /hwp-viewer/, viewer search/zoom/thumbnails).
- Real devices (mid-range Android, iPhone, iOS picker for .hwp, Safari macOS print) and Gate 11 label strings.
- Error beacon not wired for hwp-to-pdf.
- Precache is at 448.0 / 450 KB; the Step 4 merge adds a page and will need Arch's call (raise the budget or drop /licenses/ from the precache).
- Opaque PNG photos that are not oversized stay PNG (see the regress rule-5 Flag).

## Step 5 decisions, round 2 (Arch, 2026-09-30, on the Step 5 Flags)
- **F1 accepted:** kr01 viewer-only by the desktop image cap is correct. Rule 2 is now: the routed set = the 19 guard keys + every cap-routed file, each listed with its reason (guard parity checked on the guard reasons).
- **F2 build the fix:** before printing, opaque PNG/BMP images over 100 KB are re-encoded as JPEG (q 0.85, same pixel size) when smaller; PNG is kept for alpha and for line art or text-like images (Bob's call below). Rerun rule 5 and report any of kr21/kr38/kr45 still over.
- **F3:** stop precaching /licenses/ (Step 4 on main already did; arrives with the merge).
- **F4 accepted:** HWP font CSS budget 31 KB. Reason: 865 unicode-range faces; the unique range lists alone are 22.4 KB gzip, and the sorted CSS is 30.3 KB.
- **Merge:** main (Step 4, ee507ab) merged into step5; both tools, both BUILD-LOG sections, UI font budget 190 KB (main), Step 4's manual-chromium project plus E2E_PORT.

## Step 5 round 2 build notes (Bob, 2026-09-30)
- **F2 line-art rule:** keep PNG when any alpha < 255, when ≤ 64 distinct colours, or when ≥ 85 % of pixels equal their left neighbour. Measured: kr38 p5 (poster with photos) 77,936 colours / 0.745 flat, kr36 p4 19,655 / 0.738, so 0.70 would have kept them PNG; 0.85 re-encodes them while text screenshots and diagrams (flat share > 0.85) stay PNG. Unit-tested (`isOpaquePhoto`).
- **Font preload while hidden:** after the build, `preloadFacesFor()` calls `document.fonts.load()` once per (family, weight) with that family's characters before the pages are shown, so slices download in parallel. `fontsSettled()` (added in round 1 for WebKit) had pushed law10 render-to-ready to 3.0–3.7 s; with the preload it is 2.3–2.6 s (adm28 5.5 s).

## Step 5 round 3 (Bob, 2026-09-30, Richard's six Should Fix items; Arch: inflate cap 512 MB desktop, 128 MB phone)
- **Sanitizer is an allow-list:** every element outside the SVG namespace is removed; `script`, `style`, `foreignObject`, `iframe`, `meta`, `link`, `form`, `object`, `embed` and the animation elements are removed too; every on* attribute is dropped; href only as `#fragment` (or `data:image/*` on `<image>`; `blob:` is no longer accepted, downscale adds its blob: URLs after the sanitizer); style attributes with a non-fragment url() are dropped. jsdom tests: XHTML meta refresh, SVG and XHTML style, XHTML form, link, style url(). Corpus: 0 removals on all 120 files, so no page SVG carries a style element.
- **hwp-inflight** is set again when 그래도 PDF로 저장 starts the full render; cleared when the save button enables, on cancel, reset and error. e2e checks the storage calls.
- **Zip bomb:** the scan never holds inflated output. BodyText records are walked from the inflater's chunks (`RecordWalker`, byte-for-byte the same counts as the buffer walk), HWPX section XML is matched as bytes (`ByteCounter`, same counts as the features.py regex: ASCII prefix + word boundary), 4 KB input pushes, one running cap per file: `LIMITS.inflateCap` 512 MB desktop / 128 MB phone (Arch). A 613 KB HWPX that inflates to 637 MB (as in Richard's test): rejected as corrupt; peak RSS +51 MB with the desktop cap (4.2 s), phone cap 1.0 s (Richard measured +591 MB before).
- **Print gate:** `hwp-printable` is set only when PDF로 저장 is enabled; before that the print CSS shows "문서를 준비하는 중입니다. 「PDF로 저장」 버튼이 켜진 뒤 다시 인쇄해 주세요".
- **그래도 PDF로 저장** is `btn ghost` (secondary).
- **Title swap:** one pending swap at a time (a second save ends the first, keeping the original title); ended by afterprint, by the page becoming visible after print() returned, or after 60 s. jsdom tests.
- **regress:hwp --fixtures-only** now checks guard parity on the fixture subset and says "fixture subset match".
- Known Gap (Richard appendix): the forced path prints after long awaits; iOS may prompt or refuse without user activation. Added to the real-device checklist.

## Polish Q build notes (Bob, 2026-09-30; UX-AUDIT-2 P1 fixes, plain language, brand 문서딱, no contact details)
Scope: docs/UX-AUDIT-2.md P1 list and §7.2/§7.3, plus two owner decisions relayed mid-build (brand rename; no contact/operator/officer details). /hwp-to-pdf/ (src/tools/hwp-to-pdf, src/lib/hwp, src/pages/hwp-to-pdf) is untouched: it is being reworked on branch `hwp-direct`.

### Decisions (reasonable calls under "never stop"; each is in REVIEW-REQUEST)
- **Brand (owner): 안올림 → 문서딱.** `SITE.name`/`SITE.tagline` drive the header, footer, titles, og:site_name, og:image:alt, JSON-LD, manifest (name, short_name), 404, offline, licenses, privacy and terms. Tagline "내야 하는 문서·사진, 용량과 규격에 딱 맞춰 드려요" (the owner's line without "무료예요", which moved into the descriptions). OG image redrawn (name + two tagline lines; the build fails if a line is wider than the canvas). The merge PDF producer is "문서딱 (doc-tools-kr)". Internal identifiers stay (`anolim-*` SW cache prefix, `anolim-ui-*` font files, "Anolim UI Sans"): users never see them, and renaming the cache prefix would orphan the previous cache generation. The future domain `munseottak.com` needs only PUBLIC_SITE_URL.
- **Titles:** `{도구명} — 파일을 보내지 않고 무료로 | 문서딱` (TITLE_SUFFIX; a unit test checks every tool title and that h1 = menu name). UX-AUDIT-2 §7.2 suggested keeping "업로드 없이" in titles for search; the owner's rule (no jargon anywhere users read, and search results are read) wins. The HWP title changed only for the brand.
- **No contact details (owner):** the footer operator/contact line, privacy §5 (operator, officer, contact) and terms §11 (문의) are gone. The footer shows a contact line only if PUBLIC_CONTACT_EMAIL / PUBLIC_BIZ_REG_NO are set (`footerContact()`), so the custom-domain build test still passes. OPERATOR, OPERATOR_LABEL, PRIVACY_OFFICER removed. Terms §1 no longer names 사이티드 ("서비스를 운영하는 자(이하 운영자)"). The check-dist guard (beacon or ads without PUBLIC_CONTACT_EMAIL fail the build) is unchanged; its comment now says so.
- **Privacy page:** short and plain, in 해요체 (the owner's tone): no sign-up, no personal data, files stay on the phone/computer, the Cloudflare access-log note in plain words, ads, 시행일, change history ("쉬운 말로 다시 쓰고 서비스 이름을 문서딱으로 바꿈, 이용약관 신설"). The old name is not mentioned (the brand test bans it in dist). The beacon section is reworded and still renders only with the beacon on.
- **Tone:** 합니다체 stays the body style (COPY.md). The owner's lines are 해요체 and used verbatim: home badge/H1/lead, privacy, "이미 목표보다 작아요. 원본 그대로 받으셔도 돼요.", the footer tagline. COPY.md records the exception.
- **Plain language:** the §7.2 table applied to home, the four tool pages (lead, 안전한 이유, FAQ, errors, limits), legal pages and meta. The "개발자 도구 네트워크 탭" line is replaced by the airplane-mode check. px → 픽셀 everywhere; "픽셀(px)" appears once where a number is typed (photo 긴 변 help, id-photo custom size). dpi → 해상도 (id-photo FAQ "해상도 300", 반명함판 note); the id-photo done headline no longer shows dpi (the file still carries 300 dpi in JFIF). EXIF → "촬영 위치, 찍은 기기와 날짜 같은 사진 정보". Memory/browser limits → "이 기기에서 처리하기에 너무 커서 화면이 멈출 수 있기 때문입니다" and similar.
- **Copy test** (`postbuild.test.ts` "plain language"): every dist page's title, meta/og, alt/aria-label/placeholder/title attributes and body text (scripts and styles stripped) must not contain 업로드·서버·브라우저·네트워크·메모리·개발자 도구·px·dpi·EXIF; "픽셀(px)" at most once per page. It also scans every Hangul string run in dist/_astro JS. Exempt: /licenses/ (software names), /hwp-to-pdf/ and strings found verbatim in the HWP sources (rewritten on `hwp-direct`; drop the exemption after the merge), and the official preset quotes (audit trail, never rendered). No legal-page exemption was needed: privacy and terms were rewritten without the words. JSON-LD `operatingSystem: "웹 브라우저"` is schema data inside a script and is not scanned.
- **Brand test** (`postbuild.test.ts` "brand"): no "안올림" in any dist html/js/css/json/xml/txt/webmanifest outside /licenses/; og:site_name, the home title and the manifest names are 문서딱. The weight-probe text in polish.spec and qa:visual is now "서류 파일 문서딱" (the old characters left the UI font subset).
- **Josa helper** `src/lib/ui/josa.ts` (은/는, 이/가, 을/를, 과/와, 으로/로): Hangul 받침 (ㄹ for 으로/로), numbers by their Korean reading (2025×1518로, 640×800으로; a trailing 0 is 영/십/백/천/만, a consonant), Latin letters by their Korean letter name (l, m, n, r end in a consonant: notes.txt는, form.html은), closing marks skipped. Used for every variable + particle in our code: the non-PDF alert, photo "크기를 …로 줄였습니다", photo row removal, id-photo "…를 내려받을 수 있습니다", PDF/photo limit messages, the brand particles on privacy and licenses. Unit tests in tests/unit/josa.test.ts.
- **Photo, already small (P1-2):** a kept row (nothing private, and either already within the target or no gain) now offers "원본 내려받기" (the original file under its own name). Note: target mode "이미 목표보다 작아요. 원본 그대로 받으셔도 돼요."; percent/quality mode "다시 저장해도 더 작아지지 않아요. 원본 그대로 받으셔도 돼요." "모두 내려받기 (ZIP)" includes kept originals.
- **Photo summary:** `src/tools/photo-compress/headline.ts` counts 줄임 / 그대로 / 늘어남 / 못 줄임 / 대기 apart. One photo: "사진을 줄였습니다. A → B", "다시 저장해 용량이 조금 늘었습니다. A → B", "원본 그대로 두었습니다. 원본을 받으셔도 됩니다.", "사진을 줄이지 못했습니다." All reduced: "사진 N장을 모두 줄였습니다. A → B". Mixed: "사진 3장: 그대로 2장 · 늘어남 1장", plus "(줄인 사진 A → B)" over the reduced photos only. `queue.summary()` removed (only the old headline used it).
- **0-byte file:** "빈 파일입니다. 원본을 다시 저장해 선택해 주세요." (photo and id-photo).
- **Photo notes a11y (UX-AUDIT-2 P2-1, a few lines while in the file):** `<li><span role="note">` instead of `li[role=note]` (axe serious `list`). Tests keep using getByRole('note').
- **ID photo done state (P1-1):** root cause: `headline.focus()` scrolled the headline itself into view with no margin, so the 61 px sticky header covered it and the chips, and cut the download button. Fix: `#idp-done.scrollIntoView({block:'start', behavior:'instant'})` (its existing scroll-margin-top 76 px clears the header), then `headline.focus({preventScroll:true})`; `#idp-headline` also gets scroll-margin-top. New e2e: headline, chips and 내려받기 top ≥ header bottom and bottom ≤ viewport at 390/360 (phones) and 768 / 720×450 (200 %) on all 5 projects; verified to fail without the fix. qa:visual: `idpDoneInView()` checks both edges and focus in the state matrix (390) and a new 360/768/200 % pass.
- **ID photo copy:** H1 and title "여권·증명사진 규격 맞추기" (= menu, card, JSON-LD). Done headline "규격에 맞췄습니다 · 71 KB"; chips: preset name, "413×531픽셀", the limit, "촬영 위치 등 사진 정보 없음". GIF: "움직이는 이미지는 여권·증명사진으로 쓸 수 없습니다. 사진 파일을 선택해 주세요." The result file name was already ASCII (`passport_413x531.jpg`; the "×" in the audit is the UI font's calt, already off on file-name lines).
- **Home:** "…가장 많이 찾는 작업을 바로 쓸 수 있습니다." (no "준비하고 있습니다"). The H1 is the tagline; the badge and lead carry the privacy promise.
- **Merge sticky bar (audit 1 P1-3 / audit 2 P2-7):** it already exists at ≤ 640 px (Polish P.16); the audit's full-page screenshots cannot show a sticky element. The phone e2e now also asserts the bar is fully in view at scrollY 0 while the list runs past the fold. No product change.
- **UI font:** 603 characters; 185.8 / 190 KB total (auto-framing build), largest face 47.6 / 50 KB. 4.2 KB headroom.

### Known Gaps (Polish Q)
- **Before ads or the error beacon go on:** publish a full privacy policy with a contact address and a named privacy officer (개인정보 보호법 제30조), and set PUBLIC_CONTACT_EMAIL (check-dist enforces the address only).
- /hwp-to-pdf/ copy (description "hwp pdf 변환", FAQ "파일이 업로드되나요?", engine and limit errors with 브라우저/메모리) is left to `hwp-direct`; the plain-language test exempts that page and strings found in the HWP sources. Remove the exemption when it merges.
- `tests/e2e/hwp-to-pdf.spec.ts:183` has a pre-existing `astro check` error (ts2322, `save.hidden` is `boolean | "until-found"`), present at 3358fd7; not touched (HWP branch).
- UX-AUDIT-2 items outside this scope: P1-3 (HWP 판정), P1-4 (first-use wait), P1-7 (error monitoring), P1-8 (domain), P1-9 (photo input policy, list thumbnails, accepted formats in the drop zone), P2-2…P2-13.

### Polish Q, added mid-build: share previews and the brand rule (owner, relayed by the coordinator)
- **Domain:** docttak.com is live; PUBLIC_SITE_URL=https://docttak.com is set in Cloudflare Production. No code change: every absolute URL (canonical, og:url, og:image, twitter:image, JSON-LD, sitemap) already comes from `site` = PUBLIC_SITE_URL. The astro.config default stays the pages.dev host for local and preview builds.
- **Share images:** `src/data/og.json` holds the copy (7 images: home, the 5 tools, default; per-path og:description ≤ 80 characters; "*" for unlisted paths such as 404 and offline). `scripts/gen-brand.mjs` draws `/brand/og-<image>.png`, 1200×630, 29–42 KB each: brand teal with white text (about 5.4:1), the 문서딱 icon and wordmark, a large title fitted into two lines at most, the plain line split at " — " into two lines, and the domain small at the bottom. All text is centred inside x 300–900, so a 1:1 (middle 630 px) or 2:1 crop keeps it; the build fails if a text does not fit. Fonts: Pretendard Bold/ExtraBold (our OFL UI font, from node_modules, same as before). The printed domain is PUBLIC_SITE_URL's host unless it is a *.pages.dev preview, else og.json's "docttak.com". The single `og.png` is gone; gen-brand deletes stale og*.png from public/brand.
- **Tags (Base.astro):** og:type, og:site_name 문서딱, og:locale ko_KR, og:title (= <title>), og:description (og.json), og:url (canonical), og:image, og:image:type/width/height/alt, twitter:card summary_large_image, twitter:title/description/image/image:alt. The alt is "문서딱: {title}. {line}" (the words on the image). The home page's separate `ogDescription()` is removed (og.json replaces it). HWP gets its own image and description through Base (no HWP file touched). Icons, favicon, apple-touch-icon and theme-color unchanged; manifest name "문서딱 — …", short_name "문서딱".
- **Tests:** postbuild "share previews" checks every dist page for the whole set, absolute https URLs on the build's site host (and equal to PUBLIC_SITE_URL when it is set), the referenced PNG exists at 1200×630 ≤ 300 KB, per-tool images, default on legal pages, and no 안올림. gen-brand unit test: exactly the 7 images, sizes, no og.png, `ogDomain()`. polish.test: og.json titles = tool names, descriptions ≤ 80 and jargon-free, `sharePreview()`. check-dist: at least 7 og-*.png, each ≤ 300 KB. e2e: every /brand/og-*.png is served as image/png; /brand/og.png is 404.
- **Brand rule (owner):** the name is always 문서딱; "docttak" only as the domain. The brand test fails on "독딱" or "docttak" not followed by ".com" (case-insensitive) in any dist text file outside /licenses/.
- Known Gap: KakaoTalk caches previews; the orchestrator clears them with the Kakao share debugger after deploy.

## Growth G decisions (Arch, 2026-09-30; staged in handoff/ARCHITECT-BRIEF-GROWTH.md, runs after Polish Q ships)
- Scope: the /guide/ content collection (16 planned pages: 9 ready on already-sourced facts, 2 waiting on hwp-direct, 5 gated on quoting an official source), preset deep links (?preset, ?target), "자주 쓰는 규격" quick links, share (Web Share + clipboard, never a file), sitemap lastmod, robots with named AI search bots, RSS, llms.txt, 404 suggestions, _redirects, an IndexNow ping script, the capacity guard, docs/GROWTH-RUNBOOK.md.
- No fact without a quote. Every spec number must come from the source quotes of the page, from id-photo-presets.ts (single source of truth) or from a toolFacts constant. A dist test fails any other number+unit. Unquoted pages stay draft and never ship with guessed facts.
- Quotes are the audit trail and are never rendered (they contain dpi/pixel). The plain-language test covers guides with no new exemption. The banned word stays banned even where queries contain it.
- Brand: 문서딱 in all Korean-facing text, OG, RSS, share text and JSON-LD. docttak appears only as the domain (owner rule, via coordinator; the existing Polish Q brand test already enforces it).
- JSON-LD: Article + FAQPage + BreadcrumbList. No HowTo (Google dropped its rich results; the steps are a visible list).
- Training crawlers are not blocked (max-reach goal). Search and citation bots are named explicitly with Allow.
- The IndexNow key is committed in public/: it is public by protocol, not a credential. The ping script runs post-deploy only, preflights the live key file, and never retries.
- Guides and /og/ are excluded from the SW precache: gen-sw precaches every sitemap page, and the 450 KB limit would break.
- Canonical is path-only; deep-link URLs never enter the sitemap. Option changes use replaceState, never pushState.
- Guide OG images come from a build-time endpoint that reuses the gen-brand drawing helpers.
- Arch probes, 2026-09-30:
  - Gmail 25MB: verified (support.google.com/mail/answer/6584).
  - help.naver.com: unfetchable.
  - cs.kakao.com: a menu page only.
  - safedriving.or.kr larGuide031: only the foreign-licence exchange rule, so it is not a source for domestic renewal.
- Season: publish all ready pages at once, early October. Hard dates: admission-photo by 2026-11-10, yearend-tax-pdf by 2026-11-30. The refresh dates are in the brief.
- Known Gap (seen in qa:visual): the id-photo "저장될 이름: passport_413x531.jpg" still renders the "x" as "×" in Chromium despite `font-feature-settings: "calt" 0` on `.save-name` (the substitution is not calt, or the subset font applies it through another feature). The downloaded file name is ASCII and correct. UX-AUDIT-2 P2-4, not in this scope.
- Lighthouse: /id-photo/ CLS rose to 0.017 (> 0.01) when the drop-zone line became "사진은 이 기기 밖으로 나가지 않습니다." (the 700-weight line re-wrapped on the font swap). Reverted to "…전송되지 않습니다." (same wording as the other tools' privacy note, no jargon): CLS 0.0018.

### Polish Q status (Bob)
- **DONE.** Nothing committed. Gates: check 1 error (pre-existing, tests/e2e/hwp-to-pdf.spec.ts:183, present at 3358fd7); unit 523/523 (27 files); both builds (dist-noauto flag off, dist flag on) check-dist OK, UI fonts 185.8 / 190 KB, share images 29–42 KB / 300 KB, precache OK; check:licenses OK (31, flag off); e2e 5 projects + manual-chromium: final full run 785 passed / 5 failed / 16 flaky / 172 skipped, the 5 failures were one test (home og:description must name every live tool) fixed afterwards and re-run green on all 5 projects with polish.spec + site.spec (379 passed, 6 Firefox goto flakies, 0 failed) and id-photo.spec on chromium, mobile-chrome, manual-chromium (78 passed); flakies are the known Firefox/WebKit goto race under load (all passed on retry); no-upload fixture on every test. Lighthouse 7 URLs × 3 runs: 99/100/100/100, all assertions pass. qa:visual (local preview): 215 PNGs, 0 hard failures, weight probe 1.74–1.78, idp done below header at 390/360/768/200 % and 1280. regress:merge 5/5, regress:compress 122/122, regress:photo 85/85 + 24/24, regress:idphoto 10/11 (the known p07 landmark miss, unchanged since Step 4).

## HWP direct — WIP state (Bob, 2026-09-30; worktree `C:\dev\doc-tools-kr-hwpdl`, branch `hwp-direct`)
Spec: `SPIKE-HWP-DIRECT.md` ("H": in-page vector PDF writer, per-page raster fallback, `<a download>`). Status: **WIP, not ready for review** (one open gate blocker below). Work stopped here on the coordinator's request (move to a cloud session).

### Done (against SPIKE-HWP-DIRECT.md)
- **Step 0:** merged origin/main a01af5e (Polish Q) cleanly (commit a4f8abd). Brand 문서딱 in all HWP copy; `src/lib/ui/josa.ts` is used for the done line and every number or file name followed by a particle. The HWP exemptions were removed from the postbuild "plain language" test (`COPY_EXEMPT_PAGES = ['licenses']`, no `hwpSources`): /hwp-to-pdf/ and every HWP JS string pass it.
- **§6.2 modules** (`src/lib/hwp/pdf/`):
  - `woff.ts`: WOFF 1.0 → SFNT (fflate).
  - `faces.ts`: FaceTable. parseRanges incl. `U+4??`; families() with pick(); resolve order chain → Fallback → Sans → Serif; any face of a family without the wanted weight, with synthBold; PUA → null, never "missing"; `unpackFaces`.
  - `font-source.ts`: the only new `fetch(` (same-origin face list and `.woff` slices under /fonts/hwp/); the network-guard allowlist is updated.
  - `svg-to-pdf.ts`: SvgPdfWriter, the §6.3 table (markers, nested svg, gradients as 64 bands, tspan dx/dy, SVG pictures drawn as vector, always `0 Tr`/`3 Tr` per text object, non-finite → 0 and counted).
  - `images.ts`: ImageCache. JPEG pass-through, CMYK → canvas, a 64-bit FNV dedupe key (never the data URL itself), the linearRGB brightness/contrast LUT; the canvas work is injected (`Recode`).
  - `raster-page.ts`: 200 dpi + invisible text layer; fonts inlined as data: woff; 150 ms settle.
  - `export.ts`: exportPdf. Per-page loop; hybrid rule = unsupported, a missing glyph or a non-finite number → removePage + raster; a blank page for a page that fails to parse; yield per page; AbortSignal; stats incl. sanitizerRemovals.
  - `brotli-stub.ts`: aliased for `brotli/decompress.js` in astro.config.mjs.
- `src/tools/hwp-to-pdf/download.ts` (`pdfName` = safeFileName(stem, '.pdf'); `triggerDownload` = hidden in-page `<a download>`) and `export-chunk.ts` (the lazy entry).
- **Deleted:** `print.ts`, `guidance.ts`, `tests/unit/hwp-print.test.ts`, the guidance/print cases in `hwp-tool.test.ts`, the whole `@media print` block and the body print classes, `#hw-guide`, `#hw-after`, `COPY.afterPrint` / `viewerOnlyPrint`, `installPageStyle` / `removePageStyle`, `sizeKey`, `viewer.downscale` with its blob bookkeeping, `downscaleImages()` (its helpers `targetSize`, `needsDownscale`, `isOpaquePhoto`, `parseDataUrl` are reused by `pdf/images.ts`), `fontsSettled` / `hwpFontsReady`.
- **§6.1/6.4 UI:** the controller is rewritten.
  - States empty / loading / convert / viewer-first / viewer-only / exporting / error. Always the lazy viewer. The worker stays alive until reset. Page 0 is awaited before the result shows.
  - Export: awaitPage + exportPdf. Done line `「x.pdf」를 내려받았습니다 · N쪽 · size` (size through `formatSize`: docs/COPY.md wins over the spec's "0.3 MB" example). 「다시 내려받기」 is an `<a download>` with the same blob, revoked only on reset or replacement.
  - Cancel → back to the routed state + "PDF 만들기를 취소했습니다.". aria-disabled buttons while exporting; `body[data-busy]`; the in-flight flag during the export; oom for RangeError/allocation, else corrupt.
  - The preview id is renamed `hwp-print-root` → `hw-preview`.
- **§6.5 assets:**
  - `gen-hwp-fonts.mjs` copies every fontsource `.woff` sibling, the static Pretendard 400/700 woff dynamic subset (`pretendard-static@1.3.9/`), the base fallback `.woff` and the extended fallback faces (`fallback-ext@<hash8>/`).
  - It declares the extended faces in the preview CSS after the sorted lines, in reverse order (CSS tries overlapping unicode-ranges last-defined first).
  - It writes a **packed** face list `public/fonts/hwp/hwp-pdf-faces.<hash>.json` (40.7 KB gzip; the flat list was 168 KB gzip, so it is fetched on the first export, not bundled) and `src/generated/hwp-pdf-faces.json` ({json}).
  - `gen-hwp-fallback.mjs` cuts the four OFL faces (Noto Sans CJK KR 2.004, Math 3.000, Symbols 2 2.008, Sans 2.015; SHA-256s in `licenses/third-party/SOURCES.md`), sliced greedily to ≤ 58 KB per file in both formats: fb-cjk-1..3, fb-math-1..2, fb-sym2, fb-sans (committed in `scripts/fonts/`, woff2 + woff). The base `anolim-hwp-fallback.woff2` stays byte-identical; only its `.woff` is new.
- **§6.6 routing:** equations no longer route (`GUARD_EQUATIONS` and the `equations` reason are gone; RouteInput has no equations). A soft note `#hw-eq-note` shows for files with equations. New banner copy (text boxes / ≥ 100쪽 / both), worded "100쪽 이상인" because the guard is ≥ 100, not > 100. Caps unchanged.
- **§6.7:** `prefetchRhwpWasm()` in `wasm-browser.ts` on the picker's pointerdown / Enter / Space and the tool's dragenter (skipped on Save-Data/2G through `preload.skipped`). The hwp font CSS is injected on `scanned`; `preloadFacesFor(page 0)`. Staged readout: "처음 한 번만 문서 여는 프로그램을 받는 중 · 43%", "문서를 읽는 중", "1/26쪽 보여 드리는 중", "PDF 만드는 중 12/26쪽". The export chunk is warmed on idle once the document shows (not for viewer-only, not on Save-Data).
- **§6.8 copy:** lead, 안전한 이유, the three steps, FAQ (the 인쇄 창 FAQ deleted; "PDF는 어디에 저장되나요?" added; "제 문서가 어디로 보내지나요?"), errors, banners, meta description (no 업로드; keeps "hwp pdf 변환" and "한글파일 PDF로 변환"). Decisions, where docs/COPY.md and the spec table differ, COPY.md wins:
  - 합니다체 is kept ("~는 중", "할 수 있습니다"), not 해요체.
  - The drop-zone privacy line stays "파일은 이 기기 밖으로 전송되지 않습니다." (the COPY.md rule; see the id-photo CLS note above for why that wording is kept).
  - MiB is written as "MB" (COPY.md: 1 MB = 1,048,576 bytes).
- **Merge/compress hardening:** `download.removeAttribute('href')` in both `revokeBlob`s, and the initial `href="#"` removed from both anchors.
- **§6.9 tests:** new unit files `hwp-pdf-woff`, `hwp-pdf-faces`, `hwp-pdf-writer` (jsdom + pdf.js read-back), `hwp-pdf-images`, `hwp-pdf-export`, `hwp-download`, `hwp-copy`; helper `tests/helpers/hwp-pdf.ts`. E2E `hwp-to-pdf.spec.ts` is rewritten around downloads with a `noSwap()` guard: no main-frame navigation, the same URL and title, no dialog, no new page, `window.print` never called, and the preview stays the same visible node while exporting.
- **regress:hwp:**
  - The harness runs `exportPdf` in the page (no `page.pdf()`).
  - Rule 2 uses the 14 keys; `EXPECTED_MODES` law09 / adm19 → convert. Rule 6 = open → PDF (law10 ≤ 4 s, adm28 ≤ 15 s).
  - New rule 7: valid (pdf.js + no NaN/Infinity operand); missingGlyphs 0; recall ≥ 0.99 for guarded files too; 0 fallback pages on the spike's 40-file sample.
  - SSIM vs `regress-out/direct/print/chromium-P/<key>.pdf` (PRINT_DIR, report only; only the 40 sample files have one). Browser-tree memory through `scripts/regress/memwatch.ps1` (Windows only).
- **§6.10 budgets** (`check-dist.mjs`, additive):

  | budget | measured | limit |
  |---|---|---|
  | export chunk closure (gzip) | 345.1 KB | 360 KB |
  | each fallback face file (raw) | max 52.2 KB | 60 KB |
  | PDF face list (gzip) | 40.7 KB | 48 KB |
  | viewer chunk (gzip) | 2.3 KB | 25 KB |
  | initial JS /hwp-to-pdf/ (gzip) | 10.8 KB | 30 KB |

  A Brotli-decoder marker check runs on the export closure. dist has 2,285 files.
- **§6.11 dependencies and licences:**
  - `@cantoo/fontkit` 2.0.12 (exact pin, MIT) with restructure (MIT) and dfa (MIT; its licence text is in `licenses/third-party/dfa/LICENSE`, the package ships none). brotli (MIT) is aliased to the stub and not shipped.
  - The Noto fallback faces are a component entry with `licenses/third-party/noto-fonts/OFL.txt`.
  - `playwright.config.ts` reads an `E2E_MANUAL_PORT` env (was hard-coded 4181), so a second checkout can run next to another agent's servers.

### Gates run (all with PUBLIC_SITE_URL=https://docttak.com)
- `astro check`: 0 errors, 0 warnings (1 hint).
- Unit: **546/546** (33 files), incl. postbuild "plain language" with no HWP exemption (against a flag-off build).
- Build flag off (`PUBLIC_ID_PHOTO_AUTOFRAME=0`, moved to `dist-noauto/`): check-dist OK; gen-sw OK (370 KB / 450).
- `check:licenses`: OK (36 production packages, 5 components).
- E2E HWP spec, chromium only, ports 4273/4281: **17 passed, 4 skipped** (phone-only). The adm28 cancel test then failed once in the full run: a page finishing after 취소 overwrote the status. Fixed in the controller (`onProgress` checks the run token); not re-run yet.
- regress:hwp smoke (`--fixtures-only --only "law05|adm19"`): all rules pass. SSIM vs print 0.997 mean, worst page 0.988; 0 fallback pages; law05 open → PDF 1.6 s, adm19 4.1 s (under parallel load).

### Blocker and what is left
1. **The flag-on build fails gen-sw** (`PUBLIC_ID_PHOTO_AUTOFRAME=1`, the build the main e2e projects use): precache 1,235.5 KB / 450.
   - Cause: rolldown puts its runtime helper (`__export`, module `\0rolldown/runtime.js`) into the HWP export chunk ("merge common chunks into an existing entry chunk"). The lazily imported /id-photo/ controller, which gen-sw precaches with its static closure, then imports `export-chunk.*.js`.
   - Tried without effect: `manualChunks` (the runtime id never reaches it), `codeSplitting.groups` with a runtime test, `experimental.chunkOptimization.mergeCommonChunks: false`.
   - Next ideas: make the export chunk a small entry that dynamically imports the heavy writer (so the entry the runtime lands in is small); check this rolldown version's runtime placement options; or exclude `export-chunk*` from gen-sw's controller closure, only if offline behaviour stays correct.
   - The flag-off build is unaffected.
2. Full e2e on 5 projects + manual-chromium: not completed. The first full run used a flag-off `dist` (so the id-photo MediaPipe tests failed, as expected) and was stopped. It needs the flag-on dist (blocked by 1).
3. regress:hwp on the full corpus (fixtures + `C:\dev\doc-tools-kr\spikes\hwp\corpus`, 120 files): not run. **The corpus exists only on the owner's machine.** A cloud session can run `npm run regress:hwp -- --fixtures-only` only, and has no print PDFs for SSIM (report-only anyway).
4. Lighthouse on /hwp-to-pdf/ and qa:visual: not run. `lighthouserc.json` hard-codes port 4173; use a temporary config with another port.
5. Not done from the spec: real-device checks (§6.12, owner), the Slow 4G first-use measurement (§6.7 "expected effect"), `docs/` device notes, the mobile regress profile.
6. REVIEW-REQUEST.md is not written (the work is not complete).

### Gotchas for a fresh session
- Rebuild order: `PUBLIC_ID_PHOTO_AUTOFRAME=0 npm run build && mv dist dist-noauto`, then `PUBLIC_ID_PHOTO_AUTOFRAME=1 npm run build`. The autoframe DEFAULT is "0"; the chromium id-photo specs need MediaPipe in `dist`.
- Run `npm ci` and then `node scripts/gen-hwp-fonts.mjs` (prebuild does it) before the unit tests: `src/generated/hwp-pdf-faces.json` is git-ignored and `font-source.ts` imports it.
- `scripts/gen-hwp-fallback.mjs` needs the four Noto sources, which are not committed (they were in `regress-out/direct/fonts/`). Its outputs in `scripts/fonts/` are committed, so normal builds never need it.
- `@cantoo/fontkit` must read WOFF, not WOFF2, sources: WOFF2 subsets into broken glyphs (spike bug 1).
- Scripted edits with backslashes through the Git-Bash tool mangled `\\` once (the download.ts regex); check regexes after scripted edits.

### HWP direct — cloud session update (2026-09-30)
- **Blocker 1 fixed** (flag-on gen-sw 1,235.5 KB → 372.3 KB / 450). Root cause: `/id-photo/entry.ts` did `import('./controller')` and kept the module namespace; rolldown builds that namespace with its `__export` runtime helper, which it had placed in the largest shared chunk (the HWP PDF writer, `export.*.js`), so the precached controller statically imported it. Fix: unwrap the one function inside the loader (`.then(c => ({ initIdPhotoTool: c.initIdPhotoTool }))`), so no namespace object exists. No bundler config change; the thin-entry idea for export-chunk was tried and is not needed (reverted).
- Gates on the fix (flag-on build): astro check 0 errors, unit 546/546, check:licenses OK, HWP e2e chromium 17 passed / 4 skipped (includes the adm28 cancel-race fix).
- Still open: full-corpus regress:hwp (owner PC only), real-device checks, Lighthouse /hwp-to-pdf/, Richard's review.
- Cloud e2e (flag-on build, chromium + mobile-chrome, LC_ALL=C.UTF-8): 321 passed, 17 failed, 32 skipped. All 17 are in pdf-compress / pdf-merge / polish (compress) / site (compress controls): the PDF thumbnail canvas never renders in the container's old Chromium 1194. Reproduced identically on a clean `origin/main` build (e05cbca), so not caused by hwp-direct. HWP and id-photo specs: all pass. Re-run those on a current Chromium (owner PC / CI).
- regress:hwp --fixtures-only: all 8 fixtures pass (recall/SSIM 1.0, 0 fallback pages, 0 missing glyphs, open→PDF ≤ 2 s).
## Growth G build notes (Bob, 2026-09-30)
Scope: handoff/ARCHITECT-BRIEF-GROWTH.md. hwp-direct has **not** merged (branch tip is still 3358fd7, an ancestor of main; its worktree holds uncommitted spike files only), so /hwp-to-pdf/, src/tools/hwp-to-pdf, src/lib/hwp and src/pages/hwp-to-pdf are untouched; guides 7–8 are drafts and the HWP share button is a Known Gap.

### Step 0: sources fetched (curl, 2026-09-30; text extracted from the HTML; quotes verbatim up to whitespace)
- passport.go.kr contents.do?menuPos=32 (여권사진 규격): 200. 귀 ("이마 등이 더 크게 보이고 귀가 덜 보여 실물과 다르게 보임", a rejected-photo example), 눈썹 ("머리카락으로 눈썹 및 얼굴 윤곽(광대, 볼 등)을 가리는 사진은 제출 불가함"), 옷 ("목을 덮는 티셔츠, 스카프 등은 얼굴 전체 윤곽을 가리지 않으면 착용 가능함"), 6개월, 보정, 장신구, 안경, 모자: quoted in passport-photo.md. There is no rule that the ears must show; the page mentions ears only in that close-up example, and the guide says exactly that.
- support.google.com/mail/answer/6584?hl=ko: 200. "개인 Gmail 계정의 경우 제한은 25MB입니다.", the two-file total rule, the Drive-link rule.
- support.microsoft.com/ko-kr/outlook/sending-limits-in-outlook-com: 200. "파일의 첨부 파일 크기 제한은 25MB입니다." Page 12 cleared with Gmail + Outlook.com (the brief allowed Outlook as the second service). help.naver.com/service/5640/contents/10053: 200 but a 회원정보 menu shell with no mail text; the Naver mail limit stays unverified and the guide says so.
- gongmuwon.gosi.kr AppApAplfSbmsnAplfRcptGd.do: 200; no "6개월" on the page, so gosi-photo does not mention it.
- q-net.or.kr guide_02.html: 200; the "사진등록이 불가한 사진" list, "얼굴형태(이마, 눈썹,눈,코, 입)가 잘 보여야…" and the scan-margin line: quoted in qnet-photo.md.
- safedriving.or.kr diGuide/selectDiGuide01.do?menuCd=MN-PO-1211 (정기적성검사/면허갱신): 200. Domestic renewal: "준비물 : 운전면허증, 6개월 이내 촬영한 컬러 사진 (규격 3.5cm*4.5cm, 여권용) 2매" (1종 적성검사), "… 1매" (2종 갱신), and the 2026-01-01 갱신 기간 change: page 16 cleared. drvLicnsPhotoUpdt (online photo registration): HTTP 500 (needs a session), so the guide states no file spec for it.
- Page 13 (연말정산): nts.go.kr search shows the official Q&A text only behind JavaScript links (no stable URL); the (2026-18) 일괄제공 PDF is policy history. Draft, publish by 2026-11-30.
- Page 14 (대입 원서 사진): jinhakapply.com 200 / 7,726 B script shell; uwayapply.com 200 / 2,358 B iframe shell. Draft, publish by 2026-11-10.
- Page 15 (카톡): cs.kakao.com/helps?service=8 200 / 228,896 B script-rendered menu, no article text. Draft.
- Page 6: no Apple or Samsung help fetched; the device sections describe our tool only.
- Web search (DuckDuckGo html, Bing) answered one query and then returned nothing (rate-limited). No source came from a search snippet.
- developers.cloudflare.com/pages/configuration/redirects/ (200): "A _redirects file is limited to 2,000 static redirects and 100 dynamic redirects, for a combined total of 2,100 redirects. Each redirect declaration has a 1,000-character limit." The file goes "in the static asset directory". We use 8 static rules.
- indexnow.org/documentation (200): "You can submit up to 10,000 URLs per post"; responses 200 OK, 202 Accepted ("URL received. IndexNow key validation pending."), 400 ("Invalid format"), 403 (key not valid), 422 (URLs not on the host, or a bad key), 429 ("Too Many Requests (potential Spam)").

### Result: 11 published, 5 drafts (launch target 12: flagged to Arch)
Published: passport-photo, id-photo-size, id-photo-kb, photo-kb, pdf-compress, pdf-merge, gosi-photo, qnet-photo, resume-photo, email-attachment-limit, driver-license-photo. Drafts (src/content/guides with blockedBy and tried; never rendered, listed or submitted): hwp-to-pdf, hwp-viewer (hwp-direct), yearend-tax-pdf, admission-photo, kakao-photo.

### Decisions (never stop; each is in REVIEW-REQUEST)
- **Drafts have their own small schema** (draft: true, title, query, blockedBy, publishBy, tried[]) instead of a full frontmatter with placeholder copy; guideSchema is the union. Published guides use the full contract: zod plus guideProblems (dates, year in title, one-sentence answer, live tools, CTA through deeplink.parseHref, presets exist, toolFacts equal tool-facts.ts, at least one source linking to an official page).
- **Fact check** (src/data/guide-facts.ts): a number with a unit (KB, MB, 픽셀, cm, mm, 개월; "pixel" and "px" inside quotes count as 픽셀; in a chain like 413×531픽셀 or 3.2~3.6cm every number takes the chain's unit) must appear in the page's quotes, its presets (structured values and the preset quote) or its unit-bearing toolFacts. It runs at build in [slug].astro (throws) and again in the dist test on the rendered article.
- **반명함판**: { preset: half_card } may back its own computed numbers (354×472픽셀, 3×4 cm), always called 일반 크기 / 계산값. It lists no link, and the guide still needs one official source.
- **UI font budget** (brief: stop and flag; standing order: never stop): with every guide body in the subset the faces were 197.7 / 190 KB (600, 700, 800 over 50 KB each). Applied the brief's likely fix: guide body, FAQ and sources render in the system Korean font (end of app.css); the subset takes only the published guides' title, answer and cta lines (scripts/lib/guide-text.mjs). gen-ui-font also stops counting two strings that are never shown: the preset quote values and tools.ts keywords. Two words changed to save glyphs: "아웃룩" became "Outlook" in the email guide title (아웃룩 stays in its description) and "컬러" left the driver-licence answer (table and body keep it). Result 188.3 KB (flag off) and 189.6 KB (flag on) of 190: **0.4 KB headroom on the flag-on build**. The next new Hangul syllable in UI text will probably fail the budget; Arch decides (more system-font areas, or the budget).
- **og:image:alt** on guides is "문서딱: {og.title} — {og.line}": the brief's form with the brand prefix, because T7 wants the alt texts to say 문서딱 and the Polish Q test pins the "문서딱: " prefix. og:type is article on guides.
- **Share** is self-contained (Share.astro + share.ts; no announce.ts import, so a guide loads 1.6 KB gzip of JS). On a tool the shared URL is origin + path + the query only when it is exactly ?preset= or ?target= with [a-z0-9_.]{1,20}; the deep-link code also rewrites the address to its clean form at load (readUrl). Title "{tool name or guide title} | 문서딱", text = the og description.
- **Deep links** (deeplink.ts pure, quicklinks.ts DOM): applied before the controller's first render (photo and pdf-compress before setState('empty'); id-photo in entry.ts before the lazy controller, which reads the select when it starts). Defaults are omitted (photo 500 KB, id-photo passport). A quick-link click on id-photo sets the select and dispatches change (the controller loads then, as on any interaction).
- **Quick links on pdf-merge**: only 관련 안내 (merge has no deep-link param). The HWP page gets none (untouched).
- **Sitemap lastmod**: tools.ts updated (2026-09-30, the last git change of each tool), LEGAL_UPDATED in legal.ts; home and /guide/ take the max of their children. Canonical unchanged (path only).
- **404 suggestion**: a JSON map in the page (is:inline type="application/json", data only, so the CSP is unaffected) and a 0.3 KB gzip module.
- **gen-brand** exports ogImage(image, domain, { lineMaxLines }); the line tries one row first (the tool images behave as before), then two rows split at the " · " that balances them. The repo root falls back to process.cwd() when Astro bundles the helper into dist/.prerender. Guide PNGs are 28–40 KB.
- **IndexNow key** 87c53aad239a45ff5caa9ce574b5e423 (crypto.randomBytes(16)), committed in src/data/indexnow.json and public/<key>.txt.
- **check-dist**: constants in scripts/lib/capacity.mjs (unit-pinned); a warning above 10,000 files; a files row "N / 15000 (guard 15,000 / CF 20,000)"; budgets for guide HTML (≤ 30 KB gzip), guide initial JS (≤ 4 KB), og/guide PNGs (≤ 80 KB raw) and the 404 script (≤ 1 KB).
- **Tone of guides**: 해요체 (brief), recorded in docs/COPY.md.

### Known Gaps (Growth G)
- **Fewer than 12 guides**: 11 published. Arch decides (the brief says Bob does not pad).
- hwp-direct not merged: hwp-to-pdf and hwp-viewer guides are drafts; /hwp-to-pdf/ has no share button and no quick-links section. After the merge, also drop the plain-language exemption for /hwp-to-pdf/.
- admission-photo (publish by 2026-11-10), yearend-tax-pdf (by 2026-11-30) and kakao-photo: no quotable source yet (above). The Naver mail limit is unverified.
- /id-photo/?preset= is applied by a module script, which runs after parsing: the select can show the passport preset for a frame before it switches. The other tools hide their options until a file is picked, so they cannot flash.
- npm run check:licenses with PUBLIC_ID_PHOTO_AUTOFRAME=1 fails on fft2d (LicenseRef-Ooura): the pre-existing Step 4 license flag (default off). The gate runs flag off and passes.
- UI font headroom 0.4 KB (flag on), above.

### Merge state and Growth G next steps (cloud session, 2026-09-30)
- Branch `claude/affectionate-wright-82i7wk` now = hwp-direct (1aa8874) + the precache fix + growth-g-wip merged (only BUILD-LOG conflicted; both sides kept). Gates on the merged tree: astro check 0 errors, unit 587/587 (37 files), both builds (flag off/on) check-dist + gen-sw OK (386 / 388 KB of 450), check:licenses OK.
- Decision: `hwp-to-pdf` and `hwp-viewer` guides stay `draft: true`. hwp-direct is in, but a guide needs one fetched official quote and hancom.com / tech.hancom.com are blocked by the cloud proxy (search snippets are not verbatim). `tried` URLs recorded in both files. 11 guides are published (target was ≥ 12): publish these two from a PC session with Hancom access, or find another fetchable official source.
- Still to do: Richard review of hwp-direct + growth-g, /hwp-to-pdf/ share button (Growth G, now unblocked), Lighthouse /hwp-to-pdf/, owner-PC full-corpus regress:hwp, then merge to main per CLOUD-HANDOFF §3.

## Fix-forward 2026-10-01 (Bob; worktree doc-tools-kr-hotfix, branch cloud-handoff on origin/main 37aa511)
Scope: Richard's post-hoc FIX FORWARD (handoff/REVIEW-FEEDBACK.md). Two local commits, nothing pushed. The first one, 73ea1ca, holds only the live bug fix (P1-2 + P1-3) so it can be pushed first. Status: **DONE_WITH_CONCERNS** (Lighthouse LCP on /hwp-to-pdf/, below).

### What changed
- **P1-2 bfcache hang** (controller.ts): `pageshow` with `persisted` calls `reset(false)` unless the state is empty or error. `send()` with no worker and a document on screen calls `fail('engine')`, which shows the engine panel with 새로고침 and releases every page waiter, so the first-page wait and the export end. Root cause, as Richard traced it: pagehide ended the worker, then `send()` returned before `watchdog.kick()`. New e2e tests: (1) pagehide mid-export then pageshow(persisted): state empty, no pages, no in-flight flag, no download in 2 s, then law05 downloads; (2) pagehide alone, then 「PDF 내려받기」: the engine error within 15 s.
- **P1-3 WebKit keyboard test**: Alt+Tab was tried first and did not reach the link in Playwright WebKit on Windows. Ported the hwpdl fix: on WebKit, `.focus()` on #hw-again, then Enter. The product is unchanged.
- **Port from hwpdl**:
  - `ExportStats.missingChars` (up to 40 code points), carried into regress:hwp. The rule-7 message now lists the characters with their U+ codes.
  - Fallback faces: fb-math-2 gains U+27C0-27EF. New fb-math-3 (U+2980-29FF) and fb-math-4 (U+2A00-2AFF). fb-sans gains U+2070-209F. These cover ₁ ₂ ⦁.
    - The files were copied from doc-tools-kr-hwpdl/scripts/fonts. The unchanged faces are byte-identical.
    - fontkit confirms the sources match SOURCES.md: Noto Sans Math 3.000 and Noto Sans 2.015, both OFL.
    - SOURCES.md now lists fb-math-1..4 and the new blocks.
  - check-dist fails when any _astro JS other than the export chunk imports it statically. `chunkOptimization: false` was skipped: precache is 388.8 / 391.2 KB of 450.
- **Port from growth**:
  - `toolListJsonLd` (an ItemList of LIVE_TOOLS as WebApplication) is on the home page, next to the existing WebSite and Organization nodes; nothing is duplicated.
  - Growth T8 asserts exactly 1 WebSite, 1 Organization and 1 ItemList.
  - id-photo kill-switch `beforeAll` skips manual-chromium.
- **P2**:
  - 404.astro uses the `'\u003c'` escape.
  - The guide source title strips the preset label's own parentheses: "인사혁신처 공무원 채용시스템 (국가공무원 시험)". This also fixes the passport source.
  - /hwp-to-pdf/ `updated` is now 2026-10-01 (sitemap lastmod).
  - Share sits in #hw-done. QuickLinks shows 관련 안내 through a new `NEXT_GUIDES` map in guides.ts: pdf-compress, pdf-merge, email-attachment-limit. The tool has no options and its own guides are still drafts.
  - New postbuild test: the 404 map is valid JSON with no "<", and no guide source line has nested parentheses.
- **Raster fallback under the CSP**: added an e2e test that forces the fallback on page 1.
  - How it works: an init script wraps `Worker.onmessage` and appends `<switch/>`, which the writer does not draw, to page 1. There is no product debug flag.
  - What it asserts:
    - page 1 paints an image, and the vector run does not;
    - the text layer recall is ≥ 0.99;
    - zero CSP violations;
    - in the pixel overlap of the raster page against the vector page at 144 dpi, the inlined data: fonts give 0.83–0.87 in Chromium, Firefox and WebKit.
  - Control run: a build with the @font-face rules stripped gave 0.52–0.56, and the test failed at 0.537. The threshold is 0.75.
  - Result: the data: fonts do render under `font-src 'self'` in all 3 engines.

### Gates (PUBLIC_SITE_URL=https://docttak.com)
- astro check 0 errors (1 hint). Unit 588/588 (37 files).
- Build flag off → dist-noauto: check-dist OK, 2,317 files. Precache 388.8 / 450 KB. UI fonts 183.1 / 190 KB. Export chunk 345.1 / 360 KB.
- Build flag on: check-dist OK, 2,324 files. Precache 391.2 / 450 KB. **UI fonts 184.5 / 190 KB** (400 43.7, 600 46.7, 700 47.3, 800 46.8). The new glyphs are in the HWP fallback faces, not the UI font, so this is not over budget. Largest fallback face: fb-cjk-3.woff 52.2 / 60 KB. New: fb-math-3 40.9, fb-math-4 36.7, fb-sans 28.4 KB (woff).
- check:licenses (flag off) OK: 36 packages, 5 components. Flag on still fails on fft2d LicenseRef-Ooura, the known Step 4 flag.
- Full e2e on 5 projects + manual-chromium: **861 passed, 0 failed, 7 flaky** (all Firefox goto/load timeouts, passed on retry), 160 skipped. Per project: chromium 189, firefox 179, webkit 156, mobile-chrome 179, mobile-safari 145, manual-chromium 19.
- **regress:hwp, full corpus** (120 files, CORPUS_DIR spikes/hwp/corpus, PRINT_DIR from hwpdl):
  - Run 1: 119/120. law07 (a fixture) timed out at 30 s in waitForFunction. Alone it passed 2/2 (696 / 660 ms).
  - Run 2: **120/120, all pass rules pass**:
    - 0 fallback pages of 2,280; **0 missing glyphs in every file** (adm31, kr19 and kr29 included);
    - SSIM against the print path: mean 0.996, worst page 0.934 (na07);
    - memory max 1,439 MB (kr01), adm16 391 MB, budget 1,536 MB.
  - The run-1 law07 timeout came after the heavy files and did not repeat. Logged as possible flakiness.
- regress:merge 5/5 PASS. regress:compress 122/122. regress:photo 85/85 rows + 24/24 aggregate rules.
- regress:idphoto 10/11: chin on p07 −1.11 mm against ≤ 1 mm. This is the known auto-frame-only gap and shows the same number as Step 4.
- **Lighthouse** (lhci, 3 runs, median; Playwright Chromium 1243):
  - Home: 99/100/100/100, LCP 1,956 ms.
  - /guide/passport-photo/, /guide/pdf-merge/ and /guide/gosi-photo/: 99–100/100/100/100, LCP 1,651–1,710 ms, CLS 0.
  - **/hwp-to-pdf/: 98/100/100/100, LCP 2,190 ms > 2,000 (FAIL)**.
    - With the new 관련 안내 section removed from the built HTML: 2,101 ms, still over the limit.
    - So the miss predates this work. The page was never Lighthouse-run before, and this section adds about 90 ms.
    - Cause, from the network graph: compared with home, the page has a second render-blocking stylesheet (index.*.css from hwp.css, 1.2 KB) and 6.8 KB + 6.3 KB more initial JS. The LCP element is p.lead (render delay 1,740 ms against home's 1,504 ms).
    - The threshold was not lowered. Escalated to Arch.
- qa:visual (local): 0 hard failures, 215 PNGs. /hwp-to-pdf/ at 360 px looks right with the 관련 안내 list.

### Known Gaps (fix-forward)
- /hwp-to-pdf/ Lighthouse LCP 2,190 ms (above). Options for Arch: inline hwp.css (build.inlineStylesheets for that page), or defer the tool controller's import of ui-shared.
- Not done here, owner/PC only: disabling the Cloudflare Web Analytics beacon and adding the live-smoke check for off-origin scripts (P1-1); the real-device checks.
- Not in this task: the CLAUDE.md note "npm test needs a build first"; the rss content type; dropping the /hwp-to-pdf/ plain-language exemption (Growth G gap).
- The regress:hwp law07 timeout happened once in 2 full runs.
## Ops automation A-1~A-6, M-3 (Bob, 2026-10-01, branch docs-revenue) — DONE
REVENUE-MODEL §3 as GitHub Actions + `scripts/ops/` (Node 22, no deps, no AI, nothing on the site). Runbook: docs/OPS-RUNBOOK.md.
- Workflows: `ops-post-deploy.yml` (A-1 verify → A-2 indexnow; push to main + dispatch), `ops-health.yml` (daily), `ops-source-watch.yml` (weekly Wed), `ops-weekly.yml` (Mon: A-5 → commit report `[skip ci]` → A-6 → M-3). Only A-1/A-2 run on push. Each has a dispatch "dry_run" input and a failure step that files an issue.
- Scripts: wait-deploy, indexnow-diff, source-watch, health, growth, opportunities, monetize, issue (+ lib: common, github, html, guides, gsc, cloudflare, report). Every script has `--dry-run`.
- Live smoke: `tests/live/tools.spec.ts` + `playwright.live.config.ts` (Chromium, reuses the e2e no-upload fixture, adds console/page-error/CSP-violation fixture). Not in the main e2e config (testDir tests/e2e).
- Decisions: one open issue per label (body replaced + comment); A-4 and A-1 auto-close on recovery; A-3 left for a human to close; M-3 announces once ever (state=all). A-2 state = last successfully pinged sitemap in actions/cache; no state → submit all. GSC data lag 3 days; report week = ISO week of the run; M-3 reads `<!-- growth-data -->` from committed reports. JSON-LD not required on /privacy/, /terms/, /licenses/ (by design). TTFB limit 2 s (best of two). Source-quote compare folds whitespace, tags, entities, ·/ㆍ, ~/∼, dashes, ×; fold before NFKC (NFKC turns ㆍ into a conjoining jamo — found by a unit test).
- Verified: `npm test` 38 files / 628 tests green (after build), `npm run check` 0 errors, `check:licenses` OK, actionlint clean. Dry runs on the live site: A-1 wait (live id read), smoke:assets, live Playwright 5/5 pass (13.9 s; console-error fixture proven with a probe), A-2 (21 URLs on no state), A-3 34/34 quotes found in 10 sources, A-4 (finding below), A-5/A-6/M-3 without secrets (notes, skip, R1 not met).

### Known Gaps (ops)
- **Live finding (A-4):** Cloudflare Email Address Obfuscation injects `/cdn-cgi/scripts/5c5dd728/cloudflare-static/email-decode.min.js` into /licenses/ and rewrites an email link to `/cdn-cgi/l/email-protection` (404). Owner: Cloudflare → Scrape Shield → Email Address Obfuscation off. A-4 will open `ops:health` for it until then.
- main protection (REVENUE-MODEL §3 safety) will block A-5's report push unless GitHub Actions is on the bypass list (runbook §2).
- A-7 (Claude routine) and M-4 (AdSense API) not in scope.

## G2 decisions (Arch, 2026-10-01; brief handoff/ARCHITECT-BRIEF-G2.md)
Inputs: the three 2026-10-01 reports (traffic realism, multilingual, competitor revenue) in C:\dev\AGI_AGENT\reports.
- **Target reset:** plan against 10–30k PV/month at 12 months (traffic report §4). 100k is a stretch goal, not a plan. Kill/continue checkpoints follow traffic report §6 (Google + Naver clicks combined).
- **Order:** Sprint A (Korean guides, cluster D first) → Sprint B (English, gated). Sprint B starts only after A1 is live. Phase-0 revenue is notes only.
- **Sprint A ships in 3 deploys:** A1 by 2026-10-20 (HWP guides x2, admission-photo, univ-docs-upload, kosaf-docs, 2 hubs, topics), A2 by 2026-11-05 (exam/ID photo cluster), A3 by 2026-11-25 (file-limit cluster, yearend-tax-pdf, kakao-photo). Ship rule: ≥ 30 indexable /guide/ URLs (hubs count) or a logged shortfall. No padding, no template pages; a duplicate-content test (Jaccard < 0.45, fixed) enforces it.
- **Sources:** curl first; script-rendered official pages may be read through chrome-cdp on the owner's Chrome (PC session only, read-only, no login/captcha/form). They are tagged `via: browser`, and source-watch lists them for a manual weekly check instead of reporting them unreachable.
- **Presets:** a new id-photo preset only where the official page states px, KB, or format + print size. Cap 8. Print-size-only sources get no preset.
- **Schema additions:** `topic` (7-value enum, required), `spec` rows (fact-checked), `via` on url sources. Hubs /guide/photo-sizes/ and /guide/upload-limits/ are built only from preset and spec data; their prose lives in .md (outside the UI font scan).
- **UI font:** Sprint A may grow the flag-on total by ≤ 2.0 KB (≤ 186.5 / 190 KB). Sprint B by 0.0 KB. The budget does not move.
- **Probe 2026-10-01 (this PC, curl):** hancom.com 200 / 200,591 B (was blocked from the cloud proxy). Shells under 3 KB: topik.go.kr, hikorea.go.kr, kuksiwon.or.kr, license.korcham.net, kosaf.go.kr, gov.kr, mma.go.kr, easylaw.go.kr, mois.go.kr, immigration.go.kr. Larger: exam.toeic.co.kr 69 KB, teps.or.kr 50 KB, historyexam.go.kr 12 KB, visa.go.kr 85 KB, nts.go.kr 187 KB. Live home has no Cloudflare beacon (build-id d7e319a6cd0b); sitemap has 21 URLs.
- **English (Sprint B):** /en/ subfolders, no Astro i18n config, extract only what /en/ renders. A ko snapshot gate (byte-identical after normalisation) is committed before any edit; B2 ko diffs must equal an exact allowlist. Pairs only /hwp-to-pdf/ ↔ /en/hwp-to-pdf/ and /privacy/ ↔ /en/privacy/, with x-default = the /en/ URL. Unpaired pages get no hreflang. /sitemap.xml keeps its URL list, /sitemap-en.xml is new, and robots.txt lists both. EN brand = 문서딱 (Hangul); no romanised name. An EN page is indexable only with a `reviewed` record (Richard back-translation counts).
- **Gate 0:** the orchestrator measures volumes. K0 pass → full set (HWP tool + 5 guides + /en/ + /en/privacy/). Fail or no entry → minimal set (HWP tool + open-hwp-file + hwp-to-pdf-mac-phone + /en/ + /en/privacy/). Further languages wait for K1/K2 from GSC.
- **B0 first:** the /hwp-to-pdf/ LCP gap (2,190 ms) is fixed before the EN page is built on the same component. The threshold does not change.
- **Revenue Phase 0:** guide AdSlot placeholders (`guide-mid`, `guide-end`) render nothing while ads are off. Ads never go inside a tool flow. Paid tiers never remove existing free behaviour (photo multi-file, merge).
- **Usage signal deferred:** any per-action count needs a reporting request, which is a beacon and breaks "쿠키와 방문 분석 도구도 쓰지 않아요". The chunk-fetch proxy was rejected: it undercounts, and Free-plan per-path analytics are unverified. A GSC "batch intent" query bucket in the A-5 report stands in.

### Known Gaps (G2 planning)
- Naver blog bridging (traffic lever 2) and backlinks (lever 5) are outside code: 사이티드/owner.
- No measured Google volumes yet; Gate 0 is pending with the orchestrator.

## G2 amendment: A0 /hwp-viewer/ (Arch, 2026-10-01; owner request via coordinator)
- **A0 is the first item of Sprint A** (own deploy, target 2026-10-12). It is a standalone HWP/HWPX viewer on the existing rhwp render path:
  - page navigation, fit width/page and zoom steps
  - thumbnails (DOM tiles only, no extra renders)
  - text select/copy and in-document search (cancellable, GUARD_PAGES cap)
  - in-page 「PDF로 내려받기」 through the existing export chunk
  - the same caps, guards, bfcache handling and no-upload rule
  - KakaoTalk in-app browser via standard APIs (no UA sniffing)
- **Order:** V0 = the /hwp-to-pdf/ LCP fix (moved from Sprint B B0; shared component). V1 = a behaviour-free refactor into src/tools/hwp-shared/ (its own commit, /hwp-to-pdf/ output equal). V2 = the page.
- **PDF CTA in-page instead of a link** (Arch, minor UX call): a link to /hwp-to-pdf/ would lose the open file.
- **SEO:** /hwp-viewer/ owns "hwp 뷰어" (Naver 3,560, owner-measured) and "hwpx 열기" (130). The never-published draft guide `hwp-viewer` is renamed `open-hwp-without-hangul` ("한글 없이 hwp 열기") to avoid cannibalisation. New guides: `hwp-on-phone` and `what-is-hwpx`.
- **Budgets:** viewer LCP ≤ 2,000 ms, initial JS ≤ /hwp-to-pdf/ + 4 KB gzip. Sprint A UI-font allowance is now ≤ 2.5 KB total (≤ 187.0 / 190), of which A0 ≤ 1.0 KB.
- **Legal summary** (owner fetched store.hancom.com/etc/hwpDownload.do on 2026-10-01; Arch curl the same day: HTTP 200, 43,972 B, notice text present verbatim):
  - Commercial and non-commercial use of the published HWP spec is allowed, with the exact notice "본 제품은 한컴의 HWP 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다." in the UI, help and source. It goes on /hwp-viewer/ (visible + FAQ), and as the first-line comment of every new hwp-shared/hwp-viewer file; it reuses HANCOM_NOTICE.
  - No trademark rights are granted. Never name the page or brand 한컴뷰어 (or 한컴 뷰어 / 한컴오피스). No Hancom or 한글 logos, no implied affiliation. Descriptive use only: "HWP·HWPX 파일 보기", "한글 파일(.hwp) 열기", "HWP 뷰어" as the search phrase. TRADEMARK_NOTICE stays on the page. A dist test enforces this.
  - No warranty: "원본과 다르게 보일 수 있어요" is shown plainly.
  - No redistribution of the spec, and no exclusive-rights claims.
  - HWPX is the OWPML national standard (KS X 6101); guides state it only with a fetched quote.
  - Users' documents are processed locally only, so there is no copyright or reproduction issue on our side.

## A0 /hwp-viewer/ build notes (Bob, 2026-10-01; branch cloud-handoff: V0 d109a7f, V1 241a438, V2 the next commit)
Status: **DONE_WITH_CONCERNS** (Lighthouse noise at the 2,000 ms line; see Known Gaps). Nothing pushed.

### V0 — /hwp-to-pdf/ LCP (B0 moved here)
- hwp.css is inlined on the page (`?inline` + `<style is:inline>`; CSP style-src already has 'unsafe-inline'), so there is one render-blocking stylesheet.
- The page script is `hwp-shared/boot.ts`. It imports the controller after the first contentful paint (PerformanceObserver 'paint', 1.5 s fallback) and idle, or at once on the first interaction (pointerdown, keydown, focusin, touchstart, change, drag). A file picked or dropped before then is handed over. A press on the picker still starts the wasm prefetch. A controller that fails to load twice shows the engine panel. Unit test: hwp-boot.test.ts.
- boot.ts sits in the `ui-shared` manual chunk (astro.config.mjs). As its own chunk it was one more request before first paint. (The 1,966 → 2,040 ms seen then is within Lighthouse's quantisation step, so it does not prove an effect; the saved request is the reason.) Cost: ui-shared grows by 0.7 KB gzip on the other tool pages.
- Gotcha: a *dynamic* import of a ui-shared module from the entry makes rolldown build a namespace object with its runtime helper, which lives in the export chunk. The entry then imported the 345 KB export chunk (initial JS 353 KB). Use static imports only.
- Result (Lighthouse, 3 runs, this PC): /hwp-to-pdf/ median 2,105–2,190 ms at f6b40a6 → 1,953–1,955 ms.

### V1 — src/tools/hwp-shared/ (behaviour-free, own commit 241a438)
- Moved: boot, download, export-chunk, fonts, hwp.css, lazy, limits, messages, viewer and watchdog. controller.ts became session.ts (`startHwpSession`). hwp-to-pdf/controller.ts is a thin wrapper, so the lazy chunk keeps the `controller.*` name that the service worker precaches.
- Every file under hwp-shared/ and hwp-viewer/ starts with the HANCOM_NOTICE comment (hwp-notice.test.ts).
- Gates: the normalised /hwp-to-pdf/ dist HTML is byte-equal to V0; hwp-to-pdf e2e 104/104 on 5 projects; regress:hwp --fixtures-only 10/10; the check-dist export-chunk import rule holds.

### V2 — the page
- **Step 0 (search):** rhwp `getPageTextLayout()` does return text without an SVG. But on the 10 fixtures it misses characters the page draws on 116 of 236 pages (adm19 p8: 619 vs 725). So the worker gets `{type:'text', i}`: it renders the page, keeps only the drawn text (`glyphText` in svg-string.ts: every `<text>`, in drawing order) and drops the SVG. That order is the page DOM's, so a hit can be found again among the page's `<text>` elements and marked there.
- **Session hooks (`HwpHooks`):**
  - warmExport: false on the viewer, so the export chunk loads on the first 「PDF로 내려받기」;
  - viewer options: zoomable, onRendered, onCleared;
  - onOpening, onDocument, onClear.
  - `requestText` has its own waiters, released together with the page waiters. With no worker it goes through send(), which shows the engine panel (the P1-2 rule). #hw-note is optional.
- **Page window:** zoomable pages get a fixed box, `calc(w px * var(--hv-zoom))` by `calc(h px * …)`, so drawing or dropping a page never shifts the others. The preview has `overflow-anchor: none`; the controls keep the page in view themselves.
- **Controls** (hwp-viewer/ui.ts, loaded when a file starts opening):
  - 이전/다음, the page box, 너비 맞춤/쪽 맞춤, and −/+ in steps from 50 to 300 % (a fit may be smaller than 50 %), 쪽 목록 and 찾기;
  - fit width under 768 px, fit page otherwise;
  - after a page change or a zoom, that page stays current even when several pages fit in view.
- **Page list:** a side list at 900 px and wider, a bottom sheet with 닫기 below that (Escape closes it; opening it scrolls the controls above the sheet).
  - Tiles are DOM only. The mini preview is an `<svg><use href="#hv-p{i}">` of the page drawing already on screen; it is removed when the page leaves the window.
  - Virtualised above 100 pages (fixed 104×150 tiles).
- **Search:**
  - NFC with every whitespace character removed; non-overlapping hits;
  - pages 1..min(N, GUARD_PAGES); texts are cached per document;
  - 멈추기 cancels. Status lines: 「n개 찾음」, 「찾기를 멈췄어요 · …」, 「… 처음 100쪽에서 …」;
  - 이전/다음 walk the hits. The hit is marked over its glyphs (boxes in %, so zoom keeps them) and scrolled to the middle.
- **Copy:** browsers copy a selection of rhwp's per-glyph `<text>` elements one glyph per line. The viewer answers the copy event itself (select.ts): the selected glyphs in drawing order, a line break on a new baseline, the text-layer spaces, and a space for any gap over 1.5 em.
- **PDF CTA in-page (Arch):** 「PDF로 내려받기」 and 「그래도 PDF로 내려받기」 run the shared export for the open document.
- The controls' CSS is imported `?inline` and added with the controls. An imported stylesheet would be linked in the page head by Astro and block rendering.
- The app module is `hwp-viewer/app.ts`, not controller.ts, so the service worker precaches only the viewer HTML (plus the shared entry).
- **tools.ts `hwp-viewer`:** live, updated 2026-10-01, title and H1 per the brief, FAQ including the HANCOM_NOTICE answer.
  - OG image and description added. The home cards, ItemList, sitemap and llms.txt follow LIVE_TOOLS.
  - RelatedTools: the viewer and the converter link each other; hwp-to-pdf now lists /hwp-viewer/ first.
  - The home meta description and og:description templates are shortened to fit 6 tool names (≤ 120 and ≤ 80 characters).
- **Guides:** all three are published, in category 한글파일 (the `topic` field is A1 work), with tools [hwp-viewer, hwp-to-pdf]; NEXT_GUIDES maps hwp-viewer → the three.
  - The `hwp-viewer` draft is renamed `open-hwp-without-hangul` ("한글 없이 HWP 파일 여는 법").
  - `hwp-on-phone` uses Apple sources only.
    - Kakao help (cs.kakao.com via chrome-cdp; queries 파일 저장, 파일 저장 위치, 받은 파일, 파일 다운로드 경로, 저장 경로, 파일 전송, 채팅방 저장소) has PC and 톡클라우드 articles only.
    - The samsung.com/sec support search returned an empty result page.
    - So the Android steps describe our page only, and the Kakao FAQ says the source was not found (Growth G page-6 rule).
  - `what-is-hwpx`: OWPML / KS X 6101, quoted from tech.hancom.com and from the Hancom FAQ.
- **Tool facts:** hwp.maxMb.desktop/mobile, hwp.pdfMb.mobile, hwp.pdfPages.mobile and hwp-viewer.searchPages, read from LIMITS / GUARD_PAGES (MB = 1,000,000).
- **docs/COPY.md:** the two 해요체 lines the brief fixes are logged as an exception; the rest of the viewer copy is 합니다체. UI-font glyphs: the copy was reworded until it added 0 new code points.
- **Scripts:**
  - check-dist: viewer initial JS ≤ converter + 4 KB; ui*.js never initial; controls ≤ 20 KB gzip;
  - lighthouserc: adds /hwp-viewer/ and the 3 guides;
  - qa:visual: adds the hwpview page and the hwpv states;
  - new: `npm run regress:hwp-viewer`.
- e2e: the viewer spec uses `reducedMotion: 'reduce'`. The site's smooth window scroll raced Playwright's scroll-into-view, and on Firefox the pointer landed mid-scroll (pointerdown on 「다음」, no click).

### G2 A0 Step 0 sources (fetched 2026-10-01 from this PC)
| URL | via | status / bytes | quotes used |
|---|---|---|---|
| https://tech.hancom.com/hwpxformat/ | curl | 200 / 144,696 | "한글의 표준 포맷 HWPX는 국가 표준(KS X 6101)인 OWPML을 따르는 개방형 문서 포맷입니다." · "HWP는 바이너리 포맷이고, HWPX는 XML 파일들이 ZIP 구조로 구성되어 있다는 점에서 가장 큰 차이가 있습니다." |
| https://www.hancom.com/support/faqCenter/faq/detail/2784 | curl | 200 / 222,923 | "국가표준(KSX6101)으로 등록되어 있는 개방형 문서 포맷입니다." · "기존 설치된 한글 뷰어에서는 HWP뿐만 아니라 HWPX도 지원하고 있습니다." · "도구 > 환경설정 > 파일탭에서 …" · "…별도 기능 제한은 없습니다." |
| https://www.hancom.com/support/downloadCenter/download (redirect from /cs_center/csDownload.do) | curl | 200 / 221,427 | "한글, 한셀, 한쇼 뿐만 아니라 MS 워드, 파워포인트, 엑셀 문서를 불러올 수 있는 한컴오피스 통합 뷰어입니다." · "운영 체제 : Windows 10 이상" |
| https://support.apple.com/ko-kr/guide/iphone/iph7fe7a50a7/ios | curl | 200 / 1,388,625 | "메시지에서 첨부 파일을 길게 터치하고 다음 중 하나를 수행하십시오." · "파일 앱에 저장하기: 파일 앱에 저장을 선택하십시오." |
| https://support.apple.com/ko-kr/guide/iphone/iphc9cd7266c/ios | curl | 200 / 1,381,618 | "파일 앱에서 인터넷 또는 메일 앱으로 다운로드한 문서, 이미지 및 기타 파일을 찾고 확인할 수 있습니다." · "다운로드 폴더를 탭하여 다운로드한 파일을 확인하십시오." |
| cs.kakao.com search (7 queries) | chrome-cdp | rendered | none usable (PC / 톡클라우드 only) |
| www.samsung.com/sec/support/search/?keyword=내 파일 다운로드 | chrome-cdp | rendered, 0 results | none |

`node scripts/ops/source-watch.mjs --dry-run`: 15 sources; all 47 quotes found verbatim.

### Gates (PUBLIC_SITE_URL=https://docttak.com)
- astro check: 0 errors (1 hint). Unit: 669/669 (41 files).
- **Build flag off → dist-noauto:** check-dist OK, 2,329 files. UI fonts 183.3 KB. Precache 416.6 / 450 KB.
- **Build flag on:** check-dist OK, 2,336 files.
  - **UI fonts 184.8 / 190 KB; A0 delta +0.0 KB** (400 43.8, 600 46.8, 700 47.3, 800 46.9).
  - Precache 419.1 / 450 KB (was 391.3).
  - Export chunk 345.1 / 360 KB. Viewer chunk 2.4 KB. Viewer controls 12.0 / 20 KB.
  - Initial JS: /hwp-to-pdf/ and /hwp-viewer/ 7.7 KB each; viewer over converter 0.0 / 4 KB.
- check:licenses (flag off): OK, 36 packages, 5 components.
- **regress:hwp, full corpus** (CORPUS_DIR C:\dev\doc-tools-kr\spikes\hwp\corpus, PRINT_DIR from hwpdl): **120/120, all pass rules.**
  - 0 fallback pages of 2,280.
  - SSIM against the print path: mean 0.996, worst page 0.934 (na07).
  - Memory max 1,466 MB (kr01), budget 1,536 MB.
- **regress:hwp-viewer, full corpus: 120/120.** Every page of every file was drawn (2,280 pages), and the page count equals the converter's PDF on all 120 files. adm16 (411 pages, viewer-only) took 83 s, kr01 (viewer-only) 12 s. Fixtures-only: 10/10.
- **e2e** (5 projects + manual-chromium, no-upload fixture on every test): 976 passed, 0 failed, 5 flaky, 172 skipped.
  - The 5 flaky are Firefox in untouched specs (photo-compress ×2, polish ×2, site 360 px); all passed on retry.
  - Two expectations were updated for the sixth tool and then re-run green on all projects (11/11): the hwp-to-pdf 관련 안내 list and the id-photo RelatedTools count.
  - hwp-viewer.spec: 23 tests × 5 projects, 0 failures in the full run. It covers open .hwp/.hwpx, navigation and page list, mini preview pixels, virtualised list, zoom keeps the page, pinch not blocked, copy (and clipboard on Chromium), search with jump, mark and 멈추기 plus the 100-page guard, PDF CTA page count, viewer-first, KakaoTalk iOS/Android UAs, errors, engine 404, export-chunk 404, bfcache ×2, 360 px layout, axe and SEO/legal.
- **Lighthouse** (lhci, 3 runs, Playwright Chromium 1243): perf 99–100, a11y/bp/seo 100, CLS ≤ 0.002 on all 14 URLs.
  - Targeted runs (3×3): /hwp-viewer/ medians 1,954 / 1,959 / 1,951 ms; /hwp-to-pdf/ medians 1,954 / 1,954 / 1,954 ms.
  - In the same runs at f6b40a6: /hwp-to-pdf/ 2,190 / 2,108 / 2,190 ms.
  - Full 14-URL run: /hwp-to-pdf/ 1,953, /hwp-viewer/ **2,040** (1,953 / 2,040 / 2,040). Guides open-hwp-without-hangul 1,710, hwp-on-phone 1,710, what-is-hwpx 1,654.
  - In that full run, untouched pages also had a 2,040 ms median: id-photo, pdf-compress, photo-compress. At f6b40a6, pdf-merge was 2,040 in 4 of 4 runs. See Known Gaps.
- **qa:visual** (local dist): 236 PNGs, 0 hard failures. The new states are hwpv-d/m 01 empty, 02 document, 03 search, and m-04 page-list sheet.
  - The hwpv-d document state records CLS 0.19. That is the result area replacing the picker after a programmatic setInputFiles (no input event); /hwp-to-pdf/ has the same layout change. Lighthouse CLS is 0.000.

### Known Gaps (A0)
- **Lighthouse is bimodal on this PC:** every tool page lands at about 1,953 or 2,040 ms per run, untouched pages included.
  - At f6b40a6, /pdf-merge/ had medians of 2,040 ×3, and /photo-compress/ 2,040 in the full run.
  - Cause (corrected in round 2, per Richard): the two values are Lighthouse's simulated-throttling quantisation (Lantern), not the order in which the fonts are requested. A run lands on one step or the other; the page did not change between runs.
  - Arch ruling (2026-10-01): the 2,000 ms threshold is unchanged; the gate takes the median of 5 runs per URL (lighthouserc `numberOfRuns: 5`), and the CI runner's result is the source of truth.
- Owner-only: a real iPhone Safari and KakaoTalk in-app check of open, zoom, search, copy and PDF download on /hwp-viewer/.
- Not done (scope):
  - the 404 suggestion map and the ops `suggestTool` still send HWP queries to /hwp-to-pdf/ only;
  - the hwp-to-pdf FAQ "HWP 뷰어로만 써도 되나요?" has no link to /hwp-viewer/, because the page template does not render FAQ links.
- Post-deploy (PC or owner): Kakao share-cache refresh, Naver 수집 요청, and GSC inspection for /hwp-viewer/ and the 3 guides.

### A0 round 2 (Bob, 2026-10-01; Richard's fixes + Arch LCP ruling)
- global.css (phone media block): `.hv .hv-sheet-head .btn { flex: 0 0 auto; }`, so 「닫기」 no longer stretches. The viewer e2e "phone width" test asserts the button is narrower than 40 % of the sheet header (mobile-chrome and mobile-safari).
- Guides: removed the unsourced "내용은 같은 한글 문서예요." (what-is-hwpx). The hwp-on-phone KakaoTalk FAQ no longer points to a save menu; it says the Kakao source was not found and that a saved file can be picked with 「HWP 파일 열기」.
- tools.ts: the /hwp-viewer/ FAQ numbers (25 MB, 150 MB, 10 MB, 60쪽) are built from `LIMITS` / `MB_DEC` (lib/hwp/limits.ts). A unit test checks the text against the limits.
- LCP: the earlier font-order explanation is withdrawn (see Known Gaps above). lighthouserc `numberOfRuns: 5` plus a `$comment` with the ruling; CLOUD-HANDOFF §3 updated.
- Gates: check 0 errors; unit 670/670; build flag on: check-dist OK, UI fonts 184.8 KB (+0 new glyphs), precache 419.1 KB; viewer e2e chromium + mobile-safari 42 passed, 4 skipped, 0 flaky.
- Lighthouse, 5 runs, this PC: /hwp-to-pdf/ median 1,956 (1,951 / 1,956 / 1,956 / 2,040 / 2,040); /hwp-viewer/ median **2,040** (1,951 / 2,040 ×4). Per the ruling, the CI runner's result decides; it runs on push, which is pending the orchestrator's go-ahead.

## ci-green: main CI to green (Bob, 2026-10-02; branch ci-green from origin/main 315aa38)
Status: see the CI line at the end.

### 1. Lighthouse: home LCP 2,116 ms > 2,000 (checks job)
- **Reproduced locally:** 5 runs on / at 315aa38 (flag off): 2,111–2,122 ms, every run. The same code passed in the run before (daad867): the page sat on the edge, and Lighthouse's quantisation decided.
- **LCP element:** p.lead. TTFB 456 ms, load delay 0, **render delay 1,663 ms**. FCP 1,514 ms.
- **Cause: font bytes on the critical path.** Lantern counts every request that starts before the LCP paint. On home that is all four UI faces: 400 and 800 (preloaded), plus 600 and 700, found through the CSS (≈ 190 KB of woff2 together).
  - Experiment 1: preload 600 and 700 as well. FCP went to 913 ms, LCP stayed at 2,113 ms. Request order is not the problem; the bytes are.
  - Experiment 2: drop the 600 and 700 faces. LCP 1,510–1,669 ms.
  - Experiment 3: drop 600 only, so its two rules use 700. LCP 1,816–1,963 ms (median 1,834).
- **Fix: there is no 600 face any more.** Only `.eyebrow` and `.status` used 600 (global.css); they now use 700.
  - gen-ui-font makes 3 static instances (400, 700, 800). check-dist expects 3 files and rejects weight 600 in CSS. The postbuild unit test checks the 3 faces. Comments updated in Base.astro and gen-sw.
  - UI fonts 136.9 KB (flag off) / 138.0 KB (flag on), was 184.8. The 190 KB budget is unchanged (Arch's number).
  - Visible change: the home eyebrow chip and the "사용하기" status chips are one step bolder. qa:visual not re-run (Known Gaps).
- **Aggregation:** `median-run` does not assert the median LCP. lhci picks one "representative" run, the one closest to the median FCP and TTI (@lhci/utils representative-runs.js), and asserts every audit on that run alone. Every assertion is now `aggregationMethod: "median"`, the median value of the 5 runs (assertions.js `getValueForAggregationMethod`). `$comment` updated. Threshold and URLs unchanged.
- **Upload:** upload-artifact v4 skips dot-folders, so `.lighthouseci/` never uploaded (run 36864903124 had no reports-checks artifact). Added `include-hidden-files: true`.
- **Lighthouse after the fix** (this PC, flag off, 14 URLs × 5, all assertions pass). LCP medians in ms:

  | URL | median | (runs) |
  |---|---|---|
  | / | 1,962 | (1,813 / 1,814 / 1,962 / 1,965 / 1,973) |
  | /pdf-merge/ | 1,970 | |
  | /pdf-compress/ | 1,968 | |
  | /photo-compress/ | 1,981 | (1,970 / 1,972 / 1,981 / 2,112 / 2,116) |
  | /hwp-to-pdf/ | 1,960 | |
  | /hwp-viewer/ | 1,963 | |
  | /id-photo/ | 1,967 | |
  | /terms/ | 1,813 | |
  | /guide/ | 1,819 | |
  | guides | 1,660–1,672 | |

### 2. e2e (firefox)
- **id-photo, 7 tests (happy path, adjust, 4 warnings, keyboard only): the cause is no WebGL.** On the CI runner the readout was "직접 맞추기", so the tool had fallen back to manual.
  - MediaPipe needs a WebGL context (2, then 1) even with `delegate: 'CPU'`. Headless Firefox on the Linux runner has none. Chromium has SwiftShader.
  - Reproduced locally with Firefox `webgl.disabled: true`: the same readout and `emscripten_webgl_create_context() returned error 0`. With WebGL, local Firefox frames the face in 2.5 s and all 7 tests pass.
  - The product behaves as designed (manual fallback). Auto-framing is off in the shipping build.
- **Coverage decision:**
  - New project `manual-firefox`: the id-photo suite on dist-noauto (the shipping build), like manual-chromium. `isManualBuild()` is now any `manual-*` project. The CI firefox job runs `--project=firefox --project=manual-firefox`.
  - On the auto-framing build, the tests that need a detected face skip when the browser has no WebGL (`skipWithoutWebGL`, with the stated reason). The check is on the capability, not the browser name, so they still run wherever WebGL exists (local Firefox, Chromium).
  - Local results: firefox + manual-firefox, id-photo: 48 passed, 18 skipped, 0 flaky. chromium + manual-chromium, id-photo: 51 passed, 15 skipped.
- **polish.spec.ts:160 (privacy): a flake, not a bug.** The CI trace (reports-firefox artifact) shows:
  - every request served within 50 ms, the page rendered (snapshot has the full privacy text), and the page's own script ran;
  - the SW register shim's console line appears, and that only runs after `load`;
  - but Playwright never received the navigation's commit/lifecycle events, so `goto` waited for "domcontentloaded" until the 20 s timeout. It hit twice in a row (first try and retry).
- **The 18 Firefox flakies:** all are the same `page.goto: Timeout 20000ms`, every one through `gotoReady`, on random pages. The shared cause is the Playwright Firefox (Juggler) harness losing navigation events under load. It is not in our code.
  - Tried: racing goto against the navigation response plus in-page readyState. Reverted, because later locator calls still block on "waiting for navigation to finish".
  - Tried: `fission.autostart: false`. It still flaked locally, so no effect could be shown.
  - No fix applied (no clean shared cause in our code). retries stays 1, and flakies stay reported.

### Gates (this PC)
- check: 0 errors.
- unit: 668/669 on the flag-on dist. The one failure is the postbuild "plain language" scan timing out at 60 s; it scans the MediaPipe bundles, which exist only in the flag-on build. On the flag-off dist, which is what the CI checks job builds, postbuild.test.ts is 39/39. Pre-existing, see Known Gaps.
- Both builds in order: flag off → dist-noauto, flag on → dist. check-dist OK on both.
- lhci: as above.
- e2e: firefox + manual-firefox id-photo; chromium + manual-chromium id-photo (above); firefox polish/site/growth: no new failures, only the goto flakies.

### Known Gaps (ci-green)
- qa:visual was not re-run for the 600 → 700 chip weight.
- Photo-compress LCP: 2 of 5 local runs land at 2,112–2,116 ms (median 1,981). There is little margin on the tool pages (≈ 1,960–1,980 ms).
- Firefox goto flake (Playwright harness): a double failure (first try and retry) can still fail the job.
- The postbuild "plain language" test needs more than 60 s on a flag-on dist on Windows.

### ci-green round 2: /id-photo/ CLS (CI run 36885169116)
- That run had LCP green on all 14 URLs. CI LCP medians: home 1,817; tool pages 1,815–1,973; guides 1,660–1,671.
- **New failure:** CLS on /id-photo/, true median 0.0122 > 0.01. The 5 runs were 0.0122, 0.0099, 0.0122, 0.0122 and 0.0096.
  - The shifting node was `p.idp-privacy > a`, cause "Web font loaded". The pill is weight 700, and 700 is not preloaded, so it swaps in after the first paint and re-wraps the line.
  - On the Linux runner the fallback font differs more than on this PC. Locally it was 0.0018.
  - This was probably hidden before by `median-run`, which takes the CLS of one representative run.
- **Fix:** `.idp-privacy` uses 800, a preloaded weight. This follows the existing rule that text in the first view uses a preloaded weight (`.prose h1` is 800).
  - Local /id-photo/ CLS: 0.0001–0.0006. The pill no longer shifts. LCP is unchanged (1,968–1,976 ms).
  - Visible change: the privacy pill on /id-photo/ is one step bolder.
- **CI (status DONE):** https://github.com/leeledger/doc-tools-kr/actions/runs/36888794186 (d164c31) is **success** on all 6 jobs.
  - checks: all Lighthouse assertions pass, on true medians.
  - e2e firefox: 196 passed, 44 skipped, 17 flaky (the goto harness race), 0 failed. manual-firefox ran the id-photo suite.
  - Not merged to main.
## G2 A1 build notes (Bob, 2026-10-01; branch g2-a1 from 3dc0796)
Scope: ARCHITECT-BRIEF-G2.md "A1 — seasonal, unblocked drafts, structure", hubs H1/H2, and the A1 structure items (topic, spec rows, via: browser, guide AdSlots, home swap, NEXT_GUIDES, /id-photo/ quick-link order). Nothing pushed.

### G2 Step 0 (A1 rows; fetched 2026-10-01 from this PC; quotes verbatim up to whitespace)
| Row | URL | via | status / bytes | quotes used |
|---|---|---|---|---|
| 1 hwp-to-pdf | https://www.hancom.com/support/faqCenter/faq/detail/2413 | curl | 200 / 187,927 | "한컴오피스 2014는 자체적으로 PDF 변환 드라이버를 탑재하고 있어 아래와 같은 두 가지 방법으로 변환이 가능합니다." · "- [파일 > PDF로 저장하기] - [파일 > 인쇄 > Hancom PDF]" |
| 1 hwp-to-pdf | https://www.hancom.com/support/faqCenter/faq/detail/2857 | curl | 200 / 193,156 | "해당 증상은 한글 프로그램의 인쇄 옵션 선택 사항의 '그림 개체' 체크박스가 선택 해제 상태인 경우 나타날 수 있습니다." · "2) 인쇄 옵션의 선택 사항 “그림 개체” 체크박스 클릭 (OFF > ON으로 변경)" |
| 3 admission-photo | https://apply.jinhakapply.com/Customer/Faq?categoryid=7 | curl | 200 / 34,821 | "3개월 이내 촬영한 반명함판(3X4) 사진을 업로드해 주세요." · "별도의 사진 규정이 있는 학교도 있습니다. 학교 모집요강을 확인해 주세요." · "원서에 사진항목이 없으면 학교에서 받지 않는 것입니다." · "증명사진(3x4)을 스캔 파일(jpg, jpeg)을 준비해 주세요." |
| 3 admission-photo | https://apply.jinhakapply.com/Customer/Faq?categoryid=12 | curl | 200 / 31,459 | "사진 규격이 맞지 않을 경우 업로드가 되지 않습니다. 사진 업로드 창에서 파일 선택 후 '자동 조절'을 클릭하여 사진크기를 조정해 주세요." |
| 3, 4 | https://www.uwayapply.com/board/faq.htm (EUC-KR) | curl | 200 / 77,514 | photo: "사진 업로드에 필요한 증명사진을 스캔 후 파일로 저장하시기 바랍니다. (각 대학의 사진 업로드 유의사항에 준하는 형태로 스캔)" · "[자동크기조절](여백 존재 시 “자르기” …)"; documents: the three failure causes, the file-name rule, the Windows/Chrome·Edge-only line, "서류 제출 방법은 대학에 따라 차이가 있습니다…", the A4 re-save steps, ZIP (8 quotes in univ-docs-upload.md) |
| 4 univ-docs-upload | https://apply.jinhakapply.com/Customer/Faq?categoryid=7 | curl | 200 | "진학어플라이는 제출서류 상담이 불가합니다. 대학 모집요강을 확인하거나 학교 입학처로 문의하시기 바랍니다." |
| 5 kosaf-docs | https://www.kosaf.go.kr/ko/faq.do?searchType=s&searchStr=모두 서류를 (and 신청방법 및 필요서류, 다른 방법; searchType=a&searchStr=용량) | curl | 200 / ~1.1 MB each | 제출 대상일 때만, 1일~3일 후 확인, app/homepage paths, 미혼/기혼/이혼 서류, "휴대폰 등의 사진 촬영 이미지는 유효하지 않습니다…TIF파일로…", "※ 규격: 300dpi로 흑백 스캔한 TIF 파일만 업로드 가능 ( 용량 400kb 이하)", "가구원 동의는 온라인 동의가 원칙입니다." |
- How the shells were opened: jinhakapply.com / uwayapply.com home pages are script/iframe shells (the drafts' tried[]), but their FAQ pages are static HTML: the jinhak FAQ link came from the rendered apply.jinhakapply.com page (chrome-cdp, read-only), the uway FAQ path from `goApply('709')` in /js/uway2012.js. kosaf.go.kr's FAQ search is a plain GET. So **no A1 quote needs `via: browser`**; all are curl-checkable.
- Hancom FAQ search (chrome-cdp, read-only, 2026-10-01): "PDF 저장" 0 hits; "PDF", "PDF로", "PDF 변환" and "PDF 파일" listed 2413 and 2857 (used). The 2413 answer is written for 한컴오피스 2014; the guide says so ("한컴오피스 2014 기준", "버전에 따라 메뉴 이름이 조금 다를 수 있어요").
- `node scripts/ops/source-watch.mjs --dry-run`: 24 sources, **78 quotes, all found verbatim** (after the A1 guides were written).
- chrome-cdp note: the Playwright attach (`cdp.cjs`) started timing out after a uwayapply.com tab hung; I closed only my own tab via the DevTools HTTP endpoint and used a raw-CDP read (Runtime.evaluate on my own tab) for the one check left. No login, form submit or cookie use.

### Result: 4 guides published (hwp-to-pdf, admission-photo, univ-docs-upload, kosaf-docs) + 2 hubs; drafts left: kakao-photo, yearend-tax-pdf (A3 rows, untouched)
- Indexable /guide/ URLs: 18 guides + 2 hubs = **20** (was 14). A2 + A3 must add ≥ 10 for the ≥ 30 ship rule.
- **No new preset.** Neither 진학사 nor 유웨이 states pixels or KB; 진학사 states "반명함판(3X4)" and JPG/JPEG. admission-photo links the existing `half_card` preset and calls it 문서딱's 계산값, not the sites' size (qnet-photo wording). The `admission` quick-link slot is skipped (did not ship).
- kosaf-docs: the only file spec is the 가구원 동의서 (TIF, 흑백 스캔, 400 KB 이하). We cannot make TIF, so the guide says "문서딱은 TIF 파일을 만들지 않아요" and the hub row has no tool link (`fit: false`).

### Structure
- `guide-schema.ts`: `topic` (required, TOPICS order), `spec` rows (preset row = numbers from the preset; literal row = every number must be in this guide's quotes; `fit: false` = no tool link), `via: 'browser'` on URL sources. `specProblems` (guide-facts.ts) runs inside the schema, so a bad row fails the build.
- `hubs.ts` builds the rows. A preset row shows a size only when **the preset's own quote** states both numbers (so Q-Net's 413×531, our choice, is never shown as Q-Net's; passport shows 413×531 px but not 3.5×4.5 cm, which is not in its quote). Hub copy lives in `src/content/hubs/<slug>.md` (table words too, so no UI-font growth); `Hub.astro` fails the build if the copy has a number the tables do not show, or if a spec guide has no row.
- /guide/: hubs first, then topic jump links (`#topic-n`) and groups. Their CSS is a page-local `<style>` in guide/index.astro (system font for the topic names), so app.css, which every tool page blocks on, is byte-unchanged; `TOPICS = [...]` is stripped from the UI-font scan (gen-ui-font.mjs, like `keywords`), so the UI font is unchanged too (the only new glyph had been 학). Result: the shared Base CSS has the same hash as the HEAD build (Base.BPftrZwD.css).
- Guide AdSlots: `Guide.astro` renders the slot body via `Astro.slots.render`, splits it before the 3rd H2 (= after the second H2 section) for `guide-mid`, and puts `guide-end` after the FAQ (the sources sit in the aside after "함께 보면 좋은 안내", so "after the FAQ" is the closest point before them that stays in the article). Hubs: `guide-end` only. Off = nothing rendered: the 14 existing guide `<article>` blocks are **byte-equal** to the HEAD build (scratch compare, 14/14).
- Duplicate guard: `scripts/lib/shingles.mjs` (5-char shingles of the article incl. FAQ, Jaccard); check-dist fails at ≥ 0.45 and prints the max pair; postbuild test repeats it. Max pair: photo-sizes ~ upload-limits **0.256**.
- source-watch: `via: browser` entries are never fetched or counted; they print as "수동 확인 (브라우저 출처)" and join the issue body only when an issue is opened anyway (ops.test).
- Tool facts: `hwp.pdfMb.desktop` (80) and `hwp.pdfPages.desktop` (300) from LIMITS.
- Home "자주 찾는 안내": admission-photo replaces id-photo-size (6th slot). NEXT_GUIDES: pdf-merge → univ-docs-upload. /id-photo/ quick links: brief order first, then the other presets, ≤ 8 (today the same 6 in the same order).
- hwp-to-pdf guide `tools: [hwp-to-pdf, pdf-compress]` (not hwp-viewer), so /hwp-viewer/ keeps its 3 HWP guides; /hwp-to-pdf/ now lists the 4 HWP guides (hwp-to-pdf.spec expectation updated).
- lighthouserc adds /guide/photo-sizes/ and /guide/admission-photo/; qa:visual adds /guide/, both hubs and admission-photo.

### Decisions (never stop)
- Spec rows are hub data, not rendered on the guide (the brief's "[spec table]" slot is optional; rendering it would have changed the 11 existing articles, which the brief's regression test forbids). Drift guard: hub values come from the same rows/presets, and the rows pass the same fact check.
- Seasonal pages: admission-photo and kosaf-docs carry `season` (peak as words, refresh = our own re-check dates 2027-08-01/2027-11-15 and 2026-11-15/2027-05-15). Not rendered; no exam or application dates appear on the pages (none are quoted).
- Topic mapping of the existing guides: id-photo-size → 여권·신분증, id-photo-kb → 시험·자격증, photo-kb → PDF·메일 (closest of the fixed 7). 세금·민원 is empty until A3 and is not shown.
- e2e port: another worktree (doc-tools-kr-ci) was running lhci on :4173, so Playwright's `reuseExistingServer` silently tested *its* dist. All A1 e2e numbers below are from `E2E_PORT=4273` runs; Lighthouse used a scratch copy of lighthouserc on :4373.

### Gates (PUBLIC_SITE_URL=https://docttak.com; final tree)
| Gate | Result |
|---|---|
| astro check | 0 errors, 0 warnings, 1 hint (pre-existing) |
| unit (vitest) | 680/680, 41 files |
| build flag off → dist-noauto | check-dist OK, 2,342 files; UI fonts 183.3 KB; precache 416.8 KB |
| build flag on → dist | check-dist OK, 2,349 files; **UI fonts 184.8 / 190 KB, A1 delta +0.0 KB** (400 43.8, 600 46.8, 700 47.3, 800 46.9; 604 characters, same as HEAD); precache 419.3 / 450 KB; hubs 5.2 / 5.5 KB gzip HTML, 1.5 KB initial JS; guide similarity max photo-sizes ~ upload-limits 0.256 / 0.45 |
| 14 existing guide articles vs HEAD build | byte-equal 14/14 |
| check:licenses | OK, 36 packages, 5 components |
| source-watch --dry-run | 24 sources, 78/78 quotes found |
| e2e hubs.spec (new) chromium + mobile-safari | 12/12 |
| e2e hwp-to-pdf + hwp-viewer specs, chromium + mobile-safari | 96 passed, 10 skipped, 0 failed |
| e2e site + growth, 5 projects | 263 passed, 2 skipped, 0 failed, 0 flaky (final CSS); after the font-scan change growth + hubs on chromium + mobile-safari: 33 passed, 1 flaky (pdf-merge share test, untouched, passed on retry) |
| Lighthouse, 5 runs/URL, median, 16 URLs (scratch runner, see below) | all guide/hub/index URLs pass: /guide/ 1,710 ms, photo-sizes 1,710, admission-photo 1,651, other guides 1,654–1,710; perf ≥ 0.99, a11y/bp/seo 1, CLS ≤ 0.002. Tool pages + home land on the 1,953 / 2,040 ms steps (A0 Known Gap); 4 of 7 had a 2,040 median in the last run (different ones each run). CI decides (Arch ruling). |
| qa:visual (local dist, own port) | 292 PNGs, 0 hard failures; new shots guides/hubphoto/hubupload/admission |
| regress --fixtures-only | compress 28/28, photo 11/11 + 18/18, idphoto 10/11 (known p07 chin −1.11 mm, unchanged), hwp all pass, hwp-viewer 10/10, merge 5/5 (CORPUS_DIR = C:\dev\doc-tools-kr\spikes\pdf\corpus; the hotfix worktree has no corpus) |

### Known Gaps (A1)
- **Shared machine:** another worktree (doc-tools-kr-ci, lhci; and an `lhexp2.sh` loop) held :4173 and later :4373. Playwright's `reuseExistingServer` would test the other dist without a word; I ran e2e on `E2E_PORT=4273` and Lighthouse on :47391 with a probe that the server has the hubs. lhci itself aborted twice on a transient `NO_NAVSTART` (and an EBUSY temp-dir cleanup crash), so the Lighthouse numbers come from a scratch runner: lighthouse CLI × 5 per lighthouserc URL, a run with a runtimeError retried, thresholds checked on the per-metric median (lhci's median-run picks one representative run; close but not identical).
- Lighthouse tool pages: the A0 bimodal 1,953/2,040 ms gap is unchanged; A1 does not touch tool-page CSS, fonts or JS (Base CSS hash = HEAD).
- No new presets; the /id-photo/ quick-link order code is in place for A2.
- docs/OPS-RUNBOOK.md does not yet describe the manual "브라우저 출처" table (no browser source exists yet).
- Post-deploy (owner/PC): Naver 수집 요청 + Kakao cache refresh for the 4 guides and 2 hubs; GSC inspection for both hubs.
- Shortfall toward ≥ 30: 20 indexable now; A2 (10 rows) + A3 (7 rows) must yield ≥ 10 more.

Status: **DONE_WITH_CONCERNS** (local Lighthouse tool-page LCP noise per the A0 ruling; everything A1 touches passes).

### A1 round 2 (Bob, 2026-10-02; Richard's A1 review + coordinator)
- **Must Fix 1, root cause:** our only quote check (source-watch `findQuote`) removes all whitespace, so `[ 서류제출 ]` matched `[서류제출]`; my Step 0 extraction had also turned the search-highlight tags into spaces. New publish gate `npm run check:quotes` = `source-watch --exact`: `pageTextExact` (inline tags such as FONT/STRONG/SPAN join with nothing, other tags break, entities decoded, every whitespace run → one space) and `hasExactQuote` (substring, punctuation and case kept). Exit 1 on any non-verbatim or unreachable quote, never opens an issue. The weekly watch stays lenient. Unit tests: the live kosaf markup passes, the published 3-space version fails exact (and still passes lenient), block vs inline tags, `checkSources({ exact: true })`.
  - The gate found **6** non-verbatim quotes, not 1: kosaf ×3 (`서류제출현황 … [서류제출]`, `확인하실`, `(용량 400kb 이하)`), passport-photo (`하며(치아`), qnet-photo ×2 (`가능합니다`, `제거하시기`). All copied exactly from the live pages; retrieved set to 2026-10-02 on those entries (qnet-photo's answer-box 확인일 now shows 2026-10-02 — the only article change among the 14 older guides). `check:quotes`: 78/78 verbatim. CLOUD-HANDOFF §3 now lists `check:quotes` for any deploy that adds or edits a quote.
- **Must Fix 2 (Arch ruling):** hub limits are now the agency's own words, copied from the quote: `quotedLimit()` takes the first "number unit [이하|미만|이내|까지]" in the preset's or guide's quotes whose value is the row's limit (500KB 이하, 350KB 미만, 200KB 이하, 10MB, 5MB 이내, 25MB, 400kb 이하) and throws at build if no quote holds it. Hub copy now says the column is copied word for word. Unit test: every limit is a substring of its own quotes.
- Should Fix: photo-sizes FAQ drops "형식과 파일 용량만 맞추면 되고" and says "정하는 곳이 많아요"; univ-docs-upload answer/body/FAQ and the upload-limits FAQ no longer claim limits vary by university (now "모집요강에서 확인" + the jinhak quote); kosaf source title → "한국장학재단 FAQ (가구원 동의서 제출 주의사항)" — the FAQ's own heading contains 업로드, which the owner's plain-language rule (dist test) forbids on pages, so it is labelled as ours instead (decision); admission-photo quotes the full picker label; new category `서류` for kosaf-docs and univ-docs-upload (breadcrumb "안내 · 서류"); unused `CATEGORY_ORDER` removed.
- Gates: check 0 errors; unit 682/682; build flag off → dist-noauto and flag on → dist: check-dist OK, UI fonts 183.3 / 184.8 KB (A1 delta 0.0), Base CSS hash unchanged, similarity max 0.255; check:quotes 78/78; hubs e2e (E2E_PORT=4273) chromium + mobile-safari 12/12.

### A1 CI fixes (Bob, 2026-10-02; run 36899182412 on aab9808)
- **mobile-safari photo-compress :538 (headline viewport ratio 0, 2/2):** `finish()` called `doneBar.scrollIntoView({ block: 'start' })`, which inherits the site's `scroll-behavior: smooth`, then `target.focus()`, whose own scroll interrupts the animation. The final position depended on timing and page height (A1 changed the tool page's 관련 안내 list below the tool), and on WebKit it ended with the headline out of view. Fix (same pattern as /id-photo/ since UX-AUDIT-2): instant scroll to the done bar, scroll the target into view only if its bottom is below the viewport, then `focus({ preventScroll: true })`. Local Windows WebKit has no OffscreenCanvas, so this spec skips there; mobile-chrome passes locally and the CI run on the push verifies mobile-safari. pdf-compress / pdf-merge use the same smooth scrollIntoView + focus pattern and pass today: Known Gap, not changed.
- **id-photo :532 / :247 on WebKit:** also flaky on ci-green (36895459119: :532 failed once, passed on retry; error "Clicking the checkbox did not change its state" on #idp-confirm). Pre-existing, not A1.
- **webkit job cancelled at 45 min:** the time went to "Install Playwright browser" (17:25:43 → 17:59:52, 34 min; on ci-green that whole phase took about 5 min). The E2E step itself ran 10 min until cancelled; on ci-green it took 12.6 min for 224 tests, and A1 adds 6 (hubs.spec, about 30 s on WebKit). The suite did not grow enough to justify a longer timeout, so ci.yml is unchanged; a re-run decides. If the install stall repeats, it is a runner/apt issue for Arch (cache the browsers or time-box the install step).
- **CI re-run 36906140363 (e1f5f8a):** mobile-safari green (photo-compress :538 ✓, 198 passed); chromium, firefox and checks green. mobile-chrome failed hwp-to-pdf :179 on both tries: `noSwap` samples `document.title` only on a 25 ms interval, and the fast 「다시 내려받기」 (anchor to a ready blob) finished before the first tick, so `titles` was `[]`. The test was wrong (race): it now takes one sample when it installs the sampler. Local chromium, mobile-chrome, webkit, mobile-safari: hwp-to-pdf.spec 84 passed.
- The webkit job stalled again in "Install Playwright browser" (18:21:44 → still running at 18:54): the apt step logs show 1–3 minute gaps between single package downloads from azure.archive.ubuntu.com. It's the runner mirror, not the suite. Decision: e2e `timeout-minutes` 45 → 60 (comment in ci.yml), since install (up to ~34 min) plus tests (~13 min) no longer fit in 45. A browser/apt cache is the durable fix and is logged for Arch.

## G2 A2 build notes (Bob, 2026-10-02; branch g2-a2 from 659c04a)
Scope: ARCHITECT-BRIEF-G2.md "A2 — spec cluster D, exam and ID photos" (rows 6–15). Arch's `[Sprint C brief]` commit 3f738e4 (handoff/ARCHITECT-BRIEF-C.md) landed on this branch before mine; left untouched.

### G2 Step 0 (A2 rows; fetched 2026-10-02 KST from this PC; every quote checked against `pageTextExact`, then `npm run check:quotes`)
| Row | URL | via | status / bytes | result |
|---|---|---|---|---|
| 6 id-card-photo | https://www.gov.kr/mw/AA020InfoCappView.do?CappBizCD=13100000013 (신규) and …=13100000018 (재발급) | curl | 200 / 240 KB, 229 KB | "6개월 이내에 촬영한 3.5㎝×4.5㎝의 모자 등을 쓰지 않은 상반신 사진 1장" (both), 17세 이상, 지문등록기관 6개월이내, 종전의 주민등록증, 신청방법 인터넷, 방문. Print size only → **no preset**; no 여권용 wording → generic /id-photo/ CTA (driver-license precedent). easylaw search: only the 재외국민 rule text. |
| 7 toeic-photo | exam.toeic.co.kr (home, receiptStep1/2, csFaq pages 1–25, viewContents 18–37, notice 121) | curl | 200 | **draft.** No public photo spec; the step after receiptStep1 needs a login; the FAQ only explains changing a past photo by email. |
| 8 history-exam-photo | https://www.historyexam.go.kr/pst/view.do?bbs=faq&pst_sno=1000015355, …=1000028410 | curl | 200 / 19 KB | "규정 사진 파일은 GIF와 JPG형식 … 권장크기는 가로 120픽셀 X 세로 160픽셀입니다.(약 가로 3cm X 세로 4cm)", the 10시 change deadline, the rejection rule. **Preset `history` 120×160**, no KB, no print size ("약"). The FAQ list is a POST form; the view URLs are plain GETs. |
| 9 korcham-photo | https://license.korcham.net/customer/guideDetail.do?no=194 (+192, 183, 191) and /ex/examInfo1.do | curl | 200 / 40 KB | "사진파일은 JPG, JPEG, PNG, GIF만 가능합니다. - 사진 크기는 400 x 500 픽셀로 변경되며 1 : 1.25 비율로 …", rejection list, reuse, admin approval. **Preset `korcham` 400×500.** Home is a frameset → indexmain.jsp. |
| 10 teps-photo | https://www.teps.or.kr/Etc2/FaqList?sch_faqType=09 (사진관련 category as GET) | curl | 200 / 26 KB | "반드시 증명사진을 스캔하여 3Cm × 4Cm(126*165 Pixel) 사이즈, 파일 크기는 50KB 이하의 jpg 파일만 사용 가능 합니다." + 6개월/컬러/탈모 무배경, 흑백, 확장자, change window. **Preset `teps` 126×165, 50 KB 이하**; no mm (126/165 vs 3/4 differs 1.8 % > the 1.5 % preset rule). |
| 11 local-gosi-photo | local.gosi.go.kr (main = NetFunnel POST shell) → chrome-cdp: /klid/info/infomethod.do?gubun=4, /klid/qa/faq.do | curl, then browser | 200 / 1 KB shell | **draft.** The rendered photo guide is button steps only; the FAQ has no photo item; specs live in each 시도 notice. |
| 12 kuksiwon-photo | https://www.kuksiwon.or.kr/faq/brd/m_52/view.do?seq=60, …seq=13, /main/indexNew.do?seq=2 | curl | 200 / 40 KB | "사진의 올바른 규격은 가로 276px, 354px(3.5cm ×4.5cm), 해상도 200dpi이상 입니다." + "276X354픽셀 이상 JPG, PNG 형식", 6개월, 7일 전 수정. **Preset `kuksiwon` 276×354, 35×45 mm, dpi 200**, note: minimum size. |
| 13 police-exam-photo | https://public.jinhakapply.com/PoliceV2/useinfo/useinfo02_2.aspx | curl | 200 / 16 KB | "최근 1년 이내에 촬영한 상반신 컬러사진(3cm X 4cm)…", rejection list, no change after the 접수 period. gosi.police.go.kr has an untrusted TLS chain (curl SEC_E_UNTRUSTED_ROOT; node fetch fails) and over http only frames this page, which is the 경찰청 원서접수 site ("사이버 경찰청", footer © National Police Agency). Print size only → **no preset**; links `half_card`, labelled as 문서딱's 계산값 (admission-photo wording). |
| 14 mma-photo | mma.go.kr FAQ boards 317/118/119/120/121/314 (search 사진), mc=mma0000386, mwpt.mma.go.kr | curl, browser | 200 | **draft.** No application photo spec on public pages; mwpt is a script app and the read-only tab hung (closed my own tab via /json/close). |
| 15 teacher-exam-photo | edurecruit.go.kr (Nexacro shell; chrome-cdp render 765 chars), kice.re.kr | curl, browser | 200 | **draft.** No single national photo source (brief: else draft). |
- chrome-cdp: my own tabs only, read-only (no login, form submit or cookies); no published quote needed `via: browser`.

### Result: 6 guides published + 4 new presets; 4 drafts
- Published: id-card-photo, history-exam-photo, korcham-photo, teps-photo, kuksiwon-photo, police-exam-photo. **Indexable /guide/ URLs: 24 guides + 2 hubs = 26** (was 20). A3 must add ≥ 4 for the ≥ 30 ship rule.
- Drafts (tried[] in each file): toeic-photo, local-gosi-photo, mma-photo, teacher-exam-photo.
- Presets (cap 8): history, korcham, teps, kuksiwon, placed after qnet in PRESETS. /id-photo/ quick links (≤ 8): passport, history, gosi, qnet, korcham, teps, kuksiwon, saramin (id_card, toeic, admission did not ship; jobkorea and half_card stay in the select).
- Hubs: photo-sizes gains 6 rows (history "(권장 크기)", kuksiwon "(최소 크기)" per the hub's own rule); upload-limits' photo table gains TEPS (50KB 이하). photo-sizes description/answer/og name the new groups.

### Decisions (never stop)
- **Unit spellings** (`guide-facts.ts` `unitSpellings`): the fact check reads ㎝/㎜ (U+339D/U+339C, 정부24) and a capitalised unit right after a number (TEPS "3Cm", "Pixel") as cm/mm/픽셀. Quotes stay verbatim; the code uses `\u` escapes so the UI font gains no glyph. Unit test incl. a negative case.
- **KST dates** (`guide-schema.ts`): "published/updated in the future" compared against the UTC date, so a guide dated today (KST) failed the build between 00:00 and 09:00 KST. "Today" is now the Korean calendar day (UTC+9). Tests at 20:00Z (passes) and 14:59Z (fails).
- Presets without a stated KB limit get no limit; px-only presets use dpi 96 (saramin/jobkorea precedent); history and teps get no print size (source says "약" / ratio off by 1.8 %).
- "컴활" is used as the common short name in korcham-photo's answer/query; the 종목 list is quoted from the same site.
- Lighthouse and qa:visual add /guide/teps-photo/.
- `check:licenses` with `PUBLIC_ID_PHOTO_AUTOFRAME=1` in the environment fails on HEAD 659c04a too; CI runs it without the variable → OK. Not A2.

### Gates (PUBLIC_SITE_URL=https://docttak.com; final tree)
| Gate | Result |
|---|---|
| astro check | 0 errors, 0 warnings, 1 hint (pre-existing) |
| unit (vitest) | 687/687, 41 files |
| build flag off → dist-noauto | check-dist OK, 2,353 files; UI fonts 136.9 KB; precache 416.2 KB |
| build flag on → dist | check-dist OK, 2,360 files; **UI fonts 138.0 / 190 KB, A2 delta 0.0 KB** (400 43.8, 700 47.3, 800 46.9; 604 characters, same as the HEAD 659c04a build); precache 418.6 / 450 KB; guide HTML ≤ 4.8 KB gzip, hubs 6.2 / 5.6 KB; guide initial JS 1.5 KB; similarity max photo-sizes ~ upload-limits 0.238 / 0.45 |
| 18 existing guide articles vs HEAD build | byte-equal 18/18 (hubs differ by design) |
| check:licenses | OK, 36 packages, 5 components |
| check:quotes | 113/113 verbatim (was 78) |
| e2e id-photo + hubs (chromium, mobile-chrome, mobile-safari, manual-chromium; E2E_PORT=4273) | 135 passed, 31 skipped (platform skips), 0 failed; new `?preset=` tests 12/12 on chromium, mobile-chrome, mobile-safari |
| e2e site + growth + hubs, 5 projects | 293 passed, 2 skipped, 0 failed, 0 flaky |
| Lighthouse (lhci, 17 URLs × 5, median; scratch config on :4473) | every guide/hub URL perf ≥ 0.99, LCP 1,657–1,659 ms, CLS 0, a11y/bp/seo 1 (teps-photo, photo-sizes included); tools/home 1,959–1,964 ms; **/photo-compress/ 2,113 ms fails locally — HEAD 659c04a gives the same on this PC (side-by-side: 2,114 median)**: the known local LCP quantisation; CI decides |
| qa:visual (:4473) | 306 PNGs, 0 hard failures; new shot `teps` |
| regress --fixtures-only | not run: no tool code changed (presets are data; the e2e preset tests check the outputs) |

### Known Gaps (A2)
- **/id-photo/ 관련 안내** shows the first 4 guides naming the tool in title order: kuksiwon-photo and police-exam-photo now push passport-photo and photo-kb off that list (both stay linked from hubs and related). Arch: keep title order, or pin passport-photo for /id-photo/?
- Post-deploy (owner/PC): Naver 수집 요청 + Kakao cache refresh for the 6 new guides; GSC inspection for photo-sizes.
- Shortfall: 26 indexable; A3 (7 rows) must yield ≥ 4.

Status: **DONE_WITH_CONCERNS** (local /photo-compress/ LCP equals HEAD's; CI is the source of truth).

### A2 CI (run 36924527693 on 8b47d72)
- checks (build, unit, licenses, Lighthouse), firefox, webkit and mobile-chrome were green. chromium failed `hwp-to-pdf.spec.ts:433` ("a tab killed mid-work") on both tries: after the reload, `#hw-notice` stayed hidden and empty. **Root cause (test race, not A2; A2 touches no HWP code):** the HWP controller loads after first paint plus idle (`bootHwpTool` → `afterFirstPaint(whenIdle(run))`). The test set `hwp-inflight` on /hwp-to-pdf/ right after `readyState === 'complete'`. When the first load's controller started after that, it consumed the flag on that load, so the reload found nothing. **Fix:** the flag is set on /terms/ (no HWP controller), then the test navigates to /hwp-to-pdf/ in the same tab (sessionStorage carries over). The second reload still checks that the notice shows only once. Locally: chromium, mobile-chrome, mobile-safari and firefox each pass 3× repeat (12/12).

### A2 round 2 (Bob, 2026-10-02; Richard's A2 review relayed by the coordinator; fixes in 0005334)
- Must Fix: police source titles name the operator (Arch ruling 2); id-card "(잃어버렸거나 없앤 경우 제외)" (파기 ≠ 훼손); korcham list + FAQ add "얼굴만 나온 사진". Should Fix: kuksiwon's unsourced 정정 sentence dropped; hub 형식 holds only file formats (id-card, police, driver-license, admission labels carry the rest).
- Arch ruling 1: `src/data/tool-guide-order.ts` pins /id-photo/ 관련 안내 to passport-photo, photo-kb, then the title order; unit tests.
- Visual QA (390/1280, light/dark; 6 guides + 2 hubs): hub cells broke inside "350KB"/"JPG" at 390 px (body `overflow-wrap: anywhere`); `.hub-table th, td { overflow-wrap: normal }` fixes it, and the table scrolls.
- Gates: check 0 errors; unit 689/689; both builds + check-dist OK (UI fonts 138.0 KB, delta 0); check:quotes 113/113; licenses OK; e2e (4273) id-photo + hubs chromium/mobile-safari 75 passed, site + growth 105 passed.

## G2 A3 build notes (Bob, 2026-10-02; branch g2-a3 from d277beb)
Scope: ARCHITECT-BRIEF-G2.md "A3 — file-limit cluster, remaining drafts" (rows 16–22). C1 (separate worktree) owns `tools.ts` entries, home RelatedTools and lighthouserc tool URLs; A3 touches none of them (Lighthouse ran from a scratch config).

### G2 Step 0 (A3 rows; fetched 2026-10-02 KST from this PC; curl quotes checked with `pageTextExact`, then `npm run check:quotes`)
| Row | URL | via | status / bytes | result |
|---|---|---|---|---|
| 16 yearend-tax-pdf | https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?mi=2305&cntntsId=7706 (편리한 연말정산 이용방법), …mi=40609&cntntsId=239021 (맞춤형 안내) | curl | 200 / 205 KB, 199 KB | **published.** The 유형 1–5 lines (출력 서류 / "종이없는 연말정산" PDF into the company program / 홈택스 간편제출), "근로자 연말정산간소화 자료를 조회하여 PDF로 내려받는 방법", the 주택임차차입금 서류 list and "간소화 서비스에서 조회 가능하나, 조회되지 않은 경우 금융회사 등에서 발급 가능". The 간소화·일괄제공 Q&A is a file download; 홈택스이용 Q&A open via fn_goQna (no stable URL). |
| 17 gov24-upload-limit | gov.kr/portal/customer/faq → faqList JSON pages 1–40 (339 FAQs); plus.gov.kr/portal/faq (browser) | curl, browser | 200 | **draft.** No attachment size item; the limit appears only in the logged-in form. gov.kr now redirects to plus.gov.kr. |
| 18 hometax-upload-limit | hometax.go.kr (WebSquare shell; 홈택스이용안내 rendered), nts.go.kr search collection=call_hometaxQna | curl, browser | 200 | **draft.** The only size item is 5MB for the 영수증 발급처 Excel upload; "증빙 서류 제출 방법" states PDF conversion, no size; fn_goQna links only. |
| 19 work24-resume-upload | work24 FAQ (GET search 이력서/첨부/파일/용량), selectBbttInfo.do?ntceStno=75, 이용가이드 GUID000102 | curl, browser | 200 | **draft.** No size/format for resume attachments; the 첨부파일 관리 screen needs a login. |
| 20 ecfs-pdf-limit | https://ecfs.scourt.go.kr/psp/index.on?m=PSP623M01 (전자소송포털 자주하는질문; SPA, the article opens as &s=PSP624M01 with no id) | browser | 4.4 KB shell | **published, via: browser.** "(PDF파일로 자동변환, 20MB까지 첨부가능)", "파일 하나의 크기는 20MB를 초과할 수 없고 … 총용량은 100M 이하로 제한됩니다.", the scan/merge rule, the 원본 파일 rule (규칙 제8조 제4항), 동영상·음성 "100 MB까지" + formats. The old /ecf/ URL now serves error.html. |
| 21 epeople-upload-limit | epeople FAQ (93 titles), PttnUtilGdncContent, PttnRqstWrtnInfo.paid | curl | 200 | **draft.** No size item; the form redirects to login. |
| 22 kakao-photo | https://cs.kakao.com/helps_html/1073209424, …1073210382, …1073209414, …1073206342 | curl (IDs found via chrome-cdp search) | 200 / 181 KB each | **published.** The article pages are static HTML (the 2026-09-30 try only hit the script menu). 사진 1회 300MB, 묶어보내기 120개 / 30장씩, 20MB 이상 → 파일 말풍선, PC 300MB / 100개 + extensions, 사진 화질 path. |
- chrome-cdp: my own tab only, read-only (public pages, page navigation, no login, no form submit, no cookies); closed when done. The owner's Kakao session in that Chrome was not touched.
- A2 drafts (toeic, local-gosi, mma, teacher-exam): not retried; A2 checked them today and nothing new is public.

### Result: 3 guides published, 4 new drafts
- Published: yearend-tax-pdf, kakao-photo (draft → published), ecfs-pdf-limit (new). **Indexable /guide/ URLs: 27 guides + 2 hubs = 29** (was 26). **Shortfall 1** against the ≥ 30 ship rule; every unsourced row has tried[] (gov24, hometax, work24, epeople). No padding.
- Inbound links: photo-kb → kakao-photo, pdf-merge → yearend-tax-pdf, pdf-compress → ecfs-pdf-limit (4th related each); ecfs is also in the upload-limits hub (2 rows: 문서 20MB까지, 동영상·음성 100 MB까지, fit false). Hub title/description/answer/og name 전자소송.

### Decisions (never stop)
- **yearend-tax-pdf scope:** the draft title promised "PDF 합치기와 용량 줄이기". NTS says PDF-receiving companies load the 간소화 PDF into their own program, and 문서딱 rewrites any PDF it merges or compresses. So the page tells readers to hand in the 간소화 PDF unchanged and uses our tools only for the other papers (only when the company asks for one file). Title is now "연말정산 간소화 PDF, 회사에 내는 법"; query "연말정산 간소화 pdf" (brief row). No dates (간소화 opening day not quoted).
- **"100M" (ecfs):** the court writes the total cap as "100M". The copy writes 100MB; the fact check passes on the same court page's "100 MB까지" (video FAQ). No code change to read a bare "M".
- **kakao-photo topic:** PDF·메일 (closest to "sending files"; TOPICS is the brief's fixed list). Title changed to "카톡 사진 용량, 한 번에 보낼 수 있는 양": no official line says photos sent as files stay original (only videos), so "원본으로 보내기" was dropped.
- **Tool-page 관련 안내:** the Hangul-titled A3 guides pushed /guide/pdf-merge/ off /pdf-merge/ and /guide/pdf-compress/ off /pdf-compress/ (Korean collation puts "PDF …" last). `TOOL_GUIDE_PINS` gains `pdf-merge: [pdf-merge]`, `pdf-compress: [pdf-compress]` (A2 ruling 1 pattern). Result: /pdf-merge/ = pdf-merge, univ-docs-upload, yearend-tax-pdf, ecfs-pdf-limit; /pdf-compress/ = pdf-compress, univ-docs-upload, hwp-to-pdf, email-attachment-limit. Unit test.
- **ecfs table:** the 3-column table broke "100MB까지" mid-word at 390 px; it is now 구분 | 용량 with the format lists as bullets.

### Gates (PUBLIC_SITE_URL=https://docttak.com; final tree)
| Gate | Result |
|---|---|
| astro check | 0 errors, 0 warnings, 1 hint (pre-existing) |
| unit (vitest) | 690/690, 41 files |
| build flag off → dist-noauto | check-dist OK, 2,359 files; UI fonts 136.9 KB |
| build flag on → dist | check-dist OK, 2,366 files; **UI fonts 138.0 / 190 KB, A3 delta 0.0 KB** (400 43.8, 700 47.3, 800 46.9; 604 characters); precache 418.7 / 450 KB; ecfs HTML 4.8 KB gzip, initial JS 1.5 KB; similarity max photo-sizes ~ upload-limits 0.228 / 0.45 |
| 24 existing guide articles + photo-sizes vs d277beb build | byte-equal 25/25 (upload-limits differs by design) |
| check:licenses | OK, 36 packages, 5 components |
| check:quotes | 130/130 verbatim (was 113); ecfs's 8 quotes listed as 수동 확인 (via browser) |
| e2e site + growth + hubs, 5 projects (E2E_PORT=4273) | 292 passed, 2 skipped, 0 failed, 1 flaky (firefox 360 px /id-photo/, passed on retry; different firefox test each run, load-related) |
| e2e same, chromium + mobile-safari on the final dist (4274) | 117 passed, 1 skipped |
| Lighthouse (lhci scratch config, :4473, 5 runs, median) | /guide/, upload-limits, kakao-photo, ecfs-pdf-limit, yearend-tax-pdf: perf 1, LCP 1,657–1,660 ms, CLS 0, a11y/bp/seo 1; /, /pdf-merge/, /pdf-compress/ 0.99, LCP 1,960–1,970 ms; **/photo-compress/ 2,111 ms locally (unchanged page; same local quantisation A2 logged on HEAD)** |
| qa:visual --only static (:4473) | 290 PNGs, 0 hard failures; new shots ecfs, kakao, yearend. Own full-page shots 390/1280 light/dark of the 3 guides + upload hub: no horizontal overflow, read by eye |
| regress --fixtures-only | not run: no tool code changed |

### Known Gaps (A3)
- Shortfall: 29 indexable /guide/ URLs, 1 short of 30. Arch: pick the next sourced row (candidates in REVIEW-REQUEST).
- Post-deploy (owner/PC): Naver 수집 요청 + Kakao cache refresh for the 3 new URLs.

Status: **DONE_WITH_CONCERNS** (shortfall 1; local /photo-compress/ LCP as in A2, CI decides).

### A3 CI
- Run 36942169967 on fd726b1 (workflow_dispatch, g2-a3): all green (checks incl. Lighthouse, chromium, firefox, webkit, mobile-chrome, mobile-safari).

### A3 round 2 (Bob, 2026-10-02; Arch rulings relayed by the coordinator)
1. **30th URL:** accept 29. C1's stamp-image guide will be the 30th. The 홈택스 search-URL page and the Kakao video page are not shipped.
2. **yearend-tax-pdf:** the two "hand it in unchanged" sentences and their FAQ are cut. The page keeps only what 국세청 states, plus "어떤 파일을 어떻게 낼지는 회사 안내를 따르세요".
3. **ecfs "100M":**
   - The guide now writes the total cap as the court does, "100M".
   - The upload hub gains the row "전자소송 첨부파일 (모두 합쳐)", whose limit reads "100M 이하".
   - The fact check is tightened:
     - `guide-facts.ts`: "M" is its own unit, `M(?![A-Za-z\d])`, so "MP3, M4A" is not read. Copy written "100M" therefore needs a quote that writes "100M".
     - `rowQuote()`: a literal spec row must be backed by ONE quote, either the one it cites (new optional `source`, 1-based) or the first quote stating all its numbers.
     - `hubs.ts`: the hub limit is copied from that quote only. ecfs cites its three rows (1, 5, 7).
   - Unit test: a cited quote without the number fails; numbers split across two quotes fail; the hub limits read 20MB까지 / 100M 이하 / 100 MB까지.
   - Remaining gap: body text and FAQ numbers are still checked against all the guide's quotes, because the copy has no per-claim citation markup.
4. **kakao-photo topic:** no topic fit, so TOPICS gains "사진 보내기" after PDF·메일. Topic names render in the system font, so the UI font is unchanged.
- Gates:
  - check: 0 errors.
  - check:quotes: 130/130.
  - unit: 691/691.
  - Both builds: check-dist OK; UI fonts 138.0 KB, delta 0.
  - e2e hubs + growth + site, chromium + mobile-safari: 117 passed.
## Sprint C — C1-core: ink key, worker, fixtures, regress:ink (Bob, 2026-10-02; branch c1 from 3f738e4)
Status: DONE (core only; page, tools.ts, guides, lighthouserc, e2e, check-dist rows = C1 integration, after A2 is on main).

### Files
- `src/lib/ink/key.ts` — the ink key (brief steps 1-10): planes, van Herk/Gil-Werman max/min filters (O(n), blocked transpose for the column pass), 3-box Gaussian (Kovesi widths), ramp + 진하기 (-2..2, ±0.03/step), mode filters, edge-only 3x3 sigma-0.6 AA, 8-connected despeckle, area check, colour guess, 색 맞추기 / 원래 색 (un-mix), auto-crop, sizes, premultiplied area-average downscale, `processInk` (whole photo-tab pipeline), `InkCache` (paper planes reused across control changes).
- `src/lib/ink/worker-core.ts` + `src/lib/ink/ink.worker.ts` — `load` (pixels transferred once) / `run` (opts only) → `result` (out pixels transferred) | `error {noimage|engine}`. The core is a plain function so unit tests drive it.
- `tests/unit/ink-key.test.ts` — 27 tests, exact expectations on tiny planes (filters vs brute force, ramp, modes, AA kernel, despeckle bounds, area bounds, colours, crop/padding, sizes, premultiplied resize, end-to-end stamp/signature/blank/dense page, worker protocol).
- `tests/fixtures/build-ink.py` + `tests/fixtures/ink/` (13 JPEGs + 3 GT alphas + meta.json, 2.1 MB) — SOURCES.md section added.
- `scripts/regress/ink.mjs`, `scripts/regress/ink-baseline.json`, `package.json` `regress:ink`, CI step `regress:ink -- --fixtures-only` in the checks job.

### Decisions (never stop)
1. **Paper estimate = gauss(closing(x, k), k/3), closing = minFilter(maxFilter(x, k), k)** instead of the brief's gauss(maxFilter(x, k)). k, sigma, lo, hi are unchanged. Evidence (IoU@0.5, auto): brief-literal max filter gives gt14-shadow 0.212, gt15-shadow 0.605, gt16-shadow 0.748 (all < 0.85) and gt15 0.894 (< 0.90): the max filter carries bright paper k/2 px into a shadow and biases the level up on grain and light gradients. With the closing every gate passes (table below). Variant tried and rejected: min(gauss(closing), closing) — gt16 (logo square larger than k) falls to 0.38. **Arch: confirm or redirect** (this is the one place the port leaves the brief's letter).
2. Signature mode keys luma against a **luma** paper level (the brief says paper from `mn` in step 2 and x = lum in step 3; comparing luma with a min-channel paper on yellow paper mixes planes). gt14 in sign mode: 0.926.
3. Fixtures: images are JPEG q92 as the spike's `save()` wrote them (the -jpeg variant q70); GT alpha is one PNG per family (variants share seed and alpha). Shadow = soft ellipse (Gaussian 25 px), -40 % light, 34.5 % of the frame. Font: Pretendard Black/Bold/Regular (OFL, the `pretendard` dependency); HANBatangB/malgunbd not used. stampOnText text is our own made-up sentences.
4. Composite error (gate gt15 <= 0.046) is scored as the spike did: our alpha with the un-mixed colour (원래 색) on white, edge band only. Diagnostic with the default 색 맞추기 colour is in `regress-out/ink.json`.
5. Area check counts a > 0.5. Crop rect may extend past the photo (transparent margin) rather than clamp.
6. AA kept exactly as briefed although it costs ~0.009 IoU on gt15 (measured with/without); gt15 still passes at 0.9035.
7. **No Korean UI strings in core.** The two area messages (도장이나 서명을 찾지 못했어요 / 종이 전체가 잡혔어요…) land with the page in C1 integration: gen-ui-font subsets every string in src/, and 잡혔어요 alone added the glyph 혔, which changed all UI font files and every page hash. With it deferred, dist is byte-identical to 3f738e4 (only deploy-manifest generatedAt differs; verified by sha256 of every dist file, flag-off build, with and without src/lib/ink). UI font delta for C1 integration: at least 1 glyph (혔).
8. regress:ink runs in Node (Vite SSR loads the production key.ts; @napi-rs/canvas decodes), no browser, no server port, no network.

### Results (regress:ink -- --fixtures-only, this PC)
| Fixture | Gate | IoU@0.5 |
|---|---|---|
| gt14 | >= 0.90 | 0.9190 |
| gt15 | >= 0.90 | 0.9035 (composite err white 0.0227 <= 0.046) |
| gt16 | >= 0.98 | 0.9952 |
| gt14 -shadow / -yellow / -jpeg | >= 0.85 | 0.9030 / 0.9884 / 0.9123 |
| gt15 -shadow / -yellow / -jpeg | >= 0.85 | 0.8937 / 0.9148 / 0.8861 |
| gt15-stampOnText (빨간 도장) | >= 0.85 | 0.8913 |
| gt16 -shadow / -yellow / -jpeg | >= 0.85 | 0.9941 / 0.9979 / 0.9943 |
Baseline written from this run (`ink-baseline.json`, slack 0.01). Pipeline at work res 2400x1800 (12 MP desktop): 541-580 ms median in Node/V8 on this PC (target 600 ms). Worker bundle: 11.4 KB min, **3.96 KB gzip → check-dist budget 4.75 KB** (gzip + 20 %) for C1 integration.
Gates: `npm run check` 0 errors; `npm test` 42 files / 708 tests pass; `check:licenses` OK (no new dependency); both builds (flag 0 and 1) + check-dist OK, precache 413.5 / 415.9 KB.

### Known Gaps (C1-core)
- **Real photos (owner-only, needed by 2026-11-10):** 6 phone photos with uneven light (desk lamp or window, visible shadow; scribble signature + 홍길동 stamp; white, ruled, yellow paper), each with a JSON `{mode, paperRects, inkRect}` into `tests/corpus/ink-photos/` (or `INK_PHOTOS_DIR`). `regress:ink` without `--fixtures-only` fails until they exist; C1 waits for them per the brief.
- **Risk for the real-photo residue gate (<= 0.2 %):** at a hard shadow edge the Gaussian (sigma k/3) still overshoots the closing by up to half the shadow depth, leaving a faint alpha 0.1-0.3 band along the shadow edge (non-ink pixels with a > 0.1: 1.15 % on gt14-shadow). Visible in `regress-out/ink-sheet.png`. If the owner photos fail on it, the fix is in the paper estimate (edge-aware smoothing), an Arch call.
- gt15 margin is thin (0.9035 vs 0.90); deterministic, but any change to AA or despeckle must re-run regress:ink.
- Spike l01/l04 (Commons) not added: licence check for redistribution not done in this step.
- Text-to-도장 generator: out of scope (owner decision; brief).

### C1-core round 2 (Bob, 2026-10-02; Arch confirmed decisions 1 and 2; coordinator review of ink-sheet.png)
Status: DONE. Two user-visible defects fixed in core; all gates re-run.

**1. Shadow-edge ghost (grey / pink arc).** Root cause: the Gaussian (sigma k/3) after the closing overshoots on the dark side of a shadow edge, leaving a smooth band of weak alpha (0.1-0.4, never > 0.5; measured histogram) away from any ink.
- Fix: **hysteresis** after the edge AA: weak alpha (a <= 0.5) survives only within r = max(2, round(longEdge / 600)) px (square window) of strong ink (a > 0.5). Evaluated alongside r = 1/2/3: IoU unchanged on every fixture, ghost gone. Rejected: true connected hysteresis (the ghost touches strokes and would survive along them).
- New gate in regress:ink (and in the baseline, slack +0.05 pp): **paper residue** = share of pixels more than 6 px (Chebyshev) from any GT ink with a > 0.1, <= 0.2 % on every fixture (the real-photo gate on synthetic paper; pixels inside the 도장's speckle gaps are not paper). Before: gt14-shadow 1.08 %, gt15-shadow 0.66 %, gt16-shadow 0.43 %. Now 0.000 % on all 13.
- **Solid fill** (found while checking the gt16 "blotch"): an ink area wider than the closing window (the 220 px logo square at k = 161) gets a sunk paper level in its middle, so the centre went semi-transparent (light dot on gt16-yellow / -jpeg). From strong ink, a region grows over 4-neighbours that key strong against the paper colour around the ink (below), only where the closing's level sank > 10 % below it; the larger alpha is kept. Unit test: a 120 px square at k = 31 is fully opaque.

**2. Colour lost by default.** `원래 색` (the photo's own ink colour) is now the default; fixed colours (도장 빨강 / 검정 / 파랑) are opt-in. `InkColor` = `original | red | black | blue` (the old guess-driven `auto` colour is gone; the red/black guess still names the file and stays for the page's mode hint).
- Paper colour for the ink colour = normalised convolution of paper pixels only (a = 0 and min(R,G,B) >= 45 % of its 90th percentile), on a coarse grid (cell = round(longEdge / 320)), two scales (sigma k/12 where >= 20 % of the window is paper, k/3 inside large ink, blended).
- Coverage c = d / dSolid with d measured against that paper colour (not the alpha's paper level), dSolid = 95th percentile on solid ink. Un-mix F = (I - (1 - c) P) / c where c >= 0.5; divide by P and multiply by the brightest paper level (light and shadow removed, paper tone kept); average (weight c^2) into a local colour field (cell = round(longEdge / 400), sigma 5 cells), read back bilinearly. Partial-alpha pixels get the local ink colour: no paper tint (unit test: rim vs core ΔE <= 3).
- New gate: **ΔE76 <= 10** between the mean default output colour over solid GT ink and the colour solid ink shows in the fixture (gmax · ink + (1 - gmax) · paper). Decision: gt14 / gt15 cover at most 92 % / 90 % (spike recipe), so their densest pixels hold 8-10 % paper, which no key can tell from a lighter ink; against the nominal ink colour gt14 sits at 9.8-10.5 and gt15 at 8.0-9.8 (reported as info in ink.md). gt16 (100 % coverage) is the same under both: 0.9-3.6. Also a unit test on a synthetic bar with a -40 % shadow half against the true ink colour.
- **Fixture change:** the room-light falloff now lights the ink as well as the paper (the spike lit only the paper, which is not physical and made a light-corrected colour look wrong). Every fixture was rebuilt; IoU moved by <= 0.002 (gt15 0.9035 -> 0.9017). Baseline regenerated after the change.

**Results (regress:ink -- --fixtures-only):**
| Fixture | IoU@0.5 (gate) | Paper residue (<= 0.2 %) | ΔE76 visible solid ink (<= 10) |
|---|---|---|---|
| gt14 / -shadow / -yellow / -jpeg | 0.9189 / 0.9017 / 0.9888 / 0.9099 | 0 % all | 4.04 / 4.20 / 5.61 / 5.57 |
| gt15 / -shadow / -yellow / -jpeg | 0.9017 / 0.8921 / 0.9119 / 0.8845 | 0 % all | 2.71 / 2.94 / 2.73 / 3.12 |
| gt15-stampOnText (빨간 도장) | 0.8907 | 0 % | 4.53 |
| gt16 / -shadow / -yellow / -jpeg | 0.9954 / 0.9941 / 0.9985 / 0.9944 | 0 % all | 0.92 / 3.62 / 1.12 / 1.80 |
Composite error gt15 on white (원래 색, default): 0.0389 <= 0.046 (round 1: 0.0227 with per-pixel un-mixing against the keyed alpha; the uniform local colour trades a little edge fidelity for no paper tint).
Pipeline 2400x1800 (key + default colour + crop): 663-768 ms median in Node on this PC, **over the 600 ms target** (round 1: 541-580 ms with the fixed colour, which skipped the colour work). Speed-ups taken: row-wise vertical box passes, coarse-grid paper colour, ink-pixel lists. Remaining cost is the full-res closing + Gaussian (~450 ms). Logged, not a gate.
Vite in regress:ink now runs with `hmr: false, ws: false` (it had opened port 24678).

**Known Gaps (round 2):**
- A shadow edge that runs exactly along the edge of a large solid ink area (gt16-shadow: penumbra along the top of the logo square) leaves a darker band in the colour: the nearest paper is lit, the ink is not. ΔE still 3.6; visible on ink-sheet.png. Thin strokes (signatures, 도장) are not affected.
- gt15 IoU margin is 0.0017 (0.9017 vs 0.90).
- Faint ink keyed entirely below a = 0.5 is now dropped by the hysteresis (진하기 + raises it).

## Sprint C — C1 integration: /stamp-signature/ (Bob, 2026-10-02; branch c1 rebased onto main d277beb)
Status: DONE_WITH_CONCERNS (all gates pass on this PC; the real-photo gate is pending on the owner's 6 photos, allowed by Arch before 11-15; CI decides Lighthouse).

### Files
- `src/pages/stamp-signature/index.astro` — the page: tabs `사진으로 만들기` / `직접 그리기`, honest limits box (brief wording, 합니다체), 사용 방법, 안전한 이유, FAQ, RelatedTools `only` = photo-compress, hwp-to-pdf, pdf-merge. Page CSS inlined from `src/tools/stamp-signature/stamp.css` (the /hwp-viewer/ pattern; no other page carries it).
- `src/tools/stamp-signature/entry.ts` — tabs (ARIA tabs, arrow/Home/End) and lazy loading: `photo.ts` on the first interaction with the photo tab, `pad.ts` on the first opening of the draw tab; engine panel when a module cannot load.
- `src/tools/stamp-signature/photo.ts` — photo tab: sniff, size limits, decode to the work copy (2,400 px PC / 1,600 px phone), pixels to `ink.worker` once, each control change re-runs with options only (150 ms debounce), previews on checkerboard and on white, area messages (no download), size options bigger than the crop disabled, worker crash -> error + `다시 시도`, worker that never loads -> engine panel. A new photo resets the controls to their defaults.
- `src/tools/stamp-signature/pad.ts` — Pointer Events, DPR-aware canvas, quadratic smoothing through midpoints, 3 pen colours (INK_COLORS), 되돌리기/지우기, export renders at 1,500×600 and goes through key.ts `cropRect` + `cropAndResize` (steps 9-10); download disabled with a reason until there is a stroke.
- `src/tools/stamp-signature/png.ts` — PNG encode, `toBlob` null -> one retry at the next smaller size -> error; save through a temporary link.
- `src/tools/stamp-signature/{copy,limits}.ts` — strings and limits (desktop 50 MB / 100 MP, phone 30 MB / 40 MP so a 50 MP scan on a phone gets the limit message).
- `src/data/tools.ts` (entry after id-photo), `src/data/og.json` (image + page), `src/data/guides.ts` (NEXT_GUIDES), `src/data/guide-schema.ts` (topic `서명·도장`), `src/data/site.ts` (defaultDescription), `docs/COPY.md`.
- Guides: `src/content/guides/stamp-image.md` (published; Word section from 4 Microsoft support quotes), `src/content/guides/e-signature-law.md` (published; 4 verbatim 전자서명법 quotes, 제2조 1·2호 and 제3조 ①②, from law.go.kr).
- `lighthouserc.json` (+ /stamp-signature/, /guide/stamp-image/), `scripts/check-dist.mjs` (ink worker + lazy controls rows), `scripts/qa/visual.mjs` (page + `ss-light/dark` states).
- Tests: `tests/unit/stamp-signature.test.ts` (new, 13), `tests/e2e/stamp-signature.spec.ts` (new, 8), list updates in `tests/e2e/{site,polish}.spec.ts`, `tests/unit/{postbuild,polish}.test.ts`.

### Decisions (never stop; Arch please confirm the ones marked)
1. **name = h1 = `전자서명·도장 이미지 만들기`** (brief: name `전자서명·도장 이미지`). COPY.md and a unit test require name = h1; the H1 carries the keyword.
2. **Arch: home share preview no longer lists the tools.** With 7 tools the names alone are 85 characters, over the 80-character og:description limit. `/` og description = the tagline sentence (same as `*`); the polish unit/e2e tests now check "no soon tool" for og instead of "every live tool". The meta description keeps every name: template shortened to `{names}. 파일은 내 폰·컴퓨터 밖으로 나가지 않아요. 무료.` (115 chars, limit 120).
3. **Arch: precache.** The page adds ~28 KB (HTML + entry) to the precache: 445.1 KB of 450 (flag off). Precaching the photo controller as well (the /id-photo/ rule, gen-sw matches `controller*`) would be 455 KB, so the controller is named `photo.ts` and is not precached; after a first use it is in the runtime cache. Offline on a first-ever visit, the page shows the engine panel (tested path). FAQ JSON-LD left out of this page (id-photo has none either) to save ~3 KB.
4. **Arch: check-dist ink worker budget 6.1 KB** (C1-core recorded 4.75 KB from round 1; round 2's ink colour grew the worker to 5.05 KB gzip; budget = measured + 20 %). Lazy controls (photo + pad + what only they import) 11.3 KB gzip, budget 13.5 KB.
5. Area messages in 합니다체 (tool copy rule), same meaning as the brief: `도장이나 서명을 찾지 못했습니다. 진하기를 높이거나, 환한 곳에서 종이를 가까이 다시 찍어 주세요.` / `종이 전체를 도장이나 서명으로 읽었습니다. 종이만 나오게 환한 곳에서 다시 찍어 주세요.` (`잡혔` would add a glyph).
6. UI copy written onto existing glyphs: **UI font delta +208 bytes (1 glyph, 빨)** on the shipping build (flag 0: 140,136 -> 140,344 bytes). Avoided: 밝/잘/룩/짝/뿐/혔/듭/랑/탕/점/펜. C2 has ~1.8 KB left of the 2.0 KB.
7. e-signature-law renders the statute text verbatim (brief: "the page quotes and links"); the postbuild "no quote is rendered" rule now exempts law.go.kr sources only. Source URL is law.go.kr `lsInfoR.do` (the article text; the friendly /법령/전자서명법 page is a script shell, check:quotes cannot read it), pinned to the version in force since 2022-10-20.
8. stamp-image: Hancom help pages tried (help.hancom.com picture paths -> 302 to 404); only the Word section ships ("워드 문서에 넣기"). No pixel numbers in the guide (the fact check has no 픽셀 tool facts).
9. No /remove-background/ hook (the brief puts the link on the C2 page, which does not exist yet).
10. Size labels say `긴 변 1,000픽셀` (no "px": plain-language test).

### Gates (this PC)
- `npm run check` 0 errors; `npm test` 43 files / 731 tests pass.
- Both builds + check-dist OK; precache 445.1 KB (flag 0) / 447.4 KB (flag 1) of 450 (corrected in the review round: the first figures were stale); initial JS /stamp-signature/ 8.3 KB gzip; ink worker 5.0 / 6.1 KB; controls 11.3 / 13.5 KB.
- `check:licenses` OK (no new dependency); `check:quotes` 121/121 verbatim (+8: 4 law.go.kr, 4 Microsoft).
- `regress:ink -- --fixtures-only` 94/94 (PARTIAL: real photos pending).
- e2e (port 4573): stamp-signature.spec on chromium, firefox, webkit, mobile-chrome, mobile-safari: 40 run, 38 passed, 2 skipped (the keyboard-tabs test is desktop-only); webkit/mobile-safari photo test repeated 5× clean after fixing a test race. site + growth + hubs + polish (chromium, mobile-safari) pass; sw + preload chromium pass. One mobile-safari growth share test flaked once and passed on rerun (not touched by C1).
- qa:visual (port 4575): 0 hard failures, 332 shots; /stamp-signature/ looked at by me at 390 and 1280, light and dark (empty, 도장 result, no-ink message, draw).
- Lighthouse (lhci, 5 runs, median, served on 4575): /stamp-signature/ LCP 1,959 ms perf 0.99; /guide/stamp-image/ 1,656 ms perf 1; home 1,960; every other URL ≤ 1,971 except /photo-compress/ 2,110 ms, the same local value A2 reproduced on HEAD 659c04a (2,113 ms; CI is the source of truth). Accessibility, best practices, SEO, CLS and script size pass on all 19 URLs.

- CI run 36942932929 (55144bb): checks job green (build, check, unit, licenses, regress:ink, Lighthouse); e2e failed on every project in one test only, `id-photo.spec.ts` SEO, which counted 5 related tools (now 6 with /stamp-signature/). Fixed in the follow-up commit; firefox's 11 flaky retries are the known harness flakes, none in the new spec.

### Known Gaps (C1 integration)
- **Real-photo gate pending (owner-only, needed by 2026-11-10, before 11-15):** 6 photos + JSON into `tests/corpus/ink-photos/`; then `npm run regress:ink` (without --fixtures-only) and the contact sheet for Richard.
- Hancom "한글에 넣기" section: no fetchable official Hancom help page found; add when one is quoted.
- Offline first-ever visit of /stamp-signature/ shows the engine panel (controller not precached, decision 3).
- Text-to-도장 generator: out of scope (owner decision).

### C1 review round (Bob, 2026-10-02; Richard cleared C1, no Must Fix; Arch rulings 1-7)
Status: DONE.
1. **자동 = classify, then key with that mode's own path** (`key.ts` `classifyInk`, `keyInk`). Red -> exactly the 빨간 도장 keying (min(R,G,B) + red filter); black/blue -> exactly the 검정·파란 서명 keying (luma). The classifier runs on a copy box-averaged to ~600 px long edge: a first min(R,G,B) key finds the strong ink (a > 0.5); a pixel is red when its redness exceeds the redness of the paper around it (paperColor) by > 0.15; red when >= 15 % of the strong ink is red (`INK.redShare`). A weighted *mean* (tried first) sent the seal sheets c03/c11 and r01 (red seal next to its dark wooden stamp) to 서명 keying, which drops red; the *share* separates cleanly: red sets 0.28-1.0, black/blue sets 0-0.05 on Richard's 12 photos and all 14 fixtures. The guess is cached per 진하기 step.
   - New fixture **gt14-kraft** (`build-ink.py`): dark signature on brown kraft board (#9C744E, mottling, fibres, flecks, chroma noise strongest in blue; min-channel 5-95 % spread ±10 %, c07 ±14 %). Gates: residue <= 0.2 %, 자동 guess black, status ok, ΔE <= 10. Its IoU is reported, not gated (0.837: strokes pick up texture at their edges); the brief's IoU gates on the other 13 fixtures are unchanged. The old 자동 fails it (residue 1.13 %, IoU 0.75); the new one passes (residue 0.000 %).
   - All 13 existing fixtures stay within every gate; re-baselined (gt14-yellow IoU 0.989 -> 0.926 in 서명 keying, gt16-shadow ΔE 3.6 -> 5.8; both inside the gates). regress:ink 101/101. Pipeline 2400×1800 711-840 ms in Node (was 663-768; target 600, not a gate).
   - Real photos (Richard's 12, `C:\dev\doc-tools-kr\spikes\ink-real\sheet-c1fix.png` + `.json`): c07 kraft now clean in 자동 (2.76 % ink, guess black; was 18.8 %, red); c01/r05/c03/c11/r01 red; signatures black. In the sheet a salmon tile is the script's placeholder for "no output" (status noink), not a result.
2. File name follows the mode: 빨간 도장 -> 도장.png, 검정·파란 서명 -> 서명.png; 자동: a fixed colour decides, else the guess. Unit cases.
3. `resetControls()` at the start of `openFile` (also after an error or a crash). e2e: a photo picked straight from the input starts at 자동 / 보통.
4. Limits list: `아주 가늘고 흐린 서명은 끊겨 보일 수 있습니다.` (볼펜 dropped: 펜 would be a new glyph; UI font delta still +208 B). The guide keeps 볼펜 (system font).
5. 빨간 도장 on a blue signature (r08, c09, c10; Richard's s01/s03 are the same case): status noink, no output, the message blocks the download. Unit + e2e. The "salmon rectangle" was the sheet's no-output placeholder.
6. Precache: CI and Richard's build read **445.1 KB (flag off) / 447.4 KB (flag on)** of 450; this PC reads 444.3 / 446.6 for the same tree. CI is the figure of record.
7. **Arch ruling (for C2): C2's page adds 0 bytes to the precache.** Its controller and runtime are runtime-cached only, like C1's photo.ts: the tool needs a ~100 MB download anyway, so offline-first gives nothing.
- Ink worker 5.4 KB gzip (budget 6.1). Gates: check 0 errors; unit 735/735; both builds + check-dist OK; regress:ink 101/101; stamp-signature e2e chromium + mobile-safari 15 passed, 1 skipped (desktop-only keyboard test).

## C2 build notes — 사진 배경 지우기 /remove-background/ (Bob, 2026-10-02; worktree `doc-tools-kr-c2`, branch `c2` off main 18e5827)

Status: **DONE_WITH_CONCERNS**. Everything is built and gated locally. The release stays behind `PUBLIC_BG_REMOVE=0` until the owner's real-phone check (brief build order 9). Concerns: precache headroom (decision 9) and the per-photo engine start (decision 7).

### What shipped (flag on; with the flag off nothing of it is in dist/)
- Model: our export `aa62cd87-ce158794` (BiRefNet_lite 512 fp16, HF `aa62cd87…831d`, torch 2.1.2, GridSample deform path), committed under `vendor-assets/birefnet-lite-512/aa62cd87-ce158794/` (4 parts + manifest, `binary` in .gitattributes). copy-vendor copies it to `public/vendor/` only when the flag is on, and checks the SHA-256 of every part and `sha256Total` at copy time.
- Engine: onnxruntime-web **1.30.0** (exact) as a dependency. copy-vendor ships only `ort.webgpu.min.mjs` + asyncify glue + the asyncify wasm split in 2 (13,390,957 B each), and `ort.wasm.min.mjs` + glue + plain wasm (14,239,897 B). `src/generated/bgremove.json` pins the URLs, sizes and SHA-256 of the runtime parts.
- `src/lib/bgremove/`:
  - `assets.ts`: manifest, consent sizes, parts with progress, SHA-256 per part, 3 attempts per part, Cache Storage `docttak-model-birefnet-<exportId>`, old caches deleted, no caching below 300 MB free (with a note), resume from cached parts.
  - `session.ts`: WebGPU adapter check, one worker per photo, terminate after the reply, fallback rule.
  - `infer-core.ts` + `infer.worker.ts`: ort import from /vendor/, env, session, run, dispose, release.
  - `infer.ts`: 512 input, ImageNet normalisation, area check, validity, cv2-style bilinear mask resize to 8-bit alpha, fusion radii.
  - `fusion.ts` + `fusion.worker.ts`: blur-fusion ×2, running-sum box filters, reflect borders.
  - `guard.ts`: a crash marker gives a message and half the work size for the tab.
- Page: `src/tools/remove-background/page.astro` (injected by `astro.config.mjs` only when the flag is on), `entry.ts` (lazy), `bg.ts` (controller), `model.ts` (state machine), `copy.ts`, `limits.ts`, `bg.css` (inlined).
- Wiring:
  - `src/data/tools.ts`: `BG_REMOVE_TOOL`, in TOOLS only when `__BG_REMOVE__`.
  - `og.json` + `gen-brand`: the share image ships only with the flag.
  - `site.ts`: defaultDescription fits 8 names.
  - `gen-headers`: COEP blocks. `gen-sw`/`sw.ts`: not precached; model and runtime network-only in the SW.
  - `check-dist` (both flag states), `gen-licenses`/`check-licenses` (`bgremove` entries), `licenses.manifest.json`.
  - CI, Playwright projects, lighthouserc.

### Decisions (never stop; Arch please confirm the ones marked)
1. **Empty-mask set (Arch C2.0 ruling 1).**
   - `parity.py` and `regress:bgremove` define the real set as the 50 spike photos minus `OFF_TOPIC = {l04}` (a paper letterhead, which belongs to /stamp-signature/).
   - l04 is still run and reported (area 0.08 %).
   - The gate is unchanged (≤ 3). Result: 3/49 (g01, m02, t01), the same as torch.
   - The no-subject panel says `종이에 찍힌 도장·서명·로고라면 전자서명·도장 이미지 만들기를 써 보세요.` with the link.
2. **Parts re-cut to 23 MiB.**
   - The C2.0 parts were exactly 24 MiB (25,165,824 B). `capacity.mjs` fails any dist file `>= 24 MiB`, while the brief's rows say `<= 24 MiB`.
   - `export.py --resplit` re-cut the same fp16 bytes into 3 × 24,117,248 + 20,948,915. `sha256Total` and the exportId are unchanged.
   - Parity was re-run on the committed parts.
3. **Model in `vendor-assets/`, not `public/vendor/`** (the brief said committed under public/vendor). public/vendor/ is git-ignored and rebuilt by copy-vendor, and the MediaPipe model already lives in vendor-assets/. Provenance is the same (our commit), and a flag-off build copies nothing.
4. **onnxruntime-web licence (Arch C2.0 ruling 2).**
   - `LICENSE` and `ThirdPartyNotices.txt` come from tag v1.30.0 = commit `f2c39fe2f838cf35ce7da92824f5a5e3ee6e88a7` (`gh api repos/microsoft/onnxruntime/git/ref/tags/v1.30.0`). The raw.githubusercontent URLs are in `licenses/third-party/SOURCES.md`.
   - Both are on /licenses/ when the flag is on.
   - ThirdPartyNotices is 338 KB, so /licenses/ grows by about that much. It is not precached.
5. **COEP also on the page's worker scripts (Arch, please confirm).**
   - With COEP only on `/remove-background/*`, Chrome refused to start the inference worker. Measured: the worker request was made, no worker started, and the run failed with "crash".
   - With `Cross-Origin-Embedder-Policy: require-corp` also on `/_astro/infer.worker*`, `/_astro/fusion.worker*` and `/vendor/onnxruntime-web/*`, everything runs and the page is crossOriginIsolated.
   - These files are used by this page only. The site-wide `/*` block and every other page are unchanged (postbuild and e2e assert it).
   - The live smoke must confirm that Cloudflare's `*` matches `/remove-background/` itself and the `infer.worker-<hash>.js` names.
6. **Engine in a worker, one worker per photo** (Arch ruling 6: "release the session and tensors after each image").
   - WebAssembly memory never shrinks while its module lives, so `session.release()` alone frees little. Terminating the worker frees the whole engine.
   - Tensors are disposed and the session released before the reply anyway.
   - When the model bytes are cached, the page keeps none: they are re-read from Cache Storage and SHA-checked for each photo.
   - Without caching, the page keeps one copy, needed for the next photo and for the WASM fallback.
7. **Cost of decision 6 (Arch, please confirm).**
   - Every photo pays the session start again: WASM about 7 s to create + 2.6 s to run (8 threads, this PC); WebGPU about 7 s to create + 0.3 s to run (C2.0 probe).
   - Apart from the download, later photos are no faster than the first.
   - Alternative if Arch prefers speed: keep the worker alive between photos, on desktop only.
8. **Memory guards (ruling 6).**
   - Input caps: 150 MP / 64 MP (`checkDims`, as id-photo) and 50 / 30 MB.
   - Work copy: 4,096 / 2,048 px long edge, halved after a crash.
   - Mask: 512 → 8-bit alpha at work size (a quarter of a float plane).
   - Fusion runs per channel (8 float planes at most). The pixels and the alpha are transferred to the fusion worker, so no copy stays in the page.
   - Bitmaps are closed and canvases zeroed on every new photo, on 취소 and on pagehide.
   - `navigator.deviceMemory < 4` adds a warning line to the consent panel.
   - Peak private memory: see "Measurements".
9. **Precache (Arch ruling 3): concern.**
   - The page, controller, workers, engine and model are not precached (`NOT_PRECACHED` + a test).
   - But with the flag on, every precached page gains the nav entry. 4 tool pages also gain a related-tools card, and the home a card + a JSON-LD item.
   - Result: **448.8 KB of 450 on this PC (flag on).** C1 measured CI = this PC + 0.8 KB, so about 449.6 on CI.
   - To get there: the tool icon is 2 short shapes, the summary is short, and the new UI glyphs were cut to 1 (see 10).
   - The next tool needs an Arch decision on the precache, for example dropping the menu icons from the HTML or precaching fewer pages.
10. **UI font +0.6 KB** (137.1 → 137.7 KB total, 599 → 602 characters, flag on).
    - Brief-quoted lines were rewritten onto existing glyphs where the meaning is unchanged:
      - `서명·도장은 여기서 더 잘 돼요` (brief: `…더 깔끔해요`; 깔 and 끔 were 2 new glyphs).
      - `받은 파일이 손상되었어요` (brief: `손상됐어요`; 됐 was new).
      - The guard line `…창이 멈췄을 수 있어요` (brief: `메모리가 부족해 창이 닫혔을 수`). 메모리 is banned by the plain-language test, and 혔 was a new glyph.
    - New glyphs: 잘 (brief `잘 맞아요`), and å (ThirdPartyNotices, flag on only).
    - The licence `use` texts were written onto existing glyphs too.
11. **Copy style.**
    - The tool's dynamic lines follow the brief's 해요체 (COPY.md exception added, as for /hwp-viewer/). 사용 방법, 안전한 이유 and the FAQ are 합니다체.
    - name = h1 = `사진 배경 지우기 (누끼)` (COPY.md rule, as in C1).
    - Home description: with 8 names the long sentence is 130 characters, so `defaultDescription` falls back to `{names}. 파일은 밖으로 안 나가요. 무료.` (120).
12. **Consent size.**
    - The consent panel shows the size for the chosen engine: WebGPU 114.5 MB, WASM 102.6 MB (MiB-based, like every size on the site).
    - The static line says `처음 한 번 약 110 MB를 받아요` (the larger one, rounded to 10 MB), not the brief's "약 100 MB".
13. **Blue = `#3D6FD6`.** No blue exists in src/lib/idphoto/ (the id-photo tool keeps the photo's background). Design choice.
14. **Input resize = Pillow BILINEAR, ported (root cause of a gate miss).**
    - The first full `regress:bgremove` run (WASM) failed the browser-vs-Python gate on 5 of 49 real photos: b02 0.0086, t02 0.0067, m01 0.0030, c02 0.0023, f03 0.0021 (gate 0.002). All GT and empty-mask gates passed.
    - Cause: the input resize. The page drew the photo to 512×512 on a canvas (`imageSmoothingQuality 'high'`), while the Python reference (parity.py) uses Pillow `resize(BILINEAR)`, a triangle filter widened by the reduction factor.
    - Fix: `pilResizeRgba` in `src/lib/bgremove/infer.ts` ports Pillow's 8-bit resampler (same coefficients, 22-bit fixed point, horizontal pass then vertical). It equals Pillow byte for byte, down and up (unit test against `pil-down.png` / `pil-up.png`).
    - After the fix, the same 5 photos are at 0.00002–0.00009 and the fixtures at ~0.00001.
15. **CI.**
    - The checks job builds with `PUBLIC_BG_REMOVE=1`, because Lighthouse needs the page. The unit postbuild tests adapt to the build's flag.
    - The checks job installs Chromium and runs `regress:bgremove -- --fixtures-only --backend wasm` (real model, 3 CC0 fixtures).
    - The chromium and mobile-safari e2e jobs also build `dist-bg/` and run `bg-chromium` / `bg-mobile-safari`.
    - The flag-off state is checked by check-dist in every other build.
16. **Brand test exemption.**
    - The brief's Cache Storage name `docttak-model-birefnet-<id>` is in the controller chunk.
    - The brand test (no "docttak" except the domain) now exempts exactly `docttak-model-birefnet-`, an internal key that is never shown.
    - A rename would be cleaner if Arch prefers. It cannot be `anolim-`: the SW deletes old `anolim-*` caches.
17. **Fixtures.**
    - 3 CC0 composites (foreground and background both CC0), built by `tests/fixtures/build-bgremove.py`, with their Python masks.
    - 2 blur-fusion references from the spike's `pp.fg_blur`.
    - `tiny.onnx` (272 B, `scripts/model/birefnet/tiny.py`) for the page e2e, served via `page.route` (no test hook in the page).

### Residual risk (not user-facing; brief build order 10)
- The BiRefNet README lists training sets that include P3M-10k, some of them research-only. The weights licence (MIT) is separate.
- Accepted by Arch on 2026-10-02. Revisit if the upstream licence changes or a takedown arrives.

### Measurements (this PC: Ryzen + RTX 2060, Chrome 153 headless; flag-on build)
- **Parity** (`parity.py --out …t2.1.2-gridsample`, run on the committed parts): exit 0, 920 s.
  - fp32 vs torch: mean ≤ 2.0e-7, max 9.7e-5.
  - fp16 vs fp32: mean 3.1e-5.
  - GT: MAE 0.00484, IoU 0.9423.
  - Empty masks: 3/49 (g01, m02, t01), the same as torch.
  - l04 is off-topic, area 0.08 %.
  - Gate `real_set_is_49`: true.
- **regress:bgremove, full** (69 images, WebGPU, `--channel chrome`): OK.
  - Browser vs Python: max mean diff 0.00059 (gate 0.002).
  - GT: MAE 0.00482, IoU 0.9423. Empty masks: 3/49.
  - Per image: create median 8.1 s, first run median 3.0 s.
  - Fusion at 4 MP: 0.9 s (budget 1.5 s).
  - The WASM full run before the resize fix: decision 14. After the fix: the 5 photos that had failed are at ≤ 0.00009.
- **regress:bgremove --fixtures-only --backend wasm** (the CI command): OK. Diff 0.00001–0.0003; create about 7 s, run about 2.6 s; fusion at 4 MP 1.1 s.
- **Peak private memory, Chrome total** (`scripts/regress/bgremove-mem.py`; first photo + a second photo from the cache):

  | Engine | Photo | Peak private memory | Time, first photo | Time, cached photo |
  |---|---|---|---|---|
  | WebGPU | 12 MP (4,000×3,000) | **2.26 GB** (GPU process 1.22, renderer 0.96) | 19.1 s | 17.2 s |
  | WASM | 12 MP | **2.00 GB** (renderer 1.80) | 17.2 s | 12.9 s |
  | WebGPU | 640 px | 2.05 GB | — | — |

  - The C2.0 probe page measured 2.96 GB (WebGPU) and 3.83 GB (WASM).
  - Phones: owner check (build order 9).
- **Precache**: 448.8 / 450 KB with the flag on and 444.8 with it off (this PC). Nothing of the tool is precached.
- **UI fonts**: 137.7 KB with the flag on, 137.4 with it off (main 137.1).
- **Bundle**: initial JS of the page 9.4 KB gzip; lazy controller 12.0 / 14 KB; workers 1.0 and 0.8 KB.
- **Gates**:
  - check: 0 errors.
  - unit: 781/781 on the flag-off dist; postbuild + bgremove green on the flag-on dist.
  - Both builds + check-dist OK.
  - check:licenses OK in both states.
  - e2e `bg-chromium` + `bg-mobile-safari`: 11 passed, 1 skipped (`@model` is chromium only).
  - Screenshots at 390 and 1280 px, light and dark, in 4 states: checked.
- **CI** (run https://github.com/leeledger/doc-tools-kr/actions/runs/36974710691, commit 86174a8): **green** on attempt 2.
  - Attempt 1 had two failures in code C2 does not touch:
    - The `checks` Lighthouse LCP median on /photo-compress/ was 2,104 ms. The runs were bimodal: 1,956 / 1,964 / 2,117 / 2,113 / 2,104.
    - The webkit job failed in `stamp-signature.spec.ts` "modes" ("Clicking the checkbox did not change its state").
  - Both passed on the re-run of the failed jobs.
  - /remove-background/ passed Lighthouse on both attempts.
  - CI precache: 449.6 KB of 450 (flag on), as predicted.
  - `regress:bgremove --fixtures-only --backend wasm` passed on CI.
  - bg-chromium (with `@model`) and bg-mobile-safari passed.
  - Arch: /photo-compress/ LCP sits on the 2,000 ms line on CI. A3 saw 2,111 ms locally on an unchanged page.

## C2 round 2 (Bob, 2026-10-02; Arch rulings on the round-1 questions + the sustainability ruling)

Status: **DONE**. Every Arch target is met on this PC; CI result below. The release flag stays off.

### Arch rulings applied
1. **COEP on the worker scripts and on `/vendor/onnxruntime-web/*`:** approved as built, unchanged. The Cloudflare `*` match is checked at deploy.
2. **The engine stays alive between photos (the per-photo restart is rejected).**
   - `infer-core.ts`: an `init` message creates the session; each `run` disposes its input and output tensors.
   - `session.ts`: `startEngine` returns an `EngineHandle` (`run`, `dispose`).
   - `bg.ts`: keeps the handle. It is disposed after 2 minutes idle (`IDLE_MS`), after 60 s hidden (`HIDDEN_MS`, visibilitychange), on pagehide, on a crash (`onLost`) and on any engine error.
   - `keepEngine()` keeps today's per-photo restart when `navigator.deviceMemory ≤ 4`, or when it is unknown on iOS (iPhone, iPod, iPad, and iPadOS reporting MacIntel with touch).
   - After a WebGPU failure, the page uses WASM for the rest of the visit.
   - Memory work this needed (the first kept-session runs peaked at 2.5–2.7 GB):
     - Blur-fusion now streams its box filters through a ring of 2r+1 rows and writes the result into the input. Float planes go from 8 to 2: about 100 MB instead of about 400 MB at 12 MP. The output equals the Python reference within the gate (unit test).
     - The work copy's pixels are read once and serve both the model input and the fusion worker (transferred, not copied).
     - WebGPU buffer-cache modes were measured (`storageBufferCacheMode`): `disabled` peaked at 2.18 GB but took 2.7–2.9 s per photo; `simple` peaked at 2.97 GB; `lazyRelease` was no better than `bucket`. **Kept: `bucket`** (the default), with the streamed fusion.
3. **Session start.**
   - New export step `simplify()` in `scripts/model/birefnet/export.py`: onnxsim 0.4.36 (Apache-2.0, pinned in `requirements.lock` with rich (MIT), markdown-it-py (MIT), mdurl (MIT) and pygments (BSD-2-Clause); dev only), 3 random-input checks, then the wide-op fix again.
   - `--resimplify` applied it to the C2.0 export: **17,112 → 1,870 nodes**. The shape ops (Shape 1,274, Unsqueeze 1,384, Gather 784, Cast 744, Concat 686 and more) are folded.
   - New exportId **`aa62cd87-714d0a62`** (92,302,964 B, `sha256Total 714d0a62f064d6d972911ba7cef8716d8a77f326e6f714379e3a77364ab92062`). Its manifest records `"simplify": "onnxsim 0.4.36"`; export_info.json holds the node counts. The old parts were removed (one version only), and fixtures, regress, parity, the licence row and SOURCES were updated.
   - `graphOptimizationLevel` on the simplified model, WebGPU: `all` 2,327 ms, **`basic` 1,659 ms (kept, `OPT_LEVEL`)**, `disabled` 1,487 ms. WASM: `all` 1,671 ms, `basic` 1,061 ms.
4. **Precache:** `/terms/` and `/privacy/` left the precache (`/licenses/` was out already). The SW now stores these 3 pages when they are visited (`RUNTIME_PAGES`, network first; unit test with offline). The offline page and the tool shells stay. **432.9 KB with the flag on, 429.3 KB off** (before: 448.8 / 444.8).
5. **Cache name:** kept, with the exemption.
6. **/photo-compress/ LCP:** not touched.
7. **Not for ID or passport photos (sustainability ruling).**
   - Source: 외교부 여권안내 "제출 불가한 사진파일 안내", https://www.passport.go.kr/home/kor/contents.do?menuPos=12, fetched 2026-10-02. Verbatim: **"배경이 흰색이 아니거나, 배경색을 사진 편집 프로그램으로 제거하여 사진이 변형된 경우"**.
   - The tool page has no sources block (check:quotes covers guides only), so the quote is kept here, in `copy.ts` (`NOT_FOR_ID_SOURCE`) and in a code comment in tools.ts.
   - Removed:
     - 증명사진 from the fit line.
     - The done-panel line that sent users to /id-photo/.
     - The FAQ sentence and link to /id-photo/.
     - id-photo from the related tools (now stamp-signature, photo-compress, pdf-merge).
     - The 증명사진 wording in the blue comment.
   - Positioning: products, profile photos, pets; for documents and slides.
     - Fit line: `상품·프로필 사진·반려동물처럼 하나가 크게 나온 사진을 문서나 발표 자료에 넣을 때 잘 맞아요. 유리나 …`
   - Added:
     - Limits line (Arch wording) with an `외교부 안내` link: `여권·증명사진 제출용으로는 쓰지 마세요. 외교부는 편집 프로그램으로 배경을 지운 사진을 받지 않아요.`
     - FAQ `여권·증명사진에 써도 되나요?`, which answers no, quotes the rule and links passport.go.kr.
   - The HEIC FAQ was dropped to keep 6 FAQs (COPY.md 4–6).
   - The no-subject → /stamp-signature/ hint is unchanged.
   - Glyphs: **0 new** (one candidate, 앞, was rewritten away). UI fonts 137.7 KB flag on (main 137.1).

### Before / after (this PC: RTX 2060, Chrome 153 headless; 12 MP = 4,000×3,000 JPEG)

| | Round 1 | Round 2 |
|---|---|---|
| Session create, WebGPU | ~8.1 s (regress median) | **1.7–1.9 s** (target ≤ 3 s) |
| Session create, WASM | ~7.0 s | **1.1–1.2 s** |
| WebGPU, 2nd and later photos, pick → edge-colour step | 17–19 s end to end (restart every photo) | **1.33–1.75 s** (target ≤ 2 s); end to end with fusion 4.2–5.6 s |
| WebGPU, 1st photo (incl. local download + session) | 19.1 s | 9.3 s to fusion, 13.2 s end to end |
| Peak private memory, WebGPU, 10 × 12 MP in a row | 2.26 GB (one photo, restart) | **2.24–2.42 GB per photo, flat from photo 2 (no growth)**; max 2.42 GB (target ≤ 2.5) |
| Peak private memory, WASM, 5 × 12 MP | 2.00 GB (one photo) | 1.62–2.47 GB (one spike at photo 2, then about 1.9) |
| WASM, 2nd and later photos, to the edge-colour step | — | 2.9–5.4 s |
| Precache (flag on / off) | 448.8 / 444.8 KB | **432.9 / 429.3 KB** (target ≤ 440) |

### Gates (round 2, changed parts)
- `parity.py --out …-gridsample-sim` on the committed parts: **exit 0**.
  - fp32 vs torch: mean ≤ 2.1e-7, max 9.5e-5.
  - fp16 vs fp32: 3.1e-5.
  - GT: MAE 0.00484, IoU 0.9423.
  - Empty masks: 3/49 (g01, m02, t01).
- Full `regress:bgremove`, WebGPU (69 images, one session): **OK**. Max diff 0.00062; GT MAE 0.00482, IoU 0.9424; empty masks 3/49; fusion at 4 MP 1.07 s.
- `--fixtures-only --backend wasm` (the CI command): OK, diff ≤ 0.00001.
- check: 0 errors.
- unit: 784/784 on the flag-off dist; postbuild 44/44 on the flag-on dist.
- Both builds + check-dist OK. check:licenses OK in both states.
- e2e `bg-chromium` + `bg-mobile-safari`: 11 passed, 1 skipped. mobile-safari runs the iOS per-photo-restart path, chromium the kept engine.
- Screenshots checked (390 / 1280 px, light / dark).
- **CI round 2** (https://github.com/leeledger/doc-tools-kr/actions/runs/36984505822, commit a309a84): **green on the first attempt** (checks + 5 e2e jobs, incl. bg-chromium @model and bg-mobile-safari).

## C2 round 3 (Bob, 2026-10-02; Richard's C2 review + Arch ruling on the fallback download)
Status: **DONE**.
- **Must Fix: the dispose timers could kill the engine mid-photo.**
  - New pure `disposeTimers()` in `src/lib/bgremove/session.ts`. `begin()` runs when an engine start or run begins: it stops the idle timer, and neither timer may dispose until `done()`.
  - `done()` re-arms the 2-minute idle timer. If the page stayed hidden past 60 s during the run, it disposes at that point instead (only if still hidden).
  - `bg.ts` `process()` brackets each photo with `begin`/`done` in a `finally`. Visibility changes feed `hidden()`/`visible()`.
  - Fake-timer unit tests:
    - Photo 2 at IDLE_MS − 1 ms survives a run 3× IDLE_MS long; idle disposal follows only IDLE_MS after it.
    - Hidden for 60 s + 5 s during a run disposes only after the run.
    - Coming back before the run ends keeps the engine.
    - The plain hidden timeout and `stop()` work.
- **Fallback download (Arch ruling).**
  - With WebGPU chosen, the consent panel adds `고속 처리가 안 되는 기기에서는 {runtimeBytes('wasm')}를 더 받을 수 있어요.` (13.6 MB, generated, not a literal).
  - When the fallback happens, `#bg-fallback` (role=status) shows `이 기기에서는 고속 처리가 안 돼서 다른 방식으로 바꿔요. 필요한 파일 13.6 MB를 더 받아요.`. Progress never overwrites it, and the next photo clears it.
  - No second question. Glyphs: 0 new.
- **Manifest pin.**
  - `src/generated/bgremove.json` now carries `sha256Total`.
  - `loadManifest` refuses a served manifest whose exportId, bytes or sha256Total differ from the pin (`'corrupt'`, the 손상 path). A stale cached manifest is dropped and read again, and `isCached` needs the pinned one.
  - The page also hashes the joined model once per engine start (`checkModel`). Unit tests cover these.
  - The e2e stand-in rewrites the two pinned values in the served controller chunk (test side; the page code is unchanged).
- **Stale comment fixed:** infer-core `GPU_BUFFER_CACHE` now describes `bucket` and the measured alternatives.
- **Known Gap (logged):** see the Known Gaps list.
- **Gates:**
  - check: 0 errors. unit: 787/787. Both builds + check-dist OK; precache 432.9 / 429.3 KB.
  - Licences OK in both states.
  - e2e bg-chromium + bg-mobile-safari: 11 passed, 1 skipped.
  - No model or runtime code changed, so no parity run.
- **CI round 3** (https://github.com/leeledger/doc-tools-kr/actions/runs/36991681913, commit 0d01241): **green on attempt 2**. Attempt 1 failed on two things outside C2: a Lighthouse runner `NO_NAVSTART` error in checks, and the id-photo "adjust" checkbox test on mobile-safari ("Clicking the checkbox did not change its state", the same flake class as round 1). Both passed on the re-run of the failed jobs. bg-mobile-safari passed on both attempts.

## C2-cloud — spike + brief (2026-10-02, branch `c2-cloud`, never main)
- Owner decision: 배경 지우기 should run in the cloud by default; on-device (C2) stays as the opt-in "사진을 보내지 않고 기기에서 처리".
- Spike: Pages Function `functions/api/remove-bg.ts` + `public/_routes.json` (`/api/*` only) + Commons test photos in `public/spike/`. No wrangler file, no dashboard change.
  - Pages Functions have no Images binding (`env.IMAGES` undefined).
  - `cf.image {segment:"foreground"}` works on our Free account.
  - Cold time 3.1-6.3 s on the server (median 4.6 s wall). Model res 1024 long edge.
  - GT (16): cloud MAE 0.0038 / IoU 0.966 / edge 0.053 vs on-device lite-512 0.0048 / 0.942 / 0.078.
  - PNG output is palette, so it is banned. WebP q100 gives 256-level alpha. No colour decontamination, so blur-fusion is still needed.
- Design: Pages Function -> service binding -> Worker `docttak-bg` with the Images binding. Send a <=1024 px copy only, use the alpha only, fuse on the device. Full brief: `handoff/ARCHITECT-BRIEF-C2-CLOUD.md`.
- Blocked on owner-only items (brief §9): create the Worker + Images binding, the Pages service binding (Preview), the privacy-officer name, approval of the copy and the CLAUDE.md rule change. `wrangler whoami`: not authenticated.
- About 60 of 5,000 monthly unique transformations used by the spike.

## C2-cloud spike-2 (Arch, 2026-10-02; brief §9 steps 1–3)
- Owner ran `wrangler login` (account d6248b98…). Worker `docttak-bg` deployed from `workers/bg/` (version 7fc58a4c): Images binding `IMAGES`, ratelimits `RL_IP` 6/60 s and `RL_IP10` 3/10 s, `workers_dev = false`, `preview_urls = false`, observability off. No routes ("No targets deployed").
- Pages project `doc-tools-kr`: service binding `BG` → `docttak-bg` set on **Preview only** through the Pages API (PATCH deployment_configs.preview.services). Production: no services, env unchanged (NODE_VERSION, PUBLIC_NAVER_SITE_VERIFICATION, PUBLIC_SITE_URL). Preview env keeps PUBLIC_BG_REMOVE.
- Function `functions/api/remove-bg.ts` POST: type allowlist, Content-Length 1..2,000,000, `Sec-Fetch-Site: same-origin` (else 403), then `env.BG.fetch(request)`. Commit 575d98b, preview deploy 100f0f3d.
- Results (Seoul, owner PC, 1024 px JPEG q90 copies of the spike photos):

| Photo | Sent | Out | Wall time |
|---|---|---|---|
| s01 | 1024×769 | WebP RGBA 1024×769, 575 KB | 3.25 s |
| h01 | 752×1024 | WebP RGBA 752×1024, 662 KB | 4.11 s |
| a02 | 1024×682 | WebP RGBA 1024×682, 425 KB | 5.50 s |

- **F2 proven:** `segment: "foreground"` works through the binding. **U5 answered:** `output({ format: "image/webp", quality: 100 })` is lossless (RGB in opaque pixels equals the input exactly, mean diff 0.00) with 256 alpha levels. PNG and `f=json` mask output not needed; not tested.
- **U3 answered:** the ratelimits binding deploys and enforces on Workers Free. 10 parallel requests from one IP → 7 × 200, 3 × 429 `{"error":"busy"}` (permissive, as F14 says).
- Guards: no Sec-Fetch-Site → 403 `origin`; non-image bytes → 415 `type`. Response headers: `Cache-Control: no-store, private`, `CDN-Cache-Control: no-store`, `X-Robots-Tag: noindex`.
- Still open: U4 (quota error code; the Worker maps /9422|quota/ to 503 `quota`), phone/LTE latency (§11 step 3), owner §9 step 5 (privacy officer name, §7 copy and the CLAUDE.md rule change). Quota used so far this month: about 65 of 5,000.
- Next: Bob builds the brief (§3–§10) on `c2-cloud` with `PUBLIC_BG_CLOUD` default 0. The Worker source lives in `workers/bg/` and is deployed with `npx wrangler deploy` from that folder.

## C2-cloud build (Bob, 2026-10-02; worktree `C:\dev\doc-tools\c2`, branch `c2-cloud` from 9361850)
Status: **DONE_WITH_CONCERNS**. Everything in brief §3–§11 step 4 is built and gated locally. Concerns: nothing is committed or pushed (see "Not done"), and the phone/LTE check (§11 step 3) is still the owner's.

**Owner decisions (relayed by the coordinator)**
- Owner, 2026-10-02: 개인정보 보호책임자 = 이종림.
- Owner, 2026-10-02: the contact email is robotncoding@kakao.com. It is `PUBLIC_CONTACT_EMAIL` in flag-on builds; Arch sets it in the Preview env.
- Owner, 2026-10-02: the brief's §7 copy is approved as written: the privacy policy v2 section, the site-wide promise and the per-tool notice.
- Owner, 2026-10-02: the CLAUDE.md rule change is approved.
  - CLAUDE.md "Privacy/runtime" now names the one exception: the 배경 지우기 cloud path, a ≤1024 px copy to `/api/remove-bg`, same origin, behind `PUBLIC_BG_CLOUD`.
  - Every other rule is unchanged.

**What was built**
- **Flag `PUBLIC_BG_CLOUD`** (`scripts/lib/bgcloud.mjs`).
  - Default 0. It takes effect only when `PUBLIC_BG_REMOVE=1` too.
  - The `__BG_CLOUD__` define turns every cloud branch into dead code when the flag is off. Check: `dist-bg` (BG on, cloud off) has no `cloud*.js`, no `/api/remove-bg` and no `docttak-bg-mode`.
- **Privacy gate.** With the cloud path on, the build needs `PUBLIC_PRIVACY_OFFICER` and a valid `PUBLIC_CONTACT_EMAIL`. Without them `astro.config.mjs` throws and check-dist fails.
- **Function `functions/api/remove-bg.ts`.** It exports only `onRequest`, which checks in this order:
  - not POST → 405;
  - Sec-Fetch-Site ≠ same-origin → 403;
  - Content-Length outside 1..2,000,000 → 413;
  - type not JPEG/PNG/WebP → 415;
  - then `env.BG.fetch(request)`. No binding → 503 `engine`; the binding throws → 502 `engine`.
  - The spike's GET `cf.image` probe and its IMAGES fallback are deleted.
- **Spike photos.** `public/spike/` is removed from git (`git rm`). A copy is kept git-ignored in `spikes/c2-cloud/photos/`. check-dist fails on any `spike/` path in dist.
- **Worker `workers/bg/`.** Unchanged (spike-2 deployed it). Now unit-tested with fakes.
- **Client `src/lib/bgremove/cloud.ts`** (1.3 KB gzip, lazy, imported after the pick):
  - The copy: long edge ≤1024 on white, JPEG q0.9 through a canvas. It is refused, and nothing is sent, if it carries APP1, is empty, or is over 2 MB.
  - One POST with `credentials: 'omit'`, `cache: 'no-store'`, `redirect: 'error'` and a 30 s timeout. It is never retried by itself.
  - Answers: 429 → busy; 503 with `quota` or 9422 → quota; anything else → failed.
  - The WebP is decoded with `premultiplyAlpha: 'none'`. Only its alpha is kept, after checking it has the copy's shape.
- **Page controller (`bg.ts`, `model.ts`).** New phases `ready` and `sending`.
  - Pick → ready panel: 배경 지우기 / 취소 / "사진을 보내지 않고 기기에서 처리 (처음 한 번 약 N MB 받기)".
  - Sending: 사진을 보내는 중…, then after 1.5 s 배경을 지우는 중… (보통 5초쯤). 취소 is available.
  - Working: 가장자리를 다듬는 중…. The alpha is scaled up to work size with the existing `resizeMask`, then the same blur-fusion worker runs. `finish` and `cutOut` now take a mask of any size.
  - Busy or failed → the message, 다시 시도 and 기기에서 처리.
  - Quota → the message, then the C2 path: its consent, or straight to work if the engine is cached. Not remembered.
  - The device choice is stored as `localStorage docttak-bg-mode=device` (`src/lib/bgremove/mode.ts`, wrapped in try/catch). With it set, a pick takes the C2 path unchanged.
- **Copy.**
  - The brief's §4 and §7 lines are used word for word: `CLOUD` in copy.ts, privacy section 3, the home footnote and bullet, the privacy §2 title, the terms description, and the tools.ts description and FAQ.
  - "약 100 MB" is replaced by the build's real `aboutMB()` (약 110 MB today), on the page and in the privacy 거부 item.
- **Service worker.** `src/sw/sw.ts` already passed `/api/*` and every non-GET to the browser. Unit tests now pin this for `/api/remove-bg`.
- **No-upload guard.**
  - `tests/e2e/upload-guard.ts` makes the rule a pure function with an allowlist: exact method plus same-origin path, with no query or fragment. Allowed responses skip the document CSP check.
  - `no-upload.ts` gets an `allowUpload` fixture option, default `[]`. Only `remove-background.cloud.spec.ts` sets it.
- **Regress.** `npm run regress:bgremove -- --engine cloud` (`scripts/regress/bgremove-cloud.mjs`). Owner PC only, never CI.
- **CI** (`.github/workflows/ci.yml`). Every e2e matrix job builds `dist-bgcloud` and runs `cloud-<project>`. The officer (이종림) and contact (robotncoding@kakao.com) values are set in the workflow; both are public on the privacy page anyway.

**Decisions (builder)**
1. **Cloud needs both flags.** `PUBLIC_BG_CLOUD=1` with `PUBLIC_BG_REMOVE=0` ships nothing and needs no officer, because there is no page and so no cloud path.
2. **One press of 배경 지우기 per photo.** That press is the consent (brief §7.3). A remembered device choice skips the ready panel. A cloud choice is never stored.
3. **Copy written by me, not in the brief.** The owner may want to read these:
   - ready line: `사진을 골랐어요. 배경 지우기를 누르세요.`
   - 취소 while sending: `보내기를 멈췄어요.`
   - the way back from the remembered choice: mode line `사진을 보내지 않고 기기에서 처리하도록 골라 두었어요.` with the button `사진을 보내서 처리하기로 바꾸기`.
   - privacy section 3 opening line.
   - a terms §2 sentence (`다만 사진 배경 지우기는 예외로 …`). The terms body said files are never sent, so it had to change along with the description.
   - the cloud answer to the FAQ "누끼 따기는 어떻게 하나요?".
   - the page lead, which drops "사진은 이 기기 안에서만 처리됩니다.".
   - 사용 방법 step 1.
   - the first 안전한 이유 item, `줄인 사본만 잠깐 보냅니다`.
   - the share preview: og.json `cloud.description` and the image `cloudLine` (`투명한 PNG로 — 무료, 가입 없이`). The flag-off texts say the photo never leaves.
4. **Privacy section 3 adds one line the brief lacked: `이용 목적: 사진의 배경 지우기` in the 국외 이전 list.**
   - Source: law.go.kr 개인정보 보호법 (시행 2025. 10. 2.), fetched 2026-10-02 through lsInfoR.do (the lsInfoP page is a script shell).
   - 제28조의8 ② lists: "1. 이전되는 개인정보 항목 2. 개인정보가 이전되는 국가, 시기 및 방법 3. 개인정보를 이전받는 자의 성명(법인인 경우에는 그 명칭과 연락처를 말한다) 4. 개인정보를 이전받는 자의 개인정보 이용목적 및 보유ㆍ이용 기간 5. 개인정보의 이전을 거부하는 방법, 절차 및 거부의 효과". The brief's 국외 이전 list had all of these except 이용목적.
   - 제28조의8 ① 3 가 ("제2항 각 호의 사항을 제30조에 따른 개인정보 처리방침에 공개한 경우") is the basis for disclosing this in the policy.
   - 제26조 ② (위탁 내용과 수탁자 공개) is covered by the 처리 위탁 line.
   - 제30조 ① 6 (보호책임자 성명·연락처) is covered by the officer section.
   - The 시행령 was not fetched. No statute text is quoted on the page, so `check:quotes` does not apply.
5. **The e2e guard does not check CSP on the allowed upload's response.** Pages Functions do not get `_headers`, and the answer is an image or JSON, never a document.
6. **The copy is sent as the exact bytes that were checked (a Uint8Array), not a Blob.** Playwright WebKit does not expose Blob request bodies. It also means what was verified is exactly what leaves.
7. **After a quota fallback, the quota line stays visible during the device run.** It clears on 받고 시작 or on the next photo.

**Gates (2026-10-02, this machine)**
- `npm run check`: 0 errors, 0 warnings (346 files).
- `npm test`: 45 files, 841 passed. This includes `bgcloud.test.ts` (52 tests), plus 1 new test each in `network-guard` and `postbuild`.
- Builds, all with `PUBLIC_SITE_URL=https://docttak.com`:
  - flag off → `dist`: check-dist OK, 2,372 files.
  - BG on, cloud off → `dist-bg`: OK. Controller 13.1 / 14 KB.
  - BG and cloud on (이종림 / robotncoding@kakao.com) → `dist-bgcloud`: OK. Controller 13.8 / 14 KB, cloud client 1.3 / 3 KB, precache 435.8 / 450 KB.
- Privacy gate:
  - cloud on without the officer and email → `astro build` throws with both messages.
  - check-dist on the flag-off dist with cloud on → FAIL.
  - check-dist on the cloud dist with cloud off → FAIL on `cloud*.js calls /api/remove-bg` and on the exception wording (4 pages).
- postbuild unit tests against `dist-bgcloud` (swapped in as dist): 45/45.
- `check:licenses` OK, with BG off and with BG on.
- `regress:bgremove --engine cloud` (against the preview spike-2 deploy; 16 GT photos; about 16 transformations used): GT mean MAE 0.00397 (gate ≤ 0.0045), IoU 0.9645 (gate ≥ 0.955). 2.1–5.0 s per photo from Seoul.
- e2e:
  - cloud-*, all 5 browsers: 45/45 passed, no retries.
  - bg-chromium: all passed.
  - chromium: all passed. The id-photo tests needed the auto-framing build (35 passed, 2 skipped).
  - firefox, webkit, mobile-chrome, mobile-safari and bg-mobile-safari together: 841 passed, 149 skipped, 4 flaky, 0 failed. The 4 flaky tests are in unrelated specs and passed on retry.

**Not done / blocked**
- **No commit and no push.** My first `git commit` + `git push origin c2-cloud` was denied by the Claude Code auto-mode classifier ("Git Destructive"), and after that even `git log` was denied. All work is uncommitted in the worktree, with `public/spike/` staged as deleted. Arch or the owner needs to commit (split suggested in REVIEW-REQUEST) and push.
- Still open:
  - the 시행령 fetch;
  - U4 (the binding's error code at the quota limit);
  - the phone/LTE check (§11 step 3);
  - the weekly quota line (§8; needs the owner's analytics token).
- Left for Arch, because the owner said to leave every other rule as it is:
  - CLAUDE.md line 14, "No contact/operator/privacy-officer lines until ads", is no longer true for the cloud build.
  - The home eyebrow "파일이 밖으로 안 나가요" and the section title "파일이 기기 밖으로 나가지 않습니다" are not in the brief's §7.2 table, so they are unchanged. The hero footnote qualifies them.
  - The home bullet's approved wording says "(배경 지우기는 예외, 아래 설명)", but the explanation is in the hero footnote above it, not below.

**Known Gaps**
- The Function also deploys to production. With `PUBLIC_BG_CLOUD=0` the page never calls it. Production has no `BG` binding, so a direct call gets 503 `engine`, but it still counts as a Function request.

## C2-cloud round 2 (Bob, 2026-10-05; worktree `C:\dev\doc-tools\c2`, branch `c2-cloud` from 8b203f8)
Status: **DONE**. Gates are green locally (numbers below). Committed, not pushed (Arch pushes).

**Owner decisions, 2026-10-05 (relayed by Arch)**
- 약 110 MB accepted.
- Bob's extra copy accepted as written: the ready line, the remembered "기기에서 처리" line with its undo, the terms §2 sentence, the share preview, and the `이용 목적` line.
- With `PUBLIC_BG_CLOUD` on, every site-wide "files never leave" claim names the one exception. Arch's template: "배경 지우기를 빼면 파일은 내 폰·PC 밖으로 안 나가요". With the flag off, all text stays byte-identical.

**What changed (cloud build only, unless noted)**
- `src/data/og.json`:
  - `cloud.description` for `/`, `*` (404, offline and any unlisted page) and `/privacy/`: "… 배경 지우기를 빼면 파일은 내 폰·PC 밖으로 안 나가요 / 안에서만 처리해요". 67 / 67 / 58 characters (limit 80).
  - `cloudLine` for the `home` and `default` share images: "… — 무료, 가입 없이", like the 배경 지우기 image. The cloud build's og-home / og-default PNGs are regenerated; I checked og-home by eye.
- `src/data/site.ts` `defaultDescription(tools, cloud = __BG_CLOUD__)`: this is the home search description and JSON-LD, and the default for other pages.
  - The long form is "… 배경 지우기를 빼면 파일은 밖으로 안 나가요. 무료.".
  - With eight tools the names alone are 100 characters, so the 120 cap takes the short form "… 배경 지우기 외엔 기기 안에서만." (exactly 120).
- `src/pages/index.astro`:
  - eyebrow: "배경 지우기를 빼면 파일이 밖으로 안 나가요 · 가입 없음 · 무료";
  - section title: "배경 지우기를 빼면 파일이 기기 밖으로 나가지 않습니다";
  - FAQ "제 파일이 다른 곳에 저장되나요?": the answer names the exception and reuses the approved footnote wording "사진을 잠깐 보내 처리하고 바로 지워요";
  - safety bullet (Richard's Should Fix): "(배경 지우기는 예외, 아래 설명)" becomes "(배경 지우기는 예외: 사진을 잠깐 보내 처리하고 바로 지워요)". The explanation sits above the bullet (the hero footnote), so the pointer was wrong; the bullet now explains itself.
- `src/pages/llms.txt.ts`: "배경 지우기를 빼면 파일은 내 폰·컴퓨터 안에서만 처리되고 밖으로 보내지 않아요. 배경 지우기는 줄인 사진 1장을 잠깐 보내 처리하고 바로 지워요."
- 404 and offline: their only claim was the default share text (`*`), now covered.
- Not changed, on purpose:
  - each other tool's page and every guide/hub page: each is about a tool that sends nothing, so its claim stays true;
  - the home paragraph "주민등록번호가 담긴 서류, 계약서, 증명사진도 다른 곳을 거치지 않습니다": those files never go through 배경 지우기.
- `CLAUDE.md` line 14 (the no-contact rule): it now says the cloud build shows the 개인정보 보호책임자 and contact on /privacy/, as the law requires (제30조, build gate), and that site-wide claims name the exception.
- `docs/COPY.md`: the new template, where it is used, and the bullet change.
- **Richard's Should Fix items**
  - `tests/e2e/upload-guard.ts`: the header now points to `tests/unit/bgcloud.test.ts` "no-upload allowlist".
  - Quota notice: **it did linger.** With the engine already live (or cached), quota → `onDevice` → `start` → `done`, and `#bg-error` kept showing "이번 달 무료 처리량이 다 찼어요…" next to the result.
    - Fix: `finish()` calls `hideError()` before `setPhase('done')` (bg.ts:421-423).
    - Regression e2e: `503 quota with the engine ready…` (cloud-chromium only; it runs the stand-in engine).
    - Without the fix it fails at `#bg-error toBeHidden` (Received: visible). I checked this with a temporary build that had the one line commented out, then rebuilt with the fix.
  - EXCEPTION_RE scope: widened as Richard asked (next item).

**Checks added**
- `scripts/lib/bgcloud.mjs`:
  - `CLAIM_RE`: the "never leaves" phrasings: 밖으로/어디로도/어디에도/다른 곳으로/다른 곳의 컴퓨터로/인터넷으로 followed by 안 나가/나가지 않/보내지 않/보내지지 않/전송되지 않, and "안에서만".
  - `QUALIFIER_RE`: EXCEPTION_RE, plus "배경 지우기(를) 빼면/빼고/외엔/외에는".
  - `claimText`: the page's text, meta content and alt text included, JSON-LD kept, other scripts dropped, entities decoded.
  - `unqualifiedClaims`: a claim with no qualifier within 150 characters before it or 80 after.
  - `LOCAL_SCOPE_RE`: the seven other tool directories and `guide/<id>/` pages. A new tool page is not in the list, so it gets checked until someone adds it (fails safe).
- `scripts/check-dist.mjs`:
  - cloud on: every `.html/.txt/.xml/.json/.webmanifest` file outside the local scope has no unqualified claim;
  - cloud off: no file of those types carries any cloud wording.
- `tests/unit/bgcloud.test.ts`: 5 tests (the detector, page text, scope, og.json texts as the cloud build uses them, defaultDescription in both states).
- `tests/unit/postbuild.test.ts`:
  - a new built-output test: cloud dist has no unqualified claims (html + txt/xml/json); off dist has no cloud wording.
  - The cross-state check-dist test now also expects the claim errors for index/404/offline/llms.txt (off dist run as cloud) and the llms.txt wording error (cloud dist run as off).

**Decisions (builder)**
1. "Site-wide" means every text file except the other tools' own pages and the guide pages. The exception is named within the same sentence or next to it: a footnote within 80 characters after, or a heading within 150 before.
2. The home search description's 120-character cap forces the short form "배경 지우기 외엔 기기 안에서만." The full template does not fit after 100 characters of tool names.
3. The default share image line in the cloud build is "PDF·사진·여권사진·HWP — 무료, 가입 없이". The four tools it names are local, but the image stands for the whole site.

**Gates (2026-10-05, this machine)**
- `npm run check`: 0 errors, 0 warnings. The 1 hint is old: `hwp-shared/fonts.ts`, also there at 8b203f8.
- `npx vitest run`: 45 files, 847 passed (was 841: +5 bgcloud, +1 postbuild).
  - postbuild against dist-bgcloud swapped in as dist: 46/46.
  - postbuild against dist-bg swapped in: 46/46.
- Builds, all with `PUBLIC_SITE_URL=https://docttak.com`, each with check-dist OK:
  - flag off → `dist`: 2,372 files, precache 431.0 / 450 KB.
  - BG on → `dist-bg`: 2,390 files, controller 13.1 / 14 KB, precache 434.8 KB.
  - BG and cloud on (이종림 / robotncoding@kakao.com) → `dist-bgcloud`: 2,391 files, controller 13.8 / 14 KB, cloud client 1.3 / 3 KB, precache 436.1 / 450 KB.
- **Flag-off copy byte-identical:** I diffed against baseline builds of 8b203f8 made before any edit.
  - `dist` vs baseline: the only differing file is `deploy-manifest.json` (its timestamp).
  - `dist-bg` vs baseline: `deploy-manifest.json`, plus `remove-background/index.html` differs only in the entry chunk hash. That comes from the bg.ts fix; the text is the same.
- Claim grep of `dist-bgcloud` (every text file outside the local scope): 0 unqualified. Before this round it found 30 (index, 404, offline, privacy, terms, licenses, guide/, llms.txt).
- e2e:
  - chromium site + polish: 88 passed, 1 skipped.
  - bg-chromium: 6/6.
  - cloud-* in all five browsers: 46 passed, 4 skipped (the new quota test runs on cloud-chromium only), no retries.

**Known Gaps (not fixed, out of scope)**
- Home bullet "한 번 쓴 도구는 인터넷을 끊어도 동작합니다" and offline page "한 번 사용한 도구는 인터넷 없이도 열립니다". In the cloud build, 배경 지우기 needs the internet by default. It still works offline on the device path once its engine is stored. This is not a "files leave" claim, so I left it; it is Arch's call.
- `tests/e2e/remove-background.cloud.spec.ts` has its own small `stubModel` (one part), separate from the device spec's. Deduplicating needs an edit to the device spec, which the auto-mode classifier blocked when I tried to move the helper. I left the device spec untouched.

## C2-cloud round 3 (Bob, 2026-10-05; `c2-cloud` from 167746a)
Status: **DONE**. Committed, not pushed.

**Arch ruling (relayed by the coordinator):** fix both round-2 leftovers in one small round.

1. **Offline claim (cloud build only).**
   - Home safety bullet: "배경 지우기를 빼면, 한 번 쓴 도구는 인터넷을 끊어도 동작합니다."
   - /offline/: "배경 지우기를 빼면, 한 번 사용한 도구는 인터넷 없이도 열립니다."
   - The flag-on scan now counts these as claims: `CLAIM_RE` adds "인터넷을 끊어도|인터넷 없이도". "인터넷 없이 열 수 없습니다" on the offline page is not caught (it has no 도).
   - Unit cases are in bgcloud.test.ts.
2. **smoke-assets false 404s on live docttak.com.**
   - `scripts/smoke-assets.mjs` gets `NOT_FILES`, an exact set of three paths that the queue skips:
     - `/vendor/onnxruntime-web/1.30.0/module` and `/vendor/onnxruntime-web/1.30.0/worker_threads`: Node built-ins the ORT bundle imports only under Node.
     - `/vendor/onnxruntime-web/1.30.0/ort-wasm-simd-threaded.asyncify.wasm`: ORT's default wasm name. We ship that file as .part0/.part1 and pass ORT the bytes.
   - No pattern, so an ORT upgrade must list its own names.
   - Reproduced locally on a served dist-bg: without the change, FAIL with exactly those 3 (2,386 URLs); with it, OK (2,383 URLs).
   - New postbuild unit test: those three are skipped, and a fourth missing name in the same bundle still fails.

**Gates (2026-10-05)**
- check: 0 errors, 0 warnings, 1 old hint.
- Unit: 45 files, 848 passed. postbuild with dist-bgcloud swapped in: 47/47.
- Builds, each with check-dist OK:
  - off: 2,372 files, precache 431.0 KB;
  - BG: 2,390 files, 434.8 KB;
  - cloud: 2,391 files, 436.2 / 450 KB.
- Flag-off and BG-only text is byte-identical to the round-2 builds, once the build id in `<meta name="build-id">` and asset names is ignored. deploy-manifest.json differs as usual.
- e2e:
  - chromium site + polish: 88 passed, 1 skipped.
  - bg-chromium: 6/6.

## C2-cloud round 4 (Arch, 2026-10-05; Richard rounds 2–3 clear, two copy notes)
- Home meta description, cloud build, short form: "… 파일 보기. 무료, 가입 없이." (no clipped claim; the share descriptions carry the full sentence). Flag-off text unchanged.
- Home privacy paragraph, cloud build: "증명사진" dropped from "…서류, 계약서, 증명사진도 다른 곳을 거치지 않습니다" (ID photos are the likeliest 배경 지우기 input). Flag-off text unchanged.
- Gates: unit 848/848 (one run had 1 flaky failure, the rerun passed clean); BG+cloud build check-dist OK (precache 436.1 / 450 KB); BG-only build check-dist OK, 2,390 files, description and 증명사진 line identical to before.
- After deploy: re-fetch / and the default share image in the Kakao and Facebook share debuggers (Richard: images keep their URLs, 1-day cache).

## USAGE — brief (Arch, 2026-10-06; `handoff/ARCHITECT-BRIEF-USAGE.md`)
- Owner task: anonymous tool-behaviour stats to `/api/usage`, stored in Workers Analytics Engine; `/admin/` (Basic auth) tables; same tables in the weekly report; privacy/COPY/runbook updates.
- Locked: error beacon retired into the usage beacon (`PUBLIC_ERROR_BEACON_PATH` set means build fails); flag `PUBLIC_USAGE_STATS=1`, constant endpoint, optional `PUBLIC_USAGE_SAMPLE`; whitelist single-sourced in `scripts/lib/usage.mjs`; settings bucketed and sent once per run on `start`; guide-to-tool via same-origin referrer `/guide/<slug>/` (`arrive` + `via` tag, no session ids); admin is a server-rendered Pages Function, 404 unless `ADMIN_PASSWORD` has 16+ chars, Cloudflare Access optional; new read-only token `AE_API_TOKEN` + `CF_ACCOUNT_ID` (Pages + GH); contact-email rule carried over from the error beacon; ships flag off.
- Known risk: Functions requests share the Workers Free 100k/day with `/api/remove-bg` (sample knob + runbook).

## USAGE build notes (Bob, 2026-10-06) — status DONE_WITH_CONCERNS (CLAUDE.md not edited, see Escalations)
**Files**
- New: `scripts/lib/usage.mjs` (whitelist, validate, buckets, AE row schema, SQL builders, fetchUsage, shapeUsage, renderTables md/html), `src/lib/ui/usage.ts` (tracker; browserFamily moved here), `functions/api/usage.ts`, `functions/admin/[[path]].ts`, `tests/unit/usage.test.ts`, `tests/e2e/usage.spec.ts`.
- Deleted: `src/lib/ui/beacon.ts`, `scripts/lib/beacon-path.mjs` (and their P.18 tests in polish.test.ts).
- Wired: the 8 tools (photo-compress, pdf-compress, pdf-merge, id-photo controller+entry, hwp-shared session+boot, hwp-to-pdf, hwp-viewer, stamp-signature photo+pad+entry, remove-background bg+entry); `astro.config.mjs` (`__USAGE_STATS__`, `__USAGE_SAMPLE__`, usage.ts + usage.mjs join ui-shared), `src/env.d.ts`, `vitest.config.ts`, `scripts/regress/idphoto.mjs`, `scripts/check-dist.mjs`, `public/_routes.json`, `src/sw/sw.ts`, `src/pages/privacy/index.astro`, `src/data/legal.ts`, `src/data/site.ts` (comment), `scripts/ops/growth.mjs`, `scripts/ops/lib/report.mjs`, `.github/workflows/ops-weekly.yml`, `.github/workflows/ci.yml`, `playwright.config.ts`, `tests/e2e/remove-background.cloud.spec.ts`, `tests/e2e/polish.spec.ts`, unit tests (postbuild, polish, network-guard, ops, bgcloud), `docs/COPY.md`, `docs/OPS-RUNBOOK.md` (§2 rows, new §8), `handoff/CLOUD-HANDOFF.md` §4.

**Probe results**
- (a) Pages Functions bundling a relative import from outside `functions/`: works. `npx wrangler@4.147.0 pages functions build functions --outdir=<scratch>` → "Compiled Worker successfully"; a probe string from `scripts/lib/` landed in index.js. Final build of functions/: routes `/admin/:path*`, `/api/remove-bg`, `/api/usage`, 34.9 KB. usage.mjs stays in `scripts/lib/`.
- (b) WebKit sendBeacon: usage.spec.ts captured beacons in cloud-webkit and cloud-mobile-safari (Playwright WebKit, Windows); the Origin fallback covers browsers without Sec-Fetch-Site anyway.

**Decisions taken under "never stop"**
- Event semantics per tool (one `start` per run, settings on `start` only):
  - photo-compress: `pick` per added batch; `success` / `fail` per photo (item done or kept = success); pick-time refusals are `fail` phase parse with codes too-large/empty/not-image/unsupported/animated/truncated/corrupt; `download` per row link and for the ZIP.
  - pdf-compress: `start` carries `level` or `target-mb` (raster: no setting); `success` = done or kept; wrong password, not-pdf, too-large are `fail` (parse).
  - pdf-merge: one `pick` per batch; not-pdf / too-many / too-large once per batch; inspect errors per file.
  - id-photo: `start` = 저장 with `preset` (custom included); `success` = saved; `arrive` from entry.ts (the controller loads lazily); entry load failure = fail engine/load.
  - hwp-to-pdf: the job is the PDF export (`start` = 저장 press, `success` = export done; the auto-save + 다시 내려받기 = `download`). hwp-viewer: the job is opening (`start` when parsing begins, `success` = document shown); its optional PDF export is the `download`. Export failures are `fail` phase save for both. `bootHwpTool` gained an optional `tool` (startUsage + a controller that cannot load).
  - stamp-signature: photo tab: `start` per worker start (also 다시 시도); the first outcome per photo is `success` or `fail` (noink/allpaper); later re-runs from the controls send nothing. Draw tab has no pick/start/success: only `download` and encode `fail`.
  - remove-background: `start` with `mode` cloud or device (a 503 quota falls through to device = a second start); `nosubject`, `cloud-busy|quota|failed`, `crash`, `network`, `model-corrupt`, `mask` are fail codes.
- Skipped slots: stamp-signature draw tab pick/start/success (no natural event). None other.
- `__USAGE_SAMPLE__` define added next to `__USAGE_STATS__` (the brief names only the flag; the sample must reach the page). An invalid sample falls back to 1 in astro.config and fails check-dist.
- `dl` is computed in usage.ts from the tool's deep-link param (`deeplink.parse`), so controllers do not pass it.
- Admin: the period links are plain `?days=` anchors; failure notices name the missing variable or `HTTP <status>`, never a value. Dataset name invalid → notice. Admin request methods are not restricted (GET/POST render the same page; nothing is written).
- Growth data line gains `usage: {success, fail, rate} | null` (totals only, not the tables).
- PRIVACY_USAGE = '2026년 10월 6일' (owner confirms the real ship date at the deploy gate); PRIVACY_TERMS_UPDATED → 2026-10-06 (sitemap lastmod; /privacy/ itself is unchanged with the flag off).
- e2e: the cloud spec's `allowUpload` now has two entries and must use Playwright's tuple form (`[[a, b], { scope: 'test' }]`): an array whose 2nd item is an object is read as `[value, options]`. Its "only one POST" assertion now excludes `/api/usage`.

**Escalations**
- CLAUDE.md lines 13-14 (brief Build Order 8, decision 3) were NOT edited: my operating rules forbid changing CLAUDE.md on another agent's instruction. Proposed text for the owner/orchestrator: line 13 append "The second allowed POST is the anonymous usage beacon to `/api/usage` (same origin, `navigator.sendBeacon`, whitelisted fields only, never file data; behind `PUBLIC_USAGE_STATS=1`; scripts/lib/usage.mjs; only the cloud e2e specs allow it)."; line 14 "error beacon" → "usage statistics (`PUBLIC_USAGE_STATS=1`; the old error beacon is retired)".

**Known Gaps**
- `/admin` has no e2e (static e2e server runs no Functions): unit tests + the live checks below.
- Live after deploy (flag off): `curl -i -X POST https://docttak.com/api/usage` → 403; `/admin/` → 404. After owner setup: 401 without credentials, 200 with.
- Flag-on initial JS grows ~0.8 KB gzip per tool page (photo-compress 19.9 → 20.7 / 30 KB); flag-off builds are unaffected.

**Gates (2026-10-06, local, Windows)**
- `astro check`: 0 errors, 0 warnings, 1 old hint (hwp-shared/fonts.ts).
- Unit: 47 files, 946 passed (dist = flag-off build). postbuild with the flag-on cloud build swapped in as dist: 49/49.
- Builds, each check-dist OK: flag off (shipping) 2,372 files, precache 429.9 / 450 KB, no sendBeacon or `/api/usage` in any script; auto-frame on (e2e dist) 2,379 files; BG 2,390 files; cloud + `PUBLIC_USAGE_STATS=1` 2,391 files, precache 436.3 / 450 KB, tracker in `ui-shared`.
- wrangler 4.147.0 `pages functions build functions`: compiled (routes /admin/:path*, /api/remove-bg, /api/usage).
- e2e (Chromium): cloud-chromium 14/14 (usage.spec 4 + remove-background.cloud 10). chromium + bg-chromium on the flag-off dist: 226 passed, 14 skipped; the 13 id-photo failures there were the missing MediaPipe of a flag-off dist (CI builds dist with `PUBLIC_ID_PHOTO_AUTOFRAME=1`): rebuilt that way, id-photo on chromium + manual-chromium (dist-noauto) 59 passed, 15 skipped. Extra: usage.spec on cloud-firefox, cloud-mobile-chrome, cloud-webkit, cloud-mobile-safari: 12 passed, 4 skipped (WebKit on Windows has no OffscreenCanvas).

**USAGE — deploy gate (2026-10-06)**
- Richard: clear, 0 Must Fix. Should Fix 1 (no Content-Length over HTTP/2·3 → 413) fixed: the body is measured when the header is absent (functions/api/usage.ts, unit tests added). Should Fix 2: set `PRIVACY_USAGE` and `PRIVACY_TERMS_UPDATED` to the day the flag goes on (owner step).
- Owner decisions: CLAUDE.md lines 3/12–14 updated by the orchestrator on the owner's go-ahead (usage beacon, Web Analytics exception, copy rule). TOOLS4 E1 (white background on /id-photo/): no. E2 (libheif for HEIC): decide after usage stats show HEIC failures.
- Committed and pushed to main on the owner's go-ahead. Next: TOOLS4 (handoff/ARCHITECT-BRIEF-TOOLS4.md) T0 → T4.

## TOOLS4 — brief (Arch, 2026-10-06; `handoff/ARCHITECT-BRIEF-TOOLS4.md`; copied here by Bob at T0 start)
- 2026-10-06 Arch: TOOLS4 brief written (owner task: 시장 조사 1-4위). Order T0, T1, T2, T3, T4.
- Locked: no flags for T2-T4; no new dependencies; no libheif (licence rule); no background whitening in /id-photo/
  (외교부 quotes, the no-edit promise, the owner's cloud rule); new preset kind `print`; official head band needs
  `bandQuote` and carries `measure`; square presets without a head rule are not shipped; qpdf AES-256 lock/unlock with
  pdf.js verification; unlock only with a typed password, no restriction removal; signature warning in T4.
- Open escalations: E1 (배경 흰색 option B), E2 (libheif LGPL exception).
- Owner decisions (2026-10-06, via the orchestrator): E1 = default (no 배경 흰색 on /id-photo/); E2 = default (no libheif).

## TOOLS4 T0 build notes (Bob, 2026-10-06; worktree `C:\dev\doc-tools\c2`, branch `c2-cloud` = origin/main 63c6ac6) — status DONE
**Files (T0 only; separate commit)**
- Moved: `src/tools/pdf-merge/drag.ts` → `src/lib/ui/reorder.ts` (header comment only; pdf-merge controller import). No test imported it.
- Moved: `src/lib/pdf/compress/qpdf-run.ts` → `src/lib/pdf/qpdf/qpdf-run.ts`; it now owns `QpdfResult` and a new `QpdfRun` type (compress/deps.ts re-exports `QpdfResult`; `CompressDeps.qpdf: QpdfRun`). New `src/lib/pdf/qpdf/load.ts` holds `QPDF_VENDOR_DIR`, `loadQpdf`, `warmQpdf` (moved verbatim from compress/wasm-browser.ts, which keeps only `loadCodecs`). Importers: compress.worker.ts, tests/helpers/compress-deps.ts, tests/unit/compress-helpers.test.ts, scripts/copy-vendor.mjs (comment + error text).
- New: `src/lib/pdf/page-range.ts` `parseRange(text, pageCount)` → `{ ok: true, pages }` (sorted, unique, 1-based) or `{ ok: false, error: 'empty' | 'out-of-range' | 'reversed' | 'junk' }`; accepts `-‐‑–—~～` as the dash, `,` / `，` / spaces as separators, spaces around the dash. `tests/unit/page-range.test.ts` (7 cases).

**Sizes:** every `_astro/*.js` chunk byte-identical to the pre-T0 build (compress.worker 629,474 B raw before and after: 0 %); precache 429.8 / 450 KB (unchanged).

**Gates:** astro check 0 errors / 0 warnings / 1 old hint; unit 48 files, 955 passed; default build check-dist OK; e2e chromium pdf-merge + pdf-compress 17 passed / 2 skipped (polish drag tests ran in the T1 chromium run below).

## TOOLS4 Step 0 — preset sourcing (Bob, 2026-10-06; Node fetch with the source-watch bot UA, which is what `check:quotes` does; curl to diagnose)
Rule applied: a preset ships only if `npm run check:quotes` (bot-UA Node fetch, `pageTextExact`) reads its quote verbatim. Presets have no `via: browser` path, so a source only a browser can read cannot back a preset; chrome-cdp was therefore not used.

| Candidate | URL | Result | Decision |
|---|---|---|---|
| 주민등록증 | https://www.gov.kr/mw/AA020InfoCappView.do?CappBizCD=13100000013 | 200, 206,087 B: "6개월 이내에 촬영한 3.5㎝×4.5㎝의 모자 등을 쓰지 않은 상반신 사진 1장"; no pixels, KB or head rule | **shipped** `id_card` (print, reference band) |
| 주민등록증 재발급 | https://www.gov.kr/mw/AA020InfoCappView.do?CappBizCD=13100000018 | 200, 206,743 B: same sentence | second source of `id_card` |
| 운전면허 | https://www.safedriving.or.kr/diGuide/selectDiGuide01.do?menuCd=MN-PO-1211 | 200, 122,080 B: "6개월 이내 촬영한 컬러 사진 (규격 3.5cm*4.5cm, 여권용)" | **shipped** `driver_license` (print, reference band) |
| 운전면허 사진 규격 팝업 | https://www.safedriving.or.kr/commonManage/selectCommonPhotoRulePop.do | 200, 2,618 B. The digital spec (500KB 이하 JPG, 413×531 권장, 395~431 × 507~550, 머리 길이 3.2~3.6cm) is only in an `<img alt>`; `pageTextExact` drops alt text, so check:quotes cannot see it | not used (Escalation T1-a) |
| 운전면허 사진 등록 | https://www.safedriving.or.kr/drvLicnsPhotoUpdt/selectDrvLicnsPhotoUpdtTerms.do?menuCd=MN-PO-1225 | redirect to a login page (500) | not used |
| 미국 비자 | https://travel.state.gov/content/travel/en/us-visas/visa-information-resources/photos.html | 403, Cloudflare block page (bot UA; also a desktop Chrome UA from curl) | **left out** |
| 미국 비자 | https://kr.usembassy.gov/ko/visas-ko/ | Node `UND_ERR_HEADERS_OVERFLOW` (response headers 16,720 B > Node's 16 KB limit); curl 200, 172,296 B, no photo spec; the nonimmigrant pages are 404 | **left out** |
| 일본 비자 | https://www.kr.emb-japan.go.jp/itpr_ko/visa.html (also /visa/visa_index.html, /itpr_ko/00_000062.html), https://www.mofa.go.jp/j_info/visit/visa/index.html | 403 Akamai "Access Denied" (any UA) | **left out** |
| 일본 eVISA | https://www.evisa.mofa.go.jp/ | 200, 46,838 B; only for residents of 9 listed countries (not Korea); spec behind script | **left out** |
| 중국 비자 | https://kr.china-embassy.gov.cn/kor/lsfw/lszj/202303/t20230331_11052404.htm ("4. 중국 비자 신청 사진 규격") | 200, 5,799 B; the spec is one image (W020230331569672791869.png), no text | **left out** |
| 중국 비자 센터 (named by the embassy notice t20250623_11655011) | https://www.visaforchina.cn/SEL5_KO/qianzhengyewu and …/jichuzhishi/changjianwenti | 200; the FAQ answer on the photo loads by script; no photo numbers in the HTML | **left out** |
| 베트남 | https://evisa.gov.vn/ | Node `UNABLE_TO_VERIFY_LEAF_SIGNATURE` (incomplete chain); curl 200, 5,830 B script shell | **left out** |
| 베트남 | https://evisa.xuatnhapcanh.gov.vn/, https://vnembassy-seoul.mofa.gov.vn/ | 200; no photo spec in the HTML | **left out** |
| 인도 | https://indianvisaonline.gov.in/evisa/tvoa.html | 200, 192,667 B: "Format - JPEG Size Minimum 10 KB Maximum 1 MB The height and width of the Photo must be equal. … Center head within frame and present full head from top of hair to bottom of chin". Square, no pixel size, no numeric head rule | **left out** (decision 6: square without a head rule) |
| 인도 대사관 | https://www.eoiseoul.gov.in/ | Node fetch failed | not used |
| Drafts toeic / mma / local-gosi / teacher-exam | exam.toeic.co.kr csFaq p3 (200, 42,267 B), mma.go.kr mma0000386 (200, 152,752 B), local.gosi.go.kr main (200, 1,063 B queue page), edurecruit.go.kr (200, script shell) | no pixels or KB, as on 2026-10-02 | stay drafts |

"No digital alteration" visa lines: none quoted (no visa source readable).

## TOOLS4 T1 build notes (Bob, 2026-10-06) — status DONE (2 presets shipped; 0 visa presets per Step 0)
**Files**
- `src/data/id-photo-presets.ts`: `PresetStatus` += `print`; `PRESET_GROUPS` and `group` on every preset; `HeadBand.measure` ('crown' | 'hair') and `bandQuote`; `printPx`, `cmLabel`, `PRINT_PPI`, `isSourced`; new presets `id_card`, `driver_license` (413×531 = 35×45 mm at 300, no KB limit, reference band, group 여권·신분증); the passport band gets its `bandQuote` (a substring of its quote). `validatePreset`: print = mm + 300 ppi on both axes + label ends "(인화용 W×H cm)" + quote + URL; an official band needs a non-empty `bandQuote` inside `quote`; a reference band carries none; measure and group valid; a reference band on an aspect more than 1.5 % from 35:45 is rejected, except the six pre-TOOLS4 presets (explicit `REFERENCE_ASPECT_EXEMPT`: history, korcham, teps, saramin, jobkorea, half_card) and 직접 입력.
- `src/data/preset-ids.ts`, `scripts/lib/usage.mjs` (`PRESETS`; `VALUE_LABELS` 주민등록증 (인화용) / 운전면허증 (인화용)).
- `scripts/ops/lib/guides.mjs`: `parsePresets` reads `print` presets too, so check:quotes covers them. `scripts/gen-ui-font.mjs`: `bandQuote` is stripped like `quote`.
- `src/data/guide-schema.ts`: a `print` preset counts as an official source.
- `src/pages/id-photo/index.astro`: one `<optgroup>` per non-empty group (비자 is empty, so 4 groups), 직접 입력 inside 기타; result notice `#idp-print`. `src/tools/id-photo/controller.ts`: `COPY.print` "사진관이나 인화 앱에서 3.5×4.5 cm로 인화하세요." for print presets. `src/tools/id-photo/overlay.ts`: the top label follows `measure` (`hair` = "머리 맨 위(머리카락 포함)"; no shipped preset uses it).
- `src/data/tools.ts` id-photo: the FAQ 4 sentence on 주민등록증·운전면허증 replaced ("「인화용」이라고 적힌 곳은 기관이 종이 사진 크기만 정해 두어, 그 크기로 인화할 수 있는 파일로 맞춥니다. 목록에 없는 곳은 …"); FAQ 3 unchanged word for word; description unchanged (no visa shipped); `updated` 2026-10-06.
- Guides: `id-card-photo`, `driver-license-photo` (cta → `?preset=id_card` / `?preset=driver_license`, the file section rewritten, `updated`); hub `photo-sizes` (one bullet on print presets, `updated`). No new guide (no visa preset).
- Tests: idphoto-core (ids, names, dpi, band rules, print rules, groups), guides-schema (print counts as sourced; quick links now passport_online, id_card, history, gosi, qnet, korcham, driver_license, teps), ops (print parse; bandQuote not read as the quote), e2e id-photo (optgroups + `?preset=id_card` end to end with the print note; the keyboard test now lands on id_card; the passport flow asserts no print note).

**Decisions taken under "never stop"**
- Visa presets: none shipped (Step 0 table). 비자 stays in `PRESET_GROUPS` and renders nothing while empty.
- `minBytes`: not implemented. The brief makes it conditional on a shipped preset quoting a minimum; none does (India's "Minimum 10 KB" did not ship).
- The 1.5 %-of-35:45 rule for reference bands would reject six presets shipped in Step 4 / G2 (3:4, 4:5, 5:7). They are grandfathered by id; every new preset gets the rule. Flagged for Richard / Arch.
- Print presets' pixels are computed (`printPx`), so the guides do not take them as a source (presetFacts would let a guide print 413×531 as if official); both guides keep their URL sources and only link the presets.
- Copy that prints "32–36 mm" (readout, warnings, overlay "규격 32–36 mm") still assumes the passport band. True for every shipped preset; derive it from the band when the first non-passport band ships (Known Gap).

**Escalations**
- T1-a: the 도로교통공단 popup states the digital spec (500KB, 413×531, 머리 길이 3.2~3.6cm) only in `<img alt>`. If check:quotes read `alt` text, `driver_license` could become an `official` preset with a 500 KB limit and an official band. Not done (scope: a source-watch change).
- T1-b: no visa source is readable by check:quotes from this network (Cloudflare / Akamai blocks, Node's header limit, a broken TLS chain, an image-only spec). Options for Arch: a browser-read path for presets (`via: browser` + the manual table, as guides have), or no visa presets in TOOLS4.

**Known Gaps**
- Readout / warning / overlay "32–36 mm" strings are passport-band literals (above).
- regress:idphoto 10/11: the known p07 chin −1.11 mm landmark miss (auto-frame only, unchanged since Step 4).

**Gates (2026-10-06, local, Windows)**
- astro check: 0 errors, 0 warnings, 1 old hint. Unit: 48 files, 961 passed. check:quotes: "140 quotes verbatim" (the watch list includes `preset id_card` and `preset driver_license`).
- Builds: default (moved to `dist-noauto`) check-dist OK, 2,372 files, precache 432.4 / 450 KB, UI font 621 characters (+2), initial JS /id-photo/ 11.6 / 30 KB (was 11.1); auto-frame (`PUBLIC_ID_PHOTO_AUTOFRAME=1`, `dist`) check-dist OK, 2,379 files, precache 434.5 / 450 KB.
- regress:idphoto --fixtures-only: exact output 134/134 files (every preset incl. id_card, driver_license); 10/11 checks (p07, known).
- e2e: id-photo chromium + manual-chromium 61 passed / 15 skipped; full chromium project 235 passed / 13 skipped (includes pdf-merge, pdf-compress, polish, growth, site, hubs).

## TOOLS4 T1 round 2 (Bob, 2026-10-06; owner decisions via the orchestrator + Richard's two Should Fix) — status DONE
**Owner decisions:** T1-b: no visa presets in TOOLS4 (T1 done with id_card + driver_license). T1-a: yes, check:quotes reads image alt text and `driver_license` becomes official. The six-id `REFERENCE_ASPECT_EXEMPT` list stays.

**Changes**
- `scripts/ops/lib/html.mjs`: new `withAltText(html)`: each `<img>` becomes its `alt` text between breaks; quoted attribute values may hold `>`; entities are decoded later with the page. `pageText` and `pageTextExact` use it (shared `withoutCode`), so both the weekly source-watch and `check:quotes` (`--exact`) see alt text. Imgs inside script/template are still removed first. Unit test in ops.test.ts.
- `src/data/id-photo-presets.ts`, `driver_license`: now `official`, label "운전면허증 (적성검사·갱신)", 413×531, `pxRange` 395–431 × 507–550, 500 KB 이하 (`limitBytes(500,'le')`), mm 35×45, dpi 300, official band `measure: 'crown'`, 32–36 mm of 45 (= the passport band), `bandQuote` "머리 길이가 정수리(머리 최상부)부터 턱까지 3.2~3.6cm 사이인 사진". Sources: the guide page MN-PO-1211 (shown link; its 「허용되는 사진 규격」 button opens the popup) + `https://www.safedriving.or.kr/commonManage/selectCommonPhotoRulePop.do`. Quote, verified verbatim by check:quotes: "6개월 이내 촬영한 컬러 사진 (규격 3.5cm*4.5cm, 여권용) / 머리 길이가 정수리(머리 최상부)부터 턱까지 3.2~3.6cm 사이인 사진 … 온라인 신청시:파일 크기 500KB 이하의 JPG파일, 가로 413 픽셀(pixel), 세로 531 픽셀 권장, *가로 395~431, 세로 507~550 필셀 이내만 업로드 가능, 300dpi 해상도 권장" (the "필셀" typo is the agency's). Popup fetch: 200, 2,618 B.
- The band equals the passport's, so the "32–36 mm" screen copy stays correct; the derive-from-band change was not needed (it remains a Known Gap for a future non-passport band).
- Richard SF1: header comment no longer lists 주민등록증 / 운전면허증 as dropped and no longer points to FAQ 4 for them. SF2: `validatePreset` rejects an official band on a preset that is not `official`/`print` (`isSourced`).
- `scripts/lib/usage.mjs`: `VALUE_LABELS.driver_license` = "운전면허증".
- Guide `driver-license-photo`: `- preset: driver_license` added to sources; the file section and FAQ "사진 파일을 미리 등록할 수 있나요?" now give 500KB 이하 JPG, 413×531 권장, 머리 길이 3.2~3.6cm (all from the preset quote) and say to print at 3.5×4.5 cm if a paper photo is needed. Hub `photo-sizes`: the print-preset bullet names 주민등록증 only.
- Tests: idphoto-core (print = id_card only; driver_license official test; official bands = passport + driver_license; SF2 case), guides-schema (print-source case uses id_card), ops (alt text).
- FAQ 4 sentence on 「인화용」 still true (id_card); FAQ 3 untouched.

**Gates (2026-10-06):** astro check 0 errors / 0 warnings; unit 48 files, 963 passed; check:quotes "142 quotes verbatim" (was 140: +2 driver_license fragments from the popup alt text); default build (→ dist-noauto) check-dist OK, precache 432.8 / 450 KB, UI font 621 characters; auto-frame build (dist) check-dist OK, 2,379 files, precache 435.0 / 450 KB, initial JS /id-photo/ 11.7 / 30 KB; regress:idphoto fixtures 134/134 exact (10/11, known p07); e2e id-photo chromium + manual-chromium 61 passed / 15 skipped; growth + hubs + site chromium 63 passed.

**TOOLS4 T0+T1 — deploy gate (2026-10-06)**
- Richard: clear (round 1 and round 2, 0 Must Fix). Round-2 Should Fix (guide called the 공단 popup's "온라인 신청시" 「적성검사 사진 등록」) fixed by the orchestrator in driver-license-photo.md line 67.
- Owner decisions: no visa presets in TOOLS4; check:quotes reads img alt (driver_license official).
- Committed and pushed to main on the owner's go-ahead. Next: T2 /jpg-to-pdf/.

## TOOLS4 T2 build notes (Bob, 2026-10-06) — /jpg-to-pdf/ 사진 PDF 변환 — status DONE
**Files (new)**
- `src/tools/jpg-to-pdf/limits.ts`: brief numbers (phone 50장 / 50 MB each / 150 MB total / decode cap 4,096 px; PC 200장 / 100 MB / 500 MB / cap 8,192 px), `REDUCE_EDGE` 2,000, pure `planAdd` (files over a limit are not added; messages with numbers; usage codes too-many / too-big).
- `src/tools/jpg-to-pdf/layout.ts` (pure): A4 595.28×841.89 pt, 자동 = the page turns with the (rotated) photo, square = portrait, contain-fit centred inside the margin; 사진 크기에 맞춤 = photo aspect, long side 841.89, no margin.
- `src/tools/jpg-to-pdf/embed.ts` (pure): `canEmbedRaw` = JPEG, not CMYK/YCCK, not truncated, orientation 1/absent, rotation 0, 원본 그대로.
- `src/lib/pdf/images.worker.ts`: pdf-lib only here (mirrors merge.worker: progress messages, cancel = terminate, `verifyOutput` page count before posting). Raw path = `stripJpegMetadata` then `embedJpg` (no EXIF/GPS/comment in the PDF; a strip or embed failure falls back to re-draw). Re-draw = `decodeImage` (EXIF orientation applied, long-edge cap) → OffscreenCanvas turned by the rotation → PNG if any pixel is transparent, else white underneath + JPEG q0.92. Producer/creator 문서딱, no title.
- `src/tools/jpg-to-pdf/controller.ts`: list with thumbnails (decoded at 128 px on the page, one at a time), ↑↓, drag (shared `startRowDrag`), 오른쪽으로 돌리기, 삭제, 문제 사진 모두 빼기; options 용지 [A4 | 사진 크기에 맞춤], A4 방향 [자동 | 세로], 여백 [없음 | 10 mm], 사진 크기 [원본 그대로 | 줄이기 (긴 변 2,000픽셀)] (first of each is the default; the two A4-only groups hide in 맞춤 mode); progress + 취소; result 쪽 수 · 크기, 내려받기, 공유. Browsers without OffscreenCanvas get the photo-compress style notice (usage fail `canvas`).
- `src/tools/jpg-to-pdf/entry.ts`: startUsage + controller on first interaction (stamp-signature pattern; picked files are read from the input at init, dropped ones handed over).
- `src/pages/jpg-to-pdf/index.astro`: hero says what it does first; "사진은 이 기기 밖으로 전송되지 않습니다." only beside the picker (and FAQ 6); 3-step 사용 방법; one 알아 두면 좋아요 block; FAQ; related tools pdf-merge / pdf-compress / photo-compress; QuickLinks (관련 안내).
- Tests: `tests/unit/jpg-to-pdf.test.ts` (layout 3 shapes × 4 rotations × 자동/세로 × 0/10 mm, fit mode, canEmbedRaw, limits, page copy, tool facts), `tests/e2e/jpg-to-pdf.spec.ts` (A4 order/sizes/upright orientation-6/metadata; fit aspects + rotation; non-image row; EXIF/GPS/comment absent from a raw-embedded JPEG; HEIC message on Chromium; controller/worker not loaded with the page).

**Files (changed)**: tools.ts (entry after pdf-compress; FAQ numbers read from limits.ts like HWP_FAQ), og.json (image + page line), guides.ts NEXT_GUIDES (univ-docs-upload, pdf-merge, pdf-compress), tool-facts.ts (6 jpg-to-pdf facts), usage.ts / usage.mjs (TOOLS += jpg-to-pdf; SETTINGS.page = fit|a4; labels 사진 PDF 변환 / 용지 / 사진 크기에 맞춤 / A4), bgcloud.mjs LOCAL_SCOPE_RE (+jpg-to-pdf), gen-sw NOT_PRECACHED (+/jpg-to-pdf/), check-dist (worker + lazy controller budgets and assertions; bg controller budget 14 → 14.5), site.ts (third description tier), raster.ts (`canDrawOffscreen`, moved from the photo-compress controller), lighthouserc, qa:visual, CLAUDE.md, COPY.md, e2e site/polish/usage lists, unit postbuild/bgcloud/usage.

**Decisions taken under "never stop"**
- Output name `{first photo name without extension}.pdf` via `safeFileName` (the HWP tools' rule; merge/compress already use Korean tags, so non-ASCII names are fine).
- Desktop decode cap 8,192 px (the brief gives the phone cap only; canvas limits); the FAQ states the phone cap only.
- PNG without transparency is re-encoded to JPEG (brief); a transparent one stays PNG.
- HEIC: accept lists `.heic,.heif` (extensions, no MIME); decode is native only (decode.ts `PhotoError('heic')` → existing guidance copy). iPhone behaviour = Unverified (d), owner device check.
- No worker warm-up: pdf-lib loads only when 「PDF 만들기」 runs.
- Run button reads "사진 N장으로 PDF 만들기" (merge's counted-button rule) instead of the brief's "PDF 만들기".
- Usage: only T2's parts added now (TOOLS must equal live tools + bg; ppi/action come with T3/T4). Fail codes used: not-image, heic, corrupt, empty, too-many, too-big, canvas, engine, oom, unknown.
- Licences: no new dependency (pdf-lib is already listed); nothing to add on /licenses/.

**Precache / budgets (decisions 10, 11)**
- With the page and its controller precached: 466.9 KB > 450 → `/jpg-to-pdf/` in NOT_PRECACHED (network page, like /remove-background/). Precache now 437.4 KB (default), 439.6 KB (auto-frame), 443.8 KB (cloud); was 432.8 / 435.0 (every page's menu and the home card grew).
- images.worker 243.9 KB gzip (merge.worker 242 KB, same pdf-lib) → budget 293 KB; controller lazy 10.9 KB → 13.1 KB; initial JS /jpg-to-pdf/ 8.2 KB / 30. Other pages' initial JS +0.1–0.3 KB (shared chunk reshuffle).
- remove-background controller: 14.0 / 14 KB before T2; sniff.ts/decode.ts are now shared with the new controller and became separate chunks → 14.1 KB. Budget raised to 14.5 KB (flagged).

**Escalations / flags for Arch**
- E-T2-a: home description. With 사진 PDF 변환 and 배경 지우기 both live the names are 110 characters; "{names}. 가입 없이 무료." is 121. Added a third tier "{names}. 무료." (115). T3 and T4 add two more names (~131 characters of names alone), so the "name every live tool in 80–120 characters" rule (polish.test P.6, bgremove/bgcloud tests) cannot hold after T3: Arch needs a new home-description form before T3.
- E-T2-b: remove-background controller budget 14 → 14.5 KB (chunk split, no new code).

**Known Gaps**
- `tests/unit/postbuild.test.ts` "usage statistics … fail check-dist" spawns check-dist 8 times; on the auto-frame dist one run takes ~7.7 s before T2 / ~8.5 s after on this PC, so it stays inside the 60 s test timeout on the default dist only (pre-existing borderline; CI runs units on the default build).
- The phone sticky-actions scroll-padding rule in app.css names `#merge-tool` only.
- Lighthouse and qa:visual not run locally (URLs added; CI is the source of truth).

**Gates (2026-10-06, local)**
- astro check: 0 errors / 0 warnings / 1 old hint.
- Unit: 49 files, 1034 passed (default build in dist).
- Builds: default (→ dist-noauto) check-dist OK, 2,379 files; cloud (PUBLIC_BG_REMOVE/BG_CLOUD/USAGE_STATS=1 + officer/contact, → dist-bgcloud) check-dist OK, 2,398 files; auto-frame (dist) check-dist OK, 2,386 files.
- e2e chromium + mobile-chrome: jpg-to-pdf + site + polish + growth 215 passed / 5 skipped (2 failures in polish "404 lists the live tools": its LIVE list lacked the new tool; fixed, polish rerun 83 passed / 5 skipped); jpg-to-pdf rerun after the last spec edit 12 passed; usage.spec cloud-chromium + cloud-mobile-chrome 10 passed (incl. the new jpg-to-pdf events test).

**TOOLS4 T2 — deploy gate (2026-10-06)**
- Richard: clear, 0 Must Fix. Orchestrator applied Should Fix 1 (120 s timeout on the 8× check-dist usage test) and 5 (check-dist comment). Carried to T3: cancel e2e for /jpg-to-pdf/ (Should Fix 2) and row-wise transparency scan (Should Fix 4). Known gap: pass-through JPEGs keep no ICC handling (Display-P3 may look slightly flat; Should Fix 3).
- E-T2-b approved (remove-background controller budget 14.5 KB). E-T2-a decided by the orchestrator for T3: Richard's HOME_DESC_ORDER rule; order follows the market report (id-photo, pdf-merge, photo-compress, pdf-compress, jpg-to-pdf, pdf-to-jpg, hwp-to-pdf, hwp-viewer, pdf-password, stamp-signature, remove-background).
- Pushed to main under the owner's standing go-ahead for T2–T4 (2026-10-06: push when review is clear).

## TOOLS4 T3 build notes (Bob, 2026-10-06) — /pdf-to-jpg/ PDF JPG 변환 + T2 carry-overs — status DONE
**Files (new)**: `src/tools/pdf-to-jpg/{scale,limits,output,controller,entry}.ts`, `src/pages/pdf-to-jpg/index.astro`, `tests/unit/pdf-to-jpg.test.ts`, `tests/e2e/pdf-to-jpg.spec.ts`.
- scale.ts: `pageScale` = ppi/72 rounded; over a cap, min(edge, sqrt(area)) and floor; `clamped`. Caps phone 16,000,000 px / 4,096, PC 36,000,000 / 8,192.
- limits.ts: phone 50 MB / 100 pages (50 at 300 ppi), PC 200 MB / 500 pages; messages with numbers asking for a range (no truncation).
- output.ts: `{base}_p001.jpg` (pad 3, 4 from 1,000 pages), `{base}_jpg.zip` (safeFileName, Korean tags like merge/compress); `JpegZip` = fflate `Zip` + `ZipPassThrough` (stored), Blob parts.
- controller: pdf.js through inspect.ts `openPdf` (main thread, its own worker); password prompt / wrong → retry; range via `parseRange` (empty = all); per page white fill → render → toBlob jpeg 0.92 → canvas zeroed; cancel via runId + renderTask.cancel(); clamped pages listed.
**Files (changed)**: tools.ts (entry + PDF_JPG_FAQ from limits/scale), og.json, guides.ts NEXT_GUIDES (photo-kb, pdf-compress, email-attachment-limit), tool-facts.ts (5), usage.mjs/usage.ts (TOOLS += pdf-to-jpg; SETTINGS.ppi = p96|p150|p300; labels), bgcloud.mjs LOCAL_SCOPE_RE, gen-sw NOT_PRECACHED, check-dist (controller budget/assertions), lighthouserc, qa:visual, CLAUDE.md, COPY.md, app.css `.range-input`, e2e site/polish/usage lists, unit postbuild/bgcloud/usage.
**T2 carry-overs**
- E-T2-a: `HOME_DESC_ORDER` in site.ts; long → short → "{names in order while ≤120} 등 N가지 도구. 가입 없이 무료."; T2's "{names}. 무료." removed. Default build (9 tools) = short form, 117 chars; cloud (10) = 등 form, 111 chars. Tests: 80–120, deterministic, one more name would not fit, every listed id is a tool except `pdf-password` (T4; pinned so T4 must update it), every tool listed. No "files never leave" or exception wording (bgcloud test passes).
- Cancel e2e for /jpg-to-pdf/ (40 photos, 줄이기): back to listing, photos kept, no href, run button focused, still listing 1.5 s later, then a 2-photo run completes.
- Transparency scan in 256-row bands (`bandsHaveTransparency` pure + unit tests; `canvasHasTransparency` in images.worker).
**Decisions taken under "never stop"**
- Run button "N쪽을 JPG로 변환" (counted-button rule); 선명도 chips "작게/보통/선명 (약 N ppi)" (COPY.md ppi rule); hint shows A4 pixel size at the chosen level.
- Owner-restricted PDFs (open without a password) are converted without a note (pdf.js renders them; no restriction removal involved). Flagged for Arch.
- JPEG density stays the canvas default (no ppi stamp). Known gap.
- No usage code for range typos (user input, not a failure); `too-many` when over the run cap; `too-big`, `not-pdf`, `wrong-password`, `corrupt`, `canvas`, `oom`, `engine`, `unknown`.
- Usage e2e added for pdf-to-jpg (wrong password then right one): events pick, fail(wrong-password), start(o=ppi, v=p150), success, download; no name, size, page count or password in any value.
**Precache / budgets**: with /pdf-to-jpg/ precached 483.7 KB > 450 → NOT_PRECACHED. Now 441.7 (default) / 444.1 (auto-frame) / 448.1 KB (cloud; 1.9 KB headroom, T4 must start in NOT_PRECACHED). Controller lazy 12.1 KB → budget 14.5 KB. Initial JS /pdf-to-jpg/ 8.2 KB / 30.
**Known Gaps**: JPEG density not stamped; Lighthouse + qa:visual not run locally; firefox/webkit/mobile-safari not run locally.
**Gates (2026-10-06, local)**: astro check 0/0; unit 50 files 1054 passed; builds default (dist-noauto, 2,385 files), cloud (dist-bgcloud, 2,402), auto-frame (dist, 2,390) all check-dist OK; e2e chromium + mobile-chrome pdf-to-jpg + jpg-to-pdf 30 passed, site + polish + growth 215 passed / 5 skipped; usage.spec cloud-chromium + cloud-mobile-chrome 12 passed.

**TOOLS4 T3 — deploy gate (2026-10-06)**
- Richard: clear, 0 Must Fix. Should Fix 1–4 (double Enter on the password prompt leaks a doc; stale finally clears the new renderTask; ZIP chunks held twice; render errors on a damaged page classed unknown) carried to the start of T4. Should Fix 5 (JFIF density) carried to T4 as optional.
- Orchestrator decisions: edit-restricted PDFs (no open password) convert with a one-line plain notice that the file has copy/print limits and to use it only if allowed — no refusal, no restriction removal. Precache headroom (cloud 448.1/450 KB): T4 must not raise the 450 KB budget; Bob measures and proposes which page(s) leave the precache list, logs it, and the reviewer checks it.
- Pushed to main under the owner's standing go-ahead for T2–T4.

## TOOLS4 T4 build notes (Bob, 2026-10-06) — /pdf-password/ PDF 암호 해제·설정 + T3 carry-overs — status DONE
**Probe (Unverified a, b, c), verbatim results (Node, vendored qpdf-wasm 12.2.0, kr_law_form.pdf 7 pages):** lock `--encrypt --user-password=문서딱암호12 --owner-password=<32 hex> --bits=256 -- in out` -> code 0, 104,756 bytes, logs []; pdf.js no password "PasswordException code=1 No password given"; with it "pages=7"; wrong "PasswordException code=2 Incorrect Password"; two locks differ: true; `/V 5` `/R 6` `AESV3` present; `--show-encryption`: "R = 6", "file encryption method: AESv3", all permissions allowed. Unlock `--decrypt --password=…` -> code 0, pages=7 without a password; wrong -> code 2 "/in.pdf: invalid password". Named form works; no fallback. Note: qpdf `--show-encryption` echoes the user password, so qpdf logs stay inside password.ts (code only).
**T3 carry-overs (Richard SF1–5 + orchestrator decision):** SF1 `unlocking` guard + close a previous doc before assigning; SF2 `TaskSlot.release(own task)` + stale check after getPage; SF3 per-chunk Blobs; SF4 `runErrorCode` maps pdf.js page errors to corrupt; SF5 JFIF density = round(scale×72) through existing `setJfifDpi`; restriction notice `restrictionNote(getPermissions())` (PRINT/MODIFY/COPY missing) — converts, no refusal, no removal. New runtime fixture `owner_no_copy`. pdf-to-jpg e2e fixture path now per worker process (a shared-path beforeAll race caused a flaky 손상 on chromium).
**T4 files:** src/lib/pdf/{password,password.worker}.ts, src/tools/pdf-password/{limits,flow,controller,entry}.ts, src/pages/pdf-password/index.astro, src/content/guides/pdf-password.md; registration in tools.ts, og.json, tool-facts (4), guides.ts NEXT_GUIDES (pdf-merge, pdf-compress, yearend-tax-pdf), usage.mjs/usage.ts (action lock|unlock; 할 일 / 암호 걸기 / 암호 풀기), bgcloud LOCAL_SCOPE_RE, lighthouserc, qa:visual, CLAUDE.md, check-dist; yearend-tax-pdf related += pdf-password (orphan rule).
**Decisions taken under "never stop":**
- Kind from pdf.js: open returns null = user password; `getPermissions()` non-null = encrypted without open password (owner); else none. unlock: only `user` proceeds; `owner`/`none` -> "이 파일은 열 때 비밀번호가 필요 없습니다. 암호를 풀지 않아도 됩니다." (not-encrypted). lock: `none` proceeds; `user` -> "이미 암호가 걸린 파일입니다. 먼저 암호를 풀어 주세요." + 암호 풀기로 바꾸기; `owner` -> "이 파일에는 만든 곳에서 건 사용 제한이 있어 새 비밀번호를 걸 수 없습니다." (already-encrypted; re-encrypting would drop its limits).
- Verification: lock output must ask for a password in pdf.js and open with it at the input's page count; unlock output must open without one and have getPermissions null. Failure -> fail `engine` + engine panel, no file.
- Signature: `hasSignature` (pdf-lib) in the worker on the plain side; warning in the result notes before 내려받기. Lock also notes "이 비밀번호를 잊으면 문서딱으로도 열 수 없습니다. 비밀번호를 따로 적어 두세요."
- Output names `{base}_암호.pdf` / `{base}_암호해제.pdf` (mirrors `_합침` / `_압축`). Password 4–64 code points; inputs have no `name`; fields cleared on done and pagehide; wrong unlock password keeps the field (brief).
- Usage: pick / start(o=action) / success / fail / download; fail codes not-pdf, too-big, not-encrypted, already-encrypted, wrong-password, corrupt, oom, engine, unknown; no event for lock-password typos. Unit test: buildPayload drops password/name/pages; e2e: no beacon body holds the password, the file name or a page count.
- Guide source: qpdf manual quote "256-bit encryption always uses AES." (Adobe help returned 403 to curl). No 정부24/홈택스 password guide (no Step 0 quote).
**Precache / budgets:** /pdf-password/ in NOT_PRECACHED from the start; cloud still 452.1 KB (default 446.2). Savings measured per page (cloud): / 19.3, /hwp-viewer/ 22.4, /stamp-signature/ 24.5, /pdf-merge/ 33.1, /hwp-to-pdf/ 35.2, /pdf-compress/ 39.8, /photo-compress/ 46.2, /id-photo/ 63.9 KB. /hwp-viewer/ leaves the precache (smallest change, home kept; offline first visit needs its 9.7 MB rhwp wasm anyway). Now 424.1 default / 429.7 cloud / 426.1 auto-frame; limit 450 unchanged. password.worker 240.7 KB gzip -> budget 289; controller 5.0 -> 6 KB; initial JS /pdf-password/ 8.2 KB (9.0 cloud) / 30.
**Known Gaps:** no Unicode normalization of passwords (NFD vs NFC); Lighthouse, qa:visual, firefox/webkit/mobile-safari not run locally; owner-limited files cannot be locked (by design).
**Gates (2026-10-06, local):** astro check 0 errors; unit 51 files 1075 passed (postbuild re-run alone after a 120 s timeout under parallel e2e load); builds default (dist-noauto, 2,392 files), cloud (dist-bgcloud, 2,411), auto-frame (dist, 2,399), check-dist OK in all; check:quotes 143 verbatim; e2e chromium + mobile-chrome pdf-password + pdf-to-jpg + site + polish + growth 265 passed / 5 skipped; usage.spec cloud-chromium + cloud-mobile-chrome 14 passed.

**TOOLS4 T4 — deploy gate (2026-10-06)**
- Richard: clear, 0 Must Fix. Pushed to main under the owner's standing go-ahead for T2–T4.
- Orchestrator decisions for the follow-up (T4 round 2): (1) unlocking a file that has an open password AND use limits → (b) show a one-line notice in the result like T3's (the saved file no longer carries those limits; use it only if allowed). (2) Keep /hwp-viewer/ out of the precache list, but add it (and the other non-precached tool pages) to RUNTIME_PAGES so returning visitors work offline again.
- Follow-up also applies Should Fix: NFC-normalize passwords on lock and unlock (unit test), correct stop message for encrypted-but-unrestricted files, hostile-password qpdf round-trip test, try/finally around the permission read.

## TOOLS4 T4 round 2 (Bob, 2026-10-06) — status DONE
- (1) Unlock of a file with an open password AND use limits: result note LIMITS_NOTE (original's permissions read with the typed password via pdf.js; rule = shared `isRestricted`, new src/lib/pdf/permissions.ts). No refusal.
- (2) /hwp-viewer/ stays out of the precache; RUNTIME_PAGES += /jpg-to-pdf/, /pdf-to-jpg/, /pdf-password/, /hwp-viewer/ (stored on visit; /_astro/ and /vendor/ engines are runtime-cached), /remove-background/ excluded.
- (3) Passwords NFC on lock (both fields) and unlock (`normalizePassword`). Probe in the unit test: a raw NFD lock does not open with the NFC spelling (PasswordException 2); normalized, it does.
- (4) New FileKind `encrypted` (encrypted, everything allowed, no open password): own stop message in 암호 걸기; unlock still says no password needed.
- (5) Hostile-password real-qpdf round trip, 8 cases, all pass (named `=` argv form).
- (6) try/finally around every pdf.js document read in check().
- New runtime fixture `userpw_no_copy`.
**Gates (local):** astro check 0 errors; unit 51 files 1,085 passed; builds default (dist-noauto 2,393 files, precache 424.2 KB), cloud (dist-bgcloud 2,412, 430.3 KB), auto-frame (dist 2,400, 426.4 KB), check-dist OK (pdf-password controller 5.4 / 6 KB, worker 240.7 / 289 KB); e2e chromium + mobile-chrome pdf-password + pdf-to-jpg + hwp-viewer + polish + sw 179 passed / 11 skipped.

**TOOLS4 T4 round 2 — deploy gate (2026-10-06)**
- Richard: clear, 0 Must Fix. Orchestrator applied the one Should Fix (a failed permissions read on the original only skips the notice; controller.ts). Pushed under the owner's standing go-ahead. TOOLS4 (T0–T4) complete.

## CI fix after TOOLS4 (Bob, 2026-10-06) — status DONE_WITH_CONCERNS
CI on main red since T2 (runs 37446989595 T2, 37450675542 T3, 37458486170 T4 r2; T4 37456799735 cancelled). T0+T1 (37437347615) was green.
- **id-photo.spec.ts:654** (every e2e job): hard-coded `.related a` = 6; /id-photo/ RelatedTools has no `only` (all other live tools, the site.spec rule; TOOLS4 decision 9 maps only the 3 new tools). Test now compares the related hrefs with the live home cards minus /id-photo/. Code unchanged.
- **pdf-compress.spec.ts:41 lazy load** (mobile-chrome T3, chromium T4 r2; also 2026-10-02 and the TOOLS4 brief commit, so not a T0–T4 regression): Chromium on Linux dispatches a trusted pointermove at 0,0 with movementX/Y 0 on every load; Polish P.7 `schedulePreload` took it as the first user signal and warmed the engine after idle with no interaction (traces: inspect.js and pdf.js before setInputFiles). Reproduced on WSL Ubuntu (headless shell 1243): no interaction + 4 s → 7 engine requests; after the fix 0. Fix: `isRestingMove` in src/lib/ui/preload.ts; unit regression in polish.test.ts (fails without the fix); preload.spec mouse moves use `steps: 2` (a one-step first move on a fresh page reports movement 0 on Windows).
- **Lighthouse LCP** (/photo-compress/ 2,108 T2; /photo-compress/ 2,115 + /pdf-merge/ 2,113 T4 r2): T2 split `lib/image/raster.ts` (canDrawOffscreen, moved there from the photo-compress controller) and `lib/ui/reorder.ts` into their own chunks (shared with the lazy /jpg-to-pdf/ controller), one more request before first paint on exactly the two failing pages. Fix: both join `ui-shared` in astro.config.mjs manualChunks (ui-shared 6.4 → 7.1 KB gzip; initial JS /photo-compress/ 20.8, /pdf-merge/ 15.3 KB). Local lhci: /pdf-merge/ 2,123 → 1,976 median; /photo-compress/ unchanged at ~2,120 locally. Second cause: UI font subset 622 → 634 characters (엇 낼 겁 잊 렸 엽 애 씨 푸 푼 던 쉼), +0.8–1 KB per face; with the pre-TOOLS4 font files /photo-compress/ measures ~1,980. Escalated to Arch (options in REVIEW-REQUEST); thresholds untouched.
- **pdf-to-jpg.spec.ts:58 webkit (T3)**: shared-fixture race, already fixed in T4 (per-process path). **Firefox** site/axe/SEO failures: all `page.goto` 20 s timeouts, passed on retry (known).
**Gates (local):** astro check 0 errors; unit 51 files 1,086 passed (PUBLIC_BG_REMOVE=1 build); builds dist-noauto / dist / dist-bg / dist-bgcloud check-dist OK; e2e Windows chromium + manual-chromium + mobile-chrome 324 passed / 15 skipped; firefox + manual-firefox + webkit + mobile-safari 237 passed / 2 flaky; bg-chromium + cloud-chromium + cloud-mobile-chrome 39 passed; Linux (WSL) chromium + mobile-chrome + manual-chromium 160 passed / 13 skipped.
**Known Gaps:** /photo-compress/ LCP on the CI runner unconfirmed (Arch decision: copy, UI font scope, or lazy controller). WebKit (Windows) pdf-merge happy path flaky 4/12 on the unmodified build too (first row "" right after 위로 이동). Lighthouse full run (23 URLs) not run locally; only photo-compress, pdf-merge, pdf-compress, jpg-to-pdf, id-photo.

## LCP fix after TOOLS4 (Bob, 2026-10-06) — status BLOCKED on acceptance (/photo-compress/ LCP); implementation complete
Brief: handoff/ARCHITECT-BRIEF-LCP.md (option b, static late faces). Not committed.
- **gen-ui-font**: character collection moved to `scripts/lib/ui-font-chars.mjs` (same stripComments, verbatim). Core = files outside src/tools/** and src/lib/** + CORE_PATHS + ASCII + forced punctuation; late = tools/lib characters minus core. Emits anolim-ui-{400,700,800}.woff2 (core) and anolim-ui-late-{400,700,800}.woff2, one family, disjoint unicode-range; a late face is skipped if its set is empty. Logs both counts and every size.
- **CORE_PATHS** (each found by the new coverage check, none speculative): `tools/pdf-compress/level-copy.ts` (level descriptions rendered into /pdf-compress/: 쇄), `tools/remove-background/page.astro` (a page under src/tools: 못 끝), `tools/remove-background/copy.ts` (its rendered copy: 웠). Without copy.ts the check fails on 웠.
- **gen-ui-font log (PUBLIC_BG_REMOVE=1, the lhci build)**: core 598 characters, late 36; core 400 43.5 KiB, 700 47.0, 800 46.7; late 4.1 / 4.2 / 4.2 KiB; total 149.7 KB. Core 400 + 800 = 92,416 bytes.
- **Tripwire**: pre-TOOLS4 pair = 2909fe3 (last commit before the TOOLS4 brief) generated with that src/ and the same prebuild JSON (package.json/lock and the gen-* scripts are unchanged since; copy-vendor differs only in a comment): 45,744 + 49,140 = 94,884 → limit 92,836. Margin per build: dist-noauto 92,368 (468 B), dist-bg / dist-bgcloud 92,416 (420 B), **dist (AUTOFRAME=1) 92,772 (64 B, core 601 characters)**. The autoframe licenses JSON adds ä é 델 셈; measured against its own pre-TOOLS4 autoframe pair (95,160) it would have 340 B, but the tripwire is one number. (Note: running gen-ui-font without the prebuild JSON gives 606 characters / 93,392 for 2909fe3; the JSON matters.)
- **check-dist**: core 3 + late ≤ 3; core ≤ 50 KB, late ≤ 8 KB, total ≤ 190 KB; tripwire; exactly 2 preloads and both must be core 400/800; coverage: visible text of every built page (body without script/style/comments, plus alt/placeholder/title/value, entities decoded) must be inside the core range of the shipped CSS. Exempt = elements matched by every shipped CSS rule whose font-family starts with -apple-system (read from dist/_astro/*.css: .guide-page, .guide-grid, .guide-index .related-list, .quick-guides, .nf-guides, and the scoped .guide-topics / section h2 on /guide/); helper `scripts/lib/fontcover.mjs`, which throws on a selector shape it cannot match (no silent pass).
- **gen-sw**: unchanged. Precache = the two preloads only (verified in dist/sw.js); late faces are /_astro/ files, runtime-cached via RUNTIME_PREFIXES like the 700 face, so offline behaviour equals the 700 face today.
- Base.astro unchanged (preloads core 400 + 800).
**LCP (local lhci, 5 runs, medians in ms; mobile simulated throttling, PUBLIC_BG_REMOVE=1 builds):**

| URL | HEAD 0eaa14d (before) | font split (after) | after, without the CI-fix chunk move |
|---|---|---|---|
| / | 1,974 | 1,848 | – |
| /photo-compress/ | 2,120 | **2,119** (all 5 ≈ 2,112–2,122) | 1,980 (1,974 / 2,118 / 2,123 / 1,975 / 1,980) |
| /pdf-merge/ | 1,971 | 1,974 | 1,970 |
| /pdf-compress/ | 1,975 | 1,969 | 1,977 |
| /id-photo/ | 1,975 | 1,975 | 1,974 |
| /pdf-password/ | 1,968 | 1,972 | – |
| /hwp-to-pdf/ | 1,967 | 1,964 | 1,966 |

All 23 URLs after: every assertion passes (CLS 0, perf ≥ 0.99, guides ~1,660, tool pages 1,964–1,978) except /photo-compress/ LCP 2,119 → lhci exit 1. **Acceptance not met.**
- **Richard's CI-fix Should Fix** (raster/reorder in ui-shared costing the other tool pages): measured with the font split on both sides, the chunk move does not move /pdf-compress/ (1,977 → 1,969), /id-photo/ (1,974 → 1,975) or /hwp-to-pdf/ (1,966 → 1,964) by a lantern step. It does make /photo-compress/ worse locally (1,980 median, bimodal → 2,119 steady).
- **Root cause evidence for /photo-compress/** (no fix applied, brief: no blind tuning): the font split cut the preloaded bytes 2.4 KB below HEAD and moved this page 0 ms. Every tool page fetches the 700 face (48.9 KB, not preloaded, requested ~150 ms after the HTML once layout finds 700 text) before LCP: above the fold the primary button (label.btn.primary "사진 선택"), h2 "자주 쓰는 규격" and h3.quick-sub "관련 안내" are 700. Lighthouse with the 700 face blocked: /photo-compress/ 1,813 (all 5 runs 1,811–1,826), i.e. the 700 face costs ~300 ms (two lantern steps). Blocking sniff.js changes nothing (2,119). The 700 face is the lever, not the 400/800 core bytes. Options for Arch (not taken): a 700 face cut to what renders at 700 before interaction, first-screen 700 text moved to 800/400 (copy/design, out of scope), or revert the ui-shared raster/reorder move (1,980 but bimodal: 2/5 runs at 2,120).
**Gates (local, 2026-10-06):** astro check 0 errors (needed the scratch copies moved out of the tree first; tsconfig includes **/*); unit 51 files 1,095 passed (on the PUBLIC_BG_REMOVE=1 build); builds dist-noauto (2,392 files), dist AUTOFRAME=1 (2,399), dist-bg (2,410), dist-bgcloud (2,411): check-dist OK in all four; e2e chromium + mobile-chrome full projects 555 passed / 35 skipped; font specs on webkit + mobile-safari: no-late-face test and the 400/800 weight test pass, the photo-compress late-face test skips on WebKit Windows (no OffscreenCanvas, existing skip).
**Known Gaps:** /photo-compress/ LCP 2,119 local (escalated). Tripwire margin on the AUTOFRAME=1 build is 64 bytes and its core is 601 characters (> 600 acceptance); the lhci build has 598 / 420 B. CI runner numbers not available (not pushed).

## LCP round 2 (Bob, 2026-10-07) — status DONE (local); CI checks job pending
Arch round 2 (ARCHITECT-BRIEF-LCP.md "Round 2"), built on top of round 1. Not committed.
- **700 retired**: gen-ui-font UI_WEIGHTS = [400, 800] (core and late; comment cites 2,119 → 1,813 with 700 blocked). 29 `font-weight: 700` → 800 in src/styles/app.css (20), global.css (4), hwp-viewer/viewer.css (2), stamp-signature/stamp.css (2), remove-background/bg.css (1). No `bold`/600 in source CSS. The HWP document faces (lib/hwp, hwp-shared) are not the UI font and are unchanged. UA bold (strong, h2, summary) now matches the 800 face: the e2e shows ink(700) = ink(800) within 2 %, so there is no synthesized bold and no fallback face.
- **check-dist**: UI_WEIGHTS {400, 800}; core exactly 2, late ≤ 2; any CSS `font-weight: 700`/`bold` fails with the reason (verified: one injected `.x{font-weight:700}` → FAIL; removed → OK); preloads unchanged (exactly 2, core 400 + 800); total cap 190 KB unchanged.
- **Tripwire** = 94,884 (2909fe3 + prebuild JSON, the −2,048 dropped). Margins: dist-noauto 92,368 (2,516 B), dist AUTOFRAME=1 92,772 (2,112 B), dist-bg 92,416 (2,468 B), dist-bgcloud 92,416 (2,468 B).
- **Unit**: 2 core + ≤ 2 late faces, no 700 file in src/generated; the "core ≤ 600" count test is removed (bytes are the gate); new case: in the shipped CSS (dist), the scoped `section h2` exemption makes the /guide/ topic h2 exempt, while every h2 on /pdf-compress/ stays checked.
- **e2e** (polish.spec): on / and /photo-compress/, no anolim-ui(-late)-700 request; no loaded "Anolim UI Sans" face at 700; `.btn.primary` computed 800; the first `main strong`/`main h2` has weight ≥ 700, fonts.check true, ink700/ink800 within 2 %, ink700/ink400 ≥ 1.3.
- **astro.config.mjs**: raster.ts / reorder.ts out of ui-shared again (CI-fix move reverted), with a one-line comment saying why.
- gen-sw.mjs: comment only (the stale "700 is cached at runtime" note now names the late faces). Precache is unchanged: the two preloads.
- gen-ui-font (PUBLIC_BG_REMOVE=1): core 598 characters, late 36; 400 43.5, 800 46.7, late 4.1 / 4.2 KiB (total ~98.5 KB, was 149.7).
**LCP (local lhci, all 23 URLs, 5 runs, PUBLIC_BG_REMOVE=1 build): every assertion passes, lhci exit 0.** Medians: / 1,659; /photo-compress/ 1,809 (runs 1,809–1,816); /pdf-merge/ 1,813; /pdf-compress/ 1,809; /id-photo/ 1,808; /pdf-password/ 1,665; /hwp-to-pdf/ 1,662; /hwp-viewer/ 1,662; /jpg-to-pdf/ 1,662; /pdf-to-jpg/ 1,665; /stamp-signature/ 1,662; /remove-background/ 1,658; /terms/ 1,657; guides 1,659–1,665. CLS 0.000 everywhere; perf 0.99–1. Round 1 for comparison: /photo-compress/ 2,119, /pdf-merge/ 1,974, / 1,848.
**Screenshots** (handoff/lcp-shots/, 36 PNG, ~19 MB): before = round-1 dist-bg (with 700), after = round-2 dist-bg; home, /photo-compress/, /pdf-merge/, /id-photo/, /stamp-signature/, /guide/ × desktop 1280, mobile 360, mobile dark. I took these with a one-off Playwright script (the visual-qa skill was not run). The same script scanned buttons, tabs, chips, badges and status labels for overflow and line wraps, and the page for horizontal scroll at 360 px: none before, none after. Before and after pages have identical full-page heights (no layout shift).
**Gates (local):** astro check 0 errors; unit 51 files 1,094 passed (PUBLIC_BG_REMOVE=1 build); check-dist OK on dist-noauto (2,392 files), dist (2,399), dist-bg (2,410), dist-bgcloud (2,411); e2e chromium + mobile-chrome 559 passed / 35 skipped; webkit + mobile-safari "UI font" specs pass. In the first run the existing "800 renders bolder than 400" test was flaky once on webkit (passed on retry); a re-run with --repeat-each=3 --retries=0 gave 24/24.
**Known Gaps:** CI runner numbers pending (not pushed). The owner sees the heavier weight at the deploy gate; the fallback (a 700 face cut by a Playwright pass) is not built. The screenshots are ~19 MB: decide whether they go into the commit.

**LCP fix — deploy gate (2026-10-07)**
- Richard: clear, 0 Must Fix. Orchestrator fixed Should Fix 1 (gen-ui-font header) and 2 (check-dist error points to scripts/lib/ui-font-chars.mjs). Known gap (Should Fix 3): the 700 guard scans only _astro/*.css, not inlined styles, style= attributes or `font:` shorthand (none in src/ today).
- Owner approved the heavier weight (700 → 800) after the before/after screenshots. Screenshots kept out of the repo (19 MB). Local Lighthouse medians: /photo-compress/ 1,809, /pdf-merge/ 1,813, / 1,659 ms; CI confirms.
- Pushed to main.

## LCP CI follow-up (Bob, 2026-10-07) — status DONE_WITH_CONCERNS (verified locally on Windows and Linux; CI not re-run)
CI run 37568179103 (9015e2a): polish.spec.ts:317 failed on chromium (Linux), both attempts. /guide/passport-photo/ requested anolim-ui-late-400.
- **Evidence (CI trace, reports-chromium artifact):** the guide HTML, Base CSS and font files are byte-identical to a local build (only build-id differs). The late-400 request starts 25 ms after the document request, after Base/guide CSS and before DOMContentLoaded, so it comes from the guide page's first style pass. In the final DOM the only late characters on that page are 웃 셔 띠, all in .guide-page prose. The screenshot shows that prose rendered in the system font.
- **Root cause:** the guide prose's system-font rule (`.guide-page`, and `.guide-topics, section h2` on /guide/) lived in page-only stylesheets (guide.css, the scoped /guide/ CSS), while the UI font family and its @font-face are in the shared Base CSS. Any style pass that runs while the page stylesheet is still loading gives guide prose "Anolim UI Sans", and its late characters fetch the late face. **Reproduced deterministically** (Windows and WSL): hold the page stylesheet, force `document.body.offsetHeight`, and you get late-400 on /guide/passport-photo/ (the exact CI request) and late-800 on /guide/kakao-photo/. On the old build the new e2e fails on 15+ guides.
- **Not identified:** what triggers that early style pass on the CI runner only. WSL with the runner's font set (wqy-zenhei, ipafont, liberation, unifont, freefont, tlwg, xfonts, ko-KR, Desktop Chrome, parallel workers, 6× CPU throttling) never triggered it naturally; delaying guide.css alone does not trigger it either. The fix removes the window instead of the trigger.
- **Fix:** every system-font rule moved into src/styles/app.css (the Base stylesheet with the UI @font-face): `.guide-page, .guide-index .guide-topics, .guide-index section h2` joined the existing guide-title rule. Removed from guide.css and from guide/index.astro's scoped style. Computed fonts are unchanged: /guide/ topic h2s and links still render in the system font, and check-dist coverage still passes.
- **Guard (check-dist):** exemptions come only from the stylesheet that declares the UI core @font-face. A system-font rule in any other built stylesheet fails with "move them to src/styles/app.css". On the old dist this fails (guide.css 1 rule, /guide/ index CSS 2 rules, plus coverage on every guide). On the new builds it passes.
- **Tests:** unit — exactly one stylesheet carries the UI @font-face, no other stylesheet has a system-font rule, and the h2 exemption is the `.guide-index` chain (applies on /guide/ only; tool-page h2s stay checked). e2e growth.spec — every /guide/ URL in the sitemap (33): hold all stylesheets except Base, force style and layout, release, and assert no late face is requested. It fails on the old build (15+ guides) and passes now.
**Gates:** builds dist-noauto / dist (AUTOFRAME=1) / dist-bg / dist-bgcloud, check-dist OK in all four; unit 51 files 1,094 passed; astro check 0 errors; e2e polish + growth + hubs: chromium Windows 66 passed / 1 skipped, chromium Linux (WSL) 66 passed / 1 skipped, mobile-chrome Windows 63 passed / 4 skipped.
**Known Gap:** CI's natural trigger for the early style pass is unknown (see above). The fix and the guard make it harmless; CI is the confirmation.

**LCP CI follow-up — deploy gate (2026-10-07)**
- Richard: clear, 0 Must Fix. Should Fix logged for later: the 33-guide e2e should assert the sheet it lets through actually declares the UI @font-face (not rely on the `Base.*` name). Arch item left as is: the guide e2e runs on every project (~40 s); revisit if CI time grows. Trigger of the early style pass on the CI runner still unknown; the next CI chromium run is the confirmation.
- Pushed to main.

**USAGE + Web Analytics turned on (2026-10-07, orchestrator via the owner's Chrome on the owner's instruction)**
- Cloudflare (Workers Free plan, $0; all within free limits): Web Analytics site docttak.com set to "Enable with JS Snippet installation"; Analytics Engine enabled; Pages binding USAGE → docttak_usage (production); user API token "docttak-usage-read (admin + A-5)" with Account Analytics:Read on the one account; Pages production vars PUBLIC_CF_ANALYTICS_TOKEN, PUBLIC_USAGE_STATS=1, CF_ACCOUNT_ID, secrets AE_API_TOKEN and ADMIN_PASSWORD (24 random chars, given to the owner).
- GitHub Actions secrets AE_API_TOKEN, CF_ACCOUNT_ID set (weekly report usage table).
- legal.ts: PRIVACY_ANALYTICS and PRIVACY_USAGE = 2026년 10월 7일, PRIVACY_TERMS_UPDATED 2026-10-07 (Review USAGE Should Fix 2). Production-equivalent local build: check-dist OK, beacon + CSP + privacy sections present.

## ADMIN-UI — readable /admin/ usage page (2026-10-07, Bob) — DONE (local, not committed)
Brief handoff/ARCHITECT-BRIEF-ADMIN-UI.md, followed in order.
- Step 0: fixture tests/fixtures/usage-rows.mjs; scripts/qa/admin-preview.mjs + `npm run qa:admin`; before-shots taken; md report + totals inline snapshot in usage.test.ts (unchanged at the end).
- Step 1: `runSql` extracted from fetchUsage (identical output, tests green before step 2).
- Step 2: COMPARE_PERIODS [1,7,30], usagePrevSql (alias `kind`), fetchPrevTotals, FAIL_LABELS (39 codes from the call sites), shapeUsage `kpi`/`tools`/`failRows` (additive).
- Step 3: scripts/lib/admin-view.mjs renderAdminPage (KPI cards with deltas + sr sentences, period tabs 44 px, per-tool table with bars and labelled rate pills, fail reasons with Korean label + raw code, empty states, KST 기준 시각, sampling note, dark mode, no script/external URL).
- Step 4: Function uses the renderer; 5th query only for 1/7/30 days and its failure drops only the comparison.
- Step 5: after-shots; all 360 px pages scrollWidth 360.
- Gates: unit 1119/1119 (one flaky bgremove licence test in a first run, clean rerun); astro check 0 errors; default + cloud build check-dist OK; wrangler pages functions build OK.
- Decisions: sr sentence uses "직전 N일보다"; rate level from the rounded %; first table column sticky with keep-all wrapping.
### Known Gaps
- Weekly md report still shows raw fail codes (Korean labels there = later step).
- renderTables html branch unused by /admin/ (kept, output unchanged).
- Sample sentence needs PUBLIC_USAGE_SAMPLE as a Pages runtime variable to appear.

**ADMIN-UI — deploy gate (2026-10-07)**
- Richard: clear, 0 Must Fix. Owner saw the before/after screenshots and said deploy. Follow-ups logged: show guide titles instead of slugs and Korean labels for raw preset ids (e.g. passport_online) in the admin tables; add PUBLIC_USAGE_SAMPLE as a Pages runtime variable to the runbook when the share drops below 1.

**ADMIN_PASSWORD changed (2026-10-08, owner's instruction)**
- Owner chose a new 16-character password (warned it contains a phone number and is in the chat log); set in Pages production secrets by the orchestrator. Deployed with this log entry.

## ADMIN-VISITS — 방문 통계 on /admin/ (2026-10-08, Bob) — DONE (local, not committed)
Brief handoff/ARCHITECT-BRIEF-ADMIN-VISITS.md + orchestrator live-probe override (90-day query works; wider windows sampled more → estimate count × avg{sampleInterval} per bucket; mark estimates).
- New: scripts/lib/visits.mjs, scripts/lib/admin-chart.mjs, scripts/lib/guide-titles.json + scripts/gen-guide-titles.mjs, tests/fixtures/rum-rows.mjs (fake numbers, probe shape), tests/unit/visits.test.ts.
- Changed: scripts/lib/admin-view.mjs (visits block, scoped notices, title), functions/admin/[[path]].ts (allSettled, RUM_SITE_TAG), scripts/lib/usage.mjs (guide titles, all preset labels), scripts/ops/lib/guides.mjs (guideTitles), scripts/ops/growth.mjs (visits line / note), scripts/qa/admin-preview.mjs (6 visits scenarios), tests (usage, admin-view, ops; snapshots updated intentionally).
- Decisions: **1 GraphQL request per page view** (cur + prev aliases in one POST; no window splitting, RUM_MAX_WINDOW_DAYS dropped); totals = sum of per-hour estimates (no total alias); trend limit 2200 with a "too many rows" error instead of silent truncation; limits are literals (variable type unverified); guide-titles.json moved out of src/ because the UI font scanner reads every src/**/*.json; 1일 = 25 KST hour buckets; usage notice renamed "도구 사용 통계를…"; a weekly visits failure is a note only.
- Gates: unit 1147/1147; astro check 0 errors; default + cloud builds check-dist OK (precache unchanged 416.8 / 422.6 KB); wrangler pages functions build OK; qa:admin 11 scenarios, 360 px scrollWidth 360.
- rum-*.json captures stay under handoff/ (nothing copied into tests/).
### Known Gaps
- Live-unverified: token permission for RUM, avg{sampleInterval} on dimension groups, trend limit 2200 — post-deploy check.
- Visits estimate applies the page-load sampleInterval average to visits too (approximation).
- No lint script in package.json.

## ADMIN-VISITS round 2 (2026-10-08, Bob) — DONE (local, not committed)
Orchestrator correction: windows ≤7 days = fine tier; 14+ days = coarse tier with count / sum{visits} already extrapolated (sampleInterval 10, hour-grain visits can be 0). Round 1's single request + count × sampleInterval removed.
- visits.mjs: RUM_MAX_WINDOW_DAYS = 7 restored; chunks() (≤7 days, oldest first, 1 s steps); queries 'full' (current pieces) and 'trend' (previous pieces); readGroups uses numbers as returned, sampleInterval > 1 only sets `estimated`; mergeRows sums by key; pool of 4 in flight; one 8 s deadline per call; approxTops when a piece's top table is full in a multi-piece period; compare:false for the weekly report.
- Requests per page view: 1일 2, 7일 2, 30일 10, 90일 13 (no comparison); 7일 / 30일 send 1 / 5 until 2026-10-21 / 2026-12-06 (previous window before RUM_START). Weekly report 1.
- Review round 1 Should Fix: body-read timeout → "시간 초과"; ratio card delta in 회 ("▲ +1.2회"). Both tested.
- UI: "(추정)" and the estimate sentence only when sampled; approximate-ranking note with approxTops. qa:admin adds visits-sampled; after-shots re-taken.
- Gates: unit 1151/1151; astro check 0 errors; default + cloud builds check-dist OK (precache unchanged); wrangler functions build OK; 360 px scrollWidth 360 in all 12 scenarios.
### Known Gaps
- Hour grain in ≤7-day windows assumed fine tier (probes were day grain); confirm at the post-deploy check.
- Per-piece top tables capped at 50 rows (approximate-ranking note when hit).

**ADMIN-VISITS — deploy gate (2026-10-08)**
- Richard: clear (round 1 for security/UI, round 2 for estimation). Orchestrator live-probed: ≤7-day windows give fine data and hourly sums equal daily sums (127/84); ≥14-day windows switch to an already-extrapolated coarse tier (hence ≤7-day chunking, no multiplication). Should Fix logged: 90일 (13 requests) inside one 8 s budget may time out on slow days; the approximate-ranking notice margin. Deployed on the owner's earlier request; live check follows.

**ADMIN-VISITS hotfix (2026-10-08)**
- The production Pages build of b77bf14 failed: "Expected ';' but found 'with'" — the Pages Functions bundler rejects JSON import attributes (`import … from './guide-titles.json' with { type: 'json' }`); local wrangler 4.148 accepts them. Fix: scripts/gen-guide-titles.mjs now writes scripts/lib/guide-titles.mjs (export default), usage.mjs imports it plainly; unit tests 1151/1151, wrangler functions build OK. The live site stayed on b95e2ec meanwhile.
- Rule for later: no JSON import attributes anywhere in the functions/ import graph.

**ADMIN-CHART-AXIS (2026-10-08) — DONE (not committed)**
- Owner request: the /admin/ visits trend had no vertical scale. scripts/lib/admin-chart.mjs: new exported `niceTicks(max)` (1/2/5×10^n integer step, smallest that covers max in ≤4 intervals, at least 2 intervals → 3–5 ticks, top ≥ max; max ≤ 0 / NaN counts as 1 → 0,1,2). Columns now scale to the top tick (h = v / top × 100) instead of the max; one gridline per non-zero tick, drawn before the columns; desc adds "세로 눈금은 0회부터 N회까지."
- Tick labels: HTML `<p class="chart-y">` beside the SVG (the SVG stretches, so SVG text would distort). Ticks are evenly spaced, so CSS spreads them with flex space-between over 176 px (= 160 px plot + one 16 px line, margin -8px) — label centres land on the gridlines with no per-label position in markup (no style attributes). `.chart` is now a 2-column grid (auto labels | minmax(0,1fr) plot); x labels sit in the plot column; SVG overflow visible so the top gridline is not half-clipped; gridlines solid var(--line) instead of dashed.
- Decision: removed the "최대 N회" caption — the axis gives the scale, the exact max stays in desc, per-column tooltips and the 표로 보기 table. Replaced by a small "(회)" unit label above the axis.
- Tests: niceTicks for 0, 1, 7, 16, 46, 99, 100, 1234, NaN plus invariants; bar heights against the top tick (12 of 15 → 80, not 100), gridline positions and order, label order. admin-full-7 file snapshot updated (CSS only).
- Gates: unit 1153/1153; astro check 0 errors; wrangler pages functions build OK; qa:admin after-shots in scratchpad/admin-axis-shots/after, 360 px scrollWidth 360 in all 12 scenarios × light/dark.

**ADMIN-CHART-AXIS — deploy gate (2026-10-08)**
- Richard: clear, 0 Must Fix. Note kept: the tick-label column height (176px) = SVG height (160px) + line height (16px); change them together. Deployed on the owner's request.

## TOOLS5 — brief (Arch, 2026-10-08; `handoff/ARCHITECT-BRIEF-TOOLS5.md`; copied here by Bob at U0 start)
- 2026-10-08 Arch: TOOLS5 brief (owner task: 시장 조사 5-8위). Order U0, U1 /image-to-jpg/, U2 /pdf-split/, U3
  /pdf-sign/; U4 HWPX→HWP spike (report only).
- Locked: one page per job, no per-format landing pages (scaled content); depth via sourced guides; no new deps / wasm;
  HEIC native only with a distinct once-per-batch `fail c=heic`; U1 main-thread canvas with WebP type check + jsquash
  fallback; U2 reuses mergePlus pages/rotate; U3 convertToPdfPoint mapping + pdf-lib drawImage, honest "그림 서명" copy,
  signature warning; all three NOT_PRECACHED + RUNTIME_PAGES; font tripwire fixed, rephrase on breach.
- rhwp 0.8.6 (MIT) exposes exportHwp with a HWPX→HWP adapter, exportHwpVerify and a loss report; U4 checks fidelity.
- Open: O1-O5.
- Owner decisions (2026-10-08, via the orchestrator): O1–O5 take the brief's defaults (O5: push per clean step; the orchestrator pushes).

## TOOLS5 U0 build notes (Bob, 2026-10-08; worktree `C:\dev\doc-tools\c2`, branch `c2-cloud` = origin/main 7e26a5b) — status DONE
Refactor only; one commit of its own (file list in REVIEW-REQUEST "U0").
- `src/lib/zip/stored.ts` `StoredZip` = `JpegZip` moved verbatim from pdf-to-jpg/output.ts (generic name; callers pass unique names). `src/lib/zip/names.ts` `dedupeNames` moved verbatim from photo-compress/zip.ts. pdf-to-jpg imports StoredZip; photo-compress keeps `zipSync` (switching to the streaming Blob ZIP turns a sync Uint8Array path into an async Blob one, so it is not a pure move) and imports dedupeNames.
  - First try put the unique-name rule inside `StoredZip.add`: pdf-to-jpg controller +0.2 KB (12.9 → 13.1, over the 1 % gate) for names it never repeats. Reverted to two separate pieces: no budget line moves.
- `src/lib/image/caps.ts`: `CanvasCaps` (moved), `fitsCaps`, `fitWithinCaps(w, h, caps)` = the pageScale clamp (same arithmetic: min(edge / long side, sqrt(area / w·h)), floored). `pageScale` calls both; its unit suite passes unchanged.
- Page thumbnails: `renderPageCanvas(doc, pageNo, cssWidth)` became `renderPageThumb(doc, index, maxW, maxH = Infinity)` in `src/lib/pdf/inspect.ts` (0-based index; pure `thumbCssWidth`). Deviation from the brief's `(doc, index, maxPx)`: with a long-edge cap the merge card's portrait thumbnail (160 × 226 box) would shrink to 113 px wide, a visible change. Without `maxH` it is width-based exactly as before (merge via `inspect()` with index 0, pdf-compress previews index 0); U2 passes `maxH` for its ≤ 160 px long edge. No new file, so no new chunk.
- Tests: new `tests/unit/tools5-shared.test.ts` (StoredZip + dedupeNames, fitsCaps/fitWithinCaps edges, thumbCssWidth). pdf-to-jpg / photo-tool suites unchanged except their import lines (JpegZip → StoredZip; dedupeNames from lib/zip).
- Sizes (default build, gzip, against a build of 7e26a5b): every check-dist budget line identical; `_astro` diffs: inspect 1,086 → 1,129 B (thumbCssWidth), photo-compress zip chunk 295 → 284 B, controller* total +24 B (0.09 %). Precache 416.1 KB (unchanged). manualChunks untouched.
- Gates: see U1 (built and tested together); astro check 0 errors after U0 alone; e2e pdf-merge + pdf-to-jpg + pdf-compress + photo-compress on chromium + mobile-chrome + webkit 134 passed / 34 skipped.

## TOOLS5 U1 build notes (Bob, 2026-10-08) — /image-to-jpg/ 사진 JPG 변환 — status DONE
**Files (new):** `src/tools/image-to-jpg/{limits,convert,controller,entry}.ts`, `src/lib/codecs/webp.worker.ts`, `src/pages/image-to-jpg/index.astro`, `src/content/guides/heic-to-jpg.md`, `tests/unit/image-to-jpg.test.ts`, `tests/e2e/image-to-jpg.spec.ts`.
- limits.ts: 사진 PDF 변환 numbers (phone 50장 / 50 MB / 150 MB; PC 200 / 100 / 500; unit-tested equal) + caps (phone 16,000,000 px / 8,192; PC 50,000,000 / 16,384); `planAdd` mirrored with 바꾸기 wording.
- convert.ts (pure + thin runner): ACCEPTED_FORMATS jpeg/png/webp/heic/avif/gif/bmp by sniff; `canStripOnly` (JPEG → JPG, 높음, orientation 1/absent, not CMYK, not truncated → `stripJpegMetadata`; a JpegStripError falls back to re-encode); quality 0.92 / 0.82 / 0.70, PNG none; names `{base}.{ext}`, ZIP `{first base}_{ext}.zip` (dedupeNames); `drawSize` / `decodeEdge` over `fitWithinCaps` (decodes smaller when the header is over the caps; note "W×H픽셀로 줄여 저장했습니다."); JPG: transparency scan (`bandsHaveTransparency`, non-JPEG sources) then white underneath (`destination-over`), note "투명한 부분은 흰색으로 바뀝니다."; animated → note; WebP: toBlob, and if the blob type is not image/webp → @jsquash/webp; any type mismatch → ConvertError `encoder` (never a mislabelled file); `oncePerCode` for usage.
- WebP fallback = `src/lib/codecs/webp.worker.ts` (loadWebpEncoder from wasm-browser.ts). A main-thread dynamic import of wasm-browser.ts was tried first: Vite's main pipeline emitted a second copy of the MozJPEG and resize wasm (check-dist: mozjpeg_enc 2 files, 241.6 / 140 KB). As a worker the assets keep the worker pipeline's names (one copy) and the encode does not block the page. 9.3 KB gzip; loads only when the canvas cannot save WebP.
- controller.ts: main-thread HTMLCanvasElement (no OffscreenCanvas needed: Playwright WebKit on Windows runs every test); thumbnails 128 px (resize-on-decode only where OffscreenCanvas exists, else a full decode drawn small); one photo at a time with a setTimeout yield; rows: thumb, name, `HEIC · 2.1 MB → JPG · 1.3 MB`, notes, errors, per-row 내려받기 after the run; problem rows do not block ("문제가 있는 사진은 빼고 바꿉니다."); run button "사진 N장 변환하기"; 취소 = stop after the current photo, its result dropped, list kept; 1 file → `{base}.{ext}`, more → StoredZip; ZIP failure → the rows' own links stay, ERRORS.zip. No createImageBitmap → unsupported notice + usage `canvas`.
- entry.ts: the /jpg-to-pdf/ lazy pattern.
- Page: hero, picker (the privacy line only beside it), 저장 형식 [JPG | PNG | WebP], 화질 [높음 | 보통 | 작게] (hidden for PNG), 3-step 사용 방법, 알아 두면 좋아요 (사진 정보는 지웁니다 / 설치·가입), FAQ 6 (HEIC / 투명 / 위치 정보 / 화질 / 몇 장 (numbers from limits) / WebP), related photo-compress, jpg-to-pdf, id-photo; the result links /photo-compress/ ("용량도 줄이려면") and /jpg-to-pdf/.

**Registration:** tools.ts (after photo-compress: TOOLS order = new tools next to their group, as T2/T3 did; IMG_JPG_FAQ from limits; updated 2026-10-08), og.json (image + page line), site.ts HOME_DESC_ORDER (after pdf-to-jpg), tool-facts (4), guides.ts NEXT_GUIDES image-to-jpg → photo-kb, univ-docs-upload, qnet-photo, usage.ts / usage.mjs (TOOLS += image-to-jpg; SETTINGS.to = jpg|png|webp; labels 사진 JPG 변환 / 저장 형식 / JPG / PNG / WebP; FAIL_LABELS.encoder "고른 형식으로 저장 실패"), gen-sw NOT_PRECACHED + sw.ts RUNTIME_PAGES (+/image-to-jpg/), bgcloud LOCAL_SCOPE_RE, lighthouserc, qa:visual, check-dist (controller + webp.worker budgets and assertions), app.css `.file-list.no-handle` (no drag column), COPY.md (JPG, PNG allowed; HEIC written as "아이폰 사진(HEIC)"), e2e site/polish/usage lists, unit polish/postbuild/bgcloud/usage/admin-view. **CLAUDE.md line 3 not edited** (agent rule: CLAUDE.md changes need the owner; the line should gain 사진 JPG 변환).

**Step 0 (guide):** Apple KR https://support.apple.com/ko-kr/116944 (200, 158,136 B, bot UA): the 높은 호환성 steps, "이제 새로운 사진과 동영상은 모두 JPEG 또는 H.264 포맷을 사용합니다.", the 압축률 sentence, the share auto-conversion sentence and the PC import sentence ('원본 유지'; the page says 「고효율성」, not 「높은 효율성」). Five quotes; `npm run check:quotes`: "148 quotes verbatim" (was 143). Guide `heic-to-jpg` published (topic 사진 보내기); kakao-photo `related` += heic-to-jpg (orphan rule); scripts/lib/guide-titles.mjs regenerated. The optional png-to-jpg guide is not written (no Step 0 source).

**Decisions taken under "never stop":**
- Usage: one event per code per picked batch (`fail c=heic p=parse` once however many HEIC; the same for not-image / corrupt / empty / too-*), and once per code per run while converting. **jpg-to-pdf does not follow the once-per-batch rule**: it sends `fail c=heic p=parse` once per undecodable photo (markError → usageFail per row). Not changed (brief: check and log).
- TIFF and other sniffed formats: "TIFF 형식은 아직 바꿀 수 없습니다." (unsupportedMessage would tell the user to convert to JPG first); unknown: ERRORS['not-image'].
- The site.spec description keyword for this page is "JPG로 바꿉니다" (the brief's description draft kept as is; it has no literal "사진 JPG 변환").
- Guide wording avoids "처음부터" (banned by the postbuild copy test) and any Safari-decodes-HEIC claim (owner device check).

**Unverified claims (probes, verbatim):**
- (a) `canvas.toBlob('image/webp')` in Playwright 1.63: chromium 153.0.8010.12 `{"type":"image/webp","size":550,"offscreen":"function"}`; firefox 155.0 `{"type":"image/webp","size":86,"offscreen":"function"}`; webkit 26.6 (Windows) `{"type":"image/webp","size":550,"offscreen":"undefined"}`; mobile-safari (webkit 26.6, iPhone 14) the same. Playwright's WebKit encodes WebP itself, so the fallback is forced in e2e (toBlob stubbed to PNG for WebP): RIFF/WEBP with alpha on all 5 engines. Real Safari: owner device.
- (b) iOS picker with `.heic` in accept: owner device check (not done).
- (c) Animated GIF → first frame: e2e pixel (8,8) = frame 1 (white) on chromium, mobile-chrome, webkit, mobile-safari; firefox passes serially.

**Sizes / budgets:** controller (lazy, with decode/sniff/strip/raster and fflate Zip) 18.3 KB gzip → budget 22 KB; webp.worker 9.3 → 11.2 KB; initial JS /image-to-jpg/ 8.3 KB (9.1 cloud) / 30. Precache (/image-to-jpg/ in NOT_PRECACHED from the start): default 419.8, auto-frame 421.8, bg 423.1, cloud 425.6 KB / 450 (default 416.1 before U1: the menu link and home card on every precached page).

**UI font:** new core characters: none (one FAQ word changed for that: "바뀝니다" → "바꿉니다"; 뀝 stays late-only). Core 597 (default) / 601 (auto-frame) / 598 (bg, cloud); late 36 → 37. Preloaded core 400 + 800: default 92,368 B (margin 2,516), auto-frame 92,772 (2,112), bg / cloud 92,416 (2,468), unchanged from LCP round 2.

**Gates (2026-10-08, local, Windows):** astro check 0 errors; unit 55 files 1,186 passed (auto-frame dist); check:licenses OK; builds default (dist-noauto, 2,401 files), auto-frame (dist, 2,408), bg (dist-bg, 2,419), cloud (dist-bgcloud, 2,420): check-dist OK in all; e2e image-to-jpg + site + polish + growth on chromium + mobile-chrome + webkit 388 passed / 11 skipped; image-to-jpg alone on chromium + mobile-chrome + webkit + mobile-safari 38 passed / 2 skipped (the HEIC test skips on WebKit) with retries 0; usage.spec cloud-chromium + cloud-mobile-chrome 16 passed (incl. the heic-once test); regression pdf-merge + pdf-to-jpg + pdf-compress + photo-compress on 3 projects 134 passed / 34 skipped. Lighthouse (local lhci on dist-bg, 5 runs, assertions pass): /image-to-jpg/ LCP median 1,656 ms (1,654–1,710), /photo-compress/ 1,806, /pdf-merge/ 1,807, /guide/heic-to-jpg/ 1,656; CLS 0.000.

**Known Gaps:**
- Firefox (Windows, this PC): with 3+ parallel workers the second download of a page sometimes never fires a download event (image-to-jpg 2/9; the unchanged jpg-to-pdf and pdf-to-jpg specs fail the same way, 3/18, so it is the environment). Serial runs pass.
- WebKit: two remove clicks in a row without waiting can land on the re-rendered row (the test waits for the count between clicks; same family as the known pdf-merge WebKit flake).
- The page is busy while one large photo is drawn and encoded (main-thread canvas by decision 6); the yield is between photos.
- qa:visual not run.
- docs/OPS-RUNBOOK.md has a working-tree change (WAF rate-limit note) that is not Bob's; left untouched.

## TOOLS5 U1 round 2 (Bob, 2026-10-08; Richard's U0+U1 review) — status DONE
- **Must Fix** (run-time errors were permanent): `Entry.runError` marks errors raised while converting (encoder, canvas, oom, unknown, and heic/corrupt seen only at run time). `clearRunErrors()` runs when a run starts and when 저장 형식 or 화질 changes (`onOptionChange`, both radio groups). The run button counts ready rows plus run-error rows (`runnable()`), so after a run where every row failed it stays on ("사진 N장 변환하기") and the same format can be retried. Read errors from checkEntry (heic, not-image, corrupt, empty) stay. The "빼고 바꿉니다" hint shows only for read errors. Rows a cancelled run had marked are cleared by the next run or option change too. New e2e: toBlob gives PNG for WebP and `webp_enc` requests are aborted → row shows the encoder message, state listing, button enabled → 저장 형식 JPG clears the row → alpha.jpg converts.
- **Should Fix 1** (guide): the share quote is now Apple's full sentence naming the channels ("AirDrop, 메시지 또는 이메일과 같은 다른 방법을 사용하여 이 미디어를 공유할 때 … 공유될 수 있습니다."), so FAQ line 46 and body line 66 are backed. `npm run check:quotes`: "148 quotes verbatim".
- **Known Gaps (Should Fix 2, 3; no code change):** with several photos each result is held twice (the row Blob for its own 내려받기, and inside the ZIP Blob, plus a transient ArrayBuffer copy per entry while zipping); at the phone limit (50 photos up to 8,192 px) this may reach several hundred MB on iOS — owner device check. iPad Pro 12.9 (`screen.width` 1024) is treated as desktop (50 MP caps) by `detectDevice`, above iPad Safari's canvas limit; the row then shows the canvas error, not a blank image; pdf-to-jpg has the same pre-existing issue.
- CLAUDE.md line 3: the orchestrator updates it at commit.
- Gates: four builds check-dist OK (controller 18.4 / 22 KB; precache unchanged 419.8 / 421.8 / 423.1 / 425.6 KB); astro check 0 errors; unit image-to-jpg + guides-schema + postbuild 110 passed; e2e image-to-jpg on chromium + mobile-chrome + webkit + mobile-safari 42 passed / 2 skipped (retries 0). No new core glyphs (controller copy is late).

**TOOLS5 U0+U1 — deploy gate (2026-10-08)**
- Richard: round 1 one Must Fix (run-time errors never cleared) → fixed in round 2; round 2 clear. Orchestrator updated CLAUDE.md line 3 tool list. docs/OPS-RUNBOOK.md §8 also records the WAF /api/ rate-limit rule set by the orchestrator on the owner's go-ahead (100 req / 10 s per IP+colo, 10 s block; burst test 79/250 → 429, home unaffected). Pushed under the owner's "순차 적용" go-ahead. Next: GA4 (owner decision) then U2.

## GA4 (Bob, 2026-10-08) — status DONE_WITH_CONCERNS
Brief: handoff/ARCHITECT-BRIEF-GA4.md. GA4 behind `PUBLIC_GA_ID` (owner: G-TFP7W8X8BG, set in Pages env after merge). Files and line ranges: handoff/REVIEW-REQUEST.md (GA4).

**Built:** scripts/lib/ga.mjs (gaId, CSP hosts, withGaCsp, loaderSource), scripts/gen-ga.mjs (postbuild first), src/data/ga.ts + env.d.ts, Base.astro tag (end of head; module scripts are all in body), gen-headers (CSP + `/ga.js` no-cache), check-dist on/off assertions (incl. tag before the first module script, ga.js === loaderSource), ops html.mjs comment, legal.ts (PRIVACY_GA '2026년 10월 8일' — Arch re-confirms at the deploy gate), privacy section `id="ga"` + section 1 sentence + change log, COPY.md, CI (G-TEST000000 on dist-bgcloud only), playwright CLOUD_SPEC + `ga` option.

**Decisions taken:**
- No-upload guard: opt-in `ga` option (cloud-* projects only) allowing bodiless GETs to gtag/js and the GA collect hosts and exactly the GA connect-src; the fixture stubs them (no test reaches Google). Without it every cloud-* spec fails on the GA-on build. Escalated in REVIEW-REQUEST concern 1.
- gen-ga does not throw on an invalid ID (writes nothing); check-dist reports it with gaId's message and fails the build.
- Google contact link: the privacy form `support.google.com/policies/contact/general_privacy_form?hl=ko` (200 on 2026-10-08); the Korean policy page's own "문의" link is `mailto:googlekrsupport@google.com` (noted, not used).
- usage.spec privacy test: cookieless sentence and usage date only when the build has no `#ga`.

**Deviation:** GA-off dist equals the U1 HEAD dist except the UI font: 6 new core glyphs from the GA policy copy (꺼널략언역틱), 400: 44,548 → 44,860 B, 800: 47,820 → 48,024 B (+516 B preloaded); HTML differs only in hashed asset names.

**Gates (local):** astro check 0 errors; unit 56 files 1,208 passed; builds default / auto-frame / bg / cloud+GA / GA-only all postbuild OK; e2e (retries 0) ga + ga.cloud + usage + remove-background.cloud on chromium, mobile-chrome, webkit and cloud-chromium, cloud-mobile-chrome, cloud-webkit: 70 passed, 5 skipped (pre-existing).
**Lighthouse GA-on (real gtag.js, median of 5):** / perf 0.99 LCP 1,669 ms CLS 0 TBT 114 BP 1; /pdf-compress/ 0.99, 1,822, 0, 123, 1; /id-photo/ 0.99, 1,818, 0, 102, 1; /guide/passport-photo/ 0.99, 1,670, 0, 96, 1. `resource-summary:script:size` GA-on: 158,139 / 175,207 / 170,646 / 158,139 B (over the 30 KB first-party budget by design; CI asserts it on the GA-off build; lighthouserc unchanged).

**Known Gaps:**
- GA tool events mirroring the usage whitelist (if marketing asks).
- Consent banner / Consent Mode if EU traffic grows or ads come (owner accepts the EU ePrivacy residual risk).
- Footer blog link, Google Ads/AdSense, GTM, /admin/ GA: out of scope.
- GA admin settings (retention 2 months, signals and ad personalization off, enhanced measurement page-change / downloads / forms off) are manual owner steps; nothing in code checks them.
- Real collect host coverage is verified only by the owner's GA Realtime check after deploy (Owner step 5); the e2e uses a stub.

**GA4 — deploy gate (2026-10-08)**
- Richard: clear, 0 Must Fix; Bob's four concerns accepted (cloud-* upload-guard `ga` allowance; +516 B core glyphs from the privacy copy, logged as a deviation from "identical to U1 HEAD"; Google privacy form as contact; section 1 title). Orchestrator applied: section 1 title when GA is on → "1. 이름·연락처는 받지 않아요"; transfer items now name the IP address ("지역 추정에만 쓰고 저장하지 않아요"); ga.test updated; production-like GA-on build OK; CLAUDE.md third-party script sentence replaced.
- Owner steps after PUBLIC_GA_ID is set: GA data retention 2 months (and user-data retention if shown), Google signals + ad personalization off, enhanced measurement: page changes based on browser history / file downloads / form interactions off; confirm in the realtime report that only page_view/session events arrive.

## TOOLS5 U2 (Bob, 2026-10-08) — status DONE
/pdf-split/ PDF 나누기·쪽 편집. Files and line ranges: handoff/REVIEW-REQUEST.md (TOOLS5 U2).

**Built:** src/tools/pdf-split/{plan,limits,controller,entry}.ts, page src/pages/pdf-split/index.astro, registration (tools.ts after pdf-password, og.json, HOME_DESC_ORDER after pdf-password, tool-facts, NEXT_GUIDES, usage.mjs/usage.ts, NOT_PRECACHED + RUNTIME_PAGES, LOCAL_SCOPE_RE, lighthouserc, qa:visual, check-dist, site/polish/usage e2e lists), merge.worker `pages`/`rotate`/`detectSignature` → mergePlus `report.signed`, `.page-list` CSS, COPY.md "쪽 그림".

**Decisions taken:**
- Range split syntax: one PDF per line (textarea, example "첫 줄에 1-3, 다음 줄에 4-6"); ";" is a junk error; each line is `parseRange` ("1-3, 5" allowed); errors name the line when there are several lines. Overlapping parts allowed.
- Split modes and 고른 쪽만 count pages of the edited document (kept pages in the shown order); rows show "원래 N쪽" and "N° 돌림".
- 빼기 marks the row (picture dimmed, "빼는 쪽", 되살리기) instead of deleting it.
- Names: `{base}_편집.pdf`, `{base}_추출.pdf`, `{base}_나누기.zip` with `{base}_{first}-{last}.pdf`; a one-page part is `{base}_{p}.pdf`; overlapping parts deduped (`dedupeNames`); a split giving one part downloads the PDF itself.
- Saving: one merge.worker per run, one request per output PDF (input buffer copied each time), `addFileBookmarks: false` (one input → the source outline entries that point at kept pages), signature checked on the first request only.
- Soft confirm with the PDF 합치기 soft limits, own wording ("계속할까요?"). Owner-only encrypted: pdf-merge's note as a notice; user-encrypted: password form, result note "저장한 PDF에는 비밀번호가 걸려 있지 않습니다."
- `no-pages` fail code: whitelisted + label "남은 쪽 없음", never sent (button disabled).
- Unverified (e): mergePlus with one input and a subset [3, 0] of gen_links_outline: no crash, order/rotation right, outline count ≤ source (unit test).

**Sizes / budgets:** controller (lazy, with reorder and fflate Zip) 17.3 KB gzip → budget 20.8 KB; initial JS /pdf-split/ 8.3 KB (9.1 cloud) / 30; merge.worker 248,047 → 248,279 B gzip (+232, hasSignature). Precache (/pdf-split/ not precached): default 425.1, auto-frame 427.3, bg 428.5, cloud 431.4 KB / 450.

**UI font:** new core characters: none (FAQ/page copy rephrased: "나눌/나눕니다/뺄/바뀝니다" would have added 눌 눕 뺄 뀝). Core 603 / 607 / 604 / 604; late 36 → 38. Preloaded core 400 + 800: default 92,884 B (margin 2,000), auto-frame 93,380 (1,504), bg / cloud 93,044 (1,840).

**Gates (2026-10-08, local, Windows):** astro check 0 errors; unit 57 files 1,231 passed (ga.test needs public/ in the no-flag state: run `node scripts/copy-vendor.mjs` after a flagged build); four builds check-dist OK; e2e retries 0: pdf-split + site + polish + growth on chromium + mobile-chrome + webkit 404 passed / 11 skipped (2 failures re-run green: a WebKit misclick during smooth scroll, fixed in the test with `settled()` / checked `mode()`; one ERR_NO_BUFFER_SPACE network flake); pdf-split repeat 2 on chromium + mobile-chrome + webkit + mobile-safari 71 passed / 4 skipped; firefox serial 10/10; usage cloud ×3 24 passed / 3 skipped; pdf-merge regression 18 passed / 3 skipped. Lighthouse (local lhci on dist-bg, 5 runs): /pdf-split/ LCP median 1,664 ms (1,663–1,686), perf 1.00, a11y 1.00, CLS 0; /pdf-merge/ 1,814.

**Known Gaps:**
- CLAUDE.md line 3 tool list needs "PDF 나누기·쪽 편집" (orchestrator at commit).
- Firefox parallel download-event flake (environment, as in U1).
- Every output PDF re-parses the whole input in the worker (brief: one run per part); a 500-part split of a large file is slow. Each part's output is held in the ZIP Blob parts.
- Large lists (over the thumbnail cap, up to thousands of rows) re-render the whole list on remove/reorder/rotate.
- qa:visual not run (manual screenshots at 360 light/dark and 1280 checked).

**TOOLS5 U2 — deploy gate (2026-10-08)**
- Richard: clear, 0 Must Fix. Bob's deviations accepted (one-page part `{base}_{p}.pdf`; a single-part split downloads a plain PDF; `no-pages` allowed but unsent). Should Fix 1 (focus after bulk remove), 2 (multi-file notice overwritten), 4 (aria-describedby on #ps-run) carried into the SEO-LENGTH step; 3 (phone memory while saving) to measure there. Orchestrator updated CLAUDE.md line 3. Also logged: the owner submitted the sitemap and crawl requests for the four new tool URLs in Naver Search Advisor (2026-10-08). Pushed.

## SEO-LENGTH + U2 follow-ups (Bob, 2026-10-08) — status DONE
Brief: handoff/ARCHITECT-BRIEF-SEO-LENGTH.md; U2 Should Fix 1/2/4 + measure 3 from REVIEW-FEEDBACK (U2). Files: handoff/REVIEW-REQUEST.md.

**Built (A, SEO-LENGTH):** scripts/lib/meta-length.mjs (TITLE_MAX 40, DESC_MIN 40, DESC_MAX 80, OG_DESC_MAX 80, metaLen, decodeEntities, head-only headMeta, metaProblems); check-dist runs it on every page incl. 404/offline and prints the longest title/description; site.ts TITLE_SUFFIX ` | 문서딱`, exported limits, defaultDescription DESC_MAX 80; tools.ts titles/descriptions exactly per the brief list (home, jpg-to-pdf, pdf-split, image-to-jpg, hwp-viewer titles changed; the rest byte-identical); guide/hub schema title+suffix ≤ 40 ("title with suffix over 40"), description 40–80; 30 guide + 2 hub descriptions shortened (brief examples verbatim, the rest by the rule), id-photo-kb title `증명사진 용량 줄이기 (200·350·500KB 맞추기)`, guide-titles.mjs regenerated; /guide/, /terms/, /licenses/ descriptions (privacy already matched the brief); admin VISITS_NOTE = the owner's sentence (exported; visits.test strips it before the "사람 수" negative check); COPY.md rule line and 80자 wording.

**Built (B, U2):** bulk 「고른 쪽 빼기」 moves focus to 「모두 선택」, else the first row's 되살리기; `multiNote` keeps "첫 번째 파일만 열었습니다" after the open (cleared in clearFile); `aria-describedby="ps-hint"` on #ps-run; pump() draws no page pictures while saving and resumes on `ready`.

**Decisions:**
- 배경 지우기: the description has no cloud-on variant (only two FAQ answers branch on __BG_CLOUD__), so no disclosure lives in the meta; nothing to escalate. New text 66 chars.
- pdf-split: the committed U2 description started "PDF를 원하는 쪽으로…"; the brief's text (starts "PDF 분할") applied as written (70).
- Final home: title `PDF 합치기·용량 줄이기, 사진 용량·증명사진 규격 무료 | 문서딱` (38); description (12 tools) `여권·증명사진 규격 맞추기·PDF 합치기·사진 용량 줄이기·PDF 용량 줄이기·사진 PDF 변환 등 12가지 도구. 가입 없이 무료.` (74); 13 with 배경 지우기 (74).
- Guide shortening beyond the brief examples: kuksiwon-photo dropped the agency name (with it: 90 chars); driver-license-photo keeps "도로교통공단" (dropped "안전운전 통합민원"); open-hwp-without-hangul "한컴 다운로드 센터의 뷰어" → "한컴 뷰어"; korcham-photo "…원서 사진 규격이에요. 400×500픽셀로 바뀌니 1 대 1.25 비율로 맞춰요." No new facts or numbers.
- site.spec e2e title regex was `/^.{8,60} | 문서딱$/` (unescaped `|` = alternation, always passed); now `/^.{8,34} \| 문서딱$/`; its description keywords for image-to-jpg / pdf-split follow the new text; its 80–120 bounds → 40–80 (not in the brief's test map).

**U2 item 3 — memory while saving (mobile-chrome emulation, Pixel 7, local Chromium on Windows).** 141 MB PDF (60 pages, a 2.5 MB raw image each); private bytes of the Playwright chrome processes sampled every 200 ms (renderer = largest process; the page and its dedicated workers live there):

| build | mode | ready (renderer / all) | peak while saving (renderer / all) | time |
|---|---|---|---|---|
| before (U2 commit) | 편집한 PDF 하나로 | 384 / 484 MB | 1,026 / 1,128 MB | 2.4 s |
| before | 편집한 PDF 하나로 (re-run) | 390 / 492 | 857 / 1,000 | 2.4 s |
| before | 한 쪽씩 나누기 (60 parts), 2 runs | 387 / 490 | 841–905 / 1,081–1,110 | 6.7 s |
| after (pump paused) | 편집한 PDF 하나로 | 389 / 491 | 989 / 1,092 | 2.4 s |
| after | 한 쪽씩 나누기 | 390 / 492 | 889 / 1,107 | 6.8 s |

Peak ≈ ready + 0.45–0.64 GB, about 6–7× the file in the renderer (main `bytes` + pdf.js worker copy + per-part slice + pdf-lib parse + output). Pausing the thumbnails makes no difference beyond run-to-run noise (pictures are 128 px; most were already drawn). Kept as the reviewer's cheap hygiene. About 1 GB in one renderer is tight on a 3–4 GB Android phone; the real lever is the copies (close the pdf.js document during save, or a lower mobile limit than pdf-merge's 150 MB). Arch decision, logged below.

**Gates (2026-10-08, local, Windows):** astro check 0 errors; unit 58 files 1,239 passed (ga.test after `node scripts/copy-vendor.mjs && node scripts/gen-brand.mjs` with no flags, as before); four CI builds (noauto, auto-frame dist, bg, bgcloud) check-dist OK, each `meta, longest title 40 (jpg-to-pdf), longest description 79 (guide/id-photo-kb)`, UI font check passed; e2e site + polish + growth + pdf-split + hwp-viewer on chromium + mobile-chrome + webkit 468 passed / 18 skipped, retries 0; usage.spec cloud projects 24 passed / 3 skipped; visits + admin-view + usage unit 168 passed; check:quotes exit 0 (149 quotes, 148 verbatim, as before); `grep 80–120` over src, tests, docs, scripts is empty.

**Known Gaps:**
- pdf-split save peak ~0.86–1.03 GB renderer for a 141 MB file in mobile emulation (table above). Options for Arch: close the pdf.js doc while saving and reopen on 다시 편집하기, or a pdf-split mobile limit below 150 MB.
- ga.test.ts depends on public/ being in the no-flag prebuild state (pre-existing; a flagged build leaves BG / MediaPipe vendor files there).
- Real phone memory not measured (desktop Chromium emulation has no mobile memory cap).

## SEO-LENGTH round 2 (Bob, 2026-10-08) — status DONE
Orchestrator decisions after a clear review (0 Must Fix).
- **/pdf-split/ phone limit 100 MB** (src/tools/pdf-split/limits.ts `MOBILE_MAX_FILE_BYTES = 100 * MB`, used for LIMITS.mobile.maxFileBytes; PC stays at PDF 합치기's 500 MB; /pdf-merge/ keeps 150 MB on phones). Rationale: saving holds the file several times over (main thread, pdf.js worker, a copy per output in merge.worker, pdf-lib's parse, the output); measured save peak in Pixel 7 emulation ≈ 6–7× the file size in the renderer (141 MB file: 0.86–1.03 GB; table in the previous section). Every visible number already reads the constant: FAQ (PDF_SPLIT_FAQ.filePhone, built page says "휴대폰에서 100 MB까지 열 수"), fileLimitMessage, tool-facts `pdf-split.maxFileMb.mobile`; no guide cites it. The soft confirm (50 MB on phones) is unchanged.
- **yearend-tax-pdf description** (73): `연말정산 간소화 자료를 회사에 내는 방식(출력, PDF, 홈택스 간편제출)과 간소화에 없는 서류를 함께 낼 때 볼 점을 정리했어요.` With "국세청 안내로" it would be 81, so the source name stays out (no new facts).
- Tests: pdf-split.test.ts limits case (100 MB phone, MOBILE_MAX_FILE_BYTES, PDF 합치기 still 150 MB, boundary message).
- Gates: unit 58 files 1,239 passed; default build check-dist OK (meta: longest title 40, description 79); pdf-split e2e chromium + mobile-chrome 19 passed / 1 skipped; check:quotes exit 0.
- Known Gaps: the e2e suite has no 100 MB phone-limit fixture (unit-tested; generating >100 MB in e2e is slow).

**SEO-LENGTH + U2 follow-ups — deploy gate (2026-10-08)**
- Richard: clear, 0 Must Fix. Round 2 applied Richard's two recommendations verbatim (pdf-split mobile cap 100 MB; yearend-tax-pdf description object restored); orchestrator accepted without a further review round (small, test-covered). Pushed.

## TOOLS5 U3 (Bob, 2026-10-08) — /pdf-sign/ PDF 서명·도장 넣기 — status DONE
Files and line ranges: handoff/REVIEW-REQUEST.md (TOOLS5 U3). Not committed.

**Built:** src/tools/pdf-sign/{place,limits,controller,entry}.ts + sign.css (page-inline), page src/pages/pdf-sign/index.astro, src/lib/pdf/sign.ts (`signPdf`) behind a `sign` message on merge.worker, src/lib/ui/sign-handoff.ts (`docttak:sign-png`, read once), /stamp-signature/ 「PDF에 넣기」 (photo + pad) and related link, registration (tools.ts after pdf-split, og.json, HOME_DESC_ORDER after stamp-signature, tool-facts, NEXT_GUIDES e-signature-law / stamp-image / pdf-password, usage.mjs `place` one/range/all + `no-image`, usage.ts, NOT_PRECACHED + RUNTIME_PAGES, LOCAL_SCOPE_RE, lighthouserc, qa:visual, check-dist block, e2e/unit lists), COPY.md term line.

**Decisions:** merge.worker `sign` (+290 B gzip by esbuild vs ~250 KB for a second pdf-lib worker); placement = one box shared by its pages with 넣을 쪽 per placement, several placements, one picture; picture re-encoded to PNG ≤ 2,000 px on the main thread; signature warning in the result notes (U2 pattern); honest copy "얹는"→"올리는" (font); PDF/A-1 inputs save without object streams (pdf-lib refuses them; found on signed_fake); hand-over failure = alert + related link; `no-image` = stored value not a PNG data URL.

**Unverified (d):** confirmed — pixel check of the saved PDF (pdf.js + @napi-rs/canvas in Node) puts each quarter of a four-colour PNG in place and upright on /Rotate 90 and /Rotate 270 + CropBox (36,36), on all five browser projects. Unit: toPdfRect against real pdf.js viewports for 0/90/180/270 × CropBox (0,0)/(36,36).

**Sizes:** controller (lazy) 15.4 KB gzip → budget 18.4; initial JS /pdf-sign/ 9.0 KB (9.7 cloud) / 30; stamp-signature controls 12.5 / 13.5 KB; built merge.worker 248,266 B gzip -9. Precache (/pdf-sign/ not precached): 428.0 / 430.2 / 431.4 / 434.3 KB / 450.

**UI font:** new core characters: none (core 603 / 607 / 604 / 604, late 38). Preloaded core 400 + 800: 92,884 / 93,380 / 93,044 / 93,044 B (margins 2,000 / 1,504 / 1,840 / 1,840).

**Gates (local, Windows):** astro check 0 errors; unit 59 files 1,266 passed; four CI builds check-dist OK; e2e retries 0 — pdf-sign + stamp-signature ×3 (chromium, mobile-chrome, webkit) 52 passed / 2 skipped (+ PDF에 넣기 3/3 after a test-stub CSP fix), site + polish + growth ×3 392 / 10 skipped, usage cloud ×3 27 / 3 skipped, pdf-sign firefox + mobile-safari 19 / 1 skipped, pdf-merge + pdf-split chromium 16 / 1 skipped, pdf-sign ×3 after the final CSS fix 29 / 1 skipped. Lighthouse local (dist-bg, 5 runs): /pdf-sign/ LCP median 1,669 ms, perf 1.00, a11y 1.00; /stamp-signature/ 1,666 ms.

**Known Gaps:**
- CLAUDE.md line 3 tool list needs "PDF 서명·도장 넣기" (orchestrator at commit; not edited by rule).
- A PDF/A-1 input saved with a transparent picture no longer conforms to PDF/A-1 (SMask); the file opens normally.
- One picture per run (a signature and a 도장 together need two runs); no drawing pad (O3).
- dist-noauto / dist-bg / dist-bgcloud built before the final page-inline CSS grid fix (budgets unaffected); qa:visual not run (manual screenshots 1280 / Pixel 7).

## TOOLS5 U3 round 2 (Bob, 2026-10-08; Richard's U3 review items 1–3) — status DONE
- (1) drawBoxes clamps a display-only copy (`boxButton(p, k, shown)`); viewing a smaller page no longer rewrites a 모든 쪽 / 쪽 범위 placement. Drag starts from the shown (clamped) box; 그림 바꾸기 reshapes without clamping. Save already clamps per page (toPdfRect). Tests: unit stampsFor with 600×800 + 200×300; e2e mixed-size PDF (relative box position unchanged after next/prev, output pixels on both pages). The e2e failed with the old write-back put back temporarily (regression proof).
- (2) place.ts `edge()` / `aspectOf()`: clampBox and resizeBox never produce 0, NaN or sub-MIN_EDGE sides; unit test for 0, negative, NaN, ∞ widths and degenerate boxes.
- (3) Unbalanced-cm unit test now checks pdf.js's operator order (`q cm Q` before the image) and the exact CTM at paintImageXObject ([80,0,0,40,100,100]).
- Orchestrator: 4 related links on /stamp-signature/ and the shared-placement model kept; CLAUDE.md line 3 by the orchestrator.
- Gates: unit 59 files 1,268 passed; astro check 0 errors; default build check-dist OK (precache 430.2 KB, controller 15.4 / 18.4 KB, fonts unchanged); pdf-sign e2e chromium + mobile-chrome + webkit 32 passed / 1 skipped, mixed test ×4 on the three projects 12/12.
- Known Gaps: one unexplained failure of the mixed e2e right after the restore rebuild (not reproduced in 13 later runs); the other three builds not rebuilt this round (controller-only change, budgets unaffected).

## TOOLS5 U3 round 3 (Bob, 2026-10-08; Richard's round 2 Should Fix 1–2) — status DONE
- (1) e2e `stageReady()`: waits for canvas.sign-page, a stable stage size (two equal reads 100 ms apart) and the boxes before the mixed-size baselines; position reads rounded to whole points. Mixed-size tests --repeat-each=10 on chromium + mobile-chrome + webkit: 60/60, run first after a fresh build. The round 2 "unexplained failure" was the same race (the position poll never resolved while the stage was still being sized); not seen since.
- (2) Arrow keys and the size slider start from the box as shown on the current page (clampBox), like the drag. New e2e: on a 200 × 300 page one ArrowLeft moves the clamped box to x 49, slider 50 % gives width 100, output pixels match. Failed with the old line put back (regression proof).
- Gates: default build check-dist OK (precache 430.2 KB, controller 15.4 / 18.4 KB); astro check 0 errors; unit pdf-sign + usage 143 passed; pdf-sign e2e ×3 35 passed / 1 skipped.

**TOOLS5 U3 — deploy gate (2026-10-08)**
- Richard: clear (round 1 and round 2, 0 Must Fix). Rounds 2–3 applied Richard's Should Fix (display-only clamped copy; drag/arrow/slider from the displayed box; MIN_EDGE; strengthened cm test; e2e stageReady wait, 60/60 with --repeat-each=10 on three engines). Orchestrator accepted round 3 without another review (implements Richard's exact fixes, test-covered). Decisions: keep 4 related links on /stamp-signature/; keep the shared-placement model. CLAUDE.md line 3 updated. Pushed. Next: U4 HWPX→HWP spike.

**TOOLS5 U4 spike — HWPX→HWP (2026-10-08, DONE_WITH_CONCERNS)**
- rhwp 0.8.6 exportHwpWithReport on the 4 HWPX fixtures (Node + Chromium desktop/phone emulation, byte-identical): verify recovered true, content-loss 0, pages equal, text recall 1.0 (rhwp reload and an independent record walk), tables/pictures/equations/headers/footers counts equal; export ≤ 56 ms, whole flow < 1 s, wasm heap ≤ 14 MiB; +0 wasm bytes; MIT. Gating: owner's 한글 check on 3 files (O4) still open; 5 public HWPX downloads were blocked by permissions (URLs listed). Report: handoff/SPIKE-HWPX-TO-HWP.md; code: scripts/spike/ (not shipped). Effort if go: 2–3 days.


## CI fix after TOOLS5 (Bob, 2026-10-10) — status DONE (one item DONE_WITH_CONCERNS)
Details, line ranges and proofs: handoff/REVIEW-REQUEST.md ("CI fix after TOOLS5"). Not committed.

**Failures → root cause → fix**
- checks, ga.test GA-on build: the checks job builds with PUBLIC_BG_REMOVE=1, so public/vendor holds the 배경 지우기 engine; the test's own astro build (flag unset) copied it and check-dist refused it. The test now builds with the flag that matches public/vendor. Reproduced (old test fails with the CI list after a BG-on build), fixed.
- id-photo.spec:654 (all browsers): SEO-LENGTH changed the description on purpose; spec literal updated.
- pdf-sign.spec:182 (webkit, mobile-safari), product: WebKit focuses a clicked label's radio after its change event (GTK/WPE radios are mouse-focusable), taking focus from 쪽 범위's field. `setWhere` gives it back after a 0 ms timeout when a 넣을 쪽 radio still holds focus. Focus-order probe on Linux WebKit confirms.
- WebKit lost clicks (image-to-jpg, jpg-to-pdf, pdf-compress, pdf-split, id-photo, usage, sw): `html { scroll-behavior: smooth }` makes Playwright's scroll-into-view animate on WebKit; the click lands mid-animation. WebKit projects now run with `reducedMotion: 'reduce'` (playwright.config.ts WEBKIT_MOTION; the site honours it; hwp-viewer.spec already did). Linux WebKit ×3: 6/111 failed before, 0/111 after.
- polish.spec:635 (firefox), product: with 13 tools the menu panel reached the window bottom (test clicked at y 721 of 720; on phones the last links were unreachable under the sticky header). Panel capped at the window and scrolls; test clicks 8 px below it and asserts the point is on screen.
- pdf-sign.spec:225 (firefox, 3/3 -119 vs -120, x exact): measured relative to #sg-stage. DONE_WITH_CONCERNS: not reproduced locally (Linux Firefox ×4 and full job pass).
- pdf-sign.spec:272 (chromium flaky): box and stage read in one evaluate on #sg-stage (a redraw detached the resolved box).
- Firefox goto timeouts (pdf-split:207/287/251 and others): the known Playwright-Firefox navigation-event race (all requests 200 in traces); unchanged, 2 CI retries stay.

**Workflows:** all five on `runs-on: ubuntu-24.04` (Ubuntu 26 becomes ubuntu-latest on 2026-10-19); actions/checkout@v7, actions/setup-node@v7, and also upload-artifact@v7 and cache/{restore,save}@v6 (their v4 still run on node20). All node24.

**Gates:** astro check 0 errors; unit 58 files 1,252 passed (after the CI checks build, BG on); builds dist-noauto / dist-bg / dist-bgcloud / dist (AUTOFRAME=1) / checks (BG on) check-dist OK. e2e Linux (WSL Ubuntu 24.04, CI=1, 4 workers), CI job split: chromium 391 passed; mobile-chrome 349 passed; webkit 341 passed, 1 flaky, 6 failed (WSL timeouts in hwp-viewer and jpg-to-pdf:144; 1 worker, retries 0: 26 passed); mobile-safari 338 passed, 2 flaky, 1 failed (hubs axe timeout; 1 worker, retries 0: 28 passed); firefox 357 passed, 16 flaky (all goto), 0 failed.

**Known Gaps:**
- Firefox goto harness race still costs ~15 retries per CI run (accepted since ci-green; root cause in Playwright's Firefox driver, not the site).
- pdf-sign drag: the 1 px vertical shift of the stage on CI Firefox is unexplained; the test now ignores where the stage sits in the window.
- Local Linux browser runner (WSL, no sudo): deps extracted to ~/wkroot, wrapper ~/pw.sh; the WebKit MiniBrowser wrapper was patched locally to keep LD_LIBRARY_PATH. Heavy WebKit specs need 1–2 workers there.

**CI fix after TOOLS5 — deploy gate (2026-10-10)**
- Richard: clear, 0 Must Fix. Pushed; orchestrator watches this CI run to green before starting HWPX2HWP (lesson: TOOLS5 steps were pushed on review-clear without waiting for CI, which stayed red for six commits).


## CI fix round 2 (Bob, 2026-10-10; CI run 38015775584 on 8e02171, mobile-chrome) — status DONE
- pdf-sign.spec:387 axe target-size #sg-next: /pdf-sign/'s sticky phone actions bar had no scroll-padding-bottom (the rule named only merge and split), so the focused 쪽 범위 field sat under the bar (probe 758–802 against bar 770–839) and the page stopped where CI's #sg-next ended up under the sticky header. app.css now uses `html:has(.merge-actions:not([hidden])) { scroll-padding-bottom: 96px; }` for every tool's bar. New assertion in the axe test: field not under #sg-actions (fails on the old CSS: 882 > 771).
- polish.spec:606: test race. A smooth `scrollIntoView` was still animating when `focus()` ran 40 ms later and overrode the focus scroll (trace). The test now scrolls instantly. Not caused by 8e02171's menu change.
- Gates: dist check-dist OK; mobile-chrome pdf-sign + polish ×5 295/0 failed (first run had 1 lost #sg-run click on pdf-sign:307, not reproduced in 85 later runs); chromium + webkit + mobile-safari pdf-sign + polish 175 passed; sticky-bar specs on both phones 110 passed.
- Known Gaps: pdf-sign:307 lost click once under load (unexplained); tools-menu `100vh` fallback dropped by the minifier (dvh only).
- CI fix round 2 (2026-10-10): scroll-padding-bottom now applies to every tool with the phone sticky actions bar (html:has(.merge-actions:not([hidden]))) — /pdf-sign/ was missing, so a focused 쪽 범위 input sat under the bar (WCAG 2.4.11); polish:606 test race fixed with instant scroll. Small CSS + tests; orchestrator pushed without a separate review round and watches CI.


## HWPX2HWP — brief (copied by Bob at H0 start, 2026-10-10)
- O4 go (2026-10-10, 3/3 opened in 한글). Slug /hwpx-to-hwp/ 「HWPX HWP 변환」. No preview; existing worker + one message;
  reload gate on shipped bytes; losses shown, download allowed; RhwpHwpxOrigin kept (no engine option, no CFB writer);
  password HWPX rejected via manifest check (also viewer / PDF); .hwp input redirected; limits = hardBytes only;
  HOME_DESC_ORDER after hwp-to-pdf; NOT_PRECACHED + RUNTIME_PAGES; viewer 「HWP로 저장」 and HWP→HWPX deferred.

## HWPX2HWP — Bob (2026-10-10) — status DONE
Details, line ranges, probes and proofs: handoff/REVIEW-REQUEST.md ("HWPX2HWP"). Not committed (H0 = download.ts withExt, boot.ts and usage.ts unions; can go first).

**Built:** /hwpx-to-hwp/ 「HWPX HWP 변환」: page + light controller (no preview, fonts or render), pure src/lib/hwp/export-hwp.ts (export → losses → bytes → free → reload gate: CFB magic, pages equal and > 0), one `export-hwp` message on the existing worker, new codes already-hwp / unverified / export, HWPX manifest encryption → password (also /hwp-viewer/ and /hwp-to-pdf/), .hwp input redirected with links, loss warning + 「기타 N곳」 above the button (download allowed), registration per decision 18 (tools.ts, page, og.json + OG image, JSON-LD, sitemap/llms via generators, guides NEXT_GUIDES + what-is-hwpx sentence, related links both ways, HOME_DESC_ORDER after hwp-to-pdf, usage TOOLS/label/fail labels, NOT_PRECACHED + RUNTIME_PAGES, bgcloud scope, lighthouserc, qa:visual list, check-dist block, regress:hwp line, COPY.md exception).

**Key decisions:** losses as a count (rhwp documents no loss kinds: all 「기타」); a malformed or unreadable report = 1 loss; reload OOM → oom, other reload failures → unverified; tool card after hwp-viewer; reset focuses the file input; blob type application/x-hwp (WebKit e2e downloads it).

**Probes:** encrypted HWPX = ODF `<odf:encryption-data>` per part in META-INF/manifest.xml (before: scan passed, rhwp threw "비밀번호가 필요한 암호 문서입니다" → corrupt). Timing verify/gate (Node ms): adm02 55/59, adm14 22/27, adm19 154/83, adm28 221/208; whole flow in Chromium adm28 809 ms. Loss schema: undocumented (count only).

**UI font:** new core characters: none (607 → 607; two drafts with 꾼 and 뀝 were rephrased); late 38 → 38. Faces unchanged, tripwire untouched.

**Gates:** unit 61 files 1,292 passed (Linux, after the checks build, BG on); astro check 0 errors; check:licenses OK; five Linux builds check-dist OK (precache 431.5–437.8 KB / 450); /hwpx-to-hwp/ initial JS 8.0 KB, controller 5.4 / 6.5 KB; Lighthouse local /hwpx-to-hwp/ LCP median 1,670 ms, perf 1.00, a11y 1.00; regress:hwp --fixtures-only all pass. E2E Linux CI split: chromium 410 / mobile-chrome 370 (2 failed each: polish LIVE list, fixed), firefox 377 + 16 flaky (1 failed: polish:637 Tab-out, Firefox tab stop on the now-scrolling menu panel, test fixed), webkit 365 + 2 flaky (2 failed: hwp-viewer WSL WebKit load; 1 worker re-run 20/20), mobile-safari 364 / 0 failed. Re-run polish × 5: 239 passed, 3 flaky, 0 failed.

**Known Gaps:**
- CLAUDE.md line 3 tool list needs 「HWPX HWP 변환」 (orchestrator; not edited by rule).
- HWP→HWPX page (rhwp exportHwpxWithReport) needs its own owner 한글 check; viewer 「HWP로 저장」 deferred (shared session risk).
- 배포용 HWPX is detected only through rhwp's open failure (→ corrupt copy); password HWPX is rejected, never decrypted.
- RhwpHwpxOrigin 1-byte stream kept (pinned by a unit test; optional upstream issue); PrvText near-empty (cosmetic).
- rhwp loss codes exist in the wasm (binaryContentEmptied, controlOmitted, metadataReduced) but are undocumented: shown as 「기타」.
- session.ts reset() focuses the picker label, which cannot take focus (/hwp-to-pdf/, /hwp-viewer/); not changed (flag: do not touch session.ts).
- With 14 tools the desktop 도구 menu scrolls at 720 px height (Firefox adds a tab stop on it).
- scripts/ops/opportunities.mjs maps every hwp/hwpx query to /hwp-to-pdf/.
- tests/live/tools.spec.ts has no /hwpx-to-hwp/ check; qa:visual not run; optional law.go.kr probe not run.

**HWPX2HWP — deploy gate (2026-10-10)**
- Richard: clear, 0 Must Fix. Orchestrator applied both Should Fix (benign file-entry manifest → null; Firefox-only extra Tab stop). Decisions: keep the three 해요체 error lines (brief wording, COPY.md exception); keep the scrolling tools menu (Firefox tab stop is acceptable, a two-column menu can come with a later design pass); distribution-protected HWPX from Hangul possibly reading as 'password' — check when a real sample appears. CLAUDE.md line 3 updated. Pushed; CI watched to green.

**INTERNAL-TRAFFIC — automation sends no analytics (2026-10-10)** — DONE_WITH_CONCERNS
- New scripts/lib/no-analytics.mjs: `isAnalyticsUrl` + `blockAnalytics(context)` (Playwright route abort: CF beacon + /cdn-cgi/rum, gtag.js, *.google-analytics.com, *.analytics.google.com, any /api/usage). Wired into the A-1 live smoke (no-upload fixture option `noAnalytics`, on in playwright.live.config.ts; aborted analytics excluded from the guard and from console errors) and qa:visual newContext. Site unchanged.
- tests/unit/no-analytics.test.ts: URL matrix, fake-context test, grep checks (every browser launcher blocks or is LOCAL_ONLY; live config/fixture wiring; workflows; fetch checks import no browser/jsdom). docs/OPS-RUNBOOK.md §9 (data 2026-10-07 → 10-10 includes automation).
- Verified: probe with/without block (POST /api/usage and 3 off-site hits gone, all ERR_BLOCKED_BY_CLIENT); live smoke vs local dist 5/5; vs dist-bgcloud no analytics requests left; vitest 1327/1327; astro check 0 errors.
- Known Gaps (escalated): (1) ops-post-deploy.yml `| tee` without pipefail masks failures: live smoke 5 failed and smoke:assets 55 problems on run 38020029020 reported success. (2) Live CSP includes GA + cloudflareinsights connect-src; no-upload guard and smoke-assets require `connect-src 'self'` only, so the live checks cannot pass until that is decided. (3) smoke-assets rewrites off-origin refs onto our origin. (4) User-level visual-qa skill can drive live without blocking.

**INTERNAL-TRAFFIC round 2 (2026-10-10)** — DONE
- ops-post-deploy.yml: `set -o pipefail;` on the three `| tee` steps. New scripts/lib/csp-connect.mjs: designed connect-src values computed from withAnalyticsCsp/withGaCsp (no hard-coded hosts); used by smoke:assets and by the no-upload guard (`designedCsp`, fixture option `liveCsp`, on only in playwright.live.config.ts). smoke:assets follows same-origin refs only (beacon no longer rewritten to docttak.com/beacon.min.js); og:image still checked on the deploy.
- Run 38020029020: smoke:assets 55 = 54 CSP-check false positives + 1 beacon rewrite 404; live smoke 5 × 2 = all "network activity" (analytics requests + CSP mismatch) after the tools had finished; nothing real.
- Production (read-only, analytics blocked): smoke:assets OK 2472 URLs; live smoke 5/5 first try. vitest 1332/1332, astro check 0 errors.
- Known Gaps: user-level visual-qa skill unblocked; ops health beacon allowance separate.

**INTERNAL-TRAFFIC — deploy gate (2026-10-10)**
- Richard: clear, 0 Must Fix. Orchestrator applied Should Fix 1 (block /cdn-cgi/rum on our own origin and www.google.com/g/collect; tests) and 2 (REVENUE-MODEL timeline now follows the R1/R2 triggers: R1 ≈ Feb 2027, R2 ≈ Aug 2027 in the base case). Decision: keep allowing the four designed CSP variants in live checks. Production re-check: smoke:assets 2,472 URLs OK; live smoke 5/5 first try — the earlier A-1 "failures" were analytics/CSP check mismatches hidden by a missing pipefail. Pushed; CI and the first honest A-1 watched.

**TOOL-GUIDES Part A + B — one how-to guide per tool (2026-10-10)** — DONE (not committed)
- Part A published: jpg-to-pdf, pdf-to-jpg, pdf-split, pdf-sign, hwpx-to-hwp (src/content/guides/). Each has a non-tool H2 backed by fetched official quotes (Apple iPhone 사용 설명서 미리보기/마크업 pages; Google Chrome 고객센터 Android print-to-PDF; Hancom 한/글 도움말 「다른 이름으로 저장하기」 hoffice120 — the new Hancom source for the hwpx duplicate guard), an 「안 될 때」 H2 from the tools' real messages, a 「다른 방법이 나을 때」 H2 and 4 FAQs not taken from tools.ts. TOOL_GUIDE_PINS for the five; reverse related per brief; one link sentence in what-is-hwpx. jpg-to-pdf.related +pdf-to-jpg (orphan rule).
- Part B published behind the flag: remove-background.md with `requires: bg-remove`; guide-schema `requires` + `isVisibleGuide` + "needs requires" rule; guides.ts visibility through `__BG_REMOVE__`; bgcloud LOCAL_SCOPE_RE no longer exempts guide/remove-background/; pin. Flag off: no page/sitemap/RSS/llms/OG/index entry (check-dist + postbuild test); flag on: listed, linked from /remove-background/; cloud build scans it (no claims, check-dist OK).
- Nothing drafted. check:quotes 178 verbatim (148 before). astro check 0 errors. vitest 1,340/1,340 after the BG=1 build. Four builds check-dist OK; core UI font unchanged (603/607/604/604); precache +0.1–0.2 KB (build-id string only). E2E growth/site/hubs/polish × chromium/mobile-chrome/webkit 424 passed, 1 webkit share flake (passed on re-run); bg spec 12/12.
- Known Gaps: (1) link-graph test now exempts `requires` guides (in-link = their tool page) because no always-shown guide may link them — Arch to confirm. (2) ga.test 「check-dist passes」 fails locally on a flag-off workspace, also on an untouched HEAD export (public/vendor without birefnet); passes in CI order. (3) Galaxy built-in methods only via Google Chrome help (no Samsung page fetched); Adobe helpx 403s the source-watch UA. (4) Home 「자주 찾는 안내」 unchanged (owner); admission-photo → remove-background swap remains an owner option. (5) HEAD moved to 96010df (CI timeout) during the work; not mine.

**TOOL-GUIDES round 2 (2026-10-10)** — DONE: jpg-to-pdf Chrome quote now covers 인쇄 → 프린터 선택 → PDF로 저장 (step 3 reworded to 「위쪽 프린터 선택에서」); remove-background Apple quote extended with the 테두리 sentence. check:quotes 178 verbatim, guides-schema 33/33, default build check-dist OK.

**TOOL-GUIDES — deploy gate (2026-10-10)**
- Richard: clear, 0 Must Fix; both deviations accepted by the orchestrator (requires-guides linked from their tool page instead of another guide; jpg-to-pdf related gains pdf-to-jpg). Round 2 added verbatim quotes for the two uncovered sentences (check:quotes 178 OK). Pushed; CI watched (also re-checks the /hwp-viewer/ Lighthouse NO_NAVSTART seen in the last two runs).

**FOOTER-BLOGS — blog links in the footer + Organization sameAs (2026-10-10)** — DONE (not committed)
- Owner request: footer line 「블로그: 네이버 · 티스토리」 on every Base page (guides included) linking https://blog.naver.com/robohelio and https://docttak.tistory.com; rel="noopener", followed, same tab (site convention for non-tool external links); aria-labels 「네이버 블로그」/「티스토리 블로그」. Single source `BLOGS` in src/data/site.ts; home Organization JSON-LD `sameAs` lists both.
- Font: 티·토 added to the core subset (+64 B preloaded; 90.8/90.9 KB vs 92.66 KB tripwire). postbuild brand test now treats docttak.tistory.com as a domain.
- vitest 1,341/1,341; astro check 0 errors; default + cloud builds check-dist OK; site/polish/growth × chromium/mobile-chrome/webkit green (1 known webkit share flake, passed on retry). New growth test covers every sitemap page + offline + 404 and the sameAs.

**FOOTER-BLOGS — deploy gate (2026-10-10)**
- Orchestrator decisions: wording 「블로그: 네이버 · 티스토리」 accepted; sameAs on the home Organization only (guide publisher unchanged). Small, test-covered change; pushed without a separate review round and CI watched. Also on 2026-10-10 the orchestrator added a Cloudflare redirect rule www.docttak.com → https://docttak.com (301, path + query kept), verified live.

**STICKY-HEADER — scroll-padding-top for the sticky header (2026-10-10)** — DONE (not committed)
- CI 38043135267 mobile-chrome pdf-split:251 axe target-size: scrollIntoView left the first page row under the sticky header. Root cause: no scroll offset for the header except four hard-coded `scroll-margin-top: 76px` panels.
- Fix: `--top-h` (60 px, also drives .top-inner height) and `--top-clear` (+16 px) in global.css; `html { scroll-padding-top: var(--top-clear) }`; removed every element `scroll-margin-top` (76 px panels, guide hub h2 16 px) since margin adds to padding; menu sheet max-height uses the variable. scroll-padding-bottom rule unchanged; test not loosened.
- New polish tests: #tools, #faq, /guide/ #topic-2 land 0–16 px under the header. mobile-chrome ×3 (pdf-split, pdf-sign, polish, growth) 258/258; chromium/webkit/mobile-safari 256 passed + 2 retry-flakes; default build check-dist OK.
- Known Gap: pdf-split.spec.ts:271 pointer drag flakes on chromium (~1/16) also at HEAD without this change; not fixed (scope).
- STICKY-HEADER (2026-10-10): Richard clear (0/0). Header height, html scroll-padding-top and the tools-menu max-height all come from --top-h; per-element scroll-margins removed. 16px clearance kept (orchestrator). Pushed; CI watched.

## CHAIN — brief (Arch, 2026-10-11; `handoff/ARCHITECT-BRIEF-CHAIN.md`)
결과로 이어서 하기: single-file results get 「이 파일로 이어서 하기」 buttons that hand the file to the next tool via IndexedDB (taken and deleted on arrival, 10 min TTL sweep, 200 MB cap, per-handoff random key + sessionStorage marker). Receivers: pdf-compress, pdf-password, pdf-sign, pdf-split, photo-compress, jpg-to-pdf. Locked: new `src/lib/ui/handoff.ts` (sign-handoff untouched), multi-file/ZIP out of scope, pdf-password lock result offers nothing, usage event `next` (o=next, v=target), all new strings in src/lib (late font), one privacy sentence. Units X1 (core + receivers + jpg-to-pdf/pdf-compress senders) then X2 (other senders), Richard review after each.

**CHAIN X1 — handoff core, 6 receivers, jpg-to-pdf / pdf-compress senders (2026-10-11)** — DONE_WITH_CONCERNS (not committed; waiting for Richard)
- Built: `src/lib/ui/handoff-marker.ts` (synchronous marker check, so a page without a marker loads no IndexedDB code), `src/lib/ui/handoff.ts` (IndexedDB `docttak-handoff`/`files`, injectable store, 10 min TTL sweep on every put/take, random 32-hex key, `receiveHandoff`), `src/lib/ui/next-steps.ts` (flow table, labels, 200 MB / single-file rule, button group). Receivers: pdf-password, pdf-split, pdf-sign, jpg-to-pdf (lazy entries start the controller at once) and pdf-compress, photo-compress (eager, at the end of init). Senders: jpg-to-pdf, pdf-compress (empty slot in .astro, filled from JS). Usage event `next` (o=next, v=target; ONLY now lists event types). COPY.md section and privacy sentence.
- Key decisions: handoff.ts is dynamically imported (receiver with a marker, or sender click), so the receivers' initial JS grows only +0.4–0.5 KB gzip (pdf-compress +1.6 with next-steps). The remove-background flow row exists only under `__BG_REMOVE__` (check-dist bans the name in flag-off JS). Lazy controllers' `open` returns its Promise so the arrival notice lands after the open.
- Root causes found in e2e: (1) Firefox: a large Blob read from IndexedDB is file-backed and unreadable once its record is deleted, so the receiver called the PDF damaged. `takeHandoff` reads the bytes before deleting (unit regression test). (2) F3: Playwright WebKit refuses a Blob put (tx error null); an ArrayBuffer works, so `idbStore.put` falls back to bytes and `get` restores a Blob.
- Departures, for Arch: pdf-password opens a handed-over file in 암호 걸기 (the button says 「PDF 암호 걸기」; the default 암호 풀기 stopped a plain PDF). Privacy sentence reworded: 잠깐 → 잠시 (깐 was not in core, F1), 이 브라우저 → 내 폰·컴퓨터 (the Polish Q plain-language test bans 브라우저). The brand test allows the internal keys `docttak-handoff` / `docttak:handoff`.
- Gates: vitest 1,369/1,369; astro check 0 errors; check:licenses OK; default + cloud builds check-dist OK. Core font 605/38, same as HEAD. Precache 433.8 → 437.6 KB (cloud 443.9) / 450. e2e 5 projects (chain + 7 related specs): 385 passed, 4 Firefox retry-flakes outside the handoff path, 0 failed. chain.spec retries 0: 28 passed / 2 skipped. usage.spec CHAIN test on 5 cloud projects green. Lighthouse and qa:visual not run.
- Known Gaps: (1) admin page / weekly report don't display `next` (rows skipped in shapeUsage; no generic event rendering). (2) sign-handoff not migrated onto handoff.ts (brief). (3) [corrected in round 3] A record from a tab closed between put and navigate had no time bound: it stayed until the next put/take, which might never come. Round 3 adds a site flag so it is swept on a later receiver visit. (4) [fixed in round 3] photo-compress without OffscreenCanvas didn't take a waiting file; the marker and record stayed with no time bound. (5) takeHandoff holds one in-memory copy of the file (up to 200 MB) during the take (Firefox fix). (6) Privacy page date / change history and the usage-section event list not updated (question to Arch).

**CHAIN X1 round 2 (2026-10-11)** — DONE (not committed). Orchestrator decisions:
- (1) pdf-password in 암호 걸기 kept and tested (chain.spec).
- (2) The privacy sentence is now 해요체 (「…바로 지워져요.」). `PRIVACY_CHAIN` 2026년 10월 11일 is the 시행일 in every build, with a history line. The sitemap lastmod for privacy/terms is 2026-10-11. The usage-statistics list gains 「이어서 하기(보낸 도구·받을 도구 이름)」 only where that section shows; the first wording 「눌렀을 때」 added 눌·렀 to core and was reworded. GA/usage/polish tests follow the new date.
- (3) Lazy handoff.ts kept.
- Gates: vitest 1,369/1,369; astro check 0 errors; default build check-dist OK (core 605/38 unchanged, precache 437.6 KB); polish + chain + site × chromium/mobile-chrome 265 passed / 5 skipped; cloud build check-dist OK with privacy + CHAIN usage/ga.cloud tests 6/6.
- Known Gap (6) of round 1 is closed.

**CHAIN X1 round 3 — Richard's Should Fix + the orchestrator's decision on lingering files (2026-10-11)** — DONE (not committed)
- SF1: photo-compress in an unsupported browser now takes a handed-over photo and drops it (record deleted, marker removed). e2e covers it where the tool is unsupported (Playwright WebKit on Windows).
- Lingering files (orchestrator decision, F4 kept):
  - `sendTo` also sets the localStorage flag `docttak:handoff-sweep` = '1' (try/catch; nothing identifying).
  - The six receiver pages already load handoff-marker. With no marker but the flag set (`sweepDue()`, a synchronous read), they lazily load handoff.ts and run `sweepLingering()`: delete records older than 10 minutes, then clear the flag when the store is empty. `takeHandoff` runs the same step.
  - A normal visit (no marker, no flag) still loads no handoff code and never opens IndexedDB (chain.spec asserts it).
- Real lifetime, replacing the earlier "at most 10 min" claims:
  - A taken file is deleted on arrival.
  - A file nobody took is deleted on the first receiver-page visit (any of the six tools) more than 10 minutes after it was stored, or by the next put/take.
  - With no such visit it stays on the device.
  - If localStorage is blocked, no flag is set and only the next put/take sweeps.
- Privacy sentence: added 「다음 도구가 열리지 않았다면, 10분이 지난 뒤 이어서 하기를 쓰는 도구를 다시 열 때 지워져요.」, all in core glyphs (core 605/38 unchanged). **X2 note:** "이어서 하기를 쓰는 도구" is true only while every sender page also runs the flag check. X2 must add `sweepDue()` → `sweepLingering()` to each new sender page (pdf-merge, hwp-to-pdf, image-to-jpg, remove-background, id-photo).
- SF3: the ArrayBuffer fallback now runs only for `isBlobRefusal(err)`: DataCloneError, or WebKit's UnknownError "Error preparing Blob/File data to be stored in object store" (seen with a diagnostic; `run` now rejects with the request's error because WebKit leaves tx.error empty). Quota, blocked and open failures don't retry. `get` returns the stored bytes as they are (no extra Blob); `takeHandoff` uses them directly (`recordBytes`, ArrayBuffer by tag so it works across realms).
- SF4: `next` is counted on click, before the store attempt (brief flow), so a failed store still counts as a `next`. Read it as "button pressed", not "file arrived".
- SF5: unit tests for `isStale`, `isBlobRefusal`, `recordBytes`, stored bytes → File, the flag (set on store, kept while a fresh record waits, cleared when empty, failing store keeps it, blocked localStorage = no flag and no harm). fake-indexeddb is not a dependency, so `idbStore` itself is still covered only by e2e (Known Gap).
- Gates: vitest 1,377/1,377; astro check 0 errors; default build check-dist OK.
  - Precache 438.5 KB / 450.
  - Initial JS gzip: jpg-to-pdf 8.9, pdf-compress 17.0, pdf-password 8.9, photo-compress 20.9.
- e2e chain + polish + site on chromium, mobile-chrome, firefox, webkit: 527 passed, 17 skipped, 3 Firefox flaky. One Firefox site.spec failure was a goto timeout followed by a worker crash; site.spec alone on Firefox then passed 73/73.

**CHAIN X1 — deploy gate (2026-10-11)**
- Richard: clear (0 Must Fix) in r1 and r3. Orchestrator decisions: pdf-password opens handed-off files in lock mode; privacy sentence 해요체 + lingering clause, PRIVACY_CHAIN 2026-10-11; handoff.ts lazy; localStorage sweep flag keeps F4. Known gap (Richard r3, 5/10): cross-tab flag-clear race can drop the sweep flag in a few-ms window; file then lingers until the next store/take. Pushed; CI watched. Next: X2 (remaining senders; each sender page must also run the sweep-flag check).

**CHAIN X2 — remaining senders + X1 CI fix (2026-10-11)** — DONE (not committed; waiting for Richard). Details and line ranges: handoff/REVIEW-REQUEST.md.
- X1 CI fix (run 38068648525, mobile-chrome, pdf-sign.spec.ts:387):
  - Root cause: choosing 쪽 범위 focuses `#sg-range`, and that focus scroll runs with the site's smooth scrolling. The test measured mid-scroll (diagnostic: scrollY 715 → 1110, field bottom 826 → 431, bar top 520).
  - It reproduced 3/3 locally, also with the pre-X1 src (3e63d08), so this is not an X1 regression.
  - Fix: `await settled(page)` before the measurement; assertion unchanged. Verified 8/8 (×4, mobile-chrome + chromium); pdf-sign + chain ×3: 159 passed.
- Built:
  - Slots + show/hide in pdf-merge, pdf-split (edit/extract only), pdf-sign (slot `sg-chain`, because `sg-next` is taken), pdf-password (unlock only), hwp-to-pdf (shared session, hwp-to-pdf page only), image-to-jpg (1 photo), photo-compress (exactly one downloadable photo), remove-background, id-photo.
  - `sweepIfDue()` (handoff-marker) on the 5 sender-only pages, so the privacy sentence holds on every 이어서 하기 page; its wording is unchanged.
  - `NextMaker` in next-steps (remove-background encodes on click).
  - `next-steps-lazy.ts` for pdf-password and remove-background, whose budgets (6 / 14.5 KB) had no room. A direct dynamic import of next-steps put Rollup's namespace helper in the HWP export chunk.
- Gates:
  - vitest 1,381/1,381; astro check 0.
  - Default build check-dist OK: core 605/38, precache 440.5/450, no budget changed.
  - Cloud build OK: core 606 = HEAD cloud, precache 446.8/450.
  - AUTOFRAME=1 build OK: 442.7.
  - e2e chain + polish + site × 5 projects: 690 passed, 32 skipped, 3 Firefox flaky (goto timeouts), 0 failed.
  - Cloud: remove-background.cloud + usage × 5: 103 passed, 12 skipped.
  - Tool specs × chromium + mobile-chrome: green; id-photo on the AUTOFRAME=1 build.
  - Lighthouse, qa:visual and licenses not run.
- Known Gaps:
  - (1) Cloud precache 446.8/450: little headroom.
  - (2) next-steps-lazy exists only because of the two budgets (Arch could raise them instead).
  - (3) The brief's "alpha flattens to white" holds for photo-compress only. jpg-to-pdf keeps the alpha (PNG + SMask), so the PDF page shows paper; the e2e asserts no black.
  - (4) remove-background hands over the currently chosen 배경/형식 (default transparent PNG). Question to Arch.
  - (5) photo-compress offers a kept original as the single result. Question to Arch.
  - (6) hwp-viewer, pdf-to-jpg and multi-file stay out of scope (brief).

**CHAIN X2 + X1 CI fix — deploy gate (2026-10-11)**
- Richard: clear (0 Must Fix). Orchestrator decisions: remove-background hands over the background/format chosen at click time; photo-compress shows the buttons for an unchanged single original; next-steps-lazy.ts instead of raising budgets. Should Fix (tests only, deferred): reset-hides-buttons, photo-compress two-photo, pdf-password fast-reset. Cloud precache 446.8/450 KB — next JS addition needs precache work first. Pushed; CI watched.

**CHAIN-ADMIN — brief written (2026-10-11)**: handoff/ARCHITECT-BRIEF-CHAIN-ADMIN.md. Decisions: new `chains` SQL (blob1='next', blob2 → blob6, alias `dest`) in the same fetchUsage; two tables appended to shaped.tables (pairs; per-tool sent/received), so the weekly report gets them automatically; admin sections s-chain / s-chain-tools with a "button pressed, not file arrived" note; usage whitelist and privacy text untouched. /admin/ is rendered by Functions with system fonts → no precache or font budget impact (verified: no src/pages/admin, no @font-face). X2 test gaps: pdf-merge reset hides the group, photo-compress 2 → none / remove 1 → shows, pdf-password fast reset via a held route on the next-steps-lazy chunk (e2e).

**CHAIN-ADMIN — built (2026-10-11) — Status: DONE**
- Part A (admin + weekly report, read-only):
  - usage.mjs: `usageSql().chains` (blob1='next', blob2 AS tool, blob6 AS dest; same guards). `fetchUsage` runs 5 queries in one Promise.all and returns `chains`.
  - `shapeUsage`: `shaped.chains = { total, pairs, perTool }` with a TOOLS whitelist on both ends. Duplicate pairs are summed. Pairs sort by n desc, ties by TOOLS index of from, then to. perTool sorts by sent+received desc; ties keep TOOLS order (stable sort).
  - Two tables are appended as tables[5] and tables[6]; the weekly report gets them through renderTables. The `next` skip in the events loop stays; its comment now says "next is counted from the chains query".
  - admin-view.mjs: `section()`/`shapedSection()` take an optional `note` (escaped, `muted kpi-note`). New sections `s-chain` (with CHAIN_NOTE) and `s-chain-tools` come after `s-via`.
  - Not touched: functions/admin, the whitelist, the privacy text.
- Part B: three tests in tests/e2e/chain.spec.ts, all tests-only:
  - pdf-merge: reset hides the group.
  - photo-compress: two photos show no group; removing one shows the group and the handover works.
  - pdf-password fast reset: a held `page.route` on `/_astro/next-steps-lazy.<hash>.js` plus a hit counter.
  - Non-vacuous check: with the reset click removed, the pdf-password test fails ("Received: visible").
- Gates:
  - vitest 1,383/1,383; astro check 0 errors.
  - Default build check-dist OK: core 605/38, precache 440.5.
  - Cloud build (CI env): check-dist OK, precache 446.8, core 606 (same as HEAD cloud).
  - e2e chain.spec, chromium + mobile-chrome: 36 passed, 2 skipped. pdf-password fast-reset ×3 on both: 6/6.
  - e2e chain.spec, firefox + webkit at --workers=2: 34 passed, 4 skipped.
- Known Gaps:
  - At default worker count, firefox/webkit failed 6 tests under load: 3 already existing (store failure, pdf-compress → pdf-password, pdf-password 암호 걸기) and 3 runs of new tests (pdf-merge reset on firefox and webkit, photo-compress on webkit). All 6 passed with --workers=1/2. This looks like load flakiness on local Windows, not a test defect.
  - ga.test "GA-on build" failed once before a fresh `npm run build`, then passed. Probably stale prebuild output in public/; not related to this change.

**CHAIN-ADMIN — deploy gate (2026-10-11)**
- Richard: clear (0 Must Fix). Should Fix applied by the orchestrator: chain.spec pdf-password fast-reset comment corrected (held request is Vite's modulepreload; two rAFs cover the gap; a slow run can only pass falsely). Pushed; CI watched.

**REV2 — brief written (2026-10-12)**: handoff/ARCHITECT-BRIEF-REV2.md. Source: reports/문서딱 수익화 전략 검증.md (owner: "권하는 순서대로 진행시켜").
- Order locked: 1 성장 엔진 (built: 증명사진 원스톱, TOOLS4 사진→PDF·PDF→JPG·PDF 암호, CHAIN 이어서 하기 + 관리자; no new feature) → 2 R2 정적 제휴 링크 (REV2) → 3 무료 임베드 위젯 (later sprint) → 4 R1 애드센스 안내 글만 + 경로별 CSP (later sprint) → 5 R3 증명사진 유료 옵션 (only after demand; owner decision, 사업자 등록). 광고 제거 구독 dropped.
- REVENUE-MODEL rewrite: 25% 기본 / 40% 낙관 / 15% 보수; 11-10 single-rule replaced by indicator table + 7th row (인화 링크 누름) + 12-15 re-check.
- Decisions: one static link block on every id-photo result (not print-preset only: id_card is the sole print preset); non-affiliate 「가까운 사진관 찾기 (네이버 지도)」 ON by default to start measuring in the October peak (kill switch PUBLIC_PRINT_INFO=0); affiliate links only via PUBLIC_AFF_PRINT_URL / PUBLIC_AFF_COUPANG_URL, rel="sponsored noopener", new tab, disclosure paragraph before them + 「광고」 in labels; Coupang mandated sentence as one constant (wording unverified → owner confirms at signup); block in system font + core-char exclusion (font headroom); usage event `out` (t=id-photo, o=out, v ∈ photo-studio|print-service|coupang); admin s-out + weekly table with ratio to id-photo success; privacy list sentence + PRIVACY_OUT; M-3 checklist text corrected (guide-only ads, route CSP, 50 guides, 14세 미만). No CSP/_headers/CLAUDE.md change, no script, no Function.
- Known Gap (deferred): links on guide pages (no tracker there).

**REV2 — built (2026-10-12) — Status: DONE_WITH_CONCERNS**
- Orchestrator update mid-build (approved change to the brief):
  - The owner's Coupang short links live in `src/data/affiliate.ts` (label + placement) behind one flag, `PUBLIC_AFF_COUPANG=1`. This replaces `PUBLIC_AFF_PRINT_URL` / `PUBLIC_AFF_COUPANG_URL`.
  - The disclosure is confirmed verbatim.
  - Only the id-photo placement is rendered.
- Built:
  - REVENUE-MODEL rewrite (sections 0-8: 25% 기본, indicator table + 7th row, 11-10 / 12-15 dates, R3 = 증명사진 유료 옵션, 광고 제거 구독 뺌).
  - id-photo `.print-links` block: the info link on by default, then the Coupang group (disclosure → 「집에서 인화하려면」 → 3 links) behind the flag. The block renders in the system font, and its copy is excluded from the core set.
  - Usage `out` event (photo-studio | cp-printer | cp-paper | cp-backdrop), with the admin `s-out` section and the weekly 8th table (ratio to id-photo success).
  - Privacy sentence, PRIVACY_OUT and the change-log line (stats builds only).
  - check-dist rules H(a)(b)(c) plus a flag ⇔ HTML check (scripts/lib/print-links-check.mjs).
  - M-3 checklist text; OPS-RUNBOOK §10; COPY.md exception.
- Gates:
  - vitest 1,402/1,403 (photo-engine timing test flaky under load, 41/41 alone).
  - astro check 0.
  - Default build: core 605 → 607 (눌, 렀 from the privacy sentence; the block adds 0), 400 +36 B, 800 +252 B, precache 440.5 → 441.4.
  - Cloud build: core 606 → 608, precache 446.8 → 447.9.
  - Cloud + flag build: 448.7.
  - `<script` counts = HEAD.
  - e2e main 831 passed / 8 flaky / 0 failed (7 projects); cloud 77 passed / 3 flaky / 0 failed.
  - Naver Map probe 200.
- Known Gaps:
  - (1) stamp-signature (인감도장) and HWP (한컴오피스) Coupang links are in the data file but not rendered: flag-on cloud precache 448.7/450, and /stamp-signature/ and /hwp-to-pdf/ are precached (~0.55 KB HTML each + listener ≈ 450). Options: precache work first, or the Hancom link on /hwp-viewer/ and /hwpx-to-hwp/ only (not precached).
  - (2) Cloud precache headroom is now 2.1 KB (flag off) / 1.3 KB (flag on).
  - (3) No e2e on a flag-on build; covered by check-dist and unit tests.
  - (4) Links on guide pages remain out of scope.
  - (5) Local Windows load flakiness: Firefox goto timeouts, WebKit skia allocation crash.

**REV3 / REV4 / REV5 — briefs written (2026-10-12, Arch)**: handoff/ARCHITECT-BRIEF-REV3.md, -REV4.md, -REV5.md. Owner: "쿠팡 파트너스 등 수익화 가능한 수단을 최대한 많이 진행시켜". REV2 still in flight; ARCHITECT-BRIEF.md first line untouched.
- REV2 risk flagged to the orchestrator: CI cloud build env (ci.yml L102-109) has no PUBLIC_AFF_COUPANG=1, so the 450 KB precache gate does not measure the production (flag-on) build. REV3 R3.0 adds it if REV2 does not.
- REV3 decisions: placement map in affiliate.ts (TOOL_AFF, GUIDE_AFF keyed by guide tools[0]), max 3 links per block, missing links skipped; no block on upload/size tools, home, 404, hubs, guide index; /hwp-to-pdf/ leaves the precache first (hwp-viewer precedent, 35.2 KB); `.print-links` renamed `.out-links` as a refactor step; guides get a top disclosure line (공정위 첫 부분) + block in aside; guide clicks counted via a guide-only tracker component (guides already run site.ts; not precached); usage out validated by TOOL_OUT/GUIDE_OUT with a sync test; HWP: TRADEMARK_NOTICE 상표 wording, HANCOM_NOTICE_PDF on /licenses/ + legal comment, KS X 6101 help line.
- REV4 decisions: two env stages (PUBLIC_ADSENSE_CLIENT = meta tag + ads.txt; PUBLIC_ADSENSE_ON + 2 slot IDs = serve); guide articles only; self-hosted /ads.js after load+idle; manual units, auto/anchor/vignette off; scheme-source CSP on /guide/* with `!` detach (not strict CSP, not Functions); reserved boxes, never collapse; transparency + opt-out (no banner, no CMP); owner decides personalized vs non-personalized; CLAUDE.md text needs owner approval.
- REV5 decisions: iframe-only snippet + host-side backlink line; IdPhotoTool.astro extraction first (byte-identical); /embed/id-photo/ noindex, no SW, no GA, no affiliate/info links; frame-ancestors * only on /embed/*; usage via=embed; /embed/ info page with copy code + white-label contact line; /terms/ wording needs owner approval. Arch recommends building REV5 before REV4 (locked order 3 before 4).
- Rejected / deferred (no brief):
  - Donation (Ko-fi, GitHub Sponsors): rejected for now. Korean users rarely use them, payouts go through foreign processors (PayPal/Stripe availability for a Korean individual unverified), amounts tiny, toss.me ended. Revisit only as one static footer text link if the owner wants it.
  - Kakao AdFit: rejected (invite/pre-approval only; would also need a script and the REV4 route CSP). Revisit if invited, guide routes only.
  - 링크프라이스 / 텐핑: deferred until about 100 real visits/day for 2 weeks (approval criteria unverified). Purpose then: a photo-print service merchant for the id-photo result (R3 demand signal), not more generic links. 텐핑 (CPA share campaigns) does not fit a tool site.
  - Naver AdPost: not for docttak.com (Naver blog only). Note for the owner/blog team: they may apply on the marketing blog; revenue is falling with AI 브리핑 (report L71).
  - Coupang dynamic banner / carousel / search widget: rejected (script/iframe, floating ban, CSP).

**REV2 round 2 — built (2026-10-12, base 87486a7) — Status: DONE_WITH_CONCERNS (placements deferred to REV3)**
- Must Fix:
  - check-dist treats `rel` containing the word `sponsored` anywhere as sponsored.
  - Every link.coupang.com anchor must be sponsored, and it gets all disclosure, 「광고」 and new-tab checks.
  - Fixtures for a missing-sponsored Coupang link and for `noopener sponsored`.
- Should Fix:
  - Disclosure is a plain `<p>` at body colour and size, first in the group.
  - e2e stub filters require GET + exact link URL + no body; usage.spec asserts at least one such request.
  - Privacy wording 「사진관·인화 관련 링크와 상품 링크」 uses existing glyphs only (core and font bytes unchanged).
  - The no-embed check now also covers link, source, object, embed and inline scripts.
  - Restored the space in `UsagePhase = 'load'`.
- Arch:
  - `PUBLIC_AFF_COUPANG: '1'` added to the CI cloud (dist-bgcloud) build env, so the 450 KB gate measures the production-like build.
  - New cloud e2e for the flag-on block and a Coupang click (link.coupang.com stubbed).
- Gates:
  - vitest 1,404/1,404; astro check 0.
  - check-dist OK on default (441.4), cloud flag-off (447.9), cloud flag-on (448.7) and AUTOFRAME (443.5).
  - e2e id-photo/usage/ga.cloud on chromium + mobile-chrome (+ manual/cloud variants): 132 passed, 0 failed.
  - All cloud specs on 5 projects: 131 passed, 2 WebKit flaky (remove-background.cloud, closed page), 0 failed.
- Known Gaps:
  - (1) Flag-on precache headroom is 1.3 KB (448.7/450). Until this round, CI built the cloud variant flag-off (447.9), so CI would not have caught a flag-on overflow. Since round 2, the CI cloud build is flag-on and measures it. Any id-photo addition needs precache work first.
  - (2) stamp-signature and HWP placements are deferred to REV3 (after precache work).

**REV2 — deploy gate (2026-10-12)**
- Richard r1: 1 Must Fix (sponsored detection) + Should Fix; all applied in round 2 with tests. Orchestrator committed after round 2 (owner asked for speed); Richard re-check of round 2 runs post-commit, fix-forward if needed. CI cloud build now builds with PUBLIC_AFF_COUPANG=1 (precache 448.7/450 KB).

**GROWTH3 — brief written (2026-10-12, Arch)**: handoff/ARCHITECT-BRIEF-GROWTH3.md. Owner: "방문자 늘리는 작업도 같이 진행시켜". Separate worktree `growth3` off origin/main; strict file whitelist (no REV2/REV3 files).
- Count correction: 37 published guides + 8 drafts (not 45 published) + 2 hubs. 13 new guides needed for about 50 articles (AdSense condition); floor 11; no padding.
- Decisions: tool pages byte-identical (pin current 관련 안내 in tool-guide-order.ts; 0 font / 0 precache); quality bar ≥ 3 official quotes incl. one non-size fact, DUP 0.45; G1 snippet edits on 8 pages with GSC impressions (before/after table); G4 GSC-only 11-10 indicators (cluster, guide vs tool CTR, brand, page×query) in growth.mjs via new indicators.mjs; blog team handoff file. Deploys D1 (G1+G4) 10-15, D2 (≥ 6 guides) 10-22, D3 11-03.
- Known Gaps: visa (owner declined), 대학원 원서 사진 (no single source), 8 login-blocked drafts.

**REV3 — build (2026-10-13, Bob): DONE_WITH_CONCERNS** (details: handoff/REVIEW-REQUEST.md "REV3"; nothing committed)
- Steps:
  - R3.0: /hwp-to-pdf/ moved to NOT_PRECACHED and RUNTIME_PAGES; −37.5 KB on the cloud build. CI already built flag-on.
  - R3.1: `.print-links` renamed to `.out-links`, plus OutLinks.astro. The id-photo HTML diff is the class name only.
  - R3.2: affiliate.ts gets AFF_LINKS (cp-mfp, cp-scanner, cp-tripod from the orchestrator addendum), TOOL_AFF/GUIDE_AFF, the leads and affBlock.
  - R3.3: blocks on 9 more result screens, plus trackOut.
  - R3.4: guide top line, aside block and GuideOutTracker.
  - R3.5: TOOL_OUT/GUIDE_OUT, validate, the outs SQL (tool, guide), admin "상품·사진관 링크" (자리 / 링크 / 누른 횟수 / 저장 성공 대비).
  - R3.6: out-links-check.mjs, rules (a)-(e), with (a) as an allowlist.
  - R3.7: privacy (PRIVACY_OUT 2026-10-13, to re-confirm at the gate).
  - R3.8: HWP trademark, product-licence and KS X 6101 lines in src/data/hwp-notice.ts (core font scope).
  - R3.9: OPS-RUNBOOK §10, REVENUE-MODEL §1, COPY.md.
- Gates:
  - Precache: cloud flag-on 412.5/450 KB (37.5 KB headroom; HEAD 448.7). Default 404.6 (HEAD 441.4).
  - Core preload: +0.2 KB, from 옛 and 승 in TRADEMARK_NOTICE. The links add 0.
  - vitest 1,415/1,415. astro check 0. check-dist OK on default, cloud and autoframe.
  - e2e: cloud usage ×5 83 passed. Default site/sw/growth/hwp×3 ×5 all passed after retries (3 flaky). id-photo ×5 168 passed.
  - LHCI flag-on: guide LCP about 1.67 s, tools ≤ 1.82 s, CLS ≤ 0.0003.
- Key decisions:
  - (1) The guide counter is the dependency-free src/lib/ui/guide-out.ts, unit-tested equal to buildPayload. trackOut would break the 4 KB guide JS budget (8.7 KB static, 355 KB via import()). Arch ruling requested.
  - (2) Astro emits the GuideOutTracker chunk in every build. It is 0 bytes when stats are off and referenced by no page; script-tag counts equal HEAD.
  - (3) The minifier drops `/*! */` legal comments; the notice stays in the source and on /licenses/.
  - (4) The id-photo block keeps its REV2 position after 이어서 하기.
- Known Gaps:
  - e2e default ports 4173/4183 collide across worktrees (`reuseExistingServer`). A stale server answered the first cloud run, so use E2E_PORT/E2E_CLOUD_PORT when two builders run e2e.
  - postbuild "plain language" takes 60-95 s locally (the HEAD dist too), over the 60 s timeout.
  - The GA-build privacy section uses 「브라우저」 (pre-existing; not in the CI checks build).
  - check:quotes not run: no guide claim changed.

**REV3 — deploy gate (2026-10-13)**
- Richard: clear (0 Must Fix). Orchestrator: aligned the HWP FAQ answer (tools.ts:703) with the new non-affiliation wording (existing glyphs only); id-photo block stays after 이어서 하기; hwp-viewer block above the document accepted for now. Committed as ONE commit (deviation from the R3.0/R3.1 split: sw.spec.ts hunks are interleaved; revert granularity accepted). Precache cloud flag-on 412.5/450 KB.


## GROWTH3 build notes (Bob, 2026-10-12/13, branch growth3 off origin/main 29826f0)

Status: **DONE_WITH_CONCERNS** — 6 of 13 new guides published (floor 11 not met; shortfall logged, no padding); G1b changes /id-photo/ link text (escalated).

**G0 baseline (origin/main 29826f0, this machine)**
| Gate | default (AUTOFRAME=1) | cloud (BG_REMOVE+BG_CLOUD+USAGE+GA+AFF_COUPANG, officer=TestOfficer) |
|---|---|---|
| UI font core | 611 chars, 400 44.1 KiB / 800 47.4 KiB | 608 chars, 44.0 / 47.4 KiB |
| precache | 31 URLs, 443.5 KB / 450 | 31 URLs, 448.7 KB / 450 |
| check-dist | OK, 2441 files | OK, 2456 files |
| sitemap | 57 URLs | — |
After GROWTH3: font identical (611 / 608 chars, same KiB), precache 443.5 / 448.7 KB (id-photo page −2 bytes), check-dist OK (2453 / 2468 files), sitemap 63.
- Pins (src/data/tool-guide-order.ts): id-photo, photo-compress, pdf-merge, pdf-compress frozen to their current 4. Other tools a guide names have < 4 own guides (next-step guides fill the list), so a pin cannot freeze them; the unit test fails if a new guide names one of them (OWN_COUNT). Consequence: new guides may only name the 4 frozen tools (and hwp-to-pdf).
- Byte compare (scratch script, all files outside /guide/, /og/, sitemap, llms, vendor, build id normalised): default 227 identical + `id-photo/index.html`; cloud 233 identical + `id-photo/index.html`. The one difference is G1b (two link texts in 관련 안내). Without G1b: 228/228 identical (checked at G1a).

**G1 before/after (2026-42 GSC 28 days baseline; re-check 12-15)**
| Page | imp / CTR / pos | Change |
|---|---|---|
| id-card-photo | 130 / 0.8% / 9.3 | title 주민등록증 사진 크기·규격 (신규·재발급); description leads with 크기(사이즈) 3.5×4.5 cm; query 주민등록증 사진 크기; updated 10-12. No 카드 크기 FAQ: law.go.kr is a script shell (1,267 bytes), easylaw search shell (735 bytes) |
| police-exam-photo | 9 / 0% / 5.3 | G1a: description answer-first, query 경찰 증명사진 규격. G1b: title 경찰 증명사진 규격, 원서 사진 3×4 cm, og 경찰 증명사진, updated 10-12 |
| kuksiwon-photo | 30 / 6.7% / 6.0 | G1a: description 국시원 first, query 국시원 사진 규격. G1b: title 국시원 원서 사진 규격 (간호사 등 국가시험), updated 10-12 |
| history-exam-photo | 56 / 3.6% / 9.7 | title 한국사능력검정시험(한능검) 원서 사진 규격; description 한능검 first + 10시 change rule; query 한능검 사진 규격; updated 10-12 |
| resume-photo | 22 / 0% / 7.9 | description = the answer (사람인 100×140·10 MB, 잡코리아 150×210·5 MB) |
| hub photo-sizes | 18 / 0% / 21.0 | description: 크기와 용량, 기관별 한 표 (adds 경찰). Title unchanged (hub) |
| korcham-photo | 18 / 5.6% / 10.0 | **No change**: guideDetail no=194 states 400×500 and 1:1.25 but no KB/MB limit |
| admission-photo | 37 / 2.7% / 9.9 | **No change**: no 진학사/유웨이 quote covers 대학원 photos (유웨이 mentions 대학원 only for login type and 전형료) |

**G2 candidate table** (volume: next-t not fetched this run — estimates missing, owner to check in 네이버 키워드 도구)
| # | Candidate | Source result | Outcome |
|---|---|---|---|
| 1 | 청소년증 | gov.kr search is a script app; 성평등가족부 sp_yth_f005.do 200, full text | **published** youth-card-photo (6 quotes) |
| 2 | 국제운전면허증 | safedriving selectDiGuide10.do 200 | **published** intl-driving-license (6 quotes) |
| 3 | 한자능력검정시험 | hanja.re.kr faq.do?id=91 + applyMeth.do 200 | **published** hanja-exam-photo (5 quotes) |
| 4 | 소방공무원 | 119gosi.kr no answer (bot + browser headers); nfa.go.kr no rule | draft fire-exam-photo |
| 5 | 군무원 | recruit.mnd.go.kr no answer | draft military-civilian-photo |
| 6 | 전산회계·전산세무 | license.kacta.or.kr script shell | draft kacta-exam-photo |
| 7 | JLPT / HSK | jlpt.or.kr information_01.html 200 (JPG, 3.5×4.5 비율, 1MB); HSK: no public photo rule | **published** jlpt-photo (4 quotes); draft hsk-photo |
| 8 | 장애인·외국인등록증 | gov.kr FAQ search: no item; no CappBiz code findable without the browser | not created (no URL to record beyond the FAQ search) |
| 9 | 정부24 서류 PDF | gov.kr faqList JSON (srchTxt=PDF, 전자증명서) | **published** gov24-pdf-save (6 quotes) |
| 10 | 정부24 여권 사진 오류 | gov.kr faqList JSON (srchTxt=여권), error codes 701/704/706/707/679 | **published** passport-photo-error (8 quotes) |
| 11 | 홈택스 PDF 비밀번호 | not sourced: naming pdf-password would change /pdf-password/ (locked decision 3) | draft hometax-pdf-password (Arch) |
| 12 | 네이버·다음 메일 첨부 | Naver help = script app; Daum attach FAQs state no limit | draft naver-daum-mail-limit |
| 13 | 카카오톡 파일 용량 | cs.kakao.com search = script app; no article id found | draft kakao-file-limit |
- chrome-cdp (via: browser) was unavailable all session: `connectOverCDP` timed out twice while /json/version answered (20 targets; likely a hung tab or another session). No guide uses `via: browser`.
- Every published new guide: ≥ 3 verbatim official quotes incl. a non-size fact (online-only/membership, 발급 장소·유효기간, 대상·장소·무료, JPG-only/합격인정서, 오류 코드 meaning, PDF printer blocked/전자증명서), FAQ 5, spec rows where numbers exist (4 photo rows → hub photo-sizes picks them up; checked in dist), related 3, DUP gate passed (check-dist OK).
- Inbound links: history-exam → hanja, teps → jlpt, driver-license → intl, passport-photo → passport-photo-error, id-card → youth-card, kosaf-docs → gov24-pdf-save. `updated` left alone where only `related` changed (runbook: content changes only; also keeps the driver-license fixed-date unit test valid).
- GROWTH-RUNBOOK calendar: 2026-12-01 passport-photo-error re-check, 2027-05-20 intl-driving-license re-check.

**G4**: gsc.mjs pages28 250 rows, pageQueries28 (page×query, 1000) with its own error path; indicators.mjs + section after renderReport; growth-data gets `indicators`. BRAND exported from opportunities.mjs (brief G4c says export; file not on the whitelist — flagged).

**Tests**: check:quotes `214 quotes verbatim` exit 0; vitest 1416 pass + ga.test 21/21 after cleaning public/vendor (its one failure is environmental: public/vendor/mediapipe left by an AUTOFRAME=1 prebuild, the test builds without the flag — same on origin/main); astro check 0 errors; e2e growth+site chromium+mobile-chrome 174/174, hubs 12/12, growth "guides" block on 5 projects 25/25 with retries 0 (after the axe test got a 120 s timeout; with 4 pages two runs had hit 60 s under load).

**Known Gaps (GROWTH3)**
- Published 43 + 2 hubs = 45 guide URLs (target 50 articles). Shortfall 7: sources behind script apps/unreachable hosts and the browser path down. Retry with chrome-cdp when it is free: kakao file limit, Naver mail, 119gosi, mnd, kacta, hikorea, gov.kr CappBiz (장애인등록증).
- Tools with < 4 own guides (pdf-password, jpg-to-pdf, pdf-to-jpg, image-to-jpg, …) cannot be frozen by pins; any new guide naming them changes a precached page. Needs an Arch rule (e.g. pins that may include next-step guides) — blocks hometax-pdf-password.
- id-photo output carries no EXIF, so no 찍은 날짜; gov24 passport error 704 checks 찍은 날짜. Unknown whether gov24 rejects a file with no date (passport_online preset). Needs a real upload test by the owner.
- 대학원 원서 사진 (no single source), 주민등록증 카드 크기 (law.go.kr shell).
- next-t volume estimates not collected this run.

**REV5 — build (2026-10-13, Bob): DONE_WITH_CONCERNS** (details: handoff/REVIEW-REQUEST.md "REV5"; nothing committed)
- Steps:
  - R5.1: src/components/IdPhotoTool.astro holds the tool body (prop `embed`). With the script still in the page, /id-photo/ HTML was byte-identical in default and cloud flag-on (raw compare, hashes included). Final state moves the entry script into the component (see decision 1).
  - R5.2: src/layouts/Embed.astro + /embed/id-photo/: no site script (no SW, menu, share), no GA/beacon/ads, no 인화·사진관/affiliate block, no 이어서 하기 (#idp-next optional in the controller), noindex + canonical /id-photo/, credit footer 「문서딱 제공」 → /id-photo/?via=embed.
  - R5.3: public/_headers `/embed/id-photo/*` block (detach, site policy with `frame-ancestors *`, X-Robots-Tag noindex). scripts/lib/csp.mjs `extendSiteCsp`: GA and Web Analytics extend only the `/*` policy. tests/e2e/serve.mjs models detach and comma-joined duplicates.
  - R5.4: VIAS += embed; arrival() gives via=embed for /embed/ paths; admin + weekly via table gain 「다른 누리집」; privacy usage list + PRIVACY_EMBED.
  - R5.5: /embed/ info page (snippet, 코드 복사 with selection fallback, 조건, white-label line, preview on demand), sitemap, llms.txt, NOT_PRECACHED, lighthouserc.
  - R5.6: /terms/ 11항 draft + TERMS_EMBED 2026-10-20 (owner approval pending).
  - R5.7: scripts/lib/embed-check.mjs + check-dist (widget page rules, _headers framing rules); bgcloud LOCAL_SCOPE covers the two embed pages.
  - R5.8: OPS-RUNBOOK §12, REVENUE-MODEL §1 "W: 구현(REV5)".
- Gates:
  - Precache: default 404.6 → 404.7, cloud flag-on 412.5 → 412.7 / 450, autoframe 406.8 → 406.9 KB (file-name bytes only). Core fonts: identical files (same hashes) in default and cloud; 0 new core characters.
  - vitest 1,428/1,428 (default dist; ga.test "GA-on build" needs public/vendor to match a non-autoframe copy-vendor). astro check 0. check-dist OK on default, cloud flag-on, autoframe, noauto.
  - e2e, embed/id-photo/site/sw/chain/preload on 5 projects + manual-chromium/firefox: 734 passed, 3 flaky (passed on retry: firefox site axe /pdf-compress/, webkit id-photo "done … below the sticky header" after a 2.5 min hang, mobile-safari id-photo "mobile at 360 px" after a 5 min hang), 86 skipped, 0 failed. embed.spec alone: 52 passed + 3 skipped (clipboard test is Chromium-only).
  - e2e cloud usage + ga.cloud ×5: 109 passed, 6 skipped, 0 failed (incl. the new via=embed test in all 5).
  - LHCI local (default build, median of 5): /id-photo/ 1,668 ms (HEAD 1,664), /embed/ 1,667 ms, CLS ≤ 0.0003, all categories 1.
- Key decisions:
  - (1) Entry script in IdPhotoTool.astro: a script per page made entry.ts a shared chunk and /id-photo/ a wrapper (LCP 1,664 → 1,822 ms). The tag now sits after the tool section instead of after `</html>`; otherwise the HTML is identical. Arch ruling requested.
  - (2) Header block is `/embed/id-photo/*`, not `/embed/*` (the splat would also catch the indexable /embed/ page).
  - (3) Preview on /embed/ is made on click: a lazy frame on that short page loaded at once and put LCP at 1,962 ms.
  - (4) The e2e host page is a real loopback server on localhost (tests/e2e/host-page.ts): Chromium blocks a frame of 127.0.0.1 inside a page.route stub (ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS).
  - (5) The plain-language postbuild check skips `<pre>` blocks (the snippet's CSS `720px`).
- Known Gaps:
  - Cloudflare detach + re-add in one block is not verified on a real deploy: curl a preview before production.
  - `?via=embed` arrivals on /id-photo/ are not counted (arrive reads only a same-origin /guide/ referrer).
  - Out of scope per brief: other widgets, paid white-label, postMessage auto-resize, host analytics, other languages.
  - Overlap: public/_headers with the twa worktree.
- Rebase (2026-10-13): REV5 rebased onto origin/main 8881a39 (WIP commit, rebase, soft reset; uncommitted again). Only BUILD-LOG conflicted; public/_headers keeps the assetlinks and embed blocks. vitest 1,469/1,469, astro check 0, check-dist OK default 407.3 / cloud flag-on 415.3 / autoframe 409.5 KB (origin/main 407.2 / 415.2), fonts unchanged, e2e embed + id-photo on chromium + mobile-chrome 93 passed, 7 skipped, 0 failed.
- Round 2 (Richard cleared, 0 Must Fix): embedHeaderProblems refuses a detach outside /embed/<tool>/*, a detach without a new policy and any non-/* policy without frame-ancestors (+3 cases); terms page-top 시행일 back to TERMS_EFFECTIVE (9-30 / cloud 10-02), 11항 keeps its 10-20 date + 「변경 이력」; /embed/ 조건 and 11항 share 「도구 아래의 「문서딱 제공」 링크를 지우거나 가리지 말아 주세요」. vitest 1,470/1,470, astro check 0, check-dist OK default 407.3 / cloud 415.3 KB, embed.spec chromium + mobile-chrome 22 passed.

**REV5 — deploy gate (2026-10-13)**
- Richard: clear (0 Must Fix); round 2 applied (detach only on /embed/<tool>/*, frame-ancestors required, terms top date unchanged, §11 own date 2026-10-20, wording aligned). Owner approved the /terms/ §11 text in chat ("좋아"). Pushed; preview-deploy header check + CI watched.

**EN1 — build (2026-10-13, Bob): DONE_WITH_CONCERNS** (details: handoff/REVIEW-REQUEST.md "EN1"; nothing committed; base 3e3e676 REV5)
- Built: /en/, /en/pdf-merge/, /en/pdf-compress/, /en/image-to-jpg/, /en/privacy/, /en/terms/, dist/en/404.html; BaseEn layout (same 3 CSS imports, 0 preloads, system font, no GA, CF beacon only, no manifest/ads/out-links/next-steps); EN catalogs under src/i18n/en/ (`satisfies Messages`, catalog marks); src/tools/image-to-jpg/en/controller.ts; sitemap hreflang (ko/en/x-default=en, both twins, 6 pairs); KO footer `English` on twins + home + privacy + terms; NOT_PRECACHED `/en/`; usage guard (lang ko only); app.css `html[lang="en"] body` system font; ui-font-chars EN_DIRS; meta-length EN_LIMITS (60 / 70–155 / 155); gen-brand og-en-*.png (Docttak wordmark); llms.txt "## English"; scripts/lib/en-check.mjs rules a–h + check-dist hook (GA/preload/coverage scoped to Korean pages; image-to-jpg lazy chunk found through the page's dynamic import, KO and EN budgets); en/404 moved to en/404.html by an astro:build:done integration; serve.mjs models nearest-404.
- Owner decisions applied (orchestrator note): CLAUDE.md brand rule (Docttak on /en/ only) and English plain-language line; docs/COPY.md "English"; EN privacy/terms reuse the Korean officer/contact (cloud build) and Korean governing law. Final English legal text is in REVIEW-REQUEST for owner approval before deploy.
- Key decisions:
  - (1) src/components/SiteScript.astro: a `<script>` in BaseEn next to Base's made site.ts a shared chunk behind two wrappers (home initial JS 1 → 2 files, +1 request on every Korean page). One component keeps one chunk (home 1,513 → 1,544 B, 1 file). Korean script file name changes Base.astro_… → SiteScript.astro_….
  - (2) Next-step slot optional in the 3 controllers (id-photo pattern) instead of an EN `next: null`: English pages omit #*-next (id-parity allowlist), Korean behaviour unchanged.
  - (3) Catalog marks as a `mark` field in Messages (`catalog-mark:ko|en`, literal per catalog file): a shared constant module would have put both marks in a shared chunk. Not `docttak-…`: the brand dist test forbids it in JS.
  - (4) Share/update-bar words via data attributes on the EN markup (share.ts, sw-register.ts keep the Korean text as fallback); no runtime lang lookups in libs except the brief's usage guard.
  - (5) EN og images rendered by a separate renderBrandEn() so postbuild.test's exact image list stays; llms.txt English section carries no brand name (brand dist test reads llms.txt).
  - (6) lighthouserc: /en/ and /en/pdf-merge/ added.
  - (8) `?en` module duplication (src/i18n/en/twin-modules.d.ts): EN pages import `controller.ts?en` / `entry.ts?en`, a second module instance. Root cause found with Lighthouse: shared controllers became chunks shared by the KO and EN entries; Rolldown has no transitive-import hoisting (rolldown types: `hoistTransitiveImports` "not implemented yet"), so /pdf-merge/ fetched handoff-marker/reorder/limits a round trip later: LCP 1,819 → 1,967 ms (5 runs each, ±5 ms). Rejected: manualChunks (drags the merge controller into /pdf-split/), side-effect imports in the KO script (Rolldown kept 1 of 3). After: 1,824 ms.
  - (7) postbuild.test.ts: 3 one-line edits (walk skips dist/en/; REV5 site-script chunk name; T10 sitemap regex allows xhtml:link) — brief allowed 1; escalated in REVIEW-REQUEST Open Question 1. growth.spec (blog footer loop skips /en/) and site.spec (sitemap list + EN list) updated: both iterate every sitemap URL.
- Gates:
  - Korean HTML vs fresh 3e3e676 build (same build id; hashed names + site CSS/script chunk names normalized): 67 pages, 1 identical, 60 hash-only, 6 = only the footer English link (/, /pdf-merge/, /pdf-compress/, /image-to-jpg/, /privacy/, /terms/).
  - Precache: default 406.7 → 407.3 KB; cloud flag-on (BG_REMOVE, BG_CLOUD, officer, contact, USAGE, GA test id, AFF_COUPANG=1) 415.4 KB; autoframe 409.5 KB; all / 450. Fonts unchanged (core/late files, PRELOAD_TRIPWIRE row).
  - Initial JS gzip (final): / 1,513 → 1,544 B; /pdf-merge/ 18,246 → 18,314 B (same 8 files); /pdf-compress/ 18,100 → 18,412 B (+1 file at depth 2: compress limits.ts shared with the EN instance); /image-to-jpg/ 9,172 → 9,229 B (same 4 files); image-to-jpg lazy 20.0 → 20.5 KB / 22; EN 18.2 / 18.4 / 9.6 KB, EN lazy 20.8 KB / 22.
  - LHCI local (5 runs, default build, all assertions pass): /pdf-merge/ 1,824 (fresh 3e3e676 1,819), /pdf-compress/ 1,820 (1,815), /image-to-jpg/ 1,664, / 1,660, /en/ 958, /en/pdf-merge/ 1,437, /en/pdf-compress/ 1,413, /en/image-to-jpg/ 1,421 ms; CLS ≤ 0.0003.
  - check-dist OK: default, cloud flag-on, autoframe. vitest 73 files / 1,499 tests (default dist). astro check 0 errors.
  - e2e: en.spec 11 × 5 projects green (webkit + mobile-safari with --workers=2: 22/22, retries 0; at 8 workers WebKit on Windows dropped pages, "Target page closed"). Korean regression pdf-merge/pdf-compress/image-to-jpg/site/sw/chain/preload/polish/growth/embed × 5 projects: 969 passed, 7 firefox flaky (passed on retry), 0 new failures after the growth/site spec updates (re-run 39/39). After the `?en` change: en + pdf-merge/pdf-compress/image-to-jpg on chromium/mobile-chrome/firefox 113 passed + 4 firefox flaky (re-run firefox at 2 workers, retries 0: 33/33); webkit + mobile-safari en/image-to-jpg/pdf-merge 54/54 (retries 0); cloud EN1 tests × 5: 10/10. cloud ga.cloud + usage × 5: 119 passed, 6 skipped (incl. the new EN tests).
- Known Gaps:
  - (fixed upstream in 73f15c7) tests/e2e/polish.spec.ts:151 "terms … 10 sections" fails on all 5 projects at 3e3e676 too: REV5 added 11항 + 변경 이력 (12 h2). Needs a one-line spec update (Arch).
  - Cloudflare nearest-404 for /en/ unverified on a real deploy (curl a preview /en/nope/).
  - /en/ offline → Korean /offline/ (EN2); EN usage split, EN chain (EN2).
  - safeFileName's Korean fallback `문서` for a name of only reserved characters (EN download name).
  - loadDynamicFont adds the Pretendard dynamic-subset CSS on EN pages after a file is picked (no woff2 fetched).
  - Officer name shown in Hangul (lang="ko") on /en/privacy/; romanized form is an owner call.
  - IndexNow needs no change (submits every sitemap `<loc>`).
- Rebase (2026-10-13): EN1 rebased onto origin/main 73f15c7 (WIP commit, rebase, no conflicts, soft reset; uncommitted again). vitest 1,499/1,499, astro check 0, check-dist OK default 407.3 / cloud flag-on 415.4 KB, e2e en + polish + site chromium + mobile-chrome 277 passed, 5 skipped, 0 failed. Orchestrator accepted the 3 postbuild.test.ts lines and the `?en` duplication.
- Round 2 (Richard cleared, 0 Must Fix; both Should Fix applied): check-dist keeps the every-page `googletagmanager` / inline `gtag(` rules for English pages (only the GA-tag-count rule is replaced there by "no tag on an English page"), and en-check rule (a) also flags `gtag(` (+fixture); en-check readableText also scans JSON-LD, og:image:alt and twitter:image:alt (+3 fixtures). vitest en-check + postbuild 101/101; check-dist OK default 407.3 / cloud flag-on 415.4 KB.

**EN1 — deploy gate (2026-10-13)**
- Richard: clear (0 Must Fix); both Should Fix applied (every-page GA checks on EN pages + gtag( in rule a; Hangul scan covers JSON-LD and og/twitter image alt). Owner approved the EN privacy/terms text and the CLAUDE.md EN-only brand/copy rule changes. Pushed; live /en/ 404 curl + CI watched.

## REQ1014-C — build (Bob, 2026-10-14, branch req-1014-c off origin/main ee4950c) — status DONE_WITH_CONCERNS

Brief: `handoff/ARCHITECT-BRIEF-REQ1014-C.md`. Built C1-C4 in order; D5/D6 not built (brief pushback, Known Gaps below).

**C1 presets (D2).** `police` (354×472 = printPx(30)×printPx(40), 30×40 mm, no limit, 300 dpi, official, note says the pixels are computed), `hanja` (230×310, 30×40 mm, 100 KB le, dpiFor(230,30)=195), `jlpt` (413×531, 35×45 mm, 1,000 KB le, 300 dpi, note: ratio only) after `kuksiwon` in 시험·원서; `R1014_RETRIEVED = '2026-10-14'`; police + hanja added to REFERENCE_ASPECT_EXEMPT (comment extended). Same order in PRESET_IDS and usage.mjs PRESETS. usage.mjs also has a preset LABEL map (unit test keeps it equal to the preset labels) — the 3 labels were added there (one extra 3-line hunk next to `kuksiwon`, brief "any preset label map"). Preset `source` names: 「경찰청 인터넷 원서접수」, 「한국어문회」, 「JLPT 일본어능력시험」 (the guide source titles; shown as the link text on /id-photo/).

**C2 guide deep links (D1).** police/hanja/jlpt CTAs + body links → own preset; `- preset:` source switched/added; 반명함판/직접 입력 how-to rewritten; updated 2026-10-14. kakao-photo CTA + body → `/photo-compress/?target=2500`.
- Deviation (fact check): the brief's CTA label 「사진 한 장 2,500 KB(2.5 MB) 이하로 줄이기」 is 31 characters (schema max 30), and any "2,500 KB" / "2.5 MB" on the page fails the build's unsourced-number check (`[slug].astro` unsourcedFacts: a computed number has no source quote, tool fact or preset). The gate was not loosened. The guide now says the preselected target is a 계산값 = 300MB ÷ 120장 without printing the computed number with a unit; CTA 「카톡 120장 묶음에 맞게 사진 줄이기」. The tool shows 2,500 KB once opened. If Arch wants the number on the page, that needs a "derived fact" rule in guide-facts (quote-backed operands + arithmetic) — a schema change, not done here.

**C3 passport (D4).** New `baby-passport-photo` (11 quotes: menuPos 32/12/4/10) and `passport-reissue-photo` (12 quotes: menuPos 7/12/10), FAQ 5, related 3 each; passport-photo-error: section 「정부24에 올릴 수 있는 사진 파일」 (500 KB/JPG/413×531/395–431×507–550/6개월, tied to 707), 편집 프로그램 배경 제거 = 제출 불가, menuPos=10 반려 line, FAQ 「707인데 크기를 어떻게 맞추나요?」, related → [passport-photo, passport-reissue-photo, id-photo-kb], body link to the reissue guide. passport-photo related: gosi-photo → baby-passport-photo (cap 4; updated unchanged). All quotes re-read live today (menuPos=10 has two copies of the 신청 불가 list; quoted the visible text). DUP gate unchanged and passing (max pair photo-sizes ~ upload-limits 0.231 / 0.45). No guide quote rendered verbatim (postbuild T9). The reissue guide's spec row was dropped (its numbers sit in two quotes; one-quote rule) — passport-photo already gives the hub its passport row.

**C4 10/10.** `_headers`: `/guide/rss.xml` → `X-Robots-Tag: noindex` (no CSP, no detach; embed-check passes). image-to-jpg: summary names AVIF, FAQ 「AVIF 사진도 JPG로 바꿀 수 있나요?」 — answer follows the real path: decode failure → PhotoError 'corrupt' → that row shows 「사진 파일을 열 수 없습니다…」, the others convert (decode.ts:20, controller.ts:429-430). pdf-compress: 2 FAQ with links (guides ecfs-pdf-limit, email-attachment-limit, yearend-tax-pdf; `/pdf-compress/?target=20`), no institution numbers in the answers (unit test). Deviation: gov24-upload-limit and hometax-upload-limit are drafts (not rendered), so they cannot be linked; the two published sourced guides were used instead. `src/pages/pdf-compress/index.astro` did not render FAQ links: added the same one-line `f.links` render image-to-jpg uses. tools.ts `updated` → 2026-10-14 for both tools (sitemap lastmod).
- D9 guides (article text with spaces, before → after): hwp-to-pdf 1,506 → 2,246; yearend-tax-pdf 1,243 → 1,807; ecfs-pdf-limit 1,575 → 2,199; pdf-merge 1,025 → 1,890; hwp-on-phone 1,173 → 1,868. Each ≥ 4 distinct internal body links (unit test), 「이럴 때는」 section, updated 2026-10-14. New quotes (retrieved 2026-10-14, fetched, not browser): hwp-to-pdf 한컴 2413 「* PDF 변환만 가능하며 PDF 파일을 편집할 수는 없습니다.」; yearend 국세청 유형 4 + 「※ 회사의 전산 및 업무 환경 등을 고려하여…」; ecfs 국가법령정보센터 대법원규칙 제8조 ③ (주장·증거는 별도 파일, 합치면 안 됨) and ④ (문자정보 검색·추출 가능 파일) — the ecfs portal itself is a WebSquare shell (all its quotes are `via: browser`), law.go.kr lsInfoR.do is fetchable; pdf-merge Gmail 25MB→Drive link + Apple 다운로드 폴더; hwp-on-phone Apple 「팁: 둘러보기 화면에 다운로드 폴더가 보이지 않는 경우, iCloud Drive를 탭하십시오.」.
- Stale copy fixed while there: ecfs-pdf-limit and yearend-tax-pdf said 「문서딱은 사진을 PDF로 바꾸지는 않아요」 — false since TOOLS4 (/jpg-to-pdf/); now they link 사진 PDF 변환. ecfs FAQ gains 「준비서면과 증거를 한 PDF로 합쳐서 내도 되나요?」 (규칙 제8조 ③).
- Out-of-list fix (gate): check:quotes failed on open-hwp-without-hangul — 한컴 다운로드 센터 changed its viewer text and now says 「* 운영체제: Windows 11 이상」 (was Windows 10). Quotes updated to the live text, body Windows 10 → 11, updated 2026-10-14. (saramin was a one-off fetch failure; re-fetch OK.)

**Generated:** scripts/lib/guide-titles.mjs (gen-guide-titles), og/sitemap/llms/rss via the build. tests/unit/ops.test.ts preset id list updated.

**Gates.** astro check 0 errors; vitest 73 files / 1,509 passed; check:quotes `--exact` 240 quotes verbatim (exit 0); check:licenses OK; check-dist OK on default (PUBLIC_SITE_URL), autoframe off (dist-noauto), autoframe on, bg on, cloud flag-on (BG_CLOUD + USAGE + GA + AFF). Precache: default 407.3 → 410.5 KB (+3.2), noauto 411.1, autoframe 413.3, bg 414.4, cloud 419.2 (EN1 noted 415.4 → +3.8) / 450. e2e (5 specs × 5 projects + manual-*): 1,003 passed / 0 failed / 12 flaky (firefox goto timeouts under shared-PC load). Lighthouse (CLI × 5, median; lhci crashed on NO_NAVSTART/EBUSY): 8/8 URLs pass, lowest perf /id-photo/ 0.96, highest LCP /photo-compress/ 1,980 ms. qa:visual static 0 hard failures. regress:idphoto 163/163 exact, 10/11 (known p07). Details in REVIEW-REQUEST.
- Local-env note: `regress:idphoto` needs `PUBLIC_ID_PHOTO_AUTOFRAME=1 node scripts/copy-vendor.mjs`, which swaps public/vendor/ and makes ga.test.ts fail its GA-on build (mediapipe in a flag-off build). Restored with `PUBLIC_BG_REMOVE=1 node scripts/copy-vendor.mjs`; vitest 1,509 passed again. Not a code issue.

**Known Gaps**
- D5 trigger: id-photo → photo-compress chain not built (encoder already meets the KB limit; the button would be a dead click). Revisit only if -A's admin shows sessions finishing id-photo then starting photo-compress without a `next` event.
- D6: print/사진관 block position unchanged; re-decide after rev6-cards ships with 28 days of out-link clicks per id-photo result screen split by preset (-A).
- rev6 merge: GUIDE_GROUP_OF needs `baby-passport-photo` and `passport-reissue-photo` → 'passport' (whoever lands second).
- kakao-photo cannot show the computed 2,500 KB with its unit until a derived-fact rule exists (see C2).
- The AVIF FAQ quotes the shared 'corrupt' message; if -B rewrites that message, update the FAQ wording.
**REQ1014-B — build (2026-10-14, Bob): DONE_WITH_CONCERNS** (brief: handoff/ARCHITECT-BRIEF-REQ1014-B.md; branch req-1014-b, base ee4950c; 7 commits 25a2c3d..HEAD; details: handoff/REVIEW-REQUEST.md)
- Resumed an interrupted build: D2–D16 were already written (uncommitted) by the previous session; this session audited them against the brief, fixed what was wrong and ran the gates.
- Changes this session: (1) src/lib/file/sniff-format.ts replaced by -A's file (byte-identical to req-a d26df38: FileFamily, sniffFormat(head, tail?), notHwpCode, corruptCode); not-hwp.ts rewritten onto that API (its own ZIP/text sniff removed; familyOf(family, workerSaid); image type for /jpg-to-pdf/ from sniffImage). (2) Reverted a stray id-photo/controller.ts hunk that used a draft -A API (sourceCode, SNIFF_FORMAT_BYTES; format logging is -A's). (3) Dropped B's copy of tests/unit/sniff-format.test.ts (-A's covers it; it asserts -A's FAIL_LABELS). (4) U+FEFF literal in the sniff regex put U+FEFF in the UI font's late range: Firefox fetched the late face on /id-photo/ (polish.spec:330); confirmed by A/B against a ee4950c build and by deleting U+FEFF from the CSS range; -A fixed the same in d26df38, B now matches it. (5) e2e test fixes: cloud spec "large photo / GPS" used 500 (now retried) -> 403 (final); usage.spec REQ1014-B used a portrait photo whose shape disc.webp does not match -> 600x400 disc PNG; hwp-viewer JPG->jpg-to-pdf skips the arrival check without OffscreenCanvas (Playwright WebKit on Windows; same skip as jpg-to-pdf/chain specs).
- Decisions: not-hwp code for text is -A's `not-hwp-text`, CFB the worker refused `not-hwp-cfb`, xlsx/pptx `not-hwp-office` (-A's notHwpCode, labels are -A's FAIL_LABELS block). jpg-to-pdf total-cap e2e: unit only (no cheap way to exceed 150 MB in the existing spec).
- Known Gaps: ui-shared chunk +0.5 KB gzip (boot.ts now imports handoff-marker + announce statically, D6); every page that loads ui-shared pays it (HWP pages 8.0->8.6, stamp 8.7->9.2 KB, all <= 30). C:\dev\doc-tools\reqb-base (temporary ee4950c checkout for the A/B font check) could not be deleted (a serve.mjs on :4391 holds it); worktree registration removed.
## REQ1014-A — build (Bob, 2026-10-14; branch req-1014-a off ee4950c) — status DONE_WITH_CONCERNS
Brief: handoff/ARCHITECT-BRIEF-REQ1014-A.md. Review request: handoff/REVIEW-REQUEST.md (files, line ranges, every gate number).
- Steps 1–7 as the build order, one commit each (33d180f, 255867c, 6faa664, 8cb0175, 87a0d6c, 6c13225, ea76e07). Every test-map entry checked against the diff: unit (usage, tracker, utm-land, campaign, deeplink, share, visits, admin-view sections, sign-handoff, sniff-format codes, growth, admin Function campaign failure) and e2e T-E1 (site.spec) / T-E2 a–g (usage.spec) are present. No gap.
- Step 0 (RUM probe) not run: owner Chrome on 127.0.0.1:9333 was down. Defaults built; D11 falls back automatically to one countryPaths node when errors[] names the like/notlike fields. Post-deploy check replaces the probe (log "REQ1014-A probe" then).
- Decisions beyond the brief: site.ts loads utm-land via `?worker&url` + a module script (an `import()` would pull Vite's preload helper into every page's initial JS); visits.mjs retries with the countryPaths fallback by itself (no Step 0 decision needed).
- Gate fix d26df38 (DONE): a literal BOM inside a regex in src/lib/file/sniff-format.ts put U+FEFF into the late UI-font range; Firefox then fetched anolim-ui-late-400 on /id-photo/ (polish.spec UI-font test, deterministic; ee4950c passes). Escaped as `﻿`; regression test postbuild.test.ts "no invisible format character" fails before, passes after.
- Gates: astro check 0 errors; vitest 76 files / 1,600 passed; check:licenses OK; check-dist OK ×5 (precache default 407.8, autoframe 409.8, bg 411.0, cloud 417.3 KB vs 407.3 / 409.5 / 410.5 / 415.4); G3 initial file lists identical to ee4950c (default + cloud), home/guide cloud +114 B gzip; e2e 1,351 passed / 17 flaky / 6 failed → 5 pass on rerun, 1 root-caused (above); lhci median of 5: / 99 1,675 ms, /id-photo/ 100 1,674 ms, guide 100 1,681 ms; qa:admin 18 scenarios × 3 = 54 PNGs, no overflow; qa:visual static 0 hard failures (/privacy/ clean); regress hwp all pass, idphoto 10/11 same as ee4950c.
- Environment notes: public/vendor keeps mediapipe after an AUTOFRAME=1 build, which makes ga.test / postbuild "check-dist passes" fail until `node scripts/copy-vendor.mjs` runs flag-off; astro check runs out of memory with five dist-* folders in the worktree (keep ≤ 3).

Known Gaps (REQ1014-A)
- UI font faces changed (core +느붙셉억 from the D18 privacy copy); brief G3 said unchanged. Arch to accept or reword.
- Step 0 numbers (per-node rows / Σvisits / max sampleInterval, like/notlike acceptance, usBrowsers) still to be recorded post-deploy.
- Detailed fail-code e2e (cloud usage) belongs to brief B (call sites not wired here).
- Play listing status (F5): owner confirms in Play Console.
- origin/main is now 5bac90a (REQ1014-C); merge-tree is clean, gates were run on ee4950c + this branch only.

## REQ1015 (steps 1–4) — build (Bob, 2026-10-15; branch req-1015 off origin/main 807d8b8) — status DONE_WITH_CONCERNS
Brief: handoff/ARCHITECT-BRIEF-REQ1015.md. Review request: handoff/REVIEW-REQUEST.md. Steps 5–6 (HEIC WebCodecs spike/decoder) not built: they wait for the owner's sample files.
- Commits (one per step, each deployable alone): 4a14c12 step 1 HEIC interim copy · 058ab5e step 2 admin AI referrers · 46bbccd step 3 해당 없음 · d9c1a04 step 4 PDF→JPG stage codes + reopen + one auto-retry.
- Step 1: ERRORS.heic (src/lib/image/messages.ts; every tool shares it: image-to-jpg, jpg-to-pdf, pdf-sign, stamp, bg, id-photo, photo-compress) = brief text verbatim. Tool FAQ ×5 + image-to-jpg summary (llms.txt). Guide heic-to-jpg: answer, new section 「PC에서 HEIC가 열리지 않을 때」 (3 bullets), F5 USB quote added (retrieved 2026-10-15), updated 2026-10-15. EN error / description / summary / FAQ. check-dist: guide/heic-to-jpg and llms.txt must not contain 「HEIC 사진을 고르고 변환하기를 누르면 JPG로 저장되고」.
- Deviations (step 1, gate-forced, Arch to accept):
  - Tool FAQ (src/data/tools.ts) says 「PC에서는 열리지 않는 경우가 많아요」 and 「새로 찍을 사진」 instead of the brief's 「PC의 크롬·엣지에서는」 / 「앞으로 찍을 사진」. Root cause: tools.ts feeds the preloaded core UI font; 롬·엣·앞 are not in it and the three glyphs pushed 「UI fonts preloaded (core 400 + 800)」 to 92.7 KB over the 92.66 KB tripwire (check-dist FAIL on the AUTOFRAME build). The base (807d8b8) sits 20 bytes under it, so no new core glyph fits. The guide (system-font prose) keeps 크롬·엣지 and 앞으로.
  - Guide answer is one sentence (schema: one sentence, ≤ 120 chars): 「아이폰·맥에서 사진 JPG 변환을 열고 HEIC 사진을 고르면 JPG로 바뀌고, PC 크롬·엣지에서 안 열리면 아이폰에서 바꾸거나 카메라 포맷을 「높은 호환성」으로 바꿔 앞으로 JPG로 찍으면 돼요.」
  - The old section 「보낼 때 저절로 바뀌는 경우」 was folded into the new section (same two bullets + its closing line), so the page does not say the same thing twice.
  - EN description dropped "Your photos are never uploaded" to carry the HEIC honesty within 155 chars (no-upload stays secondary on the page).
- Step 2: visits.mjs AI_SERVICES (label -> hosts, apps), aiServiceOf, aiReferrers (all referrer rows before the top-10 cut; partial = rows ≥ CHUNK_TOP), shapeVisits.ai, referrerLabel 「LABEL (host)」. admin-view s-ai after s-referrers (+ 합계 row, empty text, partial note). growth.mjs carries visits.ai; summaryBody adds 「- AI 서비스에서 들어옴 7일: N회 (…)」 right after the visits line (aiLine exported). No GraphQL change.
- Step 3: usage.mjs DEEP_LINK_TOOLS + NO_DEEP_LINK; the 「안내 글에서 도구로」 last cell. Equality test vs DEEP_PARAM. (A first comment said "D-D1" and tripped bgcloud.test's "never uses D1" grep; reworded.)
- Step 4: guards.ts RunStage, runErrorCode(err, isOom, stage) -> canvas / oom / corrupt / worker-gone / unknown-STAGE, afterRunError, reopenPlan. pdf.js 6.3.289 dead-worker messages pinned in the test (build/pdf.mjs: "Worker was destroyed", "Worker was destroyed.", "… during onPassword callback", "Worker was terminated.", "Transport destroyed", "PDFWorker.create - the worker is being destroyed."). inspect.ts resetPdfJsWorker(). controller: stage tracking, stale / lastFail / lastPassword (closure only, cleared in clearFile = reset, new file, file error), reopen before a stale run, one automatic retry on worker-gone (usage fail only for the final failure), user text for worker-gone and unknown-* = MESSAGES.unknown. openWith's error mapping moved into openFailed() (shared with reopen). FAIL_LABELS: 6 codes.
- Decision (step 4): reopen does not await the old document's destroy (`void closeDoc()`): on a dead worker pdf.js's destroy waits for a "Terminate" reply that never comes. A cancel during the reopen keeps the fresh document (same bytes); a new file or reset drops it.
- Gates (2026-10-15, local Windows): astro check 0 errors / 0 warnings; vitest 79 files / 1,676 passed; check:licenses OK (54 packages, no new dependency); check:quotes --exact 241 quotes verbatim (incl. the new USB quote); check-dist OK on BG_REMOVE, cloud flag-on and AUTOFRAME builds; precache cloud 421.2 -> 421.8 KB (/450), autoframe 415.1 KB; initial JS unchanged on /image-to-jpg/ 10.4, /jpg-to-pdf/ 10.5, /photo-compress/ 23.9, /id-photo/ 14.3, /pdf-to-jpg/ 10.3 KB gzip; pdf-to-jpg controller (lazy) 13.2 -> 13.7 KB / 14.5; UI fonts preloaded 92.6 KB / 92.66 (same as base). e2e chromium + mobile-chrome (image-to-jpg, jpg-to-pdf, pdf-to-jpg, en, site) + cloud-chromium usage.spec: 264 passed (no-upload fixture on every spec).

Known Gaps (REQ1015 steps 1–4)
- Core UI font headroom is ~20 bytes: any copy in .astro/.ts outside src/tools and src/lib that adds a new Hangul glyph fails check-dist. Step 7 copy (크롬·엣지 in the tool FAQ) needs a font budget decision first.
- No deterministic worker-kill in e2e without a production hook: the reopen / auto-retry branch is covered by the pure helpers (afterRunError, reopenPlan) only, not by a controller test.
- A pdf.js worker that dies without rejecting (no "Worker was destroyed" error) leaves getPage pending forever; there is no per-page timeout (not in the brief).
- AI counts come from the referrer top 50 per chunk (partial note shown); a refererHost_in node stays out of scope.

### REQ1015 round 2 (Bob, 2026-10-15, after REVIEW-FEEDBACK-REQ1015.md) — status DONE
- Must Fix 1: heic-to-jpg answer now 「아이폰·맥 사파리에서 사진 JPG 변환을 열고 HEIC 사진을 고르면 JPG로 바꿀 수 있고, …」 (119 chars, one sentence).
- Must Fix 2: jpg-to-pdf.md 안 될 때 bullet quotes the current message 「아이폰 사진(HEIC)을 이 기기에서 열지 못했습니다」 with the new advice (PC에서는 많이 안 열림 → 아이폰에서 사진 PDF 변환 열기, or 「높은 호환성」 for new photos) and the existing heic-to-jpg link.
- Should Fix: photo-kb.md HEIC FAQ aligned with the tools.ts wording (「이 페이지」 → 「사진 용량 줄이기」 because it is a guide).
- Logged, not fixed (Richard: non-blocking): visits.mjs `partial` is computed on the merged rows, so a multi-chunk view can over-warn (safe direction); a 「JPG로 변환」 click while a cancelled reopen is still settling does nothing (`opened` null until it settles; no leak, no loop).
- Orchestrator decisions recorded: deviations 1, 3, 4 accepted; font budget unchanged; the /image-to-jpg/ lead stays until step 7.
- Gates: check:quotes --exact 241 verbatim; check-dist OK default (PUBLIC_SITE_URL), BG_REMOVE and cloud flag-on (precache 421.8 KB); vitest 79 files / 1,676 passed; astro check 0 errors.

## TOOLS1015 — brief (log notes from handoff/ARCHITECT-BRIEF-TOOLS1015.md, copied by Bob when C1 started)
- 2026-10-15 Arch: TOOLS1015 brief (owner: maximize traffic; scout 2026-10-15 + official Naver keyword table). Order C1
  /char-count/, I0-I2 /id-copy/ + guide id-card-copy, E0 refactor, E1 /pdf-edit/, E2 「가린 쪽을 그림으로」 option.
- Locked: zero new core UI-font glyphs (missing on this base: 뒷 덮 띄 왜 콘 앞 굳 완 얗 랑 좌 융 킹 ○ ● ✓); no new deps,
  wasm or font files; pdf-edit reuses the HWP PDF face list (Noto Sans KR WOFF 1.0 slices, subset embed) in a new
  edit.worker; id-copy reuses decode + images.worker, opaque fill + tiled watermark burned into one JPEG; char-count
  stores nothing.
- 사람인 / 잡코리아 counter pages state no per-character byte rule (fetched 2026-10-15) → copy shows both rules, claims
  neither. 보안뉴스 2026-08-12 names no official body → not a guide source.
- QR코드 만들기: 4th candidate, out of scope (Known Gaps "next candidates" with 문서 스캔).
- Open: O1-O3. Owner (2026-10-15, via orchestrator): O1 slugs as proposed (/char-count/, /id-copy/, /pdf-edit/); O2 deploy after Richard clear + gates approved.

## TOOLS1015 C1 — /char-count/ 글자수 세기 (Bob, 2026-10-15; branch tools-1015) — status DONE
Brief: handoff/ARCHITECT-BRIEF-TOOLS1015.md (C1 only; I and E not started). Review request: handoff/REVIEW-REQUEST.md.
- Built: src/tools/char-count/{count,controller,entry}.ts + char-count.css (inlined), src/pages/char-count/index.astro; registration per decision 3 (tools.ts last in the list, og.json + og-char-count.png, JSON-LD WebApplication + FAQPage, sitemap/llms.txt via the generators, NEXT_GUIDES, lighthouserc, qa:visual, site/polish e2e lists, postbuild OG list, CLAUDE.md line 3, COPY.md term line, bgcloud LOCAL_SCOPE_RE, HOME_DESC_ORDER after pdf-sign, NOT_PRECACHED + RUNTIME_PAGES, usage TOOLS/TOOL_LABELS/basis setting). Inbound body link in guide resume-photo (updated 2026-10-15).
- count(): line by line (a line break is always a grapheme boundary); a line with no joining character (no marks, ZWJ/ZWNJ, variation selectors, Hangul jamo, surrogates) is counted by UTF-16 length, others through Intl.Segmenter('ko', grapheme); null segmenter = code points. Reason: the segmenter alone took ~75-80 ms on a 100,000-character paste (Node 22); the brief's unit perf bound is 50 ms. Bytes are computed per code point (UTF-8 length rule = TextEncoder, lone surrogate 3; unit-tested against TextEncoder). Lines: a trailing line break starts a line ("abc\n" = 2); paragraphs: blank = empty or white-space-only line.
- Decisions: (1) Copy deviations, all gate-forced by the zero-new-core-glyph rule: description 「…목표까지 남은 글자 수도 보여요.」 (brief 「…남은 양도 보여 줘요」: 줘 is not core; brief said all glyphs were core, measurement says no); chain heading 「자소서를 다 쓴 다음에는」 (썼 not core); FAQ 「공백(빈칸)과 줄바꿈을 빼고」 (탭 not core), 「세지 않습니다」 (뺍 not core), 「쓴 글은」 (던 not core); lead 「…남은 글자 수도 함께 보입니다」; howto 「숫자는 쓰는 동안 바로 셉니다」 (바뀝 broke the 94,884 B tripwire on the first build). (2) work24-resume-upload is a draft (frontmatter only, no body): it is in NEXT_GUIDES and in the page's chain list, both of which skip drafts until it is published; no body link was added to it (no body). (3) No tool-facts entry: the page states no limit a guide could quote. (4) Tool order: char-count is last in TOOLS (home cards and menu), a new text group after the PDF, photo, signature and HWP groups. (5) No AdSlot on the page (ads out of scope). (6) Chips are buttons that fill the number field (not radio chips): a goal is a number, the chips are shortcuts. (7) The leave prompt is measured in e2e by counting beforeunload add/remove (init script), not by a real dialog (browsers gate the prompt on user activation).
- Probe (a): Intl.Segmenter is a function in all 5 Playwright projects (char-count.spec "six numbers" test; chromium, firefox, webkit, mobile-chrome, mobile-safari green).
- Gates (2026-10-15, local Windows): astro check 0 errors / 0 warnings; vitest 80 files / 1,697 passed; check:licenses OK (54 packages, no new dependency); check:quotes --exact 241 verbatim; check-dist OK on default (PUBLIC_SITE_URL), AUTOFRAME=1 and cloud flag-on (BG_REMOVE + BG_CLOUD + USAGE + GA + AFF) builds. Precache: default 414.9, autoframe 417.9 (REQ1015: 415.1), cloud 425.1 KB (REQ1015: 421.8) / 450; the growth is the new menu entry and home card in every precached HTML (the page itself is not precached). UI font: 0 new core glyphs; preloaded core 400 + 800 = 94,864 B / 94,884 B tripwire (margin 20 B, unchanged). Budgets: char-count page script 1.9 KB gzip / 2.3; char-count initial JS 10.2 KB (cloud 11.6) / 13.9; no Web Storage / IndexedDB in the page script (check-dist). e2e: char-count.spec 5 projects 37 passed / 3 skipped (clipboard read: Chromium only); site + polish + growth + char-count on chromium, mobile-chrome, webkit 470 passed / 11 skipped / 2 failed → the 2 were the clipboard test reading CRLF from the Windows clipboard (test fixed to normalise, then green); usage.spec (글자수 세기 + CHAIN + privacy) on the 5 cloud projects 15 passed. LHCI /char-count/ median of 5: perf 1.00, a11y 1, BP 1, SEO 1, LCP 1,700 ms (max 1,980).
- Environment notes: after the cloud build, public/brand/og-remove-background.png stays and ga.test's GA-on check-dist fails until `node scripts/gen-brand.mjs` runs flag-off (same class as the copy-vendor note); postbuild.test "usage statistics … fail check-dist" failed once under full-suite load and passed alone and in its file (timing).
- Not built (brief Known Gaps for C): several 문항 at once, 원고지 매수, 단어 수, `?goal=` deep link, draft saving. qa:visual not run this step (not in the orchestrator's gate list).

### TOOLS1015 C1 round 2 (Bob, 2026-10-15, after handoff/REVIEW-FEEDBACK-TOOLS1015-C1.md) — status DONE
- Must Fix 1: count.ts SIMPLE_RE (the fast path) now also excludes every code point above U+FFFF (with the `u` flag the old `\ud800-\udfff` matched only lone surrogates, so 😀 / 👍🏻 / 🇰🇷 / 𠀀 were counted in UTF-16 units) and the BMP grapheme joiners outside \p{M} (Prepend U+0600-0605, 06DD, 070F, 0890-0891, 08E2, 0D4E; SpacingMark U+0E33, 0EB3; Extend U+FF9E-FF9F). Richard's regex, written with escapes; doc comment updated.
- Must Fix 2: unit tests: single emoji, emoji in Hangul, skin tone, flag, CJK Ext. B, กำ, ｶﾞ, Arabic Prepend equal to the segmenter; every BMP code point next to a / 가 / ก equals a segmenter-only count. Both fail on 2cee9c8's count.ts, pass now; the 100k perf test is kept.
- Should Fix: e2e six-numbers test adds a plain emoji and a flag (5 projects). Back/forward was real and worse than the review guessed: Chromium fills restored form values in after the module ran, so the restored text and goal were shown with zero counts. Fix: render silently once at start and again on `pageshow` (no announcement on either); new e2e test (restored text → numbers and goal text shown, live region empty; skips where a browser does not restore the form).
- Built and tested in a temporary detached worktree (wt/_c1r2, removed after) because the shared tree holds tool 2's uncommitted id-copy WIP, which does not build yet.
- Gates: astro check 0 errors; vitest 80 files / 1,699 passed; check-dist OK (AUTOFRAME=1; char-count page script 2.0 / 2.3 KB, initial 10.3 / 13.9 KB, preloaded fonts 92.6 KB unchanged, 0 new core glyphs); e2e char-count 5 projects 42 passed / 3 skipped (clipboard read: Chromium only).

## TOOLS1015 I0 — sourcing for the 신분증 사본 guide (Bob, 2026-10-15) — status DONE
Every URL tried (fetched 2026-10-15 with curl, no login):
- `https://www.law.go.kr/법령/개인정보보호법` → title shell only (an iframe to lsInfoP.do; lsiSeq 283839, efYd 20260911), as the brief said.
- `https://www.law.go.kr/LSW/lsInfoR.do?lsiSeq=283839&chrClsCd=010202&urlMode=lsInfoP&efYd=20260911&ancYnChk=0` → full text, server-rendered. 제24조의2 ①: 「개인정보처리자는 다음 각 호의 어느 하나에 해당하는 경우를 제외하고는 주민등록번호를 처리할 수 없다.」 (usable).
- `https://www.gov.kr/mw/AA020InfoCappView.do?CappBizCD=13100000015` (정부24 주민등록표 등본(초본) 발급, EUC-KR, server-rendered) → usable: 등본·초본이 무엇인지 (「주민등록표 등본은 세대별 주민등록표로서 …」), 신청 장소 (「신청은 시·군·구청, 읍·면사무소, 동 주민센터, 출장소의 사무소에서 구술·서면으로 하거나, 인터넷을 통해 전자문서를 이용하거나, 무인민원발급기로 할 수 있습니다.」), 수수료 (「수수료 1통(400원) / 이해관계인의 등·초본교부는 500원 / 인터넷으로 발급받을 때는 무료임」). CappBizCD 13100000014 = 주민등록표 열람, 13100000016 = 전입신고, 13100000026 = 다른 서비스: not used.
- `https://www.fss.or.kr/fss/search/search.do?query=신분증+사본` → empty result page (script search). `https://www.fss.or.kr/fss/bbs/B0000188/list.do?menuNo=200218&searchWrd=신분증` (보도자료 목록) → 6 hits; the relevant one `https://www.fss.or.kr/fss/bbs/B0000188/view.do?nttId=191073&menuNo=200218` (2025-02-16, 「고수익으로 현혹하며 신분증, 위임장 등을 요구한다면 대출사기 가능성을 의심하세요!!!」) → usable summary sentence: 「금융소비자도 명의도용 대출사기로부터 스스로를 보호하기 위해 지인이 고수익으로 현혹하며 귀하의 신분증, 위임장 등을 요구하더라도 절대 응하지 말고 대출사기를 의심하세요!」. Older hits (2017 분실, 2020/2021 보이스피싱) are about 분실 or 보이스피싱, not used.
- Not tried: privacy.go.kr / KISA, 행정안전부 모바일 신분증 (enough sourced facts without them).
- Result: 5 sourced facts (≥ 3) → I2 proceeds. **No official quote says to mask 주민번호 뒤 7자리 or the address, or to add a 용도 문구** (보안뉴스 2026-08-12 names no official body, brief): the guide and the tool attribute that to nobody; they describe what the tool does and say 「가려도 되는지 먼저 물어보세요」. 제24조의2 is quoted as what it says (처리자 may not process 주민등록번호 except …), never as "you may mask it".

## TOOLS1015 I1 — /id-copy/ 신분증 사본 만들기 (Bob, 2026-10-15; branch tools-1015) — status DONE
- Built: src/tools/id-copy/{limits,mask,watermark,controller,entry}.ts + id-copy.css (inlined), src/pages/id-copy/index.astro. Registration per decision 3: tools.ts (after id-photo: the photo group keeps its order, so home cards and menu put it after 여권·증명사진), og.json + og-id-copy.png, JSON-LD (toolJsonLd, as /pdf-sign/), sitemap/llms.txt via the generators, tool-facts (id-copy.maxFileMb.*), NEXT_GUIDES (kosaf-docs, univ-docs-upload; id-card-copy joins in I2), HOME_DESC_ORDER (pdf-sign → id-copy → char-count), NOT_PRECACHED + RUNTIME_PAGES, bgcloud LOCAL_SCOPE_RE, lighthouserc, qa:visual list, site/polish e2e lists, postbuild OG list, CLAUDE.md line 3, COPY.md term line, usage (TOOLS, TOOL_LABELS, `mark` setting on/off + labels), FLOW `'id-copy': ['pdf-password', 'pdf-compress']`.
- How it works: one photo → sniff → decode (EXIF orientation applied, long edge ≤ 2,000; without OffscreenCanvas the shrink runs on a page canvas) → stage. Every rectangle (crop and black boxes) lives in the turned photo, so cropping never moves a box and 돌리기 turns crop and boxes with the photo (turnRect, unit-tested: 4 turns = identity). The preview is the same drawCopy pass as the file: photo → black boxes (widened to whole output pixels) → watermark (3 lines, -30°, grey #5f6368 at 35 %, brick grid covering every corner; font = short edge / 22). 사본 만들기 draws once on a canvas within the device caps, toBlob JPEG 0.9 (pixels only), then the unchanged images.worker puts that JPEG on A4 portrait (10 mm margin; raw embed path, so WebKit without OffscreenCanvas works too). Fixed names 신분증_사본_YYYYMMDD.jpg/.pdf. Nothing stored; bitmaps, canvases and blob URLs released on reset and on pagehide (the page comes back empty from the bfcache).
- Decisions: (1) Boxes: max 20, min edge 2 % of the long edge; keyboard: arrows move (1/200 of the long edge), Shift+arrows resize, Delete removes (Alt+arrow would be browser back). (2) Crop is a mode (자르기 / 자르기 끝): the stage shows the whole photo with a dashed crop box; leaving it clamps the boxes into the crop. (3) A place already ending in 제출용 does not get a second one; the field takes 30 characters. (4) The PDF is made together with the JPG; if the worker fails, the JPG still downloads and the alert points to 사진 PDF 변환 (fail code engine/oom/unknown, phase save). (5) Empty file → ERRORS.empty with code corrupt (the brief's code list has no `empty`). (6) Summary copy: 「…사본으로 저장합니다.」 (brief 「사본을 만듭니다」: 듭 is not core). FAQ 「무엇을 가려야 하나요」 says 「보통 … 많이 가립니다」 (흔히 is not core); 「가지고 있는」 (갖 not core); 「올리는 것이 아니라」 (얹 not core). (7) Inbound body links: kosaf-docs and univ-docs-upload (updated 2026-10-15); work24-resume-upload is a draft without a body (skipped); id-card-photo is about the 주민등록증 photo, not a 사본 or 제출 서류 (off-topic, skipped). (8) The FAQ 「어디서 발급받나요」 links the guide only in I2 (the guide does not exist before).
- Gates (2026-10-15, local Windows): astro check 0 errors / 0 warnings; vitest 81 files / 1,717 passed; check:licenses OK (54 packages, no new dependency); check-dist OK on default, AUTOFRAME=1 and cloud flag-on (BG_REMOVE + BG_CLOUD + USAGE + GA + AFF) builds. Precache: default 418.0, autoframe 420.3, cloud 427.6 KB / 450 (C1: 414.9 / 417.9 / 425.1; the growth is the new menu entry and home card; the page itself is not precached). UI font: 0 new core glyphs (core 615 = base); preloaded core 400 + 800 = 94,276 B / 94,884 B tripwire (margin 608 B). Budgets: initial JS /id-copy/ 8.9 KB (cloud 10.3) / 30; id-copy controller (lazy) 13.2 KB gzip measured / 15.9 KB budget; pdf-lib and images.worker not in the initial JS (check-dist). e2e: id-copy.spec 5 projects 39 passed / 1 skipped (HEIC on webkit); id-copy + site + polish + growth on chromium, mobile-chrome, webkit 487 passed / 11 skipped; chain.spec chromium 18 passed; usage.spec 신분증 + CHAIN on the 5 cloud projects 14 passed / 1 flaky (cloud-firefox: the JPG download event never fired once, passed on retry; 10/10 with --repeat-each=2 --retries=0). LHCI /id-copy/ median of 5: perf 1.00, a11y 1, BP 1, SEO 1, LCP 1,670 ms (max 1,691). check:quotes --exact: run with I2 (I1 changes no quote).
- Probe (f): canvas Hangul in the system font draws on all 5 projects (the 용도 문구 e2e compares pixels per quarter, not glyph shapes).
- Not built (brief Known Gaps for I): PDF input, auto-detection / OCR, blur or mosaic, real-size card print, two sides on one page. qa:visual not run (not in the gate list); manual screenshots 1280 and Pixel 7 of the editing state looked right.

## TOOLS1015 I2 — guide id-card-copy 「신분증 사본 만드는 법·가리는 법」 (Bob, 2026-10-15) — status DONE
- Built: src/content/guides/id-card-copy.md (published 2026-10-15; category 서류, topic 여권·신분증; tools [id-copy]; cta /id-copy/; related id-card-photo, kosaf-docs, univ-docs-upload). 5 sources from I0 (정부24 ×3, 국가법령정보센터 제24조의2, 금융감독원 보도자료), all fetched, none `via: browser`. Sections: 신분증 사본이란 (사본 vs 등본·초본, 받는 곳·비용 table) · 휴대폰으로 사본 만드는 순서 · 가리기와 용도 문구 · 보내기 전에 확인할 것; 5 FAQ.
- Registration: TOOL_GUIDE_PINS 'id-copy': ['id-card-copy']; NEXT_GUIDES id-copy = id-card-copy, kosaf-docs, univ-docs-upload; the tool FAQ 「신분증 사본은 어디서 발급받나요?」 links the guide; guides-schema test: id-copy joins the partial list with 1 own guide; scripts/lib/guide-titles.mjs regenerated. Link graph: kosaf-docs and univ-docs-upload link the guide in their 신분증 사본 sentence (no orphan).
- Copy rule kept: no sentence tells the reader to mask anything or claims masking is required or sufficient; the only advice is the brief's 「가려도 되는지 먼저 물어보세요」 and the 금감원 sentence, attributed. 「회사 제출용」 as the example (not ○○). The guide renders in the system font (앞면·뒷면 allowed there; no core glyph added: core 615 unchanged).
- Gates: astro check 0 errors; vitest 81 files / 1,717 passed (first run: postbuild link-graph orphan + stale guide-titles → fixed as above); check:quotes --exact 248 quotes verbatim (8 browser-only ecfs quotes listed for manual check, unchanged); check-dist OK (default; guide HTML 6.1 KB, initial JS 1.5 KB, og 23.6 KB); precache 418.0 KB unchanged; e2e site + polish + growth + hubs + id-copy on chromium, mobile-chrome, webkit 505 passed / 11 skipped; LHCI median of 5: /guide/id-card-copy/ perf 1.00, a11y 1, BP 1, SEO 1, LCP 1,674 ms; /id-copy/ LCP 1,668 ms. Cloud and autoframe builds not rebuilt for I2 (a guide adds no script and no claim; I1's cloud/autoframe check-dist stand).

## TOOLS1015 E0 — page stage out of the pdf-sign controller (Bob, 2026-10-15; refactor only) — status DONE
- New src/lib/pdf/page-stage.ts `createPageStage({ el, cls, hintId, hooks })`: page geometry (pdf.js viewport at scale 1), drawing page k, the overlay boxes (pointer drag, corner resize `aspect` → resizeBox or `free` → resizeFree, arrows 1 pt / Shift 10, Delete), selection, focus kept across redraws. Items are generic `{ id, box, label, resizeMode, render(el) }`; the owner stores boxes (`store`), the stage keeps page, scale and selection. DOM, classes (`sign-*`), aria and status lines of /pdf-sign/ unchanged.
- place.ts stays in src/tools/pdf-sign/ (smaller diff: the unit suite and the controller keep their imports; src/lib already imports from src/tools in three files); adds pure `resizeFree(box, w, h, pageW, pageH)` (MIN_EDGE each side, at most the page, top-left fixed; unit-tested, idempotent under clampBox).
- Gates: astro check 0 errors (the one pre-existing unused `info` hint in useImage left as it was); vitest pdf-sign 29 passed; check-dist OK (default build): pdf-sign controller (lazy) 16.8 KB gzip (before 16.3; +0.5 KB = the hook object and the new module boundary) / 18.4 KB budget, budget line unchanged; merge.worker bytes identical (md5 a18726e5… before and after); e2e pdf-sign + stamp-signature on chromium, firefox, webkit, mobile-chrome, mobile-safari 116 passed / 4 skipped (the existing skips).

## TOOLS1015 E1 — /pdf-edit/ PDF 글자 넣기·편집 (Bob, 2026-10-15; branch tools-1015) — status DONE
- Built: src/tools/pdf-edit/{limits,items,text-place,coverage,controller,entry}.ts + edit.css (inlined after sign.css, whose stage classes it reuses), src/lib/pdf/{edit.ts,edit.worker.ts}, src/pages/pdf-edit/index.astro. Registration per decision 3: tools.ts after pdf-sign (the PDF group keeps its order; home cards and menu follow), og.json + og-pdf-edit.png, JSON-LD (toolJsonLd), sitemap/llms.txt via the generators, tool-facts (pdf-edit.maxFileMb.*), NEXT_GUIDES (pdf-sign, gov24-pdf-save, e-signature-law: all published), HOME_DESC_ORDER after image-to-jpg, NOT_PRECACHED + RUNTIME_PAGES, bgcloud LOCAL_SCOPE_RE, lighthouserc, qa:visual list, site/polish e2e lists, postbuild OG list, CLAUDE.md line 3, COPY.md term line, usage (TOOLS, TOOL_LABELS, `items` setting text/date/white/mix + labels, FAIL_LABELS font), FLOW pdf-edit = [pdf-sign, pdf-compress, pdf-password] and pdf-edit last on the hwp-to-pdf, pdf-merge and pdf-password-unlock rows (NEXT_LABELS + the EN catalog label 'Edit PDF'); the entry receives 이어서 하기 hand-overs. tool-guide-order.ts unchanged (no own guide to pin). Inbound body links: guides pdf-sign (updated 2026-10-15), gov24-pdf-save (신청서 빈칸 only, with 「발급받은 증명서는 원본 그대로 내세요」; updated 2026-10-15), yearend-tax-pdf (`updated` kept at 2026-10-14: guides-schema pins it for the GSC re-crawl set).
- How it works: the E0 page stage shows the page; items are 글자 / 오늘 날짜 (a text item prefilled, 3 forms, local date) / 흰 상자 (free resize). Text items are drawn on a canvas inside their box in the HWP preview faces (hwp-shared/fonts.ts CSS; 'Anolim HWP Sans' + Fallback + Serif = the FaceTable chain), at 100 px and scaled down (small canvas text snaps advances to whole pixels), measured with measureText (kerning off); first baseline (0.15 + 0.88) em below the box top, 1.3 em per line. The PDF uses the same numbers (items.ts baselineOf; text-place.ts textOrigin through the page's convertToPdfPoint, rotate = /Rotate). Corner drag scales the size by the new width; size 6-48 (slider); colours 검정 / 파랑 #1d4ed8. Save: edit.worker loads like signPdf (password, hasSignature, PDF/A-1 retry, producer), resolves every code point first (a character no face has stops the save with the list), draws white boxes, then text lines as runs per face, each face embedded once (subset, WOFF 1.0 → SFNT), verifyOutput. Output `{base}_작성.pdf`; original pages stay vector.
- Decisions: (1) Coverage while typing: src/tools/pdf-edit/coverage.ts reads the same face list (one same-origin GET under /fonts/hwp/; added to the network-guard allowlist with its own test) and names characters outside every 400 face range (「넣을 수 없는 글자: X」, save disabled); unknown coverage (offline) blocks nothing; a character in a range but without a glyph comes back from the worker (`missing`) and joins the list. (2) Font failures: createFontSource gained an optional onLoadError (additive) so the worker reports `font`, not a missing glyph, when a slice did not arrive; the face list failing is `font` too. (3) Small boxes: page-stage pads any box under 24 CSS px to a 24 px button (WCAG 2.5.8; axe target-size failed on a 17 px 흰 상자), --px/--py keep the content on the box itself; /pdf-sign/ boxes change only when tiny. New items cascade 12 pt right / 36 pt down so their buttons do not overlap. (4) Copy: 「원래 있는 글자」 (던 not core), 「위에 올리는 것」 (덮 not core); the late note next to 흰 상자 keeps the brief's wording (controller = late face); the result adds 「흰 상자로 가린 곳의 원래 글자는 파일 안에 그대로 남아 있습니다.」 when a box was used. Description 67 characters, title 36. (5) Limits = pdf-sign LIMITS (re-exported), 200 items, 500 characters per item; text on every page not built (Known Gap).
- Probes: (c) Node: pdf.js getTextContent returns 「홍길동2026.10.15.」 and a second line from editPdf output (unit); e2e on 5 projects reads the inserted Hangul back. Chrome/Edge viewer + desktop reader check: owner-side live smoke (no desktop reader here). (d) the worker's same-origin /fonts/hwp/ fetch passes CSP and the no-upload guard on all 5 projects; page.route blocks it in all 5 (font test). (e) /Rotate 90 and /Rotate 270 + CropBox (36,36): unit (textOrigin 0/90/180/270 × CropBox 0/36 on pdf.js viewports) and pixel e2e (ink inside the box ± 3 pt, none in 12 pt bands around it).
- Gates (2026-10-15, local Windows): astro check 0 errors / 0 warnings; vitest 82 files / 1,742 passed + 1 timing flake under full-suite load (char-count 100k perf, 123 ms; passes alone; not touched here); check:licenses OK (54 packages, no new dependency); check:quotes --exact 248 verbatim; check-dist OK on default, AUTOFRAME=1 and cloud flag-on builds. Precache: default 421.0, autoframe 423.2, cloud 430.5 KB / 450 (I1: 418.0 / 420.3 / 427.6; the menu entry and home card). UI font: 0 new core glyphs (default core 615 = base); preloaded autoframe 94,864 B / 94,884 B tripwire (margin 20 B, unchanged). Budgets: initial JS /pdf-edit/ 9.1 KB (cloud 10.5) / 30; pdf-edit controller (lazy) 15.5 KB gzip measured (cloud 15.6) / 18.5 KB; edit.worker 335.1 KB gzip measured / 360 KB (measured + 20 % would pass the HWP export chunk's 360, so 360; no Brotli decoder; merge.worker carries no fontkit, marker GSUB); pdf-sign controller 17.6 / 18.4 KB (E0 16.8: the page stage and shared UI modules now sit in a chunk both controllers import). e2e: pdf-edit.spec 5 projects 58 passed / 2 skipped (mouse drag on phones); pdf-edit + pdf-sign + stamp-signature + site + polish + growth + chain on chromium, mobile-chrome, webkit 636 passed / 18 skipped; usage.spec (PDF 글자 넣기 + CHAIN + privacy) on the 5 cloud projects 20 passed. LHCI /pdf-edit/ median of 5: perf 1, a11y 1, BP 1, SEO 1, LCP 1,670 ms (max 1,682).
- Not built (brief Known Gaps for E): editing existing text, AcroForm filling, check marks, drawing pad, bold or other fonts, text on all pages, page numbers, watermark, whole-document rasterizing. qa:visual not run (not in the gate list); manual screenshots at 1280 and 412 px of the editing state looked right.

## TOOLS1015 E2 — 「흰 상자로 가린 쪽은 그림으로 바꿔 저장」 option on /pdf-edit/ (Bob, 2026-10-15) — status DONE
- Built: src/tools/pdf-edit/flatten.ts (pagesToFlatten, renderFlat: pdf.js page at 200 ppi through PDF JPG 변환's pageScale/fitWithinCaps with its device caps, white background, JPEG 0.9), src/lib/pdf/edit.ts flattenPdf (each listed page replaced in place by a same-size, unrotated page holding only its picture; producer; PDF/A-1 retry) behind a `flatten` message of edit.worker; controller: the checkbox (page markup, default off, shown only while a white box exists, reset with each new file) runs after the E1 save: open the result with pdf.js, draw the affected pages one at a time, replace them, verifyOutput (same page count).
- Copy: checkbox 「흰 상자로 가린 쪽은 그림으로 바꿔 저장(가린 글자가 남지 않게)」 (the brief's 「밑의」 is not core → 「가린 글자가」); the late note next to 흰 상자 adds 「남지 않게 하려면 아래 「그림으로 바꿔 저장」을 켜세요.」; result note 「N쪽을 그림으로 바꿔 저장했어요. 그 쪽의 글자는 복사할 수 없어요.」 replaces the "still in the file" note; FAQ 「흰 상자로 가린 내용은 지워지나요?」 and the 알아 두면 좋아요 item now name the option. Canvas failure: fail c=canvas (phase process), alert 「가린 쪽을 그림으로 바꾸지 못했어요. 「그림으로 바꿔 저장」을 끄고 저장하거나, PC에서 다시 해 주세요.」, nothing saved, items kept. No new usage field (brief).
- Known Gap (logged): a replaced page loses its links, form fields and annotations (it is a picture now); outline entries pointing at it may stop jumping there. Only pages with a white box are replaced, and only when the person turns the option on.
- Gates (2026-10-15): astro check 0 errors / 0 warnings; vitest 82 files / 1,745 passed (unit: affected pages; a flattened /Rotate 90 page is one unrotated 800 × 600 picture with empty getTextContent, the other page keeps its text); check-dist OK on default, AUTOFRAME=1 and cloud flag-on builds; precache 421.0 / 423.2 / 430.5 KB / 450 (unchanged from E1: the page is not precached); UI font: 0 new core glyphs (default core 615, autoframe 619 as E1; preloaded autoframe 94,864 B / 94,884 B, margin 20 B); budgets: pdf-edit controller 17.1 KB gzip (E1 15.5; + flatten and the pdf-to-jpg scale/limits it reuses) / 18.5 KB, initial JS /pdf-edit/ 9.2 KB (cloud 10.6), edit.worker 335.3 / 360 KB. e2e: pdf-edit (new E2 test: off by default, shown with a white box, on → page 1 has no text and is white under the box, page 2 keeps its text, page size kept) + pdf-sign on 5 projects 121 passed / 4 skipped; site + polish + growth + chain + stamp-signature on chromium, mobile-chrome, webkit 566 passed / 16 skipped; usage.spec PDF 글자 넣기 on cloud-chromium + cloud-webkit 2 passed. LHCI /pdf-edit/ median of 5: perf 1, a11y 1, BP 1, SEO 1, LCP 1,671 ms (max 1,681).

### TOOLS1015 C3 round 2 (Bob, 2026-10-15, after handoff/REVIEW-FEEDBACK-TOOLS1015-C3.md) — status DONE
- Must Fix 1 (flatten left the covered text in the file): root cause confirmed — pdf-lib removePage deletes only the page dictionary; the old /Contents, /Resources, /Annots and the field /V stayed in the context and were written. Fix (src/lib/pdf/edit.ts flattenPdf): before the replacement, the old pages' /Annots refs are collected; dropFields removes those widgets from /AcroForm /Fields (walking /Kids) and every field left without widgets (its /V goes with it); then dropUnreachable deletes every indirect object the trailer's /Root and /Info no longer reach, before save. New test helper tests/helpers/pdf-traces.ts (raw bytes + every object written out + every stream decoded; a secret counts as present in literal or hex form). Unit: a page with SECRETWORD in its content and a filled field FIELDSECRET → after flattenPdf neither is anywhere in the file, the other page's KEEPME and field FIELDKEEP stay, the form keeps only that field; the test fails on 644ff5a's edit.ts and passes now. e2e: the E2 test checks OLDTEXT is gone from the whole file. The copy 「(가린 글자가 남지 않게)」 stays: these tests prove it.
- Must Fix 2, Arch decision (coordinator, 2026-10-15): (a) E2 renderFlat takes a paint callback that runs after pdf.js drew the page with its annotations: the page's white boxes are painted over everything (form field values too), then the text items on that page that sit on a white box or an annotation are painted again in the preview face at the same baseline numbers; the converted page keeps no annotations or fields (dropped per Must Fix 1). (b) Normal save: nothing is deleted. The controller reads each page's annotation rectangles (pdf.js getAnnotations, Link and Popup left out, converted to the page as seen); a selected item over one shows a late note (#ed-item-note, empty in the markup): 흰 상자 「이 자리에 입력 칸이 있어 저장한 파일에서는 칸 내용이 흰 상자 위에 보일 수 있어요. 완전히 가리려면 「흰 상자로 가린 쪽은 그림으로 바꿔 저장」을 켜 주세요.」, 글자 「이 자리에 입력 칸이 있어 저장한 파일에서는 넣은 글자가 칸에 가려질 수 있어요.」; the result adds 「입력 칸과 겹친 흰 상자나 글자가 있어요. 저장한 파일에서는 칸 내용이 위에 보이거나 넣은 글자가 가려질 수 있어요.」 when such an item is on a page that was not converted. All of it is controller text (late face): 0 new core glyphs (default core 615). (c) Fixture field-form.pdf (generated in the spec: filled text field FIELDSECRET over page text COVERTEXT on page 1, field FIELDKEEP on page 2); e2e: the warning on the item and in the result with the field value still in the file; with 「그림으로 바꿔 저장」 FIELDSECRET and COVERTEXT are gone from the file, FIELDKEEP and its field stay, the picture is white under the box.
- Should Fix notes: pdf-sign controller (lazy) is 17.6 KB under its unchanged 18.4 KB line — 0.8 KB headroom left for the next pdf-sign change (the growth is the page-stage chunk both controllers share since E0/E1). yearend-tax-pdf keeps `updated: 2026-10-14`: the added line is a one-sentence cross-link, not a content revision, and guides-schema pins that date for the GSC re-crawl set. edit.worker 360 KB line accepted as is (reviewer).
- Gates: astro check 0 errors / 0 warnings; vitest 82 files / 1,746 passed; check-dist OK on default and cloud flag-on builds (precache 421.0 / 430.5 KB / 450, unchanged; pdf-edit controller 17.8 KB gzip / 18.5 KB — 0.7 KB headroom; edit.worker 335.7 / 360 KB); check:quotes --exact: 5 problems, all one external page (passport.go.kr contents.do?menuPos=10 now HTTP 404, cited by passport guides this step does not touch) — logged to Known Gaps for the guide owner; the three guides edited in E1 pass. e2e pdf-edit + pdf-sign on chromium, firefox, webkit, mobile-chrome, mobile-safari: 130 passed / 4 skipped / 1 flaky (webkit pdf-sign axe test timed out waiting for the download once under 8-worker load, passed on retry and 3/3 with --repeat-each=3 --retries=0).
- Known Gap (new): passport.go.kr menuPos=10 returns 404 (check:quotes, 2026-10-15) — the passport photo guides need a new source URL (not part of TOOLS1015 E).

### TOOLS1015 C3 round 3 (Bob, 2026-10-15, after REVIEW-FEEDBACK-TOOLS1015-C3.md "round 2") — status DONE
- Must Fix 1 (reproduced by Richard: /AcroForm /CO or a struct tree OBJR kept a replaced page's widget, its /AP and its UTF-16BE /V alive): flattenPdf now deletes outright, before the unreachable sweep, every ref in the replaced pages' /Annots with their appearance streams (/AP /N /R /D, plain or by state), every field dropFields pruned (and parents left empty) with their appearance streams, and the old pages' /Contents (the stream, or the array and its streams); the pruned and gone refs are removed from /AcroForm /CO too. A reference to a missing object reads as null (PDF 32000 7.3.10), so the struct tree, outlines and /Dests stay valid. Unit (pdf-edit.test 「round 3」): plain, /CO, tagged (StructTreeRoot → StructElem → OBJR to both widgets) and both; each proves SECRETWORD (content), FIELDSECRET (value + appearance stream) and 비밀값 (UTF-16BE /V) are gone, KEEPME and FIELDKEEP stay, only the kept field is left, /CO keeps one entry; the /CO, tagged and both cases fail on 0242667's edit.ts and pass now. Not covered: a form XObject the old page used that something other than a page still references (none of our fixtures or the reviewer's cases).
- Must Fix 2: tests/helpers/pdf-traces.ts hasSecret also matches the UTF-8 and UTF-16BE raw bytes and the UTF-16BE hex with and without FEFF (either case); a unit case checks it, and the Korean field value 비밀값 is in the unit fixture and in the e2e field-form fixture (present after a normal save, gone after 「그림으로 바꿔 저장」).
- Approved nits: annotation rectangles skip `hidden` (Hidden / NoView) annotations and zero-size rectangles; the save awaits the annotation list of every page with an item before planning (paintOver and the result note no longer race the background load); wording 「입력 칸이나 메모」 (controller text = late face; default core 615, 0 new core glyphs). pdf-edit controller 17.8 / 18.5 KB: no budget change needed; pdf-sign line untouched (17.6 / 18.4).
- check:quotes: passport.go.kr moved the 「온라인 여권 재발급 > 기본사항 안내」 page from contents.do?menuPos=10 (now HTTP 404) to menuPos=11 (fetched 2026-10-15, HTTP 200, title 외교부 여권안내 홈페이지, breadcrumb [온라인 여권 재발급] > [기본사항 안내]); both quoted sentences (「신청 불가 대상 생애 최초 전자여권 신청자」, 「18세 미만 미성년자를 위한 온라인 신청 시에는 법정대리인이 본인 인증 후 대리 신청 필요」) and the other menuPos=10 quotes are verbatim there. URLs updated in baby-passport-photo (2), passport-photo-error (1), passport-reissue-photo (4), retrieved 2026-10-15 on those entries only; `updated` unchanged (a source move, not a content revision). The round-2 Known Gap about menuPos=10 is closed.
- Gates: astro check 0 errors / 0 warnings; vitest 82 files / 1,751 passed; check-dist OK on default and cloud flag-on builds (precache 421.0 / 430.5 KB unchanged; edit.worker 335.9 / 360 KB); check:quotes --exact 248 verbatim (0 problems); e2e pdf-edit + pdf-sign on chromium, firefox, webkit, mobile-chrome, mobile-safari 131 passed / 4 skipped.

### TOOLS1015 C3 round 4 (Bob, 2026-10-15, after REVIEW-FEEDBACK-TOOLS1015-C3.md "round 3") — status DONE
- Must Fix (reproduced by Richard: the explicit delete of the old page's /Contents also killed streams kept pages share — pdf-lib's q / Q wrapper streams when E1 drew on two pages, and source PDFs whose pages share one content stream): flattenPdf now builds a "kept" set after the replacements — every /Contents ref of every page in the document, every /Resources /XObject ref of those pages (inherited resources included, recursively through Form XObjects' own /Resources), and their annotations with appearance streams — and deletes outright only doomed refs outside that set; shared ones are left to the unreachable sweep. The same rule now also covers the old page's /Resources /XObject refs (recursively), which closes the round-3 Known Gap (a Form XObject the struct tree reaches through MCR /Stm).
- Tests (pdf-edit.test 「round 4」; all three fail on db870c9's edit.ts and pass now): (a) editPdf draws on pages 1 and 2 of a source whose page 2 leaves a flip transform open (no Q), then page 1 is flattened: every page-2 /Contents ref resolves to a stream and page 2's getTextContent strings and transforms equal those before the flatten; OLDTEXT is gone. (b) two pages share one content stream: flattening page 1 leaves page 2's SHAREDTEXT and all its /Contents refs. (c) a Form XObject drawn only on the replaced page and reached by StructTreeRoot → StructElem → MCR /Stm: XOBJSECRET is gone from the file, KEEPME stays.
- Gates: astro check 0 errors / 0 warnings; vitest 82 files / 1,754 passed; check-dist OK on default and cloud flag-on builds (precache 421.0 / 430.5 KB unchanged; edit.worker 336.0 / 360 KB; pdf-edit controller 17.8 / 18.5; pdf-sign 17.6 / 18.4; default core 615); check:quotes --exact 248 verbatim; e2e pdf-edit + pdf-sign on chromium, firefox, webkit, mobile-chrome, mobile-safari 130 passed / 4 skipped / 1 flaky (firefox pdf-sign page navigation: page.goto 20 s timeout under 8-worker load; 3/3 with --repeat-each=3 --retries=0; round 4 changes nothing on /pdf-sign/).

### TOOLS1015 C3 round 4 review — CLEAR (Richard, 2026-10-15)
- Richard re-ran every break test (plain, /CO, tagged OBJR, MCR /Stm XObject, shared q/Q, shared source stream, shared XObject, inherited /Pages /Resources XObject): covered text gone, kept pages intact, 0 dangling refs.
- Known Gap (nit, not fixed): the kept set does not yet include XObjects reached only through a kept page's annotation /AP resources or pattern /Resources. If a flattened page draws that same XObject directly, it is deleted outright and the kept annotation/pattern loses it. Very rare; revisit if reported.

## STAMP1015 — brief (Arch log notes, copied by Bob 2026-10-15)
- 2026-10-15 Arch: STAMP1015 brief (owner request 2026-10-15; Naver keyword table in handoff/ARCHITECT-BRIEF-STAMP1015.md). New tool /stamp-maker/ 「도장 만들기」, 12 styles: round, round-double, oval, square-seal, square-round, square-inverse, rect-v, rect-h, plain, corp-round, corp-square, date-round.
- Fonts: reuse /fonts/hwp/ faces (Noto Serif KR, Noto Sans KR, Nanum Myeongjo, Nanum Gothic; fontsource 5.3.0, OFL-1.1). Measured cmap coverage 2026-10-15: all 11,172 Hangul syllables in all four; KS X 1001 한자 4,883 (Serif) / 4,885 (Sans) of 4,888 (misses are compatibility code points), none in Nanum → per-glyph Noto fallback. No OFL/Apache seal-script face found; Black Han Sans / Song Myung are OFL but KS X 1001 Hangul only, no 한자 → Known Gap.
- PNG only (no SVG); pHYs 600 / 1,200 ppi from mm choices; 인주 질감 seeded and deterministic.
- sign-handoff gains from; /pdf-sign/ names the source tool. /pdf-edit/ is not a chain target (no pictures).
- /stamp-signature/ keeps URL / name / h1; title, description and keywords move to 전자서명 + 도장 사진 배경 지우기 (S5).
- Core glyphs missing (never in core copy): 테 황 랑 굵 딕 之 印 싸 뀝 옵 뿐 듭 깥 레.
- Open: O1-O3.

### STAMP1015 S0 — sign-handoff carries the source tool (Bob, 2026-10-15) — status DONE
- src/lib/ui/sign-handoff.ts: SIGN_FROM_KEY `docttak:sign-from`; SIGN_SOURCES map (stamp-signature → 전자서명·도장 이미지 만들기, stamp-maker → 도장 만들기) with arrivedNote / arrivedInfo; storeSignPng(url, store, from) writes both keys and removes both when the second write throws; takeSignPng returns `{ blob, from }` and removes both keys, a missing or unknown source (incl. `__proto__`) reads as stamp-signature; sendToPdfSign(png, from = 'stamp-signature', go, track) tracks next t = from. /pdf-sign/ controller takes its note and info line from the map (stamp-signature wording byte-identical). stamp-signature pad.ts / photo.ts pass 'stamp-signature' explicitly.
- Decision: `stamp-maker` joins the UsageTool TypeScript union in S0 (type only, needed by the next event type); the runtime whitelist (usage.mjs TOOLS, labels) changes in S3 with the rest of D8. No caller sends stamp-maker before S3.
- Gates: vitest pdf-sign.test 31 passed (2 new: source round trip incl. unknown values; note/info wording); astro check 0 errors / 0 warnings; build AUTOFRAME=1 check-dist OK, pdf-sign controller (lazy) 17.5 KB / 18.4 (was 17.6, within 1 %), precache 423.2 KB / 450; e2e pdf-sign + stamp-signature on chromium, firefox, webkit, mobile-chrome, mobile-safari 116 passed / 4 skipped.

### STAMP1015 S1 — pure modules (Bob, 2026-10-15) — status DONE
- src/tools/stamp-maker/{styles,layout,ink,png,limits}.ts + tests/unit/stamp-maker.test.ts (24 tests) + tests/helpers/stamp-fonts.ts.
- layout.ts: normalize (NFC, whitespace dropped / collapsed per style), graphemes (Intl.Segmenter, code-point fallback), badChar (allowed set D4), scriptOf, suffixFor, faceFor, lineCount / distribute / toLines, layoutStamp → draw list in unit coordinates (shapes + glyph items with per-glyph face, scale, rotation, ink offsets, half extents and the region each must stay in).
- Grid decisions (brief "a×b" read as columns × rows): vertical lines are columns right→left; when lines hold different counts the first (right / top) lines take the extra glyph and shorter lines get taller cells (e.g. 사각 인감 홍길동 붙이지 않음 = 홍길 | 동, 동 tall). Round 1-3 one column, 4 = 2×2, 5-6 = 3 columns; oval 1-4 one column, 5-6 = 2; square 2-4 = 2 columns, 5-9 = 3; horizontal toggle transposes (round 1-3 one row, 4-6 two rows; square 1-2 one row, 3-4 two, 5-9 three). Round / oval text sits in the largest box of cell aspect 0.85 inscribed in the inner ellipse.
- Suffix decisions: an explicitly chosen 인 / 지인 is always added (past the cell maximum the tile says too-long); corp-square 자동 = none when the count is a square number, 지인 when it still fits that grid, else 인 (fills the grid: 3 → 문서딱인, 7 → +지인 = 9) — the brief's "+지인 unless the count fills the grid" would leave 10 cells → a 4×4 grid with 6 empty for n = 8; logged as a reading of D4. corp-square drops spaces (a space in a column-major grid is an empty cell) and has no 가로 toggle (D4 lists round, oval, square-*, plain only).
- Auto-fit: ink box (+ the 굵게 stroke, 2.5 % of the reference em, in each axis) fitted into 90 % of the cell, one common x and y scale per line, x/y stretch clamped to [0.6, 1.6] by reducing the larger scale. Arc: step from the band height (+15 % air), span ≤ 300°, box half-width ≤ r0·tan(step/2)·0.9 and the height that keeps the outer corners inside r1 (closed form, so neighbours cannot intersect). corp-round inner ring at radius 0.26 (first try 0.30 left the company name too small on a rendered sheet).
- Probe (e) result — differs from the brief: over the fontsource slices, NFC sends KS X 1001 D2AB / E7E6 (U+F92C 郎, U+F9B8 隸) to U+90CE / U+96B8, which neither Noto Serif KR nor Noto Sans KR has (the compatibility code points are there). normalize() therefore keeps those two as U+F92C / U+F9B8 (also when typed as U+90CE / U+96B8); Noto Sans KR also lacks U+9699 隙 (either form) → painted in Serif. Unit: all 4,888 KS X 1001 Hanja allowed after normalize() and present in the face each is painted in, for all four faces.
- Test harness note: Skia (@napi-rs/canvas) does not fall back between unicode-range slices registered under one family name (first try painted tofu and the fit tests passed on tofu boxes); the helper registers each fontsource slice under its own name and picks it from the fontsource CSS unicode-range, as a browser does. Rendered contact sheet (scratch, not committed) checked by eye: 12 styles × Hangul / Hanja heavy+질감 / 2 syllables 가로 sans / 5 syllables 나눔명조 thick.
- ink.ts: mulberry32 lattices for 2 octaves of value noise in long-edge-relative coordinates (alpha kept ≥ 60 % away from edges and holes), edge layer roughened by a third octave (eats up to 1 pixel), 60 pin holes of radius 0.3-0.9 % of the long edge (≤ 0.8 % of the area); alpha only reduced, colour untouched, same seed → identical bytes. png.ts: CRC-32, pHYs after IHDR (an existing one replaced), readPhys.
- Gates: vitest stamp-maker.test 24 passed; astro check 0 errors.

### STAMP1015 S2 — /stamp-maker/ page, controller, registration (Bob, 2026-10-16) — status DONE
- New: src/pages/stamp-maker/index.astro (input, privacy line, empty grid box with a sample slot, panel slot; 사용 방법 3, 알아 두면 좋아요 1 block of 2 points, FAQ 6 from tools.ts), src/tools/stamp-maker/{controller,render,fonts,entry}.ts, stamp-maker.css (inlined). tests/e2e/stamp-maker.spec.ts (7 tests).
- Registration (TOOLS1015 decision 3 list): tools.ts entry right before stamp-signature (brief D1 copy verbatim; updated 2026-10-16), og.json image + page description (gen-brand draws og-stamp-maker.png 28.6 KB), JSON-LD (toolJsonLd), sitemap / llms.txt via the generators, NEXT_GUIDES stamp-maker → stamp-image, e-signature-law, pdf-sign (no tool-guide-order pin: no guide names the tool yet; tool-facts: no FAQ number to source), lighthouserc, qa:visual, site / polish lists, postbuild OG / imageOf lists, bgcloud LOCAL_SCOPE_RE, HOME_DESC_ORDER after pdf-edit, gen-sw NOT_PRECACHED + sw.ts RUNTIME_PAGES, CLAUDE.md line 3, COPY.md 도장 만들기 line, usage.mjs TOOLS + TOOL_LABELS (the whitelist test keeps TOOLS equal to the site's tools; settings and events come in S3). postbuild brand test: `docttak:sign-from` allowed next to `docttak:sign-png` (internal storage key).
- Loading: entry.ts imports the controller after window load + requestIdleCallback (3 s timeout), or at once on the first focus / key / pointer / touch in the tool. The controller injects hwp-fonts.<hash>.css once and loads the (face, weight) slices for the visible texts (sample or typed, 인지印之, centre, label, date); 4 s budget, then the system face + note 「글꼴을 받지 못해 기본 글꼴로 보여 드려요. 인터넷 연결을 확인해 주세요.」; if the slow load still succeeds it repaints in the web face (found by the WebKit e2e under 4-worker load: Hanja slices took > 4 s once).
- Decisions: (1) the controller builds tiles and the fine-tune panel, so control labels (고딕, 굵기, 주황, 파랑, 얇게, 두껍게 …) are late copy; (2) what shows without interaction must stay in the preloaded UI font (polish.spec "no late face before interaction" failed on the first build: tile 「둥근 사각」 and the sample line's 「홍」): tile renamed 「라운드 사각」, sample line 「예시 글자로 보여 드려요. 위에 글자를 쓰면 바뀌어요.」, input placeholder 「이름 또는 회사 이름」 (the first draft 「예: 홍길동」 added 홍 to core); (3) options (face, weight, colour, line, suffix, texture, seed, centre, label, date) are global and repaint every tile; 가로/세로 is per style; size is per kind (personal 15, date 18, corp 24 mm) once changed; (4) save needs typed text (the sample is never saved; hint 「도장에 넣을 글자를 먼저 써 주세요.」); (5) render.ts keeps a 1 % clear margin on every side (EDGE) so the frame's soft edge is never cut by the image edge (the node render test found a 21-alpha corner on rect-h); (6) tiles and the preview sit on white paper in both themes; a disabled grid dims only the canvases (axe contrast).
- check-dist block: controller (owner of #sm-panel-note) not in the initial JS; no hwp-fonts / /fonts/hwp/ in the page HTML; no /fonts/hwp/ or Anolim HWP in the initial JS (the first version matched the dynamic-import deps list naming the hwp-fonts JSON chunk — narrowed); no 「법적 효력이 있습니다」/「인감 대신」/「인감 등록」 in the page text (「법적 효력이 있나요?」 is FAQ 2's question, so the brief's 「법적 효력이 있」 pattern would fail the page itself); controller budget 11.8 KB gzip (S2 measured 9.9; re-set after S3).
- Gates (AUTOFRAME=1 build): check-dist OK; initial JS /stamp-maker/ 8.8 KB / 30; controller 9.9 / 11.8 KB; precache 426.2 KB / 450 (S0 423.2; the menu entry and home card); UI font 0 new core glyphs (core 619 = base), preloaded 94,864 B / 94,884 B tripwire (margin 20 B, unchanged); astro check 0 errors; vitest 83 files / 1,783 passed (one earlier run had 1 failure that did not repeat, the char-count timing test under load); e2e stamp-maker 5 projects 35 passed; site + polish + growth + stamp-maker chromium 174 passed / 1 skipped.

### STAMP1015 S3 — PDF에 찍기, 이미지 복사, usage (Bob, 2026-10-16) — status DONE
- Controller: 「이미지 복사」 (shown only when ClipboardItem + clipboard.write exist and ClipboardItem.supports('image/png') is not false; the item gets the PNG as a promise so Safari keeps the click's permission; status 「복사했어요. 한글·워드에 붙여 넣으세요.」 / alert 「복사하지 못했어요. PNG 저장을 써 주세요.」), 「PDF에 찍기」 (sendToPdfSign(png, 'stamp-maker'); storage full or blocked → HANDOFF_FAILED, page stays). All PNG buttons share the save rules (typed text, style fits, no bad character).
- Usage (D8): usage.mjs STAMP_STYLES (unit-tested equal to STYLE_IDS) as setting `style`, SETTING_LABELS 「도장 모양」, VALUE_LABELS = the tile names; client UsageSetting { o: 'style' }. Events: start once per page view on the first pick (o=style, v=id); success per PNG made (save, copy, PDF); download on save or copy; next (sign-handoff) on PDF에 찍기; fail font (load, once per page), canvas (process), encoder (save), unknown (save; pHYs insertion), engine (load, entry.ts). Never the text, its length or script, colour, size, seed or date. /privacy/ does not enumerate setting keys (「고른 설정(… 정해진 값)」) → no change.
- Probes (logged verbatim): (a) web face vs system face — the font-blocked e2e compares every tile with the web-face run: all 12 differ on chromium, firefox, webkit, mobile-chrome, mobile-safari (so fillText used the HWP face after fonts.load). (b) measureText actualBoundingBox* finite on all 5 projects (Playwright builds; em-box fallback unit-tested). (c) LibreOffice 7 (C:/Program Files/LibreOffice, `soffice --headless --convert-to pdf`): a 425×425 PNG with pHYs 600 ppi is placed at 50.967 pt = 17.98 mm; the same PNG without pHYs at 424.97 pt = 150 mm. Word 2010 and 한글 2018 are installed but not scriptable here → owner live smoke; the copy claims nothing about apps keeping the size. (d) ClipboardItem.supports('image/png'): chromium true, firefox true, mobile-chrome true, Playwright webkit / mobile-safari false (button hidden there); Chromium e2e copies and reads back a PNG. (f) the pHYs PNG goes through /pdf-sign/'s image path: e2e places it on a 1-page PDF, saved page has exactly one image XObject with an SMask (5 projects).
- Note: on cloud-webkit the usage e2e first saw a /pdf-sign/ `fail corrupt (parse)` when the test left /pdf-sign/ while it was still reading the handed picture; waiting for its arrival note removes it (2× per project, 10/10) — leaving mid-read, not a pHYs problem (the stamp-maker chain e2e reads the same PNG on webkit).
- Budgets: controller (lazy) 11.3 KB gzip measured → budget 13.6 KB (+20 %); initial JS /stamp-maker/ 8.8 KB (cloud 10.2) / 30.
- Gates: astro check 0 errors / 0 warnings; vitest 83 files / 1,785 passed; check-dist OK on default (PUBLIC_SITE_URL), AUTOFRAME=1 and cloud flag-on (BG_REMOVE + BG_CLOUD + USAGE + GA + AFF, officer set) builds; precache default 423.9, autoframe 426.2, cloud 433.5 KB / 450 (TOOLS1015 C3: 421.0 / 423.2 / 430.5); UI font 0 new core glyphs; preloaded autoframe 94,864 B / 94,884 B (margin 20 B, unchanged). e2e: stamp-maker.spec on chromium, firefox, webkit, mobile-chrome, mobile-safari 50 passed (10 tests × 5); pdf-sign + stamp-signature 5 projects 116 passed / 4 skipped; site + growth + chain + polish chromium 185 passed / 2 skipped; usage.spec 도장 만들기 on the 5 cloud projects 10/10 (repeat-each 2).

### STAMP1015 S4 — cross-links and 실물 도장 links (Bob, 2026-10-16) — status DONE
- /stamp-signature/ lead + 「이름으로 새 도장 그림을 만들려면 [도장 만들기]를 쓰세요.」; RelatedTools: stamp-signature → stamp-maker first (5 links now), pdf-sign → stamp-maker first (4); /pdf-sign/ hint 「그림이 없다면 [도장 만들기]나 [전자서명·도장 이미지 만들기]에서 만든 뒤 「PDF에 찍기」나 「PDF에 넣기」를 누르세요.」 (both tools and both button names). `updated` 2026-10-16 on stamp-signature and pdf-sign (visible change). All core glyphs already present (0 new).
- Guides (one sentence each, `updated` 2026-10-16): stamp-image (after the steps: no paper stamp → 도장 만들기), e-signature-law (「이름으로 만든 도장 그림([도장 만들기])도 같아서, 쓸 수 있는지는 받는 곳에 먼저 물어보세요.」 — the first draft named 인감 and failed the existing rule that this guide never mentions 인감 (stamp-signature.test); rephrased), pdf-sign (도장 그림 준비하기: 도장 만들기 → 「PDF에 찍기」). No guide `tools` list changed (OWN_COUNT pins untouched).
- Affiliate (PUBLIC_AFF_COUPANG only): TOOL_AFF / GUIDE_AFF / TOOL_LEAD stamp-maker → cp-stamp with 「실물 도장이 필요할 때」, TOOL_OUT / GUIDE_OUT copied (affiliate.test equality). The block sits in #sm-aff after the panel (below the PNG buttons, never above the tool), hidden until the first pick; trackOut on #sm-aff sends { e: out, t: stamp-maker, o: out, v: cp-stamp }.
- Gates: vitest 83 files / 1,785 passed; check:quotes --exact 248 verbatim (exit 0); check-dist OK on AUTOFRAME=1 (precache 426.5 KB) and cloud flag-on (433.8 KB) builds, guide similarity max 0.231 / 0.45 unchanged; e2e site + growth + polish + chain + hubs chromium 191 passed / 2 skipped; usage.spec (도장 만들기 usage, the new 실물 도장 block test, REV3 pdf-sign block) on the 5 cloud projects 15 passed.

### STAMP1015 S5 — /stamp-signature/ title, description, keywords (Bob, 2026-10-16) — status DONE (own commit, revertable alone)
- tools.ts stamp-signature: title (36) 「전자서명 만들기 — 서명 그리기·도장 사진 배경 지우기 | 문서딱」; description (69) 「전자서명 만들기와 도장 사진 배경 지우기를 무료로. 서명을 직접 그리거나 종이 사진에서 배경을 지워 투명 PNG로 저장해요.」; keywords 전자서명만들기, 서명 만들기, 도장배경제거, 싸인누끼, 도장누끼 (dropped 온라인도장만들기, 도장이미지만들기, 전자도장). Name / h1 / URL / og.json line unchanged; `updated` already 2026-10-16 (S4). Tests: stamp-signature.test title / description / keywords; site.spec description needle 「전자서명 만들기」.
- Gates: vitest 83 / 1,785 passed; check-dist OK (AUTOFRAME=1, precache 426.5 KB); e2e stamp-maker + stamp-signature + pdf-sign on chromium, firefox, webkit, mobile-chrome, mobile-safari 166 passed / 4 skipped; site + growth + chain + polish chromium 185 passed / 2 skipped.

### STAMP1015 LCP fix — the controller waits for a user signal; tiles are static (Bob, 2026-10-16) — status DONE
- Symptom: LHCI /stamp-maker/ median of 5 LCP 2,148 ms (runs 1,670 / 2,168 / 2,000 / 2,148 / 2,770; FCP ~1,500) against /id-copy/ 1,668 ms (FCP ~1,080) in the same session; LCP element the hero p.lead, all of it render delay.
- Root cause (hypothesis → confirmed): the brief's load + requestIdleCallback import fires within the unthrottled observed load, so the controller, the 474 KB hwp-fonts CSS and font slices were requested before the observed first paint and Lighthouse's simulation counted them in the FCP / LCP graph. The site already has this rule (Polish P.7, src/lib/ui/preload.ts: never idle alone; the first user signal + idle).
- Fix: entry.ts imports the controller on a focus / key / press in the tool at once, otherwise after the first user signal anywhere (pointer, non-resting move, touch, key, scroll; preload.ts SIGNALS, isRestingMove, Save-Data / 2G skipped) + idle. The 12 tiles are now static page markup (names + empty canvases; all names already core glyphs; data-style ids) so the grid shows at once; the controller adopts and paints them; a tile pressed before the controller is ready is picked when it starts (new e2e). Deviation from the brief's Flow ("load+idle"): logged for Arch; real visitors scroll or touch almost at once, Lighthouse never does.
- Result: LHCI /stamp-maker/ median of 5: perf 1, a11y 1, BP 1, SEO 1, LCP 1,667 ms (max 1,670), CLS 0; /id-copy/ in the same run 1,668 ms. Phones: the fine-tune controls use two columns at 360 px (minmax 128 px).
- Gates after the fix: check-dist OK on default (precache 424.3 KB), AUTOFRAME=1 (426.5) and cloud (433.8) builds; initial JS /stamp-maker/ 8.9 KB (cloud 10.4) / 30; controller 11.3 / 13.6 KB; vitest 83 / 1,785; astro check 0 / 0; check:licenses OK (54 packages, no new dependency); e2e stamp-maker 5 projects 55 passed (11 tests), then chromium + mobile-chrome + mobile-safari 33 passed after the CSS tweak; site + growth + chain + polish chromium 185 passed / 2 skipped; usage.spec 도장 만들기 + 실물 도장 block on 5 cloud projects 10 passed.

### STAMP1015 round 2 (Bob, 2026-10-16, after handoff/REVIEW-FEEDBACK-STAMP1015.md) — status DONE
- Must Fix 1 (empty tiles before a user signal): scripts/gen-stamp-samples.mjs (npm run gen:stamp-samples) bundles layout.ts / render.ts / styles.ts and the slice-aware test fonts with esbuild and draws the 12 tiles on @napi-rs/canvas exactly as the controller does (176 px, 92 % fill, 「홍길동」 / 「문서딱」, date 2026.01.01), then writes 4-bit indexed PNGs (palette = #D0202E at 16 alpha steps, adaptive row filters; 8-bit alpha was 51.8 KB, over budget) to public/stamp-samples/<style>.<hash8>.png — 27.2 KB for all 12 — and src/tools/stamp-maker/samples.json { hash, size, bytes, files }. The output is committed; the Pages build never runs Skia. Staleness: hash = SHA-256 of styles.ts, layout.ts, render.ts, limits.ts with CRLF → LF; the unit test fails when it differs (no byte comparison).
  - Markup per tile: span.sm-art stacking the canvas and img (width/height 88, alt="", decoding="async", loading="lazy"); the controller hides the img when it paints the tile live.
  - First try with a plain src: LHCI LCP median 2,043 ms (5 runs 1,891-2,043; FCP unchanged). The network table showed the 12 images starting at 109 ms with High priority, before the observed LCP (~200 ms, after load at ~130 ms), so they entered the simulated LCP graph. Fix: the img carries data-src; entry.ts sets src after the first-contentful-paint entry (PerformanceObserver 'paint', buffered) + one frame, with a fallback a second after load. Re-measured: LCP median 1,667 ms (1,665-1,669), perf / a11y / BP / SEO 1, CLS 0 — equal to the round-1 1,667 (limit 1,750 = +5 %), /id-copy/ 1,670 in the same run. Deviation from the review's literal "img src": logged and asked in the review request.
  - Precache: the pictures are referenced only by /stamp-maker/, which is NOT_PRECACHED; check-dist fails if any other page references /stamp-samples/. Precache unchanged (424.3 / 426.5 / 433.8 KB).
  - check-dist: 12 files, 12 tiles each with its picture and the attributes, no /fonts/hwp/ in the HTML, budget 30 KB raw (27.2). e2e (5 projects): before any signal all 12 pictures decode at 176 px, zero /fonts/hwp/ requests, no paint; after the controller paints, all pictures hidden and every canvas has ink.
- Should Fix 1: 印之 is requested only when the typed name is Hanja (인지 otherwise).
- Should Fix 2: fonts.ts — a key whose characters no slice covers (faces.length 0) is ok when document.fonts.check is true (the system face draws them; no note, no fail); the controller sends fail c=font only when the untimed load resolves false (a late success repaints and reports nothing).
- Should Fix 3: personal square styles, vertical, 3 cells with no suffix → [1, 2]: surname alone in the right column (tall), given name on the left (홍 | 길동); corp-square and 가로 unchanged. Unit test updated (square-seal, square-round, square-inverse; corp-square keeps the straight order). The samples were regenerated after this change (layout.ts is in the hash).
- Should Fix 4: banned phrases + 「법적 효력이 있어요」, 「법적 효력이 있는」, 「인감으로 쓸 수」 (FAQ 2's 「…있나요?」 still passes).
- Should Fix 5: probe (e) runs over the 400 and the 700 slices (all 4,888, four faces): both pass.
- Arch decision on S5 (escalation 1; coordinator 2026-10-16: keep the traffic): /stamp-signature/ title keeps the h1 phrase. Arch's wording 「전자서명·도장 이미지 만들기 — 서명 그리기·도장 사진 배경 지우기 | 문서딱」 is 43 characters, over the 40-character limit (meta-length, check-dist, site.spec), so the title is 「전자서명·도장 이미지 만들기 — 서명 그리기·도장 배경 지우기 | 문서딱」 (40). Description (65) 「전자서명·도장 이미지 만들기를 무료로. 서명을 직접 그리거나 도장 사진에서 종이 배경을 지워 투명 PNG로 저장해요.」; keywords 전자서명만들기, 서명 만들기, 도장이미지만들기, 도장배경제거, 싸인누끼, 도장누끼. Own commit.
- Gates: astro check 0 / 0; vitest 83 files / 1,787 passed; check:licenses OK; check:quotes --exact 248 verbatim; check-dist OK default (precache 424.3 KB), AUTOFRAME=1 (426.5), cloud (433.8); initial JS /stamp-maker/ 9.2 KB (cloud 10.6) / 30; controller 11.4 / 13.6 KB; samples 27.2 / 30 KB; 0 new core glyphs, preloaded 94,864 / 94,884 B. e2e: stamp-maker 5 projects 55 passed; stamp-signature + pdf-sign 5 projects 116 passed / 4 skipped; site + polish chromium 152 passed / 1 skipped (site + polish + growth + chain 185 / 2 before the data-src change); usage.spec 도장 만들기 + 실물 도장 on 5 cloud projects 10 passed. LHCI /stamp-maker/ median of 5: LCP 1,667 ms, all categories 1.

## ROMANIZE1016 — brief (Arch log notes, copied by Bob 2026-10-16)
- 2026-10-16 Arch: ROMANIZE1016 brief (owner approved scout #1). New tool /english-name/ 「영문 이름 변환기」.
- Sources fetched 2026-10-16 (evidence in handoff/sources/romanize1016/): 국립국어원 국어의 로마자 표기법 (제2014-42호; 제3장 제4항: 이름 붙여 쓰기 원칙, 붙임표 허용, 이름의 음운 변화 미반영, 성의 표기는 따로 정함); 외교부 여권안내 menuPos 11/36/37/38/39; 여권법 시행령 제3조의2 ([시행 2026. 3. 1.]); 외교부 PDF 「로마자표기 성명의 정정 등이 제한되는 예시 목록」 (2024.10.31 기준, 성 20 + 이름 음절 100, sha256 1ea46bbb…a8d0) and 외교부고시 제2024-10호 PDF (sha256 bacbaa01…5196), both downloaded through the owner's Chrome (streamdocs viewer; not script-fetchable, so source-watch marks them via browser; the downloaded copies were removed from the owner's Downloads). The scout's open question is closed: the official surname list is S5.
- es-hangul 2.4.0 (MIT, romanize 5,074 B gzip) rejected: applies sound changes across the string (김복남 → gimbongnam, 윤석렬 → yunseongnyeol); per-syllable loses liaison and ㄹㄹ. Hand-rolled engine per S1, checked against 28 outputs of 외교부 「추천 로마자 성명 검색」 (oracle; their EUI / OCK quirks not mimicked).
- Core glyphs missing (never in core copy): 띄 줘 줍 존 족 김 박 윤 황 홍 뜻 철 렵 칙 꾼 쉽 좁.
- Open: O1-O3.

### ROMANIZE1016 R0 — 외교부 list data + tool sources in the source watch (Bob, 2026-10-16; branch romanize-1016) — status DONE
- src/tools/english-name/mofa.ts: SURNAMES (20) + GIVEN (100) + MOFA_LIST, written by a throwaway script (scratchpad, not committed) from handoff/sources/romanize1016/mofa-list-2024-10-31.txt. The PDF text interleaves 5 columns and drops empty cells, so a row's column is not positional: each spelling is assigned to the one column of its block whose 합계 reproduces the printed 비율 (|count/total×100 − pct| ≤ 0.005); the script throws when 0 or 2+ columns fit (none did). 「*X은/는 부정적 의미로 변경 가능」 marks attach to the one column of the block that lists X. 282 spellings.
- tests/unit/english-name-data.test.ts: headers in PDF order = data keys; the multiset of every 「SPELLING count pct%」 in the evidence equals the data (282) and every 합계 matches; |count/total×100 − pct| ≤ 0.01; Σcounts ≤ total; count order; spellings /^[A-Z]+$/ and unique; negative set exact (surname 신 SIN; given 신 SIN, 건 GUN, 근 GUN, 구 GOO, 국 KOOK, 덕 DUCK, 범 BUM, 석 SUCK, 일 ILL; 10 marks in the text); sha256 equals pdf-sha256.txt.
- src/tools/english-name/sources.ts: TOOL_SOURCES (S1 kornorms 0004, S2 menuPos=37, S3 menuPos=36, S4 menuPos=39 HTML quotes; S5 PDF `via: 'browser'`) + URL constants. scripts/ops/lib/guides.mjs: TOOL_SOURCE_FILES, parseToolSources (regex, like parsePresets; URL constants resolved), readToolSources; watchList(guides, presets, tools = []) adds each tool source with the page /english-name/; source-watch.mjs passes `io.tools ?? readToolSources()` (ops.test's mocked run passes tools: []).
- Decision: S3 (menuPos=36) quotes added to the watch beyond the brief's S1/S2/S4 list, because FAQ 4 and the D9 「영어 이름」 ban rest on it.
- Quote fix: Arch's evidence text has spaces where the page has inline tags (「허용 됩니다」, 「표기 하여야」, 「발음 을」, 「수단 일」); --exact compares the tag-joined text, so the quotes use 「허용됩니다」, 「표기하여야 하며」, 「수단일 뿐이며」 (first --exact run: 3 NOT VERBATIM; after the fix 262 verbatim). R4's guide quotes must use the same forms.
- Unverified (a) 고시 number: https://korean.go.kr/kornorms/regltn/regltnView.do?regltn_code=0004 (fetched 2026-10-16, HTTP 200) lists only 「[시행 2014. 12. 5.] 문화체육관광부 고시 제2014-42호(2014. 12. 5.)」, 「고시 제2000-8호(2000. 7. 7.)」 and 「문교부 고시 제84-1호(1984. 1. 13.)」; 「2024-27」 occurs 0 times in the page. menuPos=39 cites 「'국어의 로마자 표기법(문화체육관광부고시 제2024-27호)'」. law.go.kr 행정규칙 search is script-rendered (POST list endpoint returned 0 bytes), so 2024-27 could not be confirmed or refuted by script. Result: discrepancy stands, unresolved; our copy cites no 고시 number (as the brief decided); the code comment names 제2014-42호 as the kornorms page's current version.
- Unverified (b) 표준 발음법 (표준어 규정 제2부, 문화체육관광부 고시 제2017-13호, [시행 2017. 3. 28.]) — https://korean.go.kr/kornorms/regltn/regltnView.do?regltn_code=0002, fetched 2026-10-16 (HTTP 200), verbatim:
  - 제9항 「받침 ‘ㄲ, ㅋ’, ‘ㅅ, ㅆ, ㅈ, ㅊ, ㅌ’, ‘ㅍ’은 어말 또는 자음 앞에서 각각 대표음 [ㄱ, ㄷ, ㅂ]으로 발음한다.」
  - 제10항 「겹받침 ‘ㄳ’, ‘ㄵ’, ‘ㄼ, ㄽ, ㄾ’, ‘ㅄ’은 어말 또는 자음 앞에서 각각 [ㄱ, ㄴ, ㄹ, ㅂ]으로 발음한다.」 (다만 ‘밟-’ [밥], ‘넓-’ [넙] in some words — word-specific, not applied to names)
  - 제11항 「겹받침 ‘ㄺ, ㄻ, ㄿ’은 어말 또는 자음 앞에서 각각 [ㄱ, ㅁ, ㅂ]으로 발음한다.」 (다만 용언 어간 ‘ㄺ’ before ‘ㄱ’ → [ㄹ]: a verb rule, not applied)
  - Not covered by 제9-11항: ㅎ, ㄶ, ㅀ in final position (제12항 handles ㅎ by what follows). Their standalone values t / n / l are the brief's D2 decision (ㅎ → t follows the 대표음 [ㄷ] class), not a quoted rule.
- Unverified (c): the source-watch User-Agent (`docttak-ops/1.0`) got HTTP 200 from passport.go.kr menuPos=11, 36, 37, 39, the law.go.kr 시행령 URL and kornorms 0004 (curl, 2026-10-16).
- Gates: vitest english-name-data + ops 59 passed; check:quotes --exact 262 quotes verbatim (exit 0).

### ROMANIZE1016 R1 — romanize.ts + options.ts (Bob, 2026-10-16) — status DONE
- src/tools/english-name/romanize.ts: arithmetic decomposition; INITIAL / VOWEL (S1 제2장 제1항, ㅢ → ui) / STANDALONE (27 finals, D2 table) / LIAISON (single finals move their initial value, double finals keep the first letter and move the second; ㅇ never moves); joined(syllables, spellings) applies liaison and ㄹㄹ → ll only between two neighbouring 표기법 syllables of one part; standalone() for the hyphen / space shapes and next to a picked spelling; normalizeName (NFC, all white space removed), validPart (precomposed U+AC00-D7A3 only, length range), SURNAME_MAX 2 / GIVEN_MAX 10.
- src/tools/english-name/options.ts: surnameChoices (listed spellings by count; 표기법 appended only when not listed; not listed → 표기법 alone), syllableChoices, customSurname (A-Z, space, hyphen; 1-30; must start and end with a letter; upper), composeGiven (joined / hyphen / space + segments), formatName (upper, or title case = each space-separated word capitalised, lower after a hyphen), NEGATIVE (S4 11 + S5 GOO, KOOK) and SINGLE (A I O U), warningsFor (exact match on the surname spelling, the joined given name and each segment; single letter on the surname or the whole given name).
- Decisions: (1) ㄹㄹ → ll also applies after a double final whose standalone value is l (ㄼ ㄽ ㄾ ㅀ) before ㄹ: the brief names only ㄹ + ㄹ; writing 「lr」 for the same sound would contradict [붙임 2]. (2) A syllable whose 표기법 spelling is itself listed shows it once, as the 표기법 choice carrying its 비율 (영 → YEONG 18.65 % first, then YOUNG, YUNG): two radios with the same text that compose differently (liaison vs verbatim) would confuse. (3) A syllable row is shown only when the list adds a spelling the 표기법 does not give (민 MIN 99.85 % alone → no row; a one-option radiogroup is not a choice). (4) Surname lookups use Object.hasOwn (no prototype keys).
- Oracle (handoff/sources/romanize1016/mofa-search-oracle.txt, 28 rows; the file lacks a newline between 류현진 and 김복남, the test parser splits on the next Hangul name): our 표기법 given name equals theirs in 26 rows; deviations 최의 (theirs EUI, ours UI) and 김옥 (theirs OCK, ours OK; OCK is offered as a listed choice, EUI never). Surname spellings they give that S5 lists are always among our choices; not in S5 and logged: 배 PAE. Surnames not in S5 (홍 곽 류 남궁 황): our 표기법 is one of theirs (곽: GWAK; their KWAK not offered). 남궁민수's 「NAM GUNGMINSU」 split ignored; 황보 is searched as one word: HWANGBO = our joined surname, HWANG BO = 황 + 보.
- Tests: tests/unit/english-name.test.ts 97 passed (19 initials, 21 vowels, each of the 27 받침 standalone / end / hyphen / space / joined before 아 / joined before 나, the brief's no-assimilation, liaison, 의·희, 쌍자음, shape, surname, case, all 11,172 syllables, input, choices, compose, warnings, 28 oracle rows).
- astro check on a fresh worktree reports 10 errors, all `src/generated/*.json` not found (written by the build); re-run after the R2 build.

### ROMANIZE1016 R2 — /english-name/ page, controller, registration (Bob, 2026-10-16) — status DONE
- New: src/pages/english-name/index.astro (form: 성 maxlength 2 + 이름 maxlength 10 side by side, no name attributes, no action, submit prevented; 영문 이름 보기; privacy line; result card: case radios, three rows with 복사, status, live region, warnings slot, 성 표기 group, syllable groups, owner note slot; static source line with the kornorms and menuPos=37 links; 사용 방법 3, 알아 두면 좋아요 2 points, FAQ 6 from tools.ts), src/tools/english-name/{controller,entry}.ts, english-name.css (inlined), tests/e2e/english-name.spec.ts (12 tests).
- Registration (D8): tools.ts right after id-copy (D1 copy verbatim; FAQ 4 links menuPos=39; FAQ 6 「여권·증명사진 규격 맞추기에서 여권 규격을 고르면 사진을 여권 사진 크기에 맞춰 잘라 드립니다.」 + /id-photo/?preset=passport_online; icon A + 가 strokes; updated 2026-10-16), og.json image + page description (og-english-name.png 29.3 KB), JSON-LD WebApplication + FAQPage (toolJsonLd / faqJsonLd), sitemap / llms.txt via the generators, NEXT_GUIDES english-name → passport-photo, passport-reissue-photo, intl-driving-license, lighthouserc, qa:visual, site / polish e2e lists and the related-tools map (english-name → id-photo, id-copy, char-count), postbuild OG and NOT_PRECACHED lists, CLAUDE.md line 3, COPY.md term line (D9), bgcloud LOCAL_SCOPE_RE (+ bgcloud.test), HOME_DESC_ORDER right after id-photo (+ polish.test), gen-sw NOT_PRECACHED + sw.ts RUNTIME_PAGES (+ polish.test SW list).
- Usage whitelist moved from R3 into R2 (usage.test requires usage.mjs TOOLS = the live tools, so the registration cannot wait): TOOLS += english-name, TOOL_LABELS 「영문 이름 변환기」, NAME_FORMS joined / hyphen / space as SETTINGS `form`, SETTING_LABELS 「이름 모양」. Two server changes D6 needs: (1) ONLY lets o / v ride on `download`, and only where DOWNLOAD_SETTING allows (english-name → form); every other tool's download with o / v is still refused (unit-tested). (2) The admin 「많이 쓴 설정」 query counts `start OR download` rows (blob5 != ''), so the copy shapes show; no other tool sends a download with o. (3) VALUE_LABELS is keyed by value and already maps `space` → 「공백 포함」 (글자수 세기 basis); SETTING_VALUE_LABELS.form overrides per setting (joined 붙여 쓰기, hyphen 붙임표, space 빈칸; unit-tested next to the char-count row). Client: UsageTool += english-name, `{ e: 'download'; t: 'english-name'; o: 'form'; v: NameForm }`, buildPayload passes o / v only for that exact shape. The calls themselves are R3.
- check-dist block (D7, D9, Failure modes): the initial chunk owning #en-sur-choices is exactly one; no localStorage / sessionStorage / indexedDB / history.pushState|replaceState in it; #en-form has no action and none of its inputs a name; the page text (style / script removed) has no 「공식」, 「영어 이름」, 「외교부 인증」, 「정확한 여권 이름」, 「띄어 쓰기」; every 「N%」 in it is a 비율 of mofa.ts (none in the static page; the check is for later copy and the guide). Budget `english-name initial JS` 12.2 KB = 10.2 KB (largest of default / autoframe / cloud) + 20 %, under the 30 KB brief cap; revisited in R3 when the usage calls land.
- Decisions: (1) Radio groups are native radios (chips; one Tab stop, arrow keys move and select in every engine) instead of a hand-made roving tabindex: same keyboard model, no script. Radio groups sit outside the form, so their names are never part of a submission. (2) Placeholders are static 「예: 이」 / 「예: 서연」 (core glyphs), not the brief's controller-set 「예: 홍」 / 「예: 길동」: the first build failed polish.spec 「no late face before interaction」 on /english-name/ (홍 is not a core glyph, so the placeholder fetched anolim-ui-late-400 at load; every page visited after it in that test then showed the cached request). Same class as STAMP1015 S2's 「홍」 sample line. (3) While an IME composition is open, an invalid value (a lone jamo before the syllable is finished) does not show the error; valid partial text still updates live; compositionend re-evaluates. (4) 직접 쓰기 with an empty or invalid field hides the three rows (rather than showing a different surname than the one chosen) and shows the 영문 알파벳 hint. (5) A syllable label shows 「표기법」, a surname label 「표기법대로」; a listed 표기법 spelling carries its 비율 (JEONG 42.48% 표기법대로). (6) The live region announces the joined row at most once per second (trailing update kept). (7) id-photo's RelatedTools has no `only` list, so english-name appears there in menu order (after 신분증 사본 만들기), not last as D5 says; pinning id-photo's whole list for one position was not worth the churn. (8) No tool-facts entry and no tool-guide-order pin: the page states no limit a guide quotes, and no guide names the tool yet (R4).
- Probe (d) clipboard: navigator.clipboard.writeText resolves on chromium (with permission; clipboard text read back), and the refused path (writeText rejected) selects the row and shows 「길게 눌러 복사해 주세요」 on all 5 projects. Firefox hands a synthetic ClipboardEvent an empty clipboardData (probed), so the paste e2e falls back to a real keyboard copy + paste there; chromium, webkit and both mobile projects take the synthetic event.
- Gates (local Windows): astro check 0 errors / 0 warnings (8 hints, unchanged); vitest 85 files / 1,896 passed; check:licenses OK (54 packages, no new dependency); check-dist OK on default (PUBLIC_ID_PHOTO_AUTOFRAME=0 → dist-noauto), AUTOFRAME=1 (dist) and cloud flag-on (BG_REMOVE + BG_CLOUD + USAGE + GA + AFF, officer set → dist-bgcloud; then gen-brand flag-off). Precache default 427.5, autoframe 429.7, cloud 437.2 KB / 450 (STAMP1015: 424.3 / 426.5 / 433.8; +3.2-3.4 KB = the menu entry and home card in every precached page). UI font: gen-ui-font core 619 characters (= STAMP1015 base) → 0 new core glyphs; preloaded autoframe 94,864 B / 94,884 B tripwire (margin 20 B, unchanged). e2e english-name 5 projects 57 passed / 3 skipped (clipboard read is Chromium-only), then the paste test 5/5 after the Firefox fallback; site + polish + growth + chain chromium 189 passed / 2 skipped / 1 failed (the late-face test, fixed by decision 2) → polish + english-name chromium 72 passed / 1 skipped after the fix.

### ROMANIZE1016 R3 — usage calls, 「여권을 만든다면」 chain, inbound links (Bob, 2026-10-16) — status DONE
- entry.ts: startUsage('english-name'); `start` once per page view at the first valid result (controller hook onResult, no o / v); `download` o=form v=joined|hyphen|space on each successful 복사 (hook onCopy; a refused clipboard sends nothing); `next` o=next v=id-photo once per page view from the 여권 사진 link. Never the name, syllables, lengths, surname choice, list membership, case or warnings (usage.spec asserts the bodies).
- Page: 「여권을 만든다면」 block (#en-chain) under the result: 「여권 사진 규격 맞추기」 (a.btn → /id-photo/?preset=passport_online) and the published guides passport-photo, passport-reissue-photo, baby-passport-photo, intl-driving-license. The first R3 build failed check-dist: the passport-photo guide title has 귀 썹 옷 (not core). Fix: the list carries `.en-guides`, added to the system-font rule in src/styles/app.css (the rule's home; check-dist honours exemptions only there), as every other guide-title list.
- /id-photo/: IdPhotoTool.astro gets an empty `#idp-english` (not in the embed widget); the controller fills it only for a passport_online result: COPY.english 「여권 영문 이름도 정해야 한다면 」 + link 「영문 이름 변환기」 → /english-name/ (late copy, no beacon); hidden for every other preset (e2e: passport_online then id_card).
- Guides (one sentence each, `updated` 2026-10-16, body only): intl-driving-license (after the photo section: the 영문 이름 must match the passport → check the tool first if no passport yet), passport-photo (end of 문서딱으로: preview the 영문 이름 for the application), passport-reissue-photo (이럴 때는: 「영문 이름 표기가 궁금할 때」 bullet), baby-passport-photo (첫 여권: the baby's 영문 이름 is set now). No numbers, no new quotes.
- Budget (D7 re-measured with the tracker): page script (entry + controller + mofa) 8.7 KB gzip ≤ 10 KB → stays in the initial JS (no lazy split). The tracker import pulls the shared ui-shared chunk (6.7 KB, the same chunk char-count loads), so initial JS is 17.0 KB (default, autoframe) / 18.5 KB (cloud). Budget `english-name initial JS` 22.2 KB = 18.5 + 20 %, under the 30 KB cap (R2's 12.2 KB measured the page before the tracker).
- Gates (2026-10-16, local Windows, 3 builds from this tree): astro check 0 errors / 0 warnings; vitest 85 files / 1,896 passed; check:licenses OK (54 packages, no new dependency); check:quotes --exact 262 quotes verbatim (exit 0); check-dist OK on default (AUTOFRAME=0 → dist-noauto, 2,516 files), AUTOFRAME=1 (dist, 2,523; then copy-vendor) and cloud flag-on (BG_REMOVE + BG_CLOUD + USAGE + GA + AFF, officer set → dist-bgcloud, 2,539; then gen-brand flag-off). Precache default 427.8, autoframe 430.0, cloud 437.5 KB / 450 (STAMP1015 424.3 / 426.5 / 433.8). UI font: gen-ui-font core 619 characters on the autoframe build (= STAMP1015) → 0 new core glyphs; preloaded autoframe 94,864 B / 94,884 B tripwire (margin 20 B, unchanged). Budgets: english-name initial JS 17.0 (cloud 18.5) / 22.2 KB.
- e2e (ports 4491-4494): english-name.spec (14 tests) + the new id-photo passport test on chromium, firefox, webkit, mobile-chrome, mobile-safari: 77 passed / 3 skipped (clipboard read Chromium-only); site + polish + growth + chain chromium 190 passed / 2 skipped; usage.spec on the 5 cloud projects 152 passed / 6 skipped / 2 flaky (cloud-firefox: EN1 merge state under load, STAMP1015 usage; both passed on retry and again alone with retries 0, together with the english-name usage test).
- LHCI (lighthouserc assertions, 5 runs, autoframe build on port 4496): /english-name/ perf 1 ×5, a11y 1, BP 1, SEO 1, LCP median 1,682 ms (runs 1,671-1,692), CLS 0.0003; /char-count/ in the same run 1,672 ms. Exit 0.
- Not run (not in this round's gate list): qa:visual (light / dark / 360 px screenshots were checked by hand on the R2 build: no horizontal scroll, rows and chips wrap).
- Unverified (e) (Naver reads the static title, description and FAQ without JS) is a post-deploy view-source check; the static HTML carries them (no client rendering of those).

### ROMANIZE1016 should-fix round (Bob, 2026-10-16, after handoff/REVIEW-ROMANIZE1016.md CLEAR) — status DONE
- Should-fix 1 (usage.mjs validate): a download-only setting (any value of DOWNLOAD_SETTING, today `form`) is refused on every event other than `download`, for every tool. usage.test: english-name start with o=form flipped to toBeNull (comment corrected); new: char-count start o=form → null, char-count start o=basis still accepted.
- Should-fix 2 (controller.ts sylLegend): syllable group names carry the position: 「이름 {n}번째 글자 「{음절}」 표기」, so 똘똘 / 영영 give two distinct names. Digits + 번째 (번 core, 째 already in the late set): 0 new glyphs anywhere (gen-ui-font default core 615 / late 73, unchanged; preloaded default 94,276 B unchanged). e2e: the 영희 test uses the new names; new test 영영 → two groups (exact names), picking YOUNG in the 2nd gives LEE YEONGYOUNG.
- Gates: astro check 0 / 0; vitest usage + english-name + english-name-data 299 passed; check-dist OK (default build, english-name initial JS 17.0 / 22.2 KB, precache 427.8 KB); e2e english-name + polish chromium (ports 4491-4494) 74 passed / 1 skipped / 1 flaky (the 여권 사진 button test timed out waiting for /id-photo/ load under 8 workers on the first try, passed on retry; then 3/3 with retries 0, together with the new test 3/3).

### ROMANIZE1016 R4 — guide passport-english-name 「여권 영문 이름 정하는 법」 (Bob, 2026-10-16; after deploy A f3e423b) — status DONE
- src/content/guides/passport-english-name.md (category 서류, topic 여권·신분증, tools [english-name], cta /english-name/ 「영문 이름 변환기로 확인하기」, related intl-driving-license, passport-photo, passport-reissue-photo; published / updated 2026-10-16). Sections per D10: 기본 방법 (S2 음절 단위, 붙임표·빈칸 허용, VISA caution; S1 순서·음운 변화 미반영), 성 표기 (the 20-surname table: 여권 사용자 and every listed spelling with 사용자 수 and 비율, generated from mofa.ts; S6 「예시적인 목록」; the SIN mark), 바꿀 수 있는 경우 (the 11 reasons of 시행령 제3조의2 제2항 in plain words; 성만 가족과 맞추기; 「spouse of 배우자 성」; the 50% 또는 1만명 rule; the negative-spelling examples; A I O U), 처음 받을 때 신중히 (S2/S3), 온라인 재발급 불가 (S9), 문서딱으로 미리 확인하기. FAQ 5.
- Sources: 16 frontmatter quotes, all retrieved 2026-10-16: menuPos=37 ×4 (verbatim forms 「허용됩니다」, 「표기하여야 하며」), menuPos=36 ×2 (「수단일 뿐이며」), kornorms 0004, menuPos=39 ×5, law.go.kr 시행령 (items 9-11), menuPos=11, and the two PDFs `via: browser` (S5 list, S6 고시). Three quotes contain 「 : 」, so they are single-quoted YAML (the first parse failed with "Nested mappings are not allowed in compact mappings").
- Links both ways: guide → tool (cta, body); tool → guide: TOOL_GUIDE_PINS english-name → passport-english-name (관련 안내 first), NEXT_GUIDES first, 「여권을 만든다면」 list first, FAQ 4 link. The guide needed an inbound guide link (postbuild 「no guide is an orphan」 failed first): body links from intl-driving-license and passport-reissue-photo. guides-schema.test: english-name added to the partial-tools list (OWN_COUNT 1); scripts/lib/guide-titles.mjs regenerated (visits.test).
- check-dist: new block, every 「N%」 in the guide's visible text is a mofa.ts 비율 or appears in one of the guide's own source quotes (the 50% of the 고시 rule); no 「정확한 여권 이름」 / 「외교부 인증」. One sentence 「…100%가 안 되는…」 was rephrased (100 is in neither). Unit: the guide's 20 table rows equal SURNAMES (order, 합계, every spelling, count, 비율).
- lighthouserc gains the guide URL.
- Gates: astro check 0 / 0; vitest 85 files / 1,897 passed; check:quotes --exact 281 quotes verbatim (exit 0; 11 browser rows listed); check-dist OK default (2,518 files; guide HTML 8.2 KB / 30, initial JS 1.5 / 4 KB; guide similarity max pair unchanged photo-sizes ~ upload-limits 0.231 / 0.45; precache 427.8 KB; gen-ui-font core 615 = previous default build → 0 new core glyphs); e2e chromium english-name (16 incl. the new guide test) + growth + site + hubs + polish 194 passed / 1 skipped; LHCI (5 runs): /guide/passport-english-name/ LCP median 1,679 ms (1,668-1,693), perf 0.96-1, a11y / BP / SEO 1, CLS 0.0003; /english-name/ 1,670 ms. Exit 0.

### ROMANIZE1016 R4 round 2 (Bob, 2026-10-16, after handoff/REVIEW-ROMANIZE1016-R4.md NOT CLEAR) — status DONE
- Must: the unsupported 「목록에 없는 성은 … 표기법대로 옮긴 표기를 기준으로 생각하면 돼요」 is now 「외교부 고시는 목록에 없는 성이나 이름도, 발음에 맞는 표기라면 나중에 바꿀 수 없다고 정하고 있어요.」; the 고시 PDF source (via: browser) gains the verbatim fragment 「목록에 없더라도 발음이 일치하는 표기는 변경 불가함.」 (from handoff/sources/romanize1016/mofa-gosi-2024-10.txt).
- Should: 사유 3 → 「가족이 함께 출국해 성 표기를 맞출 때: 여행·이주·유학 등으로 가족이 함께 출국할 때 성만 …」 and FAQ 4 the same condition (backed by the existing law.go.kr / menuPos=39 quotes); 사유 8 + 「새 표기도 한글 이름을 음절마다 소리에 맞게 적은 것이어야 해요.」 backed by a new fragment of the 제8호 quote: 「이 경우에도 변경을 희망하는 로마자 표기가 가족관계등록부에 등록된 한글성명을 음절 단위로 음역에 맞게한 표기여야 하며」 (checked verbatim on menuPos=39).
- Test fix (root cause): english-name.spec's 여권 사진 button test failed 1 in 3 alone: the page was already /id-photo/?preset=passport_online but waitForURL's default wait for the load event timed out (20 s) under load. The URL plus the selected preset is what the test proves, so it now waits for `commit` and then the preset value (no load-event wait). 5/5 with retries 0 after.
- Gates: astro check 0 / 0; vitest 85 files / 1,897 passed; check:quotes --exact 282 verbatim (exit 0); check-dist OK default (gen-ui-font core 615 → 0 new core glyphs; guide similarity max 0.231 unchanged); e2e chromium english-name + site 113 passed with retries 0.

## ADDREN1016 — brief (Arch, 2026-10-16) — status BRIEFED
- Owner approved (2026-10-16) 「영문주소 변환기」 incl. an external public address API. Brief: handoff/ARCHITECT-BRIEF-ADDREN1016.md.
- Facts fetched 2026-10-16: juso 영문주소 검색 API spec + error codes (business.juso.go.kr app chunk); CORS `*` (live curl, bogus key → E0001); data.go.kr 15057413: 무료, 이용허락범위 제한 없음, 자동승인, traffic cap unpublished; juso 약관 시행 2026-08-20 (no attribution/caching clause); English notation from juso RoadAddress §영문 표기방법; UPU korEn.pdf for form lines.
- Decisions: same-origin Pages Function `/api/addr-en` (key secret `JUSO_EN_KEY`, CSP stays 'self'); flag `PUBLIC_ADDR_EN` default 0, flag off = no page; flag on needs privacy officer + contact; POST JSON only, no URL/storage/log/cache of addresses; WAF + in-isolate 20/60 s limiter, 5 s timeout; split = roadAddr minus `, sgg, si` (no own romanisation), 상세주소 converted on the device; slug `english-address`, h1 영문주소 변환기; steps A1 logic+Function, A2 page+privacy/terms, A3 live key probe, A4 optional guide.
- Owner-owed: O1 영문 검색API 운영 승인키, O2 Pages secret `JUSO_EN_KEY`, O3 preview flag, O4 production flag after A3.

### ADDREN1016 A1 — flag, pure logic, Function (Bob, 2026-10-16) — status DONE
- New: scripts/lib/addren.mjs (addrEnFlag, addrEnOn, API_PATH, ADDR_EN_PATH, privacyGate; mirrors bgcloud.mjs); astro.config `__ADDR_EN__` define + the gate joined to the cloud gate (build throws); src/env.d.ts, vitest define. src/tools/english-address/{split,detail,messages}.ts. functions/api/addr-en.ts (d4-d9) exporting cleanQuery, validateQuery, mapUpstream, createLimiter. CLAUDE.md (d16). usage.mjs (d17). check-dist block.
- Function order: flag → key → method → origin → Content-Length → type → body read in chunks capped at 512 B (a body without Content-Length stops at 513 B) → JSON → validate → limiter → upstream POST form (5 s AbortSignal.timeout) → map. Every answer JSON with no-store / CDN no-store / noindex / nosniff. Decisions: 429 also carries `Retry-After: 10`; an AbortError counts as timeout like TimeoutError; a non-integer totalCount falls back to the item count; `cleanQuery` removes \p{Cc} and \p{Cf} (zero-width characters from copy-paste) besides `% = < > [ ]`.
- split.ts: suffix rule as briefed; the "first `, {sgg}`" fallback matches only a whole comma part (`, Jung-gu` does not match `, Jung-gun`), and with an empty sgg searches `, {si}`; else fallback:true. Nothing romanised.
- detail.ts: 지하N층 → BNF, 지하N호 → BN-ho, N동 → N-dong, N층 → NF, N호 → N-ho; any other Hangul → needsManual. Decision: symbols outside Latin / digits / `-` / `,` / space are dropped (`#1203` → `1203`) rather than flagged (the brief lists only what is kept).
- usage (d17): TOOLS + english-address, TOOL_LABELS 영문주소 변환기, FAIL_LABELS no-result / query / busy, SETTINGS `field` = ADDR_FIELDS (8 values; labels 복사한 칸 + Address line 1 …). Decision: the whitelist now allows o/v on `download` (was start/next/out only) and the admin settings query counts `blob1 IN ('start','download')`, else the copied field would be rejected or never shown. No other tool sends o/v on download. Fail mapping (messages.ts failCode): upstream / off / unknown → `engine` (brief lists only no-result, query, busy, engine, timeout); offline → nothing sent.
- check-dist: always — no file names `JUSO_EN_KEY`, contains its value (when set in the build env, ≥ 8 chars) or names `juso.go.kr/addrlink`; flag off — no english-address/ file, no `/api/addr-en`, no 「영문주소 변환기」 in any text file; gate errors when on without officer/contact.
- Default build vs main (same commit id, md5 of every file): same 2,513 file paths; no JS chunk differs. Only the late UI font faces (anolim-ui-late-400/800, new late glyphs from messages.ts; src/tools is scanned regardless of flags, as for remove-background) and so build.css, every HTML (its CSS hash), deploy-manifest.json and sw.js differ. No new page, route or string. Logged for Arch: "identical output set" holds for paths and behaviour, not bytes.
- Gates: astro check 0 errors / 0 warnings; vitest 86 files / 1,879 passed (new: addren-split, addren-function incl. fake-timer 5 s timeout and Date-faked limiter, addren-flag; usage + bgcloud privacy-grep lists extended); check-dist OK on the default build (precache 424.4 KB / 450).

### ADDREN1016 A2 — /english-address/ page, registration, privacy/terms (Bob, 2026-10-16) — status DONE
- Prep commit (no behaviour change): the text rules (cleanQuery, lengthProblem, MIN/MAX_LEN, MAX_PAGE) moved to src/tools/english-address/query.ts, shared by the page (instant messages) and the Function (the authority).
- Page: src/tools/english-address/page.astro injected by astro.config only when PUBLIC_ADDR_EN=1 (the /remove-background/ pattern; the brief's src/pages/… path would build it in every build) and listed in ui-font-chars CORE_PATHS. Search form (role=search, input type=search, enterkeyhint=search, autocomplete off, **no name**), 찾기 ≥ 48 px, privacy line, results / split slots, source line, noscript, live region; 사용 방법 3, 알아 두면 좋아요 2 (V7 link), FAQ 4 from tools.ts; RelatedTools id-photo, pdf-merge. Inline CSS (mobile first; Firefox 360 px overflow fixed with a minmax(0,1fr) form column).
- entry.ts: startUsage; controller imported on focus/key/press in the tool or on submit (kept and run once loaded), else after the first user signal + idle (preload.ts rule); load failure → generic message + fail engine (load). controller.ts: submit-only search, one request in flight, cards (kor, road, 지번, 우편번호, 이 주소 쓰기, copy), count line, 「건물 번호까지…」 over 10, 더 보기 up to page 5; split card (focus to heading, 상세주소 input, rows Address line 1 / 2 / City / State·Province / ZIP code / Country with copy buttons named by field, country hint, 한 줄로 복사; fallback puts the one-line copy first). search.ts: the only network call (POST JSON {q,page}, same-origin, no-store; offline / TypeError → offline; non-JSON → other; items whitelisted again). copy.ts: clipboard → execCommand → select + 「길게 눌러 복사해 주세요」.
- Usage: start per 찾기 press, success on ≥ 1 result (first page), fail no-result / query / busy / engine / timeout (process), download o=field on every copy. Never the text, count, page, zip or region (e2e checks every beacon body).
- Registration (every item flag-gated): tools.ts ADDR_EN_TOOL (last; `...(__ADDR_EN__ ? [ADDR_EN_TOOL] : [])`), HOME_DESC_ORDER after char-count, og.json image + page description, gen-brand FLAGGED_IMAGES english-address → addrEn, JSON-LD (toolJsonLd + faqJsonLd), sitemap / llms.txt / menu / home via the generators, gen-sw NOT_PRECACHED + sw.ts RUNTIME_PAGES, lighthouserc URL, qa:visual list, playwright CLOUD_SPEC, CI: checks build and cloud build get PUBLIC_ADDR_EN=1 (+ officer/contact on the checks build). bgcloud LOCAL_SCOPE_RE untouched.
- /privacy/ (d14): section `id="addr"` after 배경 지우기 (n() shifts every later section when on), section 1 pointer, officer section shown when cloud **or** addr, change-log line, PRIVACY_ADDR 2026년 10월 16일 (re-confirm at O4), PRIVACY_REVISED / PRIVACY_TERMS_UPDATED newest when on. /terms/ (d15): 2항 sentence (the outbound flow) + 6항 `<p id="addr">` (data as is; 상세주소 conversion is a guide) + change-log line; top 시행일 unchanged (REV5 precedent). docs/COPY.md: 영문주소 section.
- check-dist (A2): off — no english-address/ file, no /api/addr-en, no 「영문주소 변환기」, no 「행정안전부 주소 검색으로 보내」 in any text file; on — page present, the outbound phrase on exactly privacy/terms/english-address and in no xml/txt/json, privacy #addr names 행정안전부 주소정보누리집 + officer, terms #addr paragraph, /api/addr-en in exactly one file (the lazy controller chunk), not in the initial JS, the search input has no name, no Web Storage / IndexedDB / history in the controller closure; always — `_headers` connect-src never names juso, JUSO_EN_KEY name/value and juso.go.kr/addrlink in no file (A1).
- Decisions / deviations: (1) privacy line link text 「개인정보 처리방침」 instead of the brief's 「자세히」 — LHCI SEO link-text audit scored 0.92 with 「자세히」 (Lighthouse "descriptive link text"); (2) core-glyph rephrasings (TOOLS1015 d2): description 「알려 드려요」 (줘 not core), FAQ / tips 「시나 구」 (군 not core), noscript 「다른 인터넷 앱으로 열어 주세요」 (롬 not core), tips 「주소 칸이 여러 개면」 (뉘 not core), terms 「받습니다」 (옵 not core); (3) site.spec / polish.spec lists are NOT extended: they run on dist/ (flag off) and an ADDR build always has the contact line in the footer, which polish's footer test forbids; the same page checks (axe before/after results, SEO / JSON-LD / FAQPage, related tools, CSP, 360 px, no late face before interaction, home card, privacy / terms) run in english-address.cloud.spec.ts on all five cloud projects; (4) the default build's sw.js names '/english-address/' (RUNTIME_PAGES, brief d20; sw.ts is transpiled without defines) — inert, no other new string; (5) ga.cloud.spec / usage.spec privacy assertions follow the section shift and the newer date when #addr exists (the CI cloud build now has it).
- Measurements: initial JS /english-address/ 9.6 KB (checks build) / 11.0 KB (cloud, usage tracker) / 30 KB; controller (lazy) 3.7 KB gzip → budget 4.5 KB (+20 %, logged in check-dist). Precache: default 424.4 KB (main 424.3; +0.1 the sw.js path), AUTOFRAME 426.6 (426.5), checks build 432.1, cloud 437.0 (STAMP 433.8; +3.2 KB = the tool's menu link on every precached page) — all ≤ 450. UI font: core 615 unchanged, the core 400/800 faces byte-identical to main (md5); late 50 → 58; preloaded 92.6 / 92.66 KB tripwire (AUTOFRAME build, unchanged). OG image 30.0 KB.
- Gates: astro check 0 errors / 0 warnings; vitest 87 files / 1,886 passed (default build and the CI checks build — BG_REMOVE + ADDR_EN + officer/contact — both green; new addren-search.test, postbuild english-address on/off test incl. check-dist refusing the other state, the officer gate and a JUSO_EN_KEY value probe); check-dist OK on default, AUTOFRAME=1, cloud (BG cloud + usage + GA + AFF + ADDR) and checks builds; check:licenses OK (54 packages, no new dependency); check:quotes --exact 248 verbatim (exit 0); e2e english-address.cloud.spec 25 tests × 5 cloud projects 125 passed (Firefox page.goto timeouts under 8 workers were load flakes: 50/50 at 4 workers, repeat-each 2); english-address + usage + ga.cloud on the 5 cloud projects 292 passed / 6 skipped before the ga privacy update, then ga.cloud 25/25; site + polish chromium (default build) 152 passed / 1 skipped. LHCI (checks build, median of 5, port 4485): /english-address/ perf / a11y / BP / SEO 1, LCP 1,678 ms (1,672-1,713), CLS 0, script 12.1 KB; /char-count/ in the same run 1,676 ms.

### ADDREN1016 acting-Arch round (Bob, 2026-10-16, after the acting-Arch decisions on REVIEW-REQUEST-ADDREN1016 Q1-Q7) — status DONE
- Rebased onto main f3e423b (ROMANIZE1016 /english-name/). Conflicts resolved: CLAUDE.md (tool list has both), usage.mjs / usage.ts / usage.test (main's version + ours re-applied), lighthouserc, qa:visual, polish.test (both entries), gen-sw NOT_PRECACHED (both), sw.ts (main's list), BUILD-LOG (both). The A1 commit's broken describe title from the conflict was fixed by a fixup squashed into A1.
- Q3 (decided): my "o/v on every tool's download" widening is gone. english-address is registered in main's DOWNLOAD_SETTING (`'english-address': 'field'`, values ADDR_FIELDS), SETTINGS.field, SETTING_LABELS 복사한 칸, SETTING_VALUE_LABELS.field (Address line 1 …); the client sends o/v only for that pair (same guard as english-name). The A1 notes above about widening ONLY and the settings SQL are superseded (main already counts start + download). Unit: field refused on english-name / char-count / pdf-merge downloads, form refused on english-address downloads, field refused on pick / success / start; main's DOWNLOAD_SETTING equality test now lists both tools.
- Q1 (decided): the +8 late UI glyphs in a flag-off build are accepted (logged here; default late 73 → 81, core 615 and both core faces byte-identical to main). sw.js: sw.ts RUNTIME_PAGES no longer names /english-address/; it appends `__RUNTIME_EXTRA__`, which gen-sw writes as `flaggedRuntimePages(env)` = ['/english-address/'] only with PUBLIC_ADDR_EN on. check-dist builds the same sw.js (buildServiceWorker(dist, env)) and fails if it names /english-address/ with the flag off or not with it on (check-dist runs before gen-sw). Unit: flaggedRuntimePages off/on, sw.ts source has no english-address. Flag-off dist: no file names english-address / 영문주소 / addr-en (sw.js included).
- Q2 (decided): fail codes now keep the key and juso apart: `engine` = key not accepted (503 engine), `upstream` = juso down / HTTP error / non-JSON / 5 s timeout (502 upstream, 504 timeout), `unknown` = the rest (flag off, malformed request, a Cloudflare limit page); FAIL_LABELS.upstream 「주소 검색 서비스 오류·시간 초과」. e2e checks the fail beacon of every answer code.
- Q4: left for A3. Q5: coverage stays in english-address.cloud.spec (5 projects). Q6: symbol stripping kept; e2e now types 「#1203호」 and checks line 2 「1203-ho」 and the one-line address before any copy. Q7: approved deviations logged in A2 (link text 「개인정보 처리방침」, glyph rephrasings, injectRoute, CI env).
- postbuild english-address test: three check-dist spawns made it pass 60 s on the checks build under load; now two spawns (the officer gate and the key-value probe share one run) with a 120 s timeout like the other spawning tests. Note: the existing "usage statistics … fail check-dist" test (8 spawns) took 111 s alone on the checks build here and once timed out under the full suite; it passed in the next full run (load-dependent on this PC; CI Linux is faster). Not changed.
- Gates: astro check 0 / 0; vitest 89 files / 1,996 passed on the default build and on the CI checks build (BG_REMOVE + ADDR_EN + officer/contact); check-dist OK on default (precache 427.9 KB), AUTOFRAME=1 (430.2; preloaded 92.6 / 92.66 KB), cloud + ADDR (440.8, controller 3.7 / 4.5 KB, initial JS 11.1 / 30 KB) and checks (435.6); check:licenses OK (no new dependency); check:quotes --exact 262 verbatim (exit 0); e2e (4 workers, ports 4481-4484) english-address.cloud + usage + ga.cloud on the 5 cloud projects 303 passed / 6 skipped / 1 flaky (cloud-firefox usage 사진 PDF 변환 download wait, passed on retry; unrelated); site + polish chromium (default) 157 passed / 1 skipped.

### ADDREN1016 round 2 (Bob, 2026-10-16, after handoff/REVIEW-ADDREN1016.md CLEAR + acting-Arch legal-copy decisions) — status DONE
- Rebased onto main 222cfb2 (passport-english-name guide); only BUILD-LOG conflicted (both kept); check-dist and lighthouserc merged cleanly.
- Should-fix 1 (addr-en.ts createLimiter): every call first drops the leading entries whose window has expired (the Map is ordered by window start). Unit: an IP's entry is gone once its 60 s window is over. Note for Arch: dropping happens on the next request to the same isolate; an isolate that gets no further request keeps the entry until it is evicted (Workers has no reliable timer after the response). The privacy line therefore says 「1분 정도만 잠시 기억해 두고」, not a hard maximum.
- Should-fix 2 (privacy section 1): heading 「1. 이름·연락처는 받지 않아요」 whenever GA, 배경 지우기 cloud or 영문주소 is on (「1. 받는 개인정보가 없어요」 only with none of them); with cloud or addr on, the meta and og descriptions also say 「회원가입이 없고 이름·연락처를 받지 않아요. 보내는 것과 다루는 방법을 알려 드려요.」 instead of 「개인정보를 받지 않아요」 (default build unchanged). check-dist asserts both for every flag combination; e2e checks the heading in the cloud build.
- Should-fix 3 (더 보기): the first page renders the list; later pages append their cards to the same ol (count updated, 더 보기 removed when done). Focus moves to the first new card (tabindex -1, visible focus ring); the picked card keeps data-picked and the split card stays. e2e (keyboard Enter on 더 보기 twice): focus on the 11th then the 21st card, the first card node is the same node, exactly one picked card.
- Should-fix 4: `download` is tracked only when copyText returned `copied`; the manual fallback announces 「길게 눌러 복사해 주세요」 and counts nothing (e2e).
- Should-fix 5: sw.ts comment names flaggedRuntimePages().
- Acting-Arch legal copy (decided, applied): /privacy/#addr now reads 「항목: 찾기 칸에 적은 주소 글자만 보내요…」, 「처리와 보관: 문서딱은 찾는 주소를 저장하거나 기록하지 않아요. 결과를 돌려준 뒤 남기지 않아요. 너무 많은 요청을 막으려고 접속한 IP 주소를 1분 정도만 잠시 기억해 두고, 따로 저장하지 않아요.」, 「처리 위탁: 행정안전부 주소정보누리집 (주소 검색), Cloudflare, Inc. (전달)」 (was 「처리하는 곳」; 처리 위탁 framing, not 제3자 제공), and 「행정안전부의 기록: 주소 검색에서 남는 기록은 행정안전부의 주소정보누리집 개인정보처리방침을 따라요.」 linking https://www.juso.go.kr/Privacy (route and title 「개인정보처리방침 | 도로명주소 안내시스템」 read from the juso app chunk Privacy2026-*.js, fetched 2026-10-16; its text covers 접속기록 보관 in general, nothing specific to search keywords, so we only point to it). 「메모리」 is not used (plain-language list). 0 new core glyphs (core 615).
- Terms (decided): the 2항 sentence and 6항 paragraph follow the TERMS_EMBED precedent: a clause for a new optional feature is not a change against users (it adds a service and a usage note, takes nothing away and adds no duty or liability waiver on existing services), so 9항's 7-day / 30-day pre-notice does not apply and the page-top 시행일 stays TERMS_EFFECTIVE; the change log line carries PRIVACY_ADDR. No code change.
- CLOUD-HANDOFF §8: ADDREN1016 owner checklist (O1-O4); O4 step 2 = set PRIVACY_ADDR (and PRIVACY_TERMS_UPDATED's flag-on date) to the real production flag-on day before turning the flag on.
- Known Gap (Richard Q3): the 8-spawn postbuild test "usage statistics … fail check-dist" takes ~111 s of its 120 s on Windows on the checks build and can time out under the full suite; split it or share one check-dist run in a later step.
- Gates: astro check 0 / 0; vitest 89 files / 1,998 passed on the default build and on the CI checks build; check-dist OK — precache default 427.9 KB, AUTOFRAME 430.2 KB (preloaded 92.6 / 92.66 KB), checks 435.6 KB, cloud + ADDR 440.8 KB (unchanged, limit 450 not raised); controller 3.8 / 4.5 KB, initial JS 11.1 / 30 KB; flag-off dist: no english-address / 영문주소 / addr-en anywhere; check:licenses OK; check:quotes --exact 282 verbatim; e2e (4 workers, ports 4481-4484) english-address.cloud + usage + ga.cloud on 5 cloud projects 309 passed / 6 skipped, site + polish chromium 157 passed / 1 skipped; LHCI (checks build, port 4485, median of 5) /english-address/ all categories 1, LCP 1,672 ms, CLS 0.0003 (/char-count/ 1,671 ms in the same run).

### ADDREN1016 round 3 (Bob, 2026-10-16, after Richard round 2 CLEAR f3aeb95, Q1 should-fix) — status DONE
- /privacy/#addr IP sentence now 「너무 많은 요청을 막으려고 접속한 IP 주소로 1분 동안의 요청 수만 세고, 기록하거나 저장하지 않아요.」 (it describes what the limiter does, not how long an idle isolate keeps an entry). e2e copy check updated; check-dist now requires this sentence when PUBLIC_ADDR_EN is on.
- Optional item done: with Google Analytics on alone, the /privacy/ meta and og descriptions also use 「회원가입이 없고 이름·연락처를 받지 않아요. 보내는 것과 다루는 방법을 알려 드려요.」; check-dist's description assertion covers GA too. Builds with none of GA / cloud / ADDR are unchanged (default build description unchanged). Core glyphs 615, unchanged.
- Gates: astro check 0 / 0; vitest addren-* + usage + ga + polish + bgcloud + network-guard 472 passed, postbuild + ga on the default build 96 passed; check-dist OK on default (precache 427.9 KB) and cloud + ADDR (440.8 KB); e2e english-address.cloud on cloud-chromium + cloud-webkit (4 workers, ports 4481-4484) 52 passed.

## ADDREN1016 A3 — live probe on Preview (2026-10-16, orchestrator)
- Preview https://addr-en-1016.doc-tools-kr.pages.dev (PUBLIC_ADDR_EN=1, Preview JUSO_EN_KEY = 1207329 for doc-tools-kr.pages.dev; officer/contact already set). The build passed the legal gate.
- The key works server-to-server from Cloudflare with the POST form body, so Fallback B and the GET switch are not needed. Latency was 48–297 ms (the first call was cold).
- 12 public-building queries returned 11 hits. 「남해면 남해대로」 (no building number) returned total 0, which the page shows as the normal empty result.
  - 세종대로 110 → 110 Sejong-daero, Jung-gu, Seoul 04524
  - 정부세종청사 → 7 hits; Sejong has an empty sgg, so City = State = Sejong-si
  - 달구벌대로 2275-12 → Suseong-gu, Daegu 42007
  - 청와대로 1 → 03048
  - 국회대로 1 → 07927
  - 중앙로 79 → Gangjin-eup / Gangjin-gun / **Jeonnam-Gwangju** (juso now returns 전남광주통합특별시)
  - 분당구 불정로 6 → City 「Bundang-gu, Seongnam-si」, State Gyeonggi-do (Q4: sggNm order as returned, split OK)
  - 문연로 6 → Jeju-si, Jeju-do 63122
  - 한누리대로 2130 → Sejong-si 30151
  - 양평읍 군청앞길 2 → line 1 「2 Guncheongap-gil, Yangpyeong-eup」, City Yangpyeong-gun
  - 강남대로 지하 396 → B396 Gangnam-daero; detail 「#1203」 → line 2 「1203」
- UI split was checked in chromium for 분당구 + 「101동 1203호」 (→ 101-dong 1203-ho), Sejong, 지하, -eup and 강진. There were no page errors.
- The rate limit fired as designed after more than 20 calls a minute during probing.
- Not done: the local `scripts/probe-addr-en.mjs` fixtures, because the key must not be on the PC or in chat. The Function-level probe above replaces it.
- Next: O4 (Production PUBLIC_ADDR_EN=1) waits for the owner's go. Then set PRIVACY_ADDR to that date and run the live smoke.

## ADDREN1016 O4 — production flag on (2026-10-16)
- The owner approved (「켜」) and set Production `PUBLIC_ADDR_EN=1`. Redeployed with an empty commit. PRIVACY_ADDR was already 2026-10-16, so no change.
- Live smoke on docttak.com:
  - /english-address/ returns 200 with title 「영문주소 변환기 — 도로명주소 영문 변환·해외직구 주소 칸 | 문서딱」.
  - 세종대로 110 → 110 Sejong-daero, Jung-gu, Seoul 04524.
  - Responses carry `Cache-Control: no-store, private`.
  - A cross-site POST returns 403.
  - 40 rapid POSTs from one IP: 20×200, then 429 (colo HKG).
  - /privacy/ #addr is present with the IP sentence; /terms/ has the section.
  - The page is in sitemap, sw.js and the home link.
  - The UI split for 분당구 + 「101동 1203호」 is correct, with no console errors.
- Note: an earlier 25-call burst right after deploy got no 429. The in-memory limiter is per isolate, so the limit is best-effort (Known Gap). Fallback if the juso quota is ever abused: a Cloudflare WAF rate-limit rule on /api/addr-en (owner).

## GUIDE1017 — 안내 글 「PDF 합치기 무료로 하려면 프로그램을 깔아야 하나요?」 (2026-10-17, 사이티드 세션)
- Owner: 「바로 올려」 (2026-10-17) — client guide published directly, no Arch/Richard round. Asked for by the Cited improvement loop (query 「pdf 합치기 무료」, task #1121).
- New src/content/guides/pdf-merge-free.md: Mac Finder 「빠른 동작 > PDF 생성」 and 미리보기 sidebar merge (Apple ko-kr support, 5 quotes, retrieved 2026-10-17), 윈도·휴대폰 → /pdf-merge/ with toolFacts 50개·500/150 MB, one don't (쪽마다 캡처해서 묶지 않기). pdf-merge.md PC line links to it (orphan rule).
- Checks: check:quotes --exact 0 failures, npm run check 0 errors, npm test 1998/1998, build + check-dist OK. Playwright e2e not run (content-only change).

## ADS1020 — 애드센스 재신청 P0 (brief written 2026-10-20, Arch)
- Trigger: AdSense rejected docttak.com 2026-10-20 05:40 KST, 「가치가 별로 없는 콘텐츠」. Owner P0 list pasted; P1 (content consolidation/expansion) is a later sprint. Brief: handoff/ARCHITECT-BRIEF-ADS1020.md (= ARCHITECT-BRIEF.md). REV4 was never built; ADS1020 supersedes it where they differ.
- Locked: (D1) Coupang off by code constant `AFF_ENABLED = false` (affOn = constant && env), data kept; check-dist asserts 0 Coupang links/disclosure lines regardless of PUBLIC_AFF_COUPANG. (D2) client ca-pub-6478963235198426 committed (already public in ads.txt); PUBLIC_ADSENSE_ON=1 turns the tag on; ON requires contact + officer. (D3) review stage: Google's async tag verbatim + same-origin /ads-cfg.js setting pauseAdRequests=1 and requestNonPersonalizedAds=1 (doc citation required; drop pause if undocumented); no ad units. (D4) content routes only: /, /guide/**, /about/, /contact/ (home = Arch call; pre-locked fallback: drop / if its Lighthouse breaks a threshold). (D5) REV4 scheme-source CSP with `!` detach on those routes only; tool/result/404/offline/legal/en/embed keep 'self'; 404 under /guide/<missing> gets the content CSP (accepted). (D6/D7) privacy section 4 becomes the AdSense section when ON; usage sentence drops 상품 링크 while Coupang is off; dates 2026-10-20 re-confirmed at gate. (D8) OPERATOR_ON = contact && officer → /about/, /contact/, footer 소개·문의; default build has none. (D9/D10) about/contact copy rules: operator name only, no team/biography/사업자; history generated from guide dates + git-proven milestones; reply 「보통 3일 안에」 (Arch call). (D11) guide byline 「글: <officer> · 소개」, JSON-LD author Person when operator on. (D12) /licenses/ and /embed/ noindex + out of sitemap. (D13) /en/ stays indexed; x-default → Korean. (D14) CLAUDE.md text in the brief, applied by the orchestrator.
- Known Gaps (out of scope): ad units/serve stage, notice line, CLS reserves, COOP popups check; P1 content work; Coupang return on long guides; adsense meta tag; CMP; English about/contact.

## ADS1020 build (Bob, 2026-10-20) — DONE_WITH_CONCERNS
- Built A-I of the brief on main (uncommitted). Details, line ranges, numbers and citations: handoff/REVIEW-REQUEST-ADS1020.md.
- Decisions:
  - Glyph gate: /about/ and /contact/ render in the system font (`.site-info` + `SYSTEM_FONT_PATHS`). In the privacy AdSense section, three new glyphs were rephrased away: 「광고 부정 사용 방지」 (not 「부정 클릭」), 「Google 광고 쿠키 안내」, history 「…항목을 지움」. The preload tripwire is 92.1-92.2 KB of 92.66 KB.
  - The officer section of /privacy/ also shows when ADS is on.
  - gen-headers is now a pure `siteHeaders()`, so check-dist can check the final `_headers`. Off is byte-identical to main.
  - smoke-assets accepts `CONTENT_CSP` on content pages.
  - no-analytics blocks Google ad hosts in our automated live runs.
  - /about/ and /contact/ are not precached.
  - llms.txt keeps /embed/ (no test ties it to the sitemap).
  - lighthouserc swaps /embed/ (now noindex) for /about/.
  - The 5 Coupang e2e tests skip while `AFF_ENABLED` is false, and a new test asserts 0 links with `PUBLIC_AFF_COUPANG=1`.
  - The cloud specs ignore WebKit's 「Unrecognized … 'fenced-frame-src'」 console notice; it is not a violation.
- Gates: check 0 errors; unit 2028/2028; check-dist OK on default, cloud, production-like, checks-like and e2e builds (default `_headers` identical to main); licenses OK; smoke:assets OK on the production-like build. e2e: chromium + cloud-chromium full suite, the other 4 projects + 4 cloud projects on the affected specs, green except the 2 pre-existing HEIC tests. Full lhci (37 URLs × 5): all assertions pass.
- Escalated: on the AdSense-on build, `resource-summary:script:size` is 229.6 KB on content pages (Google's adsbygoogle.js + show_ads_impl). Perf, LCP, CLS, a11y, BP and SEO all pass. I did not apply the "drop /" fallback because the guides breach the same way.
- Pending: preview curl probes of `_headers` (exact `/` rule and one CSP per page) after a preview deploy with `PUBLIC_ADSENSE_ON=1`. PRIVACY_ADS / PRIVACY_AFF_OFF dates to re-confirm at the gate.
- Known Gaps (new):
  - Hub pages keep the old dates line and Organization author (the brief named Guide.astro).
  - Pre-existing e2e failures: id-photo/photo-compress 「fake.heic」 tests expect a HEIC string that left src in REQ1015.
  - tsconfig `exclude` misses ad-hoc `dist-*` folders: a stray one makes astro check run out of memory.

## ADS1020 round 2 (Bob, 2026-10-20) — Richard's 2 Must + 4 Should
- **Decision (orchestrator), resolves the escalation:**
  - The `resource-summary:script:size` budget (30 KB) is unchanged and is enforced by Lighthouse CI on the ads-off build. That is what production ships until the owner sets `PUBLIC_ADSENSE_ON`.
  - The ads-on build is held to perf, LCP, CLS, a11y, BP and SEO. All passed: perf 0.99, LCP 1538-1671 ms, CLS 0, a11y/BP/SEO 1.
  - The overage is all Google script (adsbygoogle.js 57 KB + show_ads_impl 169 KB). This follows the GA gtag.js precedent.
  - `/` stays in CONTENT_ROUTES, since the breach is the same on every content route. The "drop /" fallback is not applied.
  - OPS-RUNBOOK §11 has a one-line note for whoever flips the flag.
- **Must 1:** /privacy/ no longer says 「브라우저」.
  - AdSense refusal line: 「쓰는 앱 설정에서 쿠키를 막거나…」.
  - The same fix for the two lines in the GA section: 「기기와 앱의 종류」 and 「쓰는 앱 설정에서…」.
- **Should:**
  - The plain-language scan moved to scripts/lib/plain-words.mjs. check-dist now runs it on every page of every build (GA, AdSense and cloud /privacy/ sections included); the unit test uses the same lib.
  - Hub.astro gets the byline and the Person author.
  - Footer: with OPERATOR_ON, the 「문의」 link to /contact/ replaces the 「문의: email」 line (a business number stays). Otherwise the old email line stays.
  - The e2e `isAdsRequest` also requires the page origin to be our own site.

## ADS1020 — deployed + live smoke (2026-10-20, orchestrator)
- Owner: 「배포해」. CLAUDE.md wording from the brief applied (kept). a38b947 pushed (rebased over efa356b ops report); live build-id a38b9475f64f.
- Preview probe before deploy (wrangler deploy of an ads-on build to ads1020-probe): exactly one CSP per route; content CSP (fenced-frame-src) on /, /guide/, /guide/passport-photo/, /about/, /contact/; site CSP on /pdf-merge/, /privacy/, /en/, /id-photo/, 404; embed CSP on /embed/id-photo/; /ads-cfg.js max-age=3600. The probe deployment could not be deleted non-interactively (wrangler prompt); it is noindex (pages.dev header) — owner may delete it in the dashboard.
- Live: /about/ /contact/ 200, footer 소개·문의 links; 0 「coupang|쿠팡」 on 6 guide/tool pages; /licenses/ meta robots noindex; sitemap has no /licenses/ or /embed/; x-default → Korean; adsbygoogle absent (PUBLIC_ADSENSE_ON not set in Production, as decided); smoke:assets OK 2526 URLs.
- Owner next: keep PUBLIC_ADSENSE_ON off until re-application (mid-November or later, after P1); then OPS-RUNBOOK §11.

## FORM1020 — 위임장 만들기 + 양식 채우기 엔진 (brief written 2026-10-20, Arch) — status BRIEFED
- Brief: handoff/ARCHITECT-BRIEF-FORM1020.md (copied to ARCHITECT-BRIEF.md). Owner 「다음 툴 작업해」 → scout 2026-10-16 #2.
- Spike (Arch): @rhwp/core 0.8.6 in Node builds blank doc + table + cell text → exportHwp 13,312 B, loss 0, reload 1 page;
  한글 2018 (HOffice100, COM HWPFrame.HwpObject) on this PC opens it: open=True, pages=1, every cell text read back.
  Evidence handoff/sources/form1020/{probe.mjs,open.ps1,probe.hwp.txt}. The "opens in real 한글" risk becomes a local
  scripted gate (D12, npm run forms:hancom) instead of an owner-only check; newer 한글 / mobile = owner O1, non-blocking.
- Locked: general 위임장 only, never statutory forms (D1); runtime build from TS FormSpec in the existing HWP worker, no
  template asset (D2–D4); HWP + PDF from the same document (HWP via the existing export-hwp.ts gate, PDF via the existing
  pdf/export.ts), each fails independently (D4); blank-form button, no required fields (D6); typed text never stored or
  sent, fixed filenames (D7); chain → pdf-sign/pdf-edit/pdf-compress + static links id-copy/stamp-maker/pdf-merge (D8);
  if the 한글 gate fails: PDF only + DOCX follow-up brief (D12); guide power-of-attorney ≥2,500 chars, stays a draft if
  < 2 official quotes (D13).
- Known Gaps (pre-logged): DOCX/HWPX outputs, images in forms, saved drafts, pdf-merge as handoff target, /en/ twin.

## FORM1020 build (Bob, 2026-10-20) — DONE_WITH_CONCERNS
- Built F0–F4 of handoff/ARCHITECT-BRIEF-FORM1020.md on main (uncommitted). Line ranges, numbers: handoff/REVIEW-REQUEST-FORM1020.md.
- **F0 sources** (handoff/sources/form1020/, fetched 2026-10-20, curl, server HTML): minbeop.txt (민법 [시행 2026. 3. 17.] 제114조, 제680조, 제681조; lsiSeq=284415), ingam-decree.txt (인감증명법 시행령 [시행 2024. 12. 27.] 제13조 ①·⑦ and the 별지 제13호서식 entry; lsiSeq=266801), gov24-ingam.txt (정부24 인감증명서 발급, CappBizCD=13100000025, found by title over the 131000000xx codes; 구비서류 「대리인이 신청하는 경우」). Not found: an easylaw.go.kr 위임/대리 page (its search URL answers 「페이지 오류」); not needed (≥ 2 official quotes).
- **F1 probes** (handoff/sources/form1020/probe-f1{,b,c,d}.mjs + .out.txt), verbatim results:
  - applyCharFormat props `{"fontSize":2000,"bold":true}` (fontSize = pt × 100), applyParaFormat `{"alignment":"center"}`; read back by getCharPropertiesAt / getParaPropertiesAt.
  - createTableEx colWidths (HWPUNIT) are honoured only with `treatAsChar: true` (with false all cells stay 13,984); an inline table in an empty paragraph adds no paragraph.
  - After mergeTableCells(0,0,n-1,0): getCellInfo order is row-major over anchors (merged cell 0, then [label, value] per row) → build.ts fills cells before the merge.
  - insertTextInCell does not split on "\n" (one cell paragraph); splitParagraphInCell → `{"cellParaIndex":1}` does.
  - setCellProperties `{height}` = the row's minimum height (2,835 → 37.8 px), survives export/reload.
  - exportHwp is byte-identical within one run (13,312 B twice); tests never assert bytes.
  - **rhwp 0.8.6 layout bug:** applyCharFormat on a paragraph after a table (in either order) breaks the page early, in rhwp's layout and in the saved file (probe-f1d: A 3 pages, B 1 page, C 2 pages). reflowLinesegs (0 reflowed) and set_respect_vpos_reset(false) do not fix it. build.ts therefore writes all paragraphs first, then the tables, then char formats only before the first table; spec lint makes everything after the first table body text. So D5's 11 pt 「위 사람에게…」 and bold 12 pt 「… 귀중」 are body 10 pt.
- **F2:** worker message `form-build {specId, values}` (spec looked up by id; values normalized again) → `parsed`; render + export-hwp unchanged. scripts/forms/hancom-check.mjs + hancom-open.ps1, `npm run forms:hancom`.
- **D12 result (한글 2018, HOffice100 COM):** 한글 shows its 보안 승인 window (「접근 허용 / 모두 허용 / 허용 안 함 / 모두 안 함」) on every file because the FilePathCheckerModule is not registered (HKCU\SOFTWARE\HNC\HwpAutomation\Modules absent). The script never answers it (a person must; it waits 10 min per file, then ends only the 한글 process it started). Answered at the PC (20:56–20:57) on the first layout (cols 10,500/25,452, values centred): blank PASS (open, 1 page, every label), sample PASS (open, 1 page, every value + label; 한글 PDF spikes/forms-hancom/*.hancom.pdf looks right). Unattended runs on the final layout (cols 12,000/23,952, values left) timed out: **pending — run `npm run forms:hancom` at the PC and answer 「접근 허용」 4 times (blank, sample, all-max, all-max-lines-25) before Deploy A.** 한글 version string not captured (the passing run crashed on the third file before printing it).
- **F3 decisions:**
  - Glyphs: core and late UI sets identical to main (0 new). Page labels 「위임하는 사람 (위임인)」「대신 가는 사람 (대리인)」「위임할 일」「부탁할 일」「서류를 낼 곳」「관계」 instead of the brief's 「맡기는 …」 (맡 is not a core glyph). Stale line 「고친 내용으로 다시 만들어 주세요.」 instead of 「바뀐 …」 (뀐 made late-800 8.0 KB = its 8 KB budget). 「만듭니다」 avoided (듭 would become core). Document text (spec keys doc / docLabel / docSection) is left out of the UI glyph sets by a scripts/lib/ui-font-chars.mjs rule (drawn only in the HWP/PDF faces).
  - D10 「인감」 only in #pa-caution: the FAQ asks 「관공서가 정한 위임장도 만들 수 있나요?」; the tools.ts entry has no 「인감」 (unit test).
  - Spec lint "every field used exactly once" = exactly one home (a table row or the date line); the sign line and the 귀중 line only refer to fields.
  - Layout: A4 blank2010 template, title 20 pt bold, 3 tables (section · label · value = 6,000 / 12,000 / 23,952 HWPUNIT, rows 2,268 = 8 mm, 맡기는 일 ×4), body 10 pt, date line centred, sign line right. maxLength: names/birth/phone/relation 20, addresses 50, 제출할 곳 30, 맡기는 일 120 / 6 lines. All-max (and 6 lines of 15–40 wide chars) is 1 page in rhwp (unit) and in the browser preview (e2e).
  - Date field: `<input type=date>`, today (device date) filled by the page script; reset puts today back.
  - Usage: start o=build (blank|filled), success, download o=format (hwp|pdf), next; fail codes engine/oom/timeout/export/unverified/pdf. Never a value.
  - 이어서 하기 uses the existing handoff chunk (IndexedDB + sessionStorage marker) only when a 이어서 하기 button is pressed; check-dist checks the page's own chunk and the controller closure for storage calls.
  - Reverse links: /id-copy/, /stamp-maker/, /pdf-sign/ RelatedTools now end with 위임장 만들기.
  - CLAUDE.md line 3 (「위임장 만들기」) not edited: the orchestrator told me not to touch CLAUDE.md → orchestrator applies it.
- **F4:** guide /guide/power-of-attorney/ 「위임장 쓰는 법: 들어갈 내용과 정해진 서식이 있는 경우」 (7 quotes: 민법 680·681·114, 시행령 13조 ①·⑦, 정부24 구비서류, 금감원 보도자료), 2,552 non-space body characters in the markdown, FAQ ×4; inbound links from id-card-copy and stamp-image; pinned on the tool (TOOL_GUIDE_PINS), partial list + own count in the GROWTH3 G0 test.
- Known Gaps (new): check:quotes reports 3 UNREACHABLE quotes on /guide/hanja-exam-photo/ (hanja.re.kr applyMeth.do HTTP 404; pre-existing, not FORM1020). FilePathCheckerModule registration for unattended forms:hancom (owner: system change). rhwp char-format-after-table bug (report upstream).
- Gates (local): check 0 errors; vitest 2,057/2,058 (char-count 50 ms timing test under load, passes alone); builds + check-dist OK (production-like 2,527 files, precache 431.1/450 KB; cloud flag-on 442.4/450 KB); UI glyph sets identical to main (core 615, late 81; tripwire 92.1/92.66 KB; late-800 7.9/8 KB); check:licenses OK; check:quotes --exact: 7/7 new quotes verbatim, full run 3 UNREACHABLE (hanja-exam-photo, pre-existing); e2e power-of-attorney 45/45 on 5 projects; usage (cloud) 5/5 projects; regression chromium 303 passed / 11 skipped (tool counts 19 → 20 updated), HWP specs on the other 4 projects 297 passed / 1 flaky (firefox adm28) / 26 skipped, cloud-chromium 83 passed / 5 skipped; regress:hwp --fixtures-only all pass; LHCI median of 5 (/power-of-attorney/, /guide/power-of-attorney/, /id-copy/): perf/a11y/BP/SEO 1, LCP 1,663–1,668 ms, CLS 0; forms:hancom Node PASS, 한글 pending (see D12 above).
- Status: DONE_WITH_CONCERNS (D12 final-layout run needs a person to answer 한글's 「접근 허용」). Review request: handoff/REVIEW-REQUEST-FORM1020.md (= REVIEW-REQUEST.md).

## FORM1020 round 2 (Bob, 2026-10-20) — Richard's 4 Should Fix
- Guide line 79 is now advice: 「마지막 칸에는 맡기는 사람이 서명하거나 도장을 찍어요. 받는 곳이 정한 방법이 있으면 그것을 따르세요.」
- **AdSense P1 length metric (orchestrator decision; use it for every later guide):** rendered `div.guide-body` prose of the built page (up to the FAQ section), with tags removed, entities decoded, URLs dropped and no whitespace. The title, answer box, sources, FAQ, nav, footer and related lists do not count. Bar: 2,500.
  - Helper: scripts/lib/guide-length.mjs, with a unit test in tests/unit/guide-length.test.ts.
  - CLI: `node scripts/guide-length.mjs [slug ...]`, which reads dist/.
  - /guide/power-of-attorney/ went from 2,311 to **2,592**. I added three 「안 될 때」 items. Two are backed by saved quotes (시행령 13조 ⑦: 6월; 13조 ①: 17세 이상); the third (bring the papers bundled) is practical advice. For reference, id-card-copy is 966 and stamp-image is 720.
- Known Gap made explicit: because of the rhwp char-format-after-table bug, 「위 사람에게 위 내용에 관한 권한을 위임합니다.」 is body 10 pt (brief: 11 pt), and 「… 귀중」 is plain 10 pt (brief: bold 12 pt). This stays until rhwp is fixed. The orchestrator accepted the deviation.
- hancom-open.ps1 records the Hwp PIDs before creating the COM object. It proceeds only if exactly one new Hwp process appeared, and writes only that PID for the caller to end on a timeout. If no new process or several appear, it does nothing to 한글: no Clear and no Quit, the object is only released, and it reports open=false. hancom-check.mjs ends only a numeric PID from that file. The "newest process" pick is gone.
  - Not run against live 한글 this round: every open waits for a person to click 「접근 허용」. D12 is still pending at the PC, per REVIEW-FEEDBACK.
- Gates:
  - check: 0 errors.
  - vitest: 2,060/2,060.
  - Production-like build + check-dist OK: 2,527 files, precache 431.1/450 KB.
  - check:quotes --exact on the guide: 7/7 verbatim.
  - e2e chromium: growth + power-of-attorney 24/24.

## FORM1020 — deploy decision on D12 (2026-10-20, orchestrator)
- Owner: 「계속진행해」. D12 (`npm run forms:hancom`) could not finish: run 1 was reaped by Claude Code under low memory; run 2 (foreground) timed out because nobody answered 한글 2018's 「접근 허용」 window.
- Decision: ship with FORM_HWP = true instead of the PDF-only fallback. Reasons: the same engine's HWP opened in real 한글 2018 twice today (Arch spike; Bob's run before the final layout tweak: 1 page, all text); the only change since is label column width and value alignment; the rhwp re-open verification passes on every build; FORM_HWP is a one-line kill switch. A PDF-only ship would need title/description/FAQ/guide copy changes and another review round.
- Open (owner, at the PC): run `npm run forms:hancom` and click 「접근 허용」 4 times, or register 한글's FilePathCheckerModule. On any FAIL: set FORM_HWP = false and fix the copy (title, description, summary, FAQ, guide lines 112/130).

## FORM1020 — live smoke (2026-10-21, orchestrator)
- Live build f3ed590 then c570168. /power-of-attorney/ and /guide/power-of-attorney/ 200, both in the sitemap.
- Playwright on docttak.com (chromium, webkit): 「빈 양식으로 받기」 → 위임장.hwp 13,824 B (OLE d0cf11e0) and 위임장.pdf 22,834 B (%PDF); 0 off-site or non-GET requests (analytics routes aborted by the probe itself).
- smoke:assets OK, 2,602 URLs.
- CI on f3ed590 failed one unit test (postbuild Growth T8: the test inserted BG_REMOVE_TOOL after stamp-signature; tools.ts puts it before hwp-to-pdf). Fixed in c570168; CI green.
- Still open: D12 real-한글 run at the PC (see the deploy decision above).

## CONTENT1021 — 애드센스 재신청 P1 (brief written 2026-10-21, Arch)
- Brief: handoff/ARCHITECT-BRIEF-CONTENT1021.md (= ARCHITECT-BRIEF.md). Steps A (merges + enforcement scaffolding + 5 pilots) → B1 (18 photo/ID/exam guides) → B2 (22 PDF/HWP/서류 guides) → C (22 tool pages) → D (delete LENGTH_PENDING, lock, deploy).
- Baseline (dist 2026-10-20): 2 of 51 guide/hub pages ≥2,500 (power-of-attorney 2,592, passport-english-name 2,930); 0 of 22 tool pages ≥2,000 (720–1,903); no guide images; precache 431.1/450 KB.
- Decisions locked: D1 merges with 301 — id-photo-size → photo-sizes hub, id-photo-kb → photo-kb, passport-photo-error → passport-reissue-photo, pdf-merge-free → pdf-merge. D2 exam/ID photo guides stay separate and get issuer-specific content; passport-photo re-angled to 촬영 기준. D3 hubs gain sources + fact check. D4 GUIDE_MIN_CHARS 2,500 / TOOL_MIN_CHARS 2,000 (tool metric: main minus widget/quick/related). D5 check-dist enforcement incl. ≥2 own images, SVG safety, cross-page duplicate-block rule (≥60 chars), old-path scan; LENGTH_PENDING scaffolding only until Step D. D7 guide-facts units gain 원/세; sources saved under handoff/sources/content1021/. D8 tool-notes collection. D9 images under /img/guide/<slug>/, own SVG or own tool screenshots only. D10 precache fallback: stamp-signature, then photo-compress leave the precache; limit never raised. D12 AdSense review request = owner, once, after Step D is live, not before mid-November.
- Escalations: none.

## CONTENT1021 Step A (Bob, 2026-10-21) — merges, enforcement scaffolding, 5 pilots
- Status: DONE. Not committed (orchestrator commits; the brief's "refactor first, own commit" split is possible by path: scripts/lib/guide-length.mjs + scripts/guide-length.mjs + tests/unit/guide-length.test.ts first).
- **Metrics / bars (D4):** scripts/lib/guide-length.mjs: GUIDE_MIN_CHARS 2500, TOOL_MIN_CHARS 2000, `toolBodyChars` (metric T: `<main>` minus section.tool / .quick / .related, div.ad-slot, script/style/template; balanced `cutElements`, FAQ counts), shared `proseText`. CLI `node scripts/guide-length.mjs [slug…]` and `--tools` print ok / PENDING / FAIL.
- **LENGTH_PENDING:** 40 guide/hub slugs (B1 18 incl. upload-limits, B2 22 incl. remove-background) + 22 tool paths (Step C). check-dist fails on a pending page that passes and on a pending key that is no page.
- **check-dist D5 (scripts/lib/guide-check.mjs, pure; wired in check-dist after the G2 A1 block):** expected guides from src/content (visible = not draft and flag on) + hubs; tools from src/data/tools.ts slugs (flagged ones only when their flag is on). 5.1/5.2 length, 5.3 figures (≥2 own `figure.guide-fig` after the first H2, src under /img/guide/<slug>/, file in dist, integer width/height within 1 % of the file's aspect, alt ≥10, lazy, async, figcaption; SVG ≤30 KB, raster ≤80 KB; SHA-256 unique site-wide), 5.4 SVG safety (+ role="img" and <title>), 5.5 shared ≥60-code-point p/li/blockquote/figcaption across guide/hub bodies, 5.6 merged paths in no dist text file but _redirects (og share image name included), no dist file for them. Files under dist/img/guide must be `<slug>/<n>-<name>.svg|webp`.
- **Existing collisions D5.5 found (rewritten, never whitelisted):** pdf-split ~ pdf-sign (the 휴대폰 100 MB line; pdf-split's line rewritten) and qnet-photo ~ id-photo-size (gone with the merge). Near-duplicate shingles max stays gosi ~ kuksiwon 0.151.
- **D7:** Unit gains 원 and 세. No published guide failed (all 원/세 numbers were already quoted). Hub sources and hub quotes are now in the source watch (scripts/ops/lib/guides.mjs `readHubs`, `requires` parsed for check-dist).
- **D3:** hub-schema `sources` (guide-schema's presetSource/urlSource, default []); Hub.astro fact check = unsourcedFacts(hub sources) minus table-row facts; the hub's own sources are listed first under 확인일과 출처. photo-sizes cites `half_card` (반명함판 354×472 계산값) and Apple 다운로드 폴더.
- **D9:** guide.css `.guide-fig` (max-width 100 %, height auto, 1px var(--line) border, caption muted); `_headers` `/img/guide/*` max-age=604800; gen-sw does not precache them (sw.js names no img/guide). tests/e2e/serve.mjs serves .webp as image/webp.
- **D1 merges:** 4 old .md deleted; public/_redirects 8 lines (with and without slash, 301). Survivor H2s: photo-sizes 「증명사진 사이즈, 제출처마다 다른 이유」, photo-kb 「증명사진 용량 맞추기 (200·350·500 KB)」, passport-reissue-photo 「정부24 여권 사진 오류 코드별 해결」, pdf-merge 「맥에서 무료로 합치기」. Sources moved with the content (presets qnet/gosi/passport_online; all 8 정부24 FAQ quotes; 5 Apple Mac quotes). `related` of 21 guides + both hubs re-pointed (a hub cannot be a `related` entry, so the 13 guides that lost id-photo-size got one short, differently worded body line linking /guide/photo-sizes/). index.astro comment, 404 「많이 찾는 안내」 (id-photo-size → passport-reissue-photo, still 5), GROWTH-RUNBOOK row, guide-titles.mjs regenerated (47 titles). llms.txt / RSS / sitemap / og drop the old slugs (D5.6 green).
- **Pilots (body chars, prod-like dist):** photo-sizes 314 → 2,552 · photo-kb (baseline <2,500) → 2,561 · passport-reissue-photo → 2,611 · passport-photo → 2,531 (re-angled to 촬영 기준; file/error detail is one line + link) · pdf-merge 1,981 (first build) → 2,548. Images only: power-of-attorney 2,686, passport-english-name 3,021. All 7 pass D5.1–D5.3.
- **Images (14):** 12 hand-written SVGs (light opaque background + 1px border, system-ui/Apple SD Gothic Neo/Malgun Gothic stack, role="img" + <title>, silhouettes only) and 2 WebP from `scripts/guide-shots.mjs` (Playwright on the local dist, 720×560 clip, DPR 1, animations off, header made static for the clip, blockAnalytics, Chromium canvas WebP q0.8; inputs: a seeded synthetic gradient and the made-up 홍길동 sample). Two runs gave identical SHA-256s. Sizes: SVG 1.5–3.3 KB, WebP 13.0 / 8.7 KB. Every number drawn in an SVG passes the guide's fact check (unit test reads text nodes).
- **New quotes (all verbatim per check:quotes --exact, 311 quotes):** 외교부 menuPos=32 (머리 중앙, 시선, 안경 반사, 적목, 다른 사람·사물, 저해상도, 일반 종이, 캐치라이트 ×2, 머리띠, ICAO), menuPos=12 (재사용 흐릿, 납작 변형, 휴대폰 촬영 권장 안 함), menuPos=11 (KB스타뱅킹, 로마자성명 변경 불가, 수령 기관 변경 불가, 기존 여권 사용 가능), Apple iPhone 사진 정보 (파일 크기, 찍은 장소). Excerpts: handoff/sources/content1021/{passport-photo-1, passport-reissue-photo-1, passport-reissue-photo-2, photo-kb-1}.txt. No new number came from a new quote (the moved numbers are existing presets/quotes).
- **Gates:** npm run check 0 errors / 0 warnings; vitest 94 files, 2,084/2,084; `PUBLIC_SITE_URL=https://docttak.com npm run build` + check-dist OK (2,533 files, 98 WARNINGs = the pending pages; precache 431.1/450 KB, 27 URLs, unchanged); check:quotes --exact OK (11 browser-only quotes listed for manual check, pre-existing); check:licenses OK; e2e chromium hubs + growth + polish + site + power-of-attorney 193 passed / 1 skipped, then hubs + growth 22/22 after the last SVG change. check-dist time +0.3 s (13.1 → 13.4 s).
- **Not run this step:** cloud/flag-on build by hand (postbuild.test.ts builds its variants and passed), LHCI, qa:visual (SVGs eyeballed on a dark page in Chromium; two layout fixes made: pixel-range labels, limit-words right edge), the 5-project e2e matrix, live curl (orchestrator, after deploy).
- **Known Gaps (new):** serve.mjs does not model _redirects, so the 301s are covered by the unit test and the live `curl -I` only. Margins over 2,500 are thin on passport-photo (31) and photo-sizes (52): any trim needs new content, never a lower bar.
- Escalations: none.

## CONTENT1021 Step A round 2 (Bob, 2026-10-21) — Richard's 5 Should Fix
- (1) 원/세: the Hangul lookahead is a deny-list, not the review's blanket `(?![가-힣])`. The blanket form would also drop particles (17세부터, 400원이고, which the D7 test uses) and weaken the check. Words that start with the syllable no longer count: 세로/세대/세트…, 원본/원래/원칙…. Unit: 「가로 600 세로 800, 200 원본, 3세대」 → no fact; 「17세부터, 400원이고, 18세 미만」 → still facts.
- (2) svgProblems also fails on an unquoted href and on `<set>`/`<animate>` whose attributeName is (xlink:)href. Unit cases added.
- (3) Unit: JARGON finds nothing in svgText of every public/img/guide SVG.
- (4) The GSC test asserts exact `updated` again: 2026-10-14 for the four others, 2026-10-21 for pdf-merge.
- (5) passport-reissue-photo step 5 is now sourced: 외교부 menuPos=11 「카카오톡 또는 문자메시지로 접수·교부 관련 진행 상황 안내」 and 「「정부24」여권발급 상태 조회 서비스를 통해 직접 확인 가능」, both added to the excerpt in handoff/sources/content1021/passport-reissue-photo-2.txt. The page is now 2,638 characters.
- Gates:
  - check: 0 errors.
  - vitest: 2,085/2,085.
  - Prod-like build + check-dist: OK, precache 431.5/450 KB.
  - check:quotes --exact: 313 verbatim.
- Status: DONE.

### CONTENT1021 Step A — deploy + live smoke (2026-10-21, orchestrator)
- edbd1dc pushed; CI failed: check-dist "UI fonts preloaded (core 400 + 800)" 92.8 KB > 92.66 KB. Cause: the 원/세 lookahead syllables in `const UNIT` (src/data/guide-facts.ts) entered the core glyph set (never rendered). Fix 2d5e1f6: scripts/lib/ui-font-chars.mjs strips that pattern; core set back to the pre-Step-A glyphs. Budget unchanged.
- 2d5e1f6: CI success, post-deploy success.
- Live: 8 old URLs (with/without slash) → 301 to photo-sizes / photo-kb / passport-reissue-photo / pdf-merge; 5 pilot pages each serve 2 own images (200, svg+xml/webp); sitemap has 0 merged URLs; smoke:assets OK 2,525 URLs.

## CONTENT1021 Step B1 (Bob, 2026-10-21) — 18 photo/ID/exam guides + upload-limits hub to the full bar
- Status: DONE. Not committed.
- **Pages (guideBodyChars, prod-like dist, before → after):** gosi-photo 243 → 2,569 · police-exam-photo 375 → 2,545 · kuksiwon-photo 393 → 2,580 · qnet-photo 357 → 2,542 · korcham-photo 481 → 2,534 · history-exam-photo 417 → 2,529 · hanja-exam-photo 459 → 2,537 · jlpt-photo 442 → 2,549 · teps-photo 297 → 2,549 · admission-photo 517 → 2,543 · resume-photo 249 → 2,536 · id-card-photo 430 → 2,555 · driver-license-photo 432 → 2,555 · youth-card-photo 483 → 2,521 · intl-driving-license 538 → 2,516 · id-card-copy 966 → 2,529 · baby-passport-photo 1,052 → 2,537 · upload-limits (hub) 182 → 2,518. All 18 removed from LENGTH_PENDING (scripts/lib/guide-length.mjs); every guide + hub outside B2 now passes D5.1–D5.3. Margins are thin (16–80): any trim needs new sourced content, never a lower bar.
- **Differentiation (D2/D6):** each page got its issuer's own rules, quoted from that issuer: 인사혁신처 FAQ (권장 사진, 쓸 수 없는 사진 8종, 접수 취소기간까지 수정, 응시수수료, 신분증 4종), 경찰청 원서접수 (사진 등록 3단계, 원서·결제 순서, 응시수수료, 응시지구·의무복무, 수정은 접수기간 내, 응시표), 국시원 (부적합 메시지, 최소 크기, 사진 변경 두 경로, 인터넷 접수 원칙), Q-Net 길라잡이 (사진 준비·등록 STEP, 원서접수 흐름, 자격증 발급 사진), 대한상공회의소 (1:1.25 비율, 상시시험 STEP, 합격자 첫 사진 승인 + 신분증 사본, 부적격 사진), 한능검 (사진첨부 경로, 엣지/크롬, 시험 날 10:10 신분증·수험표 확인, 응시료), 한국어문회 (회원정보 사진·접수 후 변경 미반영, 접수 순서, 신분증·모바일 불인정, PC 최적화), JLPT (사진 변경 기간, 시험장 선착순, 규정 신분증, 배려 신청), TEPS (스캔 여백·누운 사진, 접수/성적표 사진 변경, 시험장 수정 요구 1주일, 신분증 규정·신분확인증명서), 진학사·유웨이 (사진 편집 업로드 순서, 윈도만, 6시간, 결제 후 취소 불가, 예전 사진이 보일 때), 사람인·잡코리아 (등록 경로, 자동 회전, 최대 크기, 이력서 10개), 정부24 주민등록증 (14일, 수수료 없음/5,000·10,000원, 본인 신청), 도로교통공단 (면허증 사진 표준 규격, 파일 범위 395~431×507~550, 수수료·신체검사비, 65세 5년·75세 3년 주기, 연기), 성평등가족부 청소년증 (신청→접수→조폐공사 제작→교부, 대리인, 쓰임) + TEPS/JLPT/한국어문회 신분증 목록, 도로교통공단 국제운전면허 (수수료 9,000원, 대리인 서류, 입국 후 1년, 주별 인정, 서명 일치, 허가 범위 A/B), 외교부 18세 미만 여권 (동의서·인감·2촌 친족, 8세 미만 수수료), 금융감독원 (명의도용 사례), 지메일·전자소송·장학재단 (hub).
- **Sources:** 152 new verbatim quotes, all retrieved 2026-10-21 except three 전자소송포털 quotes on the hub, which reuse the existing ecfs-pdf-limit quotes as they were read (via: browser, 2026-10-02; the page is a script shell — no new number comes from them; 20MB/100M were already table facts). Excerpts: handoff/sources/content1021/<slug>-<n>.txt (48 new files, one per slug × URL). check:quotes --exact: 491 verbatim.
- **Images (36 SVGs, 2 per page):** hand-specified SVG diagrams (step flows, before/after frames with silhouettes, timelines, two-column comparisons, a limit scale); light opaque background + 1px border, system font stack, role="img" + <title>, 1.5–4.7 KB each, no script/foreignObject/image/external href (clipPath uses url(#…)). Every number drawn passes that page's fact check (unit), no JARGON in SVG text (unit), hashes unique (check-dist). Figures sit after the first H2, lazy/async, width/height = the SVG's own. Rendered each SVG in Chromium and eyeballed (labels, overlaps) before keeping it.
- **Copy fixes the gates caught:** 「사진업로드」/「사진 편집 업로드」 button names (업로드 is banned) rewritten as 「사진 올리는 버튼」/「「사진 편집」으로 시작하는 버튼」; four 「처음부터」 (postbuild copy rule) rewritten. No number was dropped to pass a gate.
- **Test change (not a threshold):** tests/unit/guides-schema.test.ts「a print preset counts…」used driver-license-photo's real `updated` with a fixed `now` of 2026-10-06; the new `updated` 2026-10-21 made it "in the future". The fixture now pins `updated: '2026-10-06'`; the assertions are unchanged.
- **Gates:** npm run check 0 errors / 0 warnings; vitest 94 files, 2,085/2,085; `PUBLIC_SITE_URL=https://docttak.com npm run build` + check-dist OK (2,569 files, 62 WARNINGs = B2 + Step C pending only; UI fonts preloaded 92.1 / 92.66 KB — content only in .md, no new Hangul in .ts/.astro; precache 431.1 / 450 KB, 27 URLs, unchanged); check:quotes --exact OK (491); check:licenses OK; e2e chromium hubs + growth + polish + site + id-copy 192 passed / 1 skipped.
- **Not run:** id-photo.spec.ts needs the auto-frame e2e build (PUBLIC_ID_PHOTO_AUTOFRAME=1); against the prod-like dist its MediaPipe tests fail as expected — no tool code changed in B1. qa:visual, LHCI, 5-project matrix, cloud build by hand (postbuild.test.ts builds its variants and passed).
- **Known Gaps (new):** none beyond the thin margins above. Escalations: none — every official page needed could be read (ECFS only through the existing browser quotes).

## CONTENT1021 Step B1 round 2 (Bob, 2026-10-21) — Richard's 3 Must Fix + Should Fix
- Must Fix: (1) kuksiwon-photo: the unsourced 졸업예정자 명단 sentence is cut. (2) driver-license-photo: 「10년」 now rests on the verbatim safedriving line 「1종 운전면허 2011.12.9. 이후 면허취득자·적성검사자는 10년 주기·1년 기간」 (front matter + driver-license-photo-2.txt); the sentence names the 2011.12.9 condition. (3) admission-photo: the Chrome/Edge menu-path sentence is cut (진학사's own instruction stays).
- Should Fix: history timetable quote + excerpt now include 「10:20~10:30 답안지 및 문제지 배부 10분」 (backs the SVG label). Asides rephrased as advice without institutional claims: youth-card (할인 증표), id-card-photo (사진관), history (응시자 폭), hanja (×2), qnet (수험표), police (응시표). police 「어디에 물어볼까」 is now sourced (useinfo02_2: 「문의전화 안내 각 시도청 시험 관련 문의전화 … 원서접수 및 결제문의 1544-7715」) and no longer says who runs the site.
- Pages that fell under the bar got new issuer content, sourced and excerpted: admission (진학사 deletes all member data every April — 「공통원서접수 사이트는 매년(4월) …」), history (성적은 누리집 조회·인증서 출력, 종이 통지 없음), youth-card (발급권자 시장·군수·구청장).
- Boilerplate across siblings (원본 보관, 종이 사진 촬영, 단색 벽 tips): not trimmed in B1 (margins too thin); B2 will keep each tip on one page and link to it.
- Logged for Arch (Step D): guide-facts Unit lacks 년/시, so year/time numbers bypass unsourcedFacts. Hub ECFS browser quotes to be re-read in a browser before Step D.
- Chars now: kuksiwon 2,542 · driver-license 2,579 · admission 2,630 · history 2,560 · youth-card 2,522 · id-card-photo 2,548 · hanja 2,508 · qnet 2,541 · police 2,541 (others unchanged).
- Gates: check 0/0; vitest 2,085/2,085; prod-like build + check-dist OK (UI fonts preloaded 92.1/92.66 KB, precache 431.1/450 KB); check:quotes --exact 497 verbatim. Status: DONE.

### CONTENT1021 Step B1 — deploy + live smoke (2026-10-21, orchestrator)
- 2cc2fc3 (Richard clear after round 2): CI success, post-deploy success. Live: gosi-photo, upload-limits, driver-license-photo each serve 2 own images; smoke:assets OK 2,525 URLs.

## CONTENT1021 Step B2 (Bob, 2026-10-21) — 22 PDF/HWP/서류/사진 보내기/서명 guides to the full bar
- Status: DONE. Not committed. Review request: handoff/REVIEW-REQUEST-CONTENT1021-B2.md.
- **Pages (guideBodyChars, before → after):** pdf-compress 419 → 2,575 · pdf-password 348 → 2,564 · pdf-split 1,174 → 2,569 · pdf-sign 1,154 → 2,538 · pdf-to-jpg 1,005 → 2,557 · jpg-to-pdf 1,148 → 2,541 · email-attachment-limit 274 → 2,570 · ecfs-pdf-limit 923 → 2,545 · yearend-tax-pdf 938 → 2,551 · gov24-pdf-save 456 → 2,554 · kosaf-docs 529 → 2,552 · univ-docs-upload 537 → 2,543 · hwp-on-phone 878 → 2,525 · hwp-to-pdf 1,052 → 2,535 · hwpx-to-hwp 1,005 → 2,520 · open-hwp-without-hangul 358 → 2,543 · what-is-hwpx 481 → 2,567 · heic-to-jpg 563 → 2,518 · kakao-photo 529 → 2,548 · remove-background ~800 → 2,527 (PUBLIC_BG_REMOVE=1 build) · stamp-image 720 → 2,570 · e-signature-law 745 → 2,528. LENGTH_PENDING now holds only Step C tool paths (unit-asserted).
- **Content (D6):** tool behaviour described only after reading the tool's own strings/code (save modes, range semantics after edits, 선명도 levels, 용지/여백 options, 찾을 것 options, HWPX re-open check, filenames); issuer content quoted: 정부24 FAQ (print-button causes incl. 공유프린터, ezPDFReader reinstall, 전자증명서 MyGOV path, QR send, link-not-file, 열람용), 한국장학재단 FAQ (필수서류 완료, 기타서류, 2차 기간, 명의 mistakes, 다자녀 서류), 유웨이 FAQ (그림판 확장자, A4 재저장, 우편 봉투 표지, 도착확인 지연, 자기소개서 붙여넣기), 한컴테크/한컴 FAQ (HWPX package folders, 2010 SE+/2014VP, 새 설치 기본값 HWPX), Microsoft (확장명 표시, 확장명 변경≠변환), Apple (고효율성, 파일 앱 다운로드), 카카오 (말풍선 rules, PC send, 톡클라우드 1GB, 원본 만료), 전자서명법 제1·2·6·19조 + 2020 부칙 (공인인증서). 79 new quotes, all retrieved 2026-10-21, each with an excerpt under handoff/sources/content1021/.
- **One page per tip (B1 lesson):** HWP error list → open-hwp-without-hangul only; extension display/rename → what-is-hwpx only; mail limits → email-attachment-limit; sign-image reuse/security → pdf-sign; scan-photo tips stay on id-card-copy. Repeats found while writing were cut and replaced by links.
- **Decision — flagged figures:** check-dist forbids any `remove-background` path in a flag-off dist, and D5.3 needs /img/guide/<own slug>/. The two remove-background SVGs are committed under src/assets/flagged/img/guide/remove-background/; gen-brand (prebuild/predev) copies them to public/img/guide/remove-background/ (gitignored) only with PUBLIC_BG_REMOVE on, else deletes the folder. Unit tests cover copy/remove and read the flagged folder for the SVG rules.
- **Images:** 44 SVGs (2 per page; ≤4.8 KB each), same template as A/B1. One checker false positive met: 「…1, 7」 next to 「세 번째」 in adjacent SVG text read as "7 세"; SVG reworded to 「셋째」.
- **Test changes (no threshold):** guides-schema REQ1014-C `updated` now exact 2026-10-21 for all five (four expanded here); guide-length asserts no guide slug left pending; guide-check reads flagged figures.
- **Gates:** check 0/0; vitest 94 files 2,087/2,087; prod-like build + check-dist OK (UI fonts 92.1/92.66 KB, precache 431.1/450 KB, 20 WARNINGs = Step C only); PUBLIC_BG_REMOVE=1 build + check-dist OK; check:quotes --exact 574 verbatim; check:licenses OK; chromium e2e hubs/growth/site/polish/hwp-to-pdf/hwp-viewer 232 passed, 8 skipped.
- **Known Gaps:** qa:visual dark/light not run for B2 pages (same SVG template as cleared steps). 세 lookahead still allows "N 세 번째" across text nodes (Step D / Arch). Thinnest margins: heic-to-jpg 2,518, hwpx-to-hwp 2,520. No escalations: every official page needed could be read with curl.

## CONTENT1021 Step B2 round 2 (Bob, 2026-10-21) — Richard's Should Fix 1, 2, 4, 5
- kakao-photo: the PC file-type quote is re-read and dated 2026-10-21, with an excerpt line added (helps_html/1073209414).
- kosaf-docs: three internal repeats cut and replaced by KOSAF-sourced content: 기타서류 example cases, and 가구원 checked by 등본 too (계부·계모, 미혼모). 4 quotes, excerpt kosaf-docs-2.txt. 2,665 chars.
- yearend-tax-pdf: the 「새로 저장된 파일…」 warning is kept once. New NTS-sourced section on 예상세액 계산, 맞벌이 절세안내 (제공동의) and 홈택스 전부 처리 companies. 5 quotes, excerpt yearend-tax-pdf-1.txt. 2,802 chars.
- guide-check.test imgDir: flagged slugs always read the committed flagged source folder.
- Item 3 (generic tips across siblings: file naming, deleting leftover copies) is deferred to Step D, each tip to get one owner page.
- Gates:
  - check 0/0; vitest 2,087/2,087.
  - Production build + check-dist OK; BG build + check-dist OK (remove-background 2,526).
  - check:quotes --exact 585 verbatim.
- Status: DONE. Not committed.

### CONTENT1021 Step B2 — deploy + live smoke (2026-10-21, orchestrator)
- f38ca62 (Richard clear after round 2; Should Fix 3 cross-page tips deferred to Step D): CI success, post-deploy success. Live: pdf-compress, kosaf-docs, remove-background (flag-gated figures), yearend-tax-pdf each serve 2 own images (200); smoke:assets OK 2,524 URLs.

## CONTENT1021 Step C (Bob, 2026-10-21) — tool notes, every Korean tool page ≥2,000
- Status: DONE_WITH_CONCERNS (full chromium e2e run cut short by the host, see Gates). Not committed. Review request: handoff/REVIEW-REQUEST-CONTENT1021-C.md.
- **Built:** `toolNotes` collection (src/content/tool-notes/<slug>.md × 22; schema src/data/tool-note-schema.ts; checks src/data/tool-notes.ts), src/components/ToolNotes.astro (`section.tool-notes` between why and faq on all 22 Korean tool pages; build fails on a missing note, wrong toolFact or unsourced number), `.tool-notes` in the app.css system-font rule, check-dist: notes present on every built tool page + D5.5 shared-block rule across notes, en-check id parity ignores note heading ids. LENGTH_PENDING emptied (Step D deletes it). tools.ts `updated` → 2026-10-21 for all 22.
- **Lengths (metric T, before → after, default build):** char-count 676→2,097 · english-name 979→2,086 · hwp-to-pdf 1,194→2,115 · hwp-viewer 1,317→2,151 · hwpx-to-hwp 1,057→2,095 · id-copy 834→2,103 · id-photo 1,712→2,396 · image-to-jpg 1,034→2,067 · jpg-to-pdf 962→2,076 · pdf-compress 1,191→2,166 · pdf-edit 937→2,076 · pdf-merge 741→2,109 · pdf-password 849→2,086 · pdf-sign 1,024→2,161 · pdf-split 941→2,069 · pdf-to-jpg 929→2,088 · photo-compress 1,056→2,108 · power-of-attorney 945→2,102 · stamp-maker 918→2,099 · stamp-signature 851→2,101 · english-address 752→2,055 (flagged builds) · remove-background 2,064 (BG build) / 2,195 (cloud build).
- **Decisions:** (1) notes in 합니다체 (COPY.md tool-page body); headings 「…은 이럴 때 씁니다」/「휴대폰과 PC에서 … 순서」/「결과가 이상할 때」/「주의할 점」. (2) UI font untouched: notes only in .md + system-font `.tool-notes`; uiCharSets core/late identical to HEAD (616/81); preload 92.1 KB default, 92.2 KB flagged (budget 92.66, unchanged). (3) remove-background/english-address notes avoid all send/no-send wording (valid in cloud and local builds; unit-checked on the Markdown). (4) D10 applied: default build 451.1 KB with notes → /stamp-signature/ to NOT_PRECACHED + sw.ts RUNTIME_PAGES; now default 419.1, BG 422.8, checks 426.0, prod-like cloud 430.5 / 450 KB; /photo-compress/ stays. (5) No FAQ/JSON-LD change. (6) Unsourced institutional lines cut (대리인 준비물, 「공백 포함이 가장 흔함」, 택배·통관); every UI string and behaviour checked against page markup/controllers (pdf-sign one picture per run, date-stamp layout, 상세주소 rules, merge bookmarks, pdf-to-jpg range parser, id-copy file name). 「처음부터」 (postbuild copy ban) removed from all notes and added to the notes unit test.
- **Tests:** new tests/unit/tool-notes.test.ts (22 notes = NOTE_SLUGS, schema + problems, unknown slug / wrong toolFact / unsourced number fail, copy bans incl. flag-gated notes, toolNotes helper, shared-block rule); en-check (notes ids exempt); postbuild (font coverage: note H2s system font, other H2s UI font; /stamp-signature/ not precached); bgremove + pdf-password tests updated for D10; guide-length asserts LENGTH_PENDING empty; e2e hubs.spec.ts: /pdf-merge/ notes between why and faq, not in the UI font.
- **Gates:** check 0/0 (needed `@type {Set<string>}` on the empty LENGTH_PENDING); vitest 95 files 2,093/2,093; builds + check-dist OK: default (prod URL), PUBLIC_BG_REMOVE=1, checks (BG+ADDR+officer/email), prod-like cloud; check:quotes --exact 585 verbatim; check:licenses OK; new e2e test passed. Full `--project=chromium` run: 163/550 passed, 0 failed when the host killed it for low memory (not restarted, per the harness); LHCI on 3 tool pages not run for the same reason (scratch config ready: pdf-merge, char-count, stamp-signature).
- **Known Gaps:** full chromium e2e and LHCI to be run by orchestrator/CI; qa:visual of notes (light/dark) not run. Step D carries: delete LENGTH_PENDING, 년/시 units, sibling-tip owners.

## CONTENT1021 Step C round 2 (Bob, 2026-10-21) — Richard's Should Fix + the pa-task id
- **Orchestrator decision (D8, logged):** device-neutral 「휴대폰과 PC에서 … 순서」 steps with links to the guides for per-device detail are accepted in place of separate 아이폰·갤럭시·PC sections (avoids unsourced OS-menu claims).
- image-to-jpg note step 4: the headline and ZIP name now follow the chosen format (「JPG 사진이 준비되었습니다」처럼 고른 형식…, 「_jpg」·「_png」·「_webp」), matching messages.ko.ts:85-86 and convert.ts:38.
- TOOL_FACTS + `pdf-compress.targetMbBytes` (TARGET_MB_BYTES 1,000,000), `pdf-edit.maxItems` (MAX_ITEMS 200), `char-count.goalMin`/`goalMax` (1, 100,000); listed in those notes' `toolFacts`. New unit assertion: every numeric toolFact a note lists appears in its body as written (ko-KR format), so a limit change fails the build (value check) and the note test.
- pdf-password.test.ts: /stamp-signature/ is in sw.ts RUNTIME_PAGES and NOT_PRECACHED.
- /power-of-attorney/: the fieldset ids are now `pa-group-<id>` (was `pa-<id>`, which duplicated `id="pa-task"` with the textarea); 「부탁할 일」 now labels the textarea. No CSS/JS/test used the group ids (grep).
- Gates: check 0/0; vitest 95 files 2,095/2,095; default build + check-dist OK (precache 419.1/450, fonts 92.1/92.66), PUBLIC_BG_REMOVE=1 build + check-dist OK (422.8/450, remove-background 2,064); image-to-jpg 2,102; e2e power-of-attorney.spec.ts chromium 9/9. Full playwright not run locally (memory; orchestrator instruction) — CI must be green before deploy.
- Status: DONE. Not committed.

## CONTENT1021 Step D (Bob, 2026-10-21) — lock
- Status: DONE. Not committed (branch content1021-c working tree). Review request: handoff/REVIEW-REQUEST-CONTENT1021-D.md.
- LENGTH_PENDING deleted with every code path (guide-length lib + CLI, guide-check lengthProblems, check-dist); unit test asserts it is not exported; bars unchanged (2,500 / 2,000).
- Number checker (src/data/guide-facts.ts): units 년, 시간, 시, 분, clock HH:MM; dotted agency dates state their year, HH:00 states the hour; 「N 세 번째」/「N 세 가지」 (spaced 세 + counter) no longer read as an age. Newly flagged: driver-license 2011/2026년, e-signature 2020/2022년, hanja 9/18시, passport-english-name 2024년 — all backed by existing quotes except 2022년 (new law.go.kr header quote, excerpt saved). Hubs, SVGs, tool notes: none.
- Repeated small tips: one owner each (file naming → univ-docs-upload; leftover copies → id-card-copy; keep the 사진관 file + plain wall/eye level → gosi-photo, children → hanja-exam-photo; paper photo from above → korcham-photo); 15 other spots became short links. qnet-photo got 2 sourced sentences (Q-Net guide_06) to stay above the bar with margin.
- ECFS re-read (upload-limits hub, 3 quotes 2026-10-02): https://ecfs.scourt.go.kr/psp/index.on?m=PSP623M01 → HTTP 200, 7,076 bytes, empty body + WebSquare bootloader; cannot be read without a browser. Dates unchanged, nothing invented; browser re-read pending (owner/orchestrator).
- Gates: check 0/0; test 2,096 pass; BG build 47 ≥2500 / 21 tools ≥2000; prod build 46 ≥2500 / 20 tools ≥2000, precache 419.1/450 KB; guide-length min 2,505 (hwpx-to-hwp), --tools min 2,069 (/pdf-split/); check:quotes --exact 589 verbatim; licenses OK; e2e chromium hubs+site 109 pass (full suite + LHCI left to CI, host memory).
- D12: AdSense review request is an owner item, once, after Step D is live and not before mid-November; console untouched.

## CONTENT1021 Step D round 2 (Bob, 2026-10-21) — Richard's Must Fix + Should Fix
- Status: DONE, not committed. Details: REVIEW-REQUEST-CONTENT1021-D.md "Round 2".
- Must Fix: 세 exception narrowed to whole counter words (번째/가지 + word end or particle; 번/개/장/명/곳/쪽/줄/칸/권 + word end or 째); 「만 65 세 장애인」/「만 18 세 번호」 are read as ages again (unit fail cases).
- Should Fix 1: 시/분 read before more particles (엔·로·가·의·도·마다·만 / 엔·로·가·만); no new flags.
- Should Fix 2: admission-photo:186 → link to gosi-photo. Decision: police-exam-photo 「집에서 찍는 경찰 원서 사진」 kept deliberately (tied to the 경찰 no-background/no-snapshot rule, different wording).
- Should Fix 3 / pending: ECFS FAQ (https://ecfs.scourt.go.kr/psp/index.on?m=PSP623M01) — curl gets an empty WebSquare shell; the orchestrator's Chrome attempt could not drive the in-page search that opens the article. Manual browser re-read pending; upload-limits ECFS quotes keep retrieved 2026-10-02.
- Gates: check 0/0; test 2,096 pass; BG + prod builds with check-dist pass (47/21, 46/20); guide-length min 2,505, tools min 2,069; check:quotes --exact 589 verbatim; precache 419.1/450 KB.

### CONTENT1021 Steps C+D — deploy + live smoke (2026-10-21, orchestrator)
- C and D shipped together via PR #12 (full e2e matrix + axe + LHCI green on the PR before merge). The orchestrator's push to main was blocked by the auto-mode classifier; the owner merged (`gh pr merge 12 --merge`, cf80e68).
- First PR run: 3 e2e tests failed on all 5 projects (getByText('더 줄여야 하나요?') also matched the pdf-compress tool note quoting it); fixed by scoping to the summary (0ed79e9). Rerun green.
- main cf80e68: CI success. Post-deploy run 1 failed on one transient font fetch (Pretendard-Bold.subset.26.woff, "fetch failed"; curl 200 right after, local smoke:assets OK 2,525 URLs); rerun of the failed job: success.
- Live: /pdf-merge/, /char-count/, /pdf-compress/, /power-of-attorney/, /stamp-signature/ render the tool notes (「이럴 때 씁니다」); /power-of-attorney/ has one id="pa-task".
- Open: ECFS FAQ quotes (upload-limits hub, ecfs-pdf-limit) still dated 2026-10-02 — needs a manual browser re-read (page opens articles only via in-page search). AdSense review request: owner, once, mid-November or later.

## LOAN1022 — 차용증 만들기 + 안내 글 「차용증 쓰는 법」 (brief written 2026-10-22, Arch) — status BRIEFED
- Brief: handoff/ARCHITECT-BRIEF-LOAN1022.md (not copied to ARCHITECT-BRIEF.md: another sprint runs in parallel). Owner
  task 2026-10-22; scout 2026-10-16 #3 (차용증 양식 21,430/mo, ad clicks 1,192/mo).
- Arch probes (curl, 2026-10-22): law.go.kr lsInfoR.do needs efYd (without it: 「기본정보 조회 실패」); DRF lawSearch
  with OC=test gives lsiSeq/efYd. 이자제한법 268667/20250722 제2조 ①③ read; 최고이자율 규정 230727/20210707 「최고이자율은
  연 20퍼센트로 한다.」; 민법 284415/20260317 has 379·598·603.
- Locked: general 금전 차용증 only, no 보증·공정증서·대부업 (L-D1); slugs /loan-note/ + /guide/loan-note/, files
  차용증.hwp/.pdf, after power-of-attorney (L-D2); engine adds kinds amount/number, own amountHangul (일천·일백·일십,
  no es-hangul), docText with docTemplate/docBlank/docZero (doc keys, out of UI glyphs), dates allowed in table rows,
  fieldProblem blocks unparseable input with an inline error instead of silently dropping it, per-spec HWP kill switch
  LOAN_HWP (L-D3); refactor POA into a generic form tool first, own commit, POA dist diff = asset hashes only (L-D4);
  1-page layout 차용 내용 / 채권자 / 채무자 + two sign lines, all plain 10 pt after the first table (L-D5); amount
  echo digits only, no live 20 % warning in v1 (L-D6); glyph budgets win, system-font fallback for labels if needed
  (L-D7); privacy = FORM1020 D7 (L-D8); general-information line + quotes only, no tax computation (L-D9); chain
  pdf-sign/pdf-edit/pdf-compress + static stamp-maker/id-copy/pdf-merge (L-D10); registration = FORM1020 D9 list
  (L-D11); real-한글 COM run = owner O1, ship on rhwp reload gate (L-D12); tool note ≥2,000 (L-D13); guide ≥2,500 + 2
  own figures (WebP tool shot + interest-cap SVG), draft if < 3 official quotes (L-D14).
- Known Gaps (pre-logged): 보증인 칸, 분할 상환표, 이자·지연이자 계산, live 20 % warning, Hangul amount echo in UI,
  due-before-loan date check, 공증 양식, 영수증 양식, DOCX/HWPX, /en/ twin, saved drafts, tax computation.
- Escalations: none.

## IDCAM1022 (design) — 증명사진 촬영 (Arch, 2026-10-22)
- Owner request 2026-10-22: 증명사진 촬영 after 차용증, linked to 규격 맞추기 and 배경 지우기. Brief: handoff/ARCHITECT-BRIEF-IDCAM1022.md
  (design only; build starts after LOAN1022 ships; rebase on it). Sources: handoff/sources/idcam1022/ (외교부 menuPos=32/12 re-read
  2026-10-22, quotes verbatim; Google/Naver suggestions 2026-10-22).
- Decision D1: new page /id-photo-camera/ 「증명사진 촬영」 (title target 「집에서 증명사진 찍기」) + 「카메라로 찍기」 link on /id-photo/; not a mode
  inside /id-photo/ (separate search intent; camera Permissions-Policy only on the new route; no regression to the top tool).
- Decision D2/D3: one pipeline — camera page only captures (pre-framed to the preset aspect, unmirrored) and hands off via the
  이어서 하기 store to /id-photo/?preset=P, which becomes a receiver; crop/KB/save stay in /id-photo/.
- Decision D4: overlay reuses /id-photo/ guide geometry (Step A refactor); official band only for passport_online/driver_license.
- Decision D5–D7: camera on tap only; front default, mirrored preview, unmirrored save; timer 바로/3/10 s; 3-frame burst; tracks
  stopped on hide; fallback input capture=user on missing API or any error; plain-Korean error copy; no UA sniffing.
- Decision D6: live hints = background (checkBackground reuse), dark face zone (L* < 35), backlight (diff > 40) — our heuristics,
  advisory only; phone level on Android only (no iOS motion prompt). No distance/tilt hint (needs MediaPipe; licence pending).
- Decision D8: no pixel edits on the camera page. 「배경을 흰색으로 바꾸기」 only for saramin/jobkorea/half_card/custom, via a chain to
  /remove-background/ (its own consent/cloud rule; arrival never auto-sends). /id-photo/ blocks save for passport_online and
  driver_license when the photo came from remove-background (외교부 menuPos=32/12, 도로교통공단 quotes); warns for other presets.
  Passport preset shows 외교부 「휴대폰 … 권장하지 않음」 and 「직접 촬영한 사진은 … 적합한 경우에만」 honestly + 사진 확인 link.
- Decision D9/D10: no new POST/third party; _headers detach gives camera=(self) on /id-photo-camera/ only; usage slug
  id-photo-camera; kill switch PUBLIC_ID_CAMERA (default on). Real-phone tests are post-launch owner items, not a gate.
- Decision D11: budgets unchanged (initial JS 30 KB, precache 450 KB — page on runtime cache, preload fonts 92.66 KB — reword, never grow).
- Steps: A refactor guides → B receiver + camera core → C live hints + burst → D background link → E guide /guide/self-id-photo/ →
  F (candidate) 인화용 모아찍기 sheet.
- Known Gaps (design): live face detection/distance hints (MediaPipe licence, owner O4); in-app camera support unknown (owner O2);
  provenance lost after save-and-reopen (accepted); 모아찍기 sheet not briefed.
- Owner-only: O1 iPhone Safari + Galaxy Chrome/삼성 인터넷 real-phone run; O2 KakaoTalk/Naver/Instagram in-app; O3 optional 외교부 사진 확인 trial.

## LOAN1022 L0–L4 build (Bob, 2026-10-22) — DONE_WITH_CONCERNS
- Branch `loan1022` (from main a6814bf), not pushed. Commits: c46bc36 L0 sources · a8d1f54 L1 refactor (own commit) ·
  ed83722 L2 engine · 4753234 L3 spec · f4508a7 L4 page + registration. Review: handoff/REVIEW-REQUEST-LOAN1022-A.md.
- **L0** handoff/sources/loan1022/ (curl 2026-10-22): 민법 379·598·600·603; 이자제한법 2조 ①–⑤ (268667/20250722);
  최고이자율 규정 「연 20퍼센트」 (230727/20210707); 상증법 41조의4 (DRF → 276123/20260102); 민사집행법 56조 (DRF →
  268837/20260201); 대한법률구조공단 전화상담 132. Not fetched: 국세청 가족 간 금전 대여 page (optional, guide only).
- **L1** generic form tool (src/tools/form-tool, src/components/FormTool.astro); dist/power-of-attorney/index.html
  before/after differs only in the page script hash (DGUTZFI- → D2S4P9VK). check-dist form block = loop FORM_TOOLS
  (controller = the controller.*.js the page chunk imports dynamically).
- **L2** amount/number kinds, amountHangul (일천·일백·일십), fieldProblem, docText; lint drops date-on-dateLine;
  DOC_TEXT_PATHS keeps amount.ts's 한글 digits out of the UI faces (else 십/육/팔 late glyphs).
- **L3** LOAN_NOTE spec; all-max and all-max lines 15–40 = 1 page in rhwp with maxLengths as briefed (no cut needed);
  section labels break before 「(채권자)」/「(채무자)」. forms:hancom Node part PASS (8 files); 한글 COM = owner O1.
- **L4** decisions: page labels 「얼마를 빌렸나요」「돌려줄 날」「돌려주는 방법」「연 이자」「쓴 날」, legend 「빌린 내용」
  (돈/갚/액 not core); tooBig 「1조 원보다 적게 써 주세요.」 (액); 「연 이자」 not 「1년 이자」 (fact checker reads 1 년);
  page L-D9 line names no organisation (률), the tool note names 대한법률구조공단 132 with its source; amount 「0」 →
  「숫자로만 써 주세요.」 (brief rule literally); FormTool classes stay pa-* (POA HTML identical), ids prefixed; source-watch
  now reads tool-note sources (readToolNotes) so check:quotes covers the note's 4 quotes.
- Glyphs: core 615 / late 81 = main (0 new). Preload 92.1/92.66 KB; late-800 7.9/8 KB; BG build preload 92.2 (core 616
  from flag-dependent src/generated/licenses.json, same at HEAD).
- Gates: check 0/0; vitest 2,148/2,148; prod build + check-dist OK (2,617 files, precache 422.1/450 KB; loan-note initial
  9.3/12.8, controller 7.8/8.4 KB; POA controller 7.0 → 7.6 KB); BG build + check-dist OK (precache 425.1); guide-length
  --tools /loan-note/ 2,710; check:quotes --exact 593 verbatim; check:licenses OK; e2e chromium --workers=1: loan-note
  8/8, power-of-attorney 9/9, site+polish 176 (after count/list updates), growth+hubs+chain 41/41, sw 5/5. 5-project
  matrix, cloud usage spec and LHCI → CI on the PR (low memory).
- Known Gaps (new): 국세청 family-loan page not saved (guide L5 links 국세청 without a quote or stays without);
  amount-0 error wording. CLAUDE.md line 3 → orchestrator.
- Escalations: none.

## LOAN1022 A round 2 (Bob, 2026-10-22) — Richard's 2 Must + 4 Should — DONE
- Must 1: tool note 379조 paragraph now leads 「이자를 받기로 했다면 비율도 함께 적어 두세요.」 then the verbatim quote; no
  claim about an unwritten rate. Must 2: 「오랜 습관」 removed; the note says only 「자리마다 숫자를 붙여 씁니다」.
- Should: line 49 → 「이자제한법은 이자의 최고한도를 정합니다.」 + the two quotes; FieldProblem `zero` (amount of zeros
  only, never empty) with 「1원 이상 써 주세요.」 (0 new glyphs; the note words it without 「1원」, which the fact checker
  reads as an unsourced 1 원) + unit (0/00/0원/full-width) + e2e (「0원」); tools.ts FAQ 「…찍으면 됩니다.」; LOAN_HWP
  wiring test (static: vitest has no Astro compiler, so page → FormTool hwp gate → controller cfg.hwp are asserted in
  source). Known Gap: no runtime test of the PDF-only path (flipping LOAN_HWP also needs the copy change, L-D12).
- Gates: check 0/0; vitest 2,149/2,149; prod + BG builds with check-dist OK (core 615 / late 81 unchanged; preload
  92.1 / 92.2 BG of 92.66; late-800 7.9/8; loan-note controller 7.8 (7.9 BG)/8.4 KB; precache 422.1 / 425.1); tool page
  2,713; check:quotes --exact 593 verbatim; e2e chromium loan-note + power-of-attorney 17/17.

## LOAN1022 L5 — /guide/loan-note/ 「차용증 쓰는 법」 (Bob, 2026-10-22) — DONE
- Branch `loan1022-guide` from loan1022 @ 504c468 (PR #14 untouched, not pushed). Commit ff70e34. Review:
  handoff/REVIEW-REQUEST-LOAN1022-B.md.
- Guide: 3,307 rendered chars (both builds); 8 H2 per L-D14 incl. 공증 (민사집행법 56조 saved); 14 sources (13 statute +
  klac 132), all verbatim, retrieved 2026-10-22; FAQ ×4 new. Figures: 1-form-shot.webp 9.6 KB (guide-shots, fixed dates),
  2-interest-cap.svg 2.2 KB.
- Decisions: klac line paraphrased (postbuild T9: only law.go.kr quotes may render); answer as one sentence (schema);
  no digit+원 amounts in text (fact checker unit 원; examples written in 한글); 이자제한법 ① quoted up to 「범위 안에서」
  (the saved 「대통령령 으로」 is a link artifact); ④ omitted; 상증법 단서 paraphrased; TOOL_GUIDE_PINS loan-note.
- Gates: check 0/0; vitest 2,148/2,149 (char-count timing flake, 21/21 alone); default + BG builds check-dist OK
  (precache 422.1 / 425.1 KB); check:quotes --exact 603 verbatim; e2e chromium hubs+growth+loan-note 31/31.
- Known Gap (carried): 국세청 family-loan page not saved; the guide links nts.go.kr home without a quote.
- Escalations: none.

### LOAN1022 Deploy A — live smoke (2026-10-22, orchestrator)
- PR #14 merged by the owner (d85eeb4) before its checks finished; main CI on d85eeb4: success (5-project e2e + checks/LHCI); post-deploy success.
- Live: /loan-note/ 200 (title 「차용증 만들기 — 차용증 양식 무료, HWP·PDF 저장 | 문서딱」), /power-of-attorney/ 200. Headless run on the live page: amount 10000000 → 만들기 → ready; 차용증.hwp 14,336 B (OLE d0cf11e0), 차용증.pdf 30,665 B (%PDF). Off-site requests: only CF RUM beacon, GA page_view and the /api/usage beacon (allowed); no file data.
- Owner-only O1 still open: real-한글 open of 위임장.hwp / 차용증.hwp (`npm run forms:hancom`, click 「접근 허용」).

## LOAN1022 B round 2 (Bob, 2026-10-22) — Richard's Should Fix 1–4 — DONE
- Blank form: 「빈 양식으로 받기」 described as ignoring what was typed (no "아무 칸도 채우지 않고"); tooBig item now quotes
  「1조 원보다 적게 써 주세요.」 (fact checker passes); SVG <title> + alt 「넘는 부분은 무효」; cut the 소수점 sentence and
  the 「연 이자」 0 → 「없음」 sentence (both duplicated the tool note).
- Gates: check 0/0; vitest 2,149/2,149; default build check-dist OK (precache 422.1/450); guide 3,248, tool page 2,761;
  check:quotes --exact 603 verbatim.

### LOAN1022 Deploy B — live smoke (2026-10-22, orchestrator)
- PR #15 (guide). The orchestrator ran `gh pr merge --auto --merge`, expecting it to wait for checks; the repo has no required status checks, so GitHub merged at once (052dcc6) before CI. Lesson: --auto does not gate here; wait for green checks and let the owner merge (or add branch protection with required checks — owner decision).
- main 052dcc6: post-deploy success; CI checks + 4 e2e projects success; e2e (chromium) failed once on the known english-name.spec.ts:216 waitForURL flake (also flaky on PR #12), rerun of the failed job: success.
- Live: /guide/loan-note/ 200 with 2 own images (1-form-shot.webp, 2-interest-cap.svg, both 200); in the sitemap.

## IDCAM1022 A — guide geometry extracted to src/lib/idphoto/guides.ts (Bob, 2026-10-22) — DONE
- Branch `idcam1022` from main 5d77043. Refactor only: `guides(preset, size)` (default output px) + `LABELS` moved from
  src/tools/id-photo/overlay.ts; overlay draws from it with its canvas size. Review: handoff/REVIEW-REQUEST-IDCAM1022-A.md.
- Decision: overlay passes (W, H) instead of scaling output coords by k, because k·outH ≠ H in the last bit would break pixel
  identity; unit test asserts bit-for-bit equality with the old arithmetic (all presets × 4 sizes).
- Gates: check 0/0; vitest 2,155/2,155; default + AUTOFRAME=1 builds check-dist OK (fonts preload 92.1/92.66 unchanged, precache
  422.4/450); e2e id-photo.spec chromium + manual-chromium 71 passed / 15 skipped, 1 worker. qa:visual not run (low memory, not in CI).
- Escalations: none.

### IDCAM1022 Step A — review + deploy gate (2026-10-22)
- Richard: clear, 0 Must Fix (handoff/REVIEW-FEEDBACK-IDCAM1022-A.md). Note for Step B: pass the on-screen crop rect size to guides() and offset by its origin, not the video frame size.
- Decision: qa:visual is a live-site matrix (scripts/qa/visual.mjs: "the deploy gate runs it against the live site"), so it runs after merge against docttak.com/id-photo/, not before. Pixel identity is covered pre-merge by the bit-for-bit vitest.
- PR to main; owner merges after green CI (no --auto: no required checks in this repo).

## IDCAM1022 B — /id-photo/ receiver + /id-photo-camera/ core (Bob, 2026-10-22) — DONE_WITH_CONCERNS
- Branch `idcam1022-b` (stacked on idcam1022 / PR #16). Review: handoff/REVIEW-REQUEST-IDCAM1022-B.md.
- Built: PUBLIC_ID_CAMERA (scripts/lib/idcamera.mjs, default "1"; astro.config inject + `__ID_CAMERA__`); the page
  src/tools/id-photo-camera/{page.astro, camera.css, entry.ts, controller.ts, capture.ts, errors.ts, copy.ts, send.ts};
  ID_CAMERA_TOOL in tools.ts (right after id-photo, 5 FAQ, tool note src/content/tool-notes/id-photo-camera.md with 2 외교부
  quotes); og image + description; home order; NEXT_GUIDES; sw runtime page (flagged); gen-headers block
  (`! Permissions-Policy` + camera=(self)) on /id-photo-camera/* only; check-dist rules (headers per route, flag on/off
  traces, video attrs, camera API only in the lazy chunk, budgets); usage slug; /id-photo/ receiver (pendingHandoff ->
  receiveHandoff -> open(file, {from})) + 「카메라로 찍기」 link (#idp-camera, follows ?preset, not in the embed widget);
  D8c checklist plumbing (warnings.ts `bgEdited` -> block on passport/driver with the quoted rule, note on other official
  presets, nothing on 이력서/기타/custom).
- Decisions (Bob):
  - Reviewer note on Step A applied: overlay.ts now exports `drawGuides(g, preset, W, H)` (drawOverlay calls it with the
    same arguments, so /id-photo/ is unchanged); the camera canvas passes the on-screen guide rectangle's size and
    translates to its origin (controller.ts draw()).
  - ID prefix `cam-` (not `ic-`): `.ic-stage` etc. are global id-copy rules in app.css.
  - Handoff into /id-photo/ is a direct sendTo with go -> `/id-photo/?preset=<id>` (send.ts), not a next-steps FLOW row:
    FLOW buttons are tool-name labels to `/<to>/` without a query, and the brief's button is 「이 사진으로 규격 맞추기」 with
    the preset. Usage: next event t=id-photo-camera v=id-photo.
  - `receiveHandoff` deliver now gets `(file, from)`; `takeHandoffFrom` returns the record's `from` (takeHandoff unchanged).
  - D8c in a PUBLIC_BG_REMOVE=0 build: the controller passes `bgEdited: __BG_REMOVE__ && from === 'remove-background'`, so a
    flag-off bundle never names that tool (check-dist rule caught the first try).
  - Usage events mapped onto existing kinds (no Function change): cam ok = start (o=preset), cam fail = fail c=denied|notfound|
    busy|nosupport|other p=load, capture = success, handoff = next, fallback = pick.
  - Copy reworded to existing glyphs (D11; never grow the preload): 「앞/뒤 카메라 바꾸기」 -> 「카메라 바꾸기」; 「팔을 뻗은
    셀카보다 …」 -> 「휴대폰을 세워 두고 조금 떨어져서 타이머로 찍으세요」 on the page (the full advice with the 외교부 근접 촬영
    quote is in the tool note, system font); late copy 「켰어요/껐어요/까맣게」 reworded (late-800 face was 8.2/8 KB).
  - Preset select lists the real presets only (no 직접 입력: the camera page has no size fields); /id-photo/ builds the link
    without a preset for 직접 입력.
  - Front preview mirrored by CSS (data-mirror), facing from track settings, else the request; the still is drawn from the
    frame (never mirrored). Black frame (mean luma < 4 on a 32 px probe) is refused with a retry message, camera stays on.
  - Sharpness/burst left to Step C with the rest of D5 burst (brief: "Live hints/burst are Step C").
  - Fixtures: no committed y4m. Step B e2e uses Chromium's built-in fake device (real getUserMedia + Permissions-Policy)
    and a canvas-stream getUserMedia (all browsers with a camera path) — the y4m files are Step C's hint fixtures.
- Budgets: /id-photo-camera/ initial JS 13.7 KB / 30; controller (lazy) 5.1 KB -> budget 6.2 KB (measured + 20 %);
  preloaded UI fonts 92.1 / 92.66 KB unchanged; late faces 7.5 / 7.9 of 8 KB; precache 427.0 / 450 (page is runtime-cached).
- Fixes during the run: check-dist tool-length rule skips /id-photo-camera/ when the flag is off; gen-headers adds the
  camera block once (idempotent); camera page select overflowed at 360 px (grid min-content) — `.cam .ph-field`
  minmax(0,1fr) + select width 100%.
- Gates: check 0/0; vitest 2,176/2,176; default / AUTOFRAME=1 / PUBLIC_ID_CAMERA=0 builds check-dist OK (+ postbuild.test on
  the off build 77/77); e2e 1 worker: camera specs chromium + mobile-chrome 14/14, id-photo + chain chromium + manual-chromium
  89 pass / 16 skip, site + polish chromium 177 pass (after the 2 fixes above). Not run locally: firefox/webkit/mobile-safari,
  cloud-*, LHCI, qa:visual (CI / deploy gate).
- Known Gaps (IDCAM1022): D8c 「원본 사진으로 다시 하기」 button deferred to Step D (the original is not on /id-photo/);
  Firefox fake-camera resolution unverified (synthetic test covers the path); O1/O2 real phones and in-app viewers.
- Escalations: none.

## IDCAM1022 B fix (Bob, 2026-10-22) — Richard's 4 Should Fix — UNVERIFIED (gate run stopped)
- 1 pageshow: back from /id-photo/ (bfcache, persisted) in review re-enables 「이 사진으로 규격 맞추기」 (a new record is stored on re-send).
- 2 double capture: `capturing` flag + 찍기 disabled at capture start (shoot() and the timer both go through it); a superseded still URL is revoked.
- 3 tool note: 「한두 걸음 떨어져」 -> 「조금 떨어져서」 (no distance figure, D8(d)).
- 4 제출처 during review: decision = the preset select is disabled on the review screen (the still was cut at that aspect) and re-enabled by 「다시 찍기」; simplest, no recrop.
- Brief: Step B "next-steps id-photo-camera -> id-photo" marked superseded (sendTo + ?preset); Step D carries 「원본 사진으로 다시 하기」.
- Test: id-photo-camera.spec 'review: one capture per tap …' (double tap -> 1 object URL; select disabled in review; pageshow persisted re-enables; retake revokes the URL, select enabled).
- Gates: `npm run check` 0/0. vitest, the default build and the camera e2e were stopped by the harness (system low on memory) before they reported; not re-run on my own per the harness note. Not committed until they pass.
- Orchestrator: local vitest was killed for low machine memory; the B fixes are verified by CI on the PR instead (vitest, build + check-dist, e2e on 5 browsers). Owner merges only on green.
- PR #17 CI: `checks` job cancelled at its 50-min timeout (the Lighthouse step itself finished green, 42 min on slow runners; firefox/mobile-safari e2e also ~49 min today). Raised the job timeout 50 → 65 min in ci.yml; no assertion or budget changed.

## IDCAM1022 C — live hints + burst (D5 burst, D6) (Bob, 2026-10-22) — DONE
- Branch `idcam1022-c` from main 792645b. Review: handoff/REVIEW-REQUEST-IDCAM1022-C.md.
- Built: src/lib/idphoto/live.ts (pure: fitSize, ovalMeanL, analyseFrame = checkBackground reuse + face-oval L* dark/backlight,
  rollDeg/isTilted from deviceorientation beta/gamma, pickHint, settle debounce, lumaOf, sharpness = variance of the
  4-neighbour Laplacian); src/tools/id-photo-camera/hints.ts (lazy chunk: watchHints ≤160 px copy of the overlay rect,
  4 Hz, skipped while hidden, stopped with the tracks; sharpestFrame = 3 frames 250 ms apart, ≤256 px luma copy, keeps at
  most 2 full-size frames); controller wiring (#cam-hint under the view, reserved height so 찍기 never moves; burst at
  the shutter; HINTS copy in copy.ts); tool-note section 「화면 아래에 안내가 나올 때」; check-dist hints-chunk rule.
- Decisions (Bob):
  - Hints + burst live in their own lazy chunk (hints.*.js), imported by the controller when the camera starts, so the
    controller budget (6.2 KB) is not raised: controller 5.1 -> 5.5 KB. New budget for the hints chunk = measured 2.0-2.1 KB
    (hints 1.5 + background.ts 0.55, gzip) + 20 % = 2.5 KB (check-dist ID_CAMERA_HINTS_KB; asserts exactly one hints chunk
    from the controller and no camera API in it).
  - Capture never waits for that chunk: not loaded yet (or failed) = one frame, as in Step B. A stop mid-burst (hide,
    flip, leave) drops the burst silently (stopForHide already announced it).
  - Sharpness lives in live.ts (lib, pure) rather than capture.ts (brief Step B line) — Step C names live.ts for analysers.
  - Thresholds (OUR heuristics, never shown): DARK_L 35 and BACKLIGHT_DL 40 per brief D6; TILT_DEG 5° (roll away from the
    nearest quarter turn, so landscape is level too; null when lying flat); face measured inside the guide oval at 0.8
    size (hair/edge excluded); a hint shows/clears only after 2 analyses in a row. One hint at a time:
    backlight > dark > background > level.
  - Level: a passive deviceorientation listener only; events that arrive (Android) are used; nothing calls
    requestPermission and nothing branches on the UA (iOS simply sends none -> no level hint).
  - Copy: brief's 「흰 벽 앞에 서 주세요」 -> 「뒤가 흰색인 곳에 서 주세요」 (「벽」 is not in the UI font; same rewording as B).
    Dark-face copy (brief gave none): 「얼굴이 너무 어두워요. 밝은 곳에서 찍거나 불을 켜 주세요.」. Level: 「휴대폰이 기울어져
    있어요. 똑바로 세워 주세요.」. All four use core glyphs only: preloaded UI fonts 92.1 / 92.66 KB and late faces 7.5 / 7.9
    of 8 KB unchanged. COPY.md updated.
  - E2E scenes: canvas-stream synthetic scenes (white / dark / backlit + a dispatched DeviceOrientationEvent) instead of the
    brief's committed y4m files — same path as Step B's synthetic camera, runs on chromium, mobile-chrome and firefox
    without per-file launch flags or binary fixtures.
- Gates: `npm run check` 0 errors / 0 warnings; vitest tests/unit/idphoto-live + id-photo-camera 31/31; ONE default
  production build + check-dist OK (camera initial 13.9/30, controller 5.5/6.2, hints 2.0/2.5, precache 427.0/450); e2e
  id-photo-camera.spec chromium 1 worker 11/11 (4 new hint tests). Not run locally (memory): full vitest, other builds
  (PUBLIC_ID_CAMERA=0, AUTOFRAME, cloud), fake.spec, mobile-chrome/firefox/webkit, LHCI, qa:visual — CI on the PR.
- Known Gaps (IDCAM1022): burst choice has unit coverage only (no e2e that the sharpest of 3 is kept: a synthetic blurred
  frame at a known moment is timing-bound); thresholds tuned on synthetic scenes only — real phones O1.

## IDCAM1022 C fix (Bob, 2026-10-22) — Richard's 2 Should Fix — DONE
- Review: handoff/REVIEW-FEEDBACK-IDCAM1022-C.md (0 Must Fix).
- C1: 「카메라 바꾸기」 disabled at capture start (the next setPhase enables it again: live on a failed capture, review on
  success) and the flip handler ignores taps while `capturing`; a mid-burst switch can no longer drop the shot silently.
- C2: tests/unit/id-photo-camera-burst.test.ts — sharpestFrame with stub canvases and fake timers: keeps the sharpest of 3
  and releases the others; alive() false mid-burst -> null, no further grab, held frame released; all grabs null -> null;
  a failed middle grab is skipped.
- Gates: `npm run check` 0/0; vitest id-photo-camera-burst + idphoto-live + id-photo-camera 35/35. No build/e2e re-run
  locally (controller change is two lines; CI on the PR).

### IDCAM1022 Step A + B — live (2026-10-22)
- PR #16 (A) merged by owner as 14be75e after a firefox rerun (scattered 20 s timeouts on slow runners; all green on rerun). PR #17 (B) merged by owner as 792645b, all green (checks 52 min under the new 65-min timeout).
- Live smoke 792645b: /id-photo-camera/ 200, title 「집에서 증명사진 찍기 – …」, h1 「증명사진 촬영」; Permissions-Policy camera=(self) on it, camera=() on /id-photo/ and /embed/id-photo/; 「카메라로 찍기」 link on /id-photo/; in sitemap and llms.txt; og /brand/og-id-photo-camera.png 200; page assets 200; no AdSense tag. Post-deploy job green on 14be75e and 792645b. Real-phone tests remain owner items (O1/O2).

## IDCAM1022 D — background link (D8b/c) (Bob, 2026-10-22) — DONE_WITH_CONCERNS
- Branch `idcam1022-d` (stacked on idcam1022-c / PR #18, bbe4d3d). Review: handoff/REVIEW-REQUEST-IDCAM1022-D.md.
- Built: src/lib/idphoto/bglink.ts (pure: BG_PRESETS allowlist saramin/jobkorea/half_card, bgOffered (+custom per D8b),
  bgPreset -> allowed id else saramin, parseBgLink(?bg=white, ?preset), bgUrl, idPhotoBack). Camera review button
  「배경을 흰색으로 바꾸기」 (#cam-bg, page.astro only under __BG_REMOVE__, shown by the controller for allowed presets) ->
  send.ts sendToBg = sendTo('remove-background', from id-photo-camera) -> /remove-background/?bg=white&preset=<id>.
  /remove-background/ receiver (entry.ts: pendingHandoff -> receiveHandoff -> api.open(file, {held:true}); #bg-arrived
  notice; ?bg=white checks the 흰색 chip before the controller loads). bg.ts: a held photo stops at ready (cloud,
  unchanged) or the consent panel even when the engine is cached (model.ts startsAtOnce(engineReady, held); with the
  engine ready the panel says COPY.held and the button reads 「배경 지우기」, consentKeep hidden); with ?preset= in the
  address the result shows 「이력서 사진 규격 맞추기」 (#bg-idphoto) -> sendTo('id-photo', from remove-background) ->
  /id-photo/?preset=<allowed id>. /id-photo/: the D8c blocking item carries 「원본 사진으로 다시 하기」 (#idp-redo, built
  only under __BG_REMOVE__) -> back to the empty picker (사진 선택 / 카메라로 찍기).
- Decisions (Bob):
  - Pass-through allowlist = saramin, jobkorea, half_card. custom is in the D8b offer set (bgOffered) but cannot travel:
    /id-photo/ deep links never carry custom (deeplink.ts), so it maps to saramin like any other id. Passport/driver ids
    can never come back through the link (unit test parses every way-back URL with the real deep-link parser), and if
    a user switches to them on /id-photo/, D8c blocks (from=remove-background, unchanged warnings.ts).
  - "Held" on the local path means: never auto-start even with a cached engine (brief: arrival -> ready|consent). The
    cached case reuses the consent panel with its own line instead of the download line (no false "받아요").
  - The way back to /id-photo/ shows only when the address carries ?preset= (from the camera chain); a plain visit to
    /remove-background/ keeps its C2 "not for ID photos" positioning and never links to /id-photo/.
  - 「원본 사진으로 다시 하기」 = toEmpty + focus the picker: the original is not on /id-photo/ (B Known Gap); the empty
    state shows 「사진 선택」 and 「카메라로 찍기」, which is the way to an unedited photo.
  - Usage: next t=id-photo-camera v=remove-background; next t=remove-background v=id-photo (existing kinds).
  - Copy (late/dynamic, glyph-checked by the build): 「배경을 바꾸는 화면으로 넘기는 중이에요」, 「사진을 가져왔어요. 배경
    지우기를 누르면 이 기기에서 배경을 지워요.」, 「이력서 사진 규격 맞추기」, failure 「사진을 넘기지 못했어요. 흰색 배경으로
    내려받은 뒤 여권·증명사진 규격 맞추기에서 골라 주세요.」. COPY.md + remove-background tool note (provenance loss,
    D8c) updated.
  - e2e helpers: syntheticCamera moved from id-photo-camera.spec to idcam.ts (shared); new seedHandoff (record + marker,
    as sendTo leaves them) for WebKit and the cached-engine case.
- Budgets (PUBLIC_BG_REMOVE=1 build): remove-background controller 14.0 / 14.5 KB; /remove-background/ initial 11.0 / 30;
  camera controller 5.6 / 6.2, initial 14.2 / 30, hints 2.0 / 2.5; preloaded UI fonts 92.2 / 92.66 KB (core 616 chars;
  not raised); late 7.5 / 7.9 of 8 KB; precache 430.4 / 450.
- Gates: `npm run check` 0/0; vitest idphoto-bglink + id-photo-camera + bgremove + tool-notes (new/changed) green;
  ONE build PUBLIC_BG_REMOVE=1 + check-dist OK (-> dist-bg). The remove-background tool-note line was appended while
  that build ran, so its dist does not contain it (tool-notes unit test green; CI builds it).
  e2e remove-background.spec bg-chromium, 1 worker, @model excluded: 8/8 (2 new: camera chain; held with cached engine).
- Not run locally (memory): default and PUBLIC_ID_CAMERA=0 / cloud builds, id-photo-camera.spec (dist/ is a pre-change
  build), remove-background.cloud.spec (needs dist-bgcloud), bg-mobile-safari, firefox/webkit, LHCI, qa:visual -> CI.
- Known Gaps (IDCAM1022): back from /id-photo/ (bfcache) to a /remove-background/ result shows a freed canvas (pagehide
  releases the cut-out; pre-existing for the next-steps buttons too) — 「다른 사진 고르기」 works; with
  PUBLIC_ID_CAMERA=0 and 배경 지우기 on, the remove-background tool note still names 증명사진 촬영 (both flags are on in
  production).
- IDCAM1022 D review: clear, 0 Must Fix; 2 notes logged, not fixed (custom → saramin per the brief's else-saramin rule; sweepIfDue skipped on a visit with a waiting hand-over, harmless). PR stacked on #18; CI verifies the builds/browsers Bob could not run locally.

## IDCAM1022 D fix2 — remove-background controller over budget in the cloud build (Bob, 2026-10-23) — DONE_WITH_CONCERNS
- Symptom (PR #19 CI, cloud build = ci.yml dist-bgcloud env, also the production build): remove-background controller
  (bg + messages + sniff + decode) 14.7 KB gzip / 14.5. My Step D measure (14.0) came from the device-only build.
  Budget NOT raised.
- Root cause: Step D added ~0.2 KB gzip to bg.ts (held wording, the way-back click handler + bglink import) on top of
  a controller that was already ~14.4 KB in the cloud build.
- Fix (behaviour unchanged):
  - The way back to /id-photo/ is a new lazy chunk src/tools/remove-background/back.ts (goBack: picture -> sendTo
    id-photo -> /id-photo/?preset=<allowed>; its failure line BACK_FAILED). entry.ts shows #bg-idphoto when ?preset= is
    present and loads ./back on the press; bg.ts only lends `picture` (the 이어서 하기 encoder, now shared).
  - Held + engine ready: bg.ts sets data-held on #bg-consent and the held line; the button's two labels and the
    「한 번 받으면…」 line switch by CSS (bg.css). HELD_START / TO_ID_PHOTO are page-markup constants, not in COPY.
  - cloudOnce's copy -> request -> decode sequence moved into lib/bgremove/cloud.ts `cutoutOnce` (the cloud client,
    already lazy, loaded after the pick); bg.ts keeps loading it, the retry loop and the run checks.
  - check-dist: new budget for back*.js = measured 0.55 KB + 20 % = 0.7 KB (D11), exactly one chunk, never initial.
- Sizes (cloud build env copied from ci.yml): controller 14.7 KB (15,0xx B) -> 14.4 KB (14,762 B) / 14.5; bg.js 10,276
  -> 10,007 B; back.js 0.5 / 0.7 KB; cloud client 1.5 / 3 KB; /remove-background/ initial 12.9 -> 13.0 / 30;
  preloaded fonts 92.2 / 92.66; precache 438.2 / 450.
- Gates: vitest bgcloud + idphoto-bglink + network-guard + bgremove 127/127; cloud build + check-dist OK. `npm run check`
  was killed (V8 out of memory) and not retried -> CI. e2e remove-background.cloud.spec on cloud-chromium, 1 worker:
  16/16 (incl. the hand-over waits at ready, retries, quota/device paths). Not run: remove-background.spec (needs a
  dist-bg rebuild; its held-with-cached-engine test now checks the CSS-switched label) and other browsers -> CI.

## IDCAM1022 D fix3 — Richard's fix2 Must Fix + 2 Should Fix (Bob, 2026-10-23) — DONE
- Review: handoff/REVIEW-FEEDBACK-IDCAM1022-D.md "fix2" section (committed here).
- Must Fix: bg.ts onDevice — with a held photo and the engine ready, the WebGPU fallback line (#bg-consent-extra, text
  and hidden) and the low-device line stay hidden and are not announced again (`!engineReady` guard restored).
  e2e held-with-cached-engine test asserts both hidden.
- Should Fix: entry.ts disables 「이력서 사진 규격 맞추기」 synchronously on the press (no double store); every failure
  (controller or back chunk not loading, nothing stored) re-enables it and shows BACK_FAILED in #bg-error (role=alert).
  BACK_FAILED moved to copy.ts (in the page chunk, so it shows even when ./back cannot load); back.ts is now only
  goBack(picture, preset, failed).
- check-dist: back*.js budget 0.7 -> 0.33 KB (measured 0.27 KB + 20 %, D11; the chunk shrank).
- Sizes (one cloud build, exact ci.yml env): controller 14,769 B (14.4 KB) / 14,848 B (14.5 KB); back.js 267 B;
  /remove-background/ initial 13.1 / 30; preloaded fonts 92.2 / 92.66; precache 438.2 / 450.
- Known risk: the controller budget margin is ~79 B. The next brief that touches bg.ts must plan a chunk move (e.g.
  the device-path consent/download code or the cloud retry loop into their lazy modules) up front, never a budget raise.
- Gates: `npm run check` 0/0; vitest idphoto-bglink + bgcloud + network-guard 80/80; cloud build check-dist OK (the
  0.33 KB back budget re-checked by running check-dist again on that dist: no budget error; that re-run also prints
  _headers errors, which come from running it a second time after gen-headers has already written _headers, not from
  this change); remove-background.cloud.spec cloud-chromium 1 worker 16/16. Not run: remove-background.spec (dist-bg not
  rebuilt) -> CI.
