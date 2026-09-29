# Architect Brief — 안올림 (doc-tools-kr) — Program plan + Step 1

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
| **1** | Foundation + **PDF 합치기** `/pdf-merge/` | 53,930 | GO (mergePlus proven) | Full spec below |
| 2 | **PDF 용량 줄이기** `/pdf-compress/` | 26,210 | GO | After Step 1 is deployed |
| 3 | **사진 용량 줄이기** `/photo-compress/` | 29,000 | GO | After Step 2 |
| 4 | **여권·증명사진 규격** `/id-photo/` | 56,600 | GO, as auto-frame plus confirmation. 5.6 MB model. Presets need re-verification. | After Step 3 |
| 5 | **HWP → PDF** `/hwp-to-pdf/` | 11,930 + 8,330 | GO with conditions | **Gated** on a re-test with a corpus of 100+ files: broken ≤ 5 %, no page-count mismatches, and a Wilson 95 % upper bound < 10 % |

**Why this order:**
- Step 2 comes before Step 3 even though its demand is slightly lower. It reuses Step 1's PDF infrastructure: the worker, pdf.js, and password and damage handling.
- Step 4 has the highest demand but the most UX and legal surface. It waits until Step 3 has proven the photo encoder.

### Later steps (brief — each gets a full brief when it starts)

**Step 2 — PDF 용량 줄이기**
- Port `compress()` from `spikes/pdf/harness/lib.mjs` into a worker. The pipeline is qpdf decrypt → pdf-lib image pass (MozJPEG, Lanczos, SSIM gate) → qpdf objstm/Flate.
- Levels are 고화질, **권장 (default)** and 강력, as in spike §3.2.
- "이미지로 변환" is out of v1 and goes to Known Gaps.
- If compression gains nothing, return the original and say so.
- Show before/after sizes and a pdf.js preview of page 1.
- Performance:
  - Skip content-stream parsing when no image is above the trigger.
  - Use Flate level 6 for inputs over 30 MB.
- Regression thresholds:
  - Text equality on 100 % of sampled pages.
  - 권장 SSIMmin ≥ 0.94 on the synth scans.
  - Output size no more than 3 points worse than the spike figure.

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
   - Initial JS ≤ 30 KB gzip per page. Engines load only after a file is picked.
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
- **A push to `main` deploys to production and needs the owner's explicit go-ahead.**
- Anything marked **Flag** must not be guessed. Record it under "Blocked".

Commit message format:
```
[Step N] <short description>

Built: ...
Reviewed: ...
Decisions: ...
```

---

# Step 1 — Build spec: Foundation + PDF 합치기

## Goal
The repo becomes an Astro static site that looks the same as the current landing page and ships:
- a tested, no-upload **PDF 합치기** at `/pdf-merge/`
- `/privacy/` and `/licenses/`
- a sitemap
- every quality gate wired

## Build Order

### A. Scaffold (keep the look)

1. **Repo root files**
   - `package.json`: private, exact pins.
   - `astro.config.mjs`.
   - `tsconfig.json`: extends `astro/tsconfigs/strict`.
   - `.node-version`: `22`.
   - `.gitignore`: add `dist/`, `public/vendor/`, `public/fonts/pretendard/`, `src/generated/`, `test-results/`, `playwright-report/`, `regress-out/` and `.lighthouseci/`. Keep `spikes/` ignored.

2. **`astro.config.mjs`**
   - `output:'static'`
   - `site: process.env.PUBLIC_SITE_URL ?? 'https://doc-tools-kr.pages.dev'`
   - `trailingSlash:'always'`
   - `build:{format:'directory', inlineStylesheets:'never'}`
   - `vite:{build:{sourcemap:false}, worker:{format:'es'}}`

3. **Port the landing page**
   - Move `site/styles.css` to `src/styles/global.css` unchanged. The only change is the font source (A4).
   - Move `site/index.html` to `src/pages/index.astro`, rendered through `src/layouts/Base.astro`.
   - Base owns:
     - `<head>`: title, description, canonical, OG, theme-color, favicon, JSON-LD slot
     - header, skip link and footer
   - Footer gains links to 개인정보 처리방침 and 오픈소스 라이선스.
   - On pages other than home, the nav anchors become `/#tools`, `/#privacy` and `/#faq`.
   - The PDF 합치기 card becomes a link to `/pdf-merge/` with the status "사용하기". Other cards stay "곧 공개".
   - Delete `site/` once the port is done.
   - Apart from these changes, the page must look identical. Compare screenshots before and after.

