# Review Request — Polish P (commercial readiness, handoff/ARCHITECT-BRIEF-POLISH.md)
Date: 2026-09-30
Ready for Review: YES (round 2; see the first section). Status: **DONE**. Nothing is committed.

## Round 2 (Richard's REVIEW-FEEDBACK and the Arch decisions; logged in BUILD-LOG "Polish P round 2")
| Gate | Result |
|---|---|
| check | 0 errors / 0 warnings / 0 hints |
| unit | **309/309** (+6) |
| build / budgets | OK. Initial JS: merge 11.8 KB, compress 12.0 KB. UI fonts 169.4 / **180** KB. Precache 405.4 / 450 KB (17 URLs, now including /offline/ and not /404.html). sw.js 1.5 KB |
| licences | OK (25) |
| e2e, 5 projects | **516 passed, 0 failed**, 4 flaky (all the Firefox `goto` race), 105 skipped (stated reasons) |
| smoke:assets vs local preview | OK, 332 URLs |
| qa:visual vs local preview | 176 PNGs, **0 hard failures** (weight probe webkit 1.73) |

### Must Fix — drag outliving a re-render
- `src/tools/pdf-merge/drag.ts`
  - The drag ends on `pointerup` (commit), and on `pointercancel`, `lostpointercapture` or `visibilitychange` to hidden (cancel).
  - It does not start at all if `setPointerCapture` throws.
  - The auto-scroll uses `behavior: 'instant'`, so no smooth-scroll step continues after release.
- `src/tools/pdf-merge/controller.ts`
  - `renderList()` is held while `dragging` is set. It re-renders once when the drag ends, or `reorder()` re-renders.
- `tests/e2e/polish.spec.ts` "a drag held near the bottom edge while inspections finish ends cleanly on release"
  - Setup: 5 PDFs, the pdf.js worker delayed 3 s, the drag held at the bottom edge for 6 s, then released.
  - After release: no placeholder, no `.dragging` row, all 5 rows inspected, scrollY stable over 1 s, and 0 drag listeners on document.
  - Runs on chromium, firefox and webkit; mobile is skipped with its reason.
  - Verified to fail with the fix removed (the placeholder stays).

### Should Fix
- **carry-assets:**
  - A download is rejected when its length differs from the manifest's. This is checked against Content-Length when it is not encoded, and against the bytes received.
  - The SHA-256 is computed on the downloaded bytes.
  - Real downloaded bytes count against the 60 MB cap.
  - The live manifest is refused above 1 MB, before parsing.
  - Unit tests: a lying manifest, the downloaded-bytes cap, and the oversize manifest.
- **Offline fallback:**
  - `/404.html` is no longer precached.
  - New `src/pages/offline/index.astro` (200, noindex, not in the sitemap) is precached and is the SW navigation fallback.
  - Unit tests: the SW falls back to /offline/ and never to a cached /404.html; the precache list includes /offline/ and not /404.html.
  - smoke:assets and axe cover the page.
- **Kill switch:** no `clients.navigate`; it deletes the caches and unregisters. A unit test asserts the text has no navigate or matchAll, and the chromium e2e still sees 0 registrations and 0 caches.
- **Beacon path:** `scripts/lib/beacon-path.mjs` accepts exactly one leading "/" and no backslash. Used by astro.config and check-dist; unit tested (`//host`, `///x`, `https://…`, relative, `/\host`).
- **Terms §9:** 7 days' notice, 30 days for 이용자에게 불리한 변경.
- **pdf.js:** a worker that failed to start is destroyed before the retry (`resetPdfJs` in `src/lib/pdf/inspect.ts`).

### Arch decisions
- **Contact:** production ships with "문의: 준비 중". `check-dist` fails when the error beacon or `ADS_ENABLED = true` is on without `PUBLIC_CONTACT_EMAIL`. A unit test covers it: the beacon without contact fails, `//host` stays off and passes. Known Gap added: the owner sets the contact and the officer's name before ads or analytics.
- **UI font budget:** 180 KB; the reason is logged in check-dist and BUILD-LOG.
- **Legal dates:** 2026-09-30.

