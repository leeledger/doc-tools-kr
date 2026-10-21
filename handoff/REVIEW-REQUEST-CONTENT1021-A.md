# Review Request — CONTENT1021 Step A
Date: 2026-10-21
Ready for Review: YES
Status: DONE (not committed; orchestrator commits)

## Files Changed

### Metrics, CLI, scaffolding (D4, D5 scaffolding)
- scripts/lib/guide-length.mjs:1-111 (rewritten). GUIDE_MIN_CHARS/TOOL_MIN_CHARS; LENGTH_PENDING (40 guides/hubs + 22 tool paths); shared `proseText`/`countChars`; `cutElements` (balanced); `toolBodyText`/`toolBodyChars` (metric T).
- scripts/guide-length.mjs:1-35 (rewritten). CLI: guides+hubs by default, `--tools` for root pages with section.tool. Prints ok / PENDING / FAIL.
- tests/unit/guide-length.test.ts:1-60. Tests the constants, metric T (nested sections, quick/related/ad/template out, FAQ in, entities, URLs), the balanced cutter, a figcaption counted while alt is not, and that no pilot or merged slug is pending.

### check-dist rules (D5.1–D5.6)
- scripts/lib/guide-check.mjs:1-220 (new, pure). MERGED_GUIDES, caps; `lengthProblems` (pending → WARN; a pending page that passes → FAIL); `elements`; `guideBody`; `imageSize` (SVG/PNG/WebP VP8/VP8L/VP8X); `figureProblems`; `duplicateImages`; `svgProblems`; `svgText`; `longBlocks`/`sharedBlocks`; `oldPathHits`.
- scripts/check-dist.mjs:27-29 (imports), 806-847. Wiring: the expected guides come from src/content (readGuides + `requires`), hubs from src/content/hubs, and tools from the tools.ts slugs (flagged tools only with their flag). Also checks stale LENGTH_PENDING keys, the image naming pattern and that merged paths have no dist file.
- scripts/ops/lib/guides.mjs:25, 50, 82-98. `requires` parsed; `readHubs`.
- scripts/ops/source-watch.mjs:11, 92. Hub quotes are now in check:quotes.
- tests/unit/guide-check.test.ts:1-233 (new). Pass and fail cases for every rule. Repo-level checks: _redirects has 8 lines and the old .md files are gone; no content file names a merged slug; image folders and names; every SVG is safe and ≤30 KB; SVG text numbers pass the guide fact check (hubs: their sources plus table-row facts); every figure is under its own slug, exists, and sits after the first H2.

### Facts, hubs, CSS, headers (D7, D3, D9)
- src/data/guide-facts.ts:8-11, 99. `원` and `세` added to Unit and UNIT.
- src/data/guide-schema.ts:40-41. presetSource/urlSource exported.
- src/data/hub-schema.ts:5, 38-39. `sources` (default []).
- src/layouts/Hub.astro:5-6, 14, 28-33. The fact check uses the hub's own sources plus the table rows; hub sources are listed first.
- tests/unit/guides-schema.test.ts:301-302, 312-327, 504-508, 516-517. The hub test allows hub sources. New tests: D3 (schema default, rejecting http, half_card) and D7 (원/세 flagged, then backed by a quote). The passport-photo-error assertions now target the survivor. Merge survivors may move `updated`.
- src/styles/guide.css:18-22. `.guide-fig`.
- public/_headers:21-22. `/img/guide/*` max-age=604800.
- tests/e2e/serve.mjs:25. `.webp` → image/webp.

### Merges (D1)
- public/_redirects:10-18. 8 lines, 301.
- Deleted: src/content/guides/{id-photo-size,id-photo-kb,passport-photo-error,pdf-merge-free}.md.
- `related` re-pointed (front matter line 13) in 21 guides and both hubs. 13 guides that pointed at id-photo-size got one short body line linking /guide/photo-sizes/ (end of body). Each line is worded differently and is under 60 characters.
- Body links: remove-background.md:75, baby-passport-photo.md:112.
- src/pages/404.astro:8 (passport-reissue-photo replaces id-photo-size); src/pages/index.astro:10 (comment); docs/GROWTH-RUNBOOK.md:54; scripts/lib/guide-titles.mjs (regenerated).
- src/content/guides/pdf-split.md:86. D5.5 collision with pdf-sign, rewritten.

