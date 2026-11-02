# Review Request — QR1031 (QR코드 색 바꾸기 + 로고·사진 넣기)
Date: 2026-10-31
Ready for Review: YES
Status: DONE (one deliberate raise of D3 and two structural deviations from D7/D9 wording, all logged in BUILD-LOG
「QR1031 build」; please confirm).

## Files Changed
- src/lib/qr/encode.ts:5-7,12-13,18-22,47-56 — `encodeQr(text, opts?)` with `{ ecc: 'M'|'H', minVersion }`, QR_MAX_BYTES_H 1273; no-arg call is the old code path.
- src/lib/qr/style.ts (new) — parseHex (only #rrggbb), rgb, WCAG luminance/contrastRatio, scanLuma, checkColors (inverted / low: < 3:1 OR luma share > 0.45), MIN_CONTRAST 3, SCAN_LUMA_SHARE 0.45, LOGO_MIN_VERSION 5.
- src/lib/qr/styled.ts (new) — colorSvg / colorRgba on top of the unchanged qrSvg / qrRgba; black on white returns the plain output itself.
- src/lib/qr/logo-render.ts (new) — logoPlate (largest odd <= 22 %), logoSvg (plate rect + one `<image href="data:image/png;base64,…">`, only a base64 PNG gets in), plateRgba, logoPng (contain-fit drawImage, smoothing on).
- src/lib/qr/render.ts:3-4,60-76 — only split: qrPng = rgbaPng(qrRgba(...)); rgbaPng(img, draw?) exported. Bytes unchanged (identity unit test vs main sha256).
- src/pages/qr-code/index.astro:6-7,116-132 — closed `<details id="qr-style">` after .qr-actions: QR 색 / 배경 색 color inputs (#000000 / #ffffff), 검은색·흰색으로, file input without name + 로고·사진 고르기 label, 로고 빼기 (hidden), error slots qr-color-error / qr-logo-error.
- src/tools/qr-code/qr-code.css:28-38 — panel styles, 48 px targets.
- src/tools/qr-code/controller.ts:6-10,14,38-42,85-107,185-204,226-236,256,265-270,279,297-342 — glue only: loadStyler (lazy ./logo, retried after a failure), styled(), checkStyle() (red line + aria-invalid; styled but chunk missing → colorsOk false + load + redraw), H encode with a picture, the over line, ready() blocks + opens + focuses QR 색, reset, picture pick/remove with a pick counter, a file picked before the controller loaded.
- src/tools/qr-code/logo.ts (new, lazy chunk) — colorProblem + messages, styledSvg / styledPng, LOGO_ENCODE, LOGO_OVER, readLogo (pdf-sign decode path, <= 512 px, PNG data URL + canvas in memory), LogoError.
- scripts/check-dist.mjs:40-41,1138-1140,1163-1175 — QR_LOGO_KB 9.9; logo chunk imported dynamically by the controller, not initial, not in the controller closure, names image/png, no storage/URL/beacon/XHR/fetch; #qr-style without open; color defaults; file input without name.
- tests/unit/qr-style.test.ts (new, 14 tests) — identity vs main sha256 (6 payloads: modules, SVG, RGBA), WCAG math, ok/low/inverted, the luma rule with #949494 proof, boundary pairs at 4/8/41 px with and without logo, 60 random allowed pairs, bad hex, H cap, v5, plate geometry v5–v40, sweep v5…v40 with a checker plate, v40-H full, one `<image>`.
- tests/e2e/qr-code.spec.ts:9-10,208-398 — Build Order 8 a–f + the logo chunk aborted (offline) case; every test on the no-upload fixture.
- src/data/tools.ts:881,886,904-912,918 — description, updated, FAQ +2, keywords +4.
- src/content/tool-notes/qr-code.md:56 — line rewritten to the new truth.
- src/content/guides/qr-code.md:8,43-54,193-201,206 — updated, 3 qrcode.com error_correction sources (2026-10-31), new 「색과 로고를 넣을 때」, bullet rewritten.
- docs/COPY.md:85 — qr-code line extended (배경 색, no 30%).
- handoff/sources/qr1031/*.txt — qrcode.com ko+en error_correction, W3C SC 1.4.11 + WCAG 2.2 definitions, uqr 0.1.3 d.ts (sha256 headers).

## Gates
- npm run check: 0 errors, 0 warnings (12 hints, as on main).
- npm test: 113 files, 2411 / 2414 green in the full run; the 3 reds are timeouts of check-dist-spawning tests (ga.test GA-off, postbuild invalid contact email, postbuild usage-statistics 120 s for 8 check-dist runs). check-dist takes 30 s here for main's script and this branch's alike on the same dist (machine load; a parallel sprint). Re-run alone: ga.test + postbuild 105 / 106 with --testTimeout; the usage test (fixed 120 s) passed in 259 s with its timeout raised locally only (reverted) — see BUILD-LOG.
- PUBLIC_SITE_URL=https://docttak.com npm run build + check-dist OK (2685 files); precache 397.3 / 450 KB (unchanged). Production flags (ci.yml) build + check-dist OK, precache 405.0 / 450.
- Budgets: qr initial 9.1 / 10.7 (prod) of 12.9; qr controller 9.0 / 9.2 (main 8.1); logo chunk 8.2 → QR_LOGO_KB 9.9; business-card controller 9.4 / 11.1; fonts preloaded 92.1 / 92.66, late 7.5 / 7.9 of 8; glyphs 0 new core, 0 new late.
- e2e (E2E_PORT=4273) qr-code.spec + business-card.spec, chromium + webkit: 54 / 54 (4 webkit flaky on the first run under load, green on retry; webkit re-run with --retries=0: 27 / 27). polish.spec + site.spec chromium: 187 passed, 1 skipped. axe clean in c, d, f.
- jsQR matrix: unit sweep and boundary tests above.

## Open Questions
- D3: 3:1 alone fails jsQR at the PNG's module sizes. I raised it with a second rule (QR color luma <= 0.45 × background luma, the binarizer's 0.5 cliff minus room) instead of raising the WCAG ratio to ~5:1, which would block red on white. Please confirm the choice (BUILD-LOG has the numbers).
- D5/D9: the whole panel code (colors too) is in the lazy logo chunk, and styling is applied on top of the unchanged renderers (new names instead of an optional style parameter). Reason and the rolldown export-chunk trap are in BUILD-LOG.
- D7: plate coverage is 3.4–4.8 %, not <= 4.4 % (brief arithmetic); geometry otherwise as specified.
- Copy: 「배경 색」 instead of 「바탕 색」 (탕 not in the UI font). The two color messages are my wording.

## Out of Scope (logged in BUILD-LOG)
- xlink:href for old SVG editors; iPhone scanner not measured (owner O1); brief Known Gaps (transparent background, module styles, size slider, /business-card/ logo, usage fields, remembering, /en/).
- Environment: the root node_modules was empty and broke every worktree build (rolldown resolves the root tsconfig); restored with `npm ci` in the root.
