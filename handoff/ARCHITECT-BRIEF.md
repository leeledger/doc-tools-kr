> **Current step (2026-10-06): `handoff/ARCHITECT-BRIEF-USAGE.md`** (익명 사용 통계 + /admin/). This file remains the program plan.

# Architect Brief — 안올림 (doc-tools-kr) — Program plan + Step 2

Author: Arch. Date: 2026-09-29.
Evidence (local only; `spikes/` is git-ignored):
- `spikes/pdf/SPIKE-PDF.md`
- `spikes/photo/SPIKE-PHOTO.md`
- `spikes/hwp/SPIKE-HWP.md`

## 0. Non-negotiables
- Everything runs in the browser. No backend.
- Zero AI/LLM at runtime.
- Shipped code uses only these licenses: MIT, Apache-2.0, BSD-2/3, ISC, 0BSD, Zlib, IJG, and OFL-1.1 for fonts.
- No GPL, AGPL, LGPL or MPL in shipped code.
- Korean UI.
- Quality comes before speed.

## 1. Stack decision (locked)

| Choice | Decision | Reason |
|---|---|---|
| Site generator | **Astro 7.x, `output:'static'`**, pinned exactly (7.3.5 today) | One HTML page per tool, which is good for SEO. A shared layout instead of copy-paste. Zero JS by default. Vite handles module workers and `?url` assets. No server runtime to maintain. |
| Language | TypeScript `strict`. Pin TS to the newest version that `@astrojs/check` accepts. If TS 7.x has a peer conflict, use the latest 5.9.x and log it. | Typed PDF object plumbing. |
| Heavy work | **Module Web Workers**. WASM is lazy-loaded inside the worker only after a file is chosen. | The UI stays responsive on 100 MB inputs. Cancel is `worker.terminate()`, which also frees WASM memory. |
| UI framework | **None.** Astro markup plus one plain TS controller per tool. | Fewer deps and less upgrade churn. Each tool is a small state machine. |
| Hosting | Cloudflare Pages, static only, no Functions | Current setup. Zero server upkeep. |
| Self-hosting | All JS, WASM, pdf.js CMaps, fonts and models come from our origin. This includes replacing the jsDelivr Pretendard link. | Keeps the privacy claim true, allows CSP `connect-src 'self'`, and makes versions deterministic. |
| Versions | Exact pins (no `^`/`~`). Commit `package-lock.json`. `.node-version` = `22`. | Reproducible CF builds. The spike harnesses serve as the upgrade regression reference. |

**Cloudflare Pages 25 MiB per-file limit: every known asset passes.**
- The largest is MediaPipe `vision_wasm_internal.wasm` at 11.76 MB.
- rhwp_bg.wasm is 9.94 MB.
- face_landmarker.task is 3.76 MB.
- avif_enc.wasm is 3.49 MB (opt-in only).
- qpdf.wasm is about 1.2 MB raw.
- The pdf.js worker and wasm together are under 2 MB.
- The file count (Pretendard dynamic subset, about 100 files) is far below the 20,000 limit.
- Guard: `scripts/check-dist.mjs` fails the build if any `dist/` file is ≥ 24 MiB, if there are more than 15,000 files, or if any `.map` file is present.

**Runtime dependencies by step (exact versions as measured in the spikes):**
- Step 1:
  - `@cantoo/pdf-lib@2.11.1` (MIT)
  - `pdfjs-dist@6.3.289` (Apache-2.0; its bundled wasm: openjpeg BSD-2, jbig2 BSD-3, qcms MIT)
  - `pretendard@1.3.9` (OFL, fonts only)
- Step 2 adds `@neslinesli93/qpdf-wasm@0.3.0` (qpdf Apache-2.0, wrapper ISC), `@jsquash/jpeg@1.6.0` and `@jsquash/resize@2.1.1` (Apache-2.0).
- Step 3 adds `@jsquash/webp@1.5.0` (opt-in).
- Step 4 adds `@mediapipe/tasks-vision@1.0.1` and `face_landmarker.task` (Apache-2.0; re-read the model card before shipping).
- Step 5 adds `@rhwp/core@0.8.6` (MIT) and OFL fonts as woff2 unicode-range slices.

**Dev-only, never shipped:**
- `astro`, `typescript`, `@astrojs/check`
- `vitest`, `@playwright/test`
- `@axe-core/playwright` (MPL-2.0, acceptable because it is dev-only)
- `@lhci/cli`

Any new dependency must first be logged in BUILD-LOG with its license.

## 2. Release plan (demand × readiness)

| Step | Tool (URL) | Naver/mo | Readiness | Ships when |
|---|---|---|---|---|
| 1 | Foundation + **PDF 합치기** `/pdf-merge/` | 53,930 | GO (mergePlus proven) | **Live** (44af82c, 2026-09-29) |
| **2** | **PDF 용량 줄이기** `/pdf-compress/` | 26,210 | GO | **Full spec below** |
| 3 | **사진 용량 줄이기** `/photo-compress/` | 29,000 | GO | After Step 2 |
| 4 | **여권·증명사진 규격** `/id-photo/` | 56,600 | GO, as auto-frame plus confirmation. 5.6 MB model. Presets need re-verification. | After Step 3 |
| 5 | **HWP → PDF** `/hwp-to-pdf/` | 11,930 + 8,330 | GO with conditions | **Gated** on a re-test with a corpus of 100+ files: broken ≤ 5 %, no page-count mismatches, and a Wilson 95 % upper bound < 10 % |

**Why this order:**
- Step 2 comes before Step 3 even though its demand is slightly lower. It reuses Step 1's PDF infrastructure: the worker, pdf.js, and password and damage handling.
- Step 4 has the highest demand but the most UX and legal surface. It waits until Step 3 has proven the photo encoder.

### Later steps (brief — each gets a full brief when it starts)

**Step 2 — PDF 용량 줄이기:** full build spec at the end of this file. Owner decision (2026-09-29): the opt-in "이미지로 변환" is **in** Step 2, with a warning.

**Step 3 — 사진 용량 줄이기**
- Decode with `createImageBitmap(...,{imageOrientation:'from-image'})`.
- Detect HEIC by magic bytes and show the guidance copy.
- Size search:
  - `fitToTarget` on the canvas encoder, with a q floor of 0.5 and downscaling below that.
  - Final MozJPEG encode in a worker.
- Presets: 500 KB, 200 KB, 100 KB, 50 %, and a custom KB value.
- Output guarantees:
  - Size ≤ target.
  - EXIF/GPS stripped, and the UI says so.
  - Baseline JPEG.

**Step 4 — 여권·증명사진**
- FaceLandmarker auto-frame, a guide overlay, and a **mandatory confirmation checkbox before download**.
- Launch presets: passport_online, qnet, gosi and half_card_3x4.
- Presets with secondary confidence ship only after re-verification.
- Every preset shows a source link and 기준일.
- Blocking checks and warnings follow spike §3.3.
- If the model fails, fall back to the manual guide.
- Before launch, test the HEIC and file-input path on a real iPhone.