### Files changed in round 2
- src/tools/pdf-merge/drag.ts, src/tools/pdf-merge/controller.ts
- scripts/carry-assets.mjs, scripts/gen-sw.mjs, scripts/check-dist.mjs, scripts/smoke-assets.mjs, new scripts/lib/beacon-path.mjs
- src/sw/sw.ts, new src/pages/offline/index.astro, src/pages/terms/index.astro, src/lib/pdf/inspect.ts, src/lib/ui/beacon.ts (comment), src/data/legal.ts, astro.config.mjs
- tests/unit/polish.test.ts, tests/unit/postbuild.test.ts, tests/e2e/polish.spec.ts, tests/e2e/site.spec.ts
- handoff/BUILD-LOG.md

### For the first preview deploy
- `curl -sI https://<preview>/offline/` should be a plain 200. Because /404.html is no longer precached, the redirect concern no longer affects the service worker.

## Gates
| Gate | Result |
|---|---|
| check (astro check) | 0 errors / 0 warnings / 0 hints |
| unit (vitest) | 13 files, **303/303** (was 194; +2 new files `polish.test.ts` 86, `postbuild.test.ts` 23) |
| e2e, 5 projects, no-upload fixture on every test | **508 passed, 0 failed**, 4 flaky (all the documented Firefox `goto` load-event race, green on retry), 103 skipped (every skip states its reason) |
| axe | 0 serious/critical on every page incl. /terms/, the open menu, target mode and the engine panel |
| Lighthouse (lhci, 3 runs, median) | all assertions pass — see table |
| licences | OK, 25 production packages |
| budgets (check-dist + gen-sw) | OK — see tables |
| regress:merge | 5/5 PASS (unchanged) |
| regress:compress | **122/122** |
| regress:photo | 85/85 rows, 24/24 rules (unchanged) |
| smoke:assets vs local preview | OK — 331 URLs |
| qa:visual vs local preview | **176 PNGs + static.json, 0 hard failures** |
| carry-forward dry run | green (below) |

### Lighthouse medians (mobile preset)
| URL | Perf | A11y | BP | SEO | LCP | CLS |
|---|---|---|---|---|---|---|
| / | 100 | 100 | 100 | 100 | 1.56 s | 0.0000 |
| /pdf-merge/ | 100 | 100 | 100 | 100 | 1.71 s | 0.0000 |
| /pdf-compress/ | 100 | 100 | 100 | 100 | 1.71 s | 0.0000 |
| /photo-compress/ | 100 | 100 | 100 | 100 | 1.71 s | 0.0000 |
| /terms/ | 99 | 100 | 100 | 100 | 1.82 s | 0.0000 |

### Initial JS per page (gzip -9), before → after
| Page | Before | After |
|---|---|---|
| / (shared site script: menu + SW registration) | 0 | 1.0 KB (budget 4) |
| /pdf-merge/ | 5.8 KB | 11.7 KB |
| /pdf-compress/ | 6.4 KB | 12.0 KB |
| /photo-compress/ | 12.6 KB | 15.7 KB |
| /privacy/, /terms/, /licenses/, 404 | 0 | 1.0 KB |
Engines still load only on use or after first interaction + idle (preload e2e counts requests at the server).

### Fonts and other budgets
- UI font instances (raw): 400 **40.3 KB**, 600 **42.9 KB**, 700 **43.3 KB**, 800 **43.0 KB** = **169.4 / 170 KB**; each ≤ 50; exactly 2 preloads (400, 800) on every page; font-weight lint clean.
- sw.js 1.5 KB gzip / 6; precache 404.9 KB raw / 450 (17 URLs).
- brand/og.png 22.4 KB / 150; favicon.ico 2.3 KB / 20; no `sendBeacon` in dist.