4. **Self-host Pretendard**
   - `scripts/copy-vendor.mjs` runs as `predev` and `prebuild`.
   - It copies `pretendard@1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.css` and its woff2 files to `public/fonts/pretendard/`.
   - Remove the jsDelivr `<link>` and the preconnect.

5. **Vendor pdf.js** (same script)
   - Copy from `pdfjs-dist@6.3.289` into `public/vendor/pdfjs/6.3.289/`:
     - `build/pdf.worker.min.mjs`
     - `cmaps/`
     - `standard_fonts/`
     - `wasm/`, if it exists in this version
   - The path is versioned so it can be cached as immutable.

6. **`public/_headers`** (replaces `site/_headers`):
   ```
   /*
     X-Content-Type-Options: nosniff
     Referrer-Policy: strict-origin-when-cross-origin
     Permissions-Policy: camera=(), microphone=(), geolocation=()
     Cross-Origin-Opener-Policy: same-origin
     Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self'; img-src 'self' data: blob:; font-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'
   /_astro/*
     Cache-Control: public, max-age=31536000, immutable
   /vendor/*
     Cache-Control: public, max-age=31536000, immutable
   /fonts/*
     Cache-Control: public, max-age=31536000, immutable
   https://:hash.doc-tools-kr.pages.dev/*
     X-Robots-Tag: noindex
   ```
   - The e2e server `tests/e2e/serve.mjs` serves `dist/` and applies the `/*` block from `public/_headers`, so tests run under the real CSP. `astro preview` ignores `_headers`.
   - Flag: if Astro emits an executable inline `<script>`, configure it to emit external scripts instead. **Never add `'unsafe-inline'` to `script-src`.**

7. **Data and components**
   - `src/data/site.ts`: name, `ADS_ENABLED=false`, verification env values.
   - `src/data/tools.ts`: all 5 tools. Only `pdf-merge` is `live`.
   - `src/components/AdSlot.astro` (§5).
   - `src/components/JsonLd.astro`.

8. **Utility pages and assets**
   - `src/pages/404.astro`: Korean, with a link home.
   - `src/pages/sitemap.xml.ts` and `public/robots.txt`.
   - `public/og.png`: 1200×630, brand #0f766e, text "안올림" + "파일을 올리지 않는 서류 도구", ≤ 80 KB.

9. **Legal pages**
   - `src/pages/privacy/index.astro`.
   - `src/pages/licenses/index.astro`, fed by `scripts/gen-licenses.mjs` → `src/generated/licenses.json`. That script runs in `prebuild`.
   - Content per §4.

10. **Copy guide:** `docs/COPY.md` (§5).

### B. PDF engine — `src/lib/pdf/` (framework-free, runs in Node)

1. **`mergePlus.ts`**
   - A typed port of `spikes/pdf/harness/merge_plus.mjs` (147 lines). Same algorithm: link dests detached and reattached, AcroForm fields merged with `_N` renaming, outline copy with optional per-file root.
   - Signature:
     ```ts
     export interface MergeInput { bytes: Uint8Array; password?: string; pages?: number[] | null; rotate?: number[]; title?: string }
     export interface MergeReport { renamedFields: number; droppedLinkDests: number; remappedLinkDests: number; pageCount: number }
     export async function mergePlus(files: MergeInput[], opts?: { addFileBookmarks?: boolean }): Promise<{ bytes: Uint8Array; report: MergeReport }>
     ```
   - Keep load options `{password, updateMetadata:false, throwOnInvalidObject:false}`.
   - Keep save options `{useObjectStreams:true, updateFieldAppearances:false}`.
   - Metadata: set only Producer = `안올림 (doc-tools-kr)`.
   - Import only from `@cantoo/pdf-lib`. The original `pdf-lib` must not appear in the repo.

2. **`errors.ts`**
   - Error classes:
     - `PdfNotPdfError`: no `%PDF-` in the first 1024 bytes.
     - `PdfPasswordRequiredError`.
     - `PdfWrongPasswordError`.
     - `PdfCorruptError`.
   - `mergePlus` maps load failures to these classes.
   - A truncated file must throw `PdfCorruptError`. **Never return partial output.**

