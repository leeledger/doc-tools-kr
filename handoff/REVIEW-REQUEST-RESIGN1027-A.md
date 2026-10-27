# Review Request — RESIGN1027 Step A (engine presets + 사직서 spec; no page, no deploy)
Date: 2026-10-27
Ready for Review: YES
Status: DONE

## Files Changed
- src/lib/form/spec.ts:37-53 — `FormField.presets?: FormPreset[]`, `FormPreset {chip, fill}`, `PRESETS_MAX = 8` (R5).
- src/lib/form/spec.ts:104-112 — lint doc comment: slot-only home rule + presets rules.
- src/lib/form/spec.ts:126-135 — presets lint: text/multiline only; 1–8; chip and fill non-empty; fill ≤ maxLength (code
  points); fill lines ≤ maxLines (text: 1).
- src/lib/form/spec.ts:138, 149, 159 — a field with no table row / date line counts as placed when exactly one para slot
  holds it (`homes ?? slotted ?? 0`). Needed for 「{to} 귀하」: R3 gives 받는 사람 no table row, and the old lint required
  one home per field. A table field also in a slot ({leaveDate}) is still counted once (homes wins).
- src/components/FormTool.astro:9-10, 64-69 — under a field with presets: div.pa-presets (role=group, aria-label 「자주 쓰는
  이유」, aria-describedby the hint) of type=button.pa-preset with data-fill-for = input id, data-fill = fill; hint
  「고르면 칸에 들어가요. 고쳐 써도 돼요.」.
- src/tools/form-tool/entry.ts:8-10, 57-65 — delegated click on the tool root (works before the controller loads): value =
  fill, bubbling `input` (controller's markStale runs as for typing), focus, caret at end.
- src/tools/form-tool/form-presets.css:1-10 (new) — chip styles in their own file (44 px targets, focus ring). NOT added to
  form-tool.css: that file is inlined on /power-of-attorney/ and /loan-note/, so adding rules there changed their HTML
  beyond hashes. Step B's page inlines form-presets.css next to form-tool.css.
- scripts/lib/ui-font-chars.mjs:33-36 — `fill` added to the document-text strip regex (R10).
- src/data/forms/resignation-letter.ts:1-65 (new) — RESIGNATION_LETTER (R3) + RESIGN_HWP = true; 7 presets (R5).
- src/data/forms/index.ts:5, 7 — registered (worker getFormSpec; forms:hancom picks it up from FORM_SPECS).
- tests/helpers/form-samples.ts:39-50 — 사직서 sample (made-up: 홍길동, ○○ 주식회사).
- tests/unit/form-values.test.ts:2-3, 165-221 — presets lint (ok + every problem), slot-only placement (1 slot ok, 2 / 0
  fail, table+slot ok), `fill` stripped / `chip` kept in the glyph scan.
- tests/unit/resignation-letter.test.ts:1-136 (new) — lint/registration/fileBase/switch; no 주민·주소·허락·법적·효력 in
  the document; R3 ids/kinds/lengths, presets fills; plan text (sample: 「…2026년 11월 30일자로 사직하고자…」, date line,
  sign line, 「○○ 주식회사 대표이사 귀하」; blank: BLANK_DATE in the line, blank 귀하/sign slots); real rhwp blank /
  sample / all-max (1 page, loss 0, reload 1 page, every docLabel and docText drawn), all-max with 사유 wrapped at 15–40
  per line (1 page), one build per preset fill (1 page, fill drawn).

## Wording choices (R10, 0 new core glyphs)
- Page label 「퇴사 예정일」 → 「그만두는 날」 (퇴 not core); docLabel stays 「퇴사 예정일」.
- Chip 「가족 돌봄」 → 「식구 돌보기」 (족/봄 not core); fill stays 「가족 돌봄」.
- 받는 사람 hint 「예: ○○ 주식회사 대표이사」 → 「예: 한빛 주식회사 대표이사」 (○ not core). Flag if you prefer another name.
- All other R3/R5 labels and chips as briefed.

## Gates
- vitest form files (resignation-letter, form-values, form-build, loan-note, power-of-attorney): 5 files, 96 passed.
- vitest full: 2308 passed, 1 failed — postbuild.test.ts 「usage statistics … fail check-dist」 timed out (120 s) on this
  low-memory host; it times out identically with my changes stashed (baseline), so host speed, not this step.
  compress/merge failed to load in the full run only (memory); alone 48/48 pass.
- npm run check: 0 errors, 0 warnings.
- Build (PUBLIC_SITE_URL=https://docttak.com): check-dist OK; precache 382.8 KB / 450 (unchanged); preload 92.1 KB /
  92.66 (unchanged; font file hashes identical); late-800 7.9 KB / 8 (unchanged); core glyph diff vs baseline: +0 / −0,
  late +0 / −0. POA / loan initial JS 9.3 → 9.4 KB gzip (limit 12.8; the entry's click handler).
- 위임장/차용증 dist HTML vs baseline build: identical after hash normalisation; the only change is the entry chunk name
  (DjufwTGz → CesXfjbg, CbeyJqln → BTHFg7lc).
- e2e power-of-attorney + loan-note, chromium, 1 worker: 17/17 passed.
- forms:hancom not run (needs 한글 COM / owner O1; the Node rhwp reload is covered by the unit builds).

## Open Questions
- The slot-only placement rule in lintSpec (above) — an engine change beyond R5's letter, required by R3.
- The chip handler has no e2e yet (no page in A); Step B adds chip-before-load / after-build e2e per the test map.

## Out of Scope (logged in BUILD-LOG)
- None new.
