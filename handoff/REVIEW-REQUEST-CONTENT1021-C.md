# Review Request — CONTENT1021 Step C
Date: 2026-10-21
Ready for Review: YES
Status: DONE_WITH_CONCERNS (not committed; full e2e/LHCI not completed locally, see Gates)

## Scope
D8 tool notes: a `toolNotes` collection (one Markdown file per Korean tool page, 22) rendered by `src/components/ToolNotes.astro` as `<section class="tool-notes">` between section.why and section.faq; every Korean tool page now ≥2,000 (metric T); LENGTH_PENDING is empty (Step D deletes it). D10 precache move applied (/stamp-signature/).

## Tool pages (toolBodyChars, before → after)
Default build (flag-off): char-count 676 → 2,097 · english-name 979 → 2,086 · hwp-to-pdf 1,194 → 2,115 · hwp-viewer 1,317 → 2,151 · hwpx-to-hwp 1,057 → 2,095 · id-copy 834 → 2,103 · id-photo 1,712 → 2,396 · image-to-jpg 1,034 → 2,067 · jpg-to-pdf 962 → 2,076 · pdf-compress 1,191 → 2,166 · pdf-edit 937 → 2,076 · pdf-merge 741 → 2,109 · pdf-password 849 → 2,086 · pdf-sign 1,024 → 2,161 · pdf-split 941 → 2,069 · pdf-to-jpg 929 → 2,088 · photo-compress 1,056 → 2,108 · power-of-attorney 945 → 2,102 · stamp-maker 918 → 2,099 · stamp-signature 851 → 2,101.
Flagged builds: english-address 752 → 2,055 (checks build and cloud build) · remove-background → 2,064 (PUBLIC_BG_REMOVE=1 and checks builds), 2,195 (cloud build; its why block is longer there).

