# Review Request — TOOL-GUIDES Part A + B
Date: 2026-10-10
Ready for Review: YES
Status: DONE (Part A: 5 guides published; Part B: remove-background published behind the flag). Nothing drafted.
Brief: handoff/ARCHITECT-BRIEF-TOOL-GUIDES.md. Not committed (orchestrator owns commits). Note: HEAD moved to 96010df (CI timeout commit, not mine) during the work.

## Part A — five tool how-to guides (commit 1)

### Files Changed
- src/content/guides/jpg-to-pdf.md (new) — 「아이폰·갤럭시 사진 PDF로 만드는 법」. Non-tool H2s: iPhone 미리보기 앱 내보내기 → PDF (+ 파일에서 삽입) and Galaxy/Android Chrome 인쇄 → 「PDF로 저장」 (Apple iph61c20afe1, iphbf4977cff, iph7239ea3b5; Google Chrome 고객센터 1069693 Android). 안 될 때 = HEIC / corrupt / 「…장은 추가하지 않았습니다」 / oom messages. 다른 방법 = 문서 스캔, JPG로 받는 곳, PDF 합치기. toolFacts 6 refs.
- src/content/guides/pdf-to-jpg.md (new) — 「PDF를 JPG 사진으로 바꾸는 법 (휴대폰·PC)」, query 「pdf jpg 변환 휴대폰」. H2 「한 쪽만 사진으로 필요할 때」 (long tail), iPhone 미리보기 내보내기 → JPEG with 해상도/크기 (Apple iph61c20afe1). 안 될 때 = fileLimit / runLimit / draw / password / copy-restriction / corrupt messages. 다른 방법 = text becomes a picture (product behaviour only). toolFacts 5 refs.
- src/content/guides/pdf-split.md (new) — 「PDF 페이지 삭제·추출·회전하는 법」. Body uses COPY.md words (빼기/돌리기/쪽 그림; query words only in title/description and H2 parentheses). iPhone 미리보기 페이지 삭제·회전·이동·실행 취소 (Apple iphbf4977cff). 안 될 때 = fileLimit / 「쪽을 하나 이상 남겨 주세요」 / partsLimit / thumbs notice / oom / signed-document messages. toolFacts 4 refs.
- src/content/guides/pdf-sign.md (new) — 「PDF에 서명·도장 넣는 법 (휴대폰·PC)」, tools [pdf-sign, stamp-signature]. iPhone 마크업 「서명 추가」 (Apple iph1d3607e5c, 5 quotes). 다른 방법 = 인증서 전자서명 → links /guide/e-signature-law/ without restating its law quotes; signed certificates. No legal-effect claim (COPY.md U3). toolFacts 2 refs.
- src/content/guides/hwpx-to-hwp.md (new) — 「HWPX 파일 HWP로 바꾸는 법 (한글 없이)」, query 「hwpx 파일 hwp로 바꾸기」 (the tool h1 is 「HWPX HWP 변환」). Duplicate guard met with ONE NEW Hancom source: 한/글 도움말 「다른 이름으로 저장하기」 https://help.hancom.com/hoffice120/ko-KR/Hwp/file/save_as/save_as.htm (5 quotes: save-as changes the format, the menu path, 「한/글 문서(*.hwp)」, the 97 format warning, 「한/글 표준 문서(*.hwpx)」). The default-format setting (FAQ 2784) is one sentence linking /guide/what-is-hwpx/. 안 될 때 = HX_COPY / hwp-shared ERRORS lines. toolFacts hwp.maxMb.desktop/mobile (the refs the tool FAQ uses; the brief's ref list had none for this tool).
- src/content/guides/what-is-hwpx.md:13,73 — related +hwpx-to-hwp; one sentence in 「저장 형식을 바꾸는 법」 linking /guide/hwpx-to-hwp/. Nothing else.
- src/content/guides/{stamp-image,e-signature-law}.md:13 (+pdf-sign), {hwp-on-phone,open-hwp-without-hangul}.md:13 (+hwpx-to-hwp), {heic-to-jpg,univ-docs-upload}.md:13 (+jpg-to-pdf), email-attachment-limit.md:13 (+pdf-split) — reverse related links per brief; all ≤4.
- src/data/tool-guide-order.ts:11-16 — TOOL_GUIDE_PINS for the five tools (own guide).
- scripts/lib/guide-titles.mjs — regenerated (node scripts/gen-guide-titles.mjs; includes Part B's title too, see Part B).
- tests/unit/guides-schema.test.ts:19 (getTool import) and the describe 「TOOL-GUIDES: one how-to guide per tool」 — pins put the own guide first; guide title ≠ tool title, guide query ≠ tool h1, tools[0] and cta are the tool.
- tests/unit/postbuild.test.ts:1116-1121 — `firstGuide` helper + test 「TOOL-GUIDES: each tool page … lists that guide first under 관련 안내」 (built HTML).
- tests/e2e/growth.spec.ts:141-154 — the five guides: answer visible, CTA lands on the tool, the tool page's first guide link is the guide.

## Part B — remove-background guide behind PUBLIC_BG_REMOVE (commit 2, droppable)

### Files Changed
- src/data/guide-schema.ts:76-90 — `requires: z.literal('bg-remove').optional()` (`requiresFlag`), FLAG_TOOLS map, pure `isVisibleGuide(data, bgRemoveOn)`; :111 and :130 the field on the published and draft schemas; :142 guideProblems takes optional related/requires; :154-163 allowed tools/cta = LIVE + remove-background only with requires; a guide without requires that names remove-background in tools, cta or related → 「names "remove-background" without requires: bg-remove (needs requires: bg-remove)」.
- src/data/guides.ts:4,12-13,17 — `isPublished` = `isVisibleGuide(e.data, __BG_REMOVE__)`. Every consumer already goes through publishedGuides (grep: getCollection('guides') only in guides.ts): /guide/, [slug] paths, sitemap, RSS, llms.txt, OG png, guidesForTool, guidesBySlug, hubs, 404.
- scripts/lib/bgcloud.mjs:61-63 — LOCAL_SCOPE_RE: `^guide\/(?!remove-background\/)[^/]+\/index\.html$`, so the cloud build scans that guide for claims. EXCEPTION_PAGES unchanged.
- src/content/guides/remove-background.md (new) — `requires: bg-remove`; 「누끼 따기 쉽게 하는 법, 사진 배경 지우기」, query 「누끼따기 사이트」. Non-tool H2: iPhone 사진 앱 대상체 분리 + 미리보기 「배경 제거」 (Apple iphfe4809658, iphf1900dea2). 안 될 때 = nosubject / animated / not-image / encode lines (true in both cloud and device mode; no cloud-only lines). 다른 방법 = 여권·증명사진 with the passport.go.kr menuPos=12 quote the tool FAQ already links; stamps → stamp-signature. Says nothing about where the photo is processed (no claim, no sending explanation). No toolFacts (no refs exist; no numbers used).
- src/data/tool-guide-order.ts:17-18 — pin 'remove-background'.
- tests/unit/guides-schema.test.ts (isVisibleGuide / BG_REMOVE_TOOL imports; describe 「TOOL-GUIDES Part B」) — the guide parses with __BG_REMOVE__ false; isVisible(false) false / (true) true; draft never visible; tools/cta/related without requires → error, with requires → clean; no flag-off guide body/FAQ links /remove-background/; every related slug is visible in both flag states.
- tests/unit/bgcloud.test.ts:425-427 — LOCAL_SCOPE_RE skips guide/remove-background/index.html, still matches other guides (incl. a look-alike slug).
- tests/unit/postbuild.test.ts:20,889-892 — helper `publishedGuides()` = visible in the dist under test (`bgBuilt()`); `allPublished()`. Test 「TOOL-GUIDES Part B」 (1123-1138): flag on → page exists, sitemap / /guide/ / RSS / llms.txt name it, its tool page lists it first; flag off → no page, no OG png, none of those four texts contain 'remove-background'. Link-graph test (1186-1189): requires guides are exempt from the "linked from another guide" rule and must instead be linked from their tool page (see Open Questions).
- tests/e2e/remove-background.spec.ts:281-293 — bg-chromium / bg-mobile-safari: /guide/ lists it, CTA lands on /remove-background/, whose first guide link is the guide.
- Dropping Part B: revert the files above, delete remove-background.md, remove its pin, rerun gen-guide-titles.

## Verification
- check:quotes (source-watch --exact): 178 quotes verbatim, exit 0 (before: 148; +30 new: A 24, B 6). 8 browser-only quotes unchanged.
- astro check: 0 errors. vitest: 62 files / 1,340 passed after the BG=1 build (CI checks-job order). On the flag-off dist: 1,339 passed, 1 failed = ga.test 「gen-ga writes the loader; check-dist passes」, which fails identically on an untouched HEAD export in this environment (public/vendor has no birefnet after a flag-off copy-vendor); passes in CI order.
- Four builds, check-dist OK each. Longest title 40 / description 79 (existing pages); new guides: titles 26–34 incl. suffix, descriptions 69–76. Guide similarity max 0.215 (unchanged pair).
  | build | files (HEAD → now) | precache KB (HEAD → now) | core UI font chars |
  |---|---|---|---|
  | noauto (autoframe 0) | 2419 → 2429 | 431.5 → 431.7 | 603 → 603 |
  | dist (autoframe 1) | 2426 → 2436 | 433.7 → 433.8 | 607 → 607 |
  | bg | 2437 → 2449 | 434.9 → 435.1 | 604 → 604 |
  | bgcloud | 2439 → 2451 | 437.8 → 437.9 | 604 → 604 |
  Precache +0.1–0.2 KB is the build-id string (HEAD export built as "dev"); guide pages are not precached. Core font unchanged: guide .md is not scanned and the new tool-page 관련 안내 titles pass fontcover.
- E2E (retries 0): growth + site + hubs + polish × chromium, mobile-chrome, webkit: 424 passed, 10 skipped, 1 failed = webkit growth:71 share (navigator.share), passed alone and in a full webkit growth re-run (13/13); unrelated to guides. remove-background.spec on bg-chromium + bg-mobile-safari (non-@model): 12/12.

## Open Questions
- Link-graph rule vs Part B: the brief forbids any existing guide from listing remove-background, but the G2 A1 test required every guide to have an in-link from another guide or hub. I exempted `requires` guides and require their tool page link instead. Alternative is a conditional hub/guide link; Arch to confirm.
- jpg-to-pdf.related has a 4th slug, pdf-to-jpg (brief list had 3): pdf-to-jpg was otherwise an orphan (no free related slot in photo-kb, kakao-photo, pdf-compress, pdf-merge).
- hwpx-to-hwp uses toolFacts hwp.maxMb.* (not in the brief's ref list, but existing refs read from the tool's own limits).
- iPhone 「미리보기」 app steps come from the current iPhone 사용 설명서 (iOS 27 pages). The guides say menu names may differ by iOS version; no version number is claimed. Galaxy has only the Chrome (Google) method: Samsung support pages were not fetched (no search route found); Adobe helpx returns 403 to the source-watch UA, so Acrobat was not used.
- Please diff each FAQ against tools.ts: I avoided restating the tool FAQ (e.g. pdf-sign has no 인증서/JPG-white/여러 쪽 questions; pdf-to-jpg no 쪽마다/선명도 questions).

## Out of Scope (logged in BUILD-LOG)
- Home 「자주 찾는 안내」 unchanged (owner); swap admission-photo → remove-background stays an owner option.
- ga.test local failure on a flag-off workspace (pre-existing, environment).

## TOOL-GUIDES round 2 (2026-10-10)
- src/content/guides/jpg-to-pdf.md:30 — the Chrome (Android) quote now runs from the 「인쇄」 step through choosing the printer to 「PDF로 저장」, verbatim and in one piece: "인쇄 인쇄 를 탭합니다. … 상단에서 프린터를 선택합니다. 인쇄 미리보기를 PDF로 저장하려면 PDF로 저장을 탭합니다. …". The doubled words come from the page's icon labels and are kept as the page shows them. :88 step 3 now reads 「위쪽 프린터 선택에서 「PDF로 저장」을 고르고 …」 to match "상단에서 프린터를 선택합니다".
- src/content/guides/remove-background.md:21 — Apple quote extended with "대상체 주위에 테두리가 나타날 경우, 다음 중 하나를 수행하십시오." (backs 「테두리가 나타나면」, :63).
- check:quotes 178 verbatim, exit 0 (both quotes were extended in place, so the count is unchanged); guides-schema 33/33; default build check-dist OK (2429 files, precache 431.7 KB).
