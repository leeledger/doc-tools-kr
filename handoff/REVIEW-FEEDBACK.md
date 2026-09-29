# Review Feedback — Step 2 (PDF 용량 줄이기 `/pdf-compress/`, round 1b)
Date: 2026-09-29
Ready for Builder: YES

## Gates re-run by Richard
- `npm run check`: 0 errors / 0 warnings / 0 hints (77 files).
- `npm test`: 7 files, 92/92.
- `npm run build` (+ check-dist): OK; budgets identical to REVIEW-REQUEST (initial JS 6.4 / 5.8 KB, worker 255.9, qpdf.wasm 439.1, MozJPEG 120.8, resize 16.7 KB gzip).
- `npm run check:licenses`: OK, 23 production packages.
- e2e `pdf-compress.spec.ts` on chromium + firefox + webkit: 33 passed, 3 skipped (mobile-only soft-limit test), 0 flaky.
- e2e compress + site + merge on all 5 projects: 224 passed, 10 skipped, 1 flaky (mobile-safari "level switch", 60 s timeout waiting for the download under full parallel load; passed on retry).
- Manual (headless Chromium, built site on a separate port): 1280 px, 360 px (DPR 2, touch) and dark mode; ready (details open), done (gen_scan_a6 권장, 0.6 → 0.1 MB, 93 %, both previews render) and kept (gen_already_small). No horizontal overflow, no console errors or warnings, no non-GET or cross-origin request, no fallback glyphs. (Full-page shots show the sticky header mid-page; that is a capture artefact, not a layout bug.)
- regress:compress not re-run (corpus is local; it takes about 10 min). I reviewed the judging logic instead; see below.

## Must Fix
None.

## Should Fix
- src/lib/pdf/compress.worker.ts:66 (confidence: 8/10). `raster-end` does not check `raster.assembler.pages === raster.pageCount`. `pageCount` is stored and never read. The main-thread `checkResult` page-count compare (controller.ts:428) does catch a short raster output, so no partial file reaches the user today. The engine rule is "never partial" at every layer, though. Fix: throw `PdfCorruptError` in the worker when the counts differ. It is one line.
- scripts/regress/compress.mjs:147-153 (confidence: 8/10). The raster branch never judges `outPages !== pages`. For corpus rows a page mismatch surfaces indirectly: `ssimMin` becomes 0 and fails the baseline gate. For fixture raster rows (no baseline) a page-count regression passes silently, because only `!r.kept && r.reduction < 1` is checked. Fix: add an explicit page-count problem to the raster branch. Otherwise the re-baseline logic is sound and does not hide regressions. Baseline-relative SSIM (-0.005) and reduction (-3) are both applied. Kept/offered must match, and a file missing from the raster baseline fails loudly (`spike.kept` is undefined, so it counts as a mismatch). The KPMG named floor still applies.
- src/tools/pdf-compress/controller.ts:386-387 (confidence: 5/10, verify). `if (!opened || run !== runId) return;` leaves the tool in `working` with a live worker if `openPdf` returns null. That happens only when a user password is needed and none is held, which the state machine should prevent, so the path is practically unreachable. Fix: when `!opened` and the run is current, call `fail('unknown')`.
- src/tools/pdf-compress/controller.ts:507-513 (confidence: 5/10). When qpdf reports `password` (no password was given) the UI shows "비밀번호가 맞지 않습니다." even though the user never typed one. That can only happen when pdf.js opened the file without a password and qpdf refused it, which is rare. Recommendation: use `MESSAGES.password` for code `password` and keep `wrong-password` for the other case.
- src/tools/pdf-compress/controller.ts:494 (confidence: 6/10). In the kept state, focus goes to the button, and the browser scrolls so that the kept message sits right under the sticky header. In the 1280 px dark screenshot only its last line is visible. Recommendation: give the tool box a `scroll-margin-top` equal to the header height, or scroll the kept box into view before focusing. The same applies to `download.focus()` in the done state.
- src/lib/pdf/compress/qpdf-run.ts:16-27 (confidence: 6/10). The console swap is correct. I verified in the vendored glue that `console.log.bind` / `console.error.bind` run synchronously inside the non-async factory, before its only `await`. The `finally` restores both on throw. The capture closure lives only as long as the module instance and the per-run array. Nothing is posted: `qpdfFailure` only regex-tests the lines. Two cheap additions: (a) a unit test that a throwing factory leaves console.log/error restored; (b) cap `logs` (for example the first 200 lines), because a badly damaged file can make qpdf emit a warning per object.
- tests/e2e/pdf-compress.spec.ts:71 (confidence: 5/10). The "level switch" test does two full runs inside the default 60 s. It flaked once on mobile-safari under a 5-project parallel run. Recommendation: `test.slow()` for this test.

