# Architect Brief — SEARCH1031 (사이트 찾기: 유사어로 도구·안내 찾기)

Owner 2026-10-31 verbatim: 「기능이 많아져서 무슨 메뉴가 어디있는지 모르겠네 검색 기능을 추가해 검색기능은 키워드 매칭을 엄격하게 하지말고 유사어로 검색도 가능하도록 해야해」
Worktree `C:\dev\doc-tools-kr\wt\search1031`, branch `search1031` off main 79f5bc1. e2e: `E2E_PORT=4373`.
Parallel sprint QR1031 owns src/pages/qr-code, src/tools/qr-code, src/lib/qr and the qr-code entry in src/data/tools.ts — **do not edit src/data/tools.ts at all** (read only).

## Goal
A visitor on any Korean page can type what they want in plain words (「사진 작게」「한글 파일 열기」「누끼」「pdf합치기」「큐알」) and land on the right tool or guide with a few keystrokes + Enter, entirely on the device.

## Locked decisions
- D1 **Placement.** (a) Header on every Korean page (Base.astro): a 「찾기」 item (magnifier icon + visible text) after 안내. Without JS it is `<a href="/search/">`; site.ts turns it into a disclosure button (same pattern as the 도구 menu) opening a dropdown panel under the header that **overlays** (absolute, like `.menu-panel`) — no layout shift, closed by default, never auto-opens, nothing pushed above the tool. Opening it closes the 도구 menu and vice versa; Esc / outside click closes and returns focus to the toggle. (b) Home hero: a visible search box after `.lead`, before `.hero-cta` (static HTML, so no CLS). (c) `/search/` page. (d) 404 page body: the same box above the existing links (keeps lost visitors).
- D2 **/search/ is `noindex`** (Base `noindex`), absent from sitemap.xml, llms.txt, RSS, precache. Reason: internal search result pages are thin/duplicate (Google guidance); home + /guide/ already carry the crawlable directory; links stay followable. Static (no-JS) content: H1 「도구·안내 찾기」, the box, the full LIVE tool list (name + summary links) and a link 「안내 모두 보기」 to /guide/.
- D3 **Query never leaves the device.** Query state lives in the URL **fragment** (`/search/#q=…`, never a `?q=` query string): fragments are not sent in requests, and the GA loader already drops the hash (scripts/lib/ga.mjs builds page_location from location.href without the fragment). Inputs have **no name attribute**, so the wrapping form (role=search, action=/search/, method=get) submits no query without JS and just lands on the directory page; with JS submit is prevented. The index is fetched from a fixed URL with no query-derived part. No usage beacon, GA event or CF event for search (not even a search-used count). Verify the CF beacon does not carry the fragment (cloud e2e below); if it does, /search/ keeps the query in memory only and clears the fragment with replaceState — Bob decides by measurement and logs it.
- D4 **Lazy load, zero first-paint cost.** site.ts gets only a tiny boot (event delegation): on the first focusin / pointerdown / keydown inside a `[data-search]` root, or the header toggle click, it injects the search module once with the utm-land precedent (a `?worker&url` import of src/lib/search/ui.ts + a module script tag; **no dynamic import** — it would pull the Vite preload helper into every page, see the site.ts comment). The module then fetches `/search-index.json` once (same-origin GET; connect-src self unchanged). Text typed before the module arrives is read at init and searched. gen-sw staticClosure does not follow it, so it is not precached (verify in the precache list). sw.ts route for /search-index.json stays `default` (network + HTTP cache).
- D5 **Index = build-time endpoint** `src/pages/search-index.json.ts` (tools.ts imports tool limits — never import it client-side). Shape `{v:1,t:[{u,n,s,k,f}],g:[{u,n,q,c}]}`: tools from **LIVE_TOOLS** (flag-off tools absent automatically) — u url, n name, s summary, k keywords, f FAQ questions only (no answers); guides from publishedGuides() + hubs() — u, n title, q query (guides only), c category. Budget (check-dist): ≤ 60 KB raw and ≤ 15 KB gzip.
- D6 **Matcher = own implementation**, no dependency, in `src/lib/search/`: normalize.ts (NFKC, lowercase, strip spaces and ·-_/()「」., fullwidth to ASCII), hangul.ts (syllable to jamo, choseong string, bounded Damerau-Levenshtein on jamo), synonyms.ts (hand map, D7), match.ts (pure search(index, query) returning tools, guides, popular), ui.ts (combobox DOM). Pure modules unit-tested in Node.
- D7 **Synonym map** (src/lib/search/synonyms.ts), two tables:
  - ALIASES (equivalent spellings folded to one key before matching): pdf/피디에프/피디프; jpg/jpeg/제이펙/제이피지; png/피엔지; hwp/한글/아래아한글/한컴/한글파일; hwpx; heic/헤익/아이폰사진; qr/큐알/큐얼/qr코드/큐알코드; 누끼/누끼따기; 서명/싸인/사인/sign; 도장/인감/직인; 증명사진/증사; 여권/passport; 영문/영어/로마자; 용량/크기/사이즈/mb/kb/메가; 신분증/주민등록증/운전면허증.
  - CONCEPTS {id, terms, tools} intent groups: merge (합치기 병합 붙이기 합본 묶기 하나로 결합 이어붙이기) -> pdf-merge; shrink (줄이기 압축 작게 가볍게 낮추기 줄여 축소) -> pdf-compress, photo-compress; to-pdf (pdf로 pdf변환 pdf만들기) -> jpg-to-pdf, hwp-to-pdf; to-jpg (jpg로 이미지로 사진으로) -> pdf-to-jpg, image-to-jpg; open (열기 보기 뷰어 열람 안열림) -> hwp-viewer; split (나누기 분할 자르기 쪽 페이지 빼기 삭제 순서) -> pdf-split; lock (암호 비밀번호 잠금 해제 풀기) -> pdf-password; sign (서명 사인 도장 날인) -> pdf-sign, stamp-signature, stamp-maker; bg (배경 지우기 없애기 제거 누끼 투명) -> remove-background; idphoto (증명사진 여권사진 반명함 규격 이력서사진) -> id-photo; count (글자수 글자 세기 바이트 자소서) -> char-count; idcopy (신분증 사본 가리기 마스킹) -> id-copy; edit (글자넣기 수정 편집 쓰기 메모) -> pdf-edit; name-en (영문이름 영어이름) -> english-name; addr-en (영문주소 영어주소) -> english-address; qr -> qr-code; card (명함 전자명함) -> business-card; 위임장 / 차용증 / 사직서 퇴사 -> power-of-attorney / loan-note / resignation-letter; photo-format (사진변환 heic) -> image-to-jpg; hwpx-convert (hwpx 낮은버전) -> hwpx-to-hwp.
  - A slug not in the built index is skipped at runtime (flag-off tools). Unit test: every slug exists in TOOLS + BG_REMOVE_TOOL + ADDR_EN_TOOL + ID_CAMERA_TOOL. Bob may extend terms; never drop golden-query coverage.