**Step 5 — HWP → PDF**
- First, a corpus expansion task (research, not build).
- Then port `spikes/hwp/convert.html`:
  - Include the 4 mandatory fixes plus the image clamp and downsample.
  - Output through print-to-PDF, with per-browser guidance.
- Mobile gate: viewer-only above 20 MB, or above 5 MB of images on mobile.
- Show the Hancom notice and the trademark line.
- Add the OFL texts to /licenses/.

**Candidate Step 1b (after Step 2; owner to confirm) — page-level editing in the merge tool**
- Page thumbnails.
- Delete, rotate and reorder pages across files.
- UI only: mergePlus already accepts `pages` and `rotate`.

## 3. Quality gates (every step; a step is not "clear" until all pass)

1. **Typecheck + unit tests.**
   - `npm run check` runs astro check.
   - `npm test` runs Vitest in Node.
   - Engine logic stays framework-free so it can run in Node.
2. **E2E tests.**
   - `@playwright/test` against the production build, served by `tests/e2e/serve.mjs` (see Step 1 A6).
   - Projects: `chromium`, `firefox`, `webkit`, `mobile-chrome` (Pixel 7) and `mobile-safari` (iPhone 14).
   - Fixtures come only from `tests/fixtures/`, which is committed and ≤ 3 MB.
3. **No-upload assertion.** Every tool e2e test calls the shared helper `tests/e2e/no-upload.ts`.
   - It records `context.on('request')`, which includes worker requests in Chromium, and `page.on('websocket')`.
   - Every request must:
     - use GET or HEAD
     - have `postDataBuffer() === null`
     - be same-origin, `blob:` or `data:`
   - There must be zero websockets.
   - Responses must carry a CSP with `connect-src 'self'`.
   - A static unit test checks `src/`:
     - it has no `sendBeacon`, `XMLHttpRequest`, `WebSocket` or `EventSource`
     - `fetch(` appears only in allowlisted files that load our own static assets
4. **Regression harness.**
   - Run with `npm run regress:*`, locally, not in CI.
   - The large corpus is read from `CORPUS_DIR` (default `spikes/pdf/corpus`).
   - Output goes to `regress-out/` (git-ignored).
   - It reuses the spike metrics: page count, per-page pdf.js text equality, render SSIM on sampled pages, and form, bookmark and link counts.
   - It is required for every step and every engine-dependency upgrade, with a summary in REVIEW-REQUEST.
5. **Cross-browser.**
   - Chromium, Firefox and WebKit must all be green.
   - A real browser limitation may be skipped only with a stated reason. Never skip silently.
6. **Mobile limits.**
   - Mobile means `matchMedia('(pointer: coarse)')` and `screen.width < 1024`.
   - Each step defines a soft limit (warn and confirm) and a hard limit (block with a message).
   - At 360 px width there is no horizontal scroll.
   - Tap targets are ≥ 44 px.
7. **Accessibility.**
   - axe finds zero serious or critical violations on every page.
   - A keyboard-only e2e covers each tool end to end.
   - Focus is visible and every control is labelled.
   - Progress and results are announced through an `aria-live="polite"` region.
   - `prefers-reduced-motion` is respected.
8. **Lighthouse CI.**
   - `@lhci/cli`, mobile preset, on `/` and on each tool page before any file is picked.
   - Scores: Performance ≥ 95, Accessibility = 100, Best Practices ≥ 95, SEO = 100.
   - CLS ≤ 0.01 and LCP ≤ 2.0 s.
   - Initial JS ≤ 30 KB gzip per page. Engines load only after a file is picked, or after the first interaction plus idle (Polish P.7 preload; Lighthouse never interacts).
9. **License gate.**
   - `npm run check:licenses` walks `npm ls --omit=dev --all --json` and reads each `license` field.
   - It fails on anything outside the §0 allowlist, and on any match for `/GPL|MPL/i`.
10. **Dist gate.** `scripts/check-dist.mjs` (limits in §1).
11. **Manual check.**
    - Reviewer opens the Cloudflare preview or the local build in real Chrome, Firefox and Edge, plus one phone if available.
    - Reviewer runs each tool once with a real file.

**CI.** `.github/workflows/ci.yml` runs gates 1–3, 5 and 7–10 on push and on PR. Cloudflare Pages keeps doing its own build and deploy.

## 4. Privacy and legal texts

**`/privacy/` — 개인정보 처리방침** (합니다체)
- Files and their contents are never collected, stored or transmitted. Processing happens in the browser.
- No sign-up, no cookies and no analytics in this phase.
- Cloudflare, as host, may process access logs (IP, User-Agent) for security and operations. Link to Cloudflare's privacy policy.
- Include a 시행일 and a 변경 이력 section.
- Note that enabling ads (AdSense) will come with an update and a consent mechanism beforehand.
- Contact channel: **owner decision**. Until then, show the placeholder "문의처는 곧 안내합니다". No personal email.

**`/licenses/` — 오픈소스 라이선스**
- Generated at build by `scripts/gen-licenses.mjs` from an explicit `licenses.manifest.json` listing shipped packages and assets.
- It embeds the LICENSE and NOTICE texts from `node_modules`, including the pdf.js wasm notices and the Pretendard OFL.
- The build fails if a manifest entry's license file is missing.

**Step 4 notice** (fixed, near the download button). It must say:
- "이 도구는 자르기·크기 조정·재압축만 합니다. 얼굴·피부·배경을 수정하지 않습니다."
- The 외교부 quote that retouched photos are not accepted (보정 사진 불가).
- "최종 적합 여부는 접수 기관 심사로 결정되며, 이 도구는 통과를 보장하지 않습니다."
- "머리 길이는 추정값입니다."

**Step 5 notice** (HWP page footer, /licenses/, and the help text):
- "본 제품은 한컴의 HWP 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다."
- "한글, 한컴, HWP, HWPX는 한글과컴퓨터의 등록상표이며, 본 서비스는 한글과컴퓨터와 무관합니다."

**Every tool page**
- Put "파일은 이 기기 밖으로 전송되지 않습니다." next to the file picker, with a link to /privacy/.
- Make no absolute claims such as "100 % 안전". Claim only what the e2e test proves.

## 5. SEO basics
- **Single source of truth: `src/data/tools.ts`.** Each tool has `slug`, `title`, `description`, `h1`, `status` (`'live'|'soon'`), `faq[]` and `keywords[]`. `keywords[]` is for copy only; do not emit a meta keywords tag.
  - Title pattern: `{도구명} — 업로드 없이 브라우저에서 무료로 | 안올림`.
  - Description: 80–120 characters. It contains the exact Naver keyword (for example "pdf 합치기") and the no-upload benefit.
- **Canonical.**
  - `site` comes from env `PUBLIC_SITE_URL`, default `https://doc-tools-kr.pages.dev`. Moving to a custom domain later means changing one variable.
  - Config: `trailingSlash:'always'` and `build.format:'directory'`.
  - Every page has an absolute canonical, plus `og:url`, `og:title`, `og:description`, `og:image` (`/og.png`, 1200×630) and `og:locale=ko_KR`.
