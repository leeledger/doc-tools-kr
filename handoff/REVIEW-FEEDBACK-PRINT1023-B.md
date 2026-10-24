# Review Feedback — PRINT1023 Step B (인화용 모아찍기)
Date: 2026-10-24
Reviewed: git diff a5eb7ca..26d5866 against handoff/ARCHITECT-BRIEF-PRINT1023.md P1–P13, P15 (tool part)
Ready for Builder: YES

## Must Fix
None.

## Should Fix
- src/tools/id-photo/controller.ts:518 (`sheet.make.disabled = true;`) (confidence: 6/10, verify) — disabling the button
  the user just pressed drops keyboard focus to <body> in Chromium/Firefox; when the sheet is ready, focus is still lost
  (only the status line announces 「모아찍기를 만들었습니다」). Fix: after `sheet.result.hidden = false`, move focus to
  `#idp-sheet-download` (preventScroll false), and on the error path back to `#idp-sheet-make`. Under 5 minutes; else log it.
- scripts/lib/usage.mjs:92 + src/tools/id-photo/controller.ts:551 (confidence: 5/10) — the sheet click is an ordinary
  `download` event for id-photo, so a user who takes both files counts 2 downloads for 1 start in any download/funnel total.
  Same shape as 위임장 HWP+PDF and what P12 asked for, so not a bug; note it in BUILD-LOG so nobody reads the id-photo
  download rate as a per-user rate (the setting row 모아찍기 separates them).

## Escalate to Architect
- Precache headroom: production-like 444.8 / 450 KB (5.2 KB left; controller +3.8 KB). Within budget, never raised. The
  next tool that adds precached JS will not fit — Arch should decide now what gives (e.g. move the sheet show/hide code
  behind the lazy chunk, or drop something from precache) rather than at the next step.
- FAQ question 「증명사진을 여러 장 인화하려면 어떻게 하나요?」 instead of the brief's 「집에서 증명사진을 뽑을 수 있나요?」:
  my view is it is fine (P11 reword rule; it also carries the searched word 인화). Arch confirms or spends the glyph.

## Answers to Bob's questions
1. FAQ reword: acceptable from the code side (see Escalate). Copy is plain, no 업로드/서버/브라우저, the only number is 4×6
   (찍스 source, verbatim in handoff/sources/print1023/print-size-2026-10-23.txt) and the preset's own 3.5×4.5/3×4 cm.
2. expectSpec headerOnly: a sound fix, not a weaker gate. Metadata (APP1/Exif/GPS) can only live in marker segments before
   the first SOS; SOF0 (baseline, single scan) is still asserted, the 0xE1 marker check and sniff still run, EOI is still
   last, and `sosOffset < length - 2` keeps the slice from going vacuous. A 3-byte "GPS" in ~1 MB of entropy data is a few
   percent likely, so the old check was a real false positive. Single-photo checks are unchanged.
3. Precache: within budget; escalated above.

## Verified
- Geometry: SHEET_LONG/SHORT 1800/1200 (6·4 × 300); margin printPx(3)=35, gap printPx(2)=24. 35×45: landscape 4×2=8
  (x0 38, y0 57), portrait 2×3=6; 30×40: portrait 3×3=9 (x0 45, y0 168), landscape 4×2=8. Tile k=min(...) keeps the
  output aspect; 413×531 at k=1 takes the scale===1 path (pixel-identical to the saved file). Outline = filled
  (x−2, y−2, w+4, h+4) then tile put over it: 2 px ring outside the tile, 20 px white between rings, no overlap (unit test
  pairwise). composeSheet refuses a tile that is not the plan size.
- renderOutput scale=1: same w/h, same st.s, no extra fill, drawCrop(scale=1) unchanged — identical. Scaled path pre-fills
  white and drawCrop's existing scale arg handles the prescaled source correctly.
- Gate: snapshot comes from save()'s `const st = { ...state }` and its `p` (canSave gate), passed through showDone only;
  setPhase(≠done), releasePhoto, again/new all hideSheet (snap=null, URL revoked, run++ and abort). makeSheet refuses
  without snap/photo. D8c e2e asserts hidden. No path builds a sheet for a blocked save.
- Worker: one per sheet, terminated on answer, error or abort; listener removed; buffer transferred. Sheet JFIF fixed at
  300 (gosi 99 dpi case caught). No limitBytes → top quality; same verifyOutput.
- Network: no new request; the beacon is the existing /api/usage with o='sheet', v only from SHEET_PRESETS (client) and
  validate() via DOWNLOAD_SETTING (functions/api/usage.ts imports the same module); 'sheet' refused on non-download events.
- Embed: block is `!embed` in markup, controller null-guards, check-dist asserts none under embed/.
- Copy matches P10 verbatim; SHEET_COPY has no `}`; stripComments regex extended; lowres note per P7.

## Cleared
Sheet layout, scaled render, lazy builder, controller lifecycle, beacon whitelist, markup/CSS, FAQ/tool note and the e2e
and unit tests for PRINT1023 Step B were reviewed against the brief and pass; no Must Fix.
