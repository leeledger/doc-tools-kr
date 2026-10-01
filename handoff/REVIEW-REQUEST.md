# Review Request — G2 Sprint A, A0 /hwp-viewer/
Date: 2026-10-01
Ready for Review: YES

**Tree:** branch cloud-handoff. Commits: V0 d109a7f (LCP), V1 241a438 (refactor, behaviour-free) and the V2 commit after them. Nothing is pushed.

**Status:** DONE_WITH_CONCERNS. Every gate passes except Lighthouse, which on this PC lands at about 1,953 or 2,040 ms per run on every tool page, untouched ones included.
- /hwp-viewer/ and /hwp-to-pdf/ medians are 1,951–1,959 ms in 3 of 3 targeted runs.
- In the full 14-URL run, /hwp-viewer/ got 2,040 ms, as did id-photo, pdf-compress and photo-compress. At f6b40a6, /pdf-merge/ failed 4 of 4.

The full numbers, decisions and sources are in BUILD-LOG, "A0 /hwp-viewer/ build notes".

## Files Changed
- **V0** (d109a7f) `src/pages/hwp-to-pdf/index.astro` — hwp.css is inlined (`?inline` + `<style is:inline>`). The page script is now boot.
- **V0** `src/tools/hwp-shared/boot.ts` (whole file) — imports the controller after first paint + idle, or at the first interaction. A file picked or dropped early is handed over; picker prefetch still works; a failed load shows the engine panel. Test: `tests/unit/hwp-boot.test.ts`.
- **V0** `astro.config.mjs:38-40` — boot.ts goes in the ui-shared chunk, so there is no extra request before paint.
- **V1** (241a438) `src/tools/hwp-to-pdf/*` → `src/tools/hwp-shared/*` (git mv). controller.ts became `session.ts`; `src/tools/hwp-to-pdf/controller.ts` is a thin wrapper. Each moved file got the HANCOM_NOTICE first line. Test: `tests/unit/hwp-notice.test.ts`.
- `src/tools/hwp-shared/session.ts` — the `OpenDocument` and `HwpHooks` types, `requestText`/`onText` with their own waiters (released in `releaseWaiters`), the hook calls (clearDocument, onParsed, open, onmessage), and `#hw-note` made optional.
- `src/tools/hwp-shared/viewer.ts` — the `zoomable` fixed page box, `onRendered`/`onCleared`, `pageElement()`, and destroy() no longer fires onCleared.
- `src/lib/hwp/hwp.worker.ts` — the `{type:'text', i}` request: render, `glyphText`, drop the SVG.
- `src/lib/hwp/svg-string.ts` — `glyphText` (entity decode, inner tags dropped).
- `src/tools/hwp-viewer/{app,ui,zoom,search,select,thumbs,copy}.ts` and `viewer.css` (all new) — the controller, the controls, the pure zoom/search/copy helpers, and the page list.
- `src/pages/hwp-viewer/index.astro` (new) — markup, legal lines, FAQ, QuickLinks and RelatedTools.
- `src/tools/hwp-shared/hwp.css` (last 2 lines) — keeps the picker and messages narrow in the wide viewer box.
- `src/data/tools.ts` — the `hwp-viewer` entry.
- `src/data/og.json` — the viewer image and page; the home og description shortened.
- `src/data/site.ts:21` — defaultDescription shortened (6 names; still 80–120 characters).
- `src/data/tool-facts.ts` — HWP facts.
- `src/data/guides.ts` — NEXT_GUIDES for hwp-viewer.
- `src/pages/hwp-to-pdf/index.astro` — RelatedTools adds hwp-viewer.
- `src/content/guides/open-hwp-without-hangul.md` (renamed from the hwp-viewer draft, published), `hwp-on-phone.md`, `what-is-hwpx.md` — the three new guides.
- `scripts/check-dist.mjs` (block before `count(rhwp_bg…)`) — viewer budgets.
- `lighthouserc.json`, `scripts/qa/visual.mjs` — the viewer page and states.
- `scripts/regress/hwp-viewer.mjs`, `package.json` — `regress:hwp-viewer`.
- `docs/COPY.md:8` — the 해요체 exception for the two brief-fixed lines.
- Tests:
  - `tests/e2e/hwp-viewer.spec.ts` (new, 23 tests);
  - `tests/unit/hwp-viewer.test.ts` (new: zoom, search, copy join, list window, glyphText, legal dist scan);
  - expectations extended in `tests/e2e/{site,polish,id-photo,hwp-to-pdf}.spec.ts` and `tests/unit/postbuild.test.ts`.

## Gates (all with PUBLIC_SITE_URL=https://docttak.com)
- check: 0 errors.
- unit: 669/669.
- Both builds pass check-dist. UI fonts 184.8 / 190 KB (A0 +0.0). Precache 419.1 / 450 KB. Export chunk 345.1 / 360 KB. Viewer initial JS +0.0 / 4 KB over the converter.
- licenses OK.
- e2e: 976 passed, 0 failed, 5 Firefox flaky in untouched specs, 172 skipped.
- regress:hwp full corpus: 120/120, all rules pass.
- **regress:hwp-viewer full corpus: 120/120; 2,280 of 2,280 pages drawn; page counts equal the converter's on every file.**
- qa:visual: 0 hard failures.
- source-watch: 47/47 quotes found verbatim.

## Open Questions
- **Lighthouse noise (above).** Please judge it against the f6b40a6 numbers. The site-wide lever is the 700 UI face (49 KB), which every .btn and summary requests before first paint.
- **Search text comes from the rendered SVG, not getPageTextLayout** (the layout misses text on 116 of 236 fixture pages). The cost is one worker render per page, limited to 100 pages and cancellable. Is that the right trade-off?
- **Copy is answered by the page** (select.ts) because browsers copy one glyph per line from rhwp's per-glyph `<text>`. Line and space heuristics: new baseline > 0.5 em; gap > 1.5 em.
- **hwp-on-phone has no Kakao or Samsung source** (tried[] in BUILD-LOG). The Kakao FAQ says so plainly.
- **Mini previews use `<svg><use>`** of the on-screen page drawing. The e2e pixel check passes on all 5 projects.
- The viewer spec runs with `reducedMotion: 'reduce'`. The site's smooth scroll raced Playwright's scroll-into-view on Firefox, and a click got lost.

## Out of Scope (logged in BUILD-LOG Known Gaps)
- The 404 map and ops `suggestTool` do not suggest /hwp-viewer/ yet.
- The hwp-to-pdf FAQ "HWP 뷰어로만" has no link to /hwp-viewer/ (the template does not render FAQ links).
- The `topic` schema field (A1).
- Owner real-device checks (iPhone Safari, KakaoTalk in-app).
- Post-deploy Kakao / Naver / GSC steps.
