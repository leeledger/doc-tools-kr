# Review Request — G2 Sprint A, A2 (spec cluster D: exam and ID photos)
Date: 2026-10-02
Ready for Review: YES

**Tree:** branch `g2-a2` from 659c04a (Arch's 3f738e4 brief commit sits under mine, untouched).
**Status:** DONE_WITH_CONCERNS. Every gate passes except local Lighthouse on /photo-compress/ (LCP 2,113 ms), which HEAD 659c04a reproduces on this PC at the same value; the CI run decides. The gate table and Step 0 table are in BUILD-LOG under "G2 A2 build notes".

## Files Changed
- `src/content/guides/{id-card-photo,history-exam-photo,korcham-photo,teps-photo,kuksiwon-photo,police-exam-photo}.md` (new): the 6 published guides. Every quote was fetched today and is verbatim (check:quotes 113/113).
- `src/content/guides/{toeic-photo,local-gosi-photo,mma-photo,teacher-exam-photo}.md` (new): drafts, each with tried[].
- `src/data/id-photo-presets.ts`: adds presets `history` (120×160), `korcham` (400×500), `teps` (126×165, 50 KB 이하) and `kuksiwon` (276×354, 3.5×4.5 cm, dpi 200), plus `A2_RETRIEVED`. `src/data/preset-ids.ts` follows.
- `src/data/guide-facts.ts:80-97`: `unitSpellings`. The fact check now reads ㎝/㎜ and capitalised units ("3Cm", "Pixel") right after a number.
- `src/data/guide-schema.ts`: the "in the future" check now compares against the KST calendar day (`KST_OFFSET_MS`).
- `src/content/hubs/photo-sizes.md`: description, answer and og updated for the new groups.
- `lighthouserc.json`, `scripts/qa/visual.mjs`: add /guide/teps-photo/.
- Tests:
  - `tests/unit/guides-schema.test.ts`: unit spellings; the A2 preset quotes state their pixels and limit; KST dates; quick-link order.
  - `tests/unit/idphoto-core.test.ts`, `tests/unit/ops.test.ts`: preset lists.
  - `tests/e2e/id-photo.spec.ts:228-241`: `?preset=<new>` is selected at load and saves the exact file.
  - `tests/e2e/hwp-to-pdf.spec.ts:433-446`: CI fix for a pre-existing race. The in-flight flag is now set on /terms/ before the test opens /hwp-to-pdf/ (BUILD-LOG "A2 CI").

## Open Questions
- Please re-check 3 quotes live. Suggested: TEPS 사진관련 (126*165 Pixel / 50KB), the 정부24 재발급 photo line (㎝), and the police 사진등록안내.
- police-exam-photo cites public.jinhakapply.com/PoliceV2. That is the 경찰청 원서접수 site, which gosi.police.go.kr frames. gosi.police.go.kr itself fails TLS verification, so check:quotes cannot fetch it.
- id-card-photo uses the generic /id-photo/ CTA and says that the passport-ratio default is not 정부24's file spec. This is the driver-license precedent; the source never says 여권용.
- /id-photo/ 관련 안내: title order now lists kuksiwon-photo and police-exam-photo instead of passport-photo and photo-kb. Arch decision (logged).

## Out of Scope (logged in BUILD-LOG)
- `check:licenses` with PUBLIC_ID_PHOTO_AUTOFRAME=1 set fails on HEAD too (CI runs it without the variable).
- Post-deploy Naver, Kakao and GSC actions are owner/PC tasks.

---

# Review Request — G2 A1 round 2 (Richard's A1 feedback)
Date: 2026-10-02
Ready for Review: YES — status DONE

- Must Fix 1 + root cause: new exact publish gate `npm run check:quotes` (`scripts/ops/source-watch.mjs --exact`; `pageTextExact`, `hasExactQuote` in `scripts/ops/lib/html.mjs`). It found 6 non-verbatim quotes (kosaf ×3, passport-photo ×1, qnet-photo ×2); all fixed from the live pages, retrieved 2026-10-02. 78/78 verbatim. Tests: `tests/unit/ops.test.ts` (live kosaf markup; the 3-space version fails exact).
- Must Fix 2 (Arch ruling): `src/data/hubs.ts` `quotedLimit()` prints each limit as the quote writes it (10MB, 5MB 이내, 25MB, 400kb 이하 …), build error if no quote holds the value; hub copy says so. Test: every limit is a substring of its own quotes.
- Should Fix, all done: photo-sizes FAQ (two unsourced rules), univ-docs-upload + upload-limits FAQ (no "varies by university" claim), kosaf source title (labelled ours: the real heading contains 업로드, banned by the plain-language test), admission-photo full preset label, kosaf-docs/univ-docs-upload category `서류`.
- Gates: check 0 errors; unit 682/682; both builds + check-dist OK (UI fonts unchanged); check:quotes 78/78; hubs e2e chromium + mobile-safari 12/12 on :4273.
- Correction to round 1: tool pages and home differ from HEAD in their guide links (intended); their CSS/JS/fonts are identical.

---

# Review Request — G2 Sprint A, A1 (seasonal, unblocked drafts, structure, hubs H1/H2)
Date: 2026-10-01
Ready for Review: YES

**Tree:** branch `g2-a1` from 3dc0796 (one commit). Nothing pushed.
**Status:** DONE_WITH_CONCERNS. Every gate passes for what A1 touches; the gate table is in BUILD-LOG "G2 A1 … Gates". Concern: local Lighthouse tool pages still sit on the 1,953/2,040 ms steps (A0 gap; A1 leaves their CSS/fonts/JS byte-identical, Base CSS hash = HEAD) — CI decides per the Arch ruling.

## Files Changed
- `src/data/guide-schema.ts` — `TOPICS` + required `topic`; `specRowSchema` (`preset` | literal px/kb/mb/mm, `format`, `fit`); `via: 'browser'` on URL sources; `guideProblems` runs `specProblems`.
- `src/data/guide-facts.ts` — `SpecRow`, `specRowFacts` (mm checks as cm or mm), `specProblems` (preset row = official, cited by this guide, no literals; literal row = every number in this guide's quotes).
- `src/data/hubs.ts` (new) — `hubRows(guides, kind)`: one row per spec row. A preset row shows px/cm **only when the preset's own quote states them** (Q-Net's 413×531 is our choice → shown as 안내 없음); limits via `presetLimit`. `HUB_KIND` = the link rule.
- `src/data/hub-schema.ts`, `src/content/hubs/{photo-sizes,upload-limits}.md` (new) — hub frontmatter: answer, FAQ, column words, captions (Korean copy stays in .md → no UI-font growth).
- `src/layouts/Hub.astro`, `src/pages/guide/{photo-sizes,upload-limits}/index.astro` (new) — tables, intro, FAQ, related, sources of every row's guide; JSON-LD Article + FAQPage + BreadcrumbList; build fails if the copy has a number the tables do not show or a spec guide lacks a row. `guide-end` AdSlot only.
- `src/content.config.ts` — `hubs` collection.
- `src/data/guides.ts` — `hubs()`, `hubBySlug()`, `topicGroups()`; NEXT_GUIDES `pdf-merge → univ-docs-upload`.
- `src/pages/guide/index.astro` — hubs first, topic jump links (`#topic-n`), groups in TOPICS order; page-local `<style>` (system font for topic names; app.css untouched). `scripts/gen-ui-font.mjs` strips `TOPICS = [...]` from the scan (UI font delta 0.0 KB).
- `src/layouts/Guide.astro` — `guide-mid` (before the 3rd H2 of the rendered body, via `Astro.slots.render`) and `guide-end` (after the FAQ). Off → byte-equal articles.
- `src/pages/{sitemap.xml.ts,llms.txt.ts,guide/rss.xml.ts,og/guide/[slug].png.ts}` — hubs included.
- `src/pages/index.astro` — home 6th guide: admission-photo (was id-photo-size).
- `src/data/quicklinks.ts` — /id-photo/ order: passport, id_card, toeic, history, gosi, qnet, korcham, admission first (skipping unshipped), then the rest, ≤ 8 (today unchanged).
- `src/data/tool-facts.ts` — `hwp.pdfMb.desktop`, `hwp.pdfPages.desktop` from LIMITS.
- `src/content/guides/hwp-to-pdf.md`, `admission-photo.md` (draft → published), `univ-docs-upload.md`, `kosaf-docs.md` (new) — every quote fetched today (BUILD-LOG "G2 A1 … Step 0").
- 14 existing guides — `topic:` added; spec rows on passport, gosi, qnet, resume (preset rows), driver-license (mm), email-attachment-limit (Gmail/Outlook MB); open-hwp-without-hangul related += hwp-to-pdf. Article HTML of all 14 byte-equal to the HEAD build.
- `scripts/lib/shingles.mjs` (new), `scripts/check-dist.mjs` — duplicate guard (5-char shingles, Jaccard ≥ 0.45 fails, max pair printed) and "no ad-slot on /guide/ while off".
- `scripts/ops/source-watch.mjs`, `scripts/ops/lib/guides.mjs` — `via: browser` → manual table, never fetched/changed/unreachable, no issue on its own.
- `src/styles/guide.css` — hub table (scrolls sideways inside its box on phones).
- `lighthouserc.json` (+ /guide/photo-sizes/, /guide/admission-photo/), `scripts/qa/visual.mjs` (+ /guide/, both hubs, admission-photo).
- Tests: `tests/unit/guides-schema.test.ts` (topics, spec fact check ±, hub values = preset/spec values, hub copy check, new tool facts, quick-link order; base fixture pinned to driver-license-photo because published[0] is now dated today), `tests/unit/ops.test.ts` (via: browser), `tests/unit/postbuild.test.ts` (hubs in RSS/sitemap/llms, hub FAQPage, link graph + orphans, no ad-slot, duplicates), `tests/e2e/hubs.spec.ts` (new), `tests/e2e/site.spec.ts` (hwp-to-pdf no longer a draft; hubs in sitemap), `tests/e2e/hwp-to-pdf.spec.ts` (관련 안내 now the 4 HWP guides).

## Open Questions
- Please re-check 3 quotes live (deploy gate 2). Suggested: kosaf "※ 규격: 300dpi로 흑백 스캔한 TIF 파일만 업로드 가능 ( 용량 400kb 이하)" (faq.do?searchType=a&searchStr=용량), jinhak "3개월 이내 촬영한 반명함판(3X4) 사진을 업로드해 주세요." (Customer/Faq?categoryid=7), Hancom 2413 "- [파일 > PDF로 저장하기] - [파일 > 인쇄 > Hancom PDF]".
- kosaf sources are FAQ **search** URLs (the FAQ has no per-item URL). They are stable GETs today; if 재단 reorders results the quote is still on page 1 because each search returns 1 item. source-watch will flag it if not.
- hwp-to-pdf quotes Hancom's 한컴오피스 2014 FAQ (the only official PDF-save answer found); the page says "2014 기준 … 버전에 따라 메뉴 이름이 조금 다를 수 있어요". OK, or Arch prefers dropping that section?
- `guide-end` sits after the FAQ inside the article, not literally "before the sources" (sources are in the aside after related). Zero output now; position matters only at ads switch-on.
- Spec rows are hub data only (no auto spec table on guides) — keeps the 11 bodies unchanged.

## Out of Scope (logged in BUILD-LOG)
- No new id-photo preset in A1 (no px/KB on 진학사/유웨이). A2 owns the preset rows.
- docs/OPS-RUNBOOK.md does not yet describe the manual "브라우저 출처" table (no browser source exists yet).

---

# Review Request — G2 Sprint A, A0 /hwp-viewer/ (round 2)

## Round 2 (Richard's 4 fixes + Arch LCP ruling) — the commit after be3d693
- `src/styles/global.css` (phone media block): `.hv .hv-sheet-head .btn { flex: 0 0 auto; }`. Covered by `tests/e2e/hwp-viewer.spec.ts` "phone width": 닫기 is narrower than 40 % of the sheet header.
- `src/content/guides/what-is-hwpx.md`: "내용은 같은 한글 문서예요." removed. `hwp-on-phone.md`: the KakaoTalk save-menu claim removed.
- `src/data/tools.ts`: `HWP_FAQ` builds the viewer FAQ numbers from `LIMITS` / `MB_DEC`. `tests/unit/hwp-viewer.test.ts` checks them.
- BUILD-LOG: the font-order theory is withdrawn (Lantern quantisation), and the Arch ruling is logged. `lighthouserc.json`: `numberOfRuns: 5` + `$comment`. `handoff/CLOUD-HANDOFF.md` §3 updated. The unproven "1,966 → 2,040" causal note is softened (BUILD-LOG V0, astro.config.mjs comment).
- Gates: check 0 errors; unit 670/670; build OK (UI fonts 184.8 KB, +0 glyphs); viewer e2e chromium + mobile-safari 42/42 (4 skipped).
- Lighthouse, 5 runs locally: /hwp-to-pdf/ median 1,956 ms; /hwp-viewer/ median 2,040 ms (1,951 / 2,040 ×4). CI decides per the ruling; it runs on push.

---

Date: 2026-10-01
Ready for Review: YES

**Tree:** branch cloud-handoff. Commits: V0 d109a7f (LCP), V1 241a438 (refactor, behaviour-free) and the V2 commit after them. Nothing is pushed.

**Status:** DONE_WITH_CONCERNS. Every gate passes except Lighthouse, which on this PC lands at about 1,953 or 2,040 ms per run on every tool page, untouched ones included.
- /hwp-viewer/ and /hwp-to-pdf/ medians are 1,951–1,959 ms in 3 of 3 targeted runs.
- In the full 14-URL run, /hwp-viewer/ got 2,040 ms, as did id-photo, pdf-compress and photo-compress. At f6b40a6, /pdf-merge/ failed 4 of 4.

The full numbers, decisions and sources are in BUILD-LOG, "A0 /hwp-viewer/ build notes".

## Files Changed
- **V0** (d109a7f) `src/pages/hwp-to-pdf/index.astro` — hwp.css is inlined (`?inline` + `<style is:inline>`). The page script is now boot.
- **V0** `src/tools/hwp-shared/boot.ts` (whole file) — imports the controller after first paint + idle, or at the first interaction. A file picked or dropped early is handed over; picker prefetch still works; a failed load shows the engine panel. Test: `tests/unit/hwp-boot.test.ts`.
- **V0** `astro.config.mjs:38-40` — boot.ts goes in the ui-shared chunk, so there is no extra request before paint.
- **V1** (241a438) `src/tools/hwp-to-pdf/*` → `src/tools/hwp-shared/*` (git mv). controller.ts became `session.ts`; `src/tools/hwp-to-pdf/controller.ts` is a thin wrapper. Each moved file got the HANCOM_NOTICE first line. Test: `tests/unit/hwp-notice.test.ts`.
- `src/tools/hwp-shared/session.ts` — the `OpenDocument` and `HwpHooks` types, `requestText`/`onText` with their own waiters (released in `releaseWaiters`), the hook calls (clearDocument, onParsed, open, onmessage), and `#hw-note` made optional.
- `src/tools/hwp-shared/viewer.ts` — the `zoomable` fixed page box, `onRendered`/`onCleared`, `pageElement()`, and destroy() no longer fires onCleared.
- `src/lib/hwp/hwp.worker.ts` — the `{type:'text', i}` request: render, `glyphText`, drop the SVG.
- `src/lib/hwp/svg-string.ts` — `glyphText` (entity decode, inner tags dropped).
- `src/tools/hwp-viewer/{app,ui,zoom,search,select,thumbs,copy}.ts` and `viewer.css` (all new) — the controller, the controls, the pure zoom/search/copy helpers, and the page list.
- `src/pages/hwp-viewer/index.astro` (new) — markup, legal lines, FAQ, QuickLinks and RelatedTools.
- `src/tools/hwp-shared/hwp.css` (last 2 lines) — keeps the picker and messages narrow in the wide viewer box.
- `src/data/tools.ts` — the `hwp-viewer` entry.
- `src/data/og.json` — the viewer image and page; the home og description shortened.
- `src/data/site.ts:21` — defaultDescription shortened (6 names; still 80–120 characters).
- `src/data/tool-facts.ts` — HWP facts.
- `src/data/guides.ts` — NEXT_GUIDES for hwp-viewer.
- `src/pages/hwp-to-pdf/index.astro` — RelatedTools adds hwp-viewer.
- `src/content/guides/open-hwp-without-hangul.md` (renamed from the hwp-viewer draft, published), `hwp-on-phone.md`, `what-is-hwpx.md` — the three new guides.
- `scripts/check-dist.mjs` (block before `count(rhwp_bg…)`) — viewer budgets.
- `lighthouserc.json`, `scripts/qa/visual.mjs` — the viewer page and states.
- `scripts/regress/hwp-viewer.mjs`, `package.json` — `regress:hwp-viewer`.
- `docs/COPY.md:8` — the 해요체 exception for the two brief-fixed lines.
- Tests:
  - `tests/e2e/hwp-viewer.spec.ts` (new, 23 tests);
  - `tests/unit/hwp-viewer.test.ts` (new: zoom, search, copy join, list window, glyphText, legal dist scan);
  - expectations extended in `tests/e2e/{site,polish,id-photo,hwp-to-pdf}.spec.ts` and `tests/unit/postbuild.test.ts`.

## Gates (all with PUBLIC_SITE_URL=https://docttak.com)
- check: 0 errors.
- unit: 669/669.
- Both builds pass check-dist. UI fonts 184.8 / 190 KB (A0 +0.0). Precache 419.1 / 450 KB. Export chunk 345.1 / 360 KB. Viewer initial JS +0.0 / 4 KB over the converter.
- licenses OK.
- e2e: 976 passed, 0 failed, 5 Firefox flaky in untouched specs, 172 skipped.
- regress:hwp full corpus: 120/120, all rules pass.
- **regress:hwp-viewer full corpus: 120/120; 2,280 of 2,280 pages drawn; page counts equal the converter's on every file.**
- qa:visual: 0 hard failures.
- source-watch: 47/47 quotes found verbatim.

## Open Questions
- **Lighthouse (above).** Superseded by the Arch ruling: median of 5 runs, CI is the source of truth.
- **Search text comes from the rendered SVG, not getPageTextLayout** (the layout misses text on 116 of 236 fixture pages). The cost is one worker render per page, limited to 100 pages and cancellable. Is that the right trade-off?
- **Copy is answered by the page** (select.ts) because browsers copy one glyph per line from rhwp's per-glyph `<text>`. Line and space heuristics: new baseline > 0.5 em; gap > 1.5 em.
- **hwp-on-phone has no Kakao or Samsung source** (tried[] in BUILD-LOG). The Kakao FAQ says so plainly.
- **Mini previews use `<svg><use>`** of the on-screen page drawing. The e2e pixel check passes on all 5 projects.
- The viewer spec runs with `reducedMotion: 'reduce'`. The site's smooth scroll raced Playwright's scroll-into-view on Firefox, and a click got lost.

## Out of Scope (logged in BUILD-LOG Known Gaps)
- The 404 map and ops `suggestTool` do not suggest /hwp-viewer/ yet.
- The hwp-to-pdf FAQ "HWP 뷰어로만" has no link to /hwp-viewer/ (the template does not render FAQ links).
- The `topic` schema field (A1).
- Owner real-device checks (iPhone Safari, KakaoTalk in-app).
- Post-deploy Kakao / Naver / GSC steps.
