# Review Feedback — Step TOOLS4 T0 + T1
Date: 2026-10-06
Ready for Builder: YES

## Must Fix
None.

## Should Fix
- src/data/id-photo-presets.ts:3-4 (confidence: 9/10) — header comment still says "Dropped (확인 필요): 주민등록증, 운전면허증, TOEIC, 고용24, 지방공무원 — see FAQ 4". Both now ship as `print`, and FAQ 4 no longer carries that sentence. The next line says T1 added them, so the comment contradicts itself. — Remove 주민등록증 and 운전면허증 from the "Dropped" list and drop the "see FAQ 4" pointer for them.
- src/data/id-photo-presets.ts:428-430 (confidence: 6/10, verify) — `validatePreset` accepts an official band on any status, as long as the bandQuote sits inside the quote. In practice only `official`/`print` carry a quote, so arithmetic/user fail anyway. Decision 6 scopes it to "official or print". — Optional: add `isSourced(p)` to the official-band branch so the rule reads like the brief.

## Escalate to Architect
- REFERENCE_ASPECT_EXEMPT (presets.ts:393: history, korcham, teps, saramin, jobkorea, half_card). Decision 6 and the test map say "non-35:45 aspect with a reference band rejected". Applied literally, that rule would pull six shipped presets. Bob exempted them by id, so shipped behaviour does not change and the rule holds for every new preset. I think this is right at the code level. Arch must confirm that the passport ratio stays acceptable as a reference guide on these 3:4 / 4:5 / 5:7 photos. That is a product decision.
- T1-a (도로교통공단 digital spec only in `<img alt>`) and T1-b (no visa source readable by check:quotes, so 0 visa presets and the 비자 optgroup is hidden). These are scope and acceptance decisions. T1 acceptance says "only quoted presets shipped", and that is met. Whether T1 counts as done with zero visa presets is Arch's call.

## Cleared
T0: I read the full diff. These are pure moves: reorder.ts (comment only), qpdf-run.ts/load.ts (verbatim, plus the `QpdfRun` type), wasm-browser.ts, deps.ts, worker imports, and path updates in tests and copy-vendor. page-range.ts is new and unused, and its loops are bounded by pageCount. I see no behaviour change.
T1: id_card and driver_license numbers match the cited quotes word for word. The quotes are identical to the guide sources and the BUILD-LOG Step 0 table. Pixels are 413×531, which `printPx` and `dpiFor` round to 300 ppi. No KB limit was invented. The labels carry "(인화용 3.5×4.5 cm)", which validatePreset enforces. Both presets use the reference band on 35:45. The print rules, the bandQuote-in-quote rule, the measure field and the optgroup select are in: empty 비자 skipped, 직접 입력 in 기타, default passport_online, and controller value lookups do not depend on option order. The result-screen print note, FAQ 4 (FAQ 3 untouched), the PRESET_IDS/usage equality, check:quotes parsing of print presets, and the guide/hub deep links (the hub fit column follows cta.href) all check out. Unit tests (157), tsc and check:quotes (140 verbatim; parsePresets lists id_card 2 URLs, driver_license 1) pass locally. The Korean copy reads correctly.

---

# Review Feedback — Step TOOLS4 T0 + T1, Round 2
Date: 2026-10-06
Ready for Builder: YES

## Must Fix
None.

## Should Fix
- src/content/guides/driver-license-photo.md:65 (confidence: 5/10, verify) — the guide says "온라인 「적성검사 사진 등록」에 쓰는 파일은 500KB 이하…". The popup's own words are "온라인 신청시:파일 크기 500KB 이하의 JPG파일…". The popup never names 「적성검사 사진 등록」, so linking it to that menu is our inference, made because the button sits on the 적성검사 page. — Consider "온라인으로 신청할 때 내는 파일은 …" so the sentence says only what the source says.
- scripts/ops/lib/html.mjs:118 (confidence: 4/10) — `ALT` takes the first `\salt=` anywhere in the tag. A tag like `<img title="x alt=y" alt="z">` would yield "y". This is contrived for an agency page, and a mis-parse makes a quote fail, not falsely pass. Appendix only.

## Escalate to Architect
None. The owner decided T1-a, T1-b and the exemption list.

## Cleared
Alt-text change: `withAltText` runs after scripts, styles, comments and templates are removed, so an `<img>` inside a script string is never read (tested). Only a real `<img>` tag's `alt` attribute is used (`data-alt` is ignored, tested). The text is the page's own accessible text, served in the HTML. The IMG regex alternatives start on disjoint characters, so there is no catastrophic backtracking. An unbalanced quote can only swallow text, so the quote check fails safe. I see no path where a quote "matches" text that is not on the page.
driver_license: I fetched https://www.safedriving.or.kr/commonManage/selectCommonPhotoRulePop.do (3,582 B, one `<img>`). The alt text contains, character for character, "머리 길이가 정수리(머리 최상부)부터 턱까지 3.2~3.6cm 사이인 사진" and "온라인 신청시:파일 크기 500KB 이하의 JPG파일, 가로 413 픽셀(pixel), 세로 531 픽셀 권장, *가로 395~431, 세로 507~550 필셀 이내만 업로드 가능, 300dpi 해상도 권장". The source's typo "필셀" is kept. The preset matches exactly: outW/outH 413×531, pxRange 395–431 × 507–550, limitBytes(500,'le'), dpi 300, band 32/45–36/45 crown with bandQuote inside quote. The official band's "규격 32–36 mm" overlay label is true for this band.
SF1: the header comment is fixed. SF2: `isSourced` guard added. The usage label, the hub bullet (주민등록증 only), and the guide `preset: driver_license` source are correct. Unit tests (963), tsc and check:quotes (142 verbatim; both safedriving URLs OK) pass locally.