### qa:visual summary (`%TEMP%\visual-qa\2026-09-30-qa\`)
- 176 PNGs: chromium 8 pages × 5 viewports × light/dark, firefox/webkit/chrome/msedge 3 pages × d1440/m390 (all 5 browsers launched, none skipped), fold-*, 200 % zoom, 320 px reflow, merge-{d,m}-01…08 and cmp-{d,m}-01…12 states.
- Overflow 0 everywhere. Static-page CLS max 0.0002. Console errors 0. No-upload violations 0.
- Weight probe (800/400 ink): chromium 1.77, firefox 1.72, **webkit 1.73**, chrome 1.77, msedge 1.77 → the audit's WebKit symptom is gone.
- Mobile done state: 내려받기 fully in the viewport and the headline focused (cmp-m-done true).
- Slow 4G + CPU×4 (chromium CDP, no preload interaction): merge first inspect 4.1 s (audit: 6.7–8.5 s), compress first run 6.0 s.
- Informational: "targets under 24 px" lists only the 22 px checkbox/radio inputs inside ≥ 44 px labels.

### Carry-forward dry run (brief "Acceptance")
1. Built, copied dist to `first/`, served it on :4173.
2. Changed `app.css` (`.soon` margin), rebuilt with `CARRY_ASSETS=1 CARRY_FROM=http://127.0.0.1:4173` → `carry: gen 2, 314 fresh file(s), 1 carried` — the second dist holds both `Base.BfodOx4P.css` (build 1, gen 1) and `Base.BQpTR36B.css` (fresh, gen 2).
3. Served the second dist: `smoke:assets -- http://127.0.0.1:4181 --previous first/deploy-manifest.json` → **OK (332 URLs, previous gen 1 carried)**. Negative control: with the carried CSS removed, the same command fails with `Base.BfodOx4P.css HTTP 404`.
4. The edit was reverted and dist rebuilt normally.

## Reused from Step 3 (not duplicated)
- `src/lib/ui/engine-error.ts` → now the shared panel renderer; detection/retry/copy in the new `engine-load.ts`.
- Photo `formatSize` (options.ts) → moved to `src/lib/ui/format.ts` with the P.14 rule.
- `src/lib/codecs/wasm-browser.ts` `compileWasm` → throws `EngineLoadError`; the photo worker's existing `engine` code and "error before first message" rule are kept.

