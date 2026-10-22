# Review Request — IDCAM1022 Step C (live hints + burst)
Date: 2026-10-22
Ready for Review: YES
Status: DONE (local gates below; the rest on CI)

## Files Changed
- src/lib/idphoto/live.ts (new) — pure analysers: face-oval L* (dark < 35, backlight bg−face > 40), checkBackground reuse, roll from beta/gamma + tilt > 5°, hint priority, 2-in-a-row debounce, variance-of-Laplacian sharpness.
- src/tools/id-photo-camera/hints.ts (new, own lazy chunk) — watchHints (≤160 px copy, 4 Hz, skips hidden, passive deviceorientation, no prompt) and sharpestFrame (3 frames 250 ms apart, ≤256 px luma copy, ≤2 full frames held).
- src/tools/id-photo-camera/controller.ts:7-8, 18, 60, 73-76, 97-98, 125-126, 157-169 — load the hints chunk while the camera starts, run hints while live, stop them with the tracks.
- src/tools/id-photo-camera/controller.ts:247-275 — grab() + burst at the shutter; never waits for the chunk (absent = one frame); a stop mid-burst returns silently.
- src/tools/id-photo-camera/copy.ts:3, 19-26 — HINTS copy (core glyphs only).
- src/tools/id-photo-camera/page.astro:80-81, camera.css:21 — #cam-hint (aria-live polite, reserved 3em so 찍기 never moves).
- src/content/tool-notes/id-photo-camera.md:37-42 — 「화면 아래에 안내가 나올 때」 (advice only, no numbers).
- scripts/check-dist.mjs:40-41, 698-703 — exactly one hints chunk from the controller, no camera API in it, budget 2.5 KB (measured 2.0 + 20 %).
- docs/COPY.md:84 — hint copy and the 「벽」 rewording.
- tests/unit/idphoto-live.test.ts (new), tests/unit/id-photo-camera.test.ts:10,133 — test map [GAP->C] unit.
- tests/e2e/id-photo-camera.spec.ts:11-12, 18, 65-99, 234-281 — scenes white (none), dark, backlit (+ 찍기 still works, hint cleared), deviceorientation level.

## Tests
- npm run check: 0 errors, 0 warnings. vitest (2 files): 31/31. Default build + check-dist: OK (controller 5.5/6.2, hints 2.0/2.5, fonts unchanged).
- e2e id-photo-camera.spec chromium, 1 worker: 11/11.
- Not run locally (low memory): full vitest, flag-off/AUTOFRAME/cloud builds, fake.spec, other browsers, LHCI, qa:visual.

## Open Questions
- Hints chunk + new check-dist budget instead of growing the controller budget: OK? (controller budget untouched.)
- TILT_DEG 5° and the 0.8 inner oval are my heuristics (logged, never shown); 35/40 from the brief.
- E2E uses canvas-stream scenes, not committed y4m files (deviation from the test map, logged).

## Out of Scope (logged in BUILD-LOG)
- Burst has no e2e proving the sharpest of 3 is kept (unit only). Real-phone tuning of thresholds (O1). Step D/E untouched.
