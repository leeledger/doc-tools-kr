# Review Feedback — Step 1 (Foundation + PDF 합치기)
Date: 2026-09-29
Reviewer: Richard
Verdict (round 2): APPROVE  (round 1 was CHANGES REQUIRED; see the Round 2 section at the end)
Ready for Builder: YES

## Gates re-run by the reviewer (Windows 11, Node 22.15.1)
- npm run check: 0 errors, 0 warnings, 0 hints (41 files)
- npm test: 32/32 passed
- npm run build: OK; the postbuild check-dist step reports 300 files, largest 1.21 MiB, no .map
- npm run check:licenses: OK, 20 production packages
- dist/_headers is byte-identical to public/_headers. The only script tags in dist are 2x application/ld+json and 1 external module. There is no unsafe-inline in script-src.
- E2E on chromium: 27 passed, 1 skipped (stated reason). E2E for pdf-merge.spec on firefox, webkit and mobile-safari: 18 passed, 3 skipped (stated reasons).
- Gate 11 (partial). Headless Chromium through Playwright against serve.mjs, desktop 1280, Pixel 7, and dark mode on both:
  - home and /pdf-merge/
  - 4 files added: kr_law_form, irs_fw9, a Korean file name "한글 서류_견적서(최종).pdf", and PNG bytes saved as photo.pdf
  - the not-PDF error showed inline and the other files were kept. After deleting it, the merge ran, and 17쪽 were downloaded as kr_law_form_외2건_합침.pdf.
  - 0 console errors and 0 horizontal scroll in all 4 contexts. Every request was a same-origin GET.
  - the pages looked right in light and dark, and the landing page matches the old design.
  - NOT done: real Chrome, Firefox or Edge with a window, and a real phone. This is still owed before deploy (Arch or the owner, on the Cloudflare preview).

## Must Fix
- src/lib/pdf/mergePlus.ts:350-357 (confidence: 10). Field renaming can produce duplicate fully-qualified field names.
  - Code: if (usedNames.has(nm) && !namesThisDoc.has(nm)) then d.set(N("T"), PDFHexString.fromText(nm + "_" + (fi + 1)))
  - It never checks whether the new name is already taken. It also only adds the ORIGINAL names to usedNames (namesThisDoc.add(nm)).
  - I reproduced it with a temporary vitest (since deleted). File 1 has fields a and a_2; file 2 has field a. The output fields are [a, a_2, a_2].
  - The realistic trigger is re-merging an output of this tool (it already contains x_2) with another copy of the same form.
  - Two root fields with the same /T is invalid (PDF names must be unique). Viewers then link or share the values, which breaks the "모두 입력할 수 있게 했습니다" promise.
  - Fix:
    - Pick the first free candidate: nm_{fi+1}, then nm_{fi+1}_2, and so on, until neither usedNames nor namesThisDoc contains it.
    - Add the FINAL name to both sets.
    - Add a unit test with the case above, plus a 3-way case: file A has a, B has a, C has a_2.

## Should Fix
- public/robots.txt:4 (confidence: 9). The Sitemap URL https://doc-tools-kr.pages.dev/sitemap.xml is hard-coded, so it does not follow PUBLIC_SITE_URL. Brief section 5 says a domain move is "one variable". Generate it as src/pages/robots.txt.ts from site, the same way as the sitemap.
- src/data/tools.ts, FAQ "휴대폰에서도 쓸 수 있나요?" (confidence: 7). The answer "최신 크롬, 사파리, 삼성 인터넷에서 동작합니다" claims Samsung Internet, which no gate tests. Brief section 4 says to claim only what the tests prove. Either drop 삼성 인터넷, or verify it on a real device at Gate 11 first.
- src/lib/pdf/mergePlus.ts:200-205 (confidence: 6). withFileIndex turns ANY non-PdfError, including a bug in our own code such as a TypeError in step 2 or 3, into PdfCorruptError with a file index. The user is then told the file is damaged and is asked to remove it. Suggest: only errors from loadSource/copyPages become corrupt; anything else becomes unknown (keep the fileIndex).
- src/tools/pdf-merge/controller.ts:413-424 (confidence: 5, verify). Suppose the user cancels while file.arrayBuffer() is still pending and then clicks PDF 합치기 again. The first runMerge passes the state check, because the state is merging again, and it creates a second worker. That worker is never terminated. Its messages are ignored (worker !== w), but it still burns CPU and memory. Guard with a per-run token (const run = ++runId; then return if run !== runId).
- src/lib/pdf/mergePlus.ts:329 (confidence: 5, verify). Only the /DR of the first file with a form is kept. A later file whose fields use a DA font name missing from that DR will get wrong or missing glyphs when a viewer regenerates appearances (NeedAppearances, or when the user edits the field). This is not a regression versus the spike. Merge the /DR /Font subdictionaries (first one wins per key), or log it as a Known Gap.
- src/lib/pdf/mergePlus.ts:144-148. Outline entries whose action is not GoTo (URI, Named) are dropped silently, and only their children are kept. This is acceptable, but log it in BUILD-LOG Known Gaps, since the FAQ says 책갈피 are kept.