## Files Changed
- src/content/tool-notes/{22 slugs}.md — new. Per tool: 「…은 이럴 때 씁니다」, 「휴대폰과 PC에서 … 순서」 (button/label names copied from the page markup and controller strings), a tool-specific section (e.g. 저장 방식 differences, 선명도, 용지/여백, 크기와 여백, 상세주소 변환표, 모양 고르기), 「결과가 이상할 때」 (the tool's real messages quoted), 「주의할 점」, links to the owning guide instead of repeating its tips. 합니다체 like the rest of the tool page (docs/COPY.md 「도구 페이지」). No new number with a unit except tool limits backed by `toolFacts` (pdf-compress 0.5~100 MB, photo-compress 10–20,000, pdf-password 4–64자, power-of-attorney 6줄) — no `sources`, so check:quotes is unaffected.
- src/data/tool-note-schema.ts — new: zod `toolNoteSchema` (`sources`, `toolFacts`, strict, default []).
- src/data/tool-notes.ts — new: `NOTE_SLUGS` (TOOLS + the two flag-gated pages) and `toolNoteProblems(slug, data, body)` (unknown slug, wrong/unknown tool fact, `unsourcedFacts`).
- src/content.config.ts — `toolNotes` collection.
- src/components/ToolNotes.astro — new: getEntry, throws (build fails) on a missing note or any problem; section labelled by the note's first H2.
- src/pages/{20 tools}/index.astro, src/tools/remove-background/page.astro, src/tools/english-address/page.astro — import + `<ToolNotes slug={tool.slug} />` right before section.faq (id-photo: after its 「이 도구가 확인할 수 없는 조건」 block, still between why and faq).
- src/styles/app.css:99-104 — `.tool-notes` block styles; :491-493 — `.tool-notes` added to the system-font rule in the UI-font stylesheet (the .site-info / guide-prose pattern), so note text never needs the UI font.
- src/data/tools.ts — `updated: '2026-10-21'` on all 22 tools (sitemap lastmod; COPY.md release checklist). Digits only: no glyph change.
- scripts/lib/guide-length.mjs:13-22 — LENGTH_PENDING emptied (+ `@type {Set<string>}` so `astro check` does not infer `Set<never>`).
- scripts/lib/guide-check.mjs:69-72 — `toolNotes(html)`: inner HTML of section.tool-notes.
- scripts/check-dist.mjs:843-846 — every built Korean tool page must have section.tool-notes; D5.5 `sharedBlocks` across the 22 notes (no ≥60-code-point p/li block in two notes).
- scripts/lib/en-check.mjs:4, 111-112 — id parity with the Korean twin ignores ids inside section.tool-notes (the notes' Markdown heading ids; English pages have no notes).
- scripts/gen-sw.mjs:57-61 — `/stamp-signature/` in NOT_PRECACHED (D10, pre-locked); src/sw/sw.ts:33-36 — and in RUNTIME_PAGES (stored when visited).
- tests/unit/tool-notes.test.ts — new: 22 notes = NOTE_SLUGS, schema + problems pass, failure cases, copy bans on the Markdown, toolNotes helper.
- tests/e2e/hubs.spec.ts — new test: /pdf-merge/ notes between why and faq, not in the UI font.
- tests/unit/en-check.test.ts — tool-notes ids not required on the English twin.
- tests/unit/guide-length.test.ts:29-31 — asserts LENGTH_PENDING is empty.
- tests/unit/postbuild.test.ts — precache: /stamp-signature/ not precached; font-coverage test: tool-note H2s are system font, every other tool-page H2 stays in the UI font.
- tests/unit/bgremove.test.ts:842, tests/unit/pdf-password.test.ts:190 — /stamp-signature/ now NOT_PRECACHED (were asserting it precached).

## Decisions (logged in BUILD-LOG)
1. **Voice:** notes use 합니다체 (docs/COPY.md: tool-page body 합니다체); the brief's heading words 「이럴 때 써요」 etc. became 「이럴 때 씁니다」, 「휴대폰과 PC에서 … 순서」, 「결과가 이상할 때」, 「주의할 점」, each prefixed by the tool name in the first H2.
2. **UI font:** note text lives only in .md (gen-ui-font scans .astro/.ts/.json/.css) and renders under `.tool-notes`, a system-font selector in the UI-font stylesheet (check-dist only honours exemptions there). The component and the two .ts files carry no Korean outside whole-line comments. Verified: `uiCharSets` core/late sets identical to HEAD (616/81 code points, a HEAD worktree with the same src/generated), preloaded faces 92.1 KB default / 92.2 KB flagged builds, budget 92.66 unchanged.
3. **Flag-gated notes:** remove-background's note never names the processing mode (no 「보내」/「기기에서 처리」 wording, valid in cloud and local builds); english-address's never repeats 「…주소 검색으로 보내」 nor 「보내지 않아요」. Unit test asserts both (plus JARGON, CLAIM_RE, EXCEPTION_RE, 인감 on power-of-attorney, the english-name and stamp-maker bans) on the Markdown, because the default build never renders those two notes.
4. **D10:** default build hit 451.1 KB with notes → /stamp-signature/ moved out of the precache as pre-locked. Now: default 419.1 KB, PUBLIC_BG_REMOVE=1 422.8 KB, checks build 426.0 KB, prod-like cloud build 430.5 KB (all /450). /photo-compress/ stays precached.
5. **No FAQ JSON-LD change:** notes are not FAQ items; tools.ts FAQ untouched (it is UI-font text).
6. **No unsourced institution claims:** institutional statements I could not source were cut or rewritten as advice (e.g. 대리인 준비물, 공백 포함 「most common」, 택배/통관 lines). Behaviour claims were checked against code (e.g. pdf-sign places one picture per run, 날짜 도장 layout, 상세주소 conversion rules, merge bookmarks, pdf-to-jpg range parser accepts 「~」 and spaces, id-copy file name has the date only).

## Gates
- npm run check: 0 errors, 0 warnings (11 hints, pre-existing).
- npm test: 95 files, 2,093/2,093.
- Builds + check-dist OK: default (PUBLIC_SITE_URL=https://docttak.com), PUBLIC_BG_REMOVE=1, checks build (BG + ADDR_EN + officer/email), prod-like cloud build (CI cloud env). `node scripts/guide-length.mjs --tools`: every Korean tool page ok in each.
- check:quotes --exact: 585 quotes verbatim. check:licenses OK.
- Playwright chromium (default dist): full project run reached 163/550 with 0 failures (pdf-merge … hwpx-to-hwp specs, no-upload fixture on each) when the host killed it for low memory; not restarted. New test hubs.spec.ts 「CONTENT1021 D8」 passes.
- LHCI on 3 tool pages: not run (same memory condition). Notes are below the fold (after why), system font, no new script; CI's LHCI covers all tool pages.

## Open Questions
- Richard: please read the 22 notes for any sentence that states a vendor/OS menu or an institution's rule as fact; I avoided them, but this is the class of finding from B1/B2.
- The id-photo note is the shortest (681 chars of note; page 2,396) — it leans on the hub/guide links rather than restating rules.

## Out of Scope (logged in BUILD-LOG)
- Step D items carried: delete LENGTH_PENDING; 년/시 units; sibling-tip owners across guides.
- qa:visual light/dark on 2 tool pages not run (owner's Chrome needed for the skill's screenshots); the notes reuse h2/p/ul/ol styles already on the page.

---
## Round 2 — 2026-10-21
Ready for Review: YES

- Orchestrator decision: D8 device-neutral phone/PC steps + guide links accepted (logged in BUILD-LOG).
- src/content/tool-notes/image-to-jpg.md step 4 — headline and ZIP name follow the chosen format (messages.ko.ts:85-86, convert.ts:38).
- src/data/tool-facts.ts — `pdf-compress.targetMbBytes`, `pdf-edit.maxItems`, `char-count.goalMin`, `char-count.goalMax` (read from TARGET_MB_BYTES, MAX_ITEMS, GOAL_MIN/GOAL_MAX); listed in pdf-compress, pdf-edit, char-count notes.
- tests/unit/tool-notes.test.ts — every numeric toolFact a note lists appears in its body (ko-KR formatted).
- tests/unit/pdf-password.test.ts — /stamp-signature/ in RUNTIME_PAGES and NOT_PRECACHED.
- src/pages/power-of-attorney/index.astro:51 — fieldset id `pa-group-<id>`; the duplicate `id="pa-task"` is gone and 「부탁할 일」 labels the textarea (no selector used the group ids).
- Gates: check 0/0; vitest 2,095/2,095; default + PUBLIC_BG_REMOVE=1 builds with check-dist OK; e2e power-of-attorney.spec.ts chromium 9/9. Full e2e/LHCI left to CI.
