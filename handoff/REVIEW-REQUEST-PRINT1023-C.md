# Review Request — PRINT1023 Step C
Date: 2026-10-24
Ready for Review: YES
Status: DONE
Branch: print1023-c (on print1023-b), worktree wt/print1023-c

## Files Changed
- src/content/guides/self-id-photo.md:8 — updated -> 2026-10-24.
- src/content/guides/self-id-photo.md:77-80 — new source 찍스 https://www.zzixx.com/ quote 「4x6 (10.2cm x 15.1cm)」 retrieved 2026-10-24 (B0 raw dump).
- src/content/guides/self-id-photo.md (H2 「찍은 사진 종이로 뽑기」, after 「문서딱으로 찍고 바로 규격 맞추기」) — intro with the 4×6 cm figure, the figure, 4 steps (link /id-photo/, 「인화용 모아찍기 만들기」/「모아찍기 내려받기」, 4×6 print, ruler check), no-sheet line for presets without a paper size.
- src/assets/flagged/img/guide/self-id-photo/3-print-sheet.svg — own figure: the real 35×45 sheet layout scaled, 8 tiles with grey outlines, a cut tile with ruler and scissors; no numbers; white card for dark mode.

## Gates
npm run check 0/0; build + check-dist OK (similarity max 0.093/0.45); guide-length 3,319; quotes --exact for this guide 16/16;
vitest 2241/2242 (char-count timing flake, passes alone); guide tests 160/160; axe light+dark 0 serious/critical.

## Open Questions
- 찍스 is a commercial print service, not an agency; the brief locked it as the 4×6 source. Check the wording 「찍스는 … 적어 두었어요」 reads as one service's listing, not a standard.
- "3.5×4.5 cm 사진이면 한 장에 8장" is our tool's count, not a cited spec (fact check does not treat 장 as a unit).

## Out of Scope (logged in BUILD-LOG)
- none new.
