# Review Feedback — RESIGN1027 Step A (engine presets + 사직서 spec)
Date: 2026-10-27
Ready for Builder: YES

## Must Fix
None.

## Should Fix
- src/components/FormTool.astro:65,69 (confidence: 6/10) — `aria-label="자주 쓰는 이유"` and the hint are engine-wide
  constants, but `presets` is a generic FormField option. The next form with presets on a non-reason field gets a wrong
  group name. Not a bug today (one consumer). Fix when a second preset field arrives: an optional `presetsLabel` on
  the field (lint: required when presets set). Log to BUILD-LOG Known Gaps; no change needed in this step.

## Escalate to Architect
- None. Bob's lintSpec extension (a field with no table row/date line is placed by exactly one para slot) is
  required by R3's 「{to} 귀하」 and is narrow: `homes ?? slotted ?? 0` keeps the old rule for every field that has a
  home (homes wins, so {leaveDate} in table + slot still counts 1), and a slot-only field in 0 or 2+ slots still
  fails. Units cover 1 / 0 / 2 slots and table+slot. Accept as an engine decision; it is logged.

## Appendix (confidence < 5, no action required)
- src/lib/form/spec.ts:149 (4/10) — the slot-only rule does not check that the para is unconditional (`onlyIf`) or
  that the slotted field is single-line. Neither case exists in any spec; add when one does.

## Checked
- Presets lint (spec.ts:126-135): kind, 1–8, non-empty chip/fill, fill code points ≤ maxLength, lines ≤ maxLines
  (text: 1). All 7 fills fit 100 / 3 lines.
- entry.ts:57-65: delegated on the tool root, so it works before the controller loads; chips are type=button (no
  submit); the bubbling `input` reaches controller.ts:501 `form.addEventListener('input', … markStale())`, same as
  typing; the controller reads values from the DOM and its init writes no values (only reset does, :480), so a
  pre-load fill survives. pointerdown/focusin on the chip also start the controller load. Chips carry no data-field,
  so they are not form inputs. e2e for before-load / after-build stale is correctly deferred to Step B (no page yet).
- ui-font-chars.mjs `fill:` strip: no other `fill: '<Hangul>'` key exists in src/scripts, so no UI text is wrongly
  dropped from the glyph scan.
- Wording: 「그만두는 날」 (page) / 「퇴사 예정일」 (document), chip 「식구 돌보기」 → fill 「가족 돌봄」, chip 「계약 끝」 →
  「근로계약 기간 만료」: plain, same meaning, nothing misleading; the fill the visitor sees in the box is exactly what
  is printed. Hint 「예: 한빛 주식회사 대표이사」 is acceptable as a generic example name. Brand not touched.
- Document text: 「…처리하여 주시기 바랍니다」 (not 허락), no 주민·주소·법적·효력 (unit asserts). 권고사직 fill states a
  fact only; no 실업급여 claim anywhere in Step A.
- Sources handoff/sources/resign1027/: 민법 660 ①②③·661, 근로기준법 36, 고용보험법 58 (incl. the 「고용노동부령 으로」
  artifact) and 1350 「국번없이 1350(유료) (이용시간 : 평일 09:00 ~ 18:00)」 read correctly with URL + fetch date. No law
  sentence ships in Step A; each is checked again against these files when Step B/C quotes it.
- Targeted run: tests/unit/form-values.test.ts + resignation-letter.test.ts — 2 files, 51 passed.

## Cleared
Engine presets (type, lint, chips, pre-load fill with stale via bubbling input), the slot-only placement rule, the
glyph strip, the 사직서 spec and its 1-page rhwp units, and the saved legal sources are reviewed and pass.
