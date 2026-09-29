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
