# Review Request — Step 4 (여권사진 규격 맞추기, /id-photo/)
Date: 2026-09-30
Ready for Review: YES
Status: DONE_WITH_CONCERNS (license Flag → ships manual-only; one regress check missed)

Brief: handoff/ARCHITECT-BRIEF-STEP4.md. Step 0 results, decisions and Known Gaps: BUILD-LOG "Step 4 build notes".
Nothing committed.

## Blocked / Flags for Arch
1. **`EIGEN_MPL2_ONLY` cannot be shown → the build ships with auto-framing off** (`scripts/lib/autoframe.mjs` DEFAULT "0").
   - Neither Eigen BUILD file at the pinned commits defines it (MediaPipe bdddcbd `third_party/eigen.BUILD`, Eigen ea13a98; TF a481b10 `third_party/xla/third_party/eigen3/eigen_archive.BUILD`, Eigen dcbaf2d). Both `defines` are exactly `EIGEN_MAX_ALIGN_BYTES=64`, `EIGEN_ALLOW_UNALIGNED_SCALARS`, `EIGEN_USE_AVX512_GEMM_KERNELS=0`.
   - Mitigating: at both Eigen commits no header references `EIGEN_MPL2_ONLY` (the guard is gone; only CHANGELOG mentions it), there is no COPYING.LGPL, and the only LGPL mention (IncompleteLUT.h) states the code was relicensed to MPL2.
   - To ship auto-framing: set DEFAULT to "1" (or `PUBLIC_ID_PHOTO_AUTOFRAME=1` on Cloudflare). Everything is built and tested in that mode.
2. **fft2d (Ooura) in the wasm**: TFLite's RFFT2D kernel links it. License (TF `third_party/fft2d/LICENSE`): "You may use, copy, modify this code for any purpose and without fee. You may distribute this ORIGINAL package." Not in the §0 allowlist; the "ORIGINAL package" clause is unclear for a binary. `check:licenses` with flag 1 fails on exactly this entry (intended until you decide: allowlist, second exception, or keep off).
3. **MediaPipe telemetry (found, handled)**: tasks-vision 1.0.1 POSTs usage metrics to `https://odml.pa.googleapis.com/v1/log` every 60 s and on close() (the MediaPipe Tasks Privacy Notice confirms). `detachTelemetry()` (src/lib/face/landmarker.ts:30) stops it; an unexpected bundle shape → manual fallback. CSP blocks it anyway. e2e fast-forwards 5 min: no request, no CSP event. Please confirm no privacy-page wording is needed (nothing is sent).
4. **regress:idphoto check 2**: p07 chin −1.11 mm (committed 1,200 px copy) / −1.01 mm (full-res) against ≤ 1.0 mm. p07 is the 25° yaw + open-smile portrait (it carries the yaw and expression warnings). Threshold not lowered. Firefox also misses check 6 (PSNR min 37.50 dB < 38; Chromium 38.31, WebKit 43.13).
5. **Calibration refit not done**: no ≥ 8 neutral, closed-mouth, skull-visible heads from the allowed sources were added; K/C stay provisional (brief fallback; Known Gap).
6. **UX-AUDIT-1 §11 vs brief** (brief followed): no camera button (`capture`), accept list per brief, file name shown but not editable.
7. **Copy rule conflicts resolved by the later Polish rules**: "처음부터" → "다른 사진 처리하기"; "300 dpi" allowed on /id-photo/ only (COPY.md and the dist copy test updated).

## Gates (actual numbers)
| Gate | Result |
|---|---|
| check | 0 errors / 0 warnings / 0 hints |
| unit | 393/393 (18 files; new: idphoto-core 52, idphoto-encode 12, idphoto-landmarker 7, idphoto-model 8, check-licenses 5; network-guard exact list) |
| e2e, 5 projects | 668 passed / 0 failed / 6 flaky (all Firefox `page.goto` timeout, the known race) / 131 skipped (stated reasons). Every id-photo test records `securitypolicyviolation`: 0. id-photo spec re-run after the last change: 134 passed / 26 skipped |
| axe | 0 serious/critical: /id-photo/ empty, adjust (overlay, checklist, custom fields), done; all site pages incl. /id-photo/ |
| Lighthouse (3 runs, median) | all assertions pass — table below |
| licenses | flag 0 (shipping): OK, 26 packages, 3 components, 0 exceptions. flag 1: Eigen exception used; FAIL on fft2d only (Flag 2) |
| budgets | check-dist OK with flag 1 (table below) and flag 0 with `--no-mediapipe` (no MediaPipe path or string in dist-noauto) |
| regress:idphoto | Chromium 13/14 (Flag 4); Firefox 9/11; WebKit 10/11. Table below |
| regress:merge / compress / photo | 5/5 · 122/122 · 85/85 rows + 24/24 rules (unchanged) |
| qa:visual (local preview) | 198 PNGs, 0 hard failures (new: idp states desktop/mobile; /id-photo/ in the static matrix) |
| smoke:assets (local preview) | OK, 344 URLs |
| longest long task (photo → adjust, Chromium, 3 runs) | 259–266 ms (< 1 s). Firefox/WebKit have no longtask API; wall time 1.1–1.8 s / 1.3–1.4 s |
| wasm downloaded twice | no (CDP e2e: exactly one network response, the rest from cache) |