3. **`verify.ts`**
   - `verifyOutput(bytes, expectedPages)` reloads the output with cantoo and asserts the page count.
   - On mismatch it throws `PdfCorruptError('verify')`.
   - The worker always runs this check before replying.

4. **`merge.worker.ts`** (module worker)
   - Input message: `{type:'merge', files, addFileBookmarks}`. The file ArrayBuffers are transferred, not copied.
   - Output messages:
     - `{type:'progress', done, total}`, sent after each file.
     - `{type:'done', bytes, report}`, with `bytes` transferred.
     - `{type:'error', code, fileIndex?}`, where `code` is one of `not-pdf | password | wrong-password | corrupt | oom | unknown`.
   - Map `RangeError` and "out of memory" failures to `oom`.

5. **`inspect.ts`** (main thread; pdf.js is imported dynamically on the first file)
   - Signature: `inspect(bytes, password?) → {pageCount, encrypted:'none'|'owner'|'user', thumbnail}`.
   - `getDocument` options:
     - `data: bytes.slice()`. Pass a **copy**, because pdf.js transfers the buffer.
     - `password`
     - `isEvalSupported:false`
     - `cMapUrl:'/vendor/pdfjs/6.3.289/cmaps/'`, `cMapPacked:true`
     - `standardFontDataUrl` and `wasmUrl`, pointing into the same vendor directory
   - `GlobalWorkerOptions.workerSrc` is the vendored worker.
   - Encryption status:
     - `PasswordException` → `user`.
     - `getPermissions() !== null` → `owner`.
   - Render the page-1 thumbnail at a width of 160 px, then call `destroy()` on the document.

### C. Tool page `/pdf-merge/`
Files: `src/pages/pdf-merge/index.astro` and `src/tools/pdf-merge/controller.ts`.

#### 1. Server-rendered content (SEO)
- H1: "PDF 합치기".
- Lead: "여러 PDF 파일을 한 파일로 합칩니다. 파일은 서버로 전송되지 않고 이 브라우저 안에서만 처리됩니다."
- The tool UI.
- 사용 방법 (3 steps).
- 안전한 이유.
- FAQ, 5 questions: 용량 제한, 비밀번호 PDF, 서식·책갈피 유지, 모바일, 저장 위치.
- AdSlots, which render empty for now.
- JSON-LD.
- Title: "PDF 합치기 — 업로드 없이 브라우저에서 무료로 | 안올림".
- Description, 80–120 characters. Base it on: "파일 업로드 없이 브라우저에서 PDF 합치기. 여러 PDF를 원하는 순서로 한 파일로 묶고 서식·책갈피·링크도 그대로 유지합니다. 회원가입 없이 무료."

#### 2. UI state machine
- States: `empty → listing → merging → done | error`.
- One `aria-live="polite"` status region announces state changes.

**Add files**
- A visible `<label>` and `<input type="file" accept="application/pdf,.pdf" multiple>`, styled as the button "PDF 파일 선택".
- A drop area with the text "또는 여기에 파일을 끌어다 놓으세요". Only this area accepts drops; the page does not hijack them.
- "파일 추가" remains available in the `listing` state.
- A non-PDF gets an inline per-file error. The other files are kept.

**File list (`<ol>`) — each item shows:**
- A thumbnail in a fixed-size 160×226 placeholder, so there is no CLS.
- The file name, `N쪽`, and the size in MB.
- For an owner-restricted file, the notice "보안 설정(편집 제한)이 해제된 사본이 만들어집니다".
- The buttons 위로, 아래로 and 삭제.
  - Each `aria-label` includes the file name.
  - All three work from the keyboard.
  - After a move, focus follows the moved item and the status region announces its new position.
  - Pointer drag-reorder is optional.

**Password-protected file**
- An inline field in the item: "이 파일은 비밀번호로 보호되어 있습니다", with a 확인 button.
- A wrong password shows "비밀번호가 맞지 않습니다."
- The password is held only in memory. It is never logged, stored or put in the URL. It is cleared on remove or reset.
- The merge button stays disabled until every file is unlocked.
- After merging, the result says "합친 파일에는 비밀번호가 걸려 있지 않습니다."

**Option**
- Checkbox "파일마다 책갈피 추가", checked by default.

