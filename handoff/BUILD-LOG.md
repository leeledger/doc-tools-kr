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