- **Preview URLs are not indexed.** `_headers` sets `X-Robots-Tag: noindex` on `https://:hash.doc-tools-kr.pages.dev/*`.
- **JSON-LD.**
  - Home: `WebSite` + `Organization`.
  - Tool pages: `WebApplication` + `BreadcrumbList`. Set `applicationCategory:"UtilitiesApplication"`, `operatingSystem:"웹 브라우저"`, `offers{price:0, priceCurrency:"KRW"}` and `inLanguage:"ko"`.
  - No FAQPage markup, since it has had little value since 2023. The FAQ stays as visible content.
- **Sitemap.**
  - Hand-rolled `src/pages/sitemap.xml.ts` listing home, the `live` tools, /privacy/ and /licenses/. `soon` tools have no page and are not listed.
  - `public/robots.txt` points to the absolute sitemap URL.
  - Optional env vars `PUBLIC_NAVER_SITE_VERIFICATION` and `PUBLIC_GOOGLE_SITE_VERIFICATION` render verification meta tags only when set.
- **Korean copy guidelines.** Write them to `docs/COPY.md` in Step 1, ≤ 40 lines:
  - Body text uses 합니다체.
  - Buttons are short: "PDF 파일 선택", "PDF 합치기", "내려받기", "처음부터".
  - No exclamation marks and no jargon. Write "여기에 파일을 끌어다 놓으세요", not "드롭존".
  - Errors are two sentences: what happened, then what to do. Never blame the user.
  - Put a space between numbers and units: `12.4 MB`, `3쪽`. PDF pages are counted in 쪽.
  - Each tool page has:
    - an H1 containing the exact keyword
    - a 3-step 사용 방법
    - a 안전한 이유 block
    - 4–6 FAQ items that answer real search intent
  - No unverifiable superlatives ("최고", "완벽").
- **Ads (not in this phase).**
  - `src/components/AdSlot.astro` takes `id` and `size`: `'rect'` (300×250) or `'leaderboard'` (728×90 desktop, 320×100 mobile).
  - It renders **nothing** while `ADS_ENABLED` is `false` (`src/data/site.ts`).
  - When enabled, it renders a box with a fixed `min-height`, so it causes no CLS.
  - Placement:
    - allowed: below the tool's result area, and above the footer
    - never above the tool
    - never between the file picker and the download button (AdSense accidental-click policy)

## 6. Handoff protocol (this repo)

All handoff files live in `C:\dev\doc-tools-kr\handoff\`:
- `ARCHITECT-BRIEF.md`: Arch.
- `BUILD-LOG.md`: owned by Arch. Everyone appends decisions and Known Gaps as they happen.
- `REVIEW-REQUEST.md`: Bob, when done. It contains:
  - files and line ranges touched
  - each gate with its result
  - the regress table
  - deviations from the brief
  - a "Blocked" section
- `REVIEW-FEEDBACK.md`: Richard. Findings are marked blocking or non-blocking. The final line is "Step N is clear".
- `SESSION-CHECKPOINT.md`: Arch, at the end of each session.

Loop:
1. Arch writes the brief.
2. Bob builds and writes REVIEW-REQUEST.
3. Richard writes REVIEW-FEEDBACK.
4. Bob fixes, and steps 2–4 repeat until Richard writes "Step N is clear".
5. Arch runs the deploy gate.

Deploy rules:
- Local commits are pre-authorized at the gate.
- **A push to `main` deploys to production and needs the owner's explicit go-ahead.** Standing instruction since Step 2: the orchestrator pushes after Richard's "Step N is clear", then runs the live smoke test.
- Anything marked **Flag** must not be guessed. Record it under "Blocked".

Commit message format:
```
[Step N] <short description>

Built: ...
Reviewed: ...
Decisions: ...
```


---

# Step 2 — Build spec: PDF 용량 줄이기 `/pdf-compress/`

Step 1 is live (44af82c). Its spec is in git history. Everything it built stays as is unless listed below.

## Goal
`/pdf-compress/` shrinks one PDF in the browser at three levels (고화질 / **권장** / 강력) plus an opt-in "이미지로 변환". Text is never rasterized in the three normal levels. A result that is not smaller is never offered. The home card and the merge page link to it.

## Flow

```
file picked (main thread)
  │ header sniff (%PDF-) ── fail ─► not-pdf
  │ inspect.ts (pdf.js): pageCount, encrypted
  │   user  ─► password prompt ─► inspect(bytes, pw) ── wrong ─► "비밀번호가 맞지 않습니다."
  │   owner ─► notice "보안 설정(편집 제한)이 해제된 사본이 만들어집니다"
  │   pdf.js throws (truncated) ─► corrupt
  │ limits (bytes, pages, level) ─► soft: inline confirm │ hard: block
  ▼
level = 고화질 | 권장 | 강력                                  level = 이미지로 변환
  worker: compressPdf()                                         main: pdf.js renders page i (150 dpi) ─► RGBA
   1 normalize  qpdf --decrypt [--password] --object-streams=disable   worker: MozJPEG q70 (1-channel if gray)
       fail ─► cantoo load(throwOnInvalidObject:false) + save             ─► append page (pdf-lib) ─► ack
               ─► qpdf again ── fail ─► corrupt                          loop i; run token checked between pages
       pages ≠ inspect.pageCount ─► corrupt (never partial)              save(objstm)
   2 pdf-lib pass: strip /PieceInfo /Thumb, dedupe streams, hasSignature        │
       candidates = images passing the cheap checks                             │
       0 candidates ─► skip placement parsing                                   │
       else placements (q/Q/cm/Do, Form XObjects) ─► per image:                 │
         decode ─► Lanczos3 to target ppi (if > trigger) ─► MozJPEG             │
         ─► SSIM gate (retry q+10 once) ─► replace only if ≥ 10 % smaller       │
   3 optimize   qpdf --object-streams=generate --compress-streams=y             │
                --recompress-flate --compression-level=9 (6 if input > 30 MB)   │
                --remove-unreferenced-resources=yes                             │
   4 verify     cantoo reload; page count == expected ── fail ─► corrupt        │
  ▼                                                                             ▼
out ≥ 0.99 × in ? ── yes ─► kept (no download; say why)  ◄──────────────────────┘
  │ no
main: pdf.js opens out: pages == expected; normal levels also: text of first, middle, last page == original
  │   fail ─► discard output, error "verify"
  ▼
