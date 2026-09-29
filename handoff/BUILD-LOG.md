# BUILD-LOG — 안올림 (doc-tools-kr)

## Decisions (locked, 2026-09-29)
- **Stack:** Astro 7 static site, TypeScript strict, module Web Workers, self-hosted lazy WASM. No UI framework, no backend.
  - Cloudflare Pages output directory becomes `dist/`. The owner changes the CF settings at the Step 1 deploy.
- **Release order:**
  1. PDF 합치기 (plus the site foundation)
  2. PDF 용량 줄이기
  3. 사진 용량 줄이기
  4. 여권·증명사진
  5. HWP→PDF, gated on a 100+ file corpus
- **Merge engine:** @cantoo/pdf-lib 2.11.1 plus a port of mergePlus. The original pdf-lib is banned.
- **Out of scope:**
  - 주민번호 가리기 (about zero demand)
  - "이미지로 변환" compression in Step 2 v1
  - HEIC decoding (only LGPL decoders exist)
  - background editing or retouching (policy)
- **Ads:** the AdSlot component is reserved and renders nothing while `ADS_ENABLED=false`.
- **Licenses:** MPL is allowed only in dev tooling (@axe-core/playwright). Shipped code must use the permissive allowlist.

## Steps
| Step | Status | Date |
|---|---|---|
| 1 Foundation + PDF 합치기 | round 2 fixes done, awaiting re-review | 2026-09-29 |

## Known Gaps
- Page-level merge editing (candidate Step 1b, after Step 2; owner to confirm)
- Password re-protection of output files
- qpdf fast path for very large merges, and a self-built qpdf-wasm with xref recovery
- JPX recompression for 강력 (Step 2 follow-up)
- Manual iLovePDF comparison on 3–4 non-sensitive files (owner)
- Re-verification of the photo presets marked secondary (before Step 4)
- Expanding the HWP corpus to 100+ files (precondition for Step 5)

## Open questions for owner
- Privacy page contact channel: email or GitHub issues
- Cloudflare Pages build settings change at the Step 1 deploy

## Step 1 build notes (Bob, 2026-09-29)

### Dependencies (exact pins; licenses)
- Runtime (shipped): `@cantoo/pdf-lib@2.11.1` (MIT; deps fflate MIT, culori MIT, tslib 0BSD, node-html-better-parser MIT, html-entities MIT), `pdfjs-dist@6.3.289` (Apache-2.0; wasm: openjpeg BSD-2, jbig2 BSD-3, qcms MIT; cmaps BSD-3; Foxit fonts BSD-3), `pretendard@1.3.9` (OFL-1.1).
  - `pdfjs-dist` has an optional dependency `@napi-rs/canvas@1.0.9` (MIT). It is Node-only and never shipped to the browser; the regression harness uses it for rendering.
- Dev only: `astro@7.3.5`, `typescript@6.0.3`, `@astrojs/check@0.9.10`, `vitest@5.0.2`, `@playwright/test@1.63.0`, `@axe-core/playwright@4.13.0` (MPL-2.0, dev only), `@lhci/cli@0.15.1`, `@types/node@22.19.1`, **`vite@8.3.1`** (MIT; same version astro/vitest already pull in; made explicit because the regression harness imports it), **`subset-font@2.9.0`** (BSD-3-Clause; deps harfbuzzjs MIT, fontverter BSD-3, wawoff2 MIT).
- TS: `@astrojs/check@0.9.10` peers `typescript ^5 || ^6`, so TS 7.0.2 is not usable; pinned 6.0.3 (latest 6.x). `astro check` is clean.
- `npm audit`: 10 advisories, all in `@lhci/cli`'s dev-only tree (tmp, uuid, inquirer). Nothing shipped. No fix without downgrading lhci.

