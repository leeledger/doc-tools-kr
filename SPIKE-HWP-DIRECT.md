# SPIKE: HWP → PDF as a direct download (no print dialog, no page swap)

Date: 2026-09-30. Branch `hwp-direct` (worktree `C:\dev\doc-tools-kr-hwpdl`, from `main` 3358fd7). Engine: @rhwp/core 0.8.6 (unchanged).

The owner's request: on 문서딱's `/hwp-to-pdf/`, pressing the PDF button downloads a `.pdf` file directly. There is no print dialog and no preview step, and the page never switches or swaps. The same rule applies to any other tool that switches or swaps the page to get its work done.

## 1. Verdict: **ship H = our own vector PDF writer (C) with a per-page raster fallback (B)**

Build the PDF in the page with **pdf-lib (already a dependency) plus a small SVG-to-PDF writer for rhwp's SVG**. Glyphs are embedded as subset Korean fonts, so the text is selectable and searchable. The file downloads through an in-page `<a download>`. There is no print dialog, no title swap and no hidden print layout. The preview stays on screen the whole time. A page the writer cannot express falls back to a 200-dpi image of that page with an invisible text layer.

It meets every quality bar on 40 files × 3 browsers (10 fixtures + 30 corpus files, 1,648 pages):

| requirement | H result (Chromium / Firefox / WebKit: the same numbers in all three; only re-encoded image sizes differ slightly) | current print path |
|---|---|---|
| success | **40/40 in each browser**, 120/120 valid PDFs (pdf.js opens and renders them; no NaN/Infinity operands) | 40/40 (Chromium only; the dialog is manual in real use) |
| text ≥ 99 % | content recall vs official PDF: **min 0.9947 (adm06, same as print), median 1.0000, 0 files < 0.99**. Vs the print output: min 0.9999 | min 0.9947 |
| no broken pages beyond print | SSIM vs print, 100 dpi: **mean 0.995, worst page 0.934** (na07 p14, a dash-leader column that is visually identical); **0 pages < 0.90**. All pages below 0.95 were inspected side by side | baseline |
| size ≤ 3× official | **median 0.84–0.91×, max 2.35× (adm11), 0 files > 3×**; 30.8 MB total vs 49.5 MB for print on the same files (C/print median 0.72) | median 1.20×, max 4.62× (adm28), 3 files > 3× |
| mobile-safe | Pixel 7 emulation, 4× CPU: law10 **12.8 s / +217 MB** vs print 19.5 s / +441 MB. The peak no longer grows with page count: adm16 (411 p) **120 s / +0.38 GB** vs print 626 s / **+4.2 GB**. Image-heavy files are still bounded by rhwp's WASM (unchanged), so the mobile caps stay | see section 3.4 |
| WebKit | works; the same PDF bytes as Chromium/Firefox apart from re-encoded images; law10 3.3 s, adm28 9.8 s | – |
| fallback pages used | **0 of 1,648** in every browser (the fallback is insurance for future rhwp output) | – |

The other candidates fail:
- **A: svg2pdf.js 2.8.1 + jsPDF 4.2.1** (still the latest; pinned fonts, simplified SVG, the same image rule). The first spike's crashes and invalid PDFs are gone: 0 crashes, 120/120 valid, once I turned single-glyph `textLength` into a scale. But it still **garbles text into mojibake** on 6 files: law08 keeps 51.6 % of its text, and whole table cells render as Latin-1 garbage (`regress-out/direct/png/law08_A.png`). It is **> 3× official on 12 files** (max 5.0×). It is also slow: adm16 takes 425 s in Chromium.
- **B: raster 200 dpi + invisible text layer.** Text is fine (min 0.9947) and it never fails, but it is **4–36× the official size (median 4.3–7.0×; 24 of 40 files > 3× in Firefox, 27 in Chromium)**. It is 9–16× slower (law10: 28 s desktop, 136 s on the mobile profile) and needs up to +5.8 GB. Hairlines go grey, and fonts inside an SVG image need a timing workaround. Not shippable as the main path; kept as the per-page fallback.

## 2. What was built and how it was measured

Everything is in `scripts/spike-hwp-direct/` (committed on `hwp-direct`):
- `harness/` is a Vite page that runs the **production** worker (`src/lib/hwp/hwp.worker.ts`: scan, rhwp, `rewriteFonts`, `scopeIds`) and the **production** per-page post-processing (`svg-dom.ts`: sanitize, ensureViewBox, dropCellClips, fitFillImages, addSpaces). It streams pages one at a time into one of:
  - `svg2pdf-a.ts`: approach A
  - `raster.ts`: B
  - `vector.ts`: C
  - H = C with B per page
  - `fontbook.ts` and `images.ts` are shared by all of them
- `run.mjs` drives Chromium/Firefox/WebKit (Playwright 1.63), saves every PDF, and records time and memory. Memory is the working-set peak of the browser's whole process tree minus its idle level, sampled every ~200 ms by `memwatch.ps1`. `--baseline` produces the **current print output** with the existing `regress:hwp` harness (production viewer + print CSS + `page.pdf`).
- `score.mjs` checks validity (pdf.js; no `NaN`/`Infinity` in any inflated content stream). It measures content recall vs the official PDF (the regress:hwp metric: Hangul/Latin/digit multiset) and vs the print output. It computes SSIM per page vs the print output (pdf.js at 100 dpi, grey, 8×8 windows, compared on the common pixel area, ≤ 40 pages per file) and the size vs official.
- `report.mjs` builds the tables. `sbs.mjs`, `pagediff.mjs` and `textdiff.mjs` are the inspection tools. `inventory.mjs` counts the SVG vocabulary rhwp emits, and `dump.mjs` dumps a page SVG. `gen-fallback-ext.mjs` builds the extended fallback faces.

