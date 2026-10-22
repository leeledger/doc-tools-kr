# Review Feedback — IDCAM1022 Step A
Date: 2026-10-22
Ready for Builder: YES

## Must Fix
- None.

## Should Fix
- None blocking. Note for Step B (confidence 6/10, verify when wiring the camera page): `guides(preset, size)` assumes `size` has the preset's aspect (doc comment says so). The camera live view is a video frame of a different aspect; Step B must pass the on-screen crop rectangle size and offset the drawing by that rect's origin, not pass the video frame size. guides.ts needs no change for that.

## Escalate to Architect
- None.

## Cleared
Reviewed commit 407beee: src/lib/idphoto/guides.ts is pure (imports only calibration/frame/crop constants and a type; no DOM), and every expression keeps the old operand order (`CROWN_FRAC * h`, `HEAD_FRAC * h`, `crownY + minFrac * h`, `crownY + EYE_FRAC * head`, ellipse `w / 2, crownY + head / 2, head * 0.34, head / 2`); overlay.ts passes its canvas W/H and issues the same draw calls in the same order with the same labels, so the overlay is pixel-identical; LABELS had no other importer; the 6 new vitest tests pass locally (incl. bit-for-bit `toBe` against the old arithmetic). qa:visual not run (low memory) — run it at the deploy gate as the brief's acceptance lists it.
