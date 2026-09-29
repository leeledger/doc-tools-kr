# Review Request — Step 1 (Foundation + PDF 합치기)
Date: 2026-09-29
Ready for Review: YES

Nothing is committed and nothing is pushed. `site/` is deleted (staged); every other change is untracked, so `git status` shows the full set. Run `npm ci && npm run build` first; e2e and Lighthouse run against `dist/`.

## Gates (actual results, Windows 11, Node 22.15.1)

| # | Gate | Command | Result |
|---|---|---|---|
| 1 | Typecheck | `npm run check` | 0 errors, 0 warnings, 0 hints (41 files) |
| 1 | Unit | `npm test` | 32/32 passed (3 files) |
| 2 | E2E, 5 projects | `npm run test:e2e` | 135 passed, 5 skipped, 0 failed, 0 flaky (last 3 full runs). Skips have stated reasons: keyboard-only on the 2 mobile projects, mobile soft-limit on the 3 desktop projects |
| 3 | No-upload | auto fixture in `tests/e2e/no-upload.ts`, applies to every e2e test | green in every test: only GET/HEAD, no request bodies, same-origin/blob:/data: only, 0 websockets, CSP `connect-src 'self'` on every same-origin response |
| 3 | Static guard | `tests/unit/network-guard.test.ts` | no `sendBeacon`/`XMLHttpRequest`/`WebSocket`/`EventSource`; `fetch(` in 0 files (allowlist empty); no `pdf-lib` import |
| 4 | Regression | `npm run regress:merge -- --large` | all 6 scenarios PASS (table below) |
| 5 | Cross-browser | chromium, firefox, webkit | green |
| 6 | Mobile | Pixel 7, iPhone 14, 360 px | no horizontal scroll on 4 pages; tool controls ≥ 44 px; mobile soft limit (50 MB) confirm flow e2e |
| 7 | axe | `/`, `/pdf-merge/` (empty + listed), `/privacy/`, `/licenses/`, 404 | 0 serious/critical in all 5 projects |
| 8 | Lighthouse (mobile, 3 runs, median) | `npm run lhci` | `/`: perf 100/99/91 (median 99), a11y 100, BP 100, SEO 100, FCP 0.8 s, LCP 1.4 s, CLS 0, JS 0 B. `/pdf-merge/`: 100/100/100/100, FCP 1.0 s, LCP 1.6 s, CLS 0, initial JS 6.3 KB (gzip). All assertions pass |
| 9 | Licenses | `npm run check:licenses` | OK, 20 production packages (MIT, Apache-2.0, 0BSD, OFL-1.1) |
| 10 | Dist | `postbuild` → `scripts/check-dist.mjs` | OK: 300 files, largest `vendor/pdfjs/6.3.289/pdf.worker.min.mjs` 1.21 MiB, no `.map` |
| – | Clean clone | copy of tracked+untracked files → `npm ci && npm run build` | OK |
| 11 | Manual (reviewer) | real Chrome/Firefox/Edge + phone | not done by Bob |

Bundle sizes: page controller 13.4 KB (5.6 KB gzip); pdf.js main 431 KB (127 KB gzip), loaded on the first file; merge worker 575 KB (247 KB gzip), loaded on the first merge.

### Regression table (`regress-out/merge.md`)

| Scenario | Result | Pages | Text eq (sampled) | SSIM min non-scan | Fields | Bookmarks | Links correct | ms | MB in → out |
|---|---|---|---|---|---|---|---|---|---|
| S1_mixed_office | PASS | 100/100 | 19/19 | 1 (scan 1) | 199/199 ✓fill | 79 | 18/18 (wrong 0, dropped 0) | 2195 | 2.8 → 2.62 |
| S2_same_form_twice | PASS | 12/12 | 12/12 | 1 (scan 1) | 46/46 ✓fill | 2 | 0/0 (wrong 0, dropped 0) | 345 | 0.27 → 0.11 |
| S3_subset_with_links | PASS | 13/13 | 12/12 | 1 (scan 1) | 0/0 | 7 | 3/15 (wrong 0, dropped 12) | 1229 | 2.37 → 1.28 |
| S4_user_password | PASS | 3/3 | 3/3 | 1 (scan 1) | 0/0 | 2 | 0/0 (wrong 0, dropped 0) | 66 | 0.21 → 0.2 |
| S5_damaged_input | PASS | 8/8 | 8/8 | 1 (scan 1) | 0/0 | 2 | 0/0 (wrong 0, dropped 0) | 67 | 0.2 → 0.18 |
| S7_big_75MB | PASS | 845/845 | 16/16 | 1 (scan 1) | 0/0 | 54 | 4/4 (wrong 0, dropped 0) | 10816 | 71.59 → 70.76 |