- D8 **Ranking** (tokens = normalized query split on spaces, plus the whole space-stripped query as one extra token; per token take the best field hit, sum): whole query equals name (normalized) 1000; name contains token 100; concept hit for the doc (token equals/contains a concept term after alias folding) 60; choseong-only token matches name/keyword choseong 50; keyword / guide query / guide title contains token 40; fuzzy 20; summary contains 15; FAQ question contains 8. Order by tokens covered desc, score desc, name asc. Show ≤ 6 tools then ≤ 4 guides; a doc needs coverage ≥ ceil(meaningful tokens / 2). Stopwords dropped first (파일 하기 방법 법 어떻게 무료 사이트 온라인 프로그램 하는 하고 싶어요 해주세요 좀). A trailing particle (을 를 이 가 은 는 으로 로 에) is stripped from a token of ≥ 3 syllables. **Fuzzy** only for a token with no exact/alias/concept hit, against single terms (name words, keywords, concept terms): jamo distance ≤ 1 when the token has 6–11 jamo, ≤ 2 when ≥ 12, none below 6 (so 사진 never hits 사직, 합치가 hits 합치기). Choseong mode when the token is only ㄱ–ㅎ consonants and ≥ 2 long.
- D9 **UI / a11y** (ARIA 1.2 combobox): input role=combobox, aria-autocomplete=list, aria-expanded, aria-controls, aria-activedescendant; popup role=listbox with role=group sections (aria-labelledby headings 「도구」「안내」), items role=option (tool: name + one-line summary; guide: title). Down/Up move (wrap); Enter opens the active option, or the first option if none is active; Esc closes the listbox (a second Esc closes the header panel, focus back to the toggle). Click/tap on an option navigates. Polite live region: 「도구 N개, 안내 M개를 찾았어요」. Empty query on focus: 「많이 찾는 도구」 group (fixed: pdf-merge, pdf-compress, photo-compress, id-photo, hwp-viewer, jpg-to-pdf). Unique ids per instance (component prop). Input font-size ≥ 16 px (no iOS zoom), targets ≥ 44 px, 320–360 px widths with 16 px gutters, dark mode.
- D10 **Copy** (plain Korean, brand 문서딱, no 업로드/서버/브라우저/네트워크): label 「어떤 작업을 하시나요?」 (visible on home, /search/, 404; visually hidden in the header panel); placeholder 「예: 사진 용량 줄이기, PDF 합치기」; none: 「「{q}」에 맞는 도구를 찾지 못했어요. 다른 말로 찾아보거나 많이 찾는 도구에서 골라 보세요.」 + popular group; load failure: 「지금은 찾기를 쓸 수 없어요. 인터넷 연결을 확인하거나 도구 목록에서 골라 주세요.」 + link to the home tool list (static hidden markup, unhidden on script or fetch error — never silent).
- D11 **Font budget:** search text renders in the **system font** (.site-search uses the system stack of .out-links / guide prose). Add components/SiteSearch.astro, lib/search/, pages/search/ to SYSTEM_FONT_PATHS in scripts/lib/ui-font-chars.mjs (ADS1020 D9 precedent). The header 「찾기」 label: if its glyphs are already in core, normal font; else system font too. Core/late glyph counts and the preload tripwire stay unchanged.
- D12 **Ads/affiliate:** /search/ is not a content page: no AdSense, no affiliate (isContentPath and AFF placements unchanged). Home keeps its ads as today; the hero box adds nothing ad-related.
- D13 **/en/ later.** BaseEn and /embed/ get no search markup; the boot is inert without `[data-search]`. Known Gap.

