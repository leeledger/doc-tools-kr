# Review Request — HWPX2HWP (/hwpx-to-hwp/ 「HWPX HWP 변환」)
Date: 2026-10-10
Ready for Review: YES
Status: DONE

Brief: handoff/ARCHITECT-BRIEF-HWPX2HWP.md (owner O4: the three spike outputs opened in 한글). Not committed. H0 (refactor
only) is the three hunks marked [H0] below; Arch can commit them first (no behaviour change, budgets within 1 %).

## Files Changed

### H0 (refactor only)
- src/tools/hwp-shared/download.ts:7-25 — [H0] `withExt(name, ext, strip = last extension)`; `pdfName` now calls it (same output, existing tests unchanged).
- src/tools/hwp-shared/boot.ts:62 — [H0] `bootHwpTool` tool union += `'hwpx-to-hwp'`.
- src/lib/ui/usage.ts:13 — [H0] `UsageTool` union += `'hwpx-to-hwp'` (needed by the boot union).

### H1 (engine)
- src/lib/hwp/export-hwp.ts (new, 105 lines) — pure export + reload gate: `exportHwpWithReport` → `contentLoss` (→ `countLosses`) → `takeBytes` → free export → `pagesIn` → free source → CFB magic + `pagesIn > 0` → `new Reload(bytes)` page count equal. Codes: export (rhwp threw), oom (RangeError / out of memory, via `classifyParseError`), unverified (gate). Always frees the source. A malformed or unreadable loss report counts as 1 loss, never 0.
- src/lib/hwp/hwp.worker.ts:7-9,13-14,21,30,71,117-126,145-146 — `{type:'export-hwp'}` after open; answers `{type:'hwp', bytes (transferred ArrayBuffer), losses, pagesIn}` or `{type:'error', code}`; `doc` typed `HwpDocument`. No second worker, no second wasm init.
- src/lib/hwp/engine.ts:38 — `openDocument` generic over the constructor's instance type (so the worker keeps `HwpDocument`); same behaviour.
- src/lib/hwp/errors.ts:12-17 — `HwpErrorCode` / `HWP_ERROR_CODES` += already-hwp, unverified, export.
- src/lib/hwp/features.ts:8-10,49,243-255 — HWPX: `META-INF/manifest.xml` streamed through two `ByteCounter`s (`:encryption-data`, `<encryption-data`); any hit → `HwpError('password')` before the engine. Also fixes /hwp-viewer/ and /hwp-to-pdf/ (they said 손상 before).
- src/tools/hwp-shared/messages.ts:33-36 — ERRORS copy for the three new codes (해요체, as the brief words them).

### H2 (page + controller)
- src/tools/hwpx-to-hwp/controller.ts (new) — light controller, not `startHwpSession`: states empty → checking → engine → converting → done | error; hardBytes → sniff (cfb/hwp3 → already-hwp + links; unsupported; else not-hwp with an HWPX line) → shared worker open → export-hwp; watchdog 90 s; run token + worker terminate on every new pick / 취소 / 다른 파일 바꾸기 / pagehide; result card with `{base}.hwp` (`withExt(name, '.hwp', /\.hwpx$/i)`), size, loss warning + 「기타 N곳」 above the button; 「HWP 내려받기」 via `triggerDownload` (blob type application/x-hwp); usage pick / start (export begins) / success (gate passed) / download / fail. Reset focuses the hidden file input (a label cannot take focus).
- src/tools/hwpx-to-hwp/copy.ts (new) — in-tool lines; `LOSS_OTHER = '기타'` (rhwp documents no loss kinds).
- src/pages/hwpx-to-hwp/index.astro (new) — mirrors /hwp-to-pdf/: hero, picker (accept .hwpx), progress + 취소, error + links (tool names from tools.ts), result card with the expectation note, Share, AdSlots, 3-step 사용 방법, 알아 두면 좋아요 (expectation note first), 도움말 (HWP 파일을 고르면 + both notices), FAQ, RelatedTools [hwp-viewer, hwp-to-pdf], legal aside; inline hwp.css as on the other HWP pages.