Sample: the 10 fixtures (`tests/corpus/hwp`) + 30 of the 120 spike corpus files. The 30 were chosen for hard cases:
- kr01 (64 MB, image-heavy), kr17/kr18 (image-heavy)
- adm04 (151 p, filters), adm16 (411 p), adm29 (188 p, EMF pictures), adm11 (gradient), adm10 (nested SVG), adm01 (transformed text)
- law08 and kr10 (the first spike's svg2pdf losses), law19/law20 (markers)
- nt02/nt03 (HWP 3.0, 241/105 p), nt08 (overlapping tables)
- the rest spread over kr/law/adm/na

Bugs found and fixed during the spike (all carried into the spec in section 6):
1. **@cantoo/fontkit subsets WOFF2 sources into broken glyphs** (boxes or nothing). Reading the WOFF 1.0 sibling and unwrapping it to SFNT works.
2. **Text render mode leaks across `ET`.** One invisible `·` (fill-opacity 0) hid the rest of law10 page 1.
3. **30/40 files contain glyphs none of the bundled faces have** (∼ ․ ═ ･ ｢｣ ▪ …; 73,172 of them in adm16). The print path hid this through OS fonts. Fixed with four OFL fallback faces; missing glyphs are now **0** apart from Hancom private-use code points, which nothing renders.
4. The fallback CSS face declares `font-weight 100 900`, so an exact 400/700 match skipped it.
5. **EMF/WMF pictures are SVG images** with `tspan`/`dx` text. Rasterising them looked faint and shifted (adm29 p81). Drawing them as vector through the same writer matches print.
6. svg2pdf's `textLength` on a one-glyph `<text>` produces `-Infinity Tc`, which was the first spike's invalid-PDF cause.
7. SVG-as-image fonts arrive after `img.decode()`: B needed a 150 ms settle, or glyphs were missing.

## 3. Data

Machine: Windows 11, 16 cores, Playwright 1.63 (Chromium 1243, Firefox 1543, WebKit 2359 builds). The full per-file data is in `regress-out/direct/{print,desktop,mobile,mobile-print}/results.json` and `scores.json` (git-ignored; regenerate with the commands in section 7). Tables are from `report.mjs`.

### 3.1 Quality (desktop, 40 files each; WebKit B: the 10 fixtures + 1)
| browser | approach | files ok | valid PDFs | recall vs official: min / median / files < 0.99 | recall vs print: min | SSIM vs print: mean / worst page | pages < 0.90 | size ÷ official: median / max / files > 3× | total MB | fallback pages | missing glyphs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| chromium | A | 40/40 | 40/40 | 0.5162 / 1.0000 / 6 (adm04 0.984, adm19 0.958, kr17 0.972, kr36 0.974, **law08 0.516**, law17 0.969) | 0.3850 | 0.982 / 0.773 | 37 (nt02) | 2.52 / 5.02 / 12 | 60.8 | – | 27 |
| chromium | B | 40/40 | 40/40 | 0.9947 / 1.0000 / 0 | 0.9941 | 0.960 / 0.860 | 2 | **7.02 / 36.38 / 27** | 436.5 | – | 0 |
| chromium | **C** | 40/40 | 40/40 | **0.9947 / 1.0000 / 0** | **0.9999** | **0.995 / 0.934** | **0** | **0.84 / 2.35 / 0** | 30.8 | – | **0** |
| chromium | **H** | 40/40 | 40/40 | 0.9947 / 1.0000 / 0 | 0.9999 | 0.995 / 0.934 | 0 | 0.84 / 2.35 / 0 | 30.8 | **0** | 0 |
| firefox | A | 40/40 | 40/40 | 0.5162 / 1.0000 / 6 (same files) | 0.3850 | 0.982 / 0.773 | 37 (nt02) | 2.52 / 5.02 / 12 | 61.3 | – | 27 |
| firefox | B | 40/40 | 40/40 | 0.9947 / 1.0000 / 0 | 0.9941 | 0.962 / 0.865 | 2 | 5.50 / 24.95 / 24 | 304.9 | – | 0 |
| firefox | **C** | 40/40 | 40/40 | 0.9947 / 1.0000 / 0 | 0.9999 | 0.995 / 0.934 | 0 | 0.91 / 2.35 / 0 | 31.4 | – | 0 |
| firefox | **H** | 40/40 | 40/40 | 0.9947 / 1.0000 / 0 | 0.9999 | 0.995 / 0.934 | 0 | 0.91 / 2.35 / 0 | 31.4 | 0 | 0 |
| webkit | A | 40/40 | 40/40 | 0.5162 / 1.0000 / 6 (same files) | 0.3850 | 0.980 / **0.631** | 39 (kr36 nt02) | 2.46 / 5.02 / 11 | 60.3 | – | 27 |
| webkit | B | 11/11 | 11/11 | 0.9999 / 1.0000 / 0 | 0.9941 | 0.970 / 0.907 | 0 | 4.31 / 19.21 / 8 | 36.1 | – | 0 |
| webkit | **C** | 40/40 | 40/40 | 0.9947 / 1.0000 / 0 | 0.9999 | 0.995 / 0.934 | 0 | 0.89 / 2.35 / 0 | 31.0 | – | 0 |
| webkit | **H** | 40/40 | 40/40 | 0.9947 / 1.0000 / 0 | 0.9999 | 0.995 / 0.934 | 0 | 0.89 / 2.35 / 0 | 31.0 | 0 | 0 |

Notes:
- **Recall vs official** has the same minimum as the print path (adm06 0.9947: rhwp R7, nested tables overflowing), so C adds no text loss. Vs print, the only difference is 1–2 characters.
- **Before the SVG-picture fix,** C's recall vs print was 0.9941 on adm19 and 0.9978 on adm29. Those print PDFs contain invisible text that rhwp's EMF → SVG conversion places at (0,0) inside an image viewport (clipped off, but extractable). C now reproduces it.
- **SSIM** is computed on the common pixel area. Before that, a 1-px page-size difference (Chromium rounds the print page size) dragged identical pages to 0.86. With it, an identical-looking page scores ≥ 0.98. The two lowest C pages (na07 p14 0.934, na05 p7 0.946) differ only in the spacing of dash-leader glyphs (`regress-out/direct/png/na07_p14.png`).
- **A's failures are visible:** Latin-1 mojibake in table cells (law08, `regress-out/direct/png/law08_A.png`). Chromium A/B ran before the SVG-picture/tspan change, Firefox/WebKit after; the change does not touch A, and the two browsers agree.

### 3.2 Size: C vs the current print output (37 files with an official twin)
| | print (current) | C / H |
|---|---|---|
| median ÷ official | 1.20× | 0.84× |
| max ÷ official | 4.62× (adm28) | 2.35× (adm11) |
| files > 3× official | 3 (adm04 4.38×, adm11 3.39×, adm28 4.62×) | 0 |
| total, 40 files | 49.5 MB | 30.8 MB |

### 3.3 Time and memory, desktop (ms from file open to PDF bytes / MB of browser working-set peak − idle)
| browser | approach | law10 (26 p) | adm28 (128 p) | adm11 (130 p) | adm04 (151 p) | adm16 (411 p) | kr01 (64 MB src) | kr17 (22 MB src) |
|---|---|---|---|---|---|---|---|---|
| chromium | **print (current: render + page.pdf)** | 5,631 / 390 | 15,148 / 894 | 25,116 / 2,168 | 52,863 / 2,079 | 62,853 / **4,077** | 20,621 / 1,325 | 8,424 / 693 |
| chromium | A | 19,584 / 69 | 71,480 / 521 | 63,154 / 1,444 | 45,313 / 1,139 | 425,052 / 1,357 | 37,646 / 518 | 13,415 / 919 |
| chromium | B | 28,395 / 763 | 86,748 / 1,894 | 148,618 / 1,666 | 164,158 / 2,573 | 322,587 / 5,842 | 26,968 / 2,245 | 11,305 / 1,013 |
| chromium | **C** | **3,198 / 281** | **6,611 / 326** | 9,660 / 426 | 13,096 / 414 | **22,922 / 405** | 21,048 / 1,364 | 4,594 / 793 |
| chromium | **H** | 2,964 / 220 | 8,374 / 296 | 9,923 / 465 | 12,443 / 417 | 30,863 / 373 | 23,846 / 1,450 | 6,158 / 840 |
| firefox | A | 10,879 / 211 | 30,899 / 447 | 64,976 / 629 | 60,716 / 762 | 171,898 / 918 | 22,014 / 1,330 | 9,362 / 654 |
| firefox | B | 30,569 / 1,025 | 111,059 / 2,471 | 132,963 / 2,547 | 164,831 / 1,914 | 404,050 / 4,718 | 99,120 / 1,688 | 67,933 / 1,108 |
| firefox | **C** | 3,081 / 301 | 9,615 / 287 | 18,270 / 816 | 20,604 / 440 | 44,662 / 1,055 | 20,898 / 1,219 | 7,885 / 650 |
| firefox | **H** | 3,482 / 259 | 10,619 / 307 | 19,699 / 836 | 21,155 / 458 | 44,012 / 958 | 20,819 / 1,244 | 7,746 / 637 |
| webkit | A | 7,495 / 343 | 22,286 / 565 | 34,442 / 775 | 50,493 / 1,046 | 94,895 / 1,628 | 25,870 / 1,736 | 7,688 / 1,103 |
| webkit | B | 52,336 / 801 | 158,347 / 2,049 | – | – | – | – | – |
| webkit | **C** | 3,269 / 287 | 9,832 / 277 | 34,300 / 339 | 29,951 / 312 | 40,154 / 363 | 21,402 / 1,682 | 5,018 / 1,116 |
| webkit | **H** | 3,138 / 269 | 9,296 / 302 | 23,094 / 324 | 22,253 / 378 | 34,806 / 442 | 20,676 / 1,553 | 5,214 / 1,126 |

- The first Chromium C/H pass (before the SVG-picture change) was not run alongside the scorer: law10 1.9 s, adm28 5.2 s, adm16 18.9 s. The table's Chromium C/H row is the re-run, made while `score.mjs` ran alongside.
- Memory is ±150 MB noise (another process tree was busy). Where the print path is DOM-bound (long documents), C's peak does not grow with page count (adm16: 0.4 GB vs 4.1 GB). On image-heavy files (kr01, kr17, kr18) both paths are dominated by rhwp's WASM holding the decoded bitmaps (kr01: 785 MB WASM). There C is about equal to print (±20 %). The mobile caps route these files to viewer-only (6.6).
- C time split (Chromium, law10): engine/parse 0.6 s; post-processing (svg-dom) 0.75 s; writer 1.0 s; `save()` 0.06 s. On adm16: 1.8 / 7.0 / 6.9 / 0.33 s. The main thread yields after every page. The longest single block is `save()`: ≤ 0.93 s (adm29).

### 3.4 Mobile emulation (Chromium = Pixel 7 + 4× CPU throttle; WebKit = iPhone 13 profile, no CPU throttle available)
| profile | approach | law10 | law09 | kr18 | kr17 | adm28 | adm04 | adm16 | kr01 |
|---|---|---|---|---|---|---|---|---|---|
| Pixel 7 ×4 | **print (current)** | 19.5 s / 441 MB | 16.5 s / 254 MB | 9.2 s / 521 MB | 23.1 s / 769 MB | 109.7 s / 876 MB | 354.2 s / 1,839 MB | **626 s / 4,159 MB** | 43.3 s / 1,236 MB |
| Pixel 7 ×4 | **C** | **12.8 s / 217 MB** | 12.5 s / 184 MB | 9.5 s / 538 MB | 19.8 s / 823 MB | 37.2 s / 262 MB | 48.4 s / 619 MB | **119.7 s / 376 MB** | 39.8 s / 1,441 MB |
| Pixel 7 ×4 | B | 135.7 s / 727 MB | – | – | 53.2 s / 918 MB | – | 712.1 s / 2,554 MB | – | – |
| iPhone 13 | **C** | 3.7 s / 281 MB | 3.5 s / 266 MB | 3.5 s / 718 MB | 5.5 s / 1,072 MB | 10.2 s / 263 MB | 23.8 s / 423 MB | 40.9 s / 450 MB | 22.3 s / 1,680 MB |
| iPhone 13 | B | 42.8 s / 788 MB | – | – | – | – | – | – | – |

Of these files, only the text documents fit within today's mobile caps (law09, law10). For them C needs +0.18–0.22 GB, against +0.25–0.44 GB for print, and it is faster. Every other file here is over a mobile cap: kr18 is 10.8 MB, kr17 23 MB, kr01 64 MB, and adm28/adm04/adm16 are over 60 pages.
- On the long text documents, C stays ≤ 0.62 GB, where print needs 0.9–4.2 GB and 2–10 minutes.
- On the image-heavy files, both paths are bounded by rhwp's WASM holding decoded bitmaps.
- B was stopped after adm04 took 712 s; its mobile rows are enough to rule it out.

### 3.5 rhwp SVG vocabulary (inventory over the 120-file corpus, ≤ 60 pages each; `inventory.mjs`)
- `text` 761,331. Its attributes: `textLength`+`lengthAdjust` 131,670; `transform` (translate+scale, rotate) 114,589; `font-style` 11,520; `text-anchor` 1,710; `dominant-baseline` 612; `fill-opacity="0"` 1,156.
- `rect` 32,345, `g` 29,998 (clip-path 28,461, transform 1,471, filter 66), `clipPath` 28,461, `line` 14,553 (dasharray 699, markers 39), `circle` 1,156, `image` 517 (jpeg 296, png 219, svg+xml 3 in the ≤ 60-page window; more in adm29), `ellipse` 488, `path` 176 (M L C Q Z only), nested `svg` 21, `linearGradient` 3, `marker` 7.
- No `use`, `pattern`, `mask`, `foreignObject`, `polygon`/`polyline` or other filters in the top-level page SVG. The EMF/WMF pictures add `tspan`/`dx`, `polygon` and `fill-rule`.

## 4. UX-AUDIT-2 inputs (HWP), folded into the spec
| # | audit finding | decision (details in section 6) |
|---|---|---|
| 1 | Routing is too strict: law09 (20 p, a law form) is sent to "수식·도형이 많아" and loses the primary button | **Drop equations as a guard trigger** (6.6). In corpus v2, none of the 9 equation files is broken by equations. The non-routed broken rate goes 2/101 → **2/106 = 1.9 % (Wilson 0.5–6.6 %)**, ≤ 5 %. Files with equations get a soft note under the primary button. The remaining banners say what may differ and invite a look at the preview |
| 2 | First use takes 20 s on Slow 4G (5.2 s on 4G) | Fetch the wasm bytes on the picker's `pointerdown` / drop zone `dragenter` (overlapping the file dialog), start the document fonts with page 0, warm the export chunk on idle, and show a plain staged readout that says "처음 한 번만" (6.7) |
| 3 | Plain language; direct download removes all print guidance | The copy table in 6.8. The per-browser print guidance, the 「PDF로 저장」 help and the 인쇄 창 FAQ are deleted |
| 4 | Josa helper for "{name}은(는)" | Use Polish Q's `src/lib/ui/josa.ts` (`particle()` / `josa()`) for the new done line and any name/number + particle (6.4) |
| – | Brand | All HWP copy says 문서딱 (Polish Q rename; reconciled at merge) |

## 5. Other tools: page switches and swaps (audit)

Method: I grepped `src/` for `window.open`, `location.*`, `window.print`, `document.title =`, `history.*State`, `target="_blank"`, `.download =`, `createObjectURL`, `navigator.share`, `showSaveFilePicker`, `<form` and `.click()`, then read each hit.

| tool | how the result is delivered | page switch / swap / new window? |
|---|---|---|
| pdf-merge | `URL.createObjectURL(blob)` on the in-page `<a id="merge-download" download>` (`controller.ts:619-621`), which the user clicks | **none** |
| pdf-compress | the same pattern (`controller.ts:618-620`). The password `<form id="cmp-pw">` calls `preventDefault()` on submit (`:774`), so it never navigates | **none** |
| photo-compress | a per-photo `<a download>` (`:297-299`). "모두 받기" builds the zip and clicks a hidden in-page `<a download>` (`:691-697`) | **none** |
| id-photo | an in-page `<a id="idp-download">` whose `href`/`download` are set at the result (`:633-636`) | **none**. The three `target="_blank"` links in `index.astro` (외교부 source, 기준일, 온라인 여권 사진 검증) are informational links marked "(새 창)". They are not part of making the result |
| **hwp-to-pdf** | `print.ts`: swaps `document.title` to the file name, calls `window.print()` (dialog), hides the whole page except the pages with print CSS, and restores the title on `afterprint` | **yes: the only flow that swaps the page.** Replaced by this spec |

Site-wide (not a tool flow): `sw-register.ts` reloads only after the user presses 「새로고침」 on the update bar, and the bar never shows while `body[data-busy]` is set. `engine-error.ts` reloads only from its 「새로고침」 button. Both are user-initiated and keep the rule.

Small hardening item for Bob (not a violation): pdf-merge and pdf-compress reset the anchor to `href="#"` while keeping `download` (`revokeBlob`). The anchor sits inside the hidden result box, so nobody can click it. id-photo instead removes `href`, which is safer (a stray activation of `href="#" download` would save the HTML page). Do the same in merge and compress: `download.removeAttribute('href')`.

## 6. Implementation spec for Bob (Step 5b "PDF 내려받기")

The spike code is the reference: `scripts/spike-hwp-direct/harness/{vector,images,raster,fontbook,direct}.ts` and `scripts/spike-hwp-direct/woff.mjs`. Port it; do not import from `scripts/`.

### 6.1 Flow (replaces "full render → print")
```
file picked → (unchanged) sniff → worker scan/parse → route
  CONVERT       lazy viewer (the same ±2/±6 window as viewer-first; no hidden full render)
                primary [PDF 내려받기]
  VIEWER-FIRST  lazy viewer + banner + secondary [그래도 PDF 내려받기]
  VIEWER-ONLY   lazy viewer + banner, no button (caps, see 6.6)
[PDF 내려받기] → state 'exporting' (preview stays on screen and scrollable; body[data-busy]=hwp)
  import('./export-chunk')            lazy: pdf-lib + fontkit + writer (6.4 budget)
  for i in 0..n-1:                     the worker renders page i (existing {type:'render'} message)
    parsePageSvg → sanitize → ensureViewBox → dropCellClips → fitFillImages → addSpaces   (svg-dom, unchanged)
    writer.addPage(svg, w, h)          vector; per page raster fallback when the page is not expressible
    progress "PDF 만드는 중 i/n쪽" (≤ 4 Hz), yield to the event loop after each page, check AbortSignal
  pdf.save({ useObjectStreams: true }) → Blob('application/pdf')
  download: in-page <a download="{stem}.pdf" href=blob:> .click()   (no navigation, no new window)
  state back to convert/viewer-first + result line + [다시 내려받기] (same blob until reset)
[취소] during export → abort → previous state, "PDF 만들기를 취소했습니다."
```
The worker is **no longer terminated after the render**: it stays alive until reset (lazy viewer and export both need it). The print-era "free the WASM before print doubles the peak" rule is obsolete: export holds one page at a time, and the measured peak is far below print (section 3).

### 6.2 New modules
All are framework-free. Everything except `download.ts` is unit-testable in Node + jsdom (canvas paths behind injectable functions).

| file | what | from spike |
|---|---|---|
| `src/lib/hwp/pdf/woff.ts` | `woffToSfnt(u8)`: WOFF 1.0 → SFNT (zlib per table via fflate `unzlibSync`) | `woff.mjs` |
| `src/lib/hwp/pdf/faces.ts` | the face table: `{family, weight, url(.woff), ranges}` read from a build-time JSON (6.5); `parseRanges` (incl. `U+4??` wildcards); `families(chain)` (generic `serif`/`sans-serif` → Serif/Sans; a chain with none of our families → `pick(chain)` from svg-string.ts); `resolve(chain, weight, cp)`. The resolution order is: the chain's families, then Fallback, then Sans, then Serif. Within a family, use the wanted weight (≥ 600 → 700, else 400) when the family has it. **Otherwise use any face of that family** (the spike found the fallback CSS declares `font-weight:100 900`; matching "400" exactly silently skipped it) and set `synthBold`. A face counts only when its fontkit cmap has the glyph | `fontbook.ts` |
| `src/lib/hwp/pdf/font-source.ts` | the **only** new `fetch(`: same-origin GETs of `/fonts/hwp/**.woff`. Per url: fetch → `woffToSfnt` → `fontkit.create`. Cached per document. Add it to `FETCH_ALLOWLIST` in `tests/unit/network-guard.test.ts` | `fontbook.ts` load/ttfOf |
| `src/lib/hwp/pdf/svg-to-pdf.ts` | the writer: see 6.3 | `vector.ts` |
| `src/lib/hwp/pdf/images.ts` | image XObjects: see 6.3 "Images" | `images.ts` |
| `src/lib/hwp/pdf/raster-page.ts` | per-page fallback: the SVG with its font slices inlined as `data:` @font-face → `<img>` → canvas at 200 dpi → PNG (line art) / JPEG q 0.85 (photo; `isOpaquePhoto`) → full-page image + the invisible text layer (writer in `text` mode, Tr 3). Settle 150 ms after `decode()` (fonts inside an SVG image load after decode; without it, glyphs were missing) | `raster.ts` |
| `src/lib/hwp/pdf/export.ts` | `exportPdf({ infos, getPage(i): Promise<{svg,runs,failed}>, onProgress(i,n), signal }): Promise<{ blob, stats }>`. It runs the per-page loop, the hybrid decision (6.3) and the save. A page that fails to parse becomes a blank page of the right size, counted in `stats.failedPages` and reported like the viewer's placeholder | `direct.ts` |
| `src/tools/hwp-to-pdf/download.ts` | `pdfName(fileName)` = `safeFileName(stem(fileName), '.pdf')` (`a.b.hwpx` → `a.b.pdf`, empty stem → `문서.pdf`); `triggerDownload(url, name)`: a hidden in-page `<a download>` appended, `click()`, removed. The URL is revoked on reset or replacement, never on a timer (the "다시 내려받기" link keeps working) | – |
| `src/tools/hwp-to-pdf/export-chunk.ts` | the lazy entry: re-exports `exportPdf` (keeps pdf-lib/fontkit out of the viewer chunk) | – |

**Delete:** `src/tools/hwp-to-pdf/print.ts`, `guidance.ts` and their tests (`tests/unit/hwp-print.test.ts`, the guidance cases). Also delete the whole `@media print` block of `hwp.css`, the body classes `hwp-printable / hwp-preparing / hwp-not-ready / hwp-viewer-only`, `#hw-guide`, `#hw-after`, `COPY.afterPrint`, `COPY.viewerOnlyPrint`, `installPageStyle/removePageStyle`, `sizeKey`'s print use, and `viewer.downscale` with its blob-URL bookkeeping. The viewer shows the original images; downscaling now happens inside the PDF writer. Ctrl/Cmd+P then prints the page as any web page. That is acceptable: it is not our save path, and nothing is swapped.

### 6.3 The writer (`svg-to-pdf.ts`), exact behaviour
Coordinate system: one base `0.75 0 0 -0.75 0 H·0.75 cm` per page (px → pt, y down), plus the root viewBox matrix. All geometry is then emitted in SVG user units. The current transform matrix is tracked in JS: paths and clip rects are pre-transformed, and text gets one `Tm` per glyph. `q/Q` is used only for clips, images and alpha. Numbers are written with 3 decimals, and **a non-finite number is never written** (it becomes 0 and is counted in `stats.nonFinite`; the first spike's `-Infinity Tc` made invalid PDFs).

| SVG (rhwp 0.8.6 inventory, 120 files, 761 k `<text>`) | PDF |
|---|---|
| `g` (`transform`, `clip-path`, `filter`) | matrix; clip = `q <clip geometry> W n … Q` (clipPath children: rect/path/ellipse/circle, each with its own transform) |
| `rect` (`rx/ry`), `line`, `circle`, `ellipse`, `path` (M L H V C S Q T A Z, abs/rel), `polygon`, `polyline` | `re`/`m l c h` (ellipse: 4 Béziers, K = 0.5523; Q → C; A → Béziers), `f`/`f*` (fill-rule), `S`, `B`/`B*` |
| fill / stroke / stroke-width (scaled by √|det|) / linecap / linejoin / dasharray / fill-opacity / stroke-opacity / opacity | `rg RG w J j d`, ExtGState `ca/CA` cached per value |
| `linearGradient` fill on a rect (3 uses) | 64 bands along the gradient axis, clipped to the rect |
| `marker-start/-end` on `line` (arrowheads, law19/20) | the marker content drawn at the end point: orient auto, markerUnits, viewBox, refX/refY |
| nested `svg` (x, y, width, height, viewBox, preserveAspectRatio) | clip to the viewport + viewBox matrix |
| `text` (one glyph each): `x y`, `transform` (translate+scale 장평, rotate), `font-family/-size/-weight/-style`, `textLength`+`lengthAdjust`, `text-anchor`, `dominant-baseline`, `fill`, `fill-opacity="0"` | per glyph: face = `resolve(chain, weight, cp)`; `Tf 1`; `Tm = CTM × [fs·hs, 0, skew·fs, −fs, x, y]` with `hs = textLength / (advance·fs)`, skew 0.25 for italic/oblique, anchor middle/end shifts by the run width, `central` baseline shifts by (ascent+descent)/2. **Always write `0 Tr` or `3 Tr`** before a glyph: Tr is graphics state and survives `ET`. In the spike, one invisible `·` (fill-opacity 0) made the rest of law10 page 1 invisible. `fill-opacity 0` → `3 Tr` (still selectable, as in print). Synthetic bold (a family without a 700 face) → `2 Tr` with `w = 0.03·fs` |
| `tspan` (x/y/dx/dy lists), used by rhwp's EMF/WMF → SVG pictures | pen-advance layout per character |
| space-like code points (NBSP, U+2000–200B, U+202F, U+3000) and the `addSpaces` word spaces | a real space glyph (copy/paste keeps word spaces) |
| private-use code points (Hancom PUA, e.g. U+F0124) | skipped; not counted as missing (no font renders them; print shows nothing either) |
| `image` `data:image/jpeg|png` | see "Images" |
| `image` `data:image/svg+xml` (rhwp's EMF/WMF pictures, adm19/adm29) | parsed with `parsePageSvg` + `sanitize`. If every element is in the vocabulary above, it is drawn as vector through the same writer (its fonts via `pick()`); otherwise rasterised like a bitmap. Rasterising first gave faint lines and shifted labels (adm29 p81); vector matches print |
| `g filter` = feComponentTransfer linear (brightness/contrast, adm04/18/19) | applied to the image pixels in **linearRGB** (sRGB → linear → a·C+b → sRGB, 256-entry LUT per channel), because that is what the SVG filter does by default |
| anything else (`use`, `pattern`, `mask`, `foreignObject`, other filters, a clip child we cannot express) | recorded in `stats.unsupported` → the page goes to the raster fallback |

**Hybrid rule (per page):** write the page as vector. If `stats.unsupported.length > 0` or `stats.missingGlyphs > 0` (a non-PUA code point that no bundled face has), remove the page (`pdf.removePage`) and write it with `raster-page.ts` instead. On the 40-file sample, 0 of 1,648 pages fell back, in each of the three browsers. The fallback exists for future rhwp output and odd documents, and it costs no extra dependency.

**Images** (`images.ts`): the production downscale rule from `downscale.ts` is kept (its helpers are reused, not copied): 200 dpi at the printed size (from the CTM), oversize > 1.25×, payload > 100 KB, JPEG q 0.85 for photos and JPEG sources, PNG for line art, keep the smaller.
- A JPEG that needs nothing is embedded **as is** (`embedJpg`, no decode).
- A CMYK JPEG (SOF components = 4) always goes through the canvas, because PDF viewers disagree on Adobe-inverted CMYK.
- Every distinct `href`+filter is embedded **once per document**. rhwp repeats header logos on every page; the dedupe is what keeps adm04 (151 p) at 7.3 MB.
- A decode failure → the page goes to the raster fallback.

### 6.4 UI changes (`index.astro`, `controller.ts`, `messages.ts`, `tools.ts`)
- The button `#hw-save` reads **"PDF 내려받기"**; `#hw-force` reads **"그래도 PDF 내려받기"**. They are enabled as soon as the document is parsed (no font or print gate).
- **exporting** state: `#hw-progress` shows "PDF 만드는 중 12/26쪽" with the bar and **취소**. The preview stays visible, and the buttons are disabled with `aria-disabled`. `document.body.dataset.busy = 'hwp'`. The watchdog stays armed (a page that never comes back → error `timeout`). An exception → error `oom` for a RangeError or allocation failure, otherwise `corrupt`.
- **done:** the download starts. The status line (role=status, focus stays on the button) reads `「${name}」${particle(name, '을/를')} 내려받았습니다 · ${n}쪽 · ${size}`, for example "「공무원임용시험령.pdf」를 내려받았습니다 · 26쪽 · 0.3 MB". Next to it goes a visible **다시 내려받기** `<a download>` with the same blob. That link is the recovery when a browser blocks the programmatic click. With direct download, Android in-app browsers (KakaoTalk) may ignore the programmatic click. Verify this on a device (6.8); the visible link is the fallback.
- Keep: `#hw-note` "원본 프로그램과 글꼴·줄바꿈이 조금 다를 수 있습니다." and the "저장한 PDF가 크면 PDF 용량 줄이기" link, now in the done line.
- Remove: the per-browser guidance (the lead card, `details`) and the help section "PDF로 저장하는 방법". Remove the FAQ "저장 버튼을 눌렀는데 인쇄 창이 떠요". Change the 사용 방법 steps to three: 「HWP 파일 고르기」 → 「미리 보기」 → 「PDF 내려받기」 ("버튼을 누르면 PDF 파일이 바로 저장됩니다").
- **File name:** `pdfName(file.name)`, i.e. the original name with `.pdf` (`law05.hwp` → `law05.pdf`, `소하천설계기준 (최종).hwpx` → `소하천설계기준 (최종).pdf`).
- **Josa:** every "{name}은(는)"-style string uses the shared helper from Polish Q, `src/lib/ui/josa.ts` (`particle(word, josa)` / `josa(word, josa)`, currently uncommitted on `main`'s working tree; Bob merges). In this tool that means the done line above. If a later message puts a particle after a file name or a number, it uses the helper too.
- **Brand:** all HWP page copy says **문서딱** (the Polish Q rename; the `title` in `tools.ts` becomes "… | 문서딱"). Bob reconciles at merge.

### 6.5 Build and assets
- `scripts/gen-hwp-fonts.mjs` also copies the **`.woff` sibling** of every copied `.woff2` slice (`@fontsource/*/files/*-{400,700}-normal.woff`, 4 families). It copies the Pretendard **static** Regular/Bold `woff-dynamic-subset` files (`pretendard/dist/web/static/woff-dynamic-subset/Pretendard-{Regular,Bold}.subset.*.woff`, 184 files) to `public/fonts/hwp/pretendard-static@1.3.9/`. It writes `src/generated/hwp-pdf-faces.json` = `[{family, weight, url, range}]`, in resolution order, with the four fallback faces last. Why static Pretendard: the page uses "Pretendard Variable", whose default instance is not the 400/700 the browser picks, and fontkit subsetting copies default-instance outlines.
  - Why `.woff` and not `.woff2`: **@cantoo/fontkit's subsetter writes broken glyphs from a WOFF2 source** (measured: every glyph a box or invisible; from WOFF → SFNT it is correct). Reading only `.woff` also means the PDF path never needs a Brotli decoder: alias `brotli/decompress.js` to a throwing stub in the Vite config (saves ~60 KB gzip).
- **Fallback faces (new, SIL OFL 1.1).** `scripts/gen-hwp-fallback.mjs` gains the four spike faces (`scripts/spike-hwp-direct/fallback-faces.mjs`: sources, ranges and SHA-256 of the sources recorded in BUILD-LOG). It writes `.woff2` (viewer) and `.woff` (PDF) into `scripts/fonts/` (committed):

  | face | source | ranges | woff2 | woff |
  |---|---|---|---|---|
  | `fb-cjk` | Noto Sans CJK KR 2.004 (the current fallback source) | the 4 current code points + punctuation, arrows, math, technical, enclosed, box drawing, geometric, misc symbols, dingbats, CJK symbols, enclosed CJK, half/full-width | 123 KB | 138 KB |
  | `fb-math` | Noto Sans Math | arrows, math operators, technical, geometric, combining marks | 53 KB | 70 KB |
  | `fb-sym2` | Noto Sans Symbols 2 | arrows, geometric, misc symbols, dingbats, misc arrows | 42 KB | 51 KB |
  | `fb-sans` | Noto Sans | general punctuation, spacing modifiers, combining marks | 19 KB | 25 KB |

  Without these faces, 30 of 40 files had glyphs that no bundled face covers: ∼ ․ ═ ･ ｢｣ ▪ ▸ ➔ ➂ ∙ ⋅ ∅ ∎ ▢ ⎯ ㊲ 〫 ˝ ̊. adm16 alone had 73,172 (═ leaders). Print hid this because the OS supplied the glyphs (Windows fonts in the harness). A phone or another OS would differ. The viewer benefits too: add the same faces to the hwp font CSS as `Anolim HWP Fallback` faces with these unicode-ranges. The `fb-cjk` face should be split into two or three range slices so that none is over 60 KB (the current per-face budget).
- `public/fonts/hwp/` stays versioned and immutable. The SW allowlist already covers `/fonts/hwp/` (cache on use), and carry-forward covers it. CSP is unchanged (`connect-src 'self'` allows the font GETs; images are decoded from `data:`, and the writer never fetches a `blob:`).

### 6.6 Routing and limits (UX-AUDIT-2 item 1)
- **Drop equations as a guard trigger.** Corpus v2 has 9 files with equations. None of them is broken because of equations. The 3 broken ones (adm04, adm28, adm29) are also caught by pages ≥ 100 and/or textboxes ≥ 3, and their breakage is R3/R4/R9, not equations. Removing the trigger moves 5 files into convert: law14 (2 eq, good), adm07 (4, minor), law09 (28, minor), law16 (28, good), adm19 (214, minor: R1 `DELTA`). The non-routed set goes from 101 files / 2 broken (2.0 %, CI 0.5–6.9 %) to **106 / 2 (1.9 %, CI 0.5–6.6 %)**, well inside ≤ 5 %. law09, the audit's "평범한 법령 서식", becomes a normal convert with the primary button.
- Instead, files with equations get a **soft note under the primary button** (not viewer-first): "수식이 들어 있어 수식 모양이 원본과 조금 다를 수 있습니다. 미리보기로 확인해 보세요." The banner copy for the remaining guard becomes: textboxes ≥ 3 → "글상자·도형이 많아 위치가 원본과 다를 수 있습니다. 미리보기로 확인한 뒤 내려받으세요."; pages ≥ 100 → "100쪽이 넘는 문서라 쪽 나눔이 원본과 다를 수 있습니다. 미리보기로 확인한 뒤 내려받으세요."
- `regress:hwp` rule 2 (guard parity with the 19 spike keys) changes to the **14-key** list (drop law14, adm07, law09, law16, adm19). `EXPECTED_MODES`: law09 and adm19 become `['convert','convert']`.
- **Caps:** the print-era caps (mobile ≤ 60 pages / ≤ 10 MB / WASM ≤ 256 MiB / images ≤ 8 MB) were set by the DOM + print peak (+1.8 GB for 151 pages, +3.9–4.8 GB for 411 pages). The export peak is WASM + one page. Measured in section 3: adm16 (411 p) +0.4 GB in Chromium versus +4.1 GB for print. **Keep the caps unchanged in this step.** Re-derive them only from the real-device run (6.8), because the WASM + decoded-image part (kr01: 785 MB WASM) did not change.

### 6.7 First use on slow networks (UX-AUDIT-2 item 2: 20 s on Slow 4G)
1. **Fetch the wasm bytes during the file dialog.** On `pointerdown` on the picker, `dragenter` on the drop zone, or `keydown` Enter/Space on the picker, call a new `prefetchRhwpWasm()` in `lib/hwp/wasm-browser.ts` (already fetch-allowlisted). It does `fetch(RHWP_WASM_URL)` and reads the body to the end, which fills the HTTP cache and the SW `/vendor/rhwp/` cache. The worker's own `download()` then hits the cache. Skip on Save-Data / 2G (`preloadSkipped`). The file dialog typically stays open 3–10 s, which covers most of the 2.6 MB brotli transfer on 4G and a good part on Slow 4G. Do not prefetch on page idle alone: Lighthouse and visitors who never pick a file would pay 2.6 MB.
2. **Start the document fonts with the engine.** When the `scanned` message arrives, also inject the hwp font CSS and `document.fonts.load()` the Serif/Sans 400 Hangul slices used by the first page as soon as page 0's SVG arrives. This is the existing `preloadFacesFor`, run on page 0 only.
3. **Stage readout** (plain words, one line, updated ≤ 4 Hz):
   - "처음 한 번만 문서 여는 프로그램을 받고 있어요 · 43%" (engine phase; the percentage is over the build-time raw size, as today; add "처음 한 번만" so the wait reads as one-time)
   - "문서를 읽고 있어요" (parse)
   - "1/26쪽 보여 드리는 중" (first page)
   - on export: "PDF 만드는 중 12/26쪽"
4. Warm the export chunk: after the document is shown and the page is idle, `import('./export-chunk')` (≈ 350 KB gzip) so that the first click does not wait for it. Skip on Save-Data/2G.

Expected effect (to be measured by Bob with the audit's Slow 4G profile): the engine download starts 3–10 s earlier, so first-page time drops from 20 s by roughly the dialog time. The progress line removes the "stuck" impression.

### 6.8 Plain language (UX-AUDIT-2 item 3, §7.2 style) for `/hwp-to-pdf/`
| place | now | new |
|---|---|---|
| lead | 한글 프로그램 없이 한글파일 PDF로 변환합니다. … 글자를 선택할 수 있는 PDF로 저장합니다… | 한글 프로그램 없이 한글 파일을 PDF로 바꿉니다. HWP·HWPX 문서를 고르면 모든 쪽을 미리 보여 드리고, 버튼 한 번에 PDF 파일로 내려받습니다. 한글 뷰어처럼 열어 보기만 해도 됩니다. |
| drop zone privacy line | 파일은 이 기기 밖으로 전송되지 않습니다. | 내 폰·컴퓨터 안에서만 바꿔요. 파일은 어디로도 보내지 않아요. (+ 개인정보 처리방침 link) |
| 안전한 이유 #1 | 업로드하지 않습니다 / …어디에도 전송되지 않습니다. | 밖으로 보내지 않습니다 / 문서는 이 기기 안에서만 열리고, 인터넷으로 어디에도 보내지지 않습니다. |
| 사용 방법 | (print steps) | ① HWP 파일 고르기 ② 미리 보기 ③ PDF 내려받기: 버튼을 누르면 PDF 파일이 「다운로드」 폴더에 바로 저장됩니다. |
| FAQ 파일이 업로드되나요? | …서버로 전송되지 않습니다. | Q 제 문서가 어디로 보내지나요? A 아니요. 문서는 이 기기 안에서만 열리고 어디로도 보내지지 않습니다. |
| FAQ 휴대폰에서도 되나요? | …휴대폰은 메모리가 적어… | 네. 다만 휴대폰은 PC보다 한 번에 처리할 수 있는 양이 적어 10 MB 또는 60쪽이 넘는 문서는 보기만 할 수 있고… |
| FAQ 저장 버튼… 인쇄 창 | – | delete |
| FAQ (new) PDF는 어디에 저장되나요? | – | 휴대폰·PC의 「다운로드」 폴더에 원래 파일 이름 그대로(확장자만 .pdf) 저장됩니다. |
| error oom | 이 브라우저에서 처리하기에는 문서가 너무 무겁습니다. …다른 브라우저로… | 이 기기에서 열기에는 문서가 너무 큽니다. 컴퓨터에서 열거나 Chrome·삼성 인터넷 등 다른 앱으로 열어 주세요. |
| error timeout | …다른 브라우저로 다시 시도해 주세요. | 문서를 여는 데 너무 오래 걸려 멈췄습니다. 컴퓨터에서 열거나 Chrome·삼성 인터넷 등 다른 앱으로 열어 주세요. |
| too-large / viewer-only banners | 이 브라우저에서는 … PDF로 저장할 수 없어… | 이 기기에서는 … PDF로 내려받을 수 없어 보기만 할 수 있어요 (이 문서 …). 컴퓨터에서 열면 내려받을 수 있습니다. |
| engine progress | 변환 도구를 불러오는 중… 43% | 처음 한 번만 문서 여는 프로그램을 받고 있어요 · 43% |
| meta `description` | 파일 업로드 없이 브라우저에서 hwp pdf 변환. … | HWP 파일을 PDF로 변환 — 한글 프로그램 없이, 파일을 올리지 않고 바로 내려받기. 회원가입 없이 무료. (the audit keeps "업로드 없이" in `title` for search) |

No visible copy on the page uses 업로드, 서버, 브라우저, 네트워크, 메모리 or 인쇄 (대화상자); the title/meta keyword exception is noted above. Add a unit test that scans the rendered page text for these words.

### 6.9 Tests
**Unit (Vitest, Node/jsdom):**
- `hwp-pdf-woff.test.ts`: a committed small `.woff` (the fallback `fb-sans.woff`, 25 KB) → `woffToSfnt` → fontkit parses it, has the same glyph count, and maps U+2024. A bad signature throws.
- `hwp-pdf-faces.test.ts`: `parseRanges` (single, range, wildcard `U+4??`); resolution order; **a family without the wanted weight still resolves** (the 100–900 regression); PUA → null without counting missing; a chain without our families → `pick()`.
- `hwp-pdf-writer.test.ts` (jsdom SVG + pdf-lib + fontkit with a fixture face; pdf.js to read back):
  - text of a synthetic page round-trips exactly (incl. word spaces);
  - **after an invisible glyph the next glyph is visible** (content stream contains `0 Tr` after `3 Tr`);
  - `textLength` → horizontal scale;
  - `text-anchor=middle`;
  - `transform="translate() scale()"` and `rotate(90,cx,cy)` matrices;
  - path parser (every command, relative forms, arc);
  - `fill-rule=evenodd` → `f*`;
  - marker at `marker-end`;
  - nested `svg` viewBox;
  - `tspan dx`;
  - a `data:image/svg+xml` picture drawn as vector;
  - `<use>` → `unsupported`;
  - no `NaN`/`Infinity` in any content stream when fed `x="NaN"`.
- `hwp-pdf-images.test.ts`: JPEG pass-through (no decode), CMYK detection → canvas path, dedupe (two `<image>` with the same href → one XObject), the linearRGB filter LUT values (slope 1, intercept 0.2: sRGB 0 → 124, 128 → 173, 255 → 255, within ±1).
- `hwp-pdf-export.test.ts`: a fake `getPage`; progress calls; abort after page 2 rejects with `AbortError` and does not call save; a page with `unsupported` goes to the injected raster function; a failed page becomes blank.
- `hwp-download.test.ts`: `pdfName` cases (above, plus `.HWP` upper case, a name made only of unsafe characters → `문서.pdf`, 255-char cap).
- `network-guard.test.ts`: allowlist += `lib/hwp/pdf/font-source.ts`.
- `hwp-copy.test.ts`: the forbidden-word scan (6.8); the done line uses `particle()` ("law05.pdf를", "보고서.pdf를").
- Delete `hwp-print.test.ts` and the guidance cases in `hwp-tool.test.ts`.

**E2E (`tests/e2e/hwp-to-pdf.spec.ts`, Chromium + Firefox + WebKit projects):**
- law05: click 「PDF 내려받기」 → `page.waitForEvent('download')`. `suggestedFilename() === 'law05.pdf'`. The saved file starts with `%PDF-` and pdf.js reads 1 page with the expected text.
- **No page swap:** during and after the click, the main frame fires no `framenavigated`, `page.url()` is unchanged, `document.title` is unchanged, no `dialog` event fires, `context.on('page')` sees no new page, and `window.print` is never called (stub it to record a call). The preview element is the same node before and after, and it stays visible (bounding box non-zero) during export.
- law10: the progress text reaches "PDF 만드는 중 26/26쪽", then the done line and 「다시 내려받기」 appear.
- adm28 (desktop, viewer-first): 「그래도 PDF 내려받기」 → 「취소」 at page ≥ 5 → state viewer-first, no download event within 2 s, the "취소했습니다" status.
- law09: now `convert` (primary button) with the equation note.
- Zero `securitypolicyviolation`; no request to another origin (existing guard).
- Mobile project (Pixel 7): law05 download works; the done line is visible without horizontal scroll at 360 px.

**regress:hwp** (`scripts/regress/hwp.mjs`; local, the full 120-file corpus):
- Produce the PDF with `exportPdf` in the harness page instead of `page.pdf()` and score the bytes. Keep rules 1 and 3–6.
- Rule 2 uses the 14 keys (6.6).
- New rule 7, per file:
  - valid (pdf.js opens every page; no `NaN`/`Infinity` operand)
  - `missingGlyphs === 0`
  - `fallbackPages` reported (and must be 0 on the 40-file sample)
  - `recall ≥ 0.99` also for guarded files
- Port `scripts/spike-hwp-direct/score.mjs`'s SSIM as a **report-only** column against print PDFs made once from `main`, so regressions against the old output stay visible.
- Time rule 6 becomes export time (open → PDF bytes): law10 ≤ 4 s, adm28 ≤ 15 s (desktop Chromium; measured 1.9–3.2 s and 5.2–8.4 s).

### 6.10 Budgets (`scripts/check-dist.mjs`, gzip -9)
| asset | budget | spike measurement |
|---|---|---|
| `/hwp-to-pdf/` initial JS | ≤ 30 KB (unchanged) | – |
| viewer chunk (lazy.ts, now without print/guidance) | ≤ 25 KB (unchanged; it gets smaller) | – |
| **export chunk** (`export-chunk*.js` closure: @cantoo/pdf-lib + @cantoo/fontkit + writer), loaded on idle after open or on the first click | **≤ 360 KB** | pdf-lib + fontkit, brotli stubbed: 347 KB (esbuild, minified) |
| hwp.worker | ≤ 90 KB (unchanged) | – |
| each fallback face slice (woff2 and woff) | ≤ 60 KB raw (fb-cjk split) | 19–138 KB before the split |
| font bytes fetched for a law10 export | ≤ 1.0 MB, reported | law10 0.26 MB; 0.2–1.2 MB for the law files; max 3.2 MB (adm29, 188 p) |
| `dist/` file count | < 15,000 (report) | +872 fontsource `.woff` (400/700 only, one per shipped `.woff2`) + 184 Pretendard static + ~10 fallback files |
| export time desktop Chromium | law10 ≤ 4 s, adm28 ≤ 15 s | see section 3 |
| export peak (browser tree working set − idle) | report per file in regress; adm16 ≤ 1.5 GB desktop | see section 3 |

### 6.11 Dependencies and licenses (log each in BUILD-LOG before use)
| package | version | license | shipped | note |
|---|---|---|---|---|
| @cantoo/pdf-lib | 2.11.1 (already a dependency) | MIT | yes (export chunk) | – |
| **@cantoo/fontkit** | **2.0.12** (pin) | MIT | yes (export chunk) | deps: restructure (MIT), dfa (MIT), fflate (MIT, already), brotli (MIT, **aliased to a stub, not shipped**). `@pdf-lib/fontkit` 1.1.1 does **not** work with @cantoo/pdf-lib 2.x (`encode()` signature: "Cannot read properties of undefined (reading 'pos')") |
| @fontsource/* `.woff` files | 5.3.0 (already) | OFL 1.1 fonts, MIT package | yes (static) | same fonts as the shipped .woff2 |
| pretendard static woff dynamic subset | 1.3.9 (already) | OFL 1.1 | yes (static) | – |
| Noto Sans CJK KR, Noto Sans Math, Noto Sans Symbols 2, Noto Sans (fallback subsets) | CJK 2.004; the others from notofonts.github.io, record the SHA-256 | OFL 1.1 | yes (static, subsets) | add to `licenses.manifest.json` and `/licenses/`; embedding subsets in user PDFs is allowed by OFL |
| jspdf 4.2.1, svg2pdf.js 2.8.1 | – | MIT | **no** | spike only (approach A) |

No network access at run time other than same-origin GETs of our own versioned static files (wasm, font files). Nothing about the document leaves the device.

### 6.12 Verify on real devices before release (carry over from UX-AUDIT-2 P0-2)
iPhone Safari (iOS 16.4, 17, 18) and KakaoTalk's in-app browser (Android and iOS): the download starts, the file is named `<name>.pdf`, the Files/Downloads app opens it, and 「다시 내려받기」 works when the first click was swallowed. On iOS Safari a `download` link to a `blob:` shows the system "다운로드" prompt, which is fine and is not a page swap. On one mid-range Android (4 GB) and one iPhone, also export law10, adm28 (desktop cap only) and kr17 and note the time and whether the tab survives. Write the results to `docs/`.

## 7. Reproduce
```bash
cd C:/dev/doc-tools-kr-hwpdl
npm ci && (cd scripts/spike-hwp-direct && npm ci)          # spike-only deps: jspdf, svg2pdf.js, @cantoo/fontkit, @pdf-lib/fontkit
for s in copy-vendor vendor-rhwp gen-hwp-fonts gen-licenses gen-ui-font gen-brand; do node scripts/$s.mjs; done
# fallback faces: put NotoSansCJKkr-Regular.otf, NotoSansMath-Regular.ttf, NotoSansSymbols2-Regular.ttf,
# NotoSans-Regular.ttf (notofonts, OFL) in regress-out/direct/fonts/, then
node scripts/spike-hwp-direct/gen-fallback-ext.mjs regress-out/direct/fonts
sh scripts/spike-hwp-direct/all.sh        # print baseline + 3 browsers × C,H,A,B (CORPUS_DIR defaults to ../doc-tools-kr/spikes/hwp/corpus)
sh scripts/spike-hwp-direct/all2.sh       # Chromium C/H re-run, missing B files, WebKit B fixtures, mobile
node scripts/spike-hwp-direct/score.mjs desktop && node scripts/spike-hwp-direct/report.mjs desktop
node scripts/spike-hwp-direct/sbs.mjs out.png 1 <page0> <a.pdf> <b.pdf>      # side by side
node scripts/spike-hwp-direct/inventory.mjs                                     # rhwp SVG vocabulary
```
Do not edit harness files while a run is going: Vite reloads the page, and the file in flight fails with "Execution context was destroyed" (this happened to 4 Chromium B files; they were re-run).