## Escalate to Architect
- Pretendard subset and OFL Reserved Font Name. node_modules/pretendard/dist/LICENSE.txt:2 says "with Reserved Font Name Pretendard". scripts/gen-ui-font.mjs makes our own subset of PretendardVariable.woff2, which is a Modified Version under the OFL. HarfBuzz keeps the internal name table ("Pretendard"), and the CSS family is still "Pretendard Variable". OFL section 3 bars Modified Versions from using the RFN without permission. Whether web-delivery subsetting counts is argued (OFL-FAQ), so this is a licensing call, not a code call. Options:
  - (a) rename the family inside the subset (name table) and in the CSS to something without "Pretendard"
  - (b) get written permission from the author (the repo is active)
  - (c) accept, with a documented rationale
  The author-made dynamic-subset files are unmodified and fine as shipped, and renaming the CSS family to "Pretendard Dynamic" does not modify the font.
- Privacy 시행일 (deviation 10) must become the real deploy date, and the 문의처 placeholder remains an owner decision. Korean PIPA expects a contact for the privacy officer, so do not leave the placeholder in place for long.
- Gate 11 on the real Cloudflare preview (real Chrome, Firefox and Edge, plus one phone). This is also where to confirm that Cloudflare serves .mjs with a JavaScript MIME type (under nosniff, a wrong type breaks the pdf.js module worker) and that _headers applies, including the :hash noindex rule. I could not do this locally.

## Answers to the Builder questions
1. Is the UI-subset font the permanent strategy? Technically yes: one preloaded file, deterministic, rebuilt from src/ on every build, and the numbers justify it.
   - Conditions: resolve the RFN escalation above first.
   - Keep the "Pretendard Dynamic" fallback on any page that shows user-supplied text.
   - Watch the subset size as pages are added; if it passes about 150 KiB, split it by page group.
2. /P detach for widgets not in any /Annots? Not required for Step 1. A cheap way to make it complete is to also walk AcroForm /Fields -> /Kids and delete /P on every widget dict found there before copyPages. Note that verifyOutput cannot catch orphan pages, because they do not change the page count of the page tree, so the unit test is the only guard. Log it as a Known Gap if you do not do it now.
3. Is an HTMLCanvasElement thumbnail OK for Step 1b? It is fine for one thumbnail per file. For per-page thumbnails in Step 1b, hundreds of canvases at DPR 2 is a lot of memory. Use ImageBitmap or a blob-URL img, and render lazily (IntersectionObserver). Decide that in the Step 1b brief.

## Deviations 1-10
- All 10 are accepted as reasoned.
- #1 is subject to the OFL escalation. #2 is correct and is covered by unit tests. #3 is confirmed: no eval path in the shipped pdf.js, and CSP blocks it anyway. #4 is correct: Liberation is GPL-2 plus an exception, so omitting it is right; the only cost is 404 GETs for the fallback font on non-embedded Helvetica thumbnails.
- #9 (retries: 1) is fine while flakes stay visible in the report. #10 is for Arch.