**Merge**
- The button "PDF 합치기" is enabled only when there are ≥ 2 files and all of them are unlocked.
- While merging:
  - show "합치는 중… (2/5)" and a `<progress>`
  - 취소 terminates the worker and returns to `listing` with the files intact

**Done**
- A summary such as "12쪽 · 3.4 MB".
- 내려받기 is an `<a download>` pointing at a blob URL.
- Filename: `{first base name}_외{n-1}건_합침.pdf`.
  - Strip Windows-reserved characters (backslash, slash, colon, asterisk, question mark, double quote, angle brackets, pipe) and control characters.
  - Limit it to 80 characters.
- 처음부터 resets the tool. Revoke the blob URL on reset and on `pagehide`.
- If `renamedFields > 0`, add: "같은 이름의 입력 칸 {n}개의 이름을 바꿔 모두 입력할 수 있게 했습니다."

**Errors** (each names the file where relevant)
- corrupt: "파일이 손상되었거나 다운로드가 완료되지 않았습니다. 원본을 다시 받아주세요."
- oom: "기기 메모리가 부족합니다. 파일 수를 줄여 나눠서 합쳐 주세요."
- unknown: "처리 중 문제가 생겼습니다. 새로고침 후 다시 시도해 주세요."

#### 3. Limits
Constants live in `src/tools/pdf-merge/limits.ts`.

| Device | Soft limit (warn + confirm) | Hard limit (block) |
|---|---|---|
| Desktop | total > 200 MB or > 1,500쪽 | total > 500 MB |
| Mobile | total > 50 MB | total > 150 MB |

- At most 50 files.
- Every limit message states the number and the reason.
- Basis: spike S7 used 75 MB / 845 p, 6.5–10.8 s and Δ351 MB.

#### 4. Payload
- Initial page JS is the controller only, ≤ 30 KB gzip.
- pdf.js is imported when the first file is added.
- `@cantoo/pdf-lib` is loaded only inside the worker.

### D. Tests

#### 1. Fixtures (`tests/fixtures/`, ≤ 3 MB, provenance in `tests/fixtures/SOURCES.md`)
Copied from `spikes/pdf/corpus/`:
- `kr_law_form.pdf`: a 법령 별지서식 from law.go.kr, 7 pages of Korean. Not a protected work under 저작권법 제7조.
- `irs_fw9.pdf`: a US federal work in the public domain. 6 pages, AcroForm.

Generated by `tests/fixtures/build.mjs`, with the outputs committed:
- `gen_links_outline.pdf`: 4 pages, a 3-entry outline, 2 GoTo links (one `/Dest`, one `/A`), and 1 named destination.
- `gen_landscape_rotated.pdf`: an A4-landscape page and a `/Rotate 90` page.

Generated at test time into a temp dir, never committed:
- `encrypted_userpw_1234` (made with cantoo `encrypt`)
- `damaged_badxref` (startxref set to 999)
- `truncated` (the first 60 % of irs_fw9)
- `not_a_pdf` (PNG bytes saved as .pdf)

#### 2. Unit tests
`tests/unit/*.test.ts`, run with Vitest in Node. Text extraction uses the pdfjs-dist legacy build. Spike scenarios S1–S5 on the fixtures:
- **Pages:** page count is the sum of the inputs, in the right order.
- **Text:** text is byte-identical per page, including the Korean in kr_law_form.
- **Form fields (fw9 ×2):**
  - the field count doubles
  - second-copy names end in `_2`
  - `getForm().getTextField(n).setText('x')` works on both copies
- **Outline:**
  - with `addFileBookmarks`, it has the source entries plus 1 per file
  - without it, it has the sum of the source entries
- **Links:** merging `[irs_fw9, gen_links_outline]`, every `/Dest` points to the correct output page ref.
- **Subset `pages:[2,0]`:**
  - `droppedLinkDests > 0`
  - exact page count, with no orphan pages
- **Rotation:** `rotate:[90]` adds to the existing `/Rotate`.
- **Encrypted:**
  - no password → `PdfPasswordRequiredError`
  - `1234` → text matches kr_law_form
- **Damaged files:**
  - a bad xref still merges
  - a truncated file → `PdfCorruptError`
  - PNG bytes → `PdfNotPdfError`
