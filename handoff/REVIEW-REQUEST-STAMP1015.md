# Review Request — STAMP1015 S0–S5 (Deploy A + B) + LCP fix
Date: 2026-10-16
Ready for Review: YES
Branch: stamp-1015 (base 7dd9ef6; not pushed). Brief: handoff/ARCHITECT-BRIEF-STAMP1015.md. Log: handoff/BUILD-LOG.md "STAMP1015".
S6 (guide e-stamp) not started — later round.

## Commits
- c1ce68c brief
- 348f881 S0 sign-handoff carries the source tool; /pdf-sign/ names it
- 66d8ec7 S1 pure modules (styles, layout, ink, png, limits) + unit tests
- d799c61 S2 page, controller, render, fonts, entry, registration
- 7f45afb S3 PDF에 찍기, 이미지 복사, usage (+ cloud usage spec)
- 5872920 S4 cross-links, 3 guide links, 실물 도장 affiliate block
- ad8dac4 S5 /stamp-signature/ title, description, keywords (own commit)
- 72402b9 LCP fix: static tiles, controller after the first user signal

## Files Changed
- src/lib/ui/sign-handoff.ts — SIGN_FROM_KEY, SIGN_SOURCES map + arrivedNote/arrivedInfo; storeSignPng writes both keys (rolls back on a throw); takeSignPng → {blob, from}, unknown / missing / `__proto__` → stamp-signature; sendToPdfSign(png, from, go, track).
- src/tools/pdf-sign/controller.ts (useImage + arrival block near the end) — note and info line from the map; stamp-signature wording byte-identical (its e2e unchanged).
- src/tools/stamp-maker/layout.ts:139-200 — normalize (NFC + the two kept KS X 1001 compatibility code points), badChar, scriptOf, suffixFor (corp-square rule, see questions), faceFor (Nanum → Noto for Hanja, Sans gap 隙 → Serif).
- src/tools/stamp-maker/layout.ts:261-425 — fitLine (one scale per line, stretch clamp), fitGrid, inscribed box in ellipses, onArc (closed-form non-overlap).
- src/tools/stamp-maker/layout.ts:427-530 — layoutStamp: 12 frames → draw list (unit coordinates, per-glyph region for tests).
- src/tools/stamp-maker/ink.ts — seeded 인주 질감 (alpha only reduced, deterministic). png.ts — CRC-32, pHYs after IHDR (replaces an existing one), readPhys.
- src/tools/stamp-maker/render.ts — paintStamp (1 % EDGE margin, destination-out for 사각 음각, stroke for 굵게; injectable font for Skia tests).
- src/tools/stamp-maker/fonts.ts — injects hwp-fonts CSS once, fonts.load per (face, weight) with the text, 4 s budget, `late` promise repaints when a slow load still succeeds.
- src/tools/stamp-maker/controller.ts:137-230 tiles + keyboard; :230-300 panel (late labels); :361-397 refresh (bad char, fonts, layouts, fail c=font once); :398-417 pick (start once, panel, affiliate block); :418-470 makePng (canvas / encoder / pHYs, success); :479-500 copy + PDF에 찍기.
- src/tools/stamp-maker/entry.ts — controller on focus/press in the tool, else first user signal + idle (preload.ts rules); pending tile pick; startUsage, trackOut(#sm-aff), engine fail.
- src/pages/stamp-maker/index.astro — static input, 12 static tiles, panel slot, affiliate slot, 사용 방법 / 알아 두면 좋아요 / FAQ.
- src/data/tools.ts — stamp-maker entry before stamp-signature (brief D1 copy); stamp-signature + pdf-sign `updated`; stamp-signature title/description/keywords (S5).
- scripts/check-dist.mjs:292-312 — stamp-maker block (controller lazy, no HWP font link/preload, forbidden legal strings, budget 13.6 KB).
- scripts/lib/usage.mjs — TOOLS, TOOL_LABELS, STAMP_STYLES / style setting / labels, TOOL_OUT + GUIDE_OUT stamp-maker → cp-stamp. src/data/affiliate.ts — TOOL_AFF / GUIDE_AFF / TOOL_LEAD.
- Registration: og.json, site.ts HOME_DESC_ORDER, guides.ts NEXT_GUIDES, gen-sw.mjs + sw.ts, bgcloud.mjs, lighthouserc.json, qa/visual.mjs, CLAUDE.md, docs/COPY.md.
- src/pages/stamp-signature/index.astro (lead sentence, RelatedTools), src/pages/pdf-sign/index.astro (hint, RelatedTools), guides stamp-image / e-signature-law / pdf-sign (one sentence each).
- Tests: tests/unit/stamp-maker.test.ts (27), tests/helpers/stamp-fonts.ts, tests/e2e/stamp-maker.spec.ts (11), usage.spec (2 new), pdf-sign / usage / affiliate / polish / postbuild / bgcloud / stamp-signature unit updates, site / polish e2e lists.

## Gates (2026-10-16, local Windows)
- astro check 0 errors / 0 warnings · vitest 83 files / 1,785 passed · check:licenses OK (54 packages, no new dependency) · check:quotes --exact 248 verbatim.
- check-dist OK: default (precache 424.3 KB), AUTOFRAME=1 (426.5), cloud flag-on (433.8) / 450. Initial JS /stamp-maker/ 8.9 KB (cloud 10.4) / 30; controller 11.3 / 13.6 KB (measured + 20 %); pdf-sign controller 17.5 / 18.4 (was 17.6).
- UI font: 0 new core glyphs; preloaded 94,864 B / 94,884 B tripwire (margin 20 B, unchanged).
- e2e: stamp-maker 5 projects 55 passed; stamp-maker + stamp-signature + pdf-sign 5 projects 166 passed / 4 skipped; site + growth + chain + polish chromium 185 passed / 2 skipped; usage.spec (도장 만들기, 실물 도장 block) 5 cloud projects 10 passed.
- LHCI /stamp-maker/ median of 5: perf 1, a11y 1, BP 1, SEO 1, LCP 1,667 ms, CLS 0.

## Open Questions (please judge)
1. **Flow deviation (LCP):** the brief says load + idle; that put the controller, the 474 KB font CSS and slices into Lighthouse's simulated first paint (LCP 2,148 ms median). Now: focus/press in the tool loads at once; otherwise the first user signal anywhere + idle (the site's preload.ts rule). Tiles are static HTML so the grid shows immediately (names, empty canvases) — a visitor who never scrolls/touches sees unpainted tiles. Acceptable, or should Arch choose another trade-off?
2. **Tile name 「라운드 사각」** instead of the brief's 「둥근 사각」 (둥/근 are not core glyphs and the tiles render without interaction). Same for the sample line (no 「홍」) and placeholder 「이름 또는 회사 이름」.
3. **corp-square 자동 suffix:** none when the count is a square number, else 지인 if it still fits that grid, else 인 (fills it). The brief's literal "+지인 unless the count fills the grid" gives n = 8 → 10 cells → 4×4 with 6 empty.
4. **Probe (e) differs from the brief:** NFC maps KS X 1001 郎/隸 (U+F92C/U+F9B8) to U+90CE/U+96B8, which neither Noto KR face has; normalize() keeps the compatibility code points. Noto Sans KR lacks 隙 → painted in Serif. Unit-covered over all 4,888.
5. **Grid reading of "a×b":** columns × rows (round 5-6 = 3 columns of 2; square 5-9 = 3 columns); uneven lines give the right/top lines the extra glyph and taller cells to the shorter ones (e.g. 사각 인감 붙이지 않음 홍길동 = 홍길 | 동 tall). The e2e "4th cell" check therefore checks ink in the bottom-left quarter with 자동 and that 붙이지 않음 saves different bytes.
6. **check-dist legal-string rule** uses 「법적 효력이 있습니다」 (not the brief's 「법적 효력이 있」): FAQ 2's question 「여기서 만든 도장도 법적 효력이 있나요?」 is on the page.
7. Copy register: tool-internal states are 해요체 (brief's notes), 사용 방법 / FAQ 합니다체 — written into COPY.md.

## Out of Scope (logged in BUILD-LOG / brief Known Gaps)
- S6 guide; SVG output; more faces; 결재란 tables; logos; tilt; ring symbols; deep links; English twin; /embed/.
- Word / 한글 insert size from pHYs not probed (LibreOffice honours it: 18 mm PNG placed at 17.98 mm) → owner live smoke.
- Rare Hanja outside KS X 1001 may be missing from the Noto slices (painted by the system fallback face).
- qa:visual not run (not in this round's gate list); manual screenshots 1000 px light and 360 px dark looked right.