Matches the spike figures (S1 199/199, 18/18, 79; S3 3 correct + 12 dropped; S7 54 bookmarks, 4/4 links, 10.8 s). The harness has an SSIM self-check (page 1 vs blank must differ).

## Files Changed (all new unless noted)
- `site/` — deleted (ported).
- `.gitignore` (modified), `.node-version`, `package.json`, `package-lock.json`, `astro.config.mjs`, `tsconfig.json`, `vitest.config.ts`, `playwright.config.ts`, `lighthouserc.json`, `.github/workflows/ci.yml`, `licenses.manifest.json`.
- `src/lib/pdf/mergePlus.ts:1-386` — typed port of the spike mergePlus; step 0 (`/P` detach and reattach) is new, see Deviations.
- `src/lib/pdf/errors.ts:1-80` — error classes, `%PDF-` sniff, load-error and OOM mapping.
- `src/lib/pdf/verify.ts:1-14` — reload + page-count check.
- `src/lib/pdf/merge.worker.ts:1-49` — module worker; transfers buffers both ways; always verifies before `done`.
- `src/lib/pdf/inspect.ts:1-93` — lazy pdf.js, shared PDFWorker, versioned vendor URLs from `lib.version`, 160 px thumbnail.
- `src/tools/pdf-merge/controller.ts:1-545` — state machine, list, password, limits, cancel, download, live region, on-demand dynamic font.
- `src/tools/pdf-merge/limits.ts:1-70`, `format.ts:1-30` — limits and messages; MB/쪽 formatting; download filename sanitizer.
- `src/pages/index.astro`, `pdf-merge/index.astro`, `privacy/index.astro`, `licenses/index.astro`, `404.astro`, `sitemap.xml.ts`; `src/layouts/Base.astro`; `src/components/JsonLd.astro`, `AdSlot.astro`; `src/data/site.ts`, `tools.ts`.
- `src/styles/global.css` — `site/styles.css` unchanged except the font stack line 37 (adds "Pretendard Dynamic"). `src/styles/app.css` holds all new styles.
- `public/_headers`, `public/robots.txt`, `public/og.png` (1200×630, 17.9 KB).
- `scripts/copy-vendor.mjs`, `gen-licenses.mjs`, `gen-ui-font.mjs`, `check-dist.mjs`, `check-licenses.mjs`, `gen-og.mjs` (one-off), `regress/merge.mjs`.
- `tests/fixtures/` (2 corpus copies, 2 generated PDFs, `build.mjs`, `SOURCES.md`; 252 KB total), `tests/helpers/pdf.ts`, `tests/unit/*.test.ts`, `tests/e2e/{serve.mjs,no-upload.ts,global-setup.ts,paths.ts,pdf-merge.spec.ts,site.spec.ts}`.
- `docs/COPY.md` (28 lines).
- Not mine, left untouched: `docs/GSTACK-REVIEW.md`, `.claude/skills/visual-qa/SKILL.md` (appeared during the session).