### Pilots and images (D2, D6, D9)
- src/content/hubs/photo-sizes.md. Whole body. Sources: half_card and Apple. Old-query H2 「증명사진 사이즈, 제출처마다 다른 이유」. Figures 1-cm-pixel.svg and 2-limit-words.svg.
- src/content/guides/photo-kb.md. Whole file. id-photo-kb merged in under H2 「증명사진 용량 맞추기 (200·350·500 KB)」. Sources: 3 presets and 2 Apple quotes. Figures 1-compress-screen.webp and 2-kb-count.svg.
- src/content/guides/passport-reissue-photo.md. Whole file. passport-photo-error merged in under H2 「정부24 여권 사진 오류 코드별 해결」. Adds the online application order and the receiving-office rules. Figures 1-pixel-range.svg and 2-error-codes.svg.
- src/content/guides/passport-photo.md. Whole file. Re-angled to 촬영 기준 (얼굴·귀·눈·안경·옷·조명·종이·사진관 vs 직접). The file/error detail is now one line plus a link. Figures 1-framing.svg and 2-check.svg.
- src/content/guides/pdf-merge.md. pdf-merge-free merged in under H2 「맥에서 무료로 합치기」, with its 5 Apple quotes. Adds 미리 모아 두기, 캡처 금지, 합친 파일 확인, 스캔 섞기, checklist and 안 될 때. Figures 1-merge-steps.svg and 2-mac-finder.svg.
- src/content/guides/power-of-attorney.md (2 figures: 1-form-screen.webp, 2-layout.svg) and passport-english-name.md (1-syllables.svg, 2-change-flow.svg). Images only.
- public/img/guide/**: 12 SVG and 2 WebP files.
- scripts/guide-shots.mjs:1-120 (new). Deterministic screenshots of our own tools; blockAnalytics; header kept static for the clip.
- tests/e2e/hubs.spec.ts:64-80. On passport-photo, photo-sizes and photo-kb: 2 figures, lazy, naturalWidth > 0, aspect kept, same origin (no-upload fixture).
- handoff/sources/content1021/*.txt. Excerpts of the quotes fetched 2026-10-21.

## Length (prod-like dist, `node scripts/guide-length.mjs`)
| Page | Before | After |
|---|---|---|
| photo-sizes (hub) | 314 | 2,552 |
| photo-kb | <2,500 | 2,561 |
| passport-reissue-photo | <2,500 | 2,611 |
| passport-photo | <2,500 | 2,531 |
| pdf-merge | <2,500 | 2,548 |
| power-of-attorney | 2,592 (+ images) | 2,686 |
| passport-english-name | 2,930 (+ images) | 3,021 |
Every other guide, the upload-limits hub and all 22 tool pages are PENDING (WARN), as planned.

## How verified
- `npm run check`: 0 errors, 0 warnings.
- `npm test`: 94 files, 2,084/2,084.
- `PUBLIC_SITE_URL=https://docttak.com npm run build`: check-dist OK, 2,533 files, 98 WARN (pending only). Precache 431.1/450 KB (unchanged); sw.js names no img/guide.
- `npm run check:quotes`: --exact, 311 verbatim.
- `npm run check:licenses`: OK.
- e2e chromium: hubs, growth, polish, site and power-of-attorney passed 193 with 1 skipped; hubs and growth then passed 22/22 after the last SVG fix.
- guide-shots: two runs gave byte-identical WebP files.
- SVGs: rendered on a dark page in Chromium and inspected.

## Open Questions
- D5.3 also enforces "never before the first H2" (from D9) and `role="img"` + `<title>` in D5.4 (from the D9 SVG spec). Both come from the brief's D9 prose, not the D5 list; say if either should be dropped.
- Hubs cannot hold a `related` guide entry. For the 13 guides that lost id-photo-size I added a short body link to the hub (brief D3 "the hub is linked in the body"). Please check that the wording is acceptable for B1, where these pages get rewritten anyway.
- Thin margins: passport-photo 2,531 and photo-sizes 2,552.
- photo-kb's figure 1 shows the whole done state (the headline 「961 KB → 190 KB」 and the row) rather than only the list row. The caption describes what is visible.

## Out of Scope (logged in BUILD-LOG)
- serve.mjs does not model _redirects. The 301s are covered by the unit test plus the live `curl -I` after deploy.
- Not run: LHCI, qa:visual full run, the 5-project and cloud e2e matrix (postbuild.test builds its variants and passed).

## Round 2 (Should Fix 1–5, 2026-10-21)
- src/data/guide-facts.ts:8-10, 100. The 원/세 unit is not counted when the syllable starts another word (deny-list: 세로·세대·원본·원래…). A particle after the unit still counts. The blanket `(?![가-힣])` would have dropped 17세부터 and 400원이고. Unit cases are in tests/unit/guides-schema.test.ts (D7 test).
- scripts/lib/guide-check.mjs:173-174. Unquoted href and `<set>`/`<animate>` on href fail. Unit cases are in guide-check.test.ts (D5.4).
- tests/unit/guide-check.test.ts. New test: no JARGON word in any guide SVG's text.
- tests/unit/guides-schema.test.ts. Exact `updated` per slug; pdf-merge is 2026-10-21.
- src/content/guides/passport-reissue-photo.md. Step 5 is sourced with 2 menuPos=11 quotes, and the excerpt file is updated.
- Gates: check 0 errors; vitest 2,085/2,085; prod-like build + check-dist OK (precache 431.5/450); check:quotes 313 verbatim.