## Flow
```
page load -- site.ts (tiny boot, no search code)
   | first focus/pointer/key in [data-search], or 찾기 click
   v
inject module script ui.*.js (once) --error--> D10 load-failure text
   v
fetch /search-index.json (once, no query) --fail--> D10 load-failure text (retry on next focus)
   v
input -> normalize -> alias fold -> tokens minus stopwords
      -> per doc: name / concept / choseong / keyword / fuzzy / summary / faq
      -> coverage filter -> sort -> up to 6 tools + 4 guides
   |- results -> listbox open, live count
   |- none    -> 「찾지 못했어요」 + popular
   '- empty   -> popular
Enter/click -> location = option.u   (/search/ only: replaceState fragment q as typed, per D3)
```

## Build order
1. src/lib/search/{normalize,hangul,synonyms,match}.ts + tests/unit/search-match.test.ts (golden table below) — pure, test-first.
2. src/pages/search-index.json.ts + tests/unit/search-index.test.ts (on dist: shape, flag-off absent, drafts absent, every u exists in dist).
3. src/components/SiteSearch.astro (markup + CSS; props id, variant header|page), src/lib/search/ui.ts, boot in src/lib/ui/site.ts (menu.ts interplay for the header).
4. Base.astro header item; index.astro hero box; src/pages/search/index.astro; 404 box.
5. ui-font-chars SYSTEM_FONT_PATHS; check-dist assertions (test map).
6. e2e tests/e2e/search.spec.ts + cloud assertion; OPS-RUNBOOK short section (how to add a synonym).
- Flag: tools.ts documents keywords as copywriting reference only, never a meta keywords tag — emitting them into the JSON is fine; note it in search-index.json.ts; do **not** edit tools.ts.
- Flag: header width — brand + 도구 + 안내 + 찾기 must fit at 320 px with no horizontal scroll; .nav-extra may hide earlier on narrow widths if needed. Measure, do not guess.

## Failure modes
| Path | Realistic failure | Handling | User sees |
|---|---|---|---|
| module script load | offline on a precached page; chunk 404 after deploy | script error event -> D10 text | clear message + tool list link |
| index fetch | offline / 5xx / bad JSON | catch -> D10 text; retry on next focus | clear message |
| stale index after deploy | HTTP cache serves an old JSON naming a removed page | Pages default revalidation; a removed page lands on 404, which has the box | 404 with search (no dead end) |
| flag-off tool in synonyms | concept names remove-background in a build without it | skipped at runtime; check-dist: index has no flag-off name/url | nothing |
| query leakage | GA/CF/usage carries the fragment, or a query-string submit | fragment only, no name attr, GA strips hash; e2e: no request URL/body has the query | — |
| over-fuzzy | 사진 fuzzy-hits 사직서 | D8 thresholds; negative golden test | — |
| header crowding | 4 nav items overflow at 320 px | e2e scrollWidth at 320/360 | — |
| font budget | new glyphs grow preloaded core faces | D11 system font; check-dist glyph tripwire | — |
| a11y | listbox not announced / focus lost | axe + keyboard e2e | — |
| menu interplay | both panels open; Esc closes the wrong one | mutual close; site.spec regression | — |

