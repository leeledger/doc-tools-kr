# Review Request — SEO-LENGTH round 2
Date: 2026-10-08
Ready for Review: YES
Status: DONE. Not committed, not pushed. (Round 1 request kept below.)

## Files Changed (round 2)
- src/tools/pdf-split/limits.ts:1-3, 8, 16-25 — `MOBILE_MAX_FILE_BYTES = 100 * MB` with the measured rationale; LIMITS.mobile.maxFileBytes reads it (PC and /pdf-merge/ unchanged).
- tests/unit/pdf-split.test.ts:10-11, 155-163 — phone 100 MB, boundary message, PDF 합치기 still 150 MB.
- src/content/guides/yearend-tax-pdf.md:3 — "간소화에 없는 서류를 함께 낼 때 볼 점" (73 chars; with "국세청 안내로" it would be 81).

## Open Questions
- None. FAQ, limit message and tool-facts already read the constant (built FAQ: "휴대폰에서 100 MB까지 열 수"); no guide cites the pdf-split limit.

## Gates
- Unit 1,239 passed; default build check-dist OK; pdf-split e2e chromium + mobile-chrome 19 passed / 1 skipped; check:quotes exit 0.

---

# Review Request — SEO-LENGTH + U2 follow-ups
Date: 2026-10-08
Ready for Review: YES
Status: DONE (details, memory numbers and gates: handoff/BUILD-LOG.md, last section). Not committed, not pushed.

## Files Changed
SEO-LENGTH
- scripts/lib/meta-length.mjs (new) — limits, metaLen, decodeEntities, head-only headMeta, metaProblems.
- scripts/check-dist.mjs:16, 92-100 — metaProblems on every page in pageHtml; one summary line (longest title / description).
- src/data/site.ts:36-41, 55, 76-77 — exported TITLE_MAX / DESC_MIN / DESC_MAX (DESC_MAX 120 → 80); TITLE_SUFFIX ` | 문서딱`.
- src/data/tools.ts:92, 117-118, descriptions 167-614, titles 242 / 364 / 444 / 613, HOME_TITLE 668 — per the brief list; doc comment 40–80.
- src/data/guide-schema.ts:33-39, 73-74, 105 and src/data/hub-schema.ts:13-23 — pageTitle (4+, title + suffix ≤ 40, message "title with suffix over 40"), description len(40, 80).
- src/content/guides/*.md (30 published) and src/content/hubs/*.md (2) — description line only; id-photo-kb title. scripts/lib/guide-titles.mjs regenerated.
- src/pages/guide/index.astro:13, src/pages/terms/index.astro:8, src/pages/licenses/index.astro:21 — descriptions per the brief.
- scripts/lib/admin-view.mjs:184 — VISITS_NOTE = the owner's sentence, exported.
- docs/COPY.md:73, 77-78 — the new rule line; 120자 → 80자.
- Tests: new tests/unit/meta-length.test.ts; guides-schema.test.ts (SEO-LENGTH data + schema messages); polish.test.ts (titles ≤ 40, endsWith TITLE_SUFFIX, TITLE_SUFFIX value, 40–80, "one more name" > DESC_MAX); bgcloud / bgremove / hwp-tool / image-to-jpg / jpg-to-pdf / pdf-password / pdf-to-jpg / stamp-signature / hwp-viewer (limits, exact titles); visits.test.ts:29, 404, 416-418 (owner note; "사람 수" checked with the note stripped); postbuild.test.ts:713 (home title), 571-575 (check-dist meta summary within limits); e2e site.spec.ts:67-68, 86-90 (title regex fixed: the old `|` was unescaped), polish.spec.ts:227, 235-236, hwp-viewer.spec.ts:506.

U2 follow-ups
- src/tools/pdf-split/controller.ts:66, 181-182, 200-201, 242, 493-494, 551, 576-577, 880-885 — MULTI_NOTE + multiNote in fileNotice (cleared in clearFile); pump() idle while 'working', resumed by setState('ready'); bulk remove moves focus to 모두 선택, else the first 되살리기.
- src/pages/pdf-split/index.astro:105 — aria-describedby="ps-hint" on #ps-run.
- tests/e2e/pdf-split.spec.ts:170-182, 225-226, 236-247 — focus after bulk remove (both branches); aria-describedby; two dropped PDFs keep the notice after the open.

## Open Questions
- Memory (U2 item 3): peak ~0.86–1.03 GB in the renderer for a 141 MB PDF in Pixel 7 emulation (ready ~0.39 GB); pausing thumbnails changes nothing measurable (kept as cheap hygiene). Arch: acceptable at the 150 MB mobile limit, or close the pdf.js doc during save / lower pdf-split's mobile limit?
- Guide descriptions not spelled out in the brief: please spot-check the source-name trims (kuksiwon-photo without the agency name; driver-license-photo "도로교통공단 안내"; open-hwp-without-hangul "한컴 뷰어").
- 배경 지우기: no cloud-on description variant exists (only FAQ answers branch), so nothing had to be escalated.

## Out of Scope (logged in BUILD-LOG)
- ga.test.ts needs public/ in the no-flag prebuild state (pre-existing).
- Real-phone memory measurement.