### H3 (registration)
- src/data/tools.ts:12,708-746 — tool entry (title 38 chars, description 62, 6 FAQ; phone/PC numbers from `HWP_LIMITS.*.hardBytes`), placed after hwp-viewer (home cards: HWP group last, newest last).
- src/data/site.ts:29 — HOME_DESC_ORDER: hwpx-to-hwp right after hwp-to-pdf.
- src/data/og.json:20,39 — image + page entries; gen-brand writes brand/og-hwpx-to-hwp.png (32.4 KB).
- src/data/guides.ts:54-55,60 — NEXT_GUIDES[hwpx-to-hwp] = [what-is-hwpx, open-hwp-without-hangul, hwp-on-phone].
- src/content/guides/what-is-hwpx.md:8,11,72-73 — `updated` 2026-10-10, `tools` += hwpx-to-hwp, the sentence + link under 「저장 형식을 바꾸는 법」.
- src/pages/hwp-viewer/index.astro:176, src/pages/hwp-to-pdf/index.astro:125 — RelatedTools gain hwpx-to-hwp.
- scripts/gen-sw.mjs:50, src/sw/sw.ts:32 — NOT_PRECACHED + RUNTIME_PAGES += /hwpx-to-hwp/.
- scripts/lib/usage.mjs:43,273,323-325 — TOOLS, TOOL_LABELS 「HWPX HWP 변환」, FAIL_LABELS already-hwp / unverified / export. No SETTINGS.
- scripts/lib/bgcloud.mjs:62 — LOCAL_SCOPE_RE += hwpx-to-hwp.
- scripts/check-dist.mjs:564-581 — /hwpx-to-hwp/: the controller (owner of #hx-loss-list) is lazy; no initial script names the worker / rhwp glue / viewer / PDF export; the controller closure never pulls lazy*/export-chunk; budget 6.5 KB (5.4 measured + 20 %).
- lighthouserc.json:20, scripts/qa/visual.mjs:41 — URL / page added.
- scripts/regress/hwp-harness/harness.ts:145-173, scripts/regress/hwp.mjs:17,341-356,491-496 — `RUN_HWP`: the production worker's open → export-hwp on every HWPX fixture; Node checks CFB magic + SHA; a gate failure or losses > 0 fail the run; one report line.
- docs/COPY.md:10 — 해요체 exception for the brief's in-tool lines and the expectation note.

### Tests
- tests/unit/hwp-export-hwp.test.ts (new) — real rhwp in Node on adm02/14/19/28 (0 losses, CFB, "HWP Document File", 1-byte RhwpHwpxOrigin stream pinned, reload pages and per-page glyph text equal to the source, SHA stable across 2 runs, source freed once); fake rhwp: page mismatch / reload throws / zero bytes / not CFB / 0 pages → unverified; reload OOM → oom; export throws → export; RangeError → oom; takeBytes throws → export; losses passed through; malformed or throwing report → 1.
- tests/unit/hwpx-to-hwp.test.ts (new) — tools.ts entry (title ≤ 40, description 40–80, no 한컴뷰어/한컴오피스, FAQ numbers from LIMITS, 6 FAQ + JSON-LD), HOME_DESC_ORDER position, NOT_PRECACHED / RUNTIME_PAGES, new error copy, loss copy, usage whitelist (every fail code passes and has a label; no setting accepted).
- tests/helpers/rhwp-node.ts (new) — rhwp in Node once per process; `passwordHwpx()` via exportHwpxWithPassword.
- tests/unit/hwp-features.test.ts — rhwp-made password HWPX and an unprefixed manifest → password; empty manifest → no error. Fails on the old features.ts (checked: `expected null to be 'password'`).
- tests/unit/hwp-download.test.ts — withExt (.hwpx, .HWPX, no ext, dotted names, .hwpx.zip, unsafe chars, empty base).
- tests/unit/{hwp-notice,postbuild,polish,bgcloud,admin-view}.test.ts — lists extended (notice dir, OG list, precache, OG image per page, RUNTIME_PAGES, HOME_DESC_ORDER pin, title keyword, LOCAL_SCOPE_RE, fail labels).
- tests/e2e/hwpx-to-hwp.spec.ts (new, 5 projects) — lazy; 4 fixtures → download → CFB + SHA equal to rhwp in Node → the downloaded .hwp re-opens in /hwp-viewer/ with the expected page count; .hwp → already-hwp + links, no worker/wasm; noise / .txt → not HWPX; password HWPX → password, no wasm; .hml → unsupported; phone 26 MB → too-large; wasm 404 → engine panel; losses 2 via a worker stub → warning + 「기타 2곳」 above the button + axe + download with equal bytes; export / unverified via stub → message + links, no button; new pick mid-run (engine held) → only the second result; regression: password HWPX on /hwp-viewer/ and /hwp-to-pdf/; 360 px; keyboard reset focus + URL revoked; axe empty/done/error; SEO/legal (title, description, H1, canonical, FAQPage 6, steps, accept, both notices twice, expectation note, related links both ways).
- tests/e2e/hwp-fixtures.ts, global-setup.ts — `makeHwpxRuntimeFixtures()` (rhwp-made password HWPX, 64 KB noise).
- tests/e2e/usage.spec.ts — cloud-*: pick, start, success, download in order; .hwp → fail already-hwp/parse; nothing about the file.
- tests/e2e/site.spec.ts, polish.spec.ts — page lists, related map, sitemap, home cards 14, LIVE names, OG names.
- tests/e2e/polish.spec.ts:667-672 — tools-menu Tab-out allows Firefox's one extra tab stop on the now-scrolling panel (see E2E below).

## Probes (the brief's Unverified claims, verbatim)
- **Encrypted-HWPX marker** (adm14 → rhwp `exportHwpxWithPassword('test1234')`): plain manifest is `<odf:manifest xmlns:odf="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"/>`; the encrypted one has, per part (header, section0, PrvText, PrvImage, settings), `<odf:file-entry full-path="Contents/header.xml" media-type="application/xml" size="203502"><odf:encryption-data checksum-type="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0#sha256-1k" checksum="…"><odf:algorithm algorithm-name="http://www.w3.org/2001/04/xmlenc#aes256-cbc" initialisation-vector="…"/><odf:key-derivation key-derivation-name="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0#pbkdf2" key-size="32" iteration-count="1024" salt="…"/>…`. mimetype stays `application/hwp+zip`. Before the fix `scanFeatures` threw nothing and `new HwpDocument` threw "유효하지 않은 파일: 비밀번호가 필요한 암호 문서입니다 (parse_document_with_password 또는 parse_hwp_with_password 로 비밀번호를 전달하세요)" → classifyParseError → corrupt. (`openWithPassword(…, 'test1234')` opens 11 pages; not used.)
- **Loss item schema:** rhwp.d.ts documents only `contentLoss(): string` — "이번 산출물의 content-loss 보고서(JSON). `takeBytes()` 뒤에도 읽을 수 있다." README: nothing. So count + 「기타」 only. (Undocumented, wasm strings only: item keys code / subject / reason / resourceId; codes binaryContentEmptied, controlOmitted, metadataReduced. Not used.)
- **application/x-hwp download on WebKit:** works (webkit + mobile-safari: download event, suggested name, SHA equal). No octet-stream fallback.
- **Timing, verify vs gate** (Node, ms; 3rd run, then all three runs as verify/gate): adm02 export 5, verify 55, gate 59 (228/130 126/92 55/59); adm14 3, 22, 27 (27/21 22/19 22/27); adm19 70, 154, 83 (153/77 148/80 154/83); adm28 23, 221, 208 (226/197 209/190 221/208). The gate costs no more than verify and checks the shipped bytes; verify stays dropped.
- **Whole flow in Chromium** (regress:hwp RUN_HWP: worker start + wasm compile + open + export + gate): adm02 486, adm14 450, adm19 725, adm28 809 ms (< 1 s).
- Optional law.go.kr probe: not run (no downloads attempted, same policy as the spike).

## Gates
- Unit (Linux WSL, after the CI checks build PUBLIC_BG_REMOVE=1): 61 files, 1,292 passed. astro check 0 errors. check:licenses OK.
- Builds (Linux, CI order), check-dist OK in all five; precache: checks (BG on) 434.9 KB, dist-noauto 431.5, dist (AUTOFRAME=1) 433.7, dist-bg 434.9, dist-bgcloud 437.8 (≤ 450, not raised). Windows default build 431.6.
- Budgets: initial JS /hwpx-to-hwp/ 8.0 KB (8.7 cloud) / 30; controller 5.4 / 6.5 KB; hwp.worker 21.7 / 90 KB. UI font: 0 new core characters (607 → 607), 0 new late (38 → 38): the faces are unchanged; no preload or weight change.
- Lighthouse (local Windows, 5 runs, default build): /hwpx-to-hwp/ LCP median 1,670 ms (1,664–1,684), perf 1.00, a11y 1.00; /hwp-to-pdf/ 1,661 ms in the same run.
- regress:hwp --fixtures-only: all pass, with the new HWPX → HWP line.
- E2E, Linux (WSL Ubuntu 24.04, CI=1, 4 workers, CI job split incl. manual-/bg-/cloud- projects, on the four Linux builds):
  chromium 410 passed / 2 failed; mobile-chrome 370 / 2 failed — both the same two polish.spec tests with the old hard-coded LIVE list (13 names), fixed;
  firefox 377 passed, 16 flaky (the known goto race and lost clicks), 1 failed: polish.spec:637 Tab-out — **root cause:** the 14th tool makes the menu
  panel scroll at 1280 × 720 (content 685 px in 642 px; with 13 tools it fit), and Firefox makes a scrollable box a tab stop, so items + 1 Tabs no longer
  leave the menu (probe: Tab 0 lands on #tools-menu itself). Test now allows that one extra stop; product unchanged;
  webkit 365 passed, 2 flaky, 2 failed (hwp-viewer zoom timeout, axe "Target crashed": the WSL WebKit load seen in the CI-fix run);
  mobile-safari 364 passed, 0 failed.
  Re-runs with the fixes: polish.spec × 5 projects 239 passed, 3 flaky (Firefox goto), 0 failed; hwp-viewer.spec webkit 1 worker, retries 0: 20 passed.
  The new spec (18 tests per project) and the usage test passed in every job. Windows, retries 0: hwpx-to-hwp.spec × 5 projects 84 passed / 6 skipped.

## Open Questions
- Loss labels: rhwp's wasm carries three loss codes, none documented, so every loss shows as 「기타」 per the brief. Map them if rhwp documents them?
- Home card order: after HWP·HWPX 파일 보기 (HWP group, newest last, as pdf-sign after pdf-split). The description follows HOME_DESC_ORDER (after HWP PDF 변환) as briefed.
- With 14 tools the desktop 도구 menu scrolls in a 720 px-high window (43 px of overflow; the CI-fix cap keeps it on screen). Works, but the last item needs a scroll there; a two-column panel would be a later design step.
- ERRORS copy for already-hwp / unverified / export is 해요체 inside a 합니다체 file (brief wording; COPY.md exception added). OK?

## Out of Scope (logged in BUILD-LOG Known Gaps)
- CLAUDE.md line 3 tool list needs the new tool (not edited by rule).
- HWP→HWPX page; viewer 「HWP로 저장」; password HWPX decrypt; 배포용 HWPX beyond open failure; RhwpHwpxOrigin kept; PrvText near-empty.
- session.ts `reset()` focuses the picker label, which cannot take focus (/hwp-to-pdf/, /hwp-viewer/); the new controller focuses the input.
- scripts/ops/opportunities.mjs still maps every hwp/hwpx query to /hwp-to-pdf/.