## Deviations from the brief
1. **Font loading (A4).** The page does not link the dynamic-subset CSS. It preloads one generated Pretendard subset (`gen-ui-font.mjs`, runs in `prebuild`; adds the dev dependency `subset-font@2.9.0`, BSD-3). Without this, gate 8 failed: LCP 3.0–3.7 s, perf 0.81–0.89, CLS 0.04. The dynamic subset is still vendored, under versioned `public/fonts/pretendard/1.3.9/` with family renamed "Pretendard Dynamic", and the merge tool loads it when the first file is added. `global.css` font stack gains that family name.
2. **mergePlus step 0 (`/P`).** This was not in the spike. Without it, merging irs_fw9 produced an orphan copy of one page (7 page objects for 6 pages). The unit test asserts no orphan pages for fw9 ×2 and fw9 + links.
3. **`isEvalSupported`** is not passed, because pdf.js 6.3.289 removed the option. No eval code exists in the shipped pdf.js files.
4. **Not vendored:** pdf.js `Liberation*` fonts (GPL-2.0 + font exception), `quickjs-eval.*`, `iccs/`.
5. **`vite@8.3.1`** is added as an explicit devDependency. The regression harness uses `runnerImport` to load the TS engine in Node, and the version equals the one astro and vitest already install.
6. **Home card copy** no longer promises page deletion or reordering (that is Step 1b).
7. **`mergePlus` options** gain `onProgress` (used by the worker for per-file progress). The signature is otherwise as specified.
8. **Mobile list layout.** Below 520 px the thumbnail placeholder is a fixed 96×136 box instead of 160×226, so 360 px has no horizontal scroll. It is still fixed size, so there is no CLS.
9. **Playwright `retries: 1`.** This covers a Playwright-Firefox harness race; details are in BUILD-LOG. Flakes are reported, never hidden.
10. **Privacy 시행일** is set to 2026-09-29 (the build date). Arch should set it to the actual deploy date.

## Open Questions
- Is the UI-subset font approach acceptable as the permanent strategy? Every new page's copy is picked up automatically at build. Characters outside `src/` fall back to "Pretendard Dynamic" only where the tool loads it, and to system fonts elsewhere.
- Should `/P` detach also cover widgets that are not listed in any page's `/Annots`? It is not needed for the corpus, and I have not seen such a file.
- `inspect` returns the thumbnail as an `HTMLCanvasElement` (the brief does not specify a type). Is that fine for Step 1b's page thumbnails?

## Please check specifically
- `src/lib/pdf/mergePlus.ts` step 0 and step 2 (the `/P` reattach and link reattach share the annotation-index mapping).
- `controller.ts` focus handling after move/remove/unlock, and that the password is never logged or put in the DOM beyond the input (it is cleared on remove/reset; `e.password` is set to undefined).
- `tests/e2e/no-upload.ts`: it is an auto fixture, so no test can opt out.
- CSP: only `application/ld+json` inline scripts exist, and the page script is an external module (`grep -ohE "<script[^>]*>" -r dist`).

## Blocked (Flags — not guessed)
- Cloudflare Pages settings (owner, at the deploy gate): build command `npm run build`, output `dist`, `NODE_VERSION=22`. Until then, **do not push** (a push would break production).
- Privacy contact channel: placeholder "문의처는 곧 안내합니다" kept.
- pdf.js under the locked CSP: nothing blocked; pdf.js works in all 5 projects with `script-src 'self' 'wasm-unsafe-eval'`, `connect-src 'self'`.
- `@cantoo/pdf-lib` in a module worker works in Firefox and WebKit (e2e merges succeed in all 5 projects). Nothing to report.

## Out of Scope (logged in BUILD-LOG)
- Page-level editing (Step 1b), output re-encryption, qpdf fast path, service worker, analytics/ads, dark-mode redesign, English UI.
- Known gaps: desktop 200/500 MB limits unit-tested only; real-phone check not done; lhci needs `CHROME_PATH` locally.


---

# Round 2 — fixes for REVIEW-FEEDBACK (2026-09-29)
Ready for Review: YES. Still no commit and no push.

## Must Fix
- `src/lib/pdf/mergePlus.ts`, form-field step 3 plus helper `freeName`.
  - Root fields are collected first.
  - A name that clashes with an earlier file gets the first free name out of `name_<fileNo>`, `name_<fileNo>_2`, and so on. A candidate is taken if it is in earlier files' final names, this file's original names, or this file's already-assigned names.
  - The final names go into `usedNames`.
- Tests in `tests/unit/merge.test.ts`, "field renaming never produces duplicate names":
  - `{a, a_2} + {a}` → `[a, a_2, a_2_2]`
  - 3-way `{a} + {a} + {a_2}` → `[a, a_2, a_2_3]`, all three fillable after a save round-trip
  - `{a} + {a, a_2}` → `[a, a_2_2, a_2]`, so the second file keeps its own `a_2`