## Deviations (the 8 listed)
1. qpdf wasm through `locateFile` rather than `wasmBinary`: accepted. The build's INCOMING_MODULE_JS_API confirms it, and `/vendor/*` is immutable in `_headers`, so re-runs hit the HTTP cache. Patching the minified glue would be worse.
2. Console capture: accepted (see Should Fix note).
3. Resize initialised with a compiled module, pkg-only import: accepted. hqx and magic-kernel are not in dist; `dist/_astro` holds only the squoosh_resize wasm.
4. `password` vs `wrong-password`, and the header assert in the engine: accepted. See the UI copy note above.
5. `done` with `bytes: null` for kept: accepted.
6. Kept state offers "다른 단계로 다시 줄이기" and "처음부터": accepted (navigation only).
7. Closing the details resets to 권장 and announces it: accepted. It is a sensible guard.
8. Shared refactors (font.ts, jsonld.ts, inspect exports): accepted. Merge e2e is green on 5 projects.

## Bob's open questions
- Run-token paths: they are correct. Cancel during raster bumps `runId` and `stopWorker()` releases `pendingAck`. The loop re-checks the token after the ack and after each render, and `finally` closes the pdf.js doc. A worker error or crash calls `stopWorker` and then `fail`, which bumps the token synchronously before the awaiting continuation resumes. `finish` re-checks the token after the verify awaits, so cancel during "결과 확인 중…" wins. Stale messages are dropped by the `worker !== w || run !== runId` guard.
- `hasEncryptKey`: acceptable. It only sets the report field `ownerRestrictionRemoved`, which the UI does not read. The user-facing owner notice comes from pdf.js `getPermissions()`. A false positive (a literal /Encrypt in an uncompressed content stream) would only mislabel the report.

## Other checks (passed)
- Engine: page count is checked after normalize and after repair (one check covers both paths, engine.ts:131) and again after optimize (engine.ts:160). Kept returns the input bytes (engine.ts:163-166). Passwords are passed only when given. Log text never leaves `qpdfFailure`. Metadata is unchanged.
- Runtime text check: first, middle and last page, whitespace-stripped, normal levels only; page count for raster (check.ts, controller.ts:428).
- Lazy load and no-upload: the e2e request log is green on 5 projects. `fetch(` appears only in wasm-browser.ts (network-guard test). CSP is unchanged (script-src 'self' 'wasm-unsafe-eval', connect-src 'self'). The glue has no eval or new Function.
- Licences: /licenses/ embeds qpdf (Apache-2.0 plus NOTICE), libjpeg-turbo (LICENSE.md plus README.ijg), zlib, the qpdf-wasm ISC text, jsquash jpeg with the MozJPEG codec licence, and resize with its codec licence. SOURCES.md pins each commit. The ISC copyright line and the zlib notice (from zlib.h) are documented as Arch decisions; the zlib text is the complete zlib licence.
- Carry-overs: `reservedNameProblems` checks every record on every platform, plus raw ASCII and UTF-16BE bytes. gen-ui-font fails on any hit, and the build passed. The `withFileIndex` tests cover TypeError to unknown, corrupt kept, and OOM unchanged.
- Copy, a11y and SEO: brief copy is verbatim. Descriptions are linked with aria-describedby, and one polite live region handles announcements. The related-tools section and the merge done-state link are present. There is one H1 and the JSON-LD is shared. axe is green.

## Escalate to Architect
- Gate 11 (real Chrome, Firefox and Edge, plus a phone) could not be done from this environment: I have headless Playwright browsers only, and no Edge or phone. Everything above ran in headless Chromium, Firefox and WebKit. Arch: accept the deploy-gate live smoke in real Chrome as the Chrome part, and log real Firefox, Edge and phone as owed (same as the Step 1 Known Gap). Or hold the step until someone runs them by hand.
- Raster SSIM gate: the baseline-relative definition is defensible. An absolute floor is a product decision (Bob's question). I recommend keeping it relative.

## Cleared
Engine, worker, controller, wasm loading, licences, regress logic, UI, a11y and SEO were reviewed. All re-run gates are green. There are no blocking findings; the Should Fix items are small.

Step 2 is clear.