### Lighthouse medians (mobile preset, local server)
| URL | Perf | A11y | BP | SEO | LCP (3 runs, s) | CLS |
|---|---|---|---|---|---|---|
| / | 99 | 100 | 100 | 100 | 1.96/1.95/1.96 | 0.0001 |
| /pdf-merge/ | 99 | 100 | 100 | 100 | 1.96/1.96/1.96 | 0.0005 |
| /pdf-compress/ | 99 | 100 | 100 | 100 | 2.04/1.96/1.96 | 0.0003 |
| /photo-compress/ | 99 | 100 | 100 | 100 | 1.95/1.96/1.95 | 0.0004 |
| /id-photo/ | 99 | 100 | 100 | 100 | 1.81/1.81/1.80 | 0.0020 |
| /terms/ | 99 | 100 | 100 | 100 | 1.80/1.80/1.80 | 0.0001 |

HEAD (9c4e019) built on this machine today gives the same 1.95 s on / and /photo-compress/ (Perf 99): the 1.71 s of the Polish run is an environment difference, not this step. Two fixes were needed to keep this: the lazy controller on /id-photo/ and the `ui-shared` chunk (BUILD-LOG).

### Budgets (check-dist, gzip -9 unless noted)
| Asset | Size | Budget |
|---|---|---|
| /id-photo/ initial JS | 4.8 KB | 30 KB |
| encode.worker*.js | 13.0 KB | 25 KB |
| MediaPipe chunk (vision_bundle*.js) | 43.9 KB | 50 KB |
| vision_wasm_internal.js / _nosimd_internal.js | 76.2 / 76.1 KB | 90 KB each |
| vision_wasm_internal.wasm | 11,481 KB raw / 3,360 KB gzip | 12.2 MB raw / 3.6 MB gzip |
| vision_wasm_nosimd_internal.wasm | 10,703 KB raw | 11.4 MB raw |
| face_landmarker-64184e22.task | 3,670.5 KB, SHA-256 = pin | pin |
| lazy total, SIMD path | 6,736.5 KB gzip | 7.2 MB |
| MozJPEG enc+dec wasm | 120.8 KB, exactly one mozjpeg_enc | 140 KB |
| UI fonts total | 179.1 KB raw (flag 0: 178.0) | 180 KB |
| SW precache | 298.4 KB raw (flag 0: 297.5) | 450 KB |

### regress:idphoto (Chromium, committed + full-res; regress-out/idphoto.md)
| check | result | detail |
|---|---|---|
| 1 detection: 1 face on every portrait | PASS | 24/24 |
| 1 detection: 0 faces on the scene | PASS | manual note |
| 1 detection: ≥ 2 on two_faces | PASS | 2, multi warning |
| 2 landmarks ≤ 1.0 mm | **FAIL** | eye max 0.51 mm; chin −1.11 to +0.71 mm; misses p07 (both sets) |
| 3 head, committed: in 32–36 (≤ 1 miss) | PASS | 4/5: p02 33.38, p06 32.67, p07 34.96, p08 34.59, p10 36.30 |
| 3 head, committed: MAE ≤ 1.2 mm | PASS | 1.16 |
| 3 head, full-res: in band / MAE | PASS / PASS | 4/5; 1.11 mm |
| 3 out-of-band head carries a pose/expression warning | PASS | p10 (pitch) |
| 4 exact output, every preset × portrait | PASS | 74/74 files (10 lowres at 1,200 px, correctly blocked) |
| 5 expectWarn fires | PASS | |
| 6 resampling PSNR ≥ 38 dB | PASS | min 38.31 |
| 7 lowres 380 px blocked | PASS | |
| timing | – | init 555 ms, detect median 62 ms (spike 700 / 89) |

Head length is judged at the auto frame's unclamped scale (the committed 1,200 px copies are too small for passport at some head sizes; that is check 4's lowres, not a head error). The calibration set is 5 heads (skull set, conf high/med), so "≥ 5 of 6" is applied as "≤ 1 miss".