## Should Fix (all fixed inline)
- **robots.txt:** `src/pages/robots.txt.ts` builds the Sitemap URL from `site`; `public/robots.txt` is deleted.
- **tools.ts mobile FAQ:** the browser list is gone.
- **Error mapping:**
  - `withFileIndex` turns non-PdfErrors into `unknown`.
  - A new `readingInput()` wrapper around `getPages()` and `copyPages()` maps input-structure failures to `corrupt`. The truncated-file test still gets `PdfCorruptError`, fileIndex 1.
- **`controller.ts` run token:** `runId` is incremented by each merge start, cancel and reset. A run whose reads finish late returns before creating a worker, and its read-failure path cannot overwrite the state either.
- **/P:** `stripFieldTreeP()` walks `/AcroForm /Fields → /Kids` and deletes /P. The page-annots pass still runs first so /P is re-set on copied pages.
- **/DR:** `mergeDrFonts()` adds later files' `/DR /Font` keys that are missing (first wins). The two outline and /DR limits are logged in BUILD-LOG Known Gaps.

## Arch decisions
- **OFL Reserved Font Name.**
  - New `scripts/font-rename.mjs` rewrites the subset's `name` table. The resulting names:

    | Name ID | Value |
    |---|---|
    | 1, 4 | "Anolim UI Sans Variable" |
    | 6 | "AnolimUISansVariable-Regular" |
    | fvar instance names | "AnolimUISansVariable-Bold" and so on |
    | 0 (copyright) | "Copyright © 2023 Kil Hyung-jin", kept |
    | 13/14 (license) | kept |

  - `gen-ui-font.mjs` fails the build if any other record still contains "Pretendard".
  - CSS family: "Anolim UI Sans". Generated files: `anolim-ui.{woff2,css}`.
  - The official dynamic subset CSS and woff2 are copied byte-identical (`diff` against node_modules: identical), family "Pretendard Variable" as upstream.
  - `/licenses/` lists Pretendard with its OFL text and names the modified subset.
  - Added dev dependency `fontverter@2.0.0` (BSD-3-Clause).
  - Verified in Chromium: the only loaded face is "Anolim UI Sans". The landing screenshot is pixel-identical to round 1.
- **Privacy:** 시행일 is left for the deploy gate; the 문의처 placeholder is unchanged.

## Gates (round 2)
| Gate | Result |
|---|---|
| `npm run check` | 0 errors, 0 warnings |
| `npm test` | 35/35 passed (was 32; +3 rename tests) |
| `npm run build` | OK; check-dist 300 files, largest 1.21 MiB, no .map; gen-ui-font 428 chars, 94.8 KiB |
| `npm run check:licenses` | OK, 20 production packages |
| E2E chromium | 27 passed, 1 skipped (stated reason) |
| E2E all 5 projects (extra) | 135 passed, 5 skipped, 0 failed, 0 flaky |
| `regress:merge` S1–S5 (extra) | all PASS, metrics identical to round 1 (S1 199/199 fields, 18/18 links, 79 bookmarks) |

## Files changed in round 2
- `src/lib/pdf/mergePlus.ts`: `withFileIndex`, `readingInput`, `stripFieldTreeP`, `mergeDrFonts`, `freeName`, and step 0 and step 3.
- `src/tools/pdf-merge/controller.ts`: `runId`.
- `src/pages/robots.txt.ts` (new); `public/robots.txt` (deleted).
- `src/data/tools.ts`: FAQ.
- `scripts/font-rename.mjs` (new), `scripts/gen-ui-font.mjs`, `scripts/copy-vendor.mjs`.
- `src/layouts/Base.astro`, `src/styles/global.css` line 37 (font stack), `licenses.manifest.json`, `package.json`/`package-lock.json` (fontverter).
- `tests/unit/merge.test.ts`: three new tests.
- `handoff/BUILD-LOG.md`.

Note: round-1 text above that mentions "Pretendard Dynamic" or `pretendard-ui` is superseded by this section.
