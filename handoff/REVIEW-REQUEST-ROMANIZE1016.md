# Review Request — ROMANIZE1016 R0–R3 (영문 이름 변환기 /english-name/, deploy A)
Date: 2026-10-16
Ready for Review: YES
Status: DONE (all listed gates green; R4 guide not started, as briefed)
Branch: romanize-1016 (worktree wt/romanize-1016), commits cd2e65d (R0), 4c83b7d (R1), 0601e70 (R2), 9577eba (R3). Not pushed.
Brief: handoff/ARCHITECT-BRIEF-ROMANIZE1016.md. Log: handoff/BUILD-LOG.md, sections 「ROMANIZE1016 — brief」 and R0–R3.

## Files Changed
R0 (data + sources)
- src/tools/english-name/mofa.ts:1-155: SURNAMES (20) and GIVEN (100) from the 외교부 PDF evidence text, written by a script. A spelling's column comes from the 합계 that reproduces its printed 비율. MOFA_LIST metadata.
- src/tools/english-name/sources.ts:1-54: TOOL_SOURCES (S1 kornorms, S2 menuPos=37, S3 menuPos=36, S4 menuPos=39 quotes; S5 PDF marked `via: 'browser'`) and the URL constants.
- scripts/ops/lib/guides.mjs:110-160: TOOL_SOURCE_FILES, parseToolSources, readToolSources; watchList(guides, presets, tools = []).
- scripts/ops/source-watch.mjs:4-5, 11, 92: the watch reads the tool sources too.
- tests/unit/english-name-data.test.ts:1-91: proves the transcription against the evidence text (282 rows, 120 totals, ratios ±0.01, the negative marks). Also tests the parser and the watch list.
- tests/unit/ops.test.ts:220: the mocked run passes `tools: []`.

R1 (engine)
- src/tools/english-name/romanize.ts:1-93: letter tables, standalone finals, liaison and ㄹㄹ only between two 표기법 syllables of one part, normalize / validate.
- src/tools/english-name/options.ts:1-113: surname and syllable choices, 직접 쓰기, composeGiven (three shapes + segments), formatName (case), NEGATIVE / SINGLE, warningsFor.
- tests/unit/english-name.test.ts:1-280: tests every 받침 (standalone, end, hyphen, space, before ㅇ, before a consonant), the brief's sets, all 11,172 syllables and the 28-row oracle with the logged deviations.

R2 (page + registration)
- src/pages/english-name/index.astro:1-140: form (no name / action), result card, static source line, how-to, 알아 두면 좋아요, FAQ, RelatedTools (id-photo, id-copy, char-count); R3 adds the chain block.
- src/tools/english-name/controller.ts:1-313: debounce and IME handling, choices UI (native radios), rows, warnings, owner note and links, copy with the refused fallback, paste split, live region at most once per second.
- src/tools/english-name/english-name.css: page-only styles (inlined).
- src/data/tools.ts:694-740: the tool entry after id-copy (D1 copy, FAQ 6).
- src/data/site.ts, src/data/guides.ts (NEXT_GUIDES), src/data/og.json, lighthouserc.json, scripts/qa/visual.mjs, scripts/gen-sw.mjs, src/sw/sw.ts, scripts/lib/bgcloud.mjs, CLAUDE.md line 3, docs/COPY.md (영문 이름 line): the registration list.
- scripts/check-dist.mjs:27-28, 741-770: english-name block (one owning chunk, no storage / history, form without action / name, banned words, N% only from mofa.ts, budget 22.2 KB).
- scripts/lib/usage.mjs:78-84, 121, 256-259, 278, 365, 476-478, 615: whitelist (TOOLS, NAME_FORMS as `form`, DOWNLOAD_SETTING, o / v allowed on that download only, settings query counts start OR download, SETTING_VALUE_LABELS). This is the server half of D6, moved into R2 because usage.test demands every live tool.
- src/lib/ui/usage.ts:13-19, 43, 101-103: client types and buildPayload for the english-name download.
- tests: e2e english-name.spec.ts, site.spec / polish.spec lists, unit postbuild / bgcloud / polish / usage.