## Files Changed
- src/data/id-photo-presets.ts:1-242 — presets with verbatim quotes, `validatePreset`, `customPreset`, `outputName`, `presetSummary` (FAQ 4 numbers from data).
- src/lib/image/jfif.ts:1-52 — `setJfifDpi` (patch or insert APP0) and `readJfif`.
- src/lib/idphoto/crop.ts:1-131 — pure geometry (toSource/toOutput, corners, inside, zoomAt, pan, rotate, pinch, headLength).
- src/lib/idphoto/frame.ts:1-58, calibration.ts:1-11 — crown estimate and auto/manual framing (lowres, outside).
- src/lib/idphoto/warnings.ts:1-161, background.ts:1-66 — checklist copy and thresholds; background L*/chroma/std check.
- src/lib/idphoto/render.ts:1-80 — output render (2·s prescale) and preview; DOM-canvas fallback.
- src/lib/idphoto/encode.ts:1-125, encode.worker.ts:1-50 — MozJPEG q search on the JFIF-patched size, canvas fallback, verify-or-discard.
- src/lib/face/assets.ts:1-69 — the only new fetch (model bytes, wasm/loader cache warm, byte progress).
- src/lib/face/landmarker.ts:30-60 — telemetry detach; glue log silencing (`Module` print hooks); `toMeasure`.
- src/lib/face/guard.ts:1-51, types.ts:1-50 — attempt flag / deviceMemory guard; FaceMeasure type.
- src/tools/id-photo/entry.ts:1-47 — lazy controller load on first interaction, pending-file hand-off, engine panel.
- src/tools/id-photo/controller.ts:1-694 — state machine, stage drawing, checklist, save and done.
- src/tools/id-photo/{autoframe,model,stage,overlay,limits}.ts — MediaPipe run (skip, 60 s timeout), save reducer, input, guide overlay, limits.
- src/pages/id-photo/index.astro:1-229 — page copy, notices, FAQ with links, cannot-check list.
- src/data/tools.ts — id-photo live (+FAQ `links`); photo-compress FAQ 3 links to /id-photo/; src/pages/photo-compress/index.astro renders FAQ links.
- src/styles/app.css:341-376 — id-photo styles (grid `minmax(0, 1fr)` fixes a 1 px overflow at 360 px).
- src/pages/licenses/index.astro:11-40 — `sameAs` for deduped license files. src/lib/ui/beacon.ts — `id-photo` tool id.
- astro.config.mjs:10-40 — `__ID_PHOTO_AUTOFRAME__` define; `manualChunks: ui-shared`.
- scripts/lib/autoframe.mjs — the flag and its default. scripts/copy-vendor.mjs:62-100 — MediaPipe copy, model SHA check, mediapipe.json.
- scripts/check-licenses.mjs:1-120 — compiled-in components, EXCEPTIONS, `WITH` handling. scripts/gen-licenses.mjs — flag-aware, dedupe.
- scripts/check-dist.mjs:73-125 — Step 4 budgets, no-MediaPipe assertion, test-input and preset-age checks.
- scripts/gen-sw.mjs:30-40 — /licenses/ not precached. scripts/gen-ui-font.mjs:23-50 — comments stripped before subsetting.
- scripts/regress/idphoto.mjs, idphoto-harness/ — regress:idphoto. scripts/qa/visual.mjs — id-photo pages and states.
- licenses.manifest.json, licenses/third-party/* (+ SOURCES.md) — MediaPipe, model and wasm component entries and texts.
- vendor-assets/mediapipe/{face_landmarker.task,SHA256SUMS}, .gitattributes — pinned model.
- tests/corpus/id-photo/ (12 PD portraits, truth.json, SOURCES.md; 2.08 MB) and tests/fixtures/build-photo.mjs (lowres, two_faces, scene_noface generators).
- tests: e2e/id-photo.spec.ts (new); site/polish specs (4 live tools, sitemap, menu Tab count); unit idphoto-*.test.ts and check-licenses.test.ts (new); network-guard (exact allowlist); postbuild (dpi only on /id-photo/, live-tool meta, check-dist env follows the build, /licenses/ not precached).
- docs/COPY.md — photo dpi and 정수리 rules. lighthouserc.json (+ /id-photo/), tsconfig.json (exclude dist-noauto), vitest.config.ts (define), package.json (dep + regress:idphoto), .gitignore (dist-noauto/).

## Open Questions
- Flags 1–4 above (Arch decisions).
- Offline first use of /id-photo/: the lazily loaded controller is runtime-cached, not precached, so a first visit while offline shows the engine panel (offline copy). Acceptable?
- UI font headroom is ~1 KB again after stripping comments; the next tool's copy will need a budget decision.
- Reproduce the gates: build `PUBLIC_ID_PHOTO_AUTOFRAME=0 npm run prebuild && npx astro build --outDir dist-noauto` first (the kill-switch e2e serves it), then `PUBLIC_ID_PHOTO_AUTOFRAME=1 npm run build`.

## Out of Scope (logged in BUILD-LOG)
- Calibration refit (neutral heads), print sheets, camera capture, PNG output, batch, MediaPipe in a worker, dropped presets.
- Emscripten runtime inventory inside the existing qpdf/MozJPEG wasm.
- Real iPhone and Gate 11 checks.

---

# Round 2 (Richard's feedback + Arch decisions), 2026-09-30
Ready for Review: YES. Status: DONE_WITH_CONCERNS. The license Flag and p07 are unchanged; everything else is fixed. Nothing committed.

## Must Fix — manual-only copy
- src/pages/id-photo/index.astro:34-38, :85, :114, :182 — the lead, 사용 방법 2, the reset label and the skip button depend on `__ID_PHOTO_AUTOFRAME__`. In a manual build the lead and step 2 use Richard's wording (accepted by Arch), the reset button reads "처음 위치로", and the skip button is not rendered. The controller treats `#idp-skip` as optional.
- src/data/tools.ts:160-163 — FAQ 2 drops the "얼굴 위치 자동 맞춤은 추정값이어서" clause in a manual build. There is no FAQPage JSON-LD on this site (jsonld.ts emits WebApplication and BreadcrumbList only), so the FAQ HTML was the only place.
- scripts/check-dist.mjs:19, :84-86 — a build with the flag off fails if /id-photo/ contains any of "자동으로 잡아", "자동으로 맞춘", "자동 맞춤", "건너뛰고 직접 맞추기" or "6 MB의 프로그램".
  - Negative check: running check-dist with the flag off against the flag-1 dist reports all three copy phrases.
  - The unit test in postbuild.test.ts follows the build: the phrases are present only when dist has MediaPipe.
  - e2e (SEO test): the manual project asserts the exact manual copy and the absence of every phrase.

## Should Fix
- src/tools/id-photo/autoframe.ts:58-66 — `clearAttempt` on the early return after a skip or timeout during init. New tests/unit/idphoto-autoframe.test.ts covers skip and timeout with a late init, plus success. It fails without the fix (2/3) and passes with it (3/3).
- scripts/regress/idphoto.mjs:36-38 — PSNR floor 37.0 dB on Firefox, 38.0 dB elsewhere (Arch). Firefox now 10/11: check 6 PASS at a 37.50 dB minimum; only p07 remains.
- src/styles/app.css (`.save-name`, and `.meta .name, .ph-meta .name`) — `font-feature-settings: "calt" 0`, so "413x531" is no longer drawn as "413×531". This applies to every tool's saved-name line and the file rows of merge and photo-compress.
- scripts/gen-sw.mjs:47-56 — a controller chunk that a page entry imports lazily is precached with its static imports. For /id-photo/ that is the controller chunk and sniff. Precache is now 330.1 KB (flag 1) / 327.5 KB (flag 0) of 450; the unit test asserts the controller chunk is in it.

## Arch decisions
- UI font budget raised to 190 KB (check-dist:127-133, logged). Current use: 179.1 KB (flag 1) / 178.0 KB (flag 0).
- New Playwright project `manual-chromium` (playwright.config.ts): it runs tests/e2e/id-photo.spec.ts against dist-noauto (second webServer on port 4181). Both are added only when dist-noauto/ exists.
  - The manual flow runs end to end: happy path, every preset and custom, invalid custom, adjust keys/buttons/drag, outside, lowres, MozJPEG fallback, lazy controller and engine panel, background warning, bad inputs, orientation, notices, keyboard-only, axe, SEO and copy.
  - Tests that need the face model skip with the stated reason.
  - Every test in the manual project also asserts that no MediaPipe request was made.

## Gates (round 2)
| Gate | Result |
|---|---|
| check | 0 / 0 / 0 |
| unit | 397/397 (19 files) |
| build, flag 0 (dist-noauto) | check-dist `--no-mediapipe` OK; phrase check OK; fonts 178.0/190; precache 327.5/450 |
| build, flag 1 (dist) | check-dist OK; fonts 179.1/190; precache 330.1/450 |
| licenses | flag 0 OK (26 packages, 3 components, 0 exceptions); flag 1 FAIL on fft2d only (Flag 2, unchanged) |
| e2e id-photo, 5 projects + manual-chromium | 151 passed / 1 failed / 40 skipped. The failure was manual-chromium keyboard-only: the test pressed ArrowUp at the manual start, which has no margin, so the outside block disabled save. The test now presses Home in manual mode, and manual-chromium re-ran at 18 passed / 14 skipped / 0 failed |
| regress:idphoto | Chromium (committed + full-res) 13/14; Firefox 10/11 (PSNR min 37.50 ≥ 37.0 PASS). The only miss is still p07 chin (Flag 4) |
