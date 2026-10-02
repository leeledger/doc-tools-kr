# Review Feedback — G2 A3 (66f7979 on g2-a3)
Date: 2026-10-02
Ready for Builder: YES

# Review Feedback — Sprint C, C1 integration (/stamp-signature/, c1 @ 487372f)
Date: 2026-10-02
Ready for Builder: YES

Arch-approved decisions 1–6 were not re-opened.

## Real-photo check (Commons stand-ins; the owner gate stays open)
11 Wikimedia Commons files are in `C:\dev\doc-tools-kr\spikes\ink-real\` (gitignored; licences in `SOURCES.json`: CC0 ×2, PD ×2, CC BY 4.0, CC BY 2.0, CC BY-SA 4.0 ×5). I cropped them the way a user would frame a phone photo. I ran the shipped `processInk` on the work copy (long edge ≤ 2,400) in all 3 modes, and ran the page itself in Playwright.
Contact sheet: `spikes\ink-real\contact-sheet.png` (photo | alpha | 자동 on checker/white/dark | 빨간 도장 | 검정·파란 서명). Control retries: `sheetC.png`.

| Photo | Licence | Verdict |
|---|---|---|
| c01 red seal on textured paper, side light (Signature seal 2025-04-17) | CC0 | PASS: no paper residue, strokes whole, red kept, guess red → 도장.png. The seal object in the frame is keyed too (it is not paper; expected). |
| c02 faded seal on an aged scroll | CC0 | PARTIAL: the seal is whole and its colour kept. The scroll edge leaves a thin vertical line. 자동 guesses **black** (dull maroon) → 서명.png. 빨간 도장 mode is clean. |
| r05 seal scan (개인인장) | CC BY-SA 4.0 | PASS. |
| c03 / c11 exhibition sheets of seals, glare, curled strips | CC BY-SA 4.0 | PASS for the seals. The shadows at the strip edges come through as lines (the paper is not flat). |
| r06 brown marker signature | PD | PASS: brown kept, clean edges. |
| c09 pencil signature, light gradient | CC BY-SA 4.0 | PASS (faint, as pencil is). |
| c10 ink signature on a letter | CC BY-SA 4.0 | PASS (other handwriting inside the frame is kept, as expected). |
| r08 thin blue ballpoint on glossy paper, 990 px | CC BY 2.0 | WEAK: the loops break up. 아주 진하게 helps only a little. |
| c07 signature on brown kraft/cork board | CC BY 4.0 | 자동 **FAIL** (the texture keys: 18.8 % ink, heavy residue; guess red). 검정·파란 서명 mode is **clean**. |

Overall: stamps and dark-ink signatures on white or off-white paper under uneven light come out clean, with colour kept and a tight crop. These results are not "clearly bad", so there is no Must Fix. The brief's owner-photo gate (6 photos + JSON, `regress:ink` without --fixtures-only) is still required before 11-15.

## Must Fix
None.

## Should Fix
- src/content/guides/yearend-tax-pdf.md (body "## 회사마다 받는 방식이 달라요": "받는 방식은 크게 세 가지예요") (confidence: 7). NTS cntntsId=7706 lists **5** 유형. Types 3–5 are all 홈택스-based, so grouping them is defensible, but "세 가지" is our count, not NTS's. Fix: drop the count ("…받는 방식이 회사마다 달라요. 근로자가 내는 방식으로 보면 이래요.") or say NTS sorts companies into 5 types.
- src/content/guides/kakao-photo.md FAQ "PC 카카오톡…": "한 번에 최대 100개까지" (confidence: 6). Source 1073209414 says "개당 최대 300MB/ 최대 100개까지 전송할 수 있습니다". It does not say "한 번에". Fix: "최대 100개까지" (the body table already words it that way).
- Hub row label "전자소송 첨부파일 (모두 합쳐)" (confidence: 5, optional). The court's word is "총용량". Consider "(총용량)" so the label also follows the agency. Its 용량 맞추기 link opens /pdf-compress/?target=20, which is acceptable because the per-file cap still applies.
- Info only: live ecfs quote 1 has a line break between "PNG" and "(PDF파일로 자동변환…". The guide joins them with a space. This is acceptable and needs no change.

## Escalate to Architect
- None. (Bob's open item, per-claim citation for body-text numbers, is already logged. Brief it if wanted.)

## Verified
- check:quotes: **130/130 verbatim** live, which includes all kakao-photo and yearend-tax-pdf quotes. Kakao context re-read: 묶어보내기 해제 ("묶어보내기를 원하지 않는 경우…해제") and "여러 장의 사진은 하나의 말풍선" back the body. The yearend inference ("hand in unchanged") is gone, and the page now defers to the company's instructions.
- ecfs, headless Chromium on the live 전자소송포털 FAQ (질문+내용 search, 3 items opened). All 8 browser quotes are present: "PDF 형식이 아닌 문서 파일은…" (quotes 1–2), "종이서류로 되어 있는 서증…" (3–5, including "스캐너(또는 스캔기능이 있는 복합기)" behind body step 1), and "동영상이나 음성자료…" (6–8, so "형식이 다르거나 큰 파일은 직접 방문" is correctly scoped to 동영상·음성, and PPT/PPTX really sits in that list). "100M" is the court's spelling.
- Number check: `rowQuote` needs every number of a literal row in ONE quote (cited `source`, else the first quote stating all of them). The hub limit is taken from that quote only. Literal rows no longer fall back to presets/toolFacts, so the check is stricter than before. `M` is its own unit and is matched only by a quote that writes "100M". Tests cover a cited quote missing the number, a bad index, numbers split across quotes, own-quote limit wording, and the live ecfs rows. They are meaningful.
- Hub 형식 column holds formats only (HWP·DOC·PDF·JPG 등 / 안내 없음 / MP4·MP3·AVI 등). Limits are in the court's words (20MB까지 / 100M 이하 / 100 MB까지).
- Copy: brand 문서딱. No 업로드/서버/브라우저 outside quotes, no contact lines. ?target=20 is a valid pdf-compress chip.
- Visual :4473, ecfs/kakao/yearend/upload-limits at 390 and 1280 in light and dark: no page overflow (scrollWidth = clientWidth in all 16). The hub table scrolls inside its box on phones as designed. Dark contrast is fine.

## Cleared
A3 round 2 facts, the tightened one-quote spec check with its tests, copy rules and visuals all pass. The three Should Fix items are wording only. **A3 clear.**
- `src/lib/ink/key.ts` processInk (confidence 9). `const isRed = color === 'red' || (color === 'original' && key.guess === 'red');` makes the file name follow the colour guess even when the user picked a mode. c07 in 검정·파란 서명 mode downloads as **도장.png**. Fix: `mode === 'sign'` → 서명.png and `mode === 'red'` → 도장.png. Keep the guess for 자동 only, and keep the explicit colour override. Add a unit case.
- `src/tools/stamp-signature/photo.ts` openFile (confidence 6). `resetControls()` runs only in `toEmpty()` (the 다른 사진 고르기 button). The drop zone is also shown in the `error` phase (`drop.hidden = p !== 'empty' && p !== 'error'`). After a worker crash, a photo picked from there keeps the old mode, 진하기 and colour. Fix: call `resetControls()` at the start of `openFile`.
- BUILD-LOG C1 gates: the precache figures are stale. This build (local) and CI run 36944842539 both say **445.1 KB (flag 0) / 447.4 KB (flag 1)** of 450, not 444.3 / 446.6. The figure is real and deterministic, but there is 2.6 KB of headroom on the flag-on build. Correct the log.
- Honest limits / mode help: a signature on brown or coloured board fails in 자동 and is clean in 검정·파란 서명. A cheap help line under 찾을 것 (e.g. "종이가 누렇거나 갈색이면 검정·파란 서명을 고르세요") would turn the c07 failure into a one-tap fix. Glyph cost: check the UI font. Otherwise log it.

## Escalate to Architect
- Precache headroom is 2.6 KB on the flag-on build. C2 adds a page plus an entry, so it will not fit at 450 without a decision: raise the budget, or take more out of the precache. This is a budget call, not a code call.
- 자동 mode on non-white grounds: the brief fixes 자동 to the `mn` plane, which keys kraft or brown texture. One option is "if guess = black, re-key on lum" (the 서명 path). That changes the brief's algorithm, so it is Arch's call. The owner photos (one on yellow paper) will show whether it matters.
- Thin, faint ballpoint (r08) breaks up. Add "아주 가늘고 흐린 볼펜 서명은 끊겨 보일 수 있어요" to the honest limits? Copy/product call.

## Cleared
- **Legal.** 전자서명법 is current (DRF: MST 236201, 현행, 시행 2022-10-20, 법률 제18479호). The 4 statute quotes and 4 Microsoft quotes pass `check:quotes` **121/121 verbatim**. e-signature-law never says that an image is a 전자서명, has no 인감 comparison and no inferred advice, and ends with the 받는 곳 line. The FAQ and the tool page make no legal claims.
- **Page.** CSP unchanged, no stamp-specific headers, no fetch/XHR/beacon in the new code. Over 4 runs (390 and 1280, light and dark): 0 external requests, 0 non-GET requests, 0 console errors. Controls and worker are lazy: nothing loads with the page, and the ink worker loads only after a photo. The PNG is colour type 6 (RGBA). The blank-paper message blocks the download. The pad download is disabled until a stroke, and works with mouse and with CDP touch. Keyboard users are pointed to the photo tab.
- **Budgets.** Ink worker 5.0 / 6.1 KB, controls 11.4 / 13.5 KB, initial JS 8.3 KB, UI fonts 137.1 KB total (matches the +208 B claim).
- **Copy and visual.** No 업로드/서버/브라우저 and no contact lines. Brand 문서딱. The 5 FAQ items are real questions. Light and dark at both widths look correct (the pad stays white in dark mode by design).

Step C1 is clear.

---

# Review Feedback — G2 A2 (8b47d72, 51191f5 on g2-a2)
Date: 2026-10-02
Ready for Builder: NO → fixed in 0005334

Written by Bob for Richard: his Bash calls failed (permission-checker outage), so the coordinator relayed his items. Passed his review: facts, presets, the unit reader (`unitSpellings`), the KST date check, the hwp-to-pdf :433 test fix, check:quotes 113/113.

## Must Fix
1. police-exam-photo.md: both source titles must name the operator. Arch ruling 2 wording: "경찰청 인터넷 원서접수(진학어플라이 운영) — 사진등록안내". **Fixed.** The body line now says "경찰청 인터넷 원서접수 안내" too.
2. id-card-photo.md: the source excludes "분실, 파기 등". 파기 means destroyed or discarded, not damaged, and a damaged card is still handed in. Use "(잃어버렸거나 없앤 경우 제외)", as in the FAQ. **Fixed** in the table, and the FAQ now says "잃어버렸거나 없앤 경우" (it had said "망가져서 없앤").
3. korcham-photo.md: the quoted rejection list includes "얼굴만 나온 사진", but the guide list and FAQ 5 omit it. **Fixed** in both.

## Should Fix
- kuksiwon-photo.md: "그 뒤에는 국시원의 정정 신청 안내를 따라 주세요" goes beyond the source. **Dropped.**
- photo-sizes hub 형식 column: "상반신 사진" and "상반신 컬러 사진" are not file formats. **Fixed:** 형식 now holds only file formats. Other wording moved into the row label:
  - id-card: "(신규·재발급, 상반신)"
  - police: "(상반신 컬러)"
  - driver-license: "(종이, 여권용 컬러)"
  - admission: "(진학사 원서접수, 반명함판 3×4)", 형식 "JPG·JPEG"
  - Rows with no stated file format show 안내 없음.

## Arch ruling 1
- /id-photo/ 관련 안내 follows search demand: passport-photo, then photo-kb, then the rest. **Done:** `src/data/tool-guide-order.ts` (`TOOL_GUIDE_PINS`, pure `orderToolGuides`) is used by `guidesForTool`. Unit tests cover the pin order, unknown tools, and the real /id-photo/ order from the guide files. Built /id-photo/ shows passport-photo, photo-kb, kuksiwon-photo, police-exam-photo.

## Done for Richard (by Bob)
- Visual QA at 390 and 1280 px, light and dark, for the 6 new guides and both hubs (Playwright Chromium, 32 full-page shots, checked by eye). The guides were clean, with no horizontal page scroll. The hub tables at 390 px broke inside words ("350K B", "JP G") because the body's `overflow-wrap: anywhere` applies inside the side-scrolling table. **Fixed:** `.hub-table th, td { overflow-wrap: normal }` (guide.css), so values stay whole and the table scrolls. Re-shot and checked.
- Local e2e on E2E_PORT=4273, chromium + mobile-safari: id-photo + hubs 75 passed, 11 skipped (platform); site + growth 105 passed, 1 skipped.

---

# Review Feedback — ci-green (f35b6b0, d164c31, ef816a0 on origin/main 315aa38)
Date: 2026-10-02
Ready for Builder: YES (no Must Fix)

## What Richard ran
- Flag-off (shipping) build into a scratch outDir. It has 3 UI faces (400/700/800). Every `font-weight` in `_astro/*.css` and the HTML is 400, 700 or 800. There is no 600 anywhere in the shipped CSS or HTML.
- `qa:visual --only static` on that build. The full Chromium matrix completed: 11 pages × m360/m390/t768/d1280/d1440 × light/dark, plus the fold shots. The weight probe passed. The Firefox leg died on a `page.goto` timeout after 3 shots, which is the known Juggler harness flake and not a page fault. I looked at home (m390 fold, d1280 dark) and /id-photo/ (m390 fold, d1280 dark):
  - The eyebrow and "사용하기" chips are one step bolder and look deliberate.
  - The privacy pill is now visibly heavy.
  - Nothing else moved: no overflow, no wrapping changes, and dark mode is intact.
- CI skip counts, run 36888794186 against main's run 36864903124:
  - chromium 27/27, mobile-chrome 21/21, mobile-safari 32/32 and webkit 23/23 skipped are identical. The WebGL skip fires on no non-Firefox project.
  - firefox: skipped went from 23 to 44 and executed tests from 201 to 213. That fits manual-firefox adding the id-photo suite while the 7 face tests skip on the auto build. Shipping-config coverage on Firefox is real.
- lighthouserc: all 7 assertions are `"median"`. Every minScore/maxNumericValue, URL and numberOfRuns is byte-identical to main. Nothing was loosened.
- No-upload guard: the CSP/afterEach/`network` fixture lines are untouched by the diff. `skipWithoutWebGL` runs before `open()`, on about:blank, so it cannot mask a request.

## Must Fix
None.

## Should Fix
- src/tools/id-photo/overlay.ts:48 (confidence: 8/10) — `g.font = \`600 ${px}px "Anolim UI Sans", ...\`` is a remaining 600 consumer.
  - check-dist only scans CSS, so it slipped through.
  - With no 600 face, the canvas guide labels now resolve to 700 (or to a fallback if 700 isn't loaded yet; canvas does not trigger font loads). It is not broken, but the source still asks for a weight that doesn't exist.
  - Fix: change it to `700` (or 800 if it must match first paint), and say in the comment that the UI weights are 400/700/800.
- tests/e2e/id-photo.spec.ts `skipWithoutWebGL` (confidence: 6/10) — today nothing skips on Chromium (verified via the skip counts above). If a future Chromium drops the SwiftShader WebGL fallback, though, the 7 face tests would silently become skips on every engine.
  - Cheap guard: `if (!gl && browserName === 'chromium') throw new Error('Chromium lost WebGL; face tests would skip')`. Or limit the skip to `browserName === 'firefox'`.

## Escalate to Architect
- /id-photo/ `.idp-privacy` at 800: the info pill now reads heavier than the primary "사진 선택" button (700). That is a hierarchy inversion in the first view. The CLS reason is sound. The choice between 800 (current), 400 (also preloaded, so also CLS-safe) and preloading 700 (costs LCP bytes) is a design call, not a code call.

## Cleared
I reviewed the 600-face removal, the lhci median aggregation, the CI upload/Firefox project changes and the WebGL-conditional skips, then rebuilt and ran visual QA. The behaviour matches the brief, no thresholds were loosened, and the no-upload guard is intact. ci-green is clear.
# Review Feedback — G2 Sprint A, A1 (140156d on 3dc0796)
Date: 2026-10-02
Ready for Builder: NO (2 Must Fix, both copy/frontmatter, < 15 min)

## Must Fix
- `src/content/guides/kosaf-docs.md:306` (confidence: 10) — the quote is not verbatim. The live page (faq.do?searchType=s&searchStr=신청방법+및+필요서류, re-fetched 2026-10-02) says `1) 홈페이지 업로드(빠른접수) : 로그인>장학금>장학금신청>서류제출현황 우측 하단 [서류제출]클릭 후 파일 업로드`. We publish `… 장학금신청> 서류제출 현황 우측 하단 [ 서류제출 ]클릭 …`, which adds 3 spaces. source-watch did not catch it because `findQuote` normalises whitespace away. Fix: copy the live string exactly. Optionally add a strict-whitespace unit check for new quotes.
- `src/content/hubs/photo-sizes.md:406` and `upload-limits.md:443` (confidence: 9) — the copy says "'이하'와 '미만'은 기관 안내의 말 그대로예요". That is false for 4 of 9 rows. Saramin's quote is "용량 : 10MB", Jobkorea's is "5MB 이내", Gmail's is "제한은 25MB" and Outlook's is "크기 제한은 25MB". The hub prints "이하" for all four, because `hubs.ts` hard-codes 이하 for literal rows and `presetLimit` maps `le` to 이하. Only passport, gosi, qnet and kosaf actually say 이하/미만. Fix: reword so it does not claim verbatim wording, for example "기관이 '미만'이라고 쓴 곳만 '미만'으로 적었고, 나머지는 그 값까지 돼요". Keep the table values.

## Should Fix
- `photo-sizes.md:395` (confidence: 7) — "형식과 파일 용량만 맞추면 되고" is a rule no source states. For the admission row the 파일 용량 is also 안내 없음. Fix: drop that clause and keep "문서딱이 어떤 크기로 맞추는지는 … 안내 페이지에".
- `photo-sizes.md:397` (confidence: 7) — "온라인 원서는 픽셀 크기나 파일 용량을 정해요" overgeneralises. The 대입 원서 row is online and states neither. Fix: say "정하는 곳이 많아요" or tie it to the rows.
- `univ-docs-upload.md:179` answer and `upload-limits.md:433` (confidence: 6, verify) — "용량은 대학 모집요강마다 다르고" / "대학마다 모집요강에 따로 정해요". No quote says the size limit varies by university. Uway says the 제출 방법 varies, and jinhak says to check the 모집요강 for 제출서류. Defensible as an inference, but closer wording is "받는 서류와 형식·용량은 모집요강에서 확인".
- `kosaf-docs.md:313` (confidence: 6) — the source title "동의서를 홈페이지로 낼 때 주의할 점" is paraphrased. The FAQ heading is "홈페이지를 통해 동의서 업로드 시 주의해야 할 점이 있나요?" The other kosaf titles are verbatim. If the paraphrase is meant to avoid the word 업로드, label it as not the FAQ title (e.g. "한국장학재단 FAQ (동의서 제출 주의사항)").
- `admission-photo.md:168` (confidence: 5) — 「반명함판 3×4 cm」 is shown as the picker label. The real label is "반명함판 3×4 cm (일반 크기, 기관 규격 아님)". Fine as a reference, but the 「」 brackets imply the exact text.
- `kosaf-docs.md:282` (confidence: 5) — `category: 사진`, so the breadcrumb reads "안내 › 사진" on a documents guide. Consider PDF or a docs category if one exists.
- Informational, not a defect: the review request says the tool pages are byte-identical to HEAD. In fact the 5 tool pages and home differ from HEAD in their guide links (NEXT_GUIDES, home 6th guide), as the brief intends. Their CSS, JS and `_headers` are identical.

## Escalate to Architect
- none.

## Verified
- **Quotes:** all 30 URL quotes in the 4 guides were re-fetched 2026-10-02. 29 are verbatim with a strict whitespace check (uway decoded as EUC-KR); the kosaf one is above. The 3 deploy-gate quotes (kosaf 400kb, jinhak 3X4, Hancom 2413 menu) are verbatim. All hub rows trace to a quote or preset: preset px/cm are shown only when quoted (passport 413×531 px; gosi 3.5×4.5 cm and 137×177 px; Q-Net 안내 없음), the formats match the quotes, and the driver-license row is 3.5×4.5 cm / 여권용.
- **Copy rules:** the brand is 문서딱. Rendered pages have no 업로드/서버/브라우저 (quotes are not rendered). No contact or operator lines. The only scripts are the first-party Base module and JSON-LD.
- **Ad slots and existing guides:** the slots render nothing (`ADS_ENABLED=false`, and the check-dist guard is present). The 14 existing guide articles are byte-equal to a fresh 3dc0796 build, apart from the CSS file name.
- **check-dist duplicate gate:** pure and deterministic, so not flaky. The max pair is photo-sizes ~ upload-limits at 0.256 / 0.45. It scans /guide/<slug>/ only, not /guide/ itself.
- **No-upload guard and CSP:** `_headers` is byte-identical, and no guard file was touched.
- **Weight 600:** none in A1 (CSS, `th` defaults to bold 700, OG unchanged).
- **Tests and visual:** unit 680/680; hubs e2e chromium 6/6 on port 4473. Visual check at 390 and 1280, light and dark, of both hubs, /guide/ and kosaf-docs: no page overflow, no console errors, and the hub tables scroll inside their box on phones.

## Cleared
Not yet. After the two Must Fix copy edits (re-run build, check-dist, unit tests), A1 can be cleared without a full re-review.

---

# Review Feedback — G2 Sprint A, A0 /hwp-viewer/ (d7e319a..be3d693)
Date: 2026-10-01
Ready for Builder: YES (no Must Fix). The deploy gate still waits on Arch's Lighthouse ruling (see Escalate).

## Gates re-run by Richard (PUBLIC_SITE_URL=https://docttak.com)
- check: 0 errors (1 hint). Unit: 669/669 (41 files). Build + postbuild (flag off): check-dist OK, 2,329 files; precache 416.6 / 450 KB; viewer initial JS +0.0 / 4 KB; controls 12.0 / 20 KB.
- e2e hwp-viewer + hwp-to-pdf on chromium, webkit and mobile-safari: 124 passed, 0 failed, 17 skipped.
- Dist legal scan: /hwp-viewer/ has HANCOM_NOTICE 4x (help, FAQ, FAQ JSON-LD, footer) and TRADEMARK_NOTICE 2x. /licenses/ has 1x each. No HTML file in dist contains 한컴뷰어 / 한컴 뷰어 / 한컴오피스. No logo; the icon is a generic page with an eye.
- Live sources (curl, 2026-10-01): every quote in the 3 guides and the store.hancom.com notice was found verbatim. Two of them are split by markup (Apple "파일 앱에 저장하기: …" and the Hancom download "…통합 뷰어입니다."), but the text is exact. The hwp-on-phone step "둘러보기" is in the Apple page (「둘러보기를 탭하십시오.」).
- Manual pass (screenshots at desktop 1366, iPhone 14 WebKit, dark on both, and the KakaoTalk iOS UA): open, search "전산" (7 hits, mark drawn) and page sheet. No horizontal overflow and 0 console errors on any of them.

## Must Fix
None.

## Should Fix
- src/tools/hwp-viewer/viewer.css (sheet head) (confidence: 9/10). On phones the bottom-sheet 「닫기」 stretches across the whole head. The cause is `src/styles/global.css:141  .btn { flex: 1 1 auto; }` inside the `display:flex; justify-content:space-between` head; the phone-dark-3-sheet screenshot shows it. Fix: add `.hv .hv-sheet-head .btn { flex: 0 0 auto; }`.
- handoff/BUILD-LOG.md "Known Gaps (A0)" (confidence: 8/10). The claim "the 2,040 ms runs coincide with the 700 UI face being requested before ui-shared" does not hold on my runs:
  - /hwp-to-pdf/ ran at 1,952 ms with the 700 face at 195 ms and ui-shared at 197 ms;
  - /hwp-viewer/ ran at 2,040 ms with ui-shared at 119 ms and the 700 face at 189 ms.
  - The LCP element is always `<p class="lead">`. Correct the note, so nobody spends Sprint B on a font fix that is not proven.
- src/content/guides/what-is-hwpx.md, FAQ 2 (confidence: 6/10). "내용은 같은 한글 문서예요." has no source. The quoted Hancom FAQ only says the conversion has "별도 기능 제한은 없습니다". Drop the sentence or reword it to the quote.
- src/content/guides/hwp-on-phone.md, Kakao FAQ (confidence: 5/10; verify). "카카오톡 화면에 나오는 저장 메뉴를 따라 주세요" claims a menu exists without a source. Telling the reader "we could not find a source" also reads oddly. Suggestion: describe only our page ("받은 파일을 휴대폰에 저장한 뒤 「HWP 파일 열기」로 골라 주세요") and keep the tried[] in BUILD-LOG.
- src/data/tools.ts hwp-viewer FAQ (confidence: 5/10). 25 MB, 150 MB, 10 MB and 60쪽 are literals; the guides check theirs through toolFacts. If LIMITS change, this FAQ drifts silently. If the existing hwp-to-pdf FAQ already follows this pattern, log it as a Known Gap rather than fixing it here.
- src/tools/hwp-viewer/thumbs.ts mini() (confidence: 5/10; owner real-device). `<svg><use href="#hv-p{i}">` makes the browser clone and paint every page in the window a second time while the list is shown. That is not an engine render, but it is more than "DOM-only" in memory terms on phones. The pixel e2e passes. Add this to the owner's iPhone/KakaoTalk check with a 60-page file and the sheet open.

## Reviewed and passing (focus items)
1. **Legal.** The notice is verbatim (it matches the live store.hancom.com page) and appears on the page, in help/FAQ/JSON-LD and on /licenses/. The trademark disclaimer is visible. "원본과 다르게 보일 수 있어요." sits next to the viewer and in help. "HWP 뷰어" appears only in the title and description as the search phrase. Nothing implies affiliation; the FAQ "한글과컴퓨터에서 만든 도구인가요? 아닙니다." helps. The guides name "한컴 다운로드 센터 / 통합 뷰어" factually, with sources.
2. **No-upload and the search worker.**
   - The worker renders a page, keeps only `glyphText` and drops the SVG string.
   - One request is in flight at a time, and texts are cached per document.
   - `run` tokens cancel the loop. Stale worker replies are dropped by the per-document worker and the `id !== docId` check.
   - Text waiters are released in releaseWaiters. With no worker, the request routes to the engine panel (e2e covers this).
   - The cap is `Math.min(count, GUARD_PAGES)` = 100, with the 「처음 100쪽에서」 status, and the e2e covers adm28.
   - The watchdog is kicked per send.
3. **boot.ts.**
   - `loading ??=` makes the load single-flight.
   - The `start` object is passed by reference, so a file picked while the import is still loading is the one handed over.
   - The listeners are detached synchronously right before init(start), so there is no double open from the boot and controller listeners.
   - A drop is kept from the browser, and a failed load shows the engine panel.
   - bfcache uses the session's own pagehide/pageshow; both bfcache e2e tests pass.
   - A file picked before the module script evaluates is the same gap the old controller module had, so there is no regression.
4. **Refactor.** The session.ts diff against the V0 controller is additive only: every new path is hook-gated, `#hw-note` is optional and warmExport defaults to true. `viewer.destroy()` drops the class removal, but its root is cleared anyway. The hwp.css addition is `.hv`-scoped. The hwp-to-pdf e2e is green on 3 projects. The visible /hwp-to-pdf/ changes are intended: RelatedTools adds the viewer, and 관련 안내 now lists the 3 HWP guides first, per the brief's NEXT_GUIDES intent.
5. **Guides.** All quotes were verified live. The Android steps describe our page only (the G page-6 rule). The KS X 6101 statement ships with fetched quotes from two Hancom pages.
6. **UX, a11y and brand.** 44 px targets, aria-pressed/expanded, the role=search form, live status and Escape on the sheet are in place, and axe passes in the e2e. Pinch zoom is not blocked. "문서딱" is used throughout. The two 해요체 lines are logged in COPY.md.

## Escalate to Architect
- **The Lighthouse LCP gate (≤ 2,000 ms median) is a coin flip on this PC, and A0 did not cause it.** I ran lhci, 3 runs per URL, Playwright Chromium 1243:

  | Build | /hwp-viewer/ | /hwp-to-pdf/ | /pdf-merge/ (untouched) |
  |---|---|---|---|
  | HEAD #1 | 1,956 | 1,955 | 1,953 |
  | HEAD #2 | 1,959 | **2,040** | **2,040** |
  | HEAD #3 | 1,956 | 1,954 | 1,958 |
  | f6b40a6 #1 | – | 1,956 | **2,040** |
  | f6b40a6 #2 | – | **2,040** | **2,040** |

  - Every single run on every page, at both commits, lands at about 1,953 or exactly 2,040 ms. That pattern is Lantern simulation quantisation, not request order.
  - At the base commit the live /pdf-merge/ page fails 2 of 2.
  - Bob's f6b40a6 /hwp-to-pdf/ figure of 2,108–2,190 ms did not reproduce: I got 1,956 and 2,040. So V0's gain is unproven on this PC, but there is no regression either.
  - My view: this does not block A0's code. You must still rule on the gate method without lowering the threshold, for example 5 runs with the median, or the CI runner as the source of truth. Otherwise the A0 deploy gate passes or fails by chance.
- The owner's real-device check (iPhone Safari + KakaoTalk in-app: open, zoom, search, copy, PDF download, sheet memory) is still outstanding before deploy, per the brief.

## Cleared
I reviewed V0, V1 and V2 in full against brief §A0, and they pass. That covers legal notices, privacy, the search worker and cap, the boot handoff, refactor equivalence, the guides' sources, and mobile, dark and KakaoTalk UX. Step A0 is clear on code; the deploy gate is pending Arch's Lighthouse-method ruling.