R3 (usage calls, chain, inbound)
- src/tools/english-name/entry.ts:1-18: startUsage; start (onResult), download o=form (onCopy), next v=id-photo once.
- src/pages/english-name/index.astro (#en-chain): the 「여권을 만든다면」 block with the guide list in `.en-guides`.
- src/styles/app.css:486: `.en-guides` added to the system-font rule, because a guide title has non-core glyphs.
- src/components/IdPhotoTool.astro:170 and src/tools/id-photo/controller.ts:48, 136-137, 663-672: the passport_online result line 「여권 영문 이름도 정해야 한다면 영문 이름 변환기」.
- src/content/guides/{intl-driving-license,passport-photo,passport-reissue-photo,baby-passport-photo}.md: one body sentence each, `updated` 2026-10-16.
- tests/e2e/usage.spec.ts (영문 이름 변환기 test), tests/e2e/english-name.spec.ts (chain + inbound tests), tests/e2e/id-photo.spec.ts (passport line test).

## Gates (local Windows, 2026-10-16)
- astro check: 0 errors, 0 warnings.
- vitest: 85 files, 1,896 passed.
- check:licenses: OK. 54 packages, no new dependency.
- check:quotes --exact: 262 quotes verbatim.
- check-dist: OK on all three builds. The default build is AUTOFRAME=0.
  - Precache (KB, limit 450): default 427.8, autoframe 430.0, cloud 437.5.
- UI font: 0 new core glyphs (gen-ui-font core 619 = STAMP1015). Preloaded fonts 94,864 B against the 94,884 B tripwire, margin 20 B (unchanged).
- e2e:
  - english-name, 5 projects: 77 passed, 3 skipped (clipboard read is Chromium-only).
  - site + polish + growth + chain, chromium: 190 passed, 2 skipped.
  - usage.spec, 5 cloud projects: 152 passed, 6 skipped, 2 flaky. Both flaky tests were on cloud-firefox and unrelated to this tool; both passed alone with retries 0.
- LHCI /english-name/ (5 runs): performance 1, accessibility 1, best practices 1, SEO 1. LCP median 1,682 ms, CLS 0.0003.

## Open Questions
1. **Usage server change (D6).** `download` may now carry o / v, but only english-name → form (DOWNLOAD_SETTING). The admin 「많이 쓴 설정」 query now counts `start OR download`. VALUE_LABELS is keyed by value, so `space` was already 「공백 포함」 (char-count). SETTING_VALUE_LABELS overrides it per setting. Is this the shape you want, or should the copy shape go as a `start`-style setting? Please also check the validate change at usage.mjs:256-259.
2. **Placeholders.** The static placeholders are 「예: 이」 / 「예: 서연」, not the brief's 「예: 홍」 / 「예: 길동」. 홍 is not a core glyph, so it loaded the late face at page load and failed polish.spec. Is this deviation acceptable to Arch?
3. **ㄹㄹ rule.** ll is also written after a double final whose standalone value is l (ㄼ ㄽ ㄾ ㅀ) before ㄹ. The brief names only ㄹ + ㄹ. Is that reading right?
4. **Syllable rows.** A row shows only when the list adds a spelling the 표기법 does not give (민 → no row). A listed 표기법 spelling appears once, as the 표기법 choice with its 비율. Is that UX acceptable?
5. **id-photo RelatedTools.** id-photo has no `only` list, so english-name appears in menu order there, not last as D5 says. Should id-photo's whole list be pinned for this one position?
6. **Unverified (a).** 고시 제2024-27호 could not be confirmed. The kornorms page lists only 제2014-42호, and the law.go.kr search is script-rendered. Our copy cites no number.
7. **R4 note.** Arch's evidence text for menuPos 36/37 has spaces where the pages have inline tags. The verbatim forms are 「허용됩니다」, 「표기하여야 하며」 and 「수단일 뿐이며」. R4 quotes must use those forms.

## Out of Scope (logged in BUILD-LOG)
- R4 guide passport-english-name (deploy B).
- tool-facts and tool-guide-order entries: nothing quotable yet, and no guide names the tool.
- The brief's Known Gaps: /en/ twin, name-first order, hyphenated or spaced surnames, 「spouse of」, 한자 input, McCune-Reischauer, ?name= links, embed, surnames beyond S5, "reads oddly" heuristics.
- Post-deploy items: live smoke on phone and PC, IndexNow, the Naver 수집 request, view-source check (e), and O3 real-device tests (owner).