## Test map (new = [GAP] until built; existing = [TESTED])
- [GAP] Golden queries (unit, top-1 unless noted), index built from **all** tools incl. flagged: 사진 작게 -> photo-compress · 사진 용량 줄이기 -> photo-compress · 한글 파일 열기 -> hwp-viewer · hwp 열기 -> hwp-viewer · 배경 없애기 -> remove-background · 누끼 -> remove-background · pdf 붙이기 -> pdf-merge · pdf합치기 -> pdf-merge · 병합 -> pdf-merge · 합치가 (typo) -> pdf-merge · 서명 -> top-3 includes pdf-sign and stamp-signature · 도장 -> top-3 includes stamp-maker and stamp-signature · 큐알 -> qr-code · QR -> qr-code · jpg -> top-3 includes image-to-jpg and pdf-to-jpg · heic -> image-to-jpg · hwpx -> hwpx-to-hwp · 용량 -> top-2 = pdf-compress, photo-compress · pdf 용량 -> pdf-compress · 증명사진 / 여권사진 / 반명함 -> id-photo · pdf 비밀번호 풀기 -> pdf-password · 글자수 / 글자 수 / 자소서 글자 -> char-count · 신분증 사본 -> id-copy · 영어 이름 -> english-name · 영문 주소 -> english-address · 사진 pdf로 -> jpg-to-pdf · 한글 pdf 변환 -> hwp-to-pdf · pdf 쪽 빼기 -> pdf-split · 위임장 / 차용증 / 퇴사 -> power-of-attorney / loan-note / resignation-letter · 명함 -> business-card · ㅇㅁㅇㄹ -> english-name · 이력서 사진 -> tools include id-photo and guides include resume-photo.
- [GAP] Negatives: 사진 never puts resignation-letter in the top 6; asdfgh and ㅁㄴㅇㄹㅁㄴㅇㄹ -> none + popular; empty -> popular; a 300-char query returns in < 50 ms without throwing.
- [GAP] Unit: normalize (spaces, fullwidth, case), jamo/choseong, distance bounds, stopwords, particle strip, synonym slug validity, flag-off slug skipped.
- [GAP] dist (unit on built dist / check-dist): index shape + budgets (≤ 60 KB raw, ≤ 15 KB gzip); search module ≤ 8 KB gzip; shared site script (home initial JS) still ≤ 4 KB gzip; other initial-JS budgets unchanged; /search/ has noindex, absent from sitemap.xml / llms.txt / precache, 0 AdSense / 0 affiliate; /en/* and /embed/* have no data-search; index has no url/name of a flag-off tool (default build) and has them in the production-flag build; precache ≤ 450 KB (log before/after, default and production-flag builds); glyph counts unchanged.
- [GAP] e2e search.spec.ts (chromium, no-upload fixture): home box 「사진 작게」 -> first option 사진 용량 줄이기, Enter navigates; header 찾기 on /pdf-merge/: panel opens, Down Down Up moves aria-activedescendant, Esc closes and returns focus, aria-expanded toggles; /search/ with fragment q=pdf합치기 shows PDF 합치기 first; typing on /search/ updates the fragment; aborted /search-index.json -> load-failure text; no request URL or body contains the typed query (raw or encoded); 320 and 360 px: no horizontal scroll, panel within viewport; axe clean on /, /pdf-merge/ (panel open with results), /search/ (results and empty state); dark mode; no-JS context: header 찾기 is a link to /search/, /search/ lists tools.
- [GAP] Cloud project (GA/CF/usage-on build): /search/ with a fragment query + typing -> no stubbed GA/CF/usage request contains the query.
- [TESTED] Regression at risk, must stay green: site.spec (menu open/close/Esc), hubs, en.spec, embed.spec, preload.spec, sw.spec, ads.cloud (home ads unchanged, none on /search/), affiliate (placements unchanged), polish (a11y).

## Out of scope (Known Gaps)
- English search on /en/ (D13).
- Guide body text in the index (titles/queries only; keeps the D5 budget).
- Any query analytics (owner constraint).
- Indexable /search/ or SearchAction JSON-LD (Google retired the sitelinks search box in 2024).

## Acceptance
- Golden/negative unit tests green; full vitest green; npm run check 0 errors.
- Default, production-flag (ci.yml env) and AUTOFRAME builds: check-dist OK with the new assertions; precache ≤ 450 KB with before/after logged; glyph counts and preload unchanged.
- e2e search.spec + the regression list green on E2E_PORT=4373; cloud assertion green.
- 360 px screenshots (header panel open with results, home box; light + dark) referenced in handoff/REVIEW-REQUEST-SEARCH1031.md.