- **Helpers:**
  - `verifyOutput` catches a page-count mismatch
  - the filename sanitizer
  - the limits logic
  - the static network-API guard (§3.3)

#### 3. E2E
`tests/e2e/pdf-merge.spec.ts`, run in all 5 projects. Every test uses the no-upload helper.
- **Happy path:**
  - add kr_law_form and irs_fw9
  - move irs_fw9 up
  - merge and download
  - parse the download in Node: 13 pages, and page 1 text equals irs_fw9 p1
- **Password:** a wrong password shows the message; the correct one unlocks the file; the merge succeeds.
- **Bad inputs:** the corrupt and not-PDF messages appear, and the other files are kept.
- **Cancel:** cancelling during a merge returns to the list.
- **Keyboard:** a keyboard-only run of the happy path.
- **axe:** `/`, `/pdf-merge/`, `/privacy/`, `/licenses/` and the 404 page.
- **SEO smoke:**
  - the canonical is absolute and has a trailing slash
  - exactly one H1
  - the JSON-LD parses
  - the sitemap lists exactly `/`, `/pdf-merge/`, `/privacy/` and `/licenses/`
- **CSP:** the CSP header is present.

#### 4. Regression harness
- Run with `npm run regress:merge` (`scripts/regress/merge.mjs`).
- It ports `spikes/pdf/harness/merge_check.cjs` scenarios S1–S5, plus S7 behind `--large`, and runs them against our `mergePlus` in Node.
- Thresholds:
  - text equality on 100 % of sampled pages
  - SSIM ≥ 0.999 on non-scan pages
  - S1: fields 199/199, links 18/18 correct, bookmarks 79
  - S4 and S5 succeed
- Paste the result table into REVIEW-REQUEST.

### E. Scripts and config
- npm scripts:
  - `dev`
  - `build`: `prebuild` runs copy-vendor and gen-licenses; `postbuild` runs check-dist
  - `preview`, `check`, `test`, `test:e2e`, `check:licenses`, `lhci`, `regress:merge`
- `lighthouserc.json` with the §3.8 budgets.
- `playwright.config.ts` with the 5 projects and the `serve.mjs` webServer.
- `.github/workflows/ci.yml`.

## Flags (do not guess; write under "Blocked" in REVIEW-REQUEST)
- **Cloudflare Pages settings** are changed by the owner at the deploy gate, not by Bob:
  - build command `npm run build`
  - output directory `dist`
  - `NODE_VERSION=22`

  Until then, pushing to `main` breaks production. **Do not push.**
- If pdf.js 6.3.289 needs something the CSP blocks, report it. Do not loosen `script-src` or `connect-src`.
- If `@cantoo/pdf-lib` fails in a module worker on Firefox or WebKit, report it with the stack trace. Do not swap engines.
- The privacy contact channel is an owner decision. Keep the placeholder.
- If Astro 7 plus your TS version fails `astro check`, pin TS back and log it. Do not downgrade Astro.

## Out of Scope (goes to BUILD-LOG Known Gaps)
- Page-level editing: thumbnails per page, delete, rotate or reorder individual pages (candidate Step 1b).
- 비밀번호 다시 걸기 on the output.
- A qpdf fast path for jobs over 150 MB.
- Service worker / offline mode.
- Analytics, ad code, cookie banner.
- Dark-mode redesign.
- English UI.

## Acceptance
- **Build:** `npm ci && npm run build` succeeds on Node 22 from a clean clone. `dist/` contains:
  - `/`, `/pdf-merge/`, `/privacy/`, `/licenses/`
  - `/404.html`, `/sitemap.xml`, `/robots.txt`
  - no file ≥ 24 MiB
- **Landing page:** looks unchanged apart from the footer links and the live PDF card. It requests nothing from third-party origins.
- **Gates:** every §3 gate is green.
  - E2E is green in all 5 projects, with the no-upload assertion in every test.
  - Lighthouse budgets are met on `/` and `/pdf-merge/`.
  - `regress:merge` meets its thresholds.
- **Licenses:** `check:licenses` is green. `/licenses/` lists @cantoo/pdf-lib and its dependencies, pdf.js with its wasm notices, and the Pretendard OFL.
- **Forbidden in the repo:**
  - the original `pdf-lib`
  - any CDN link
  - `'unsafe-inline'` in `script-src`
  - network APIs in `src/` outside the allowlist