## Cleared
- Error mapping in the worker and controller: not-pdf (sniffing %PDF- in the first 1 KiB), password, wrong-password, corrupt, oom (RangeError or a message match), and worker onerror -> unknown. The worker always verifies before done, so no partial output reaches the user.
- The limits and their messages. The password stays in memory only: it is cleared on remove and reset, and it is never logged or put in the URL.
- Focus after move, remove and unlock, the live region, and the labelled controls.
- There is no innerHTML: file names go in through textContent. JSON-LD escapes the less-than sign. The only set:html is on static icon SVG.
- CSP (connect-src self, no unsafe-inline scripts). The no-upload auto fixture cannot be opted out of. It checks method, body, origin, websockets, and CSP on every response. The static network-API guard is in place and the original pdf-lib is absent.
- The license manifest covers the shipped pdf.js wasm, cmaps and Foxit notices. Canonical, og, and the noindex-on-404 logic are correct, and the sitemap lists exactly the 4 pages. The CI workflow is sound. For Cloudflare Pages: dist output, .node-version 22, and all prebuild tools, including subset-font, are installed by npm ci.
- Korean copy follows docs/COPY.md.

Step 1 is not yet clear. Re-review needs only the Must Fix plus its test. The Should Fix items can be fixed inline or logged.

---

# Round 2 re-review — 2026-09-29
Verdict: APPROVE. There are no Must Fix items.

## Gates (re-run by Richard)
- check: 0 errors (43 files).
- test: 35/35.
- build: OK. gen-ui-font reports 428 chars, 94.8 KiB, name "Anolim UI Sans Variable". check-dist reports 300 files.
- check:licenses: OK, 20 packages.
- E2E chromium: 27 passed, 1 skipped (stated reason).

## Verified
- **Must Fix, field renaming (mergePlus.ts:390-422):**
  - A candidate is rejected if it is in the final names of earlier files, the original names of this file, or the names already assigned in this file.
  - Final names are added to usedNames.
  - The three new tests cover my repro, a 3-way case, and the case where the second file keeps its own a_2. Resolved.
- **robots.txt.ts:** it builds the Sitemap URL from site. public/robots.txt is gone, and dist/robots.txt is correct.
- **Error mapping:**
  - withFileIndex now maps foreign errors to unknown.
  - readingInput wraps getPages and copyPages and maps them to corrupt. OOM and PdfError pass through.
  - The truncated and not-pdf tests are still green.
- **runId:** it is bumped on each start, cancel and reset. A late read returns before creating a worker, and the read-failure path is guarded too. Resolved.
- **stripFieldTreeP:** it runs after the page-annots pass, so hadP and the re-attach are unchanged. The walk uses a seen-set and a depth bound. Only widgets that are not in any /Annots lose /P for good, and those are invisible anyway. Low risk.
- **mergeDrFonts (beyond the ask):** it only adds missing /DR /Font keys, first file wins, into a DR copy that belongs to the output alone. It cannot change the fields of file 1. Its only cost is that fonts already copied through page resources get copied again (a separate copier), so output grows slightly. Accepted.
- **OFL rename:**
  - I decoded dist-equivalent anolim-ui.woff2 back to TTF and loaded it with fontTools: name IDs 1 and 4 are "Anolim UI Sans Variable", 6 is "AnolimUISansVariable-Regular", and the fvar instance PS names are renamed.
  - There are zero "Pretendard" byte sequences, ASCII or UTF-16, in the whole font.
  - I ran renameFont directly on a fresh subset: fontTools checkChecksums=2 passes for every table, and the whole-file sum equals 0xB1B0AFBA, so checkSumAdjustment is correct.
  - The upstream dynamic-subset CSS and woff2 are byte-identical to node_modules (diff -rq and cmp). "Pretendard Dynamic" appears nowhere in src, scripts or dist.
  - The font stack order is "Anolim UI Sans", "Pretendard Variable", and so on. /licenses/ names the modified subset.

## Informational (non-blocking; fix when convenient)
- scripts/font-rename.mjs readNames (confidence: 8). It uses `names[id] ??= ...`, so the gen-ui-font leak guard only checks the FIRST record for each name ID. A second platform or language record that still contains the name would pass the guard. It does not happen today: my byte scan shows 0 occurrences. Make the guard check every record, or scan the raw name-table bytes for "Pretendard" in ASCII and UTF-16BE.
- The new unknown mapping for non-input errors has no unit test. It is cheap to add one: inject a throwing onProgress and expect code unknown with a fileIndex.

## Still open for the deploy gate (not blocking, per Arch)
- Gate 11 on the Cloudflare preview: real browsers and a phone, the .mjs MIME type, and whether _headers and noindex apply.
- Privacy 시행일 and 문의처.

Step 1 is clear.
