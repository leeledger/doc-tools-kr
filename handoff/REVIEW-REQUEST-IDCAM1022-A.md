# Review Request — IDCAM1022 Step A (refactor only)
Date: 2026-10-22
Ready for Review: YES
Status: DONE
Branch: idcam1022 (from main 5d77043)

## Files Changed
- src/lib/idphoto/guides.ts:1-57 (new) — pure guide geometry of a preset: `guides(preset, size = output px)` returns crownY,
  eyeY, head, bandTop/bandBottom, centerX, face oval {cx,cy,rx,ry}, `official` and the three label strings. `LABELS` moved here
  from overlay.ts (unchanged text; both paths are in the late UI-font set, so the font subset is unchanged).
- src/tools/id-photo/overlay.ts:1-9 — imports `guides` instead of EYE_FRAC/CROWN_FRAC/HEAD_FRAC; `LABELS` removed (no other importer).
- src/tools/id-photo/overlay.ts:79-127 — draws from `guides(preset, { w: W, h: H })`; same draw calls in the same order.
- tests/unit/idphoto-guides.test.ts:1-92 (new) — 6 tests: passport output-px values, every preset in order/inside the frame,
  linear scaling, bit-for-bit equality with the pre-refactor overlay arithmetic (every preset × 4 canvas sizes, `toBe`),
  official vs 참고 chin label (passport_online, driver_license official; all others + custom reference), crown vs hair label.

## Pixel identity (decision)
The overlay passes its canvas size (W, H), not output px × k: `k·outH` can differ from `H` in the last bit, so computing in output
coords and scaling would NOT be pixel-identical. Each expression in guides.ts is the old one with the same operand order
(e.g. `crownY + minFrac * h`), and the bit-identical test pins it. Output coords are the default size for Step B (camera page).

## What I ran
- `npm run check`: 0 errors, 0 warnings (11 hints, pre-existing).
- `npm test`: 98 files, 2,155/2,155 passed (6 new).
- `PUBLIC_SITE_URL=https://docttak.com npm run build` (flag off, shipping): postbuild + check-dist OK; preloaded UI fonts 92.1 /
  92.66 KB (unchanged; no generated file changed); precache 422.4 / 450 KB. Moved to dist-noauto/.
- Same with `PUBLIC_ID_PHOTO_AUTOFRAME=1` → dist/: check-dist OK.
- `npx playwright test tests/e2e/id-photo.spec.ts --project=chromium --project=manual-chromium --workers=1`: 71 passed, 15 skipped
  (skips are the spec's own project conditions), 0 failed. Covers both builds incl. axe on the adjust state (overlay).
- qa:visual NOT run (low memory; it needs a served site and screenshots the whole page matrix; it is not in CI either).
  Pixel identity rests on the bit-for-bit unit test + unchanged draw sequence. Please run `npm run qa:visual -- --url ...` at the
  deploy gate if you want the screenshot confirmation.

## Open Questions
- None.

## Out of Scope
- None found.