## Files Changed (by item)
- **P.1** new `src/lib/ui/engine-load.ts`, `src/components/EngineError.astro`, `src/data/build.ts`; `src/lib/ui/engine-error.ts` (rewritten); `src/lib/pdf/inspect.ts` (pdf.js import with retry, not cached on failure, fake-worker failure → engine, `preloadPdfJs`); `src/lib/pdf/errors.ts` (`WorkerErrorCode`); `merge.worker.ts`, `compress.worker.ts` (`engine` code, `warm`); `compress/qpdf-run.ts` (module that never starts → EngineLoadError); `compress/wasm-browser.ts` (glue import not cached on failure, `warmQpdf`); `src/lib/image/messages.ts`, `photo.worker.ts` (`warm`).
- **P.2** new `scripts/carry-assets.mjs`, `scripts/lib/dist.mjs`; `package.json` postbuild order check-dist → gen-headers → carry-assets → gen-sw.
- **P.3** new `scripts/smoke-assets.mjs`; `tests/e2e/serve.mjs` (dist/_headers path rules, types, `startServer`).
- **P.4** `src/data/site.ts` (operator, env config, `contactLine`), `src/layouts/Base.astro` footer, `src/pages/privacy/index.astro`, new `src/pages/terms/index.astro`, `src/data/legal.ts`, `sitemap.xml.ts`, `scripts/check-dist.mjs` (email check).
- **P.5/P.13/P.15/P.17 (compress)** `src/pages/pdf-compress/index.astro`, `src/tools/pdf-compress/controller.ts` (rewritten), new `src/tools/pdf-compress/target.ts`, new `src/lib/pdf/compress/target.ts`, `levels.ts` (TARGET_LADDER, floors, TARGET_SEARCH), `engine.ts`/`report.ts` (rung names), `format.ts` (formatSize).
- **P.6** `site.ts`, `src/pages/index.astro`, `src/pages/404.astro`, `docs/COPY.md`.
- **P.7** new `src/lib/ui/preload.ts` (+ `claim()`); wired in the three controllers.
- **P.9** new `src/lib/ui/menu.ts`, `src/lib/ui/site.ts`; Base.astro header.
- **P.10** new `scripts/gen-brand.mjs`, `src/pages/manifest.webmanifest.ts`; deleted `scripts/gen-og.mjs`, `public/og.png`; `.gitignore`.
- **P.11** new `src/sw/sw.ts`, `scripts/gen-sw.mjs`, `src/lib/ui/sw-register.ts`; `public/_headers`; `playwright.config.ts` (`serviceWorkers: 'block'`).
- **P.12** `scripts/gen-ui-font.mjs` (4 static instances), Base.astro preloads, check-dist font lint/budgets.
- **P.14/P.16/P.17 (merge)** `src/pages/pdf-merge/index.astro`, `src/tools/pdf-merge/controller.ts` (rewritten), new `src/tools/pdf-merge/drag.ts`, new `src/lib/ui/announce.ts`, `password.ts`, `pdf-pick.ts`; `src/lib/ui/format.ts`.
- **Photo (shared items only)** `src/pages/photo-compress/index.astro` (EngineError partial, touch hint, data-live, copy), `src/tools/photo-compress/controller.ts`, `options.ts`.
- **P.18** new `src/lib/ui/beacon.ts`, `src/env.d.ts`; `astro.config.mjs`, `vitest.config.ts` (define).
- **P.19** new `scripts/gen-headers.mjs`, `docs/DOMAIN-RUNBOOK.md`.
- **P.20** new `scripts/qa/visual.mjs`; `package.json` scripts `smoke:assets`, `qa:visual`.
- **Styles** `src/styles/global.css`, `src/styles/app.css`.
- **Tests** new `tests/unit/polish.test.ts`, `tests/unit/postbuild.test.ts`, `tests/e2e/polish.spec.ts`, `sw.spec.ts`, `preload.spec.ts`, `own-server.ts`, `tests/types/fontverter.d.ts`; updated `network-guard.test.ts`, `photo-tool.test.ts`, `site.spec.ts`, `pdf-merge.spec.ts`, `pdf-compress.spec.ts`, `photo-compress.spec.ts`, `global-setup.ts`, `tests/fixtures/build.mjs` (`makeScanMultiFixture`).
- **Other** `lighthouserc.json` (+/terms/), `licenses.manifest.json` (qpdf use line), `handoff/ARCHITECT-BRIEF.md` §3 gate 8 wording, `package.json`/lock (`@napi-rs/canvas` devDependency).

## Deviations from the brief (all logged in BUILD-LOG "Polish P build notes")
1. Precache holds the preloaded fonts 400/800 only (with all four it is 491 KB > 450).
2. P.12 e2e probe measures ink ratio (≥ 1.3), not width (≥ 3 %): Pretendard's Hangul advances differ only ~0.8 % between 400 and 800.
3. UI font instances keep only default OpenType features (needed for the 50 KB/face budget).
4. Merge thumbnail hidden at ≤ 400 px.
5. `tabindex="0"` on the two download links (Safari Tab order).
6. Network-guard allowlist: `engine-load.ts` and `sw/sw.ts` for fetch, `beacon.ts` for sendBeacon; `preload.ts` needs none (it calls no network API).
7. Photo copy: "처음부터" → "다른 사진 처리하기", "70 %" → "70%" (site-wide dist copy test).
8. `isEngineLoadFailure` also matches WebKit/Firefox fetch-failure wording.
9. The passport-photo FAQ was removed from the home page (P.0-4: it described a tool that is not live).

## Open Questions
- Arch: set `src/data/legal.ts` dates (privacy revision / terms 시행일) at the deploy gate.
- UI font budget has 0.6 KB headroom; future copy with new Hangul will need a budget or subset decision.
- Richard: please look at the drag reorder on a real touch device and at the merge row layout at 360–400 px (thumbnail hidden).
- Gate 11 (real iPhone Safari weights, a real phone for the sticky bar) is still owed.

## Out of Scope (logged in BUILD-LOG Known Gaps)
- Beacon endpoint/retention; analytics; ads/CMP; HSTS preload; IDN; per-tool OG; P2 items — per the brief.
- Playwright WebKit (Windows) offline limits: offline-copy e2e skipped on webkit/mobile-safari with the verbatim reason; SW offline e2e on webkit simulates an unreachable host.
