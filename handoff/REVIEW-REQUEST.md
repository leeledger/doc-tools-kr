# Review Request — Step 5, round 3 (Richard's six Should Fix items)
Date: 2026-09-30
Ready for Review: YES
Branch `step5` (worktree `C:\dev\doc-tools-kr-step5`), local commits only. Status: DONE.

## Round 3 changes
1. **Sanitizer allow-list** (`src/lib/hwp/svg-dom.ts`): removes every non-SVG-namespace element, plus script, style, foreignObject, iframe, meta, link, form, object, embed and the animation elements; drops every on* attribute; allows href only as `#fragment` or `data:image/*` on `<image>`; drops style attributes with a non-fragment url(). New jsdom tests: XHTML meta refresh, SVG and XHTML `<style>`, XHTML `<form>` and `<link>`, style url(). Corpus: 0 sanitizer removals on all 120 files (so the wasm's style literal never reaches a page SVG).
2. **hwp-inflight** set again at the start of a forced full render, cleared when save enables, on cancel/reset/error (`controller.ts` fullRender, cancel). e2e: the storage log after 그래도 PDF로 저장 is `set` (from viewer-first) … `remove`, and the key is gone.
3. **Zip bomb** (`inflate.ts`, `zipdir.ts streamEntry`, `features.ts RecordWalker/ByteCounter`): inflated data is walked chunk by chunk and never held; one running cap per file, `LIMITS.inflateCap` = 512 MB desktop, 128 MB phone (Arch), passed to the worker. Unit tests: split-point invariance for the byte matcher, byte-at-a-time record walk, a 150 MB section passes the desktop cap and fails the phone cap. **Richard's zip bomb re-run** (613 KB HWPX → 637 MB section.xml): corrupt; peak RSS **+51 MB** (60 → 111 MB, `process.resourceUsage().maxRSS`), 4.2 s with the desktop cap, 1.0 s with the phone cap. Was +591 MB.
4. **Print gate:** `hwp-printable` only once PDF로 저장 is enabled; before that `hwp-preparing` prints "문서를 준비하는 중입니다. 「PDF로 저장」 버튼이 켜진 뒤 다시 인쇄해 주세요". e2e: a class log shows no moment where the document is printable while save is disabled.
5. **그래도 PDF로 저장** is `btn ghost` (secondary); e2e asserts it.
6. **Title swap cleanup** (`print.ts`): afterprint, or visibilitychange back to visible after print() returned, or a 60 s timeout ends the swap; a second save ends a pending swap first so the original title is kept. 4 jsdom tests.
- `--fixtures-only` now reports "Guard parity: fixture subset match (4 guard-routed of 10 fixtures; the full check needs CORPUS_DIR)" and checks parity on the subset.
- REVIEW-FEEDBACK.md (Richard's round 2) is committed with this round.

## Gates (round 3)
| Gate | Result |
|---|---|
| check | 0 errors, 0 warnings (1 hint) |
| unit | 511/511, 26 files |
| build 1: dist-noauto (flag off) + postbuild | check-dist OK, 1210 files; precache 366.8 / 450 KB |
| build 2: npm run build | check-dist OK; /hwp-to-pdf/ initial JS 9.9 KB, worker 20.9 KB, lazy chunk 4.6 KB, HWP font CSS 30.3 / 31 KB, UI fonts 184.0 / 190 KB |
| check:licenses | OK, 31 packages, 4 components (flag off) |
| e2e hwp-to-pdf.spec, 5 projects (E2E_PORT=4392) | 98 passed, 27 skipped (stated reasons), 0 failed, 0 flaky |
| e2e site.spec, chromium | 41 passed |
| regress:hwp fixtures | 10/10, all rules pass |
| regress:hwp full corpus | all rules pass; 6/120 (5.0 %), non-routed 2/100 (2.0 %, adm06 nt08); guard parity exact; cap-routed adm16 (pages), kr01 (images); size median 1.19, kr21 2.36×, kr38 1.79×, kr45 1.37×; sanitizer 0, measure 0, unparsed 0; law10 2.1 s, adm28 4.4 s. Flagged only: kr17 3.2 s, kr18 1.7 s (> 2 × baseline, not failures) |

---

# Round 2 (for reference): Arch decisions + merge with Step 4
Date: 2026-09-30
Ready for Review: YES
Worktree: `C:\dev\doc-tools-kr-step5`, branch `step5`. main (ee507ab, Step 4) merged in as 909256f; tip f558825 (plus this file). Local commits only, never pushed.
Status: DONE. Every gate is green on the merged tree; the only open items are Step 4's own known misses (check:licenses with auto-framing ON fails on fft2d; regress:idphoto p07 landmark miss), unchanged from main.

## Round 2: Arch decisions (logged in BUILD-LOG "Step 5 decisions, round 2")
- **F1 accepted.** regress rule 2 now requires the routed set = the 19 guard keys + every cap-routed file, each listed with its reason. Full corpus: guard parity exact; cap-routed (desktop): adm16 (pages 411 > 300; also guard-routed) and kr01 (images 66,512,643 > 60,000,000).
- **F2 built.** `src/lib/hwp/downscale.ts`: a PNG/BMP over 100 KB that is not oversized is re-encoded as JPEG q 0.85 at the same pixel size when it is an opaque photo, kept only if smaller. Line-art rule (my call): keep PNG when any alpha < 255, when ≤ 64 distinct colours, or when ≥ 85 % of pixels equal their left neighbour. 0.70 was tried first and kept kr38 p5 (77,936 colours, 0.745 flat) and kr36 p4 (19,655, 0.738) as PNG. Unit-tested (`isOpaquePhoto`).
  - Rule 5 now passes: kr21 2.36× (was 15.5×), kr38 1.79× (was 3.69×), kr45 1.37× (was 4.35×); median 1.19 (was 1.24); kr01 1.39 MB.
- **F3.** /licenses/ is no longer precached (arrived with main). Precache 369.0 / 450 KB (auto-framing build), 366.5 KB (dist-noauto).
- **F4 accepted.** HWP font CSS budget 31 KB, reason in check-dist.
- **New in round 2:** `preloadFacesFor()` requests every (family, weight) with its characters while the built pages are still hidden. The WebKit `fontsSettled()` loop had pushed law10 render-to-ready to 3.0–3.7 s; now 2.4 s (adm28 4.9 s).

## Merge (main → step5)
- tools.ts: both tools live (5 live, soon list empty; the home 준비 중 block is not rendered).
- e2e: site.spec (5 cards, sitemap with both pages, related tools: hwp-to-pdf shows the two PDF tools, the others show 4), polish.spec (LIVE/SOON, footer paths, the phone menu outside-click point is now below the sheet: with 5 tools the sheet reaches past y = 400), id-photo.spec related count 3 → 4.
- check-dist: both budget blocks; UI fonts 190 KB (main); HWP font CSS 31 KB. `tests/unit/postbuild.test.ts` UI-font total raised to 190 KB to match check-dist (main had left it at 180; the merged faces are 184.0 KB).
- licenses.manifest.json: main's entries + the 6 Step 5 entries; /licenses/ uses main's gen-licenses dedupe (mine removed) plus the 한글(HWP) notice section.
- playwright.config.ts: main's manual-chromium project + `E2E_PORT`. astro.config.mjs: main's `ui-shared` manualChunks + the rhwp worker plugin. network-guard allowlist: main's list + `lib/hwp/wasm-browser.ts`.
- BUILD-LOG: both sections kept (Step 4 then Step 5).

## Gates on the merged tree (actual numbers)
| Gate | Result |
|---|---|
| check | 0 errors, 0 warnings (1 hint) |
| unit | 500/500, 25 files |
| build 1: `PUBLIC_ID_PHOTO_AUTOFRAME=0 astro build --outDir dist-noauto` + postbuild on it | check-dist OK, 1210 files; precache 366.5 KB |
| build 2: `npm run build` (default, flag off) | check-dist OK; precache 366.5 KB; UI fonts 184.0 / 190 KB |
| build 3: `PUBLIC_ID_PHOTO_AUTOFRAME=1 npm run build` (dist for the auto-frame e2e) | check-dist OK, 1217 files; precache 369.0 KB; UI fonts 185.4 KB |
| check:licenses | flag off (shipping default): OK, 31 packages, 4 components. Flag on: FAIL on fft2d `LicenseRef-Ooura`, Step 4's open licence Flag, unchanged from main |
| e2e, 5 projects + manual-chromium (E2E_PORT=4392, manual 4181) | 776 passed, 6 failed, 8 flaky, 172 skipped. The 6 failures were one id-photo SEO test (related links 3 → 4 after the merge), fixed; rerun 6/6 passed. The 8 flaky are Firefox (7) and one mobile-safari merge test, all green on retry |
| Lighthouse (7 URLs, port 4393) | all assertions pass; /hwp-to-pdf/ 0.99/1/1/1, LCP 1969 ms, CLS 0.0003; /id-photo/ 0.99/1/1/1, LCP 1821 ms, CLS 0.0018 |
| regress:hwp, 120 files | all pass rules pass. all 6/120 (5.0 %, CI 2.3–10.5 %); non-routed 2/100 (2.0 %, CI 0.6–7.0 %: adm06, nt08); routed 4/20. measureCalls, sanitizer, dangling, unparsed pages all 0; screen = PDF pages on all 120. law10 2.4 s, adm28 4.9 s. Flagged (not failures): adm29 17.9 s vs 8.1, kr17 3.3 vs 1.5, kr18 1.8 vs 0.8 |
| regress:hwp fixtures | 10/10 |
| regress:merge / compress / photo | 5/5 PASS / 122/122 / 85/85 + 24/24 |
| regress:idphoto | Chromium 10/11, Firefox 10/11: the one miss is check 2 landmarks (p07 chin −1.11 mm), Step 4's known p07 miss, unchanged |
| smoke:assets (4393) | OK, 1216 URLs |
| qa:visual (4393) | 212 PNGs, 0 hard failures |

## Budget table (merged, default build)
| Asset | Size | Budget |
|---|---|---|
| `/hwp-to-pdf/` initial JS | 9.9 KB | 30 KB |
| `hwp.worker*.js` | 20.3 KB | 90 KB |
| viewer + print chunk | 4.4 KB | 25 KB |
| `rhwp_bg.wasm` | 9.48 MiB raw, one copy; brotli q5 3.0 MiB | 10.5 MB |
| HWP font CSS | 30.3 KB | 31 KB (Arch F4) |
| largest font slice / fallback | 48.3 KB / 1.9 KB raw | 250 / 60 KB |
| UI fonts total | 184.0 KB | 190 KB |
| SW precache | 366.5 KB | 450 KB |

## Files changed in round 2
- `src/lib/hwp/downscale.ts`: `isOpaquePhoto()`, same-size JPEG re-encode of opaque non-line-art PNG/BMP.
- `src/tools/hwp-to-pdf/fonts.ts`: `preloadFacesFor()`; `controller.ts` calls it before showing a built document; the harness does the same.
- `scripts/regress/hwp.mjs`: rule 2 (guard parity + cap-routed list).
- `tests/unit/hwp-tool.test.ts`: photo vs line-art tests.
- Merge resolutions listed above; `tests/e2e/{site,polish,id-photo}.spec.ts`, `tests/unit/postbuild.test.ts` for five live tools.

---

# Round 1 (for reference)

Date: 2026-09-30
Ready for Review: YES (with Flags under "Blocked")
Worktree: `C:\dev\doc-tools-kr-step5`, branch `step5` off 9c4e019 (built in parallel with Step 4 on main). Local commits only, never pushed.
Status: DONE_WITH_CONCERNS — every gate green except two regress:hwp pass-rule misses and two budget Flags (data below).

## Preparatory (brief §0)
- Baseline before any code: this branch starts at Polish P (Step 4 is not on it): unit 309/309, check 0/0/0 (BUILD-LOG, Polish P round 2).
- Network guard: `FETCH_ALLOWLIST` gains `lib/hwp/wasm-browser.ts` ("rhwp wasm, own origin"); a test asserts it is the only `fetch(` in `src/lib/hwp/`.
- `tests/unit/source-bytes.test.ts`: no C0 control byte other than TAB/LF/CR in text files under `src/`, `scripts/`, `tests/`. It caught one of my own intermediate edits (`\b` turned into 0x08), fixed before commit.

## Gates (actual numbers)
| Gate | Result |
|---|---|
| `npm run check` | 0 errors, 0 warnings, 0 hints |
| `npm test` | 411/411, 19 files (new: hwp-container 11, hwp-features 18, hwp-route 8, hwp-svg-dom 14, hwp-tool 47, source-bytes 3) |
| e2e, 5 projects (E2E_PORT=4392) | 611 passed, 2 failed, 6 flaky, 131 skipped (11.9 min). The 2 failures are Firefox photo-compress tests timing out under full-suite load (`waitForEvent`, 150 s); both pass on rerun (42 s). The 6 flaky are Firefox (the known goto race). hwp-to-pdf.spec: green on all 5 projects; every test runs the no-upload fixture and asserts 0 CSP violations. |
| axe | 0 serious/critical: empty, convert (law10), viewer-first (law17), error, viewer-only (phone, adm28), `/`, `/licenses/`. Page SVG drawings are excluded from axe (graphics inside a labelled `role="group"` per page; scanning them took minutes). |
| Lighthouse (port 4393, 3 runs, median) | `/hwp-to-pdf/` Perf 0.99, A11y 1, BP 1, SEO 1, LCP 1824 ms, CLS 0.0003. `/`, merge, compress, photo and terms all 0.99/1/1/1, LCP ≤ 1973 ms. All assertions pass. |
| `check:licenses` | OK, 30 production packages |
| check-dist | OK, 1206 files |
| SW precache | 448.0 / 450 KB (was 405.4): Flag F3 |
| UI fonts | 176.2 / 180 KB (was 169.4) |
| regress:merge | 5/5 PASS, unchanged |
| regress:compress | 122/122, unchanged |
| regress:photo | 85/85 rows, 24/24 aggregate rules, unchanged |
| regress:idphoto | not on this branch (Step 4) |
| regress:hwp, fixtures | 10/10, all rules pass |
| regress:hwp, full corpus (`CORPUS_DIR=C:\dev\doc-tools-kr\spikes\hwp\corpus`) | 120/120 convert; rules 2 and 5 missed (F1, F2) |
| smoke:assets (http://127.0.0.1:4393) | OK, 1205 URLs |
| qa:visual (http://127.0.0.1:4393) | 190 PNGs, 0 hard failures; /hwp-to-pdf/ overflow 0 at every viewport, CLS ≤ 0.00003 |

## Bundle budget (brief §4, gzip -9)
| Asset | Size | Budget |
|---|---|---|
| `/hwp-to-pdf/` initial JS | 9.7 KB | 30 KB |
| `hwp.worker*.js` (rhwp glue, scan, cfb, zipdir, fflate inflate) | 20.3 KB | 90 KB |
| Viewer, post-processing and print chunk (`lazy*.js` + its own imports) | 4.3 KB | 25 KB |
| `rhwp_bg.wasm` | 9.48 MiB raw, exactly one copy; brotli q5 3.0 MiB | 10.5 MB raw |
| HWP font CSS | **30.3 KB** | 30 KB: Flag F4 (gate set to 31 KB) |
| Largest font slice (864 slices) | 48.3 KB raw | 250 KB |
| Fallback face | 1.9 KB raw | 60 KB |
| `dist/` file count | 1206 | < 15,000 |
| Font bytes fetched for law10 (e2e, Chromium) | 0.20 MB (201,700 B) | 2.5 MB |

## regress:hwp (full corpus, Chromium 153)
| Set | n | Broken | Rate | Wilson 95 % CI | Broken keys |
|---|---|---|---|---|---|
| All | 120 | 6 | 5.0 % | 2.3–10.5 % | adm04 adm06 adm28 adm29 law17 nt08 |
| Non-routed (our TS scan + route.ts, desktop) | 100 | 2 | 2.0 % | 0.6–7.0 % | adm06 nt08 |
| Routed | 20 | 4 | 20.0 % | 8.1–41.6 % | adm04 adm28 adm29 law17 |

- Rule 1 (non-routed ≤ 5 %): PASS, 2/100.
- Rule 2 (routing parity): the 19 guard keys match exactly, **plus kr01** (F1).
- Rule 3 (fixtures): PASS. Page counts equal expected.json, recall ≥ 0.99 on the non-routed fixtures, and routing matches on both profiles.
- Rule 4: measureCalls 0 and sanitizer removals 0 on all 120. Also 0 dangling refs, 0 unparsed pages, and screen pages = PDF pages on all 120.
- Rule 5 (size): median ratio 1.24 (≤ 1.5); kr01 1.39 MB (≤ 5 MB; spike 38 MB); kr17 0.91 MB (official 0.90); adm04 15.19 MB (official 3.46, routed). **Misses: kr21 15.5×, kr38 3.7×, kr45 4.35×** (F2).
- Rule 6: law10 render-to-ready 2.3 s (≤ 3 s); adm28 6.6 s (≤ 15 s). Flagged at > 2 × baseline (not failures): adm29 16.9 s vs 8.1 s, kr17 3.3 s vs 1.5 s, kr18 1.8 s vs 0.8 s. Our "ready" includes font loading and downscale; the spike's did not include downscale.
- Mobile profile (Pixel 7, 4× CPU), ready / WASM: law09 7.8 s / 4 MiB; kr18 6.1 s / 35 MiB; kr17 13.6 s / 70 MiB; adm04 107 s / 32 MiB (81 s of it is fonts plus downscale).
- Full per-file table: `regress-out/hwp-full.md` (git-ignored).

## Blocked (Flags, with data)
- **F1 — regress rule 2, routing parity: kr01 is routed (+1 key).**
  - Its images total 66,512,643 bytes. That is over the desktop image cap of 60 MB, which the brief itself sets, so kr01 is viewer-only on desktop.
  - The guard (viewer-first) set equals the 19 spike keys exactly. The spike's 101-file expectation did not apply the caps.
  - So the non-routed set is 100 files, 2 broken.
  - Arch: accept "parity on the guard, caps on top", or change the image cap.
- **F2 — regress rule 5, size: three files.**
  - Sizes: kr21 is 4.1 MB vs 0.26 MB official; kr38 is 1.6 vs 0.45; kr45 is 1.6 vs 0.37.
  - Cause: large opaque PNG photos that are *not* oversized for 200 dpi.
    - kr21 p3 is a 1447×1087 PNG (1.8 MB) printed at 621×423 px. The target is 1294×881, which is below the 1.25× trigger.
    - kr38 p5 is 1403×1984 for a 1340×1771 target.
    - kr45 p3 is 970×595 printed at 96 dpi.
  - The brief's downscale acts only when an image is oversized, so these stay PNG. The spike PDFs were the same size (kr21 4.0 MB).
  - Proposed (not built, beyond the brief): also re-encode an opaque PNG > 100 KB as JPEG q 0.85 when the result is smaller, even if it is not oversized.
- **F3 — SW precache is at 448.0 / 450 KB.**
  - The new page and its JS and CSS add about 43 KB. Three changes kept the precache under budget:
    - byte-identical licence texts are printed once on /licenses/ (−38 KB; Apache-2.0 was printed 4 times)
    - the guidance data moved to the lazy chunk
    - three FAQ sentences were trimmed
  - The Step 4 merge adds another tool page and will cross 450 KB.
  - Arch: raise the budget, or stop precaching /licenses/ (147 KB on its own).
- **F4 — HWP font CSS is 30.3 KB gzip vs 30 KB.**
  - It has 865 faces: 4 families × 400/700 × the fontsource slices, plus the fallback.
  - The floor is the unique unicode-range lists (22.4 KB gzip).
  - Already done: faces sorted by range (143 KB → 30.3 KB), relative URLs, unquoted family names. Dropping the Cyrillic/Vietnamese slices and renaming the files would still leave about 30.1 KB.
  - The check-dist gate is set to 31 KB, with a comment pointing here. Arch decides.
- **None of the other brief Flags fired:**
  - one rhwp wasm in dist (plugin, below)
  - measureCalls 0 on every run
  - sanitizer removals 0
  - screen page count = PDF page count on all 120 files
  - all four @fontsource families have 400 and 700 with the Korean slices
  - fixtures 1.70 MB (cap 3 MB)
  - no behaviour beyond the brief

## Deviations and decisions (details in BUILD-LOG "Step 5 build notes")
- rhwp runs in a module worker in all three engines (probed first), so there is no main-thread path. The scan runs before the engine loads.
- The full render is page-driven (`render {i}`); there is no `renderAll` message. Cancel is a run token; the worker keeps the document for the lazy viewer.
- The preview is hidden while a full render builds. Font slices landing re-laid out all the text already shown (adm28: 20 s → 6.6 s). Downscale runs once the pages are shown.
- `fontsSettled()` repeats `document.fonts.ready` until `status === 'loaded'`, because WebKit started more loads after `ready`. Save is enabled after it, and print waits for it too.
- **Bug found by the harness, fixed:** `rewriteFonts` added a second `font-weight` to HEAVY faces that already had `font-weight="bold"`. XML DOMParser rejects duplicate attributes, so whole pages became placeholders (adm02 4 pages, law09 1). The value is now replaced; a unit test covers it.
- A second wasm copy was emitted from `new URL('rhwp_bg.wasm', import.meta.url)`. It is stopped by `scripts/lib/vite-rhwp.mjs`, a pre-transform that turns the pattern into a throw (init always gets the compiled module). It is registered as a worker plugin in `astro.config.mjs`.
- The wasm size constant comes from `src/generated/rhwp.json` instead of a Vite `define`.
- FAQPage JSON-LD is on this page only (the step brief overrides program §5 "no FAQPage").
- The `.hml` sniff reads 1 KB, not 64 B, because the HWPML root follows a 55-byte XML declaration. UTF-8 and UTF-16 BOMs are handled.
- ZIP64 maps to the `unsupported` code; its copy covers "this kind of HWP document", including HWPML.
- `mbDec` shows one decimal, rounded up, so a file just over a cap never reads as the cap: "10.5 MB", not "11 MB" or "10 MB".
- The regress ink baseline is re-measured with the harness's own pdf.js metric on the spike PDFs.
  - PyMuPDF scored the same PDF up to 0.09 differently, which made kr10 and law22 falsely "auto-broken".
  - Calibration: the spike's law22 PDF scores 0.706 in our metric; ours scores 0.707.
- The error beacon is not wired for this tool (its union type is also edited by Step 4; the beacon is off). Known Gap.
- `playwright.config.ts` reads `E2E_PORT` (default 4173).

## Files Changed
New:
- `src/lib/hwp/{errors,sniff,cfb,inflate,zipdir,features,limits,route,svg-string,svg-dom,downscale,engine,wasm-browser,hwp.worker}.ts`: the framework-free HWP module. The Hancom notice is in the cfb and features headers.
- `src/tools/hwp-to-pdf/{controller,messages,guidance,viewer,print,fonts,watchdog,limits,lazy}.ts` and `hwp.css`: the tool. hwp.css holds the print CSS and is imported by both the page and the harness.
- `src/pages/hwp-to-pdf/index.astro`: page, 도움말, FAQ, tool legal footer.
- Build scripts: `scripts/vendor-rhwp.mjs`, `scripts/gen-hwp-fonts.mjs`, `scripts/gen-hwp-fallback.mjs`, `scripts/fonts/anolim-hwp-fallback.woff2`, `scripts/lib/vite-rhwp.mjs`.
- Regression: `scripts/regress/hwp.mjs`, `hwp-ink.mjs`, `hwp-expected.mjs`, `hwp-baseline.json`, `hwp-harness/{index.html,harness.ts}`.
- Tests:
  - `tests/corpus/hwp/`: 10 fixtures, SOURCES.md, expected.json, features.expected.json
  - `tests/helpers/{cfb-writer,hwp}.ts`
  - `tests/unit/{hwp-container,hwp-features,hwp-route,hwp-svg-dom,hwp-tool,source-bytes}.test.ts`
  - `tests/e2e/{hwp-to-pdf.spec,hwp-fixtures}.ts`
- Licences and docs: `licenses/third-party/rhwp/{THIRD_PARTY_LICENSES.md,CRATES.md,APACHE-2.0.txt}`, `licenses/third-party/noto-sans-cjk/LICENSE`, `README.md`, `docs/HWP-ENGINE.md`.

Shared files (small, additive):
- `src/data/tools.ts:151-193`: hwp-to-pdf goes live with its name, description, 8 FAQ items and keywords.
- `src/data/jsonld.ts:30-38`: `faqJsonLd()`.
- `src/components/RelatedTools.astro:7-16`: optional `only` prop.
- `src/pages/licenses/index.astro:4,15-25,34-38,49,56`: the "한글(HWP) 문서 관련 고지" section; identical texts are printed once.
- `scripts/check-dist.mjs:6,112-133,135`: Step 5 budgets, exactly one rhwp wasm, the brotli report.
- `astro.config.mjs:5,21-22`: worker plugin.
- `package.json`: dependencies, prebuild/predev steps, `regress:hwp`. `.gitignore:17`: `public/fonts/hwp/`.
- `playwright.config.ts:3-4` (E2E_PORT); `lighthouserc.json:11` (adds /hwp-to-pdf/); `scripts/qa/visual.mjs:33` (adds the hwp page).
- `licenses.manifest.json` (6 new entries); `licenses/third-party/SOURCES.md` (Step 5 section).
- Tests that follow LIVE_TOOLS:
  - `tests/e2e/site.spec.ts`: sitemap, cards, related tools, JSON-LD loop
  - `tests/e2e/polish.spec.ts:16-17,125,223,581`: LIVE/SOON, footer list, menu tab count
  - `tests/unit/postbuild.test.ts:412-413`
  - `tests/unit/network-guard.test.ts`
  - `tests/e2e/global-setup.ts`: adds the hwp runtime fixtures
- `handoff/BUILD-LOG.md`: appended "Step 5 build notes".

## Open Questions
- F1–F4 above.
- Merging with Step 4: I expect conflicts only in these places:
  - tools.ts (both entries)
  - the site and polish e2e lists (cards 3 → 5, soon list empty) and the sitemap list
  - the check-dist budget block
  - licenses.manifest.json and BUILD-LOG
  - the precache budget (F3)

## Out of Scope (logged in BUILD-LOG)
- The brief's Out of Scope list.
- Real-device checks and Gate 11 (owner / Richard).
- Error beacon wiring.
- Recompressing PNGs that are not oversized (F2).