done: before → after, −N %, page-1 preview (원본 | 결과), signature warning, 내려받기
```

## Build Order

### 0. Preparatory refactors (behaviour-neutral; all Step 1 tests stay green before anything new is added)
1. Move the shared UI helpers out of `src/tools/pdf-merge/`:
   - `formatMB`, `formatPages`, `baseName` and the filename sanitizer → `src/lib/ui/format.ts`. `mergedFileName` stays in the merge tool and calls the shared sanitizer.
   - `MB`, `detectDevice`, `Device` → `src/lib/ui/device.ts`.
   - Update imports. No logic changes.
2. Extract the pdf.js helpers from `scripts/regress/merge.mjs` (`openPdf`, `pageText`, rendering) into `scripts/regress/lib.mjs`. `regress:merge` output must be identical before and after; paste both tables.
3. Richard's two non-blocking items from the Step 1 round-2 review:
   - **Font-rename guard.** In `scripts/font-rename.mjs`, add `readAllNames(sfnt)`, which returns **every** name record as `{platformID, encodingID, languageID, nameID, value}`. `gen-ui-font.mjs` fails the build in either of these cases:
     - any record's value contains "Pretendard" (case-insensitive)
     - the raw `name` table bytes contain "Pretendard" as ASCII or as UTF-16BE

     Keep `readNames` for the existing log line. Add a unit test `tests/unit/font-rename.test.ts`. Build a minimal sfnt whose `name` table has two records for the same nameID: a Windows 3/1/0x409 record that is clean, and a Mac 1/0/0 record that contains "Pretendard". The guard must reject it. A clean table must pass.
   - **`unknown` mapping test.** Export `withFileIndex` from `src/lib/pdf/mergePlus.ts`, marked `/** @internal exported for tests */`. (`onProgress` is called outside the per-file try at line 435, so it is not a usable seam.) Unit tests:
     - a `TypeError` becomes a `PdfError` with code `unknown` and the given `fileIndex`, and `errorCode()` of it is `unknown`
     - a `PdfCorruptError` keeps code `corrupt` and gains the `fileIndex`
     - a `RangeError('Array buffer allocation failed')` is returned unchanged (the OOM path)

### 1. Dependencies (exact pins; log each one in BUILD-LOG with its license before use)
- **Runtime:**
  - `@neslinesli93/qpdf-wasm@0.3.0`: wrapper ISC; qpdf 12.2.0 Apache-2.0; bundled libjpeg-turbo (IJG/BSD-3/zlib) and zlib
  - `@jsquash/jpeg@1.6.0`: Apache-2.0; MozJPEG IJG/BSD-3/zlib
  - `@jsquash/resize@2.1.1`: Apache-2.0; codecs MIT/Apache-2.0
  - Record every transitive dependency and its license.
- No `mupdf`, no Ghostscript, and nothing GPL, AGPL, LGPL or MPL. `check:licenses` must stay green.
- **License texts missing from the npm package.** `@neslinesli93/qpdf-wasm` ships no LICENSE file. Commit these texts under `licenses/third-party/`:
  - `qpdf-12.2.0/LICENSE.txt`, plus `NOTICE` if upstream has one, from the qpdf v12.2.0 tag
  - `libjpeg-turbo/LICENSE.md`, for the version bundled by that qpdf build
  - `zlib/LICENSE`
  - `qpdf-wasm/LICENSE` (ISC) from the wrapper repo. If the repo has none, use the standard ISC text with the copyright line from its package.json author, and say so in REVIEW-REQUEST.

  Record the source URL of each file in `licenses/third-party/SOURCES.md`. Extend `licenses.manifest.json` with a `localFiles` entry type (paths relative to the repo root), and teach `gen-licenses.mjs` to embed it. The build fails if a listed file is missing.
- Also list in the manifest:
  - `@jsquash/jpeg`: `LICENSE` and `codec/LICENSE.codec.md`
  - `@jsquash/resize`: `LICENSE` and `lib/resize/LICENSE.codec.md`, plus `lib/hqx/…` and `lib/magic-kernel/…` if their wasm ends up in `dist/`

### 2. WASM loading (lazy, self-hosted, versioned)
- **qpdf glue.** `copy-vendor.mjs` does the following:
  - copies `dist/qpdf.wasm` to `public/vendor/qpdf/12.2.0-w0.3.0/`
  - writes `qpdf.mjs` in the same directory, containing the original `qpdf.js` text followed by a newline and `export default Module;` (the UMD tail does nothing when `module` and `define` are undefined)

  The worker loads it with `await import(/* @vite-ignore */ QPDF_MJS_URL)`. Do not let Vite bundle the Emscripten glue.
- **qpdf.wasm bytes.** The worker fetches them **once** (`fetch(QPDF_WASM_URL)` → `ArrayBuffer`) and passes them as `wasmBinary` to every factory call. Each qpdf call still gets a **fresh module instance**, so its heap is released between stages as in the spike.
- **jsquash.**
  - Import the wasm files with `?url`: `@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm?url`, `…/dec/mozjpeg_dec.wasm?url`, and the resize wasm.
  - Initialise them explicitly: `init(await WebAssembly.compileStreaming(fetch(url)))` for jpeg, and `initResize(url)` for resize.
- All wasm fetches live in one file, `src/lib/pdf/compress/wasm-browser.ts`. Add it to the network-guard allowlist with a comment.
- Nothing from qpdf, jsquash or pdf-lib may be requested before a file is picked. The e2e test asserts this from the request log.
- `serve.mjs` must serve `.wasm` as `application/wasm` and `.mjs` as `text/javascript`. Verify this, and add it if missing.
- **Flag:** if the Emscripten glue needs anything the CSP blocks, such as `eval` or `new Function` (none found in 0.3.0), report it. Do not loosen the CSP.

### 3. Engine — `src/lib/pdf/compress/` (framework-free; runs in Node and in a worker)
Port `spikes/pdf/harness/lib.mjs` lines 118–400 into typed modules. Use the same algorithm and constants unless this section says otherwise.

| File | Content |
|---|---|
| `levels.ts` | `LEVELS`: `high` {trigger 260, target 200, q 85, gate 0.96}, `recommended` {190, 150, 75, 0.92}, `strong` {130, 110, 55, 0.85}. All three use `minBytes 6144`, `minPixels 96×96`, `minGain 0.10`. `RASTER = {dpi 150, q 70, maxLongPx 3000}`. `KEEP_ORIGINAL_RATIO = 0.99`. `FLATE6_ABOVE = 30 MB`. |
| `deps.ts` | `interface CompressDeps` with `qpdf(args, input)` returning `{code, out, logs}` (out is null on failure), `jpegEncode(img, opts)`, `jpegDecode(bytes)` and `resize(img, w, h)`. The browser implementation lives in the worker. The Node implementation lives in `tests/helpers/compress-deps.ts` and reads the wasm from `node_modules` via `createRequire`. `ImageData` in Node comes from a ~10-line polyfill in `tests/helpers/image-data.ts`, loaded by `vitest.config.ts` `setupFiles` and by the regress script. It is never shipped. |
| `contentOps.ts` | The tokenizer. Two additions: token-to-string conversion is capped at 256 bytes (no `String.fromCharCode` spread over a huge array), and parsing stops hard after 200,000,000 bytes of content per page. |
| `placements.ts` | `imagePlacements(doc)`, exactly as in the spike: depth ≤ 8, the maximum displayed size per image ref, and a count of parse failures. |
| `images.ts` | `decodeImage`, `colorInfo`, `unpredictPng`, `isGray`, `uniqueColors`, and the recompress loop. The skip rules are exactly those in spike §3.1: SMask targets, `/ImageMask`, `/Decode`, colour-key `/Mask`, CMYK/Indexed/Separation/DeviceN/Lab, CCITT/JBIG2/JPX and any other filter, Flate with bpc ≠ 8, TIFF predictor, Flate line-art (< 2048 colours), images < 96×96, and images < 6 KB. The report counts skips per reason (`jpx`, `ccitt`, `jbig2`, `cmyk`, …). |
| `ssim.ts` | The gate metric: luma SSIM over 8×8 windows with stride 4 (spike `compareCanvases`). **Change:** for images wider than 1200 px, downsample both images with a pure-JS 2×2 box average instead of OffscreenCanvas smoothing. The gate is then identical in every browser and in Node. |
| `dedupe.ts` | `dedupeStreams`, as in the spike. |
| `signature.ts` | `hasSignature(doc)` returns true if any of these holds: an indirect dict has `/Type /Sig`; a dict has `/FT /Sig` with a `/V`; a dict has a `/ByteRange` key; or the catalog has `/Perms`. |
| `engine.ts` | `compressPdf(bytes, {level, password, expectedPages, onProgress}, deps)` resolving to `{bytes, keptOriginal, report}`, implementing the pipeline in the Flow above. |
| `raster.ts` | `class RasterAssembler` with `addPage(rgba, w, h, ptW, ptH)` and `finish()` returning the PDF bytes. It encodes with MozJPEG q70 (1-channel when `isGray`), embeds with pdf-lib `embedJpg`, sizes each page from the pdf.js viewport at scale 1 (rotation already applied), and saves with `{useObjectStreams:true}`. |
| `report.ts` | `CompressReport`: level, inBytes, outBytes, keptOriginal, keptReason (`no-gain` or `raster-larger`), pages, imagesSeen, imagesReplaced, skipped (count per reason), minImageSsim, repairedBy (`pdf-lib` or absent), signed, ownerRestrictionRemoved, and ms per phase (normalize, images, optimize, verify). It contains no file names, no passwords and no qpdf logs. |

**Engine rules**
- **Normalize.**
  - Pass `--password=<pw>` only when the user gave one.
  - qpdf exit code 0 or 3 counts as success.
  - On failure, run the pdf-lib repair and then qpdf again (spike lines 329–337).
  - qpdf log lines are never returned or posted. They are only mapped to codes: a line matching "invalid password" (case-insensitive) → `wrong-password`; anything else → `corrupt`.
- **Page count.** After step 1, and again after a repair, the page count must equal `expectedPages` (from the pdf.js inspect). A mismatch throws `PdfCorruptError`. **Never return partial output.**
- **Skip placement parsing** when no image passes the cheap checks (subtype, size, bytes, SMask target, filter, colour space). This was the spike's measured hotspot, 17–25 s on text-heavy bundles.
- **Flate level.** Use 6 instead of 9 when the input is over 30 MB.
- **Metadata** stays unchanged (`updateMetadata:false`). Do not set Producer.
- **Kept original.** When the output length is at least 0.99 × the input length, the result is `keptOriginal` and the returned bytes are the input itself.
- **Progress.** `onProgress({phase, done, total})` with phase `normalize`, `images`, `optimize` or `verify`. The `images` phase reports once per candidate image.
- **Errors.** Reuse `src/lib/pdf/errors.ts` and add `verify` to `PdfErrorCode` (used by the main-thread check). OOM detection works as in merge.

### 4. Worker — `src/lib/pdf/compress.worker.ts` (module worker)
- **Input messages:**
  - `compress` with `{bytes, level, password?, expectedPages}`. `bytes` is transferred; the controller keeps its own copy for re-runs.
  - For raster: `raster-begin` with `{pageCount}`, then one `raster-page` with `{rgba, width, height, ptW, ptH}` per page (buffer transferred), then `raster-end` with `{inBytes}`.
- **Output messages:**
  - `progress` with `{phase, done, total}`
  - `done` with `{bytes, keptOriginal, report}`, `bytes` transferred
  - `error` with `{code}`
  - `raster-ack` with `{page}`. This is back-pressure: the controller renders page i+1 only after the ack for page i, so at most two pages are in memory.
- `password` is used only for the qpdf call. It is never echoed back or logged.
- Cancel is `worker.terminate()` from the controller, which frees all WASM memory. Each run gets a new worker.

### 5. Tool page `/pdf-compress/`
Files:
- `src/pages/pdf-compress/index.astro`
- `src/tools/pdf-compress/controller.ts`
- `src/tools/pdf-compress/limits.ts`
- `src/tools/pdf-compress/check.ts`: the main-thread result checker, pure, over a small pdf.js-like interface
- `src/lib/pdf/raster-render.ts`: main-thread pdf.js page → RGBA, reusing the pdf.js options from `inspect.ts`

#### 5.1 Server-rendered content
- H1: "PDF 용량 줄이기".
- Lead: "스캔하거나 사진이 들어간 PDF의 용량을 줄입니다. 글자는 그대로 두고 이미지만 줄이며, 파일은 서버로 전송되지 않습니다."
- Title follows the §5 pattern.
- Description: 80–120 characters, containing "PDF 용량 줄이기". Base it on: "파일 업로드 없이 브라우저에서 PDF 용량 줄이기. 스캔·사진이 든 PDF를 선명하게 유지하면서 줄이고, 글자는 선택·검색 가능한 그대로 둡니다. 회원가입 없이 무료."
- 사용 방법, 3 steps: 파일 선택 → 단계 고르기 → 내려받기.
- 안전한 이유, the AdSlots (empty for now), JSON-LD, and 관련 도구 (5.5).
- FAQ, 6 questions:
  - 얼마나 줄어드나요: scan and photo PDFs shrink 85–96 % on 권장, and text-heavy documents 4–25 %. These are the spike ranges; state them as "시험한 파일 기준".
  - 글자가 흐려지나요: no. Text is not converted, except with 이미지로 변환.
  - 비밀번호 PDF.
  - 용량 제한: the numbers from 5.4.
  - 전자서명·발급 문서: the signature warning.
  - 휴대폰에서도 되나요: name no specific browsers.

#### 5.2 States
The states are empty → ready → working → done, kept or error. One `aria-live="polite"` region announces state changes.

**empty**
- A labelled file input (`accept="application/pdf,.pdf"`), styled as the button "PDF 파일 선택".
- A drop area with the text "또는 여기에 파일을 끌어다 놓으세요". Only this area accepts drops.
- One file at a time. Picking another file replaces the current one.
- "파일은 이 기기 밖으로 전송되지 않습니다." with a /privacy/ link, next to the picker.

**ready**
- A file card: name, `N쪽`, size, and a page-1 thumbnail in a fixed 160×226 box.
- A password field when the file is `user`-encrypted. Copy and behaviour are the same as in merge: the password is held in memory only and cleared on reset.
- The owner notice when the file is `owner`-restricted.
- A level fieldset with the legend "압축 단계" and radios, **권장 checked**. Each radio's description is linked with `aria-describedby`:
  - 고화질 (적게 줄이기): "이미지를 200 ppi까지만 낮춥니다. 원본과 거의 구분되지 않아 인쇄할 문서에 알맞습니다."
  - 권장: "이미지를 150 ppi로 맞춥니다. 화면과 일반 인쇄에서 선명하게 읽혀 제출용 서류에 알맞습니다."
  - 강력: "이미지를 110 ppi로 낮추고 더 압축합니다. 화면에서는 읽을 수 있지만 확대하면 흐려질 수 있습니다."
  - A common line under the three: "세 단계 모두 글자와 선은 그대로 두고 이미지만 줄입니다."
- Below the fieldset, a separate `details` element "더 줄여야 하나요?". It contains the 4th radio, **이미지로 변환**, and a warning box (`role="note"`): "모든 쪽을 150 dpi 이미지로 바꿉니다. 글자를 선택하거나 검색할 수 없게 되고, 입력 칸·링크·책갈피가 사라집니다. 글자 위주 문서는 오히려 커질 수 있으며, 그때는 원본을 그대로 둡니다."
- The button "PDF 용량 줄이기", disabled until the file is unlocked.

**working**
- A phase text and a `progress` element:
  - "구조 정리 중…"
  - "이미지 줄이는 중… (3/12)"
  - "마무리 중…"
  - "결과 확인 중…"
  - raster: "쪽을 이미지로 바꾸는 중… (4/20)"
- "취소" terminates the worker and bumps the run token. It returns to **ready** with the file, password and level kept.

**done**
- A headline "12.4 MB → 1.3 MB" and "89 % 줄었습니다", plus `N쪽`. The percent is floor(100 × (1 − out/in)), always between 1 and 100.
- A page-1 preview side by side, labelled "원본" and "결과":
  - stacked below 480 px width
  - each in a fixed-aspect box sized from page 1's aspect ratio, so there is no CLS
  - rendered by pdf.js at 240 CSS px × min(DPR, 2)
- If `report.signed`, a warning box: "이 파일에는 전자서명이 들어 있습니다. 용량을 줄인 파일에서는 서명이 더 이상 유효하지 않습니다. 발급받은 증명서처럼 서명이 필요한 문서는 원본을 제출하세요."
- If the input was password-protected: "줄인 파일에는 비밀번호가 걸려 있지 않습니다."
- 내려받기 is an `a download` link pointing at a blob URL.
  - Filename: `{base}_압축.pdf`, or `{base}_이미지변환.pdf` for raster.
  - Use the shared sanitizer, and limit it to 80 characters.
- "다른 단계로 다시 줄이기" returns to **ready** with the file kept. "처음부터" resets the tool.
- Revoke blob URLs on reset, on a re-run and on `pagehide`.
- A link: "여러 파일을 하나로 묶으려면 PDF 합치기" → `/pdf-merge/`.

**kept** (no download is offered)
- Normal levels: "이미 최적화된 파일입니다. 줄일 수 있는 이미지가 없어 원본을 그대로 둡니다."
  - When `skipped.jpx > 0`, add: "이 파일의 이미지는 JPEG2000 형식이라 아직 줄이지 못합니다."
  - When `skipped.ccitt + skipped.jbig2 > 0`, add: "흑백 스캔 이미지는 이미 작게 저장되어 있습니다."
  - If the level was 고화질 or 권장 and `imagesSeen > imagesReplaced`, show the suggestion button "강력으로 다시 줄이기".
- Raster: "이미지로 바꾸면 오히려 커져서 원본을 그대로 둡니다. 이 파일에는 이 방법이 맞지 않습니다."

**Main-thread result check** (before showing done)
- Open the output with pdf.js. Its page count must equal the input's.
- For the three normal levels, `pageText` (whitespace-stripped, as in the harness) of the first, middle and last page must also equal the original's.
- Any failure discards the output and shows error `verify`: "결과 파일을 검증하지 못해 원본을 그대로 둡니다. 다른 단계로 다시 시도해 주세요."

**Errors** (two sentences each, per docs/COPY.md)
- not-pdf, corrupt, unknown and verify.
- oom: "기기 메모리가 부족합니다. 더 작은 파일로 시도하거나 PC에서 이용해 주세요."
- wrong-password is shown inline.
- Reuse the merge copy wherever the meaning is the same.

#### 5.3 Performance
- Initial page JS is the controller only, ≤ 30 KB gzip.
- pdf.js is imported when the first file is picked.
- The worker (pdf-lib and the jsquash glue) and all wasm load only when "PDF 용량 줄이기" is pressed.
- Raster rendering:
  - one page at a time, with `maxLongPx 3000`
  - the canvas is zeroed after `getImageData`
  - back-pressure through `raster-ack`
  - the run token is checked between pages

#### 5.4 Limits
Constants live in `src/tools/pdf-compress/limits.ts`. Basis: spike §3.4 (40.7 MB → +709 MB peak; 74 MB → +1.5 GB).

| Device | Soft limit (inline confirm "계속 줄이기" / "취소") | Hard limit (block) |
|---|---|---|
| Desktop | > 40 MB or > 1,000쪽 | > 100 MB |
| Mobile | > 20 MB or > 300쪽 | > 50 MB |
| Raster, desktop | > 200쪽 | > 500쪽 |
| Raster, mobile | > 30쪽 | > 100쪽 |

- Every message states the number and the reason, for example: "휴대폰에서는 50 MB까지 줄일 수 있습니다. 기기 메모리가 부족해 브라우저가 멈출 수 있기 때문입니다."
- Byte limits are checked when the file is picked. Page limits are checked after inspect, and again when the level changes.

#### 5.5 Site wiring
- `src/data/tools.ts`: set `pdf-compress` to `status:'live'` and fill in its description, faq and keywords. The sitemap picks it up through `LIVE_TOOLS`.
- The home card becomes a link with "사용하기". This should follow automatically from the status; verify it.
- New `src/components/RelatedTools.astro` lists the other `live` tools (name, summary, link). Place it after the FAQ on both tool pages, above the footer AdSlot.
- In the merge page's done state, add "합친 파일의 용량이 크다면 PDF 용량 줄이기에서 줄일 수 있습니다." linking to `/pdf-compress/`.
- The UI font subset is regenerated from `src/` at build. Confirm that the new characters are covered: no fallback glyphs in the screenshot.
- `docs/COPY.md`: add "ppi" and "dpi" as allowed terms, with the rule "쓸 때는 설명과 함께".

### 6. Bundle budget
Enforced in `scripts/check-dist.mjs`, measured as gzip -9 sizes.

| Asset | Budget |
|---|---|
| Each page's initial JS (unchanged gate 8) | ≤ 30 KB |
| `compress.worker*.js` | ≤ 330 KB |
| `vendor/qpdf/*/qpdf.wasm` | ≤ 480 KB |
| MozJPEG enc + dec wasm | ≤ 140 KB |
| resize wasm | ≤ 30 KB |

A breach fails the build with the file name and size. Paste the actual table into REVIEW-REQUEST.

## Failure modes

| Path | Realistic failure | Handling (test) | User sees |
|---|---|---|---|
| qpdf normalize | Broken xref (qpdf-wasm has no reconstruction) | pdf-lib repair → qpdf retry (unit + regress `edge_damaged_badxref`) | Normal result |
| qpdf normalize | Truncated file | pdf.js inspect fails first; engine page-count check as backstop (unit) | Corrupt message |
| Repair | pdf-lib "recovers" a truncated file with fewer pages | Page count ≠ expected → corrupt (unit: engine called directly with the intact file's `expectedPages`) | Corrupt message |
| Decrypt | Wrong password reaches the worker | pdf.js check first; qpdf "invalid password" → wrong-password (unit) | Inline message |
| Image pass | A recompressed image looks bad | SSIM gate, one retry, else the original image is kept (regress page SSIM) | Nothing; the image is kept |
| Image pass | Exotic image (JPX, CMYK, 16-bit, Indexed) | Skipped by rule and counted (unit per rule) | Kept message if there is no gain |
| Image pass | Content-stream parser meets garbage | Per-page try; fallback to the largest page, which is conservative (unit, junk stream) | Normal result |
| Image pass | Stack overflow from a giant token | 256-byte cap (unit) | – |
| Optimize | Output larger, or no gain | keptOriginal (unit) | Kept message, no download |
| Output | Text or page damage nobody predicted | Main-thread pdf.js check of pages and 3 pages' text → `verify` (unit on `check.ts` with crafted mismatches) | Verify message, no download |
| Signed PDF | The signature is invalidated | Detected; warning in the done state (unit with a crafted /Sig fixture; e2e) | Warning box |
| Memory | Tab OOM on a large file | Limits, oom mapping; a worker crash (`onerror`) → unknown | Message, file kept |
| Cancel | Late worker message after cancel | Run token + terminate (e2e) | Ready state |
| Raster | A text PDF gets bigger | keptOriginal with reason `raster-larger` (unit + regress + e2e) | Kept message |
| Raster | Huge page (A0 poster) | `maxLongPx 3000` (unit on the scale function) | Normal result |
| WASM load | Wrong MIME type or a 404 on Cloudflare | Emscripten falls back to an ArrayBuffer; any failure → unknown; the live smoke test checks MIME types | Unknown message |

No row is "no test + no handling + silent".

## Tests

### Fixtures
They live in `tests/fixtures/`, whose total must stay ≤ 3 MB. Add each one to SOURCES.md.

**Generated by `tests/fixtures/build.mjs`, outputs committed.** The script runs at dev time and uses `@napi-rs/canvas`, plus our own engine where stated.
- `gen_scan_a6.pdf`, ≤ 800 KB.
  - Render `kr_law_form.pdf` page 1 at 150 dpi and place it on an **A6** page, which gives an effective 300 ppi scan.
  - Apply the spike's MFP recipe (`spikes/pdf/harness/gen.cjs`): paper tone rgb(246,244,238), 0.6 px blur, 0.35° skew, seeded noise ±9 using the spike LCG with seed 12345, colour JPEG q92.
- `gen_photo_resume.pdf`, ≤ 700 KB: `kr_law_form.pdf` page 1 (real Korean text) plus a seeded, smooth colour "photo", 1800×2400 JPEG q92, drawn at 3×4 cm.
- `gen_already_small.pdf`: our 권장 output of `kr_law_form.pdf`. A unit test asserts it still comes back `keptOriginal`, so the fixture cannot go stale silently.

**Generated at test time, never committed:**
- `encrypted_userpw_1234` (the existing helper)
- an owner-restricted copy of kr_law_form (qpdf `--encrypt` with an empty user password, owner password `owner`, 256-bit)
- `damaged_badxref`, `truncated` and `not_a_pdf`
- `signed_fake`: kr_law_form plus an AcroForm `/FT /Sig` field whose `/V` has `/ByteRange` and `/Contents`
- `jpx_only`: a page with one `/JPXDecode` image stream of arbitrary bytes
- `cmyk_jpeg`
- `junk_content`: page content with an unbalanced `q`, garbage tokens and a 1 MB token
- `big_21mb`: a valid PDF padded with a large unused stream, used only for the mobile soft-limit e2e test

### Unit (`tests/unit/compress*.test.ts`, Node)
- **Levels on `gen_scan_a6`:**
  - reduction: 고화질 ≥ 40 %, 권장 ≥ 70 %, 강력 ≥ 80 %
  - sizes are monotonic: 강력 ≤ 권장 ≤ 고화질
  - `report.minImageSsim` ≥ the level's gate
  - page count unchanged
- **`gen_photo_resume` on 권장:** reduction ≥ 80 %, and the pdf.js text of every page is identical to the original's.
- **`kr_law_form` and `irs_fw9`:** every level keeps the page count and the per-page text identical. `irs_fw9` also keeps its field count.
- **`gen_already_small`:** `keptOriginal`, and the returned bytes are the input.
- **Encrypted:**
  - no password → password-required
  - `1234` → text equals kr_law_form
  - wrong password → wrong-password
  - owner-restricted → succeeds, with `ownerRestrictionRemoved`
- **Damaged:**
  - `damaged_badxref` → succeeds with `repairedBy: pdf-lib`
  - `truncated` → corrupt (call the engine directly with `expectedPages` from the intact file)
  - `not_a_pdf` → not-pdf
- **Skip rules:**
  - `jpx_only` → `skipped.jpx = 1`, kept
  - `cmyk_jpeg` → `skipped.cmyk`
  - SMask, ImageMask, `/Decode` and line-art Flate are each covered by a small generated image
- **Performance paths:**
  - placement parsing is skipped when there are no candidates (spy on `imagePlacements`)
  - `junk_content` → no throw, and the fallback placement is used
  - Flate level 6 is chosen above 30 MB (a unit test on the argument builder, not a 30 MB file)
- **Signature:** `hasSignature` is true on `signed_fake` and false on kr_law_form.
- **SSIM:**
  - identical images → 1
  - the box-downsample path is used above 1200 px
  - a known pair gives the expected value (± 1e-6), against a small checked-in vector
- **Raster:**
  - `RasterAssembler` with 2 synthetic pages (one gray, one colour) → 2 pages with the correct sizes, and the gray page is encoded 1-channel
  - the raster scale function caps the long side at 3000 px
- **Checker (`check.ts`):** passes on equal text; fails on a page-count mismatch and on a text mismatch.
- **Limits and formatting:** every row of 5.4, and the percent/format helpers (floor, range 1–100, "12.4 MB → 1.3 MB").
- **qpdf log mapping:** "invalid password" → wrong-password; anything else → corrupt; log text never appears in a thrown message.
- **Step 0 tests:** the font-rename guard and `withFileIndex`.
- **Network guard:** the allowlist names exactly the wasm loader file.

### E2E (`tests/e2e/pdf-compress.spec.ts`)
Runs in all 5 projects. Every test uses the no-upload helper.
- **Lazy load:** after the page loads, and after a file is picked, there is no request for qpdf, MozJPEG, resize or the compress worker. They appear only after the button is pressed.
- **Happy path, 권장 on `gen_scan_a6`:**
  - the before/after sizes and "% 줄었습니다" are shown
  - both previews render
  - parse the download in Node: same page count, and at least 70 % smaller
- **Level switch:** run 강력, then "다른 단계로 다시 줄이기" with 고화질. The 강력 result is smaller.
- **Kept:** `gen_already_small` → the kept message, and no download link.
- **Password:** a wrong password, then the right one. The done state shows "비밀번호가 걸려 있지 않습니다".
- **Owner-restricted:** the notice is shown.
- **Bad inputs:** the not-pdf and truncated messages appear.
- **Signed:** the warning is shown for `signed_fake`. Copy it into the e2e runtime dir, as with the encrypted fixture.
- **Raster:**
  - open "더 줄여야 하나요?" and pick 이미지로 변환; the warning is visible
  - on `gen_scan_a6` it completes, with a matching page count
  - on `kr_law_form` it ends with the kept (raster-larger) message
- **Cancel:** delay the compress worker script with `context.route`, as the merge test does. Cancel; the tool returns to ready with the file and level kept. Then run it to completion.
- **Mobile soft limit** (the 2 mobile projects): `big_21mb` shows the confirm panel. "취소" keeps the file; "계속 줄이기" starts the run (cancel it right away).
- **Keyboard:** a keyboard-only happy path on the desktop projects.
- **axe:** `/pdf-compress/` in the empty state, the ready state (with the details open) and the done state; also `/` and `/pdf-merge/` again.
- **SEO:**
  - the sitemap lists exactly `/`, `/pdf-merge/`, `/pdf-compress/`, `/privacy/` and `/licenses/`
  - one H1, the canonical, and parseable JSON-LD
  - the home card links to `/pdf-compress/`
  - the merge done state links to it
  - RelatedTools is present on both tool pages

### Regression harness — `npm run regress:compress`
The script is `scripts/regress/compress.mjs`. It runs in Node, locally.
- **Inputs:** it runs the real engine (with the Node deps) on the committed fixtures, always, and on every PDF in `CORPUS_DIR` (default `spikes/pdf/corpus`). If the corpus is absent, it skips it with a notice. Password: `edge_encrypted_userpw_1234.pdf` → `1234`.
- **Metrics** are those of spike `bench_compress.cjs`, ported exactly:
  - pdf.js render at **110 dpi, long side ≤ 1800 px**
  - luma SSIM, 8×8 windows, stride 4 (spike `compareCanvases`, not the merge harness metric)
  - up to 7 sampled pages (spike `sample`)
  - text equality on all pages when the file has ≤ 60 pages, otherwise on the sample
  - size %, ms, and images replaced/seen
- **Baseline:** `scripts/regress/compress-baseline.json` holds the spike numbers per file × level, taken from `spikes/pdf/work/compress_results.json`. Commit only file names and numbers.
- **Pass rules for the normal levels:**
  - text equal on 100 % of checked pages, and page count equal
  - reduction ≥ the spike figure − 3 points. A file where the spike was < 1 % may come back `keptOriginal`.
  - SSIMmin ≥ the spike figure − 0.005
  - these named floors (권장 unless stated):

    | File | Reduction | SSIMmin |
    |---|---|---|
    | synth_scan_mfp_gongmun (스캔 공문) | ≥ 93 % | ≥ 0.94 |
    | synth_scan_phone_cv | ≥ 82 % | ≥ 0.96 |
    | synth_resume_kr_photo | ≥ 93 % | ≥ 0.99 |
    | scan_keti_bizreg_bank | ≥ 7 % | ≥ 0.99 |
    | kr_kpmg_outlook (40 MB, encrypted) | ≥ 18 % | ≥ 0.96, text 51/51 |
    | kr_gongmun_ice (583쪽) | ≥ 10 % | – |
    | synth_scan_mfp_gongmun 고화질 / 강력 | ≥ 84 % / ≥ 95 % | ≥ 0.95 / ≥ 0.92 |
    | edge_damaged_badxref | ≥ 9 % | – |
    | edge_damaged_truncated | error `corrupt` | – |
    | scan_book_sangsomun (JPX), scan_donga_1949 (CCITT) | kept, or ≤ 2 % | – |
- **Raster:** kr_kpmg_outlook ≥ 71 % at SSIMmin ≥ 0.93. Every text-first file (spike raster < 0 %) comes back `keptOriginal`.
- **Timing:** report ms. Flag any file that takes more than 2 × the spike time in REVIEW-REQUEST; this is not a failure.
- **Output:** a table in `regress-out/compress.md`. Paste it into REVIEW-REQUEST.
- If Node rendering (`@napi-rs/canvas`) shifts SSIM systematically compared with the spike's Chromium numbers, report both under Blocked. **Do not lower a threshold.**
- `scan_keti_bizreg_bank.pdf` stays in the local corpus only and is never committed, because it shows an institution's bank account.

## Flags (do not guess; write under "Blocked")
- A committed-fixture or regress threshold is missed. Report the numbers; Arch sets the value.
- The source of the qpdf-wasm wrapper's license text (see 1).
- `@jsquash/*` cannot initialise in a module worker on Firefox or WebKit. Report it with the stack trace. Do not switch to the canvas encoder silently; the spike measured it at +37–62 % larger.
- pdf.js cannot render a page for raster in some browser. Report it. Do not move pdf.js into the worker in this step.
- No new product behaviour beyond this brief, such as a target-size mode or multi-file batches.

## Out of Scope (→ BUILD-LOG Known Gaps)
- A "목표 용량" mode (for example "10 MB 이하로"). Demand is probably high; the owner decides whether it becomes a later step.
- Several files per run.
- JPX recompression for 강력 (decode through pdf.js openjpeg).
- Converting B/W scans to CCITT G4 or JBIG2.
- Keeping PDF/A conformance (object streams break PDF/A-1).
- Warning about signatures *before* processing, which needs a pre-flight pass.
- Password re-protection of the output.
- A self-built qpdf-wasm with xref recovery and WORKERFS.
- Handing a merged file straight to the compressor across pages.

## Acceptance
- Every §3 quality gate is green, including Lighthouse on `/pdf-compress/` and the bundle budgets in 6.
- Unit, e2e (5 projects, no-upload on every test) and `regress:compress` meet the thresholds above. `regress:merge` is unchanged.
- `check:licenses` is green. `/licenses/` shows:
  - qpdf (Apache-2.0) with libjpeg-turbo and zlib
  - the ISC wrapper
  - `@jsquash/jpeg` with MozJPEG
  - `@jsquash/resize` with its codecs
- `dist/` contains `/pdf-compress/`. The sitemap lists it, and the home card and the merge page link to it.
- The font-rename guard checks every name record, and the `unknown` mapping has a unit test.
- Richard's Gate 11 manual run includes one real scan PDF and one text PDF in real Chrome, Firefox and Edge.

## Deploy gate (Step 2)
1. Richard writes "Step 2 is clear".
2. Arch commits locally (`[Step 2] PDF 용량 줄이기 …`) and updates BUILD-LOG and the checkpoint.
3. A push to `main` publishes to Cloudflare Pages. The orchestrator pushes under the owner's standing instruction, then runs the live smoke test on https://doc-tools-kr.pages.dev:
   - `/pdf-compress/` returns 200 with the CSP header, `/sitemap.xml` lists it, and the home card links to it
   - `qpdf.wasm` and the MozJPEG wasm are served as `application/wasm`, and `qpdf.mjs` as JavaScript
   - compressing `gen_scan_a6.pdf` on 권장 in real Chrome gives a result at least 70 % smaller with the preview visible, and no non-GET or cross-origin request
   - a text PDF (kr_law_form) gives a result or the kept message, never a larger file
4. If the smoke test fails, the orchestrator reverts the Step 2 commit and pushes. Log it and reopen the step.
