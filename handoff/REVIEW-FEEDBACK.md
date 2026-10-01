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
