# Review Request — Step 3: 사진 용량 줄이기 `/photo-compress/`
Date: 2026-09-30
Ready for Review: YES (round 3; see the first section). Nothing is committed.

## Round 3 (2026-09-30, Richard's round-2 Must Fix and the Arch decision; logged in BUILD-LOG)
Status: **DONE**. Nothing is committed.

| Gate | Result |
|---|---|
| check | 0 errors / 0 warnings / 0 hints |
| unit | 11 files, **194/194** (+4) |
| build / budgets | OK; photo initial JS 12.6 KB / 30, photo.worker 17.5 KB / 60 |
| photo e2e, 5 projects | **72 passed, 0 failed, 0 flaky**, 53 skipped (stated reasons: F1 WebKit, mobile/desktop-only, F2) |

### Changes
- **Must Fix**
  - Code: src/lib/image/messages.ts `NOTES.grown(before, after, withinTarget, resaved)`; src/tools/photo-compress/controller.ts:270 passes `rep.resaved`.
  - The privacy reason appears only for a privacy/orientation re-save.
- **Arch decision**
  - A clean PNG/BMP/GIF or a CMYK JPEG under the target is still converted to JPG.
  - If it grew, the row shows: "{before} → {after} (늘어남) — JPG로 바꾸느라 용량이 늘었습니다. 제출처가 원래 형식을 받는다면 원본을 쓰셔도 됩니다.", plus " 목표 용량 안입니다." when a target exists.
- **Tests**
  - Unit: `NOTES.grown` in all four combinations (exact copy, and no "개인정보" in the neutral line); the engine converts a clean CMYK JPEG under the target with `resaved: false`.
  - e2e: opaque_rgba.png at the default 500 KB shows the neutral line, has no "개인정보" anywhere in the row and no percent line, and downloads ≤ 500,000 bytes. It passes on chromium, firefox and mobile-chrome, and is skipped on webkit and mobile-safari (F1).

### Files changed in round 3
- src/lib/image/messages.ts, src/tools/photo-compress/controller.ts
- tests/unit/photo-tool.test.ts, tests/unit/photo-engine.test.ts, tests/e2e/photo-compress.spec.ts
- handoff/BUILD-LOG.md

---

## Round 2 (2026-09-30, after Richard's CHANGES REQUIRED and the Arch decisions; logged in BUILD-LOG)
Status: **DONE**. Every requested gate is green. Nothing is committed.

| Gate | Result |
|---|---|
| check | 0 errors / 0 warnings / 0 hints |
| unit | 11 files, **190/190** (+9 this round) |
| build / budgets | OK; photo initial JS 12.5 KB / 30, photo.worker 17.5 KB / 60, all others unchanged |
| check:licenses | OK, 25 production packages |
| photo e2e, 5 projects | **68 passed, 0 failed**, 51 skipped (stated reasons), 1 flaky: Firefox `goto` timeout in the crash test, passed on retry, the known harness race |
| pdf-compress + pdf-merge + site e2e, chromium | 50 passed, 2 skipped (mobile-only tests) |
| regress:photo (Chromium 153) | **85/85 rows, 24/24 aggregate rules** (Appendix F) |
| regress:compress | 122/122, **0 differing rows** against the pre-Step-3 run (ignoring ms) |

### Must Fix
1. **jpeg-strip between scans**
   - Files: src/lib/image/jpeg-strip.ts (rewritten); src/lib/image/sniff.ts (`scanEnd`, `sniffJpeg`).
   - The strip walks every segment, including between scans. `scanEnd` skips entropy data (FF 00, RST0–7, fill bytes) to the next real marker.
   - Between scans it keeps DHT/DQT/DAC/DRI/DNL plus each SOS and its data, and drops APPn/COM wherever they appear. It stops at the first real EOI, so an FF D9 inside a COM payload no longer cuts the file.
   - The re-sniff also requires `!hasExif && !hasXmp && !hasGps`; otherwise it throws and the engine re-encodes.
   - The sniffer walks the same way, so GPS between scans is seen, and "nothing to remove" is decided correctly. On the whole file, truncated now means "the walk never reached EOI".
   - Unit tests:
     - APP1 with GPS after scan 1 is removed, and the sniffer flagged it first.
     - COM containing FF D9 after scan 1 is dropped whole; the output equals the strip of the clean file.
     - A truncated progressive file vs a trailer after EOI.
   - The existing trailer and fuzz tests are still green (risk verified).
   - The sniffer also now reads PNG `eXIf` (GPS), PNG iTXt XMP, the WebP `EXIF` chunk (GPS) and a HEIF `Exif` item (unit tests).
2. **Compare aspect**
   - Files: app.css `.pc-stage` gets `max-width: calc(70vh * var(--pc-ar)); margin-inline: auto`; compare.ts `show()` sets `--pc-ar`.
   - New e2e at 1280×900: the portrait result's box ratio is within 1 % of outW/outH (the test asserts h > w). Passes on chromium and firefox; skipped on webkit (no OffscreenCanvas, F1) and on the mobile projects (a desktop viewport check).

### Should Fix
- **Scorer failure** (engine.ts): the scorer has its own try, so a non-RangeError failure keeps the full-size MozJPEG result with no fallback note (unit test with a throwing `quickScore`).
- **touch-action:** `none` only on `[data-zoom="2"]` and `[data-zoom="4"]`; at 1× a swipe scrolls the page.
- **Arrow keys** on the compare box return early at 1×, without preventDefault. The keyboard e2e still pans at 4×.
- **regress:photo slack for re-baselined pairs:** `baseline-jpeg` pairs get only 0.001 SSIM / 0.05 dB. The three pairs reproduced their numbers exactly this run:
  - p07 at 500 KB: 0.9654 / 39.98
  - p09 at 200 KB: 0.9931 / 46.03
  - s01_exif6 at 500 KB: 0.962 / 39.61
- **regress:photo without the corpus:** the run exits 1 (checked) unless `--fixtures-only` is given. The header then reads "PARTIAL (no corpus, fixtures only)", and the corpus-only mean and gain rules show as SKIP.

### Arch decisions
- **Grown re-save copy**
  - When out > in, the size line reads "{before} → {after} (늘어남) — 위치 정보 등 개인정보를 지우고 방향을 바로잡느라 다시 저장했습니다. 목표 용량 안입니다." The last sentence appears only in target and percent modes.
  - The percent line and the separate resaved note are left out in that case.
  - Code: `NOTES.grown` in messages.ts, used by the controller.
  - e2e: exif6_gps at 500 KB, target mode.
- **Privacy first in every mode**
  - Code: engine.ts `hasPrivateData()`.
  - In quality or percent mode with no size gain:
    - the stripped file, if the strip removes something;
    - otherwise, with EXIF/XMP/GPS or orientation ≠ 1, the re-encoded file with `resaved`;
    - only when the original has none of those, "원본을 그대로 쓰세요".
  - Unit tests: all three branches, plus a PNG with GPS. The old line-228 test now uses a portrait with EXIF inserted.
  - e2e: exif6_gps at 화질 95 is offered re-saved (clean baseline, no GPS trailer), and "원본을 그대로 쓰세요" does not appear.

### Files changed in round 2
- src/lib/image/jpeg-strip.ts, sniff.ts, engine.ts, messages.ts, report.ts
- src/tools/photo-compress/controller.ts, compare.ts
- src/styles/app.css
- scripts/regress/photo.mjs
- tests/unit/photo-sniff.test.ts, photo-engine.test.ts
- tests/e2e/photo-compress.spec.ts
- handoff/BUILD-LOG.md

---

## Round 1c (2026-09-30, after the F6a/F3a decisions; logged in BUILD-LOG)
Status: **DONE**. Every requested gate is green. Nothing is committed.

| Gate | Result |
|---|---|
| unit | 11 files, 181/181 (+4: the scorer picks downscaled, a tie within 0.002 goes to full size, full size scores higher, and a real-codec score sanity check) |
| check | 0 errors / 0 warnings / 0 hints |
| photo e2e, 5 projects | **64 passed, 0 failed**, 46 skipped with stated reasons. chromium 20 passed + 2 skipped, firefox 19 + 3, mobile-chrome 21 + 1; webkit and mobile-safari 2 passed each (the unsupported notice, SEO) + 20 engine tests skipped with the F1 reason |
| build / budgets | OK; photo.worker 17.3 KB / 60 KB; photo initial JS 12.3 KB / 30 KB |
| regress:photo (Chromium 153) | **85/85 rows, 24/24 aggregate rules** (Appendix E) |

### Round 1c changes
- **Scored scale re-search** (src/lib/image/engine.ts, MozJPEG branch):
  - When the full size fits at q ≥ 50 and a downscaled result also exists, both get a luma SSIM at ≤ 1024 px against the working source.
  - The downscaled result wins only if it scores higher by more than 0.002; otherwise the full size wins.
  - The scorer is `deps.quickScore`. The worker draws both images on white with OffscreenCanvas, and caches the source image per bitmap. Node uses lanczos.
- **Shared SSIM:** it lives in `src/lib/image/ssim.ts`. `scripts/regress/photo-metrics.mjs` re-exports it, so the worker and the harness use the same code. The checked-in vector test is unchanged and passes.
- **p12:**
  - At 100 KB the downscaled result now wins: BI 1.896, SSIM 0.9417, PSNR 39.63.
  - At 50 % the full size stays: BI 2.376, under the cap. At 1024 px its score beat the downscaled result.
  - The max corpus BI is 2.488, so the cap of 2.5 holds.
- **p07 at 500 KB:**
  - The full size still wins: q67, SSIM 0.9654, PSNR 39.98.
  - SSIM passes and PSNR misses only by the baseline penalty, so it is re-baselined per F3a (`photo-baseline.json`, with a note).