### Decisions
- **UI font subset (deviation from A4).** Self-hosting the Pretendard dynamic subset as a render-blocking stylesheet made the landing page need ~13 woff2 slices (~330 KB) before first paint: mobile Lighthouse FCP/LCP 3.0–3.7 s, perf 0.81–0.89, CLS 0.04 from the font swap. Fix: `scripts/gen-ui-font.mjs` (prebuild) cuts one variable-font subset of every character in `src/` (~430 chars, 95 KiB), hashed by Vite and preloaded. Result: LCP 1.4 s (home) / 1.6 s (tool), CLS 0, perf 98–100. The dynamic subset is still copied (versioned: `public/fonts/pretendard/1.3.9/`), renamed to family "Pretendard Dynamic", and loaded by the merge tool on the first added file, so Korean file names outside the UI subset still render in Pretendard. The rendered look is unchanged (screenshot diff: only the PDF card and the footer links differ).
- **mergePlus `/P` detach (addition to the spike algorithm).** Spike mergePlus copied an orphan page object for multi-page AcroForms: widgets reached through a field's `/Kids` carry `/P` pointing at other pages, and copyPages followed it (irs_fw9: 7 page objects for 6 pages). Step 0 now removes `/P` from source annotations and re-sets it to the copied page. All spike metrics unchanged (regress table in REVIEW-REQUEST).
- pdf.js 6.x removed `isEvalSupported` (no eval path exists; `new Function`/`eval` do not occur in pdf.min.mjs or pdf.worker.min.mjs), so the option is not passed.
- Not shipped from pdf.js: `standard_fonts/Liberation*` (GPL-2.0 with font exception, outside the allowlist; pdf.js falls back to a system sans for non-embedded Helvetica/Arial in thumbnails only), `wasm/quickjs-eval.*` (scripting sandbox, never enabled), `iccs/` (CMYK ICC profile, CC0; pdf.js uses its built-in CMYK conversion).
- Home card copy for PDF 합치기 changed from "…페이지 순서를 바꾸거나 필요 없는 페이지를 빼세요" to "여러 PDF를 한 파일로 묶고, 파일 순서를 원하는 대로 바꾸세요": page-level editing is Step 1b, so the old copy promised a feature that does not exist.
- Merge errors with a file index (corrupt / not-pdf) mark that file in the list; the merge button stays disabled until the file is removed ("문제가 있는 파일을 목록에서 삭제하면 합칠 수 있습니다."). Truncated files are already caught by pdf.js at inspection time.
- Soft-limit confirmation is an inline panel ("계속 합치기" / "취소"), not `window.confirm`.
- `tests/e2e/serve.mjs` gzips text responses like the CDN does, so Lighthouse numbers are comparable to production.
- Playwright `retries: 1`: Playwright's Firefox on Windows occasionally misses the load/DOMContentLoaded event under parallel load while the page is already `readyState === 'complete'` (verified in a probe; serial runs never fail). Retried tests show up as "flaky" in the report; none were flaky in the final 3 full runs.

### Known Gaps (Step 1)
- The `/fonts/*` immutable cache rule now only covers versioned paths; keep it that way when adding fonts.
- Lighthouse locally needs `CHROME_PATH` (no system Chrome on this machine); CI runners have Chrome.
- Keyboard-only e2e runs on the 3 desktop projects; skipped on the 2 mobile projects (touch devices). The mobile soft-limit e2e runs only on the 2 mobile projects.
- Desktop hard/soft limits (500 MB / 200 MB / 1,500쪽) are unit-tested only (no e2e with 200+ MB fixtures).
- Password field uses `autocomplete="off"`; a browser password manager may still offer to save it (browser behaviour).
- Real-phone manual check (gate 11) not done by Bob.

## Step 1 round 2 (Bob, 2026-09-29, after REVIEW-FEEDBACK)
- **Field renaming.** A clashing root field now gets the first free name out of `name_<fileNo>`, then `name_<fileNo>_2`, and so on. A name counts as taken if an earlier file's final names, this file's original names, or names already assigned in this file contain it. Final names are recorded. Unit tests cover `{a, a_2}+{a}`, `{a}+{a}+{a_2}`, and `{a}+{a, a_2}`.
- **Error mapping.** Failures that read or copy the input (load, page tree, copyPages) map to `corrupt`. Any other exception inside a file's merge is `unknown`, with its fileIndex kept.
- **/P stripping.** /P is now also removed from every dict in the AcroForm field tree (`/Fields` → `/Kids`), in addition to page `/Annots`.
- **/DR fonts.** Later files' `/DR /Font` entries missing from the output /DR are added; the first file wins per key.
- **Merge run token.** The controller has a per-run token (`runId`). Cancel and reset invalidate it, so a merge whose file reads finish after a cancel never creates a worker.
- **robots.txt** is generated by `src/pages/robots.txt.ts` from `site` (PUBLIC_SITE_URL). `public/robots.txt` is removed.
- **Mobile FAQ.** It no longer names specific browsers (the Samsung Internet claim was unverified).
- **OFL Reserved Font Name (Arch decision).**
  - The UI subset's name table is rewritten by `scripts/font-rename.mjs`: every record containing "Pretendard" is renamed. Copyright, trademark and license records (IDs 0, 7, 13, 14) are kept. PostScript-style names contain no spaces. Checksums and table layout are rebuilt.
  - Font name: "Anolim UI Sans Variable". CSS family: "Anolim UI Sans". Files: `src/generated/anolim-ui.{woff2,css}`.
  - The build fails if any renamed record still contains the reserved name.
  - The official dynamic subset is now copied byte-identical, CSS included, with family "Pretendard Variable". It is only the fallback: stack `"Anolim UI Sans", "Pretendard Variable", Pretendard, …`.
  - /licenses/ keeps the Pretendard copyright and OFL text and names the modified subset.
  - New dev dependency: `fontverter@2.0.0` (BSD-3-Clause; it was already a transitive dependency of subset-font), used for the sfnt→woff2 conversion.
- **Look is unchanged.** The round-2 landing screenshot is pixel-identical to round 1 (0 differing pixels at 1280 px).

### Known Gaps (added in round 2)
- Outline entries whose action is not GoTo (URI, Named, JavaScript) are dropped; only their children are kept.
- `/DR` merging covers `/Font` only (other resource types come from the first form file).
- Privacy 시행일 is set at the deploy gate (Arch). The 문의처 placeholder stays until the owner answers.
- Gate 11 on the real Cloudflare preview is still owed: real Chrome/Firefox/Edge and a phone, `.mjs` MIME type under nosniff, `_headers` including the :hash noindex rule.