- **Means** (품질 SSIM / PSNR) are unchanged or better: 500 KB 0.9516 / 37.09, 200 KB 0.9110 / 35.36, 100 KB 0.8731 / 32.26, 50 % 0.9710 / 39.88.
- **MozJPEG gain:** +0.92 / +0.80 / +0.48 / +1.08 dB, all pass.
- **Timing:** the median 품질 우선 time is 4.3 / 2.7 / 2.1 s per target. None is flagged (under 2 × the spike's hybrid). The worst single row is p07 at 500 KB, 10.2 s, which pays for two MozJPEG searches and two scores at 8 MP.

### Files changed in round 1c
- src/lib/image/ssim.ts (new); engine.ts (scored re-search, `quickScore`, `quickScoreSize`); photo.worker.ts (`quickScore`).
- scripts/regress/photo-metrics.mjs (re-exports SSIM); scripts/regress/photo-baseline.json (p07 at 500 KB `baseline-jpeg`).
- tests/helpers/photo-deps.ts (Node `quickScore`); tests/unit/photo-engine.test.ts (+4 tests).
- handoff/BUILD-LOG.md.

---

## Round 1b (2026-09-30, after the Arch/orchestrator decisions F1–F6 and the open question; logged in BUILD-LOG)
Status: **BLOCKED on 2 regress:photo items** (F3a, F6a below). Every other gate is green. Nothing is committed.

### Gates, round 1b
| Gate | Result |
|---|---|
| check | 0 errors / 0 warnings / 0 hints |
| unit | 11 files, 177/177 (+3: scale re-search, the target-mode keep/strip/re-save split, `finalSearch` lowFirst) |
| e2e, 5 projects | **311 passed, 0 failed**, 58 skipped (stated reasons), 1 flaky (Firefox 360 px /privacy/ `goto` race, passed on retry) |
| e2e on webkit and mobile-safari | The new "unsupported browser" test asserts the notice, a disabled picker, no rows, no engine request, and no upload (fixture). Engine tests skip there with the F1 reason. |
| Lighthouse (3 runs, median) | 100/100/100/100 on `/`, `/pdf-merge/`, `/pdf-compress/`, `/photo-compress/`; LCP 1.56 / 1.71 / 1.71 / 1.71 s; CLS 0 |
| licences | OK, 25 production packages |
| dist budgets | all within budget; photo initial JS 12.3 KB, photo.worker 16.7 KB, the rest unchanged (table below) |
| regress:compress | 122/122; **0 differing rows** against the pre-Step-3 run (ignoring ms) |
| regress:photo (Chromium 153) | **83/85 rows, 23/24 aggregate rules** (Appendix D) |

### What changed
- **F1**
  - `canCompressPhotos()` (controller.ts, top) checks for OffscreenCanvas with 2d and convertToBlob on page load.
  - Without it, `#ph-unsupported` (role alert) shows the decided copy, both file inputs are disabled, and drops are ignored.
  - There is no main-thread path.
  - e2e: `open()` skips the engine tests when the check fails, with the reason; the new test asserts the notice.
- **F2:** unchanged. Firefox skips P3 with the reason when it detects the raw values at runtime.
- **F3 (i), scale re-search** (engine.ts, MozJPEG branch)
  - When the canvas probe downscales, MozJPEG first tries the full size over q 50–95.
  - `lowFirst` means one q50 encode decides when the full size cannot fit.
  - 빠른 모드 keeps the canvas decision.
- **F3 (ii)**
  - `photo-baseline.json` gains a `baseline-jpeg` entry (measured, noted) for p09 at 200 KB (SSIM 0.9931 / PSNR 46.03, q82, 195,853 B) and s01_exif6 at 500 KB (0.962 / 39.61, q67, 490,037 B).
  - Both meet the target and the floor, and every mean rule passes.
- **F3 (iii):** the per-pair comparison with the spike's q40 reference is removed for 빠른 모드.
- **F4:** the MozJPEG gain rule is ≥ 0.45 dB at 100 KB and ≥ 0.5 dB elsewhere. Measured: 500 KB 0.92, 200 KB 0.80, 100 KB 0.48, 50 % 1.08. All pass.
- **F5:** the rule is now PSNR(s02_p3 50 % output, decoded original) ≥ 31.0 dB. Measured 31.58 dB: PASS. The g02 comparison (`psnrAgainst`) is removed.
- **F6: cap = 2.5** (see F6a).
- **Open question** (engine.ts, flow step 2), for a target-mode input already under the target:
  - Nothing to remove (the lossless strip changes no byte): the row is `kept` (encoder `original`), with no download and the existing kept note.
  - An upright JPEG with metadata: the lossless strip, as before.
  - Otherwise re-encode, never above the target. The note "위치 정보 등 개인정보를 지우고 방향을 바로잡느라 파일을 다시 저장했습니다" appears only when the input had EXIF/XMP/GPS or an orientation other than 1.
  - e2e covers it: portrait at 500 KB is kept; exif6_gps at 500 KB is re-saved with the note, upright, ≤ 500 KB and baseline.
- **e2e targets:** the batch, cancel, crash and keyboard tests use 200 KB (a 340 KB portrait at the default 500 KB is now kept). The keyboard test selects 200 KB with the arrow keys. The lazy-load test uses 30 KB so a downscale is still needed.

### Blocked, round 1b (data, not guessed)
- **F3a. The scale re-search does not fully fix p07 at 500 KB.**
  - Full size is now used (q67, 510,871 B): SSIM 0.9654 passes (≥ 0.9594), but PSNR is 39.98 against 40.71 − 0.6 = 40.11.
  - That is 0.13 dB short. q67 is the largest baseline q that fits 512,000 B, so the gap is the baseline-JPEG penalty.
  - Arch: re-baseline p07 at 500 KB like p09 and s01 (measured 0.9654 / 39.98), or not?
- **F6a. Blockiness cap 2.5 is exceeded by the scale re-search on p12 at 100 KB.**
  - Full size q60 gives BI 2.621 > 2.5. The round-1 downscaled result at q76 was 1.896.
  - At the same image the re-search also lowers quality slightly:
    - p12 at 100 KB: SSIM 0.9396 against 0.9417 before, PSNR 39.60 against 39.63.
    - p12 at 50 %: SSIM 0.9461 against 0.9493, BI 2.376 against 1.938.
  - Elsewhere it helps: p07 at 500 KB SSIM 0.9505 → 0.9654; p09 at 100 KB PSNR 41.13 → 41.26; the 500 KB 품질 mean 0.9496 / 36.94 → 0.9516 / 37.09.
  - Options:
    - (a) Keep "full size wins" and raise or exempt the cap.
    - (b) Prefer full size only when its q is not far below the downscaled q (a threshold to choose).
    - (c) Score both candidates with a cheap in-worker SSIM at 1024 px, as the spike's quickScore did, and keep the better one. This costs about 0.3 s per re-search and needs a decision.
  - The cap itself: 1.25 × the largest MozJPEG BI of the first full run, on the corpus photos (1.968, g03 at 200 KB), gives 2.5. The literal all-input maximum is 391.6 (p3_patches at 50 %), which would give a cap of 489.5.
  - I left the synthetic flat-patch fixtures out because their patch edges sit on the 8-px grid, so BI does not measure blocking there. The "less blocky than naive" rule keeps its brief scope (naive q < 0.30, 32/32 pass). Arch to confirm both readings.
- **Still owed:** the real iPhone / Safari 16.4+ check and Gate 11.

### Files changed in round 1b
- src/lib/image/engine.ts — flow step 2 (keep / strip / re-save), MozJPEG full-size re-search, `resaved`.
- src/lib/image/fit.ts — `finalSearch` `lowFirst`.
- src/lib/image/report.ts — the `original` encoder and `resaved`.
- src/lib/image/messages.ts — `NOTES.resaved`.
- src/tools/photo-compress/controller.ts — `canCompressPhotos`, the unsupported state, the resaved note.
- src/pages/photo-compress/index.astro — `#ph-unsupported`.
- src/styles/app.css — the disabled picker label.
- scripts/regress/photo.mjs — the F3–F6 rules and the BI cap.
- scripts/regress/photo-harness/harness.js — `psnrAgainst` removed.
- scripts/regress/photo-baseline.json — 2 `baseline-jpeg` entries.
- tests/unit/photo-engine.test.ts, tests/e2e/photo-compress.spec.ts, tests/e2e/site.spec.ts.
- handoff/BUILD-LOG.md — round 1b decisions and notes.

---

# Round 1 (superseded where round 1b says so)

## Gates (actual numbers)
| Gate | Result |
|---|---|
| 1 `npm run check` | 0 errors / 0 warnings / 0 hints |
| 1 `npm test` | 11 files, 174/174 (photo: sniff+strip 26, engine+fit 30, tool 20, metrics 4) |
| 2/3/5 e2e, 5 projects, no-upload fixture on every test | 311 passed, 18 skipped (stated reasons), 2 flaky (Firefox `goto` load race, passed on retry). **29 failed, and all 29 are photo engine tests on webkit and mobile-safari** (Flag F1). |
| e2e without those 29 | All green. Photo: 21/21 on chromium, firefox and mobile-chrome each; on Firefox the P3 test skips at runtime (Flag F2). Site, merge and compress: green on all 5 projects. |
| 7 axe | 0 serious/critical. Photo: empty, ready (details open, 직접 입력 with an invalid value) and done (compare). Also `/`, `/pdf-merge/`, `/pdf-compress/`, `/photo-compress/`, `/privacy/`, `/licenses/` and 404. |
| 8 Lighthouse (lhci mobile, 3 runs, median) | `/`: 99/100/100/100, LCP 1.56 s. `/pdf-merge/` and `/pdf-compress/`: 100/100/100/100, LCP 1.71 s. **`/photo-compress/`: 100/100/100/100, LCP 1.71 s, CLS 0, script 13.8 KB transfer.** All assertions pass. |
| 9 `check:licenses` | OK, 25 production packages. /licenses/ adds @jsquash/webp (with the libwebp codec licence), wasm-feature-detect and fflate. |
| 10 dist budgets | See the table below. |
| regress:compress | 122/122 before and after the Step 0 refactor. **0 differing rows** ignoring ms. Both tables are in `regress-out/compress-{before,after}-step3.md` and in Appendices B and C. |
| regress:photo (Chromium 153) | 80/85 rows and 21/23 aggregate rules. Two full runs gave identical rows. **The misses are under Blocked (F3–F5).** Full output in Appendix A. |
| 11 manual | Screenshots at 1280 px and on Pixel 7, ready and done: no overflow and no fallback glyphs (prebuild regenerated the UI font). Gate 11 in real browsers is Richard's. |

### Bundle budgets (gzip -9)
| Asset | Size | Budget |
|---|---|---|
| initial JS /photo-compress/ | 12.1 KB | 30 KB |
| photo.worker*.js | 16.5 KB | 60 KB |
| WebP glue webp_enc / webp_enc_simd | 7.2 / 7.2 KB | 20 KB each |
| webp_enc.wasm / webp_enc_simd.wasm | 112.2 / 124.8 KB | 130 KB each |
| fflate chunk (zip*.js) | 4.5 KB | 12 KB |
| compress.worker*.js | 255.9 KB | 330 KB (unchanged) |
| qpdf.wasm | 439.1 KB | 480 KB (unchanged) |
| MozJPEG enc + dec | 120.8 KB | 140 KB (unchanged); exactly one `mozjpeg_enc*.wasm` (asserted) |
| resize wasm | 16.7 KB | 30 KB (unchanged) |
| initial JS /pdf-compress/, /pdf-merge/ | 6.4 / 5.8 KB | 30 KB |

## Blocked (Flags; not guessed)
- **F1. Playwright WebKit 26.6 (Windows) has no OffscreenCanvas.**
  - Stack: `ReferenceError: Can't find variable: OffscreenCanvas K@…/_astro/photo.worker-*.js` (captured with a temporary log, since removed).
  - A probe shows `typeof OffscreenCanvas === 'undefined'` on the main thread and in workers, on webkit and mobile-safari.
  - The same probe shows WebKit does colour-manage P3 (217,42,51) and honours `imageOrientation` and `resizeWidth`.
  - Every photo run there ends as row error `unknown`, so 29 e2e fail. No main-thread fallback was added (brief).
  - Real Safari has had OffscreenCanvas 2D in workers since 16.4, so this looks like a limit of the Windows port.
  - Options for Arch:
    - (a) Feature-detect and skip the engine tests on WebKit with this reason; the real-iPhone check covers Safari.
    - (b) Also show a specific row message (new copy) instead of `unknown` in browsers without worker OffscreenCanvas.
    - (c) Run WebKit e2e on Linux CI, if that port has OffscreenCanvas.
    - (d) A main-thread path. This is forbidden unless Arch decides it.
- **F2. Playwright Firefox 155 does not colour-manage ICC-tagged JPEGs.**
  - It returns the raw Display-P3 values (200,60,59). This also happens in `<img>` on the main thread, and for the spike's s02_p3 (made with sharp).
  - The P3 e2e detects exactly this case at runtime and calls `test.skip` with the reason. Any other mismatch still fails.
- **F3. regress:photo per-pair misses (5 of 85 rows).** Root causes traced; no threshold touched.
  - Baseline-JPEG penalty beyond the tolerance (a brief Flag):
    - p09 at 200 KB: q82 fits, q83 baseline does not. PSNR 46.03 against the spike's progressive q83 46.81 − 0.6.
    - s01_exif6 at 500 KB: PSNR 39.61 against 40.53 − 0.6.
  - The canvas probe with the 0.50 floor picks the scale, although MozJPEG would fit at full size:
    - p07 at 500 KB, 품질: 2211×2948, SSIM 0.9505 against 0.9694 − 0.01.
    - The spike's hybrid had no floor, and its fit-mozjpeg searched with MozJPEG itself.
    - The remedy is the out-of-scope "MozJPEG-driven scale re-search".
  - 빠른 모드 with the 0.50 floor against the spike's q40 reference:
    - s02_p3 at 100 KB: SSIM 0.7131 against 0.7318 − 0.01
    - s03_screenshot at 50 %: PSNR 24.87 against 25.78 − 0.6
- **F4. MozJPEG gain at 100 KB is +0.48 dB** (rule ≥ +0.5). The other targets pass: 500 KB +0.77, 200 KB +0.80, 50 % +1.06.
- **F5. s02_p3 at 50 % against g02: 29.59 dB** (rule ≥ 35.0).
  - With this method (Chromium 153, eval size 2048), the decoded s02_p3 input alone scores 34.28 dB against g02.
  - The 50 % output scores 31.58 dB against its own original.
  - As defined, the rule cannot be met. The spike's 37.5 dB was measured on the decoded original, not on a 50 % output.
  - Colour management is verified separately by the P3 e2e on Chromium (±8).
- **F6. Absolute blockiness cap (Arch sets it).** The distribution is in Appendix A. The relative rule passes 32/32, including p03 at 100 KB: 품질 BI 1.669 against naive 12.028 at q 0.02.
- **Checked, no Flag:**
  - Canvas JPEG is SOF0: the fast-mode e2e checks it on chromium, firefox and mobile-chrome.
  - fflate sets the UTF-8 flag: the unit test checks bit 11 in every local header.
  - Pillow was available.
  - `tests/fixtures/` is 2.3 MB.

## Files Changed
- **Step 0 codec loaders**
  - src/lib/codecs/wasm-browser.ts:1-62 — new. Shared jSquash loaders (MozJPEG enc/dec, resize, and WebP with the `simd()` choice), each compiled once per worker; allowlisted fetch.
  - src/lib/pdf/compress/wasm-browser.ts:1-23 — Step 0: `loadCodecs()` is composed from the shared loaders; the qpdf loader is unchanged.
- **Image library (`src/lib/image/`)**
  - sniff.ts:1-357 — pure sniffer: formats, header dims, EXIF orientation (II and MM), GPS/EXIF/XMP, CMYK, progressive, animation, alpha and truncation; head+tail partial mode.
  - jpeg-strip.ts:1-72 — lossless metadata strip. Keeps JFIF, ICC, Adobe, the tables and the scan; drops everything else and every byte after EOI. Re-sniff check.
  - fit.ts:1-142 — port of fitToTarget/searchQuality (floor 0.5, clamp at 64 px, allowDownscale) and the integer finalSearch.
  - engine.ts:1-352 — compressPhoto:
    - the kept/strip rule and the flatten decision
    - quality, target and percent modes; the MozJPEG window; WebP rounds
    - fallbacks
    - post-checks: bytes ≤ target, decoded dims
  - decode.ts:1-75 — createImageBitmap with orientation and colour; the cap with an aspect check and a canvas shrink; heic/corrupt mapping.
  - raster.ts, report.ts, messages.ts — canvas helpers; the report type; error codes and all the §3.2 copy (plus the new `engine` code).
  - photo.worker.ts:1-182 — module worker: whole-file re-sniff, engine, thumbs, sourcePreview, transfers. A codec that fails to load maps to `engine`.
- **Shared UI**
  - src/lib/ui/engine-error.ts:1-34 — new. Copy for an engine that failed to load, plus a banner with 새로고침 (UX-AUDIT P0-1). The PDF tools can adopt it later.
- **Tool page**
  - src/tools/photo-compress/controller.ts:1-740 — the page state machine. Focus areas:
    - `check` 324 (pre-flight)
    - `spawn` 486 (run token; crash vs load failure)
    - `onMessage` 543
    - `finish` 586
    - `engineFailure` 612
    - `cancel` 623
    - `downloadZip` 636
  - src/tools/photo-compress/{limits,options,queue,zip,compare}.ts — the §3.4 limits; form parsing, KB × 1000 and display rounding; the queue; ZIP dedupe; the compare viewer.
  - src/pages/photo-compress/index.astro:1-244 — the page, with the brief's copy verbatim.
  - src/data/tools.ts — the photo entry is live, with its description, 6 FAQ and keywords.
  - src/pages/pdf-compress/index.astro:+1 — the done-state link to the photo tool.
  - src/styles/app.css:165-247 — photo styles; the drop hint is hidden on coarse pointers.
- **Build and regress**
  - scripts/check-dist.mjs:62-76 — the Step 3 budgets and the exactly-one-wasm assertions.
  - regress:photo — scripts/regress/photo.mjs, photo-metrics.mjs, photo-harness/{index.html,harness.js} and photo-baseline.json: a Vite dev server plus Playwright, running the production worker, with in-page metrics against the spike baseline.
- **Tests**
  - tests/unit/photo-{sniff,engine,tool,metrics}.test.ts — every Test map row is now [TESTED].
  - tests/unit/network-guard.test.ts — the allowlist names exactly the two loaders.
  - tests/e2e/photo-compress.spec.ts:1-523 — 22 tests.
  - tests/e2e/site.spec.ts — sitemap, home cards, SEO, related tools, licences, 360 px and 44 px.
  - tests/e2e/pdf-compress.spec.ts — 2 link asserts.
  - tests/e2e/global-setup.ts, tests/e2e/paths.ts — the photo runtime fixtures.
- **Fixtures and helpers**
  - tests/fixtures/photo/* — 8 files, 700 KB. Built by build-photo.mjs and build-cmyk.py; provenance in SOURCES.md.
  - tests/helpers/image-writers.ts — EXIF, ICC, GIF and PNG writers (Step 4 reuses them).
  - tests/helpers/photo-deps.ts — Node codecs for the tests.
- **Packaging and docs**
  - package.json and the lockfile: 3 dependencies and `regress:photo`.
  - licenses.manifest.json, licenses/third-party/SOURCES.md, docs/COPY.md, lighthouserc.json.

## Deviations
1. MozJPEG sets `baseline: true` as well as `progressive: false`. Without it the encoder emitted SOF1, found by regress:photo.
2. The stripped path applies only to JPG output and only within the max long edge. A result resized by the max edge or the mobile cap is never "kept".
3. A partial (main-thread) sniff never flags a JPEG as truncated; the worker's whole-file sniff decides. A motion photo's trailer can be megabytes.
4. alphaPossible also covers GIF with a transparent colour, 32-bpp BMP, and AVIF/HEIC.
5. `scene_cc0.jpg` is q85, because q88 is 345 KB against the 300 KB limit. `portrait_pd.jpg` is progressive q88.
6. Regress means use the 15 spike-baseline images. "PSNR ≥ that row" is read as the PSNR of whichever of fit-mozjpeg and hybrid-mozjpeg has the lower SSIM.
7. The coordinator's UX-AUDIT-1 §11 items are applied to this page: engine-error handling, a done headline, focus on a visible element, the touch hint, and a cleared live region (BUILD-LOG). The worker's item-error codes gain `engine`.
8. The network guard now accepts that the PDF loader has no `fetch(` (it only imports qpdf). The allowlist is exactly the two loader files.

## Open Questions
- Target mode on an input that already fits but cannot be stripped (rotated, CMYK or PNG) can make the file bigger: exif6_gps goes from 25 KB to 86 KB at 200 KB. Keep this as briefed, or cap the result at the input size?
- Arch decisions on F1–F6.

## Out of Scope (logged in BUILD-LOG)
- The brief's Out of Scope list.
- Automatic retry after an engine load failure.
- The real-iPhone check.
- Gate 11.

---

## Appendix A: regress:photo (regress-out/photo.md, Chromium 153)

### regress:photo — chromium 153.0.8010.12

Inputs: 28 images (tests\fixtures\photo and spikes\photo\corpus). Encodes: 170.

#### Aggregate rules

| Rule | Result | Measured |
|---|---|---|
| Fit: every encode ≤ target (0 overshoots, 0 errors) | PASS | 170/170 encodes produced, 0 overshoots |
| Mean utilisation ≥ 0.93 (품질 우선) | PASS | 0.968 |
| Mean utilisation ≥ 0.93 (빠른 모드) | PASS | 0.965 |
| p02 at 100 KB fits (naive cannot) | PASS | 품질 102399, 빠른 99991, naive no fit |
| p11 at 100 KB fits (naive cannot) | PASS | 품질 100993, 빠른 101458, naive no fit |
| Mean 500KB 품질 우선 SSIM ≥ 0.945 / PSNR ≥ 36.8 | PASS | 0.9496 / 36.94 (n 11) |
| Mean 500KB 빠른 모드 SSIM ≥ 0.942 / PSNR ≥ 35.7 | PASS | 0.9469 / 36.17 (n 11) |
| MozJPEG gain 500KB: mean PSNR(품질) − PSNR(빠른) ≥ +0.5 dB | PASS | 0.77 dB |
| Mean 200KB 품질 우선 SSIM ≥ 0.905 / PSNR ≥ 34.9 | PASS | 0.9110 / 35.36 (n 14) |
| Mean 200KB 빠른 모드 SSIM ≥ 0.906 / PSNR ≥ 34.2 | PASS | 0.9081 / 34.57 (n 14) |
| MozJPEG gain 200KB: mean PSNR(품질) − PSNR(빠른) ≥ +0.5 dB | PASS | 0.80 dB |
| Mean 100KB 품질 우선 SSIM ≥ 0.865 / PSNR ≥ 31.7 | PASS | 0.8731 / 32.26 (n 15) |
| Mean 100KB 빠른 모드 SSIM ≥ 0.868 / PSNR ≥ 31.4 | PASS | 0.8713 / 31.78 (n 15) |
| MozJPEG gain 100KB: mean PSNR(품질) − PSNR(빠른) ≥ +0.5 dB | FAIL | 0.48 dB |
| Mean 50% 품질 우선 SSIM ≥ 0.968 / PSNR ≥ 39.3 | PASS | 0.9711 / 39.86 (n 15) |
| Mean 50% 빠른 모드 SSIM ≥ 0.966 / PSNR ≥ 38.3 | PASS | 0.9719 / 38.80 (n 15) |
| MozJPEG gain 50%: mean PSNR(품질) − PSNR(빠른) ≥ +0.5 dB | PASS | 1.06 dB |
| Floor: final q ≥ 50 (MozJPEG) / ≥ 0.50 (canvas) when the long edge is over 64 | PASS | all |
| Blockiness: BI(품질) < BI(naive) wherever naive q < 0.30 | PASS | 32/32 pairs |
| p03 at 100 KB: BI(품질) < BI(naive) | PASS | 품질 1.669, naive 12.028 (naive q 0.02) |
| HEIC h01 gives heic, never corrupt | PASS | heic |
| s01_exif6 output is portrait | PASS | 2457×3276 |
| s02_p3 at 50 %: PSNR against g02 ≥ 35.0 dB | FAIL | 29.59 dB (the decoded s02_p3 input itself: 34.28 dB) |

#### Means per target (spike-baseline images; "all" includes every input)

| Target | n | 품질 우선 SSIM / PSNR | 빠른 모드 SSIM / PSNR | Gain dB | all n | all 품질 SSIM / PSNR | spike hybrid SSIM |
|---|---|---|---|---|---|---|---|
| 500KB | 11 | 0.9496 / 36.94 | 0.9469 / 36.17 | 0.77 | 15 | 0.9551 / 37.67 | 0.9519 |
| 200KB | 14 | 0.9110 / 35.36 | 0.9081 / 34.57 | 0.80 | 20 | 0.9173 / 35.56 | 0.9097 |
| 100KB | 15 | 0.8731 / 32.26 | 0.8713 / 31.78 | 0.48 | 22 | 0.8792 / 33.22 | 0.8731 |
| 50% | 15 | 0.9711 / 39.86 | 0.9719 / 38.80 | 1.06 | 28 | 0.9524 / 39.44 | 0.9707 |

#### Timing (median ms per image, worker wall time incl. wasm compile)

| Target | 품질 우선 | 빠른 모드 | spike hybrid-mozjpeg | Flag (> 2×) |
|---|---|---|---|---|
| 500KB | 3640 | 567 | 6098 |  |
| 200KB | 2002 | 422 | 4611 |  |
| 100KB | 1238 | 317 | 3522 |  |
| 50% | 2694 | 275 | 6421 |  |

#### Blockiness distribution (BI; ≈ 1 = no block edges)

- 품질 우선: min 0.996 · median 1.557 · max 391.585
- 빠른 모드: min 1.013 · median 1.450 · max 116.455
- naive: min 1.005 · median 1.759 · max 116.455
- naive where q < 0.30: min 1.262 · median 2.481 · max 12.028; 품질 우선 on those pairs: min 1.095 · median 1.642 · max 1.968

#### Rows

| Image | Target | Result | 품질 SSIM / PSNR | q · enc · size | 빠른 SSIM / PSNR | q | util 품질 / 빠른 | BI 품질 / 빠른 / naive (q) | spike fit-moz | spike hybrid-moz | spike canvas-q40 | Problems |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| alpha.png | 50% | PASS | 0.4886 / 3.01 | 92 · mozjpeg · 800×600 | 0.4888 / 3.01 | 0.92 | 0.907 / 0.828 | 20.568 / 15.645 / 18.052 (0.93) | – | – | – |  |
| cmyk.jpg | 50% | PASS | 1 / 58.64 | 95 · mozjpeg · 400×300 | 0.9998 / 34.41 | 0.92 | 0.783 / 0.7 | 12.675 / 11.052 / 12.118 (0.98) | – | – | – |  |
| exif6_gps.jpg | 50% | PASS | 0.9866 / 44.43 | 70 · mozjpeg · 900×1200 | 0.9859 / 43.31 | 0.55 | 0.917 / 0.991 | 12.329 / 8.239 / 8.239 (0.55) | – | – | – |  |
| opaque_rgba.png | 50% | PASS | 0.8848 / 25.29 | 73 · mozjpeg · 165×293 | 0.8849 / 24.78 | 0.55 | 0.992 / 0.995 | 0.996 / 1.044 / no fit (–) | – | – | – |  |
| p3_patches.jpg | 50% | PASS | 1 / 42.17 | 83 · mozjpeg · 600×400 | 1 / 39.77 | 0.82 | 1 / 1 | 391.585 / 116.455 / 116.455 (0.82) | – | – | – |  |
| portrait_pd.jpg | 200KB | PASS | 0.951 / 37.42 | 79 · mozjpeg · 1400×1750 | 0.9502 / 36.74 | 0.67 | 0.988 / 0.984 | 1.529 / 1.458 / 1.458 (0.67) | – | – | – |  |
| portrait_pd.jpg | 100KB | PASS | 0.9061 / 33.77 | 69 · mozjpeg · 1147×1433 | 0.9045 / 33.33 | 0.57 | 0.982 / 0.994 | 1.687 / 1.578 / 1.893 (0.32) | – | – | – |  |
| portrait_pd.jpg | 50% | PASS | 0.9426 / 36.85 | 76 · mozjpeg · 1400×1750 | 0.9433 / 36.29 | 0.62 | 0.972 / 0.981 | 1.656 / 1.517 / 1.517 (0.62) | – | – | – |  |
| scene_cc0.jpg | 200KB | PASS | 0.9606 / 38.66 | 77 · mozjpeg · 1600×1012 | 0.9564 / 37.4 | 0.68 | 0.981 / 0.995 | 1.465 / 1.402 / 1.402 (0.68) | – | – | – |  |
| scene_cc0.jpg | 100KB | PASS | 0.8823 / 34.97 | 67 · mozjpeg · 1440×911 | 0.8827 / 34.57 | 0.55 | 0.972 / 0.989 | 1.859 / 1.718 / 1.909 (0.4) | – | – | – |  |
| scene_cc0.jpg | 50% | PASS | 0.9153 / 36.37 | 73 · mozjpeg · 1600×1012 | 0.9128 / 35.54 | 0.55 | 0.988 / 0.968 | 1.847 / 1.741 / 1.741 (0.55) | – | – | – |  |
| g01 | 200KB | PASS | 0.9807 / 35.39 | 71 · mozjpeg · 1800×1200 | 0.9783 / 34.23 | 0.59 | 0.991 / 0.998 | 1.328 / 1.235 / 1.235 (0.59) | 0.9833 / 35.87 | 0.9833 / 35.87 | 0.9783 / 34.23 |  |
| g01 | 100KB | PASS | 0.9414 / 30.48 | 64 · mozjpeg · 1333×889 | 0.941 / 30.04 | 0.52 | 0.991 / 0.991 | 1.401 / 1.296 / 1.643 (0.23) | 0.9396 / 30.29 | 0.9274 / 28.98 | 0.9339 / 30.17 |  |
| g01 | 50% | PASS | 0.9666 / 34.43 | 66 · mozjpeg · 1800×1200 | 0.9628 / 33.43 | 0.51 | 0.996 / 0.973 | 1.378 / 1.336 / 1.336 (0.51) | 0.9755 / 34.78 | 0.9603 / 31.84 | 0.9628 / 33.43 |  |
| g02 | 500KB | PASS | 0.9206 / 29.36 | 71 · mozjpeg · 2048×1536 | 0.9187 / 28.89 | 0.58 | 0.999 / 0.996 | 1.23 / 1.133 / 1.133 (0.58) | 0.9244 / 29.63 | 0.9244 / 29.63 | 0.9187 / 28.89 |  |
| g02 | 200KB | PASS | 0.8176 / 24.48 | 64 · mozjpeg · 1341×1006 | 0.8145 / 24.25 | 0.53 | 0.988 / 0.992 | 1.27 / 1.166 / 1.544 (0.16) | 0.8171 / 24.48 | 0.8427 / 25.38 | 0.8234 / 24.51 |  |
| g02 | 100KB | PASS | 0.7285 / 22.5 | 60 · mozjpeg · 948×711 | 0.723 / 22.29 | 0.51 | 0.979 / 0.989 | 1.282 / 1.166 / 2.269 (0.06) | 0.7223 / 22.41 | 0.75 / 22.91 | 0.7321 / 22.45 |  |
| g02 | 50% | PASS | 0.9351 / 31.38 | 81 · mozjpeg · 2048×1536 | 0.9464 / 30.64 | 0.75 | 0.994 / 0.996 | 1.193 / 1.087 / 1.087 (0.75) | 0.9351 / 31.38 | 0.9346 / 31.29 | 0.9464 / 30.64 |  |
| g03 | 500KB | PASS | 0.97 / 41.11 | 71 · mozjpeg · 3648×2048 | 0.9683 / 40.13 | 0.55 | 0.998 / 0.978 | 1.921 / 1.842 / 1.842 (0.55) | 0.97 / 41.13 | 0.97 / 41.13 | 0.9683 / 40.13 |  |
| g03 | 200KB | PASS | 0.9353 / 37.73 | 66 · mozjpeg · 2374×1333 | 0.9335 / 37.08 | 0.51 | 0.996 / 0.983 | 1.968 / 1.868 / 3.148 (0.21) | 0.9331 / 37.57 | 0.9284 / 37.33 | 0.9315 / 36.86 |  |
| g03 | 100KB | PASS | 0.9009 / 35.5 | 69 · mozjpeg · 1511×848 | 0.8996 / 34.99 | 0.57 | 0.999 / 0.998 | 1.759 / 1.652 / 5.022 (0.1) | 0.8987 / 35.4 | 0.8963 / 35.28 | 0.9006 / 34.95 |  |
| g03 | 50% | PASS | 0.984 / 45.07 | 84 · mozjpeg · 3648×2048 | 0.9858 / 43.48 | 0.8 | 0.968 / 0.974 | 1.557 / 1.397 / 1.397 (0.8) | 0.9853 / 45.38 | 0.9853 / 45.38 | 0.9858 / 43.48 |  |
| g04 | 500KB | PASS | 0.8994 / 35.21 | 70 · mozjpeg · 2823×1785 | 0.8959 / 34.83 | 0.6 | 0.964 / 0.976 | 1.702 / 1.605 / 1.891 (0.35) | 0.8957 / 35.29 | 0.9016 / 35.3 | 0.8994 / 34.95 |  |
| g04 | 200KB | PASS | 0.8133 / 33.09 | 73 · mozjpeg · 1785×1129 | 0.8122 / 32.83 | 0.64 | 0.944 / 0.973 | 1.738 / 1.615 / 3.058 (0.16) | 0.8142 / 33.13 | 0.8112 / 33.11 | 0.8192 / 32.87 |  |
| g04 | 100KB | PASS | 0.7558 / 31.97 | 75 · mozjpeg · 1262×798 | 0.7543 / 31.68 | 0.65 | 0.993 / 0.993 | 1.682 / 1.577 / 5.665 (0.09) | 0.752 / 31.89 | 0.7602 / 31.96 | 0.7588 / 31.72 |  |
| g04 | 50% | PASS | 0.9704 / 40.11 | 84 · mozjpeg · 3400×2150 | 0.9711 / 39.06 | 0.82 | 0.975 / 0.927 | 1.382 / 1.395 / 1.395 (0.82) | 0.9721 / 40.34 | 0.9704 / 40.11 | 0.9711 / 39.06 |  |
| p01 | 500KB | PASS | 0.9617 / 39.03 | 67 · mozjpeg · 2556×3195 | 0.9591 / 38.12 | 0.56 | 0.977 / 0.982 | 1.65 / 1.582 / 1.868 (0.3) | 0.9602 / 39.07 | 0.9636 / 39.25 | 0.9594 / 38.16 |  |
| p01 | 200KB | PASS | 0.9109 / 35.54 | 70 · mozjpeg · 1617×2021 | 0.9086 / 35.09 | 0.6 | 0.991 / 0.996 | 1.705 / 1.59 / 3.084 (0.11) | 0.9065 / 35.43 | 0.9116 / 35.68 | 0.9079 / 34.98 |  |
| p01 | 100KB | PASS | 0.8717 / 33.74 | 70 · mozjpeg · 1143×1429 | 0.8708 / 33.2 | 0.57 | 0.974 / 0.982 | 1.762 / 1.648 / 8.733 (0.04) | 0.871 / 33.67 | 0.871 / 33.71 | 0.8723 / 33.28 |  |
| p01 | 50% | PASS | 0.987 / 44.97 | 82 · mozjpeg · 3200×4000 | 0.987 / 43.28 | 0.76 | 0.941 / 0.948 | 1.456 / 1.355 / 1.355 (0.76) | 0.9877 / 45.39 | 0.9877 / 45.39 | 0.987 / 43.28 |  |
| p02 | 500KB | PASS | 0.9575 / 37.82 | 68 · mozjpeg · 2447×3057 | 0.9537 / 37.32 | 0.57 | 0.99 / 0.985 | 1.454 / 1.392 / 1.759 (0.23) | 0.9575 / 38.25 | 0.958 / 38.37 | 0.9548 / 37.46 |  |
| p02 | 200KB | PASS | 0.9063 / 34.88 | 73 · mozjpeg · 1548×1933 | 0.8953 / 34.11 | 0.65 | 0.991 / 0.985 | 1.421 / 1.332 / 2.742 (0.08) | 0.8923 / 34.2 | 0.8957 / 34.48 | 0.898 / 34.17 |  |
| p02 | 100KB | PASS | 0.8399 / 32.05 | 78 · mozjpeg · 1094×1367 | 0.8393 / 31.81 | 0.67 | 1 / 0.976 | 1.536 / 1.364 / no fit (–) | 0.8365 / 31.84 | 0.8427 / 32.3 | 0.8428 / 31.99 |  |
| p02 | 50% | PASS | 0.986 / 44.86 | 80 · mozjpeg · 3350×4185 | 0.9871 / 44.27 | 0.76 | 0.976 / 0.99 | 1.363 / 1.349 / 1.349 (0.76) | 0.9867 / 45.08 | 0.986 / 44.86 | 0.9871 / 44.27 |  |
| p03 | 500KB | PASS | 0.9667 / 38.72 | 67 · mozjpeg · 2532×3165 | 0.9645 / 38.02 | 0.55 | 0.993 / 0.991 | 1.64 / 1.555 / 1.971 (0.25) | 0.9654 / 38.58 | 0.9571 / 38.23 | 0.9642 / 38.06 |  |
| p03 | 200KB | PASS | 0.9205 / 35.34 | 69 · mozjpeg · 1601×2002 | 0.9175 / 34.93 | 0.58 | 0.989 / 0.99 | 1.664 / 1.565 / 3.419 (0.09) | 0.9178 / 35.26 | 0.9187 / 35.39 | 0.9182 / 34.91 |  |
| p03 | 100KB | PASS | 0.8836 / 33.28 | 70 · mozjpeg · 1132×1415 | 0.8807 / 32.9 | 0.58 | 0.986 / 0.999 | 1.669 / 1.569 / 12.028 (0.02) | 0.8817 / 33.22 | 0.8668 / 32.41 | 0.8822 / 32.99 |  |
| p03 | 50% | PASS | 0.9938 / 47.01 | 89 · mozjpeg · 3360×4200 | 0.9946 / 45.25 | 0.87 | 0.909 / 0.983 | 1.279 / 1.165 / 1.165 (0.87) | 0.9938 / 47.01 | 0.9938 / 47.01 | 0.9946 / 45.25 |  |
| p04 | 500KB | PASS | 0.9705 / 33.46 | 66 · mozjpeg · 2082×2603 | 0.9686 / 33.31 | 0.53 | 0.99 / 0.994 | 1.239 / 1.169 / 1.605 (0.12) | – | – | – |  |
| p04 | 200KB | PASS | 0.8969 / 28.4 | 68 · mozjpeg · 1317×1646 | 0.8826 / 27.55 | 0.55 | 0.999 / 0.997 | 1.307 / 1.207 / 2.613 (0.03) | – | – | – |  |
| p04 | 100KB | PASS | 0.752 / 24.49 | 71 · mozjpeg · 931×1164 | 0.762 / 24.46 | 0.57 | 0.981 / 0.999 | 1.465 / 1.261 / no fit (–) | – | – | – |  |
| p04 | 50% | PASS | 0.9954 / 44.99 | 79 · mozjpeg · 3360×4200 | 0.9948 / 43.57 | 0.68 | 0.991 / 0.982 | 1.141 / 1.102 / 1.102 (0.68) | – | – | – |  |
| p05 | 500KB | PASS | 0.9714 / 37.9 | 76 · mozjpeg · 2080×2600 | 0.9702 / 37.12 | 0.65 | 0.997 / 0.997 | 1.438 / 1.296 / 1.296 (0.65) | 0.9715 / 37.93 | 0.9715 / 37.93 | 0.9702 / 37.12 |  |
| p05 | 200KB | PASS | 0.9162 / 33.57 | 67 · mozjpeg · 1451×1813 | 0.9123 / 33.13 | 0.55 | 0.995 / 0.996 | 1.613 / 1.477 / 2.069 (0.21) | 0.9111 / 33.37 | 0.8847 / 32.43 | 0.9135 / 33.15 |  |
| p05 | 100KB | PASS | 0.8522 / 31.31 | 67 · mozjpeg · 1026×1282 | 0.8504 / 31.01 | 0.55 | 1 / 0.996 | 1.644 / 1.492 / 3.098 (0.1) | 0.8468 / 31.15 | 0.8504 / 31.24 | 0.8524 / 31.07 |  |
| p05 | 50% | PASS | 0.9912 / 45.04 | 93 · mozjpeg · 2080×2600 | 0.9921 / 41.76 | 0.92 | 0.894 / 0.663 | 1.129 / 1.067 / 1.037 (0.95) | 0.9902 / 44.34 | 0.9912 / 45.03 | 0.9921 / 41.76 |  |
| p06 | 500KB | PASS | 0.955 / 38.39 | 87 · mozjpeg · 1638×2048 | 0.9519 / 37.58 | 0.83 | 0.966 / 0.969 | 1.259 / 1.218 / 1.218 (0.83) | – | – | – |  |
| p06 | 200KB | PASS | 0.8927 / 33.89 | 73 · mozjpeg · 1474×1843 | 0.8894 / 33.1 | 0.65 | 0.961 / 0.986 | 1.497 / 1.417 / 1.527 (0.48) | – | – | – |  |
| p06 | 100KB | PASS | 0.856 / 31.56 | 67 · mozjpeg · 1117×1396 | 0.8564 / 31.26 | 0.53 | 0.974 / 0.993 | 1.558 / 1.45 / 1.908 (0.2) | – | – | – |  |
| p06 | 50% | PASS | 0.9875 / 43.12 | 92 · mozjpeg · 1638×2048 | 0.999 / 49.16 | 0.92 | 0.943 / 0.873 | 1.108 / 1.072 / 1.109 (0.94) | – | – | – |  |
| p07 | 500KB | FAIL | 0.9505 / 38.58 | 78 · mozjpeg · 2211×2948 | 0.9479 / 38.13 | 0.73 | 0.974 / 0.993 | 1.555 / 1.421 / 1.286 (0.48) | 0.9694 / 40.71 | 0.9694 / 40.71 | 0.9435 / 36.93 | 품질 SSIM 0.9505 < 0.9694 − 0.01; 품질 PSNR 38.58 < 40.71 − 0.6 |
| p07 | 200KB | PASS | 0.9093 / 36.09 | 79 · mozjpeg · 1431×1908 | 0.9067 / 35.47 | 0.72 | 0.929 / 0.973 | 1.647 / 1.483 / 2.239 (0.24) | 0.9106 / 36.02 | 0.9017 / 35.76 | 0.9114 / 35.54 |  |
| p07 | 100KB | PASS | 0.8896 / 34.6 | 79 · mozjpeg · 1012×1349 | 0.8886 / 34.01 | 0.73 | 0.969 / 0.994 | 1.556 / 1.463 / 3.811 (0.12) | 0.8887 / 34.55 | 0.8897 / 34.63 | 0.8896 / 34.16 |  |
| p07 | 50% | PASS | 0.936 / 37.66 | 79 · mozjpeg · 1945×2593 | 0.9331 / 37.04 | 0.71 | 0.998 / 0.997 | 1.593 / 1.433 / 1.833 (0.45) | 0.9427 / 38.1 | 0.9427 / 38.1 | 0.929 / 36.6 |  |
| p08 | 500KB | PASS | 0.9891 / 46.29 | 79 · mozjpeg · 2560×3413 | 0.9864 / 43.15 | 0.69 | 0.902 / 0.967 | 1.523 / 1.344 / 1.344 (0.69) | – | – | – |  |
| p08 | 200KB | PASS | 0.9728 / 41.22 | 69 · mozjpeg · 2042×2722 | 0.9723 / 39.99 | 0.56 | 0.999 / 0.99 | 1.9 / 1.787 / 2.265 (0.32) | – | – | – |  |
| p08 | 100KB | PASS | 0.9609 / 38.54 | 64 · mozjpeg · 1444×1925 | 0.9605 / 37.79 | 0.51 | 0.982 / 0.986 | 1.872 / 1.78 / 3.689 (0.12) | – | – | – |  |
| p08 | 50% | PASS | 0.9828 / 44.07 | 71 · mozjpeg · 2560×3413 | 0.9829 / 42.21 | 0.64 | 0.986 / 0.981 | 1.88 / 1.874 / 1.874 (0.64) | – | – | – |  |
| p09 | 200KB | FAIL | 0.9931 / 46.03 | 82 · mozjpeg · 1572×2097 | 0.995 / 44.81 | 0.76 | 0.956 / 0.999 | 1.388 / 1.165 / 1.165 (0.76) | 0.9943 / 46.81 | 0.9943 / 46.81 | 0.995 / 44.81 | 품질 PSNR 46.03 < 46.81 − 0.6 |
| p09 | 100KB | PASS | 0.9844 / 41.13 | 71 · mozjpeg · 1415×1887 | 0.9842 / 39.92 | 0.62 | 0.99 / 0.987 | 1.641 / 1.519 / 1.585 (0.43) | 0.9855 / 41.93 | 0.9807 / 39.16 | 0.9833 / 39.74 |  |
| p09 | 50% | PASS | 0.9857 / 41.98 | 67 · mozjpeg · 1572×2097 | 0.9857 / 40.67 | 0.51 | 0.997 / 0.993 | 1.707 / 1.549 / 1.549 (0.51) | 0.9868 / 42.73 | 0.9843 / 40.8 | 0.9857 / 40.67 |  |
| p10 | 500KB | PASS | 0.9665 / 40.61 | 68 · mozjpeg · 2184×3276 | 0.9525 / 37.5 | 0.51 | 0.958 / 0.938 | 1.305 / 1.271 / 1.271 (0.51) | – | – | – |  |
| p10 | 200KB | PASS | 0.9177 / 36.48 | 75 · mozjpeg · 1417×2126 | 0.917 / 35.72 | 0.64 | 0.999 / 0.992 | 1.699 / 1.554 / 2.331 (0.25) | – | – | – |  |
| p10 | 100KB | PASS | 0.8947 / 34.71 | 73 · mozjpeg · 1002×1503 | 0.8943 / 34 | 0.62 | 0.977 / 0.976 | 1.656 / 1.544 / 3.792 (0.12) | – | – | – |  |
| p10 | 50% | PASS | 0.9451 / 38.15 | 73 · mozjpeg · 1904×2856 | 0.9413 / 37.38 | 0.64 | 0.982 / 0.978 | 1.69 / 1.598 / 1.837 (0.47) | – | – | – |  |
| p11 | 500KB | PASS | 0.965 / 38.37 | 67 · mozjpeg · 2666×3333 | 0.9637 / 37.43 | 0.56 | 0.967 / 0.987 | 1.809 / 1.632 / 2.257 (0.22) | 0.963 / 38.28 | 0.9624 / 38.96 | 0.9636 / 37.44 |  |
| p11 | 200KB | PASS | 0.9341 / 35.67 | 67 · mozjpeg · 1686×2108 | 0.9352 / 34.93 | 0.55 | 0.977 / 0.985 | 1.9 / 1.711 / 4.794 (0.08) | 0.9333 / 35.59 | 0.9322 / 35.44 | 0.9356 / 34.96 |  |
| p11 | 100KB | PASS | 0.9155 / 33.55 | 69 · mozjpeg · 1073×1341 | 0.915 / 32.84 | 0.59 | 0.986 / 0.991 | 1.684 / 1.53 / no fit (–) | 0.9127 / 33.34 | 0.9134 / 33.21 | 0.915 / 32.89 |  |
| p11 | 50% | PASS | 0.9901 / 43.55 | 73 · mozjpeg · 3840×4800 | 0.9905 / 41.79 | 0.65 | 0.994 / 0.994 | 1.597 / 1.505 / 1.505 (0.65) | 0.9901 / 43.54 | 0.9901 / 43.54 | 0.9905 / 41.79 |  |
| p12 | 200KB | PASS | 0.987 / 46.04 | 76 · mozjpeg · 1600×1750 | 0.9814 / 42.76 | 0.61 | 0.999 / 0.99 | 1.668 / 1.559 / 1.559 (0.61) | 0.9869 / 46.02 | 0.984 / 45.34 | 0.9814 / 42.76 |  |
| p12 | 100KB | PASS | 0.9417 / 39.63 | 76 · mozjpeg · 1197×1309 | 0.9417 / 39.05 | 0.65 | 0.958 / 0.989 | 1.896 / 1.784 / 2.723 (0.44) | 0.9384 / 39.25 | 0.9382 / 39.28 | 0.9377 / 38.71 |  |
| p12 | 50% | PASS | 0.9493 / 40.26 | 76 · mozjpeg · 1323×1447 | 0.9496 / 39.7 | 0.66 | 0.944 / 0.987 | 1.938 / 1.793 / 2.388 (0.47) | 0.9461 / 40.33 | 0.9427 / 39.9 | 0.9402 / 38.79 |  |
| p13 | 50% | PASS | 0.978 / 40.54 | 73 · mozjpeg · 380×556 | 0.9767 / 39.14 | 0.6 | 0.964 / 0.999 | 1.539 / 1.427 / 1.427 (0.6) | – | – | – |  |
| p14 | 100KB | PASS | 0.9951 / 48.96 | 95 · mozjpeg · 576×584 | 0.9941 / 46.41 | 0.92 | 0.555 / 0.402 | 1.161 / 1.148 / 1.005 (0.98) | – | – | – |  |
| p14 | 50% | PASS | 0.9951 / 48.96 | 95 · mozjpeg · 576×584 | 0.9941 / 46.41 | 0.92 | 0.9 / 0.652 | 1.161 / 1.148 / 1.057 (0.96) | – | – | – |  |
| s01_exif6 | 500KB | FAIL | 0.962 / 39.61 | 67 · mozjpeg · 2457×3276 | 0.9563 / 37.86 | 0.51 | 0.957 / 0.996 | 1.328 / 1.154 / 1.154 (0.51) | 0.9682 / 40.53 | 0.9682 / 40.53 | 0.9563 / 37.86 | 품질 PSNR 39.61 < 40.53 − 0.6 |
| s01_exif6 | 200KB | PASS | 0.9111 / 36.32 | 76 · mozjpeg · 1528×2037 | 0.9083 / 35.6 | 0.67 | 0.922 / 0.977 | 1.723 / 1.562 / 2.348 (0.24) | 0.9124 / 36.23 | 0.9028 / 35.86 | 0.9135 / 35.77 |  |
| s01_exif6 | 100KB | PASS | 0.8915 / 34.86 | 76 · mozjpeg · 1080×1440 | 0.8909 / 34.21 | 0.68 | 0.954 / 0.986 | 1.635 / 1.535 / 3.921 (0.12) | 0.8911 / 34.77 | 0.891 / 34.77 | 0.8913 / 34.33 |  |
| s01_exif6 | 50% | PASS | 0.9902 / 44.81 | 79 · mozjpeg · 2457×3276 | 0.9944 / 45.91 | 0.72 | 0.969 / 0.995 | 1.154 / 1.083 / 1.083 (0.72) | 0.9902 / 44.81 | 0.9888 / 44.37 | 0.9944 / 45.91 |  |
| s02_p3 | 500KB | PASS | 0.9206 / 30.59 | 71 · mozjpeg · 2048×1536 | 0.9179 / 29.99 | 0.57 | 0.993 / 0.988 | 1.235 / 1.122 / 1.122 (0.57) | 0.9243 / 30.94 | 0.9243 / 30.94 | 0.9179 / 29.99 |  |
| s02_p3 | 200KB | PASS | 0.818 / 24.93 | 63 · mozjpeg · 1359×1019 | 0.8148 / 24.72 | 0.51 | 0.985 / 0.981 | 1.284 / 1.178 / 1.546 (0.16) | 0.8176 / 24.92 | 0.845 / 26 | 0.8229 / 24.97 |  |
| s02_p3 | 100KB | FAIL | 0.7198 / 22.61 | 70 · mozjpeg · 865×648 | 0.7131 / 22.39 | 0.63 | 0.989 / 0.999 | 1.231 / 1.126 / 2.279 (0.06) | 0.7132 / 22.48 | 0.7491 / 23.2 | 0.7318 / 22.75 | 빠른 SSIM 0.7131 < 0.7318 − 0.01 |
| s02_p3 | 50% | PASS | 0.9303 / 31.58 | 76 · mozjpeg · 2048×1536 | 0.9309 / 30.88 | 0.65 | 0.975 / 0.987 | 1.205 / 1.158 / 1.158 (0.65) | 0.9338 / 31.96 | 0.9338 / 31.96 | 0.9309 / 30.88 |  |
| s03_screenshot | 100KB | PASS | 0.9795 / 26.62 | 64 · mozjpeg · 764×1652 | 0.9772 / 26.35 | 0.52 | 0.994 / 0.992 | 1.095 / 1.013 / 1.262 (0.14) | 0.9831 / 27.1 | 0.9702 / 25.1 | 0.9788 / 26.75 |  |
| s03_screenshot | 50% | FAIL | 0.9703 / 25.15 | 69 · mozjpeg · 626×1354 | 0.967 / 24.87 | 0.61 | 0.996 / 1 | 1.151 / 1.066 / 1.334 (0.1) | 0.9722 / 25.35 | 0.9689 / 25.01 | 0.971 / 25.78 | 빠른 PSNR 24.87 < 25.78 − 0.6 |

80/85 rows pass; 21/23 aggregate rules pass.

## Appendix B: regress:compress after the Step 0 refactor

| File | Level | Result | Reduction % | Baseline % | SSIMmin | Baseline SSIMmin | Text | Images | ms | Spike ms | MB in → out | Problems |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| gen_already_small.pdf | high | PASS | 0 (kept) | – | 1 | – | 7/7 | 0/0 | 175 | – | 0.09 → 0.09 |  |
| gen_already_small.pdf | recommended | PASS | 0 (kept) | – | 1 | – | 7/7 | 0/0 | 133 | – | 0.09 → 0.09 |  |
| gen_already_small.pdf | strong | PASS | 0 (kept) | – | 1 | – | 7/7 | 0/0 | 129 | – | 0.09 → 0.09 |  |
| gen_already_small.pdf | raster | PASS | 0 (kept) | – | 1 | – | 7/7 | 0/0 | 2232 | – | 0.09 → 0.09 |  |
| gen_landscape_rotated.pdf | high | PASS | 15.3 | – | 1 | – | 2/2 | 0/0 | 68 | – | 0 → 0 |  |
| gen_landscape_rotated.pdf | recommended | PASS | 15.3 | – | 1 | – | 2/2 | 0/0 | 24 | – | 0 → 0 |  |
| gen_landscape_rotated.pdf | strong | PASS | 15.3 | – | 1 | – | 2/2 | 0/0 | 44 | – | 0 → 0 |  |
| gen_landscape_rotated.pdf | raster | PASS | 0 (kept) | – | 1 | – | 2/2 | 0/0 | 326 | – | 0 → 0 |  |
| gen_links_outline.pdf | high | PASS | 43.9 | – | 1 | – | 4/4 | 0/0 | 87 | – | 0 → 0 |  |
| gen_links_outline.pdf | recommended | PASS | 43.9 | – | 1 | – | 4/4 | 0/0 | 67 | – | 0 → 0 |  |
| gen_links_outline.pdf | strong | PASS | 43.9 | – | 1 | – | 4/4 | 0/0 | 58 | – | 0 → 0 |  |
| gen_links_outline.pdf | raster | PASS | 0 (kept) | – | 1 | – | 4/4 | 0/0 | 665 | – | 0 → 0 |  |
| gen_photo_resume.pdf | high | PASS | 88.4 | – | 0.9998 | – | 1/1 | 1/1 | 391 | – | 0.52 → 0.06 |  |
| gen_photo_resume.pdf | recommended | PASS | 89 | – | 0.9997 | – | 1/1 | 1/1 | 331 | – | 0.52 → 0.06 |  |
| gen_photo_resume.pdf | strong | PASS | 89.2 | – | 0.9992 | – | 1/1 | 1/1 | 258 | – | 0.52 → 0.06 |  |
| gen_photo_resume.pdf | raster | PASS | 79 | – | 0.957 | – | 0/1 | 0/0 | 1710 | – | 0.52 → 0.11 |  |
| gen_scan_a6.pdf | high | PASS | 61.9 | – | 0.9653 | – | 1/1 | 1/1 | 853 | – | 0.59 → 0.23 |  |
| gen_scan_a6.pdf | recommended | PASS | 93.1 | – | 0.9603 | – | 1/1 | 1/1 | 261 | – | 0.59 → 0.04 |  |
| gen_scan_a6.pdf | strong | PASS | 96.9 | – | 0.9244 | – | 1/1 | 1/1 | 206 | – | 0.59 → 0.02 |  |
| gen_scan_a6.pdf | raster | PASS | 94 | – | 0.8857 | – | 1/1 | 0/0 | 533 | – | 0.59 → 0.04 |  |
| irs_fw9.pdf | high | PASS | 12.4 | – | 1 | – | 6/6 | 0/0 | 1050 | – | 0.13 → 0.12 |  |
| irs_fw9.pdf | recommended | PASS | 12.4 | – | 1 | – | 6/6 | 0/0 | 1066 | – | 0.13 → 0.12 |  |
| irs_fw9.pdf | strong | PASS | 12.4 | – | 1 | – | 6/6 | 0/0 | 1049 | – | 0.13 → 0.12 |  |
| irs_fw9.pdf | raster | PASS | 0 (kept) | – | 1 | – | 6/6 | 0/0 | 2723 | – | 0.13 → 0.13 |  |
| kr_law_form.pdf | high | PASS | 11.6 | – | 1 | – | 7/7 | 0/0 | 133 | – | 0.1 → 0.09 |  |
| kr_law_form.pdf | recommended | PASS | 11.6 | – | 1 | – | 7/7 | 0/0 | 126 | – | 0.1 → 0.09 |  |
| kr_law_form.pdf | strong | PASS | 11.6 | – | 1 | – | 7/7 | 0/0 | 122 | – | 0.1 → 0.09 |  |
| kr_law_form.pdf | raster | PASS | 0 (kept) | – | 1 | – | 7/7 | 0/0 | 1962 | – | 0.1 → 0.1 |  |
| edge_damaged_badxref.pdf | high | PASS | 11.6 | 11.6 | 1 | 1 | 7/7 | 0/0 | 224 | 208 | 0.1 → 0.09 |  |
| edge_damaged_badxref.pdf | recommended | PASS | 11.6 | 11.6 | 1 | 1 | 7/7 | 0/0 | 255 | 198 | 0.1 → 0.09 |  |
| edge_damaged_badxref.pdf | strong | PASS | 11.6 | 11.6 | 1 | 1 | 7/7 | 0/0 | 230 | 241 | 0.1 → 0.09 |  |
| edge_damaged_badxref.pdf | raster | PASS | 0 (kept) | 0 (kept) | 1 | 1 | 7/7 | 0/0 | 2032 ⚠ | 624 | 0.1 → 0.1 |  |
| edge_damaged_truncated.pdf | high | PASS | error corrupt | ERR | – | – | – | – | – | – | 0.66 → – |  |
| edge_damaged_truncated.pdf | recommended | PASS | error corrupt | ERR | – | – | – | – | – | – | 0.66 → – |  |
| edge_damaged_truncated.pdf | strong | PASS | error corrupt | ERR | – | – | – | – | – | – | 0.66 → – |  |
| edge_damaged_truncated.pdf | raster | PASS | error corrupt | ERR | – | – | – | – | – | – | 0.66 → – |  |
| edge_encrypted_userpw_1234.pdf | high | PASS | 5.4 | 5.4 | 1 | 1 | 2/2 | 0/3 | 174 | 271 | 0.11 → 0.11 |  |
| edge_encrypted_userpw_1234.pdf | recommended | PASS | 14 | 14 | 0.9995 | 0.9995 | 2/2 | 1/3 | 178 | 239 | 0.11 → 0.1 |  |
| edge_encrypted_userpw_1234.pdf | strong | PASS | 18.1 | 18.1 | 0.999 | 0.9989 | 2/2 | 1/3 | 167 | 183 | 0.11 → 0.09 |  |
| edge_encrypted_userpw_1234.pdf | raster | PASS | 0 (kept) | 0 (kept) | 1 | 1 | 2/2 | 0/0 | 774 | 394 | 0.11 → 0.11 |  |
| en_iea_korea2025.pdf | high | PASS | 24.3 | 24.3 | 1 | 1 | 7/7 | 4/23 | 4725 | 4550 | 1.59 → 1.2 |  |
| en_iea_korea2025.pdf | recommended | PASS | 25.1 | 25.1 | 1 | 1 | 7/7 | 4/23 | 4992 | 4294 | 1.59 → 1.19 |  |
| en_iea_korea2025.pdf | strong | PASS | 25.6 | 25.6 | 1 | 1 | 7/7 | 4/23 | 4811 | 4410 | 1.59 → 1.18 |  |
| en_iea_korea2025.pdf | raster | PASS | 0 (kept) | 0 (kept) | 1 | 1 | 7/7 | 0/0 | 19508 ⚠ | 3052 | 1.59 → 1.59 |  |
| irs_f1040.pdf | high | PASS | 12 | 12 | 1 | 1 | 2/2 | 0/0 | 2305 | 2034 | 0.21 → 0.18 |  |
| irs_f1040.pdf | recommended | PASS | 12 | 12 | 1 | 1 | 2/2 | 0/0 | 2375 | 1267 | 0.21 → 0.18 |  |
| irs_f1040.pdf | strong | PASS | 12 | 12 | 1 | 1 | 2/2 | 0/0 | 2348 | 1235 | 0.21 → 0.18 |  |
| irs_f1040.pdf | raster | PASS | 0 (kept) | 0 (kept) | 1 | 1 | 2/2 | 0/0 | 1005 ⚠ | 427 | 0.21 → 0.21 |  |
| irs_fw9.pdf | high | PASS | 12.4 | 12.4 | 1 | 1 | 6/6 | 0/0 | 1049 ⚠ | 392 | 0.13 → 0.12 |  |
| irs_fw9.pdf | recommended | PASS | 12.4 | 12.4 | 1 | 1 | 6/6 | 0/0 | 1091 ⚠ | 370 | 0.13 → 0.12 |  |
| irs_fw9.pdf | strong | PASS | 12.4 | 12.4 | 1 | 1 | 6/6 | 0/0 | 990 ⚠ | 384 | 0.13 → 0.12 |  |
| irs_fw9.pdf | raster | PASS | 0 (kept) | 0 (kept) | 1 | 1 | 6/6 | 0/0 | 2679 ⚠ | 649 | 0.13 → 0.13 |  |
| kr_customs_cases.pdf | high | PASS | 17.7 | 17.7 | 1 | 1 | 7/7 | 1/388 | 6402 | 6100 | 3.75 → 3.09 |  |
| kr_customs_cases.pdf | recommended | PASS | 19.5 | 19.5 | 0.9997 | 0.9996 | 7/7 | 4/388 | 6237 | 5497 | 3.75 → 3.02 |  |
| kr_customs_cases.pdf | strong | PASS | 24.5 | 24.5 | 0.9976 | 0.9975 | 7/7 | 28/388 | 5982 | 5079 | 3.75 → 2.83 |  |
| kr_gongmun_ice.pdf | high | PASS | 8.9 | 8.9 | 1 | 1 | 7/7 | 11/2272 | 24908 | 28640 | 15.23 → 13.87 |  |
| kr_gongmun_ice.pdf | recommended | PASS | 13 | 13 | 1 | 1 | 7/7 | 51/2272 | 23231 | 23385 | 15.23 → 13.24 |  |
| kr_gongmun_ice.pdf | strong | PASS | 18.8 | 18.8 | 1 | 1 | 7/7 | 81/2272 | 25045 | 19897 | 15.23 → 12.36 |  |
| kr_gongmun_moleg.pdf | high | PASS | 4.1 | 4.1 | 1 | 1 | 2/2 | 0/3 | 157 | 162 | 0.11 → 0.11 |  |
| kr_gongmun_moleg.pdf | recommended | PASS | 12.8 | 12.8 | 0.9995 | 0.9995 | 2/2 | 1/3 | 140 | 146 | 0.11 → 0.1 |  |
| kr_gongmun_moleg.pdf | strong | PASS | 17 | 17 | 0.999 | 0.9989 | 2/2 | 1/3 | 117 | 149 | 0.11 → 0.09 |  |
| kr_gongmun_moleg.pdf | raster | PASS | 0 (kept) | 0 (kept) | 1 | 1 | 2/2 | 0/0 | 811 ⚠ | 271 | 0.11 → 0.11 |  |
| kr_gongmun_msit.pdf | high | PASS | 10.8 | 10.8 | 1 | 1 | 1/1 | 1/5 | 193 | 165 | 0.12 → 0.1 |  |
| kr_gongmun_msit.pdf | recommended | PASS | 15.4 | 15.4 | 0.9995 | 0.9995 | 1/1 | 1/5 | 139 | 144 | 0.12 → 0.1 |  |
| kr_gongmun_msit.pdf | strong | PASS | 17 | 17 | 0.9994 | 0.9993 | 1/1 | 1/5 | 82 | 140 | 0.12 → 0.1 |  |
| kr_gongmun_msit.pdf | raster | PASS | 23.2 | 23.2 | 0.9605 | 0.9605 | 0/1 | 0/0 | 455 | 299 | 0.12 → 0.09 |  |
| kr_gongmun_opm.pdf | high | PASS | 13.9 | 13.9 | 1 | 1 | 4/4 | 0/227 | 404 | 290 | 0.27 → 0.23 |  |
| kr_gongmun_opm.pdf | recommended | PASS | 13.9 | 13.9 | 1 | 1 | 4/4 | 0/227 | 415 | 312 | 0.27 → 0.23 |  |
| kr_gongmun_opm.pdf | strong | PASS | 13.9 | 13.9 | 1 | 1 | 4/4 | 0/227 | 418 | 307 | 0.27 → 0.23 |  |
| kr_gongmun_opm.pdf | raster | PASS | 0 (kept) | 0 (kept) | 1 | 1 | 4/4 | 0/0 | 2096 ⚠ | 677 | 0.27 → 0.27 |  |
| kr_kcc_briefing.pdf | high | PASS | 6.5 | 6.5 | 1 | 0.9999 | 20/20 | 2/29 | 3118 | 1629 | 0.78 → 0.73 |  |
| kr_kcc_briefing.pdf | recommended | PASS | 8.5 | 8.5 | 0.9992 | 0.9992 | 20/20 | 3/29 | 1885 | 1625 | 0.78 → 0.71 |  |
| kr_kcc_briefing.pdf | strong | PASS | 14.9 | 14.9 | 0.9884 | 0.9879 | 20/20 | 14/29 | 1700 | 1493 | 0.78 → 0.66 |  |
| kr_kcc_briefing.pdf | raster | PASS | 0 (kept) | 0 (kept) | 1 | 1 | 20/20 | 0/0 | 9416 ⚠ | 1855 | 0.78 → 0.78 |  |
| kr_kpmg_outlook.pdf | high | PASS | 19.4 | 19.7 | 1 | 1 | 51/51 | 3/78 | 38838 | 43110 | 38.78 → 31.25 |  |
| kr_kpmg_outlook.pdf | recommended | PASS | 20.7 | 20.9 | 0.9632 | 0.9637 | 51/51 | 5/78 | 36549 | 43693 | 38.78 → 30.77 |  |
| kr_kpmg_outlook.pdf | strong | PASS | 21.2 | 21.4 | 0.9577 | 0.9572 | 51/51 | 5/78 | 45988 | 41965 | 38.78 → 30.56 |  |
| kr_kpmg_outlook.pdf | raster | PASS | 79.9 | 79.9 | 0.9335 | 0.9335 | 51/51 | 0/0 | 55134 ⚠ | 9910 | 38.78 → 7.79 |  |
| kr_law_form.pdf | high | PASS | 11.6 | 11.6 | 1 | 1 | 7/7 | 0/0 | 194 | 225 | 0.1 → 0.09 |  |
| kr_law_form.pdf | recommended | PASS | 11.6 | 11.6 | 1 | 1 | 7/7 | 0/0 | 173 | 190 | 0.1 → 0.09 |  |
| kr_law_form.pdf | strong | PASS | 11.6 | 11.6 | 1 | 1 | 7/7 | 0/0 | 108 | 180 | 0.1 → 0.09 |  |
| kr_law_form.pdf | raster | PASS | 0 (kept) | 0 (kept) | 1 | 1 | 7/7 | 0/0 | 2710 ⚠ | 614 | 0.1 → 0.1 |  |
| kr_pen_doc.pdf | high | PASS | 9.4 | 9.4 | 1 | 1 | 1/1 | 0/3 | 101 | 94 | 0.1 → 0.09 |  |
| kr_pen_doc.pdf | recommended | PASS | 9.4 | 9.4 | 1 | 1 | 1/1 | 0/3 | 124 | 107 | 0.1 → 0.09 |  |
| kr_pen_doc.pdf | strong | PASS | 9.4 | 9.4 | 1 | 1 | 1/1 | 0/3 | 79 | 107 | 0.1 → 0.09 |  |
| kr_pen_doc.pdf | raster | PASS | 0 (kept) | 0 (kept) | 1 | 1 | 1/1 | 0/0 | 531 ⚠ | 233 | 0.1 → 0.1 |  |
| pdfjs_tracemonkey.pdf | high | PASS | 21.3 | 21.3 | 1 | 1 | 14/14 | 0/178 | 891 | 710 | 0.97 → 0.76 |  |
| pdfjs_tracemonkey.pdf | recommended | PASS | 21.3 | 21.3 | 1 | 1 | 14/14 | 0/178 | 877 | 644 | 0.97 → 0.76 |  |
| pdfjs_tracemonkey.pdf | strong | PASS | 21.3 | 21.3 | 1 | 1 | 14/14 | 0/178 | 927 | 715 | 0.97 → 0.76 |  |
| pdfjs_tracemonkey.pdf | raster | PASS | 0 (kept) | 0 (kept) | 1 | 1 | 14/14 | 0/0 | 8842 ⚠ | 1353 | 0.97 → 0.97 |  |
| resume_racz_cc0.pdf | high | PASS | 2.2 | 2.2 | 1 | 1 | 7/7 | 0/0 | 596 | 681 | 1.28 → 1.25 |  |
| resume_racz_cc0.pdf | recommended | PASS | 2.2 | 2.2 | 1 | 1 | 7/7 | 0/0 | 613 | 588 | 1.28 → 1.25 |  |
| resume_racz_cc0.pdf | strong | PASS | 2.2 | 2.2 | 1 | 1 | 7/7 | 0/0 | 583 | 573 | 1.28 → 1.25 |  |
| resume_racz_cc0.pdf | raster | PASS | 0 (kept) | 0 (kept) | 1 | 1 | 7/7 | 0/0 | 28130 ⚠ | 3069 | 1.28 → 1.28 |  |
| scan_book_sangsomun.pdf | high | PASS | 0 (kept) | 0.5 | 1 | 1 | 7/7 | 0/192 | 1120 | 881 | 11.69 → 11.69 |  |
| scan_book_sangsomun.pdf | recommended | PASS | 0 (kept) | 0.5 | 1 | 1 | 7/7 | 0/192 | 1151 | 1024 | 11.69 → 11.69 |  |
| scan_book_sangsomun.pdf | strong | PASS | 0 (kept) | 0.5 | 1 | 1 | 7/7 | 0/192 | 1159 | 972 | 11.69 → 11.69 |  |
| scan_book_sangsomun.pdf | raster | PASS | 32.7 | 32.7 | 0.8913 | 0.8913 | 2/7 | 0/0 | 58601 | 39946 | 11.69 → 7.86 |  |
| scan_donga_1949.pdf | high | PASS | 0 (kept) | 0 | 1 | 1 | 2/2 | 0/2 | 138 | 114 | 2.3 → 2.3 |  |
| scan_donga_1949.pdf | recommended | PASS | 0 (kept) | 0 | 1 | 1 | 2/2 | 0/2 | 116 | 108 | 2.3 → 2.3 |  |
| scan_donga_1949.pdf | strong | PASS | 0 (kept) | 0 | 1 | 1 | 2/2 | 0/2 | 112 | 86 | 2.3 → 2.3 |  |
| scan_donga_1949.pdf | raster | PASS | 0 (kept) | 0 (kept) | 1 | 1 | 2/2 | 0/0 | 6433 ⚠ | 1169 | 2.3 → 2.3 |  |
| scan_keti_bizreg_bank.pdf | high | PASS | 1.1 | 1.1 | 1 | 1 | 2/2 | 0/2 | 462 | 536 | 0.11 → 0.11 |  |
| scan_keti_bizreg_bank.pdf | recommended | PASS | 9.8 | 9.8 | 0.9964 | 0.9963 | 2/2 | 1/2 | 443 | 459 | 0.11 → 0.1 |  |
| scan_keti_bizreg_bank.pdf | strong | PASS | 29.4 | 29.4 | 0.988 | 0.9879 | 2/2 | 2/2 | 399 | 396 | 0.11 → 0.08 |  |
| scan_keti_bizreg_bank.pdf | raster | PASS | 0 (kept) | 0 (kept) | 1 | 1 | 2/2 | 0/0 | 991 ⚠ | 186 | 0.11 → 0.11 |  |
| scan_us_nkarmy_history.pdf | high | PASS | 2 | 2 | 1 | 1 | 7/7 | 0/397 | 9752 | 10866 | 17.58 → 17.23 |  |
| scan_us_nkarmy_history.pdf | recommended | PASS | 3.5 | 3.5 | 0.9983 | 0.9983 | 7/7 | 23/397 | 8989 | 10152 | 17.58 → 16.97 |  |
| scan_us_nkarmy_history.pdf | strong | PASS | 5.8 | 5.8 | 0.9651 | 0.9649 | 7/7 | 33/397 | 8447 | 8128 | 17.58 → 16.56 |  |
| scan_us_nkarmy_history.pdf | raster | PASS | 0 (kept) | 0 (kept) | 1 | 1 | 7/7 | 0/0 | 113379 ⚠ | 25896 | 17.58 → 17.58 |  |
| synth_resume_kr_photo.pdf | high | PASS | 94.3 | 94.3 | 0.9997 | 0.9997 | 1/1 | 1/1 | 610 | 1161 | 1.38 → 0.08 |  |
| synth_resume_kr_photo.pdf | recommended | PASS | 95.6 | 95.6 | 0.9997 | 0.9997 | 1/1 | 1/1 | 564 | 1212 | 1.38 → 0.06 |  |
| synth_resume_kr_photo.pdf | strong | PASS | 96.1 | 96.1 | 0.9992 | 0.9992 | 1/1 | 1/1 | 539 | 1189 | 1.38 → 0.05 |  |
| synth_resume_kr_photo.pdf | raster | PASS | 85.1 | 85.1 | 0.9183 | 0.9183 | 0/1 | 0/0 | 7896 ⚠ | 1527 | 1.38 → 0.21 |  |
| synth_scan_mfp_gongmun.pdf | high | PASS | 87.3 | 87.3 | 0.9532 | 0.9531 | 4/4 | 4/4 | 5067 | 7048 | 8.66 → 1.1 |  |
| synth_scan_mfp_gongmun.pdf | recommended | PASS | 95.6 | 95.6 | 0.945 | 0.9449 | 4/4 | 4/4 | 3160 | 4363 | 8.66 → 0.38 |  |
| synth_scan_mfp_gongmun.pdf | strong | PASS | 98 | 98 | 0.9274 | 0.9273 | 4/4 | 4/4 | 2238 | 2816 | 8.66 → 0.17 |  |
| synth_scan_mfp_gongmun.pdf | raster | PASS | 96.1 | 96.1 | 0.9243 | 0.9243 | 4/4 | 0/0 | 25873 ⚠ | 457 | 8.66 → 0.34 |  |
| synth_scan_phone_cv.pdf | high | PASS | 54.1 | 54.1 | 0.9769 | 0.972 | 2/2 | 2/2 | 3058 | 2893 | 2.22 → 1.02 |  |
| synth_scan_phone_cv.pdf | recommended | PASS | 85.1 | 85.1 | 0.9682 | 0.968 | 2/2 | 2/2 | 1806 | 1457 | 2.22 → 0.33 |  |
| synth_scan_phone_cv.pdf | strong | PASS | 94 | 94 | 0.9301 | 0.9314 | 2/2 | 2/2 | 1154 | 1260 | 2.22 → 0.13 |  |
| synth_scan_phone_cv.pdf | raster | PASS | 86.7 | 86.7 | 0.8873 | 0.8873 | 2/2 | 0/0 | 9585 ⚠ | 272 | 2.22 → 0.3 |  |

122/122 pass.

Slower than 2 × spike (flag, not a failure):
- edge_damaged_badxref.pdf [raster] 2032 ms vs spike 624 ms
- en_iea_korea2025.pdf [raster] 19508 ms vs spike 3052 ms
- irs_f1040.pdf [raster] 1005 ms vs spike 427 ms
- irs_fw9.pdf [high] 1049 ms vs spike 392 ms
- irs_fw9.pdf [recommended] 1091 ms vs spike 370 ms
- irs_fw9.pdf [strong] 990 ms vs spike 384 ms
- irs_fw9.pdf [raster] 2679 ms vs spike 649 ms
- kr_gongmun_moleg.pdf [raster] 811 ms vs spike 271 ms
- kr_gongmun_opm.pdf [raster] 2096 ms vs spike 677 ms
- kr_kcc_briefing.pdf [raster] 9416 ms vs spike 1855 ms
- kr_kpmg_outlook.pdf [raster] 55134 ms vs spike 9910 ms
- kr_law_form.pdf [raster] 2710 ms vs spike 614 ms
- kr_pen_doc.pdf [raster] 531 ms vs spike 233 ms
- pdfjs_tracemonkey.pdf [raster] 8842 ms vs spike 1353 ms
- resume_racz_cc0.pdf [raster] 28130 ms vs spike 3069 ms
- scan_donga_1949.pdf [raster] 6433 ms vs spike 1169 ms
- scan_keti_bizreg_bank.pdf [raster] 991 ms vs spike 186 ms
- scan_us_nkarmy_history.pdf [raster] 113379 ms vs spike 25896 ms
- synth_resume_kr_photo.pdf [raster] 7896 ms vs spike 1527 ms
- synth_scan_mfp_gongmun.pdf [raster] 25873 ms vs spike 457 ms
- synth_scan_phone_cv.pdf [raster] 9585 ms vs spike 272 ms

## Appendix C: regress:compress before (identical except the ms columns)

| File | Level | Result | Reduction % | Baseline % | SSIMmin | Baseline SSIMmin | Text | Images | ms | Spike ms | MB in → out | Problems |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| gen_already_small.pdf | high | PASS | 0 (kept) | – | 1 | – | 7/7 | 0/0 | 165 | – | 0.09 → 0.09 |  |
| gen_already_small.pdf | recommended | PASS | 0 (kept) | – | 1 | – | 7/7 | 0/0 | 155 | – | 0.09 → 0.09 |  |
| gen_already_small.pdf | strong | PASS | 0 (kept) | – | 1 | – | 7/7 | 0/0 | 153 | – | 0.09 → 0.09 |  |
| gen_already_small.pdf | raster | PASS | 0 (kept) | – | 1 | – | 7/7 | 0/0 | 2410 | – | 0.09 → 0.09 |  |
| gen_landscape_rotated.pdf | high | PASS | 15.3 | – | 1 | – | 2/2 | 0/0 | 61 | – | 0 → 0 |  |
| gen_landscape_rotated.pdf | recommended | PASS | 15.3 | – | 1 | – | 2/2 | 0/0 | 52 | – | 0 → 0 |  |
| gen_landscape_rotated.pdf | strong | PASS | 15.3 | – | 1 | – | 2/2 | 0/0 | 28 | – | 0 → 0 |  |
| gen_landscape_rotated.pdf | raster | PASS | 0 (kept) | – | 1 | – | 2/2 | 0/0 | 353 | – | 0 → 0 |  |
| gen_links_outline.pdf | high | PASS | 43.9 | – | 1 | – | 4/4 | 0/0 | 26 | – | 0 → 0 |  |
| gen_links_outline.pdf | recommended | PASS | 43.9 | – | 1 | – | 4/4 | 0/0 | 55 | – | 0 → 0 |  |
| gen_links_outline.pdf | strong | PASS | 43.9 | – | 1 | – | 4/4 | 0/0 | 53 | – | 0 → 0 |  |
| gen_links_outline.pdf | raster | PASS | 0 (kept) | – | 1 | – | 4/4 | 0/0 | 670 | – | 0 → 0 |  |
| gen_photo_resume.pdf | high | PASS | 88.4 | – | 0.9998 | – | 1/1 | 1/1 | 384 | – | 0.52 → 0.06 |  |
| gen_photo_resume.pdf | recommended | PASS | 89 | – | 0.9997 | – | 1/1 | 1/1 | 268 | – | 0.52 → 0.06 |  |
| gen_photo_resume.pdf | strong | PASS | 89.2 | – | 0.9992 | – | 1/1 | 1/1 | 279 | – | 0.52 → 0.06 |  |
| gen_photo_resume.pdf | raster | PASS | 79 | – | 0.957 | – | 0/1 | 0/0 | 1646 | – | 0.52 → 0.11 |  |
| gen_scan_a6.pdf | high | PASS | 61.9 | – | 0.9653 | – | 1/1 | 1/1 | 910 | – | 0.59 → 0.23 |  |
| gen_scan_a6.pdf | recommended | PASS | 93.1 | – | 0.9603 | – | 1/1 | 1/1 | 294 | – | 0.59 → 0.04 |  |
| gen_scan_a6.pdf | strong | PASS | 96.9 | – | 0.9244 | – | 1/1 | 1/1 | 228 | – | 0.59 → 0.02 |  |
| gen_scan_a6.pdf | raster | PASS | 94 | – | 0.8857 | – | 1/1 | 0/0 | 570 | – | 0.59 → 0.04 |  |
| irs_fw9.pdf | high | PASS | 12.4 | – | 1 | – | 6/6 | 0/0 | 1020 | – | 0.13 → 0.12 |  |
| irs_fw9.pdf | recommended | PASS | 12.4 | – | 1 | – | 6/6 | 0/0 | 1099 | – | 0.13 → 0.12 |  |
| irs_fw9.pdf | strong | PASS | 12.4 | – | 1 | – | 6/6 | 0/0 | 1162 | – | 0.13 → 0.12 |  |
| irs_fw9.pdf | raster | PASS | 0 (kept) | – | 1 | – | 6/6 | 0/0 | 3209 | – | 0.13 → 0.13 |  |
| kr_law_form.pdf | high | PASS | 11.6 | – | 1 | – | 7/7 | 0/0 | 121 | – | 0.1 → 0.09 |  |
| kr_law_form.pdf | recommended | PASS | 11.6 | – | 1 | – | 7/7 | 0/0 | 150 | – | 0.1 → 0.09 |  |
| kr_law_form.pdf | strong | PASS | 11.6 | – | 1 | – | 7/7 | 0/0 | 108 | – | 0.1 → 0.09 |  |
| kr_law_form.pdf | raster | PASS | 0 (kept) | – | 1 | – | 7/7 | 0/0 | 2166 | – | 0.1 → 0.1 |  |
| edge_damaged_badxref.pdf | high | PASS | 11.6 | 11.6 | 1 | 1 | 7/7 | 0/0 | 226 | 208 | 0.1 → 0.09 |  |
| edge_damaged_badxref.pdf | recommended | PASS | 11.6 | 11.6 | 1 | 1 | 7/7 | 0/0 | 244 | 198 | 0.1 → 0.09 |  |
| edge_damaged_badxref.pdf | strong | PASS | 11.6 | 11.6 | 1 | 1 | 7/7 | 0/0 | 214 | 241 | 0.1 → 0.09 |  |
| edge_damaged_badxref.pdf | raster | PASS | 0 (kept) | 0 (kept) | 1 | 1 | 7/7 | 0/0 | 2048 ⚠ | 624 | 0.1 → 0.1 |  |
| edge_damaged_truncated.pdf | high | PASS | error corrupt | ERR | – | – | – | – | – | – | 0.66 → – |  |
| edge_damaged_truncated.pdf | recommended | PASS | error corrupt | ERR | – | – | – | – | – | – | 0.66 → – |  |
| edge_damaged_truncated.pdf | strong | PASS | error corrupt | ERR | – | – | – | – | – | – | 0.66 → – |  |
| edge_damaged_truncated.pdf | raster | PASS | error corrupt | ERR | – | – | – | – | – | – | 0.66 → – |  |
| edge_encrypted_userpw_1234.pdf | high | PASS | 5.4 | 5.4 | 1 | 1 | 2/2 | 0/3 | 192 | 271 | 0.11 → 0.11 |  |
| edge_encrypted_userpw_1234.pdf | recommended | PASS | 14 | 14 | 0.9995 | 0.9995 | 2/2 | 1/3 | 170 | 239 | 0.11 → 0.1 |  |
| edge_encrypted_userpw_1234.pdf | strong | PASS | 18.1 | 18.1 | 0.999 | 0.9989 | 2/2 | 1/3 | 157 | 183 | 0.11 → 0.09 |  |
| edge_encrypted_userpw_1234.pdf | raster | PASS | 0 (kept) | 0 (kept) | 1 | 1 | 2/2 | 0/0 | 695 | 394 | 0.11 → 0.11 |  |
| en_iea_korea2025.pdf | high | PASS | 24.3 | 24.3 | 1 | 1 | 7/7 | 4/23 | 4957 | 4550 | 1.59 → 1.2 |  |
| en_iea_korea2025.pdf | recommended | PASS | 25.1 | 25.1 | 1 | 1 | 7/7 | 4/23 | 4913 | 4294 | 1.59 → 1.19 |  |
| en_iea_korea2025.pdf | strong | PASS | 25.6 | 25.6 | 1 | 1 | 7/7 | 4/23 | 4869 | 4410 | 1.59 → 1.18 |  |
| en_iea_korea2025.pdf | raster | PASS | 0 (kept) | 0 (kept) | 1 | 1 | 7/7 | 0/0 | 21824 ⚠ | 3052 | 1.59 → 1.59 |  |
| irs_f1040.pdf | high | PASS | 12 | 12 | 1 | 1 | 2/2 | 0/0 | 2331 | 2034 | 0.21 → 0.18 |  |
| irs_f1040.pdf | recommended | PASS | 12 | 12 | 1 | 1 | 2/2 | 0/0 | 2361 | 1267 | 0.21 → 0.18 |  |
| irs_f1040.pdf | strong | PASS | 12 | 12 | 1 | 1 | 2/2 | 0/0 | 2363 | 1235 | 0.21 → 0.18 |  |
| irs_f1040.pdf | raster | PASS | 0 (kept) | 0 (kept) | 1 | 1 | 2/2 | 0/0 | 998 ⚠ | 427 | 0.21 → 0.21 |  |
| irs_fw9.pdf | high | PASS | 12.4 | 12.4 | 1 | 1 | 6/6 | 0/0 | 1078 ⚠ | 392 | 0.13 → 0.12 |  |
| irs_fw9.pdf | recommended | PASS | 12.4 | 12.4 | 1 | 1 | 6/6 | 0/0 | 1109 ⚠ | 370 | 0.13 → 0.12 |  |
| irs_fw9.pdf | strong | PASS | 12.4 | 12.4 | 1 | 1 | 6/6 | 0/0 | 1062 ⚠ | 384 | 0.13 → 0.12 |  |
| irs_fw9.pdf | raster | PASS | 0 (kept) | 0 (kept) | 1 | 1 | 6/6 | 0/0 | 2757 ⚠ | 649 | 0.13 → 0.13 |  |
| kr_customs_cases.pdf | high | PASS | 17.7 | 17.7 | 1 | 1 | 7/7 | 1/388 | 6661 | 6100 | 3.75 → 3.09 |  |
| kr_customs_cases.pdf | recommended | PASS | 19.5 | 19.5 | 0.9997 | 0.9996 | 7/7 | 4/388 | 6929 | 5497 | 3.75 → 3.02 |  |
| kr_customs_cases.pdf | strong | PASS | 24.5 | 24.5 | 0.9976 | 0.9975 | 7/7 | 28/388 | 6458 | 5079 | 3.75 → 2.83 |  |
| kr_gongmun_ice.pdf | high | PASS | 8.9 | 8.9 | 1 | 1 | 7/7 | 11/2272 | 26119 | 28640 | 15.23 → 13.87 |  |
| kr_gongmun_ice.pdf | recommended | PASS | 13 | 13 | 1 | 1 | 7/7 | 51/2272 | 24722 | 23385 | 15.23 → 13.24 |  |
| kr_gongmun_ice.pdf | strong | PASS | 18.8 | 18.8 | 1 | 1 | 7/7 | 81/2272 | 22848 | 19897 | 15.23 → 12.36 |  |
| kr_gongmun_moleg.pdf | high | PASS | 4.1 | 4.1 | 1 | 1 | 2/2 | 0/3 | 122 | 162 | 0.11 → 0.11 |  |
| kr_gongmun_moleg.pdf | recommended | PASS | 12.8 | 12.8 | 0.9995 | 0.9995 | 2/2 | 1/3 | 120 | 146 | 0.11 → 0.1 |  |
| kr_gongmun_moleg.pdf | strong | PASS | 17 | 17 | 0.999 | 0.9989 | 2/2 | 1/3 | 101 | 149 | 0.11 → 0.09 |  |
| kr_gongmun_moleg.pdf | raster | PASS | 0 (kept) | 0 (kept) | 1 | 1 | 2/2 | 0/0 | 594 ⚠ | 271 | 0.11 → 0.11 |  |
| kr_gongmun_msit.pdf | high | PASS | 10.8 | 10.8 | 1 | 1 | 1/1 | 1/5 | 137 | 165 | 0.12 → 0.1 |  |
| kr_gongmun_msit.pdf | recommended | PASS | 15.4 | 15.4 | 0.9995 | 0.9995 | 1/1 | 1/5 | 116 | 144 | 0.12 → 0.1 |  |
| kr_gongmun_msit.pdf | strong | PASS | 17 | 17 | 0.9994 | 0.9993 | 1/1 | 1/5 | 76 | 140 | 0.12 → 0.1 |  |
| kr_gongmun_msit.pdf | raster | PASS | 23.2 | 23.2 | 0.9605 | 0.9605 | 0/1 | 0/0 | 351 | 299 | 0.12 → 0.09 |  |
| kr_gongmun_opm.pdf | high | PASS | 13.9 | 13.9 | 1 | 1 | 4/4 | 0/227 | 390 | 290 | 0.27 → 0.23 |  |
| kr_gongmun_opm.pdf | recommended | PASS | 13.9 | 13.9 | 1 | 1 | 4/4 | 0/227 | 368 | 312 | 0.27 → 0.23 |  |
| kr_gongmun_opm.pdf | strong | PASS | 13.9 | 13.9 | 1 | 1 | 4/4 | 0/227 | 399 | 307 | 0.27 → 0.23 |  |
| kr_gongmun_opm.pdf | raster | PASS | 0 (kept) | 0 (kept) | 1 | 1 | 4/4 | 0/0 | 1427 ⚠ | 677 | 0.27 → 0.27 |  |
| kr_kcc_briefing.pdf | high | PASS | 6.5 | 6.5 | 1 | 0.9999 | 20/20 | 2/29 | 1814 | 1629 | 0.78 → 0.73 |  |
| kr_kcc_briefing.pdf | recommended | PASS | 8.5 | 8.5 | 0.9992 | 0.9992 | 20/20 | 3/29 | 1800 | 1625 | 0.78 → 0.71 |  |
| kr_kcc_briefing.pdf | strong | PASS | 14.9 | 14.9 | 0.9884 | 0.9879 | 20/20 | 14/29 | 1664 | 1493 | 0.78 → 0.66 |  |
| kr_kcc_briefing.pdf | raster | PASS | 0 (kept) | 0 (kept) | 1 | 1 | 20/20 | 0/0 | 9193 ⚠ | 1855 | 0.78 → 0.78 |  |
| kr_kpmg_outlook.pdf | high | PASS | 19.4 | 19.7 | 1 | 1 | 51/51 | 3/78 | 36659 | 43110 | 38.78 → 31.25 |  |
| kr_kpmg_outlook.pdf | recommended | PASS | 20.7 | 20.9 | 0.9632 | 0.9637 | 51/51 | 5/78 | 35934 | 43693 | 38.78 → 30.77 |  |
| kr_kpmg_outlook.pdf | strong | PASS | 21.2 | 21.4 | 0.9577 | 0.9572 | 51/51 | 5/78 | 34963 | 41965 | 38.78 → 30.56 |  |
| kr_kpmg_outlook.pdf | raster | PASS | 79.9 | 79.9 | 0.9335 | 0.9335 | 51/51 | 0/0 | 28043 ⚠ | 9910 | 38.78 → 7.79 |  |
| kr_law_form.pdf | high | PASS | 11.6 | 11.6 | 1 | 1 | 7/7 | 0/0 | 114 | 225 | 0.1 → 0.09 |  |
| kr_law_form.pdf | recommended | PASS | 11.6 | 11.6 | 1 | 1 | 7/7 | 0/0 | 112 | 190 | 0.1 → 0.09 |  |
| kr_law_form.pdf | strong | PASS | 11.6 | 11.6 | 1 | 1 | 7/7 | 0/0 | 124 | 180 | 0.1 → 0.09 |  |
| kr_law_form.pdf | raster | PASS | 0 (kept) | 0 (kept) | 1 | 1 | 7/7 | 0/0 | 1781 ⚠ | 614 | 0.1 → 0.1 |  |
| kr_pen_doc.pdf | high | PASS | 9.4 | 9.4 | 1 | 1 | 1/1 | 0/3 | 94 | 94 | 0.1 → 0.09 |  |
| kr_pen_doc.pdf | recommended | PASS | 9.4 | 9.4 | 1 | 1 | 1/1 | 0/3 | 100 | 107 | 0.1 → 0.09 |  |
| kr_pen_doc.pdf | strong | PASS | 9.4 | 9.4 | 1 | 1 | 1/1 | 0/3 | 103 | 107 | 0.1 → 0.09 |  |
| kr_pen_doc.pdf | raster | PASS | 0 (kept) | 0 (kept) | 1 | 1 | 1/1 | 0/0 | 372 | 233 | 0.1 → 0.1 |  |
| pdfjs_tracemonkey.pdf | high | PASS | 21.3 | 21.3 | 1 | 1 | 14/14 | 0/178 | 831 | 710 | 0.97 → 0.76 |  |
| pdfjs_tracemonkey.pdf | recommended | PASS | 21.3 | 21.3 | 1 | 1 | 14/14 | 0/178 | 837 | 644 | 0.97 → 0.76 |  |
| pdfjs_tracemonkey.pdf | strong | PASS | 21.3 | 21.3 | 1 | 1 | 14/14 | 0/178 | 847 | 715 | 0.97 → 0.76 |  |
| pdfjs_tracemonkey.pdf | raster | PASS | 0 (kept) | 0 (kept) | 1 | 1 | 14/14 | 0/0 | 6670 ⚠ | 1353 | 0.97 → 0.97 |  |
| resume_racz_cc0.pdf | high | PASS | 2.2 | 2.2 | 1 | 1 | 7/7 | 0/0 | 519 | 681 | 1.28 → 1.25 |  |
| resume_racz_cc0.pdf | recommended | PASS | 2.2 | 2.2 | 1 | 1 | 7/7 | 0/0 | 524 | 588 | 1.28 → 1.25 |  |
| resume_racz_cc0.pdf | strong | PASS | 2.2 | 2.2 | 1 | 1 | 7/7 | 0/0 | 508 | 573 | 1.28 → 1.25 |  |
| resume_racz_cc0.pdf | raster | PASS | 0 (kept) | 0 (kept) | 1 | 1 | 7/7 | 0/0 | 22205 ⚠ | 3069 | 1.28 → 1.28 |  |
| scan_book_sangsomun.pdf | high | PASS | 0 (kept) | 0.5 | 1 | 1 | 7/7 | 0/192 | 1052 | 881 | 11.69 → 11.69 |  |
| scan_book_sangsomun.pdf | recommended | PASS | 0 (kept) | 0.5 | 1 | 1 | 7/7 | 0/192 | 1070 | 1024 | 11.69 → 11.69 |  |
| scan_book_sangsomun.pdf | strong | PASS | 0 (kept) | 0.5 | 1 | 1 | 7/7 | 0/192 | 1042 | 972 | 11.69 → 11.69 |  |
| scan_book_sangsomun.pdf | raster | PASS | 32.7 | 32.7 | 0.8913 | 0.8913 | 2/7 | 0/0 | 47997 | 39946 | 11.69 → 7.86 |  |
| scan_donga_1949.pdf | high | PASS | 0 (kept) | 0 | 1 | 1 | 2/2 | 0/2 | 108 | 114 | 2.3 → 2.3 |  |
| scan_donga_1949.pdf | recommended | PASS | 0 (kept) | 0 | 1 | 1 | 2/2 | 0/2 | 101 | 108 | 2.3 → 2.3 |  |
| scan_donga_1949.pdf | strong | PASS | 0 (kept) | 0 | 1 | 1 | 2/2 | 0/2 | 108 | 86 | 2.3 → 2.3 |  |
| scan_donga_1949.pdf | raster | PASS | 0 (kept) | 0 (kept) | 1 | 1 | 2/2 | 0/0 | 4742 ⚠ | 1169 | 2.3 → 2.3 |  |
| scan_keti_bizreg_bank.pdf | high | PASS | 1.1 | 1.1 | 1 | 1 | 2/2 | 0/2 | 368 | 536 | 0.11 → 0.11 |  |
| scan_keti_bizreg_bank.pdf | recommended | PASS | 9.8 | 9.8 | 0.9964 | 0.9963 | 2/2 | 1/2 | 324 | 459 | 0.11 → 0.1 |  |
| scan_keti_bizreg_bank.pdf | strong | PASS | 29.4 | 29.4 | 0.988 | 0.9879 | 2/2 | 2/2 | 292 | 396 | 0.11 → 0.08 |  |
| scan_keti_bizreg_bank.pdf | raster | PASS | 0 (kept) | 0 (kept) | 1 | 1 | 2/2 | 0/0 | 784 ⚠ | 186 | 0.11 → 0.11 |  |
| scan_us_nkarmy_history.pdf | high | PASS | 2 | 2 | 1 | 1 | 7/7 | 0/397 | 7949 | 10866 | 17.58 → 17.23 |  |
| scan_us_nkarmy_history.pdf | recommended | PASS | 3.5 | 3.5 | 0.9983 | 0.9983 | 7/7 | 23/397 | 7503 | 10152 | 17.58 → 16.97 |  |
| scan_us_nkarmy_history.pdf | strong | PASS | 5.8 | 5.8 | 0.9651 | 0.9649 | 7/7 | 33/397 | 6699 | 8128 | 17.58 → 16.56 |  |
| scan_us_nkarmy_history.pdf | raster | PASS | 0 (kept) | 0 (kept) | 1 | 1 | 7/7 | 0/0 | 98400 ⚠ | 25896 | 17.58 → 17.58 |  |
| synth_resume_kr_photo.pdf | high | PASS | 94.3 | 94.3 | 0.9997 | 0.9997 | 1/1 | 1/1 | 681 | 1161 | 1.38 → 0.08 |  |
| synth_resume_kr_photo.pdf | recommended | PASS | 95.6 | 95.6 | 0.9997 | 0.9997 | 1/1 | 1/1 | 558 | 1212 | 1.38 → 0.06 |  |
| synth_resume_kr_photo.pdf | strong | PASS | 96.1 | 96.1 | 0.9992 | 0.9992 | 1/1 | 1/1 | 567 | 1189 | 1.38 → 0.05 |  |
| synth_resume_kr_photo.pdf | raster | PASS | 85.1 | 85.1 | 0.9183 | 0.9183 | 0/1 | 0/0 | 7833 ⚠ | 1527 | 1.38 → 0.21 |  |
| synth_scan_mfp_gongmun.pdf | high | PASS | 87.3 | 87.3 | 0.9532 | 0.9531 | 4/4 | 4/4 | 4857 | 7048 | 8.66 → 1.1 |  |
| synth_scan_mfp_gongmun.pdf | recommended | PASS | 95.6 | 95.6 | 0.945 | 0.9449 | 4/4 | 4/4 | 2747 | 4363 | 8.66 → 0.38 |  |
| synth_scan_mfp_gongmun.pdf | strong | PASS | 98 | 98 | 0.9274 | 0.9273 | 4/4 | 4/4 | 2004 | 2816 | 8.66 → 0.17 |  |
| synth_scan_mfp_gongmun.pdf | raster | PASS | 96.1 | 96.1 | 0.9243 | 0.9243 | 4/4 | 0/0 | 20707 ⚠ | 457 | 8.66 → 0.34 |  |
| synth_scan_phone_cv.pdf | high | PASS | 54.1 | 54.1 | 0.9769 | 0.972 | 2/2 | 2/2 | 1902 | 2893 | 2.22 → 1.02 |  |
| synth_scan_phone_cv.pdf | recommended | PASS | 85.1 | 85.1 | 0.9682 | 0.968 | 2/2 | 2/2 | 1056 | 1457 | 2.22 → 0.33 |  |
| synth_scan_phone_cv.pdf | strong | PASS | 94 | 94 | 0.9301 | 0.9314 | 2/2 | 2/2 | 749 | 1260 | 2.22 → 0.13 |  |
| synth_scan_phone_cv.pdf | raster | PASS | 86.7 | 86.7 | 0.8873 | 0.8873 | 2/2 | 0/0 | 4877 ⚠ | 272 | 2.22 → 0.3 |  |

122/122 pass.

Slower than 2 × spike (flag, not a failure):
- edge_damaged_badxref.pdf [raster] 2048 ms vs spike 624 ms
- en_iea_korea2025.pdf [raster] 21824 ms vs spike 3052 ms
- irs_f1040.pdf [raster] 998 ms vs spike 427 ms
- irs_fw9.pdf [high] 1078 ms vs spike 392 ms
- irs_fw9.pdf [recommended] 1109 ms vs spike 370 ms
- irs_fw9.pdf [strong] 1062 ms vs spike 384 ms
- irs_fw9.pdf [raster] 2757 ms vs spike 649 ms
- kr_gongmun_moleg.pdf [raster] 594 ms vs spike 271 ms
- kr_gongmun_opm.pdf [raster] 1427 ms vs spike 677 ms
- kr_kcc_briefing.pdf [raster] 9193 ms vs spike 1855 ms
- kr_kpmg_outlook.pdf [raster] 28043 ms vs spike 9910 ms
- kr_law_form.pdf [raster] 1781 ms vs spike 614 ms
- pdfjs_tracemonkey.pdf [raster] 6670 ms vs spike 1353 ms
- resume_racz_cc0.pdf [raster] 22205 ms vs spike 3069 ms
- scan_donga_1949.pdf [raster] 4742 ms vs spike 1169 ms
- scan_keti_bizreg_bank.pdf [raster] 784 ms vs spike 186 ms
- scan_us_nkarmy_history.pdf [raster] 98400 ms vs spike 25896 ms
- synth_resume_kr_photo.pdf [raster] 7833 ms vs spike 1527 ms
- synth_scan_mfp_gongmun.pdf [raster] 20707 ms vs spike 457 ms
- synth_scan_phone_cv.pdf [raster] 4877 ms vs spike 272 ms

## Appendix D: regress:photo, round 1b (regress-out/photo.md, Chromium 153)

### regress:photo — chromium 153.0.8010.12

Inputs: 28 images (tests\fixtures\photo and spikes\photo\corpus). Encodes: 170.

#### Aggregate rules

| Rule | Result | Measured |
|---|---|---|
| Fit: every encode ≤ target (0 overshoots, 0 errors) | PASS | 170/170 encodes produced, 0 overshoots |
| Mean utilisation ≥ 0.93 (품질 우선) | PASS | 0.969 |
| Mean utilisation ≥ 0.93 (빠른 모드) | PASS | 0.965 |
| p02 at 100 KB fits (naive cannot) | PASS | 품질 102399, 빠른 99991, naive no fit |
| p11 at 100 KB fits (naive cannot) | PASS | 품질 100993, 빠른 101458, naive no fit |
| Mean 500KB 품질 우선 SSIM ≥ 0.945 / PSNR ≥ 36.8 | PASS | 0.9516 / 37.09 (n 11) |
| Mean 500KB 빠른 모드 SSIM ≥ 0.942 / PSNR ≥ 35.7 | PASS | 0.9469 / 36.17 (n 11) |
| MozJPEG gain 500KB: mean PSNR(품질) − PSNR(빠른) ≥ +0.5 dB | PASS | 0.92 dB |
| Mean 200KB 품질 우선 SSIM ≥ 0.905 / PSNR ≥ 34.9 | PASS | 0.9110 / 35.36 (n 14) |
| Mean 200KB 빠른 모드 SSIM ≥ 0.906 / PSNR ≥ 34.2 | PASS | 0.9081 / 34.57 (n 14) |
| MozJPEG gain 200KB: mean PSNR(품질) − PSNR(빠른) ≥ +0.5 dB | PASS | 0.80 dB |
| Mean 100KB 품질 우선 SSIM ≥ 0.865 / PSNR ≥ 31.7 | PASS | 0.8729 / 32.26 (n 15) |
| Mean 100KB 빠른 모드 SSIM ≥ 0.868 / PSNR ≥ 31.4 | PASS | 0.8713 / 31.78 (n 15) |
| MozJPEG gain 100KB: mean PSNR(품질) − PSNR(빠른) ≥ +0.45 dB | PASS | 0.48 dB |
| Mean 50% 품질 우선 SSIM ≥ 0.968 / PSNR ≥ 39.3 | PASS | 0.9710 / 39.88 (n 15) |
| Mean 50% 빠른 모드 SSIM ≥ 0.966 / PSNR ≥ 38.3 | PASS | 0.9719 / 38.80 (n 15) |
| MozJPEG gain 50%: mean PSNR(품질) − PSNR(빠른) ≥ +0.5 dB | PASS | 1.08 dB |
| Floor: final q ≥ 50 (MozJPEG) / ≥ 0.50 (canvas) when the long edge is over 64 | PASS | all |
| Blockiness cap: BI(품질) ≤ 2.5 on every corpus photo | FAIL | max 2.621 |
| Blockiness: BI(품질) < BI(naive) wherever naive q < 0.30 | PASS | 32/32 pairs |
| p03 at 100 KB: BI(품질) < BI(naive) | PASS | 품질 1.669, naive 12.028 (naive q 0.02) |
| HEIC h01 gives heic, never corrupt | PASS | heic |
| s01_exif6 output is portrait | PASS | 2457×3276 |
| s02_p3 at 50 %: PSNR(output, decoded original) ≥ 31 dB | PASS | 31.58 dB |

#### Means per target (spike-baseline images; "all" includes every input)

| Target | n | 품질 우선 SSIM / PSNR | 빠른 모드 SSIM / PSNR | Gain dB | all n | all 품질 SSIM / PSNR | spike hybrid SSIM |
|---|---|---|---|---|---|---|---|
| 500KB | 11 | 0.9516 / 37.09 | 0.9469 / 36.17 | 0.92 | 15 | 0.9566 / 37.78 | 0.9519 |
| 200KB | 14 | 0.9110 / 35.36 | 0.9081 / 34.57 | 0.80 | 20 | 0.9175 / 35.57 | 0.9097 |
| 100KB | 15 | 0.8729 / 32.26 | 0.8713 / 31.78 | 0.48 | 22 | 0.8799 / 33.26 | 0.8731 |
| 50% | 15 | 0.9710 / 39.88 | 0.9719 / 38.80 | 1.08 | 28 | 0.9524 / 39.47 | 0.9707 |

#### Timing (median ms per image, worker wall time incl. wasm compile)

| Target | 품질 우선 | 빠른 모드 | spike hybrid-mozjpeg | Flag (> 2×) |
|---|---|---|---|---|
| 500KB | 4348 | 586 | 6098 |  |
| 200KB | 2350 | 407 | 4611 |  |
| 100KB | 1536 | 297 | 3522 |  |
| 50% | 2540 | 262 | 6421 |  |

#### Blockiness distribution (BI; ≈ 1 = no block edges)

- 품질 우선: min 0.996 · median 1.558 · max 391.585
- 빠른 모드: min 1.013 · median 1.450 · max 116.455
- naive: min 1.005 · median 1.759 · max 116.455
- naive where q < 0.30: min 1.262 · median 2.481 · max 12.028; 품질 우선 on those pairs: min 1.095 · median 1.642 · max 1.968

#### Rows

| Image | Target | Result | 품질 SSIM / PSNR | q · enc · size | 빠른 SSIM / PSNR | q | util 품질 / 빠른 | BI 품질 / 빠른 / naive (q) | spike fit-moz | spike hybrid-moz | spike canvas-q40 | Problems |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| alpha.png | 50% | PASS | 0.4886 / 3.01 | 92 · mozjpeg · 800×600 | 0.4888 / 3.01 | 0.92 | 0.907 / 0.828 | 20.568 / 15.645 / 18.052 (0.93) | – | – | – |  |
| cmyk.jpg | 50% | PASS | 1 / 58.64 | 95 · mozjpeg · 400×300 | 0.9998 / 34.41 | 0.92 | 0.783 / 0.7 | 12.675 / 11.052 / 12.118 (0.98) | – | – | – |  |
| exif6_gps.jpg | 50% | PASS | 0.9866 / 44.43 | 70 · mozjpeg · 900×1200 | 0.9859 / 43.31 | 0.55 | 0.917 / 0.991 | 12.329 / 8.239 / 8.239 (0.55) | – | – | – |  |
| opaque_rgba.png | 50% | PASS | 0.8848 / 25.29 | 73 · mozjpeg · 165×293 | 0.8849 / 24.78 | 0.55 | 0.992 / 0.995 | 0.996 / 1.044 / no fit (–) | – | – | – |  |
| p3_patches.jpg | 50% | PASS | 1 / 42.17 | 83 · mozjpeg · 600×400 | 1 / 39.77 | 0.82 | 1 / 1 | 391.585 / 116.455 / 116.455 (0.82) | – | – | – |  |
| portrait_pd.jpg | 200KB | PASS | 0.951 / 37.42 | 79 · mozjpeg · 1400×1750 | 0.9502 / 36.74 | 0.67 | 0.988 / 0.984 | 1.529 / 1.458 / 1.458 (0.67) | – | – | – |  |
| portrait_pd.jpg | 100KB | PASS | 0.9108 / 34.29 | 51 · mozjpeg · 1400×1750 | 0.9045 / 33.33 | 0.57 | 0.982 / 0.994 | 1.985 / 1.578 / 1.893 (0.32) | – | – | – |  |
| portrait_pd.jpg | 50% | PASS | 0.9426 / 36.85 | 76 · mozjpeg · 1400×1750 | 0.9433 / 36.29 | 0.62 | 0.972 / 0.981 | 1.656 / 1.517 / 1.517 (0.62) | – | – | – |  |
| scene_cc0.jpg | 200KB | PASS | 0.9606 / 38.66 | 77 · mozjpeg · 1600×1012 | 0.9564 / 37.4 | 0.68 | 0.981 / 0.995 | 1.465 / 1.402 / 1.402 (0.68) | – | – | – |  |
| scene_cc0.jpg | 100KB | PASS | 0.8937 / 35.16 | 57 · mozjpeg · 1600×1012 | 0.8827 / 34.57 | 0.55 | 0.983 / 0.989 | 2.028 / 1.718 / 1.909 (0.4) | – | – | – |  |
| scene_cc0.jpg | 50% | PASS | 0.9153 / 36.37 | 73 · mozjpeg · 1600×1012 | 0.9128 / 35.54 | 0.55 | 0.988 / 0.968 | 1.847 / 1.741 / 1.741 (0.55) | – | – | – |  |
| g01 | 200KB | PASS | 0.9807 / 35.39 | 71 · mozjpeg · 1800×1200 | 0.9783 / 34.23 | 0.59 | 0.991 / 0.998 | 1.328 / 1.235 / 1.235 (0.59) | 0.9833 / 35.87 | 0.9833 / 35.87 | 0.9783 / 34.23 |  |
| g01 | 100KB | PASS | 0.9414 / 30.48 | 64 · mozjpeg · 1333×889 | 0.941 / 30.04 | 0.52 | 0.991 / 0.991 | 1.401 / 1.296 / 1.643 (0.23) | 0.9396 / 30.29 | 0.9274 / 28.98 | 0.9339 / 30.17 |  |
| g01 | 50% | PASS | 0.9666 / 34.43 | 66 · mozjpeg · 1800×1200 | 0.9628 / 33.43 | 0.51 | 0.996 / 0.973 | 1.378 / 1.336 / 1.336 (0.51) | 0.9755 / 34.78 | 0.9603 / 31.84 | 0.9628 / 33.43 |  |
| g02 | 500KB | PASS | 0.9206 / 29.36 | 71 · mozjpeg · 2048×1536 | 0.9187 / 28.89 | 0.58 | 0.999 / 0.996 | 1.23 / 1.133 / 1.133 (0.58) | 0.9244 / 29.63 | 0.9244 / 29.63 | 0.9187 / 28.89 |  |
| g02 | 200KB | PASS | 0.8176 / 24.48 | 64 · mozjpeg · 1341×1006 | 0.8145 / 24.25 | 0.53 | 0.988 / 0.992 | 1.27 / 1.166 / 1.544 (0.16) | 0.8171 / 24.48 | 0.8427 / 25.38 | 0.8234 / 24.51 |  |
| g02 | 100KB | PASS | 0.7285 / 22.5 | 60 · mozjpeg · 948×711 | 0.723 / 22.29 | 0.51 | 0.979 / 0.989 | 1.282 / 1.166 / 2.269 (0.06) | 0.7223 / 22.41 | 0.75 / 22.91 | 0.7321 / 22.45 |  |
| g02 | 50% | PASS | 0.9351 / 31.38 | 81 · mozjpeg · 2048×1536 | 0.9464 / 30.64 | 0.75 | 0.994 / 0.996 | 1.193 / 1.087 / 1.087 (0.75) | 0.9351 / 31.38 | 0.9346 / 31.29 | 0.9464 / 30.64 |  |
| g03 | 500KB | PASS | 0.97 / 41.11 | 71 · mozjpeg · 3648×2048 | 0.9683 / 40.13 | 0.55 | 0.998 / 0.978 | 1.921 / 1.842 / 1.842 (0.55) | 0.97 / 41.13 | 0.97 / 41.13 | 0.9683 / 40.13 |  |
| g03 | 200KB | PASS | 0.9353 / 37.73 | 66 · mozjpeg · 2374×1333 | 0.9335 / 37.08 | 0.51 | 0.996 / 0.983 | 1.968 / 1.868 / 3.148 (0.21) | 0.9331 / 37.57 | 0.9284 / 37.33 | 0.9315 / 36.86 |  |
| g03 | 100KB | PASS | 0.9009 / 35.5 | 69 · mozjpeg · 1511×848 | 0.8996 / 34.99 | 0.57 | 0.999 / 0.998 | 1.759 / 1.652 / 5.022 (0.1) | 0.8987 / 35.4 | 0.8963 / 35.28 | 0.9006 / 34.95 |  |
| g03 | 50% | PASS | 0.984 / 45.07 | 84 · mozjpeg · 3648×2048 | 0.9858 / 43.48 | 0.8 | 0.968 / 0.974 | 1.557 / 1.397 / 1.397 (0.8) | 0.9853 / 45.38 | 0.9853 / 45.38 | 0.9858 / 43.48 |  |
| g04 | 500KB | PASS | 0.9065 / 35.49 | 56 · mozjpeg · 3400×2150 | 0.8959 / 34.83 | 0.6 | 0.984 / 0.976 | 1.975 / 1.605 / 1.891 (0.35) | 0.8957 / 35.29 | 0.9016 / 35.3 | 0.8994 / 34.95 |  |
| g04 | 200KB | PASS | 0.8133 / 33.09 | 73 · mozjpeg · 1785×1129 | 0.8122 / 32.83 | 0.64 | 0.944 / 0.973 | 1.738 / 1.615 / 3.058 (0.16) | 0.8142 / 33.13 | 0.8112 / 33.11 | 0.8192 / 32.87 |  |
| g04 | 100KB | PASS | 0.7558 / 31.97 | 75 · mozjpeg · 1262×798 | 0.7543 / 31.68 | 0.65 | 0.993 / 0.993 | 1.682 / 1.577 / 5.665 (0.09) | 0.752 / 31.89 | 0.7602 / 31.96 | 0.7588 / 31.72 |  |
| g04 | 50% | PASS | 0.9704 / 40.11 | 84 · mozjpeg · 3400×2150 | 0.9711 / 39.06 | 0.82 | 0.975 / 0.927 | 1.382 / 1.395 / 1.395 (0.82) | 0.9721 / 40.34 | 0.9704 / 40.11 | 0.9711 / 39.06 |  |
| p01 | 500KB | PASS | 0.9617 / 39.03 | 67 · mozjpeg · 2556×3195 | 0.9591 / 38.12 | 0.56 | 0.977 / 0.982 | 1.65 / 1.582 / 1.868 (0.3) | 0.9602 / 39.07 | 0.9636 / 39.25 | 0.9594 / 38.16 |  |
| p01 | 200KB | PASS | 0.9109 / 35.54 | 70 · mozjpeg · 1617×2021 | 0.9086 / 35.09 | 0.6 | 0.991 / 0.996 | 1.705 / 1.59 / 3.084 (0.11) | 0.9065 / 35.43 | 0.9116 / 35.68 | 0.9079 / 34.98 |  |
| p01 | 100KB | PASS | 0.8717 / 33.74 | 70 · mozjpeg · 1143×1429 | 0.8708 / 33.2 | 0.57 | 0.974 / 0.982 | 1.762 / 1.648 / 8.733 (0.04) | 0.871 / 33.67 | 0.871 / 33.71 | 0.8723 / 33.28 |  |
| p01 | 50% | PASS | 0.987 / 44.97 | 82 · mozjpeg · 3200×4000 | 0.987 / 43.28 | 0.76 | 0.941 / 0.948 | 1.456 / 1.355 / 1.355 (0.76) | 0.9877 / 45.39 | 0.9877 / 45.39 | 0.987 / 43.28 |  |
| p02 | 500KB | PASS | 0.9575 / 37.82 | 68 · mozjpeg · 2447×3057 | 0.9537 / 37.32 | 0.57 | 0.99 / 0.985 | 1.454 / 1.392 / 1.759 (0.23) | 0.9575 / 38.25 | 0.958 / 38.37 | 0.9548 / 37.46 |  |
| p02 | 200KB | PASS | 0.9063 / 34.88 | 73 · mozjpeg · 1548×1933 | 0.8953 / 34.11 | 0.65 | 0.991 / 0.985 | 1.421 / 1.332 / 2.742 (0.08) | 0.8923 / 34.2 | 0.8957 / 34.48 | 0.898 / 34.17 |  |
| p02 | 100KB | PASS | 0.8399 / 32.05 | 78 · mozjpeg · 1094×1367 | 0.8393 / 31.81 | 0.67 | 1 / 0.976 | 1.536 / 1.364 / no fit (–) | 0.8365 / 31.84 | 0.8427 / 32.3 | 0.8428 / 31.99 |  |
| p02 | 50% | PASS | 0.986 / 44.86 | 80 · mozjpeg · 3350×4185 | 0.9871 / 44.27 | 0.76 | 0.976 / 0.99 | 1.363 / 1.349 / 1.349 (0.76) | 0.9867 / 45.08 | 0.986 / 44.86 | 0.9871 / 44.27 |  |
| p03 | 500KB | PASS | 0.9667 / 38.72 | 67 · mozjpeg · 2532×3165 | 0.9645 / 38.02 | 0.55 | 0.993 / 0.991 | 1.64 / 1.555 / 1.971 (0.25) | 0.9654 / 38.58 | 0.9571 / 38.23 | 0.9642 / 38.06 |  |
| p03 | 200KB | PASS | 0.9205 / 35.34 | 69 · mozjpeg · 1601×2002 | 0.9175 / 34.93 | 0.58 | 0.989 / 0.99 | 1.664 / 1.565 / 3.419 (0.09) | 0.9178 / 35.26 | 0.9187 / 35.39 | 0.9182 / 34.91 |  |
| p03 | 100KB | PASS | 0.8836 / 33.28 | 70 · mozjpeg · 1132×1415 | 0.8807 / 32.9 | 0.58 | 0.986 / 0.999 | 1.669 / 1.569 / 12.028 (0.02) | 0.8817 / 33.22 | 0.8668 / 32.41 | 0.8822 / 32.99 |  |
| p03 | 50% | PASS | 0.9938 / 47.01 | 89 · mozjpeg · 3360×4200 | 0.9946 / 45.25 | 0.87 | 0.909 / 0.983 | 1.279 / 1.165 / 1.165 (0.87) | 0.9938 / 47.01 | 0.9938 / 47.01 | 0.9946 / 45.25 |  |
| p04 | 500KB | PASS | 0.9705 / 33.46 | 66 · mozjpeg · 2082×2603 | 0.9686 / 33.31 | 0.53 | 0.99 / 0.994 | 1.239 / 1.169 / 1.605 (0.12) | – | – | – |  |
| p04 | 200KB | PASS | 0.8969 / 28.4 | 68 · mozjpeg · 1317×1646 | 0.8826 / 27.55 | 0.55 | 0.999 / 0.997 | 1.307 / 1.207 / 2.613 (0.03) | – | – | – |  |
| p04 | 100KB | PASS | 0.752 / 24.49 | 71 · mozjpeg · 931×1164 | 0.762 / 24.46 | 0.57 | 0.981 / 0.999 | 1.465 / 1.261 / no fit (–) | – | – | – |  |
| p04 | 50% | PASS | 0.9954 / 44.99 | 79 · mozjpeg · 3360×4200 | 0.9948 / 43.57 | 0.68 | 0.991 / 0.982 | 1.141 / 1.102 / 1.102 (0.68) | – | – | – |  |
| p05 | 500KB | PASS | 0.9714 / 37.9 | 76 · mozjpeg · 2080×2600 | 0.9702 / 37.12 | 0.65 | 0.997 / 0.997 | 1.438 / 1.296 / 1.296 (0.65) | 0.9715 / 37.93 | 0.9715 / 37.93 | 0.9702 / 37.12 |  |
| p05 | 200KB | PASS | 0.9162 / 33.57 | 67 · mozjpeg · 1451×1813 | 0.9123 / 33.13 | 0.55 | 0.995 / 0.996 | 1.613 / 1.477 / 2.069 (0.21) | 0.9111 / 33.37 | 0.8847 / 32.43 | 0.9135 / 33.15 |  |
| p05 | 100KB | PASS | 0.8522 / 31.31 | 67 · mozjpeg · 1026×1282 | 0.8504 / 31.01 | 0.55 | 1 / 0.996 | 1.644 / 1.492 / 3.098 (0.1) | 0.8468 / 31.15 | 0.8504 / 31.24 | 0.8524 / 31.07 |  |
| p05 | 50% | PASS | 0.9912 / 45.04 | 93 · mozjpeg · 2080×2600 | 0.9921 / 41.76 | 0.92 | 0.894 / 0.663 | 1.129 / 1.067 / 1.037 (0.95) | 0.9902 / 44.34 | 0.9912 / 45.03 | 0.9921 / 41.76 |  |
| p06 | 500KB | PASS | 0.955 / 38.39 | 87 · mozjpeg · 1638×2048 | 0.9519 / 37.58 | 0.83 | 0.966 / 0.969 | 1.259 / 1.218 / 1.218 (0.83) | – | – | – |  |
| p06 | 200KB | PASS | 0.8988 / 34.56 | 66 · mozjpeg · 1638×2048 | 0.8894 / 33.1 | 0.65 | 0.988 / 0.986 | 1.587 / 1.417 / 1.527 (0.48) | – | – | – |  |
| p06 | 100KB | PASS | 0.856 / 31.56 | 67 · mozjpeg · 1117×1396 | 0.8564 / 31.26 | 0.53 | 0.974 / 0.993 | 1.558 / 1.45 / 1.908 (0.2) | – | – | – |  |
| p06 | 50% | PASS | 0.9875 / 43.12 | 92 · mozjpeg · 1638×2048 | 0.999 / 49.16 | 0.92 | 0.943 / 0.873 | 1.108 / 1.072 / 1.109 (0.94) | – | – | – |  |
| p07 | 500KB | FAIL | 0.9654 / 39.98 | 67 · mozjpeg · 2457×3276 | 0.9479 / 38.13 | 0.73 | 0.998 / 0.993 | 1.312 / 1.421 / 1.286 (0.48) | 0.9694 / 40.71 | 0.9694 / 40.71 | 0.9435 / 36.93 | 품질 PSNR 39.98 < 40.71 − 0.6 |
| p07 | 200KB | PASS | 0.9093 / 36.09 | 79 · mozjpeg · 1431×1908 | 0.9067 / 35.47 | 0.72 | 0.929 / 0.973 | 1.647 / 1.483 / 2.239 (0.24) | 0.9106 / 36.02 | 0.9017 / 35.76 | 0.9114 / 35.54 |  |
| p07 | 100KB | PASS | 0.8896 / 34.6 | 79 · mozjpeg · 1012×1349 | 0.8886 / 34.01 | 0.73 | 0.969 / 0.994 | 1.556 / 1.463 / 3.811 (0.12) | 0.8887 / 34.55 | 0.8897 / 34.63 | 0.8896 / 34.16 |  |
| p07 | 50% | PASS | 0.9382 / 37.88 | 60 · mozjpeg · 2457×3276 | 0.9331 / 37.04 | 0.71 | 0.956 / 0.997 | 1.616 / 1.433 / 1.833 (0.45) | 0.9427 / 38.1 | 0.9427 / 38.1 | 0.929 / 36.6 |  |
| p08 | 500KB | PASS | 0.9891 / 46.29 | 79 · mozjpeg · 2560×3413 | 0.9864 / 43.15 | 0.69 | 0.902 / 0.967 | 1.523 / 1.344 / 1.344 (0.69) | – | – | – |  |
| p08 | 200KB | PASS | 0.9712 / 40.83 | 51 · mozjpeg · 2560×3413 | 0.9723 / 39.99 | 0.56 | 0.991 / 0.99 | 2.488 / 1.787 / 2.265 (0.32) | – | – | – |  |
| p08 | 100KB | PASS | 0.9609 / 38.54 | 64 · mozjpeg · 1444×1925 | 0.9605 / 37.79 | 0.51 | 0.982 / 0.986 | 1.872 / 1.78 / 3.689 (0.12) | – | – | – |  |
| p08 | 50% | PASS | 0.9828 / 44.07 | 71 · mozjpeg · 2560×3413 | 0.9829 / 42.21 | 0.64 | 0.986 / 0.981 | 1.88 / 1.874 / 1.874 (0.64) | – | – | – |  |
| p09 | 200KB | PASS | 0.9931 / 46.03 | 82 · mozjpeg · 1572×2097 | 0.995 / 44.81 | 0.76 | 0.956 / 0.999 | 1.388 / 1.165 / 1.165 (0.76) | 0.9943 / 46.81 | 0.9943 / 46.81 | 0.995 / 44.81 |  |
| p09 | 100KB | PASS | 0.9842 / 41.26 | 62 · mozjpeg · 1572×2097 | 0.9842 / 39.92 | 0.62 | 0.996 / 0.987 | 1.781 / 1.519 / 1.585 (0.43) | 0.9855 / 41.93 | 0.9807 / 39.16 | 0.9833 / 39.74 |  |
| p09 | 50% | PASS | 0.9857 / 41.98 | 67 · mozjpeg · 1572×2097 | 0.9857 / 40.67 | 0.51 | 0.997 / 0.993 | 1.707 / 1.549 / 1.549 (0.51) | 0.9868 / 42.73 | 0.9843 / 40.8 | 0.9857 / 40.67 |  |
| p10 | 500KB | PASS | 0.9665 / 40.61 | 68 · mozjpeg · 2184×3276 | 0.9525 / 37.5 | 0.51 | 0.958 / 0.938 | 1.305 / 1.271 / 1.271 (0.51) | – | – | – |  |
| p10 | 200KB | PASS | 0.9177 / 36.48 | 75 · mozjpeg · 1417×2126 | 0.917 / 35.72 | 0.64 | 0.999 / 0.992 | 1.699 / 1.554 / 2.331 (0.25) | – | – | – |  |
| p10 | 100KB | PASS | 0.8947 / 34.71 | 73 · mozjpeg · 1002×1503 | 0.8943 / 34 | 0.62 | 0.977 / 0.976 | 1.656 / 1.544 / 3.792 (0.12) | – | – | – |  |
| p10 | 50% | PASS | 0.9451 / 38.57 | 62 · mozjpeg · 2184×3276 | 0.9413 / 37.38 | 0.64 | 0.998 / 0.978 | 1.593 / 1.598 / 1.837 (0.47) | – | – | – |  |
| p11 | 500KB | PASS | 0.965 / 38.37 | 67 · mozjpeg · 2666×3333 | 0.9637 / 37.43 | 0.56 | 0.967 / 0.987 | 1.809 / 1.632 / 2.257 (0.22) | 0.963 / 38.28 | 0.9624 / 38.96 | 0.9636 / 37.44 |  |
| p11 | 200KB | PASS | 0.9341 / 35.67 | 67 · mozjpeg · 1686×2108 | 0.9352 / 34.93 | 0.55 | 0.977 / 0.985 | 1.9 / 1.711 / 4.794 (0.08) | 0.9333 / 35.59 | 0.9322 / 35.44 | 0.9356 / 34.96 |  |
| p11 | 100KB | PASS | 0.9155 / 33.55 | 69 · mozjpeg · 1073×1341 | 0.915 / 32.84 | 0.59 | 0.986 / 0.991 | 1.684 / 1.53 / no fit (–) | 0.9127 / 33.34 | 0.9134 / 33.21 | 0.915 / 32.89 |  |
| p11 | 50% | PASS | 0.9901 / 43.55 | 73 · mozjpeg · 3840×4800 | 0.9905 / 41.79 | 0.65 | 0.994 / 0.994 | 1.597 / 1.505 / 1.505 (0.65) | 0.9901 / 43.54 | 0.9901 / 43.54 | 0.9905 / 41.79 |  |
| p12 | 200KB | PASS | 0.987 / 46.04 | 76 · mozjpeg · 1600×1750 | 0.9814 / 42.76 | 0.61 | 0.999 / 0.99 | 1.668 / 1.559 / 1.559 (0.61) | 0.9869 / 46.02 | 0.984 / 45.34 | 0.9814 / 42.76 |  |
| p12 | 100KB | FAIL | 0.9396 / 39.6 | 60 · mozjpeg · 1600×1750 | 0.9417 / 39.05 | 0.65 | 0.993 / 0.989 | 2.621 / 1.784 / 2.723 (0.44) | 0.9384 / 39.25 | 0.9382 / 39.28 | 0.9377 / 38.71 | 품질 BI 2.621 > cap 2.5 |
| p12 | 50% | PASS | 0.9461 / 40.34 | 65 · mozjpeg · 1600×1750 | 0.9496 / 39.7 | 0.66 | 0.964 / 0.987 | 2.376 / 1.793 / 2.388 (0.47) | 0.9461 / 40.33 | 0.9427 / 39.9 | 0.9402 / 38.79 |  |
| p13 | 50% | PASS | 0.978 / 40.54 | 73 · mozjpeg · 380×556 | 0.9767 / 39.14 | 0.6 | 0.964 / 0.999 | 1.539 / 1.427 / 1.427 (0.6) | – | – | – |  |
| p14 | 100KB | PASS | 0.9951 / 48.96 | 95 · mozjpeg · 576×584 | 0.9941 / 46.41 | 0.92 | 0.555 / 0.402 | 1.161 / 1.148 / 1.005 (0.98) | – | – | – |  |
| p14 | 50% | PASS | 0.9951 / 48.96 | 95 · mozjpeg · 576×584 | 0.9941 / 46.41 | 0.92 | 0.9 / 0.652 | 1.161 / 1.148 / 1.057 (0.96) | – | – | – |  |
| s01_exif6 | 500KB | PASS | 0.962 / 39.61 | 67 · mozjpeg · 2457×3276 | 0.9563 / 37.86 | 0.51 | 0.957 / 0.996 | 1.328 / 1.154 / 1.154 (0.51) | 0.9682 / 40.53 | 0.9682 / 40.53 | 0.9563 / 37.86 |  |
| s01_exif6 | 200KB | PASS | 0.9111 / 36.32 | 76 · mozjpeg · 1528×2037 | 0.9083 / 35.6 | 0.67 | 0.922 / 0.977 | 1.723 / 1.562 / 2.348 (0.24) | 0.9124 / 36.23 | 0.9028 / 35.86 | 0.9135 / 35.77 |  |
| s01_exif6 | 100KB | PASS | 0.8915 / 34.86 | 76 · mozjpeg · 1080×1440 | 0.8909 / 34.21 | 0.68 | 0.954 / 0.986 | 1.635 / 1.535 / 3.921 (0.12) | 0.8911 / 34.77 | 0.891 / 34.77 | 0.8913 / 34.33 |  |
| s01_exif6 | 50% | PASS | 0.9902 / 44.81 | 79 · mozjpeg · 2457×3276 | 0.9944 / 45.91 | 0.72 | 0.969 / 0.995 | 1.154 / 1.083 / 1.083 (0.72) | 0.9902 / 44.81 | 0.9888 / 44.37 | 0.9944 / 45.91 |  |
| s02_p3 | 500KB | PASS | 0.9206 / 30.59 | 71 · mozjpeg · 2048×1536 | 0.9179 / 29.99 | 0.57 | 0.993 / 0.988 | 1.235 / 1.122 / 1.122 (0.57) | 0.9243 / 30.94 | 0.9243 / 30.94 | 0.9179 / 29.99 |  |
| s02_p3 | 200KB | PASS | 0.818 / 24.93 | 63 · mozjpeg · 1359×1019 | 0.8148 / 24.72 | 0.51 | 0.985 / 0.981 | 1.284 / 1.178 / 1.546 (0.16) | 0.8176 / 24.92 | 0.845 / 26 | 0.8229 / 24.97 |  |
| s02_p3 | 100KB | PASS | 0.7198 / 22.61 | 70 · mozjpeg · 865×648 | 0.7131 / 22.39 | 0.63 | 0.989 / 0.999 | 1.231 / 1.126 / 2.279 (0.06) | 0.7132 / 22.48 | 0.7491 / 23.2 | 0.7318 / 22.75 |  |
| s02_p3 | 50% | PASS | 0.9303 / 31.58 | 76 · mozjpeg · 2048×1536 | 0.9309 / 30.88 | 0.65 | 0.975 / 0.987 | 1.205 / 1.158 / 1.158 (0.65) | 0.9338 / 31.96 | 0.9338 / 31.96 | 0.9309 / 30.88 |  |
| s03_screenshot | 100KB | PASS | 0.9795 / 26.62 | 64 · mozjpeg · 764×1652 | 0.9772 / 26.35 | 0.52 | 0.994 / 0.992 | 1.095 / 1.013 / 1.262 (0.14) | 0.9831 / 27.1 | 0.9702 / 25.1 | 0.9788 / 26.75 |  |
| s03_screenshot | 50% | PASS | 0.9703 / 25.15 | 69 · mozjpeg · 626×1354 | 0.967 / 24.87 | 0.61 | 0.996 / 1 | 1.151 / 1.066 / 1.334 (0.1) | 0.9722 / 25.35 | 0.9689 / 25.01 | 0.971 / 25.78 |  |

83/85 rows pass; 23/24 aggregate rules pass.

## Appendix E: regress:photo, round 1c (regress-out/photo.md, Chromium 153)

### regress:photo — chromium 153.0.8010.12

Inputs: 28 images (tests\fixtures\photo and spikes\photo\corpus). Encodes: 170.

#### Aggregate rules

| Rule | Result | Measured |
|---|---|---|
| Fit: every encode ≤ target (0 overshoots, 0 errors) | PASS | 170/170 encodes produced, 0 overshoots |
| Mean utilisation ≥ 0.93 (품질 우선) | PASS | 0.968 |
| Mean utilisation ≥ 0.93 (빠른 모드) | PASS | 0.965 |
| p02 at 100 KB fits (naive cannot) | PASS | 품질 102399, 빠른 99991, naive no fit |
| p11 at 100 KB fits (naive cannot) | PASS | 품질 100993, 빠른 101458, naive no fit |
| Mean 500KB 품질 우선 SSIM ≥ 0.945 / PSNR ≥ 36.8 | PASS | 0.9516 / 37.09 (n 11) |
| Mean 500KB 빠른 모드 SSIM ≥ 0.942 / PSNR ≥ 35.7 | PASS | 0.9469 / 36.17 (n 11) |
| MozJPEG gain 500KB: mean PSNR(품질) − PSNR(빠른) ≥ +0.5 dB | PASS | 0.92 dB |
| Mean 200KB 품질 우선 SSIM ≥ 0.905 / PSNR ≥ 34.9 | PASS | 0.9110 / 35.36 (n 14) |
| Mean 200KB 빠른 모드 SSIM ≥ 0.906 / PSNR ≥ 34.2 | PASS | 0.9081 / 34.57 (n 14) |
| MozJPEG gain 200KB: mean PSNR(품질) − PSNR(빠른) ≥ +0.5 dB | PASS | 0.80 dB |
| Mean 100KB 품질 우선 SSIM ≥ 0.865 / PSNR ≥ 31.7 | PASS | 0.8731 / 32.26 (n 15) |
| Mean 100KB 빠른 모드 SSIM ≥ 0.868 / PSNR ≥ 31.4 | PASS | 0.8713 / 31.78 (n 15) |
| MozJPEG gain 100KB: mean PSNR(품질) − PSNR(빠른) ≥ +0.45 dB | PASS | 0.48 dB |
| Mean 50% 품질 우선 SSIM ≥ 0.968 / PSNR ≥ 39.3 | PASS | 0.9710 / 39.88 (n 15) |
| Mean 50% 빠른 모드 SSIM ≥ 0.966 / PSNR ≥ 38.3 | PASS | 0.9719 / 38.80 (n 15) |
| MozJPEG gain 50%: mean PSNR(품질) − PSNR(빠른) ≥ +0.5 dB | PASS | 1.08 dB |
| Floor: final q ≥ 50 (MozJPEG) / ≥ 0.50 (canvas) when the long edge is over 64 | PASS | all |
| Blockiness cap: BI(품질) ≤ 2.5 on every corpus photo | PASS | max 2.488 |
| Blockiness: BI(품질) < BI(naive) wherever naive q < 0.30 | PASS | 32/32 pairs |
| p03 at 100 KB: BI(품질) < BI(naive) | PASS | 품질 1.669, naive 12.028 (naive q 0.02) |
| HEIC h01 gives heic, never corrupt | PASS | heic |
| s01_exif6 output is portrait | PASS | 2457×3276 |
| s02_p3 at 50 %: PSNR(output, decoded original) ≥ 31 dB | PASS | 31.58 dB |

#### Means per target (spike-baseline images; "all" includes every input)

| Target | n | 품질 우선 SSIM / PSNR | 빠른 모드 SSIM / PSNR | Gain dB | all n | all 품질 SSIM / PSNR | spike hybrid SSIM |
|---|---|---|---|---|---|---|---|
| 500KB | 11 | 0.9516 / 37.09 | 0.9469 / 36.17 | 0.92 | 15 | 0.9566 / 37.78 | 0.9519 |
| 200KB | 14 | 0.9110 / 35.36 | 0.9081 / 34.57 | 0.80 | 20 | 0.9175 / 35.57 | 0.9097 |
| 100KB | 15 | 0.8731 / 32.26 | 0.8713 / 31.78 | 0.48 | 22 | 0.8800 / 33.26 | 0.8731 |
| 50% | 15 | 0.9710 / 39.88 | 0.9719 / 38.80 | 1.08 | 28 | 0.9524 / 39.47 | 0.9707 |

#### Timing (median ms per image, worker wall time incl. wasm compile)

| Target | 품질 우선 | 빠른 모드 | spike hybrid-mozjpeg | Flag (> 2×) |
|---|---|---|---|---|
| 500KB | 4292 | 643 | 6098 |  |
| 200KB | 2688 | 435 | 4611 |  |
| 100KB | 2137 | 317 | 3522 |  |
| 50% | 3221 | 273 | 6421 |  |

#### Blockiness distribution (BI; ≈ 1 = no block edges)

- 품질 우선: min 0.996 · median 1.558 · max 391.585
- 빠른 모드: min 1.013 · median 1.450 · max 116.455
- naive: min 1.005 · median 1.759 · max 116.455
- naive where q < 0.30: min 1.262 · median 2.481 · max 12.028; 품질 우선 on those pairs: min 1.095 · median 1.642 · max 1.968

#### Rows

| Image | Target | Result | 품질 SSIM / PSNR | q · enc · size | 빠른 SSIM / PSNR | q | util 품질 / 빠른 | BI 품질 / 빠른 / naive (q) | spike fit-moz | spike hybrid-moz | spike canvas-q40 | Problems |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| alpha.png | 50% | PASS | 0.4886 / 3.01 | 92 · mozjpeg · 800×600 | 0.4888 / 3.01 | 0.92 | 0.907 / 0.828 | 20.568 / 15.645 / 18.052 (0.93) | – | – | – |  |
| cmyk.jpg | 50% | PASS | 1 / 58.64 | 95 · mozjpeg · 400×300 | 0.9998 / 34.41 | 0.92 | 0.783 / 0.7 | 12.675 / 11.052 / 12.118 (0.98) | – | – | – |  |
| exif6_gps.jpg | 50% | PASS | 0.9866 / 44.43 | 70 · mozjpeg · 900×1200 | 0.9859 / 43.31 | 0.55 | 0.917 / 0.991 | 12.329 / 8.239 / 8.239 (0.55) | – | – | – |  |
| opaque_rgba.png | 50% | PASS | 0.8848 / 25.29 | 73 · mozjpeg · 165×293 | 0.8849 / 24.78 | 0.55 | 0.992 / 0.995 | 0.996 / 1.044 / no fit (–) | – | – | – |  |
| p3_patches.jpg | 50% | PASS | 1 / 42.17 | 83 · mozjpeg · 600×400 | 1 / 39.77 | 0.82 | 1 / 1 | 391.585 / 116.455 / 116.455 (0.82) | – | – | – |  |
| portrait_pd.jpg | 200KB | PASS | 0.951 / 37.42 | 79 · mozjpeg · 1400×1750 | 0.9502 / 36.74 | 0.67 | 0.988 / 0.984 | 1.529 / 1.458 / 1.458 (0.67) | – | – | – |  |
| portrait_pd.jpg | 100KB | PASS | 0.9108 / 34.29 | 51 · mozjpeg · 1400×1750 | 0.9045 / 33.33 | 0.57 | 0.982 / 0.994 | 1.985 / 1.578 / 1.893 (0.32) | – | – | – |  |
| portrait_pd.jpg | 50% | PASS | 0.9426 / 36.85 | 76 · mozjpeg · 1400×1750 | 0.9433 / 36.29 | 0.62 | 0.972 / 0.981 | 1.656 / 1.517 / 1.517 (0.62) | – | – | – |  |
| scene_cc0.jpg | 200KB | PASS | 0.9606 / 38.66 | 77 · mozjpeg · 1600×1012 | 0.9564 / 37.4 | 0.68 | 0.981 / 0.995 | 1.465 / 1.402 / 1.402 (0.68) | – | – | – |  |
| scene_cc0.jpg | 100KB | PASS | 0.8937 / 35.16 | 57 · mozjpeg · 1600×1012 | 0.8827 / 34.57 | 0.55 | 0.983 / 0.989 | 2.028 / 1.718 / 1.909 (0.4) | – | – | – |  |
| scene_cc0.jpg | 50% | PASS | 0.9153 / 36.37 | 73 · mozjpeg · 1600×1012 | 0.9128 / 35.54 | 0.55 | 0.988 / 0.968 | 1.847 / 1.741 / 1.741 (0.55) | – | – | – |  |
| g01 | 200KB | PASS | 0.9807 / 35.39 | 71 · mozjpeg · 1800×1200 | 0.9783 / 34.23 | 0.59 | 0.991 / 0.998 | 1.328 / 1.235 / 1.235 (0.59) | 0.9833 / 35.87 | 0.9833 / 35.87 | 0.9783 / 34.23 |  |
| g01 | 100KB | PASS | 0.9414 / 30.48 | 64 · mozjpeg · 1333×889 | 0.941 / 30.04 | 0.52 | 0.991 / 0.991 | 1.401 / 1.296 / 1.643 (0.23) | 0.9396 / 30.29 | 0.9274 / 28.98 | 0.9339 / 30.17 |  |
| g01 | 50% | PASS | 0.9666 / 34.43 | 66 · mozjpeg · 1800×1200 | 0.9628 / 33.43 | 0.51 | 0.996 / 0.973 | 1.378 / 1.336 / 1.336 (0.51) | 0.9755 / 34.78 | 0.9603 / 31.84 | 0.9628 / 33.43 |  |
| g02 | 500KB | PASS | 0.9206 / 29.36 | 71 · mozjpeg · 2048×1536 | 0.9187 / 28.89 | 0.58 | 0.999 / 0.996 | 1.23 / 1.133 / 1.133 (0.58) | 0.9244 / 29.63 | 0.9244 / 29.63 | 0.9187 / 28.89 |  |
| g02 | 200KB | PASS | 0.8176 / 24.48 | 64 · mozjpeg · 1341×1006 | 0.8145 / 24.25 | 0.53 | 0.988 / 0.992 | 1.27 / 1.166 / 1.544 (0.16) | 0.8171 / 24.48 | 0.8427 / 25.38 | 0.8234 / 24.51 |  |
| g02 | 100KB | PASS | 0.7285 / 22.5 | 60 · mozjpeg · 948×711 | 0.723 / 22.29 | 0.51 | 0.979 / 0.989 | 1.282 / 1.166 / 2.269 (0.06) | 0.7223 / 22.41 | 0.75 / 22.91 | 0.7321 / 22.45 |  |
| g02 | 50% | PASS | 0.9351 / 31.38 | 81 · mozjpeg · 2048×1536 | 0.9464 / 30.64 | 0.75 | 0.994 / 0.996 | 1.193 / 1.087 / 1.087 (0.75) | 0.9351 / 31.38 | 0.9346 / 31.29 | 0.9464 / 30.64 |  |
| g03 | 500KB | PASS | 0.97 / 41.11 | 71 · mozjpeg · 3648×2048 | 0.9683 / 40.13 | 0.55 | 0.998 / 0.978 | 1.921 / 1.842 / 1.842 (0.55) | 0.97 / 41.13 | 0.97 / 41.13 | 0.9683 / 40.13 |  |
| g03 | 200KB | PASS | 0.9353 / 37.73 | 66 · mozjpeg · 2374×1333 | 0.9335 / 37.08 | 0.51 | 0.996 / 0.983 | 1.968 / 1.868 / 3.148 (0.21) | 0.9331 / 37.57 | 0.9284 / 37.33 | 0.9315 / 36.86 |  |
| g03 | 100KB | PASS | 0.9009 / 35.5 | 69 · mozjpeg · 1511×848 | 0.8996 / 34.99 | 0.57 | 0.999 / 0.998 | 1.759 / 1.652 / 5.022 (0.1) | 0.8987 / 35.4 | 0.8963 / 35.28 | 0.9006 / 34.95 |  |
| g03 | 50% | PASS | 0.984 / 45.07 | 84 · mozjpeg · 3648×2048 | 0.9858 / 43.48 | 0.8 | 0.968 / 0.974 | 1.557 / 1.397 / 1.397 (0.8) | 0.9853 / 45.38 | 0.9853 / 45.38 | 0.9858 / 43.48 |  |
| g04 | 500KB | PASS | 0.9065 / 35.49 | 56 · mozjpeg · 3400×2150 | 0.8959 / 34.83 | 0.6 | 0.984 / 0.976 | 1.975 / 1.605 / 1.891 (0.35) | 0.8957 / 35.29 | 0.9016 / 35.3 | 0.8994 / 34.95 |  |
| g04 | 200KB | PASS | 0.8133 / 33.09 | 73 · mozjpeg · 1785×1129 | 0.8122 / 32.83 | 0.64 | 0.944 / 0.973 | 1.738 / 1.615 / 3.058 (0.16) | 0.8142 / 33.13 | 0.8112 / 33.11 | 0.8192 / 32.87 |  |
| g04 | 100KB | PASS | 0.7558 / 31.97 | 75 · mozjpeg · 1262×798 | 0.7543 / 31.68 | 0.65 | 0.993 / 0.993 | 1.682 / 1.577 / 5.665 (0.09) | 0.752 / 31.89 | 0.7602 / 31.96 | 0.7588 / 31.72 |  |
| g04 | 50% | PASS | 0.9704 / 40.11 | 84 · mozjpeg · 3400×2150 | 0.9711 / 39.06 | 0.82 | 0.975 / 0.927 | 1.382 / 1.395 / 1.395 (0.82) | 0.9721 / 40.34 | 0.9704 / 40.11 | 0.9711 / 39.06 |  |
| p01 | 500KB | PASS | 0.9617 / 39.03 | 67 · mozjpeg · 2556×3195 | 0.9591 / 38.12 | 0.56 | 0.977 / 0.982 | 1.65 / 1.582 / 1.868 (0.3) | 0.9602 / 39.07 | 0.9636 / 39.25 | 0.9594 / 38.16 |  |
| p01 | 200KB | PASS | 0.9109 / 35.54 | 70 · mozjpeg · 1617×2021 | 0.9086 / 35.09 | 0.6 | 0.991 / 0.996 | 1.705 / 1.59 / 3.084 (0.11) | 0.9065 / 35.43 | 0.9116 / 35.68 | 0.9079 / 34.98 |  |
| p01 | 100KB | PASS | 0.8717 / 33.74 | 70 · mozjpeg · 1143×1429 | 0.8708 / 33.2 | 0.57 | 0.974 / 0.982 | 1.762 / 1.648 / 8.733 (0.04) | 0.871 / 33.67 | 0.871 / 33.71 | 0.8723 / 33.28 |  |
| p01 | 50% | PASS | 0.987 / 44.97 | 82 · mozjpeg · 3200×4000 | 0.987 / 43.28 | 0.76 | 0.941 / 0.948 | 1.456 / 1.355 / 1.355 (0.76) | 0.9877 / 45.39 | 0.9877 / 45.39 | 0.987 / 43.28 |  |
| p02 | 500KB | PASS | 0.9575 / 37.82 | 68 · mozjpeg · 2447×3057 | 0.9537 / 37.32 | 0.57 | 0.99 / 0.985 | 1.454 / 1.392 / 1.759 (0.23) | 0.9575 / 38.25 | 0.958 / 38.37 | 0.9548 / 37.46 |  |
| p02 | 200KB | PASS | 0.9063 / 34.88 | 73 · mozjpeg · 1548×1933 | 0.8953 / 34.11 | 0.65 | 0.991 / 0.985 | 1.421 / 1.332 / 2.742 (0.08) | 0.8923 / 34.2 | 0.8957 / 34.48 | 0.898 / 34.17 |  |
| p02 | 100KB | PASS | 0.8399 / 32.05 | 78 · mozjpeg · 1094×1367 | 0.8393 / 31.81 | 0.67 | 1 / 0.976 | 1.536 / 1.364 / no fit (–) | 0.8365 / 31.84 | 0.8427 / 32.3 | 0.8428 / 31.99 |  |
| p02 | 50% | PASS | 0.986 / 44.86 | 80 · mozjpeg · 3350×4185 | 0.9871 / 44.27 | 0.76 | 0.976 / 0.99 | 1.363 / 1.349 / 1.349 (0.76) | 0.9867 / 45.08 | 0.986 / 44.86 | 0.9871 / 44.27 |  |
| p03 | 500KB | PASS | 0.9667 / 38.72 | 67 · mozjpeg · 2532×3165 | 0.9645 / 38.02 | 0.55 | 0.993 / 0.991 | 1.64 / 1.555 / 1.971 (0.25) | 0.9654 / 38.58 | 0.9571 / 38.23 | 0.9642 / 38.06 |  |
| p03 | 200KB | PASS | 0.9205 / 35.34 | 69 · mozjpeg · 1601×2002 | 0.9175 / 34.93 | 0.58 | 0.989 / 0.99 | 1.664 / 1.565 / 3.419 (0.09) | 0.9178 / 35.26 | 0.9187 / 35.39 | 0.9182 / 34.91 |  |
| p03 | 100KB | PASS | 0.8836 / 33.28 | 70 · mozjpeg · 1132×1415 | 0.8807 / 32.9 | 0.58 | 0.986 / 0.999 | 1.669 / 1.569 / 12.028 (0.02) | 0.8817 / 33.22 | 0.8668 / 32.41 | 0.8822 / 32.99 |  |
| p03 | 50% | PASS | 0.9938 / 47.01 | 89 · mozjpeg · 3360×4200 | 0.9946 / 45.25 | 0.87 | 0.909 / 0.983 | 1.279 / 1.165 / 1.165 (0.87) | 0.9938 / 47.01 | 0.9938 / 47.01 | 0.9946 / 45.25 |  |
| p04 | 500KB | PASS | 0.9705 / 33.46 | 66 · mozjpeg · 2082×2603 | 0.9686 / 33.31 | 0.53 | 0.99 / 0.994 | 1.239 / 1.169 / 1.605 (0.12) | – | – | – |  |
| p04 | 200KB | PASS | 0.8969 / 28.4 | 68 · mozjpeg · 1317×1646 | 0.8826 / 27.55 | 0.55 | 0.999 / 0.997 | 1.307 / 1.207 / 2.613 (0.03) | – | – | – |  |
| p04 | 100KB | PASS | 0.752 / 24.49 | 71 · mozjpeg · 931×1164 | 0.762 / 24.46 | 0.57 | 0.981 / 0.999 | 1.465 / 1.261 / no fit (–) | – | – | – |  |
| p04 | 50% | PASS | 0.9954 / 44.99 | 79 · mozjpeg · 3360×4200 | 0.9948 / 43.57 | 0.68 | 0.991 / 0.982 | 1.141 / 1.102 / 1.102 (0.68) | – | – | – |  |
| p05 | 500KB | PASS | 0.9714 / 37.9 | 76 · mozjpeg · 2080×2600 | 0.9702 / 37.12 | 0.65 | 0.997 / 0.997 | 1.438 / 1.296 / 1.296 (0.65) | 0.9715 / 37.93 | 0.9715 / 37.93 | 0.9702 / 37.12 |  |
| p05 | 200KB | PASS | 0.9162 / 33.57 | 67 · mozjpeg · 1451×1813 | 0.9123 / 33.13 | 0.55 | 0.995 / 0.996 | 1.613 / 1.477 / 2.069 (0.21) | 0.9111 / 33.37 | 0.8847 / 32.43 | 0.9135 / 33.15 |  |
| p05 | 100KB | PASS | 0.8522 / 31.31 | 67 · mozjpeg · 1026×1282 | 0.8504 / 31.01 | 0.55 | 1 / 0.996 | 1.644 / 1.492 / 3.098 (0.1) | 0.8468 / 31.15 | 0.8504 / 31.24 | 0.8524 / 31.07 |  |
| p05 | 50% | PASS | 0.9912 / 45.04 | 93 · mozjpeg · 2080×2600 | 0.9921 / 41.76 | 0.92 | 0.894 / 0.663 | 1.129 / 1.067 / 1.037 (0.95) | 0.9902 / 44.34 | 0.9912 / 45.03 | 0.9921 / 41.76 |  |
| p06 | 500KB | PASS | 0.955 / 38.39 | 87 · mozjpeg · 1638×2048 | 0.9519 / 37.58 | 0.83 | 0.966 / 0.969 | 1.259 / 1.218 / 1.218 (0.83) | – | – | – |  |
| p06 | 200KB | PASS | 0.8988 / 34.56 | 66 · mozjpeg · 1638×2048 | 0.8894 / 33.1 | 0.65 | 0.988 / 0.986 | 1.587 / 1.417 / 1.527 (0.48) | – | – | – |  |
| p06 | 100KB | PASS | 0.856 / 31.56 | 67 · mozjpeg · 1117×1396 | 0.8564 / 31.26 | 0.53 | 0.974 / 0.993 | 1.558 / 1.45 / 1.908 (0.2) | – | – | – |  |
| p06 | 50% | PASS | 0.9875 / 43.12 | 92 · mozjpeg · 1638×2048 | 0.999 / 49.16 | 0.92 | 0.943 / 0.873 | 1.108 / 1.072 / 1.109 (0.94) | – | – | – |  |
| p07 | 500KB | PASS | 0.9654 / 39.98 | 67 · mozjpeg · 2457×3276 | 0.9479 / 38.13 | 0.73 | 0.998 / 0.993 | 1.312 / 1.421 / 1.286 (0.48) | 0.9694 / 40.71 | 0.9694 / 40.71 | 0.9435 / 36.93 |  |
| p07 | 200KB | PASS | 0.9093 / 36.09 | 79 · mozjpeg · 1431×1908 | 0.9067 / 35.47 | 0.72 | 0.929 / 0.973 | 1.647 / 1.483 / 2.239 (0.24) | 0.9106 / 36.02 | 0.9017 / 35.76 | 0.9114 / 35.54 |  |
| p07 | 100KB | PASS | 0.8896 / 34.6 | 79 · mozjpeg · 1012×1349 | 0.8886 / 34.01 | 0.73 | 0.969 / 0.994 | 1.556 / 1.463 / 3.811 (0.12) | 0.8887 / 34.55 | 0.8897 / 34.63 | 0.8896 / 34.16 |  |
| p07 | 50% | PASS | 0.9382 / 37.88 | 60 · mozjpeg · 2457×3276 | 0.9331 / 37.04 | 0.71 | 0.956 / 0.997 | 1.616 / 1.433 / 1.833 (0.45) | 0.9427 / 38.1 | 0.9427 / 38.1 | 0.929 / 36.6 |  |
| p08 | 500KB | PASS | 0.9891 / 46.29 | 79 · mozjpeg · 2560×3413 | 0.9864 / 43.15 | 0.69 | 0.902 / 0.967 | 1.523 / 1.344 / 1.344 (0.69) | – | – | – |  |
| p08 | 200KB | PASS | 0.9712 / 40.83 | 51 · mozjpeg · 2560×3413 | 0.9723 / 39.99 | 0.56 | 0.991 / 0.99 | 2.488 / 1.787 / 2.265 (0.32) | – | – | – |  |
| p08 | 100KB | PASS | 0.9609 / 38.54 | 64 · mozjpeg · 1444×1925 | 0.9605 / 37.79 | 0.51 | 0.982 / 0.986 | 1.872 / 1.78 / 3.689 (0.12) | – | – | – |  |
| p08 | 50% | PASS | 0.9828 / 44.07 | 71 · mozjpeg · 2560×3413 | 0.9829 / 42.21 | 0.64 | 0.986 / 0.981 | 1.88 / 1.874 / 1.874 (0.64) | – | – | – |  |
| p09 | 200KB | PASS | 0.9931 / 46.03 | 82 · mozjpeg · 1572×2097 | 0.995 / 44.81 | 0.76 | 0.956 / 0.999 | 1.388 / 1.165 / 1.165 (0.76) | 0.9943 / 46.81 | 0.9943 / 46.81 | 0.995 / 44.81 |  |
| p09 | 100KB | PASS | 0.9842 / 41.26 | 62 · mozjpeg · 1572×2097 | 0.9842 / 39.92 | 0.62 | 0.996 / 0.987 | 1.781 / 1.519 / 1.585 (0.43) | 0.9855 / 41.93 | 0.9807 / 39.16 | 0.9833 / 39.74 |  |
| p09 | 50% | PASS | 0.9857 / 41.98 | 67 · mozjpeg · 1572×2097 | 0.9857 / 40.67 | 0.51 | 0.997 / 0.993 | 1.707 / 1.549 / 1.549 (0.51) | 0.9868 / 42.73 | 0.9843 / 40.8 | 0.9857 / 40.67 |  |
| p10 | 500KB | PASS | 0.9665 / 40.61 | 68 · mozjpeg · 2184×3276 | 0.9525 / 37.5 | 0.51 | 0.958 / 0.938 | 1.305 / 1.271 / 1.271 (0.51) | – | – | – |  |
| p10 | 200KB | PASS | 0.9177 / 36.48 | 75 · mozjpeg · 1417×2126 | 0.917 / 35.72 | 0.64 | 0.999 / 0.992 | 1.699 / 1.554 / 2.331 (0.25) | – | – | – |  |
| p10 | 100KB | PASS | 0.8947 / 34.71 | 73 · mozjpeg · 1002×1503 | 0.8943 / 34 | 0.62 | 0.977 / 0.976 | 1.656 / 1.544 / 3.792 (0.12) | – | – | – |  |
| p10 | 50% | PASS | 0.9451 / 38.57 | 62 · mozjpeg · 2184×3276 | 0.9413 / 37.38 | 0.64 | 0.998 / 0.978 | 1.593 / 1.598 / 1.837 (0.47) | – | – | – |  |
| p11 | 500KB | PASS | 0.965 / 38.37 | 67 · mozjpeg · 2666×3333 | 0.9637 / 37.43 | 0.56 | 0.967 / 0.987 | 1.809 / 1.632 / 2.257 (0.22) | 0.963 / 38.28 | 0.9624 / 38.96 | 0.9636 / 37.44 |  |
| p11 | 200KB | PASS | 0.9341 / 35.67 | 67 · mozjpeg · 1686×2108 | 0.9352 / 34.93 | 0.55 | 0.977 / 0.985 | 1.9 / 1.711 / 4.794 (0.08) | 0.9333 / 35.59 | 0.9322 / 35.44 | 0.9356 / 34.96 |  |
| p11 | 100KB | PASS | 0.9155 / 33.55 | 69 · mozjpeg · 1073×1341 | 0.915 / 32.84 | 0.59 | 0.986 / 0.991 | 1.684 / 1.53 / no fit (–) | 0.9127 / 33.34 | 0.9134 / 33.21 | 0.915 / 32.89 |  |
| p11 | 50% | PASS | 0.9901 / 43.55 | 73 · mozjpeg · 3840×4800 | 0.9905 / 41.79 | 0.65 | 0.994 / 0.994 | 1.597 / 1.505 / 1.505 (0.65) | 0.9901 / 43.54 | 0.9901 / 43.54 | 0.9905 / 41.79 |  |
| p12 | 200KB | PASS | 0.987 / 46.04 | 76 · mozjpeg · 1600×1750 | 0.9814 / 42.76 | 0.61 | 0.999 / 0.99 | 1.668 / 1.559 / 1.559 (0.61) | 0.9869 / 46.02 | 0.984 / 45.34 | 0.9814 / 42.76 |  |
| p12 | 100KB | PASS | 0.9417 / 39.63 | 76 · mozjpeg · 1197×1309 | 0.9417 / 39.05 | 0.65 | 0.958 / 0.989 | 1.896 / 1.784 / 2.723 (0.44) | 0.9384 / 39.25 | 0.9382 / 39.28 | 0.9377 / 38.71 |  |
| p12 | 50% | PASS | 0.9461 / 40.34 | 65 · mozjpeg · 1600×1750 | 0.9496 / 39.7 | 0.66 | 0.964 / 0.987 | 2.376 / 1.793 / 2.388 (0.47) | 0.9461 / 40.33 | 0.9427 / 39.9 | 0.9402 / 38.79 |  |
| p13 | 50% | PASS | 0.978 / 40.54 | 73 · mozjpeg · 380×556 | 0.9767 / 39.14 | 0.6 | 0.964 / 0.999 | 1.539 / 1.427 / 1.427 (0.6) | – | – | – |  |
| p14 | 100KB | PASS | 0.9951 / 48.96 | 95 · mozjpeg · 576×584 | 0.9941 / 46.41 | 0.92 | 0.555 / 0.402 | 1.161 / 1.148 / 1.005 (0.98) | – | – | – |  |
| p14 | 50% | PASS | 0.9951 / 48.96 | 95 · mozjpeg · 576×584 | 0.9941 / 46.41 | 0.92 | 0.9 / 0.652 | 1.161 / 1.148 / 1.057 (0.96) | – | – | – |  |
| s01_exif6 | 500KB | PASS | 0.962 / 39.61 | 67 · mozjpeg · 2457×3276 | 0.9563 / 37.86 | 0.51 | 0.957 / 0.996 | 1.328 / 1.154 / 1.154 (0.51) | 0.9682 / 40.53 | 0.9682 / 40.53 | 0.9563 / 37.86 |  |
| s01_exif6 | 200KB | PASS | 0.9111 / 36.32 | 76 · mozjpeg · 1528×2037 | 0.9083 / 35.6 | 0.67 | 0.922 / 0.977 | 1.723 / 1.562 / 2.348 (0.24) | 0.9124 / 36.23 | 0.9028 / 35.86 | 0.9135 / 35.77 |  |
| s01_exif6 | 100KB | PASS | 0.8915 / 34.86 | 76 · mozjpeg · 1080×1440 | 0.8909 / 34.21 | 0.68 | 0.954 / 0.986 | 1.635 / 1.535 / 3.921 (0.12) | 0.8911 / 34.77 | 0.891 / 34.77 | 0.8913 / 34.33 |  |
| s01_exif6 | 50% | PASS | 0.9902 / 44.81 | 79 · mozjpeg · 2457×3276 | 0.9944 / 45.91 | 0.72 | 0.969 / 0.995 | 1.154 / 1.083 / 1.083 (0.72) | 0.9902 / 44.81 | 0.9888 / 44.37 | 0.9944 / 45.91 |  |
| s02_p3 | 500KB | PASS | 0.9206 / 30.59 | 71 · mozjpeg · 2048×1536 | 0.9179 / 29.99 | 0.57 | 0.993 / 0.988 | 1.235 / 1.122 / 1.122 (0.57) | 0.9243 / 30.94 | 0.9243 / 30.94 | 0.9179 / 29.99 |  |
| s02_p3 | 200KB | PASS | 0.818 / 24.93 | 63 · mozjpeg · 1359×1019 | 0.8148 / 24.72 | 0.51 | 0.985 / 0.981 | 1.284 / 1.178 / 1.546 (0.16) | 0.8176 / 24.92 | 0.845 / 26 | 0.8229 / 24.97 |  |
| s02_p3 | 100KB | PASS | 0.7198 / 22.61 | 70 · mozjpeg · 865×648 | 0.7131 / 22.39 | 0.63 | 0.989 / 0.999 | 1.231 / 1.126 / 2.279 (0.06) | 0.7132 / 22.48 | 0.7491 / 23.2 | 0.7318 / 22.75 |  |
| s02_p3 | 50% | PASS | 0.9303 / 31.58 | 76 · mozjpeg · 2048×1536 | 0.9309 / 30.88 | 0.65 | 0.975 / 0.987 | 1.205 / 1.158 / 1.158 (0.65) | 0.9338 / 31.96 | 0.9338 / 31.96 | 0.9309 / 30.88 |  |
| s03_screenshot | 100KB | PASS | 0.9795 / 26.62 | 64 · mozjpeg · 764×1652 | 0.9772 / 26.35 | 0.52 | 0.994 / 0.992 | 1.095 / 1.013 / 1.262 (0.14) | 0.9831 / 27.1 | 0.9702 / 25.1 | 0.9788 / 26.75 |  |
| s03_screenshot | 50% | PASS | 0.9703 / 25.15 | 69 · mozjpeg · 626×1354 | 0.967 / 24.87 | 0.61 | 0.996 / 1 | 1.151 / 1.066 / 1.334 (0.1) | 0.9722 / 25.35 | 0.9689 / 25.01 | 0.971 / 25.78 |  |

85/85 rows pass; 24/24 aggregate rules pass.

## Appendix F: regress:photo, round 2 (regress-out/photo.md, Chromium 153)

### regress:photo — chromium 153.0.8010.12

Inputs: 28 images (tests\fixtures\photo and spikes\photo\corpus). Encodes: 170.

#### Aggregate rules

| Rule | Result | Measured |
|---|---|---|
| Fit: every encode ≤ target (0 overshoots, 0 errors) | PASS | 170/170 encodes produced, 0 overshoots |
| Mean utilisation ≥ 0.93 (품질 우선) | PASS | 0.968 |
| Mean utilisation ≥ 0.93 (빠른 모드) | PASS | 0.965 |
| p02 at 100 KB fits (naive cannot) | PASS | 품질 102399, 빠른 99991, naive no fit |
| p11 at 100 KB fits (naive cannot) | PASS | 품질 100993, 빠른 101458, naive no fit |
| Mean 500KB 품질 우선 SSIM ≥ 0.945 / PSNR ≥ 36.8 | PASS | 0.9516 / 37.09 (n 11) |
| Mean 500KB 빠른 모드 SSIM ≥ 0.942 / PSNR ≥ 35.7 | PASS | 0.9469 / 36.17 (n 11) |
| MozJPEG gain 500KB: mean PSNR(품질) − PSNR(빠른) ≥ +0.5 dB | PASS | 0.92 dB |
| Mean 200KB 품질 우선 SSIM ≥ 0.905 / PSNR ≥ 34.9 | PASS | 0.9110 / 35.36 (n 14) |
| Mean 200KB 빠른 모드 SSIM ≥ 0.906 / PSNR ≥ 34.2 | PASS | 0.9081 / 34.57 (n 14) |
| MozJPEG gain 200KB: mean PSNR(품질) − PSNR(빠른) ≥ +0.5 dB | PASS | 0.80 dB |
| Mean 100KB 품질 우선 SSIM ≥ 0.865 / PSNR ≥ 31.7 | PASS | 0.8731 / 32.26 (n 15) |
| Mean 100KB 빠른 모드 SSIM ≥ 0.868 / PSNR ≥ 31.4 | PASS | 0.8713 / 31.78 (n 15) |
| MozJPEG gain 100KB: mean PSNR(품질) − PSNR(빠른) ≥ +0.45 dB | PASS | 0.48 dB |
| Mean 50% 품질 우선 SSIM ≥ 0.968 / PSNR ≥ 39.3 | PASS | 0.9710 / 39.88 (n 15) |
| Mean 50% 빠른 모드 SSIM ≥ 0.966 / PSNR ≥ 38.3 | PASS | 0.9719 / 38.80 (n 15) |
| MozJPEG gain 50%: mean PSNR(품질) − PSNR(빠른) ≥ +0.5 dB | PASS | 1.08 dB |
| Floor: final q ≥ 50 (MozJPEG) / ≥ 0.50 (canvas) when the long edge is over 64 | PASS | all |
| Blockiness cap: BI(품질) ≤ 2.5 on every corpus photo | PASS | max 2.488 |
| Blockiness: BI(품질) < BI(naive) wherever naive q < 0.30 | PASS | 32/32 pairs |
| p03 at 100 KB: BI(품질) < BI(naive) | PASS | 품질 1.669, naive 12.028 (naive q 0.02) |
| HEIC h01 gives heic, never corrupt | PASS | heic |
| s01_exif6 output is portrait | PASS | 2457×3276 |
| s02_p3 at 50 %: PSNR(output, decoded original) ≥ 31 dB | PASS | 31.58 dB |

#### Means per target (spike-baseline images; "all" includes every input)

| Target | n | 품질 우선 SSIM / PSNR | 빠른 모드 SSIM / PSNR | Gain dB | all n | all 품질 SSIM / PSNR | spike hybrid SSIM |
|---|---|---|---|---|---|---|---|
| 500KB | 11 | 0.9516 / 37.09 | 0.9469 / 36.17 | 0.92 | 15 | 0.9566 / 37.78 | 0.9519 |
| 200KB | 14 | 0.9110 / 35.36 | 0.9081 / 34.57 | 0.80 | 20 | 0.9175 / 35.57 | 0.9097 |
| 100KB | 15 | 0.8731 / 32.26 | 0.8713 / 31.78 | 0.48 | 22 | 0.8800 / 33.26 | 0.8731 |
| 50% | 15 | 0.9710 / 39.88 | 0.9719 / 38.80 | 1.08 | 28 | 0.9524 / 39.47 | 0.9707 |

#### Timing (median ms per image, worker wall time incl. wasm compile)

| Target | 품질 우선 | 빠른 모드 | spike hybrid-mozjpeg | Flag (> 2×) |
|---|---|---|---|---|
| 500KB | 4016 | 581 | 6098 |  |
| 200KB | 2562 | 411 | 4611 |  |
| 100KB | 1929 | 306 | 3522 |  |
| 50% | 3026 | 273 | 6421 |  |

#### Blockiness distribution (BI; ≈ 1 = no block edges)

- 품질 우선: min 0.996 · median 1.558 · max 391.585
- 빠른 모드: min 1.013 · median 1.450 · max 116.455
- naive: min 1.005 · median 1.759 · max 116.455
- naive where q < 0.30: min 1.262 · median 2.481 · max 12.028; 품질 우선 on those pairs: min 1.095 · median 1.642 · max 1.968

#### Rows

| Image | Target | Result | 품질 SSIM / PSNR | q · enc · size | 빠른 SSIM / PSNR | q | util 품질 / 빠른 | BI 품질 / 빠른 / naive (q) | spike fit-moz | spike hybrid-moz | spike canvas-q40 | Problems |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| alpha.png | 50% | PASS | 0.4886 / 3.01 | 92 · mozjpeg · 800×600 | 0.4888 / 3.01 | 0.92 | 0.907 / 0.828 | 20.568 / 15.645 / 18.052 (0.93) | – | – | – |  |
| cmyk.jpg | 50% | PASS | 1 / 58.64 | 95 · mozjpeg · 400×300 | 0.9998 / 34.41 | 0.92 | 0.783 / 0.7 | 12.675 / 11.052 / 12.118 (0.98) | – | – | – |  |
| exif6_gps.jpg | 50% | PASS | 0.9866 / 44.43 | 70 · mozjpeg · 900×1200 | 0.9859 / 43.31 | 0.55 | 0.917 / 0.991 | 12.329 / 8.239 / 8.239 (0.55) | – | – | – |  |
| opaque_rgba.png | 50% | PASS | 0.8848 / 25.29 | 73 · mozjpeg · 165×293 | 0.8849 / 24.78 | 0.55 | 0.992 / 0.995 | 0.996 / 1.044 / no fit (–) | – | – | – |  |
| p3_patches.jpg | 50% | PASS | 1 / 42.17 | 83 · mozjpeg · 600×400 | 1 / 39.77 | 0.82 | 1 / 1 | 391.585 / 116.455 / 116.455 (0.82) | – | – | – |  |
| portrait_pd.jpg | 200KB | PASS | 0.951 / 37.42 | 79 · mozjpeg · 1400×1750 | 0.9502 / 36.74 | 0.67 | 0.988 / 0.984 | 1.529 / 1.458 / 1.458 (0.67) | – | – | – |  |
| portrait_pd.jpg | 100KB | PASS | 0.9108 / 34.29 | 51 · mozjpeg · 1400×1750 | 0.9045 / 33.33 | 0.57 | 0.982 / 0.994 | 1.985 / 1.578 / 1.893 (0.32) | – | – | – |  |
| portrait_pd.jpg | 50% | PASS | 0.9426 / 36.85 | 76 · mozjpeg · 1400×1750 | 0.9433 / 36.29 | 0.62 | 0.972 / 0.981 | 1.656 / 1.517 / 1.517 (0.62) | – | – | – |  |
| scene_cc0.jpg | 200KB | PASS | 0.9606 / 38.66 | 77 · mozjpeg · 1600×1012 | 0.9564 / 37.4 | 0.68 | 0.981 / 0.995 | 1.465 / 1.402 / 1.402 (0.68) | – | – | – |  |
| scene_cc0.jpg | 100KB | PASS | 0.8937 / 35.16 | 57 · mozjpeg · 1600×1012 | 0.8827 / 34.57 | 0.55 | 0.983 / 0.989 | 2.028 / 1.718 / 1.909 (0.4) | – | – | – |  |
| scene_cc0.jpg | 50% | PASS | 0.9153 / 36.37 | 73 · mozjpeg · 1600×1012 | 0.9128 / 35.54 | 0.55 | 0.988 / 0.968 | 1.847 / 1.741 / 1.741 (0.55) | – | – | – |  |
| g01 | 200KB | PASS | 0.9807 / 35.39 | 71 · mozjpeg · 1800×1200 | 0.9783 / 34.23 | 0.59 | 0.991 / 0.998 | 1.328 / 1.235 / 1.235 (0.59) | 0.9833 / 35.87 | 0.9833 / 35.87 | 0.9783 / 34.23 |  |
| g01 | 100KB | PASS | 0.9414 / 30.48 | 64 · mozjpeg · 1333×889 | 0.941 / 30.04 | 0.52 | 0.991 / 0.991 | 1.401 / 1.296 / 1.643 (0.23) | 0.9396 / 30.29 | 0.9274 / 28.98 | 0.9339 / 30.17 |  |
| g01 | 50% | PASS | 0.9666 / 34.43 | 66 · mozjpeg · 1800×1200 | 0.9628 / 33.43 | 0.51 | 0.996 / 0.973 | 1.378 / 1.336 / 1.336 (0.51) | 0.9755 / 34.78 | 0.9603 / 31.84 | 0.9628 / 33.43 |  |
| g02 | 500KB | PASS | 0.9206 / 29.36 | 71 · mozjpeg · 2048×1536 | 0.9187 / 28.89 | 0.58 | 0.999 / 0.996 | 1.23 / 1.133 / 1.133 (0.58) | 0.9244 / 29.63 | 0.9244 / 29.63 | 0.9187 / 28.89 |  |
| g02 | 200KB | PASS | 0.8176 / 24.48 | 64 · mozjpeg · 1341×1006 | 0.8145 / 24.25 | 0.53 | 0.988 / 0.992 | 1.27 / 1.166 / 1.544 (0.16) | 0.8171 / 24.48 | 0.8427 / 25.38 | 0.8234 / 24.51 |  |
| g02 | 100KB | PASS | 0.7285 / 22.5 | 60 · mozjpeg · 948×711 | 0.723 / 22.29 | 0.51 | 0.979 / 0.989 | 1.282 / 1.166 / 2.269 (0.06) | 0.7223 / 22.41 | 0.75 / 22.91 | 0.7321 / 22.45 |  |
| g02 | 50% | PASS | 0.9351 / 31.38 | 81 · mozjpeg · 2048×1536 | 0.9464 / 30.64 | 0.75 | 0.994 / 0.996 | 1.193 / 1.087 / 1.087 (0.75) | 0.9351 / 31.38 | 0.9346 / 31.29 | 0.9464 / 30.64 |  |
| g03 | 500KB | PASS | 0.97 / 41.11 | 71 · mozjpeg · 3648×2048 | 0.9683 / 40.13 | 0.55 | 0.998 / 0.978 | 1.921 / 1.842 / 1.842 (0.55) | 0.97 / 41.13 | 0.97 / 41.13 | 0.9683 / 40.13 |  |
| g03 | 200KB | PASS | 0.9353 / 37.73 | 66 · mozjpeg · 2374×1333 | 0.9335 / 37.08 | 0.51 | 0.996 / 0.983 | 1.968 / 1.868 / 3.148 (0.21) | 0.9331 / 37.57 | 0.9284 / 37.33 | 0.9315 / 36.86 |  |
| g03 | 100KB | PASS | 0.9009 / 35.5 | 69 · mozjpeg · 1511×848 | 0.8996 / 34.99 | 0.57 | 0.999 / 0.998 | 1.759 / 1.652 / 5.022 (0.1) | 0.8987 / 35.4 | 0.8963 / 35.28 | 0.9006 / 34.95 |  |
| g03 | 50% | PASS | 0.984 / 45.07 | 84 · mozjpeg · 3648×2048 | 0.9858 / 43.48 | 0.8 | 0.968 / 0.974 | 1.557 / 1.397 / 1.397 (0.8) | 0.9853 / 45.38 | 0.9853 / 45.38 | 0.9858 / 43.48 |  |
| g04 | 500KB | PASS | 0.9065 / 35.49 | 56 · mozjpeg · 3400×2150 | 0.8959 / 34.83 | 0.6 | 0.984 / 0.976 | 1.975 / 1.605 / 1.891 (0.35) | 0.8957 / 35.29 | 0.9016 / 35.3 | 0.8994 / 34.95 |  |
| g04 | 200KB | PASS | 0.8133 / 33.09 | 73 · mozjpeg · 1785×1129 | 0.8122 / 32.83 | 0.64 | 0.944 / 0.973 | 1.738 / 1.615 / 3.058 (0.16) | 0.8142 / 33.13 | 0.8112 / 33.11 | 0.8192 / 32.87 |  |
| g04 | 100KB | PASS | 0.7558 / 31.97 | 75 · mozjpeg · 1262×798 | 0.7543 / 31.68 | 0.65 | 0.993 / 0.993 | 1.682 / 1.577 / 5.665 (0.09) | 0.752 / 31.89 | 0.7602 / 31.96 | 0.7588 / 31.72 |  |
| g04 | 50% | PASS | 0.9704 / 40.11 | 84 · mozjpeg · 3400×2150 | 0.9711 / 39.06 | 0.82 | 0.975 / 0.927 | 1.382 / 1.395 / 1.395 (0.82) | 0.9721 / 40.34 | 0.9704 / 40.11 | 0.9711 / 39.06 |  |
| p01 | 500KB | PASS | 0.9617 / 39.03 | 67 · mozjpeg · 2556×3195 | 0.9591 / 38.12 | 0.56 | 0.977 / 0.982 | 1.65 / 1.582 / 1.868 (0.3) | 0.9602 / 39.07 | 0.9636 / 39.25 | 0.9594 / 38.16 |  |
| p01 | 200KB | PASS | 0.9109 / 35.54 | 70 · mozjpeg · 1617×2021 | 0.9086 / 35.09 | 0.6 | 0.991 / 0.996 | 1.705 / 1.59 / 3.084 (0.11) | 0.9065 / 35.43 | 0.9116 / 35.68 | 0.9079 / 34.98 |  |
| p01 | 100KB | PASS | 0.8717 / 33.74 | 70 · mozjpeg · 1143×1429 | 0.8708 / 33.2 | 0.57 | 0.974 / 0.982 | 1.762 / 1.648 / 8.733 (0.04) | 0.871 / 33.67 | 0.871 / 33.71 | 0.8723 / 33.28 |  |
| p01 | 50% | PASS | 0.987 / 44.97 | 82 · mozjpeg · 3200×4000 | 0.987 / 43.28 | 0.76 | 0.941 / 0.948 | 1.456 / 1.355 / 1.355 (0.76) | 0.9877 / 45.39 | 0.9877 / 45.39 | 0.987 / 43.28 |  |
| p02 | 500KB | PASS | 0.9575 / 37.82 | 68 · mozjpeg · 2447×3057 | 0.9537 / 37.32 | 0.57 | 0.99 / 0.985 | 1.454 / 1.392 / 1.759 (0.23) | 0.9575 / 38.25 | 0.958 / 38.37 | 0.9548 / 37.46 |  |
| p02 | 200KB | PASS | 0.9063 / 34.88 | 73 · mozjpeg · 1548×1933 | 0.8953 / 34.11 | 0.65 | 0.991 / 0.985 | 1.421 / 1.332 / 2.742 (0.08) | 0.8923 / 34.2 | 0.8957 / 34.48 | 0.898 / 34.17 |  |
| p02 | 100KB | PASS | 0.8399 / 32.05 | 78 · mozjpeg · 1094×1367 | 0.8393 / 31.81 | 0.67 | 1 / 0.976 | 1.536 / 1.364 / no fit (–) | 0.8365 / 31.84 | 0.8427 / 32.3 | 0.8428 / 31.99 |  |
| p02 | 50% | PASS | 0.986 / 44.86 | 80 · mozjpeg · 3350×4185 | 0.9871 / 44.27 | 0.76 | 0.976 / 0.99 | 1.363 / 1.349 / 1.349 (0.76) | 0.9867 / 45.08 | 0.986 / 44.86 | 0.9871 / 44.27 |  |
| p03 | 500KB | PASS | 0.9667 / 38.72 | 67 · mozjpeg · 2532×3165 | 0.9645 / 38.02 | 0.55 | 0.993 / 0.991 | 1.64 / 1.555 / 1.971 (0.25) | 0.9654 / 38.58 | 0.9571 / 38.23 | 0.9642 / 38.06 |  |
| p03 | 200KB | PASS | 0.9205 / 35.34 | 69 · mozjpeg · 1601×2002 | 0.9175 / 34.93 | 0.58 | 0.989 / 0.99 | 1.664 / 1.565 / 3.419 (0.09) | 0.9178 / 35.26 | 0.9187 / 35.39 | 0.9182 / 34.91 |  |
| p03 | 100KB | PASS | 0.8836 / 33.28 | 70 · mozjpeg · 1132×1415 | 0.8807 / 32.9 | 0.58 | 0.986 / 0.999 | 1.669 / 1.569 / 12.028 (0.02) | 0.8817 / 33.22 | 0.8668 / 32.41 | 0.8822 / 32.99 |  |
| p03 | 50% | PASS | 0.9938 / 47.01 | 89 · mozjpeg · 3360×4200 | 0.9946 / 45.25 | 0.87 | 0.909 / 0.983 | 1.279 / 1.165 / 1.165 (0.87) | 0.9938 / 47.01 | 0.9938 / 47.01 | 0.9946 / 45.25 |  |
| p04 | 500KB | PASS | 0.9705 / 33.46 | 66 · mozjpeg · 2082×2603 | 0.9686 / 33.31 | 0.53 | 0.99 / 0.994 | 1.239 / 1.169 / 1.605 (0.12) | – | – | – |  |
| p04 | 200KB | PASS | 0.8969 / 28.4 | 68 · mozjpeg · 1317×1646 | 0.8826 / 27.55 | 0.55 | 0.999 / 0.997 | 1.307 / 1.207 / 2.613 (0.03) | – | – | – |  |
| p04 | 100KB | PASS | 0.752 / 24.49 | 71 · mozjpeg · 931×1164 | 0.762 / 24.46 | 0.57 | 0.981 / 0.999 | 1.465 / 1.261 / no fit (–) | – | – | – |  |
| p04 | 50% | PASS | 0.9954 / 44.99 | 79 · mozjpeg · 3360×4200 | 0.9948 / 43.57 | 0.68 | 0.991 / 0.982 | 1.141 / 1.102 / 1.102 (0.68) | – | – | – |  |
| p05 | 500KB | PASS | 0.9714 / 37.9 | 76 · mozjpeg · 2080×2600 | 0.9702 / 37.12 | 0.65 | 0.997 / 0.997 | 1.438 / 1.296 / 1.296 (0.65) | 0.9715 / 37.93 | 0.9715 / 37.93 | 0.9702 / 37.12 |  |
| p05 | 200KB | PASS | 0.9162 / 33.57 | 67 · mozjpeg · 1451×1813 | 0.9123 / 33.13 | 0.55 | 0.995 / 0.996 | 1.613 / 1.477 / 2.069 (0.21) | 0.9111 / 33.37 | 0.8847 / 32.43 | 0.9135 / 33.15 |  |
| p05 | 100KB | PASS | 0.8522 / 31.31 | 67 · mozjpeg · 1026×1282 | 0.8504 / 31.01 | 0.55 | 1 / 0.996 | 1.644 / 1.492 / 3.098 (0.1) | 0.8468 / 31.15 | 0.8504 / 31.24 | 0.8524 / 31.07 |  |
| p05 | 50% | PASS | 0.9912 / 45.04 | 93 · mozjpeg · 2080×2600 | 0.9921 / 41.76 | 0.92 | 0.894 / 0.663 | 1.129 / 1.067 / 1.037 (0.95) | 0.9902 / 44.34 | 0.9912 / 45.03 | 0.9921 / 41.76 |  |
| p06 | 500KB | PASS | 0.955 / 38.39 | 87 · mozjpeg · 1638×2048 | 0.9519 / 37.58 | 0.83 | 0.966 / 0.969 | 1.259 / 1.218 / 1.218 (0.83) | – | – | – |  |
| p06 | 200KB | PASS | 0.8988 / 34.56 | 66 · mozjpeg · 1638×2048 | 0.8894 / 33.1 | 0.65 | 0.988 / 0.986 | 1.587 / 1.417 / 1.527 (0.48) | – | – | – |  |
| p06 | 100KB | PASS | 0.856 / 31.56 | 67 · mozjpeg · 1117×1396 | 0.8564 / 31.26 | 0.53 | 0.974 / 0.993 | 1.558 / 1.45 / 1.908 (0.2) | – | – | – |  |
| p06 | 50% | PASS | 0.9875 / 43.12 | 92 · mozjpeg · 1638×2048 | 0.999 / 49.16 | 0.92 | 0.943 / 0.873 | 1.108 / 1.072 / 1.109 (0.94) | – | – | – |  |
| p07 | 500KB | PASS | 0.9654 / 39.98 | 67 · mozjpeg · 2457×3276 | 0.9479 / 38.13 | 0.73 | 0.998 / 0.993 | 1.312 / 1.421 / 1.286 (0.48) | 0.9694 / 40.71 | 0.9694 / 40.71 | 0.9435 / 36.93 |  |
| p07 | 200KB | PASS | 0.9093 / 36.09 | 79 · mozjpeg · 1431×1908 | 0.9067 / 35.47 | 0.72 | 0.929 / 0.973 | 1.647 / 1.483 / 2.239 (0.24) | 0.9106 / 36.02 | 0.9017 / 35.76 | 0.9114 / 35.54 |  |
| p07 | 100KB | PASS | 0.8896 / 34.6 | 79 · mozjpeg · 1012×1349 | 0.8886 / 34.01 | 0.73 | 0.969 / 0.994 | 1.556 / 1.463 / 3.811 (0.12) | 0.8887 / 34.55 | 0.8897 / 34.63 | 0.8896 / 34.16 |  |
| p07 | 50% | PASS | 0.9382 / 37.88 | 60 · mozjpeg · 2457×3276 | 0.9331 / 37.04 | 0.71 | 0.956 / 0.997 | 1.616 / 1.433 / 1.833 (0.45) | 0.9427 / 38.1 | 0.9427 / 38.1 | 0.929 / 36.6 |  |
| p08 | 500KB | PASS | 0.9891 / 46.29 | 79 · mozjpeg · 2560×3413 | 0.9864 / 43.15 | 0.69 | 0.902 / 0.967 | 1.523 / 1.344 / 1.344 (0.69) | – | – | – |  |
| p08 | 200KB | PASS | 0.9712 / 40.83 | 51 · mozjpeg · 2560×3413 | 0.9723 / 39.99 | 0.56 | 0.991 / 0.99 | 2.488 / 1.787 / 2.265 (0.32) | – | – | – |  |
| p08 | 100KB | PASS | 0.9609 / 38.54 | 64 · mozjpeg · 1444×1925 | 0.9605 / 37.79 | 0.51 | 0.982 / 0.986 | 1.872 / 1.78 / 3.689 (0.12) | – | – | – |  |
| p08 | 50% | PASS | 0.9828 / 44.07 | 71 · mozjpeg · 2560×3413 | 0.9829 / 42.21 | 0.64 | 0.986 / 0.981 | 1.88 / 1.874 / 1.874 (0.64) | – | – | – |  |
| p09 | 200KB | PASS | 0.9931 / 46.03 | 82 · mozjpeg · 1572×2097 | 0.995 / 44.81 | 0.76 | 0.956 / 0.999 | 1.388 / 1.165 / 1.165 (0.76) | 0.9943 / 46.81 | 0.9943 / 46.81 | 0.995 / 44.81 |  |
| p09 | 100KB | PASS | 0.9842 / 41.26 | 62 · mozjpeg · 1572×2097 | 0.9842 / 39.92 | 0.62 | 0.996 / 0.987 | 1.781 / 1.519 / 1.585 (0.43) | 0.9855 / 41.93 | 0.9807 / 39.16 | 0.9833 / 39.74 |  |
| p09 | 50% | PASS | 0.9857 / 41.98 | 67 · mozjpeg · 1572×2097 | 0.9857 / 40.67 | 0.51 | 0.997 / 0.993 | 1.707 / 1.549 / 1.549 (0.51) | 0.9868 / 42.73 | 0.9843 / 40.8 | 0.9857 / 40.67 |  |
| p10 | 500KB | PASS | 0.9665 / 40.61 | 68 · mozjpeg · 2184×3276 | 0.9525 / 37.5 | 0.51 | 0.958 / 0.938 | 1.305 / 1.271 / 1.271 (0.51) | – | – | – |  |
| p10 | 200KB | PASS | 0.9177 / 36.48 | 75 · mozjpeg · 1417×2126 | 0.917 / 35.72 | 0.64 | 0.999 / 0.992 | 1.699 / 1.554 / 2.331 (0.25) | – | – | – |  |
| p10 | 100KB | PASS | 0.8947 / 34.71 | 73 · mozjpeg · 1002×1503 | 0.8943 / 34 | 0.62 | 0.977 / 0.976 | 1.656 / 1.544 / 3.792 (0.12) | – | – | – |  |
| p10 | 50% | PASS | 0.9451 / 38.57 | 62 · mozjpeg · 2184×3276 | 0.9413 / 37.38 | 0.64 | 0.998 / 0.978 | 1.593 / 1.598 / 1.837 (0.47) | – | – | – |  |
| p11 | 500KB | PASS | 0.965 / 38.37 | 67 · mozjpeg · 2666×3333 | 0.9637 / 37.43 | 0.56 | 0.967 / 0.987 | 1.809 / 1.632 / 2.257 (0.22) | 0.963 / 38.28 | 0.9624 / 38.96 | 0.9636 / 37.44 |  |
| p11 | 200KB | PASS | 0.9341 / 35.67 | 67 · mozjpeg · 1686×2108 | 0.9352 / 34.93 | 0.55 | 0.977 / 0.985 | 1.9 / 1.711 / 4.794 (0.08) | 0.9333 / 35.59 | 0.9322 / 35.44 | 0.9356 / 34.96 |  |
| p11 | 100KB | PASS | 0.9155 / 33.55 | 69 · mozjpeg · 1073×1341 | 0.915 / 32.84 | 0.59 | 0.986 / 0.991 | 1.684 / 1.53 / no fit (–) | 0.9127 / 33.34 | 0.9134 / 33.21 | 0.915 / 32.89 |  |
| p11 | 50% | PASS | 0.9901 / 43.55 | 73 · mozjpeg · 3840×4800 | 0.9905 / 41.79 | 0.65 | 0.994 / 0.994 | 1.597 / 1.505 / 1.505 (0.65) | 0.9901 / 43.54 | 0.9901 / 43.54 | 0.9905 / 41.79 |  |
| p12 | 200KB | PASS | 0.987 / 46.04 | 76 · mozjpeg · 1600×1750 | 0.9814 / 42.76 | 0.61 | 0.999 / 0.99 | 1.668 / 1.559 / 1.559 (0.61) | 0.9869 / 46.02 | 0.984 / 45.34 | 0.9814 / 42.76 |  |
| p12 | 100KB | PASS | 0.9417 / 39.63 | 76 · mozjpeg · 1197×1309 | 0.9417 / 39.05 | 0.65 | 0.958 / 0.989 | 1.896 / 1.784 / 2.723 (0.44) | 0.9384 / 39.25 | 0.9382 / 39.28 | 0.9377 / 38.71 |  |
| p12 | 50% | PASS | 0.9461 / 40.34 | 65 · mozjpeg · 1600×1750 | 0.9496 / 39.7 | 0.66 | 0.964 / 0.987 | 2.376 / 1.793 / 2.388 (0.47) | 0.9461 / 40.33 | 0.9427 / 39.9 | 0.9402 / 38.79 |  |
| p13 | 50% | PASS | 0.978 / 40.54 | 73 · mozjpeg · 380×556 | 0.9767 / 39.14 | 0.6 | 0.964 / 0.999 | 1.539 / 1.427 / 1.427 (0.6) | – | – | – |  |
| p14 | 100KB | PASS | 0.9951 / 48.96 | 95 · mozjpeg · 576×584 | 0.9941 / 46.41 | 0.92 | 0.555 / 0.402 | 1.161 / 1.148 / 1.005 (0.98) | – | – | – |  |
| p14 | 50% | PASS | 0.9951 / 48.96 | 95 · mozjpeg · 576×584 | 0.9941 / 46.41 | 0.92 | 0.9 / 0.652 | 1.161 / 1.148 / 1.057 (0.96) | – | – | – |  |
| s01_exif6 | 500KB | PASS | 0.962 / 39.61 | 67 · mozjpeg · 2457×3276 | 0.9563 / 37.86 | 0.51 | 0.957 / 0.996 | 1.328 / 1.154 / 1.154 (0.51) | 0.9682 / 40.53 | 0.9682 / 40.53 | 0.9563 / 37.86 |  |
| s01_exif6 | 200KB | PASS | 0.9111 / 36.32 | 76 · mozjpeg · 1528×2037 | 0.9083 / 35.6 | 0.67 | 0.922 / 0.977 | 1.723 / 1.562 / 2.348 (0.24) | 0.9124 / 36.23 | 0.9028 / 35.86 | 0.9135 / 35.77 |  |
| s01_exif6 | 100KB | PASS | 0.8915 / 34.86 | 76 · mozjpeg · 1080×1440 | 0.8909 / 34.21 | 0.68 | 0.954 / 0.986 | 1.635 / 1.535 / 3.921 (0.12) | 0.8911 / 34.77 | 0.891 / 34.77 | 0.8913 / 34.33 |  |
| s01_exif6 | 50% | PASS | 0.9902 / 44.81 | 79 · mozjpeg · 2457×3276 | 0.9944 / 45.91 | 0.72 | 0.969 / 0.995 | 1.154 / 1.083 / 1.083 (0.72) | 0.9902 / 44.81 | 0.9888 / 44.37 | 0.9944 / 45.91 |  |
| s02_p3 | 500KB | PASS | 0.9206 / 30.59 | 71 · mozjpeg · 2048×1536 | 0.9179 / 29.99 | 0.57 | 0.993 / 0.988 | 1.235 / 1.122 / 1.122 (0.57) | 0.9243 / 30.94 | 0.9243 / 30.94 | 0.9179 / 29.99 |  |
| s02_p3 | 200KB | PASS | 0.818 / 24.93 | 63 · mozjpeg · 1359×1019 | 0.8148 / 24.72 | 0.51 | 0.985 / 0.981 | 1.284 / 1.178 / 1.546 (0.16) | 0.8176 / 24.92 | 0.845 / 26 | 0.8229 / 24.97 |  |
| s02_p3 | 100KB | PASS | 0.7198 / 22.61 | 70 · mozjpeg · 865×648 | 0.7131 / 22.39 | 0.63 | 0.989 / 0.999 | 1.231 / 1.126 / 2.279 (0.06) | 0.7132 / 22.48 | 0.7491 / 23.2 | 0.7318 / 22.75 |  |
| s02_p3 | 50% | PASS | 0.9303 / 31.58 | 76 · mozjpeg · 2048×1536 | 0.9309 / 30.88 | 0.65 | 0.975 / 0.987 | 1.205 / 1.158 / 1.158 (0.65) | 0.9338 / 31.96 | 0.9338 / 31.96 | 0.9309 / 30.88 |  |
| s03_screenshot | 100KB | PASS | 0.9795 / 26.62 | 64 · mozjpeg · 764×1652 | 0.9772 / 26.35 | 0.52 | 0.994 / 0.992 | 1.095 / 1.013 / 1.262 (0.14) | 0.9831 / 27.1 | 0.9702 / 25.1 | 0.9788 / 26.75 |  |
| s03_screenshot | 50% | PASS | 0.9703 / 25.15 | 69 · mozjpeg · 626×1354 | 0.967 / 24.87 | 0.61 | 0.996 / 1 | 1.151 / 1.066 / 1.334 (0.1) | 0.9722 / 25.35 | 0.9689 / 25.01 | 0.971 / 25.78 |  |

85/85 rows pass; 24/24 aggregate rules pass.
