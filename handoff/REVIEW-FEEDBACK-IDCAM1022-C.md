# Review Feedback — IDCAM1022 Step C (live hints + burst)
Date: 2026-10-22
Ready for Builder: YES

Reviewed: `git diff main..b5f9ded` (live.ts, hints.ts, controller.ts, copy.ts, page.astro, camera.css, tool note, check-dist, COPY.md, unit + e2e specs) against brief D5 (burst), D6, D11, Step C, Failure modes, Test map. vitest on tests/unit/idphoto-live.test.ts + tests/unit/id-photo-camera.test.ts: 31/31 locally. No Playwright run (low memory).

## Must Fix
None.

## Should Fix
- controller.ts:238-246 + 341-346 (confidence: 8/10) — 「카메라 바꾸기」 stays enabled during the ~0.5 s burst. `capture()` only does `shootBtn.disabled = true;` and the phase stays `'live'`, so `flipBtn.disabled = p !== 'live'` leaves it tappable; a tap mid-burst runs `stopTracks()` (run++), `sharpestFrame` returns null and `captureOnce` returns silently — the shot the user asked for is dropped with no message. Not a crash, and the burst made the window 500 ms wide (was one async toBlob). Fix: also set `flipBtn.disabled = true` in `capture()` (restored by the next setPhase), or ignore flip while `capturing`.
- tests/unit (confidence: 7/10) — `sharpestFrame` itself (keep-best/release order, `alive()` false mid-burst → null and `best` released, all-null grabs → null) has no test; only `sharpness()` is covered. Cheap to add with stub canvas objects ({width,height} + a stubbed frameSharpness path) or log to BUILD-LOG next to the existing burst e2e gap.

## Escalate to Architect
- None blocking. Bob's open questions, my answers: (1) separate hints chunk with its own measured+20 % budget (2.05 KB → 2.5 KB, logged in BUILD-LOG and check-dist) is a new budget for new code, not a raised threshold; the controller budget 6.2 KB is untouched — acceptable under D11. (2) TILT_DEG 5° and OVAL_INNER 0.8 are code constants only; no number reaches the copy (unit test asserts no digits in HINTS) — acceptable, real-phone tuning stays O1. (3) canvas-stream scenes instead of committed y4m: equivalent coverage of the three scenes plus a level case, deviation logged — acceptable.

## Cleared
Hints are advisory only (never touch shootBtn; shutter never awaits the chunk), run ≤4 Hz on a ≤160 px copy, skip when hidden and stop with the tracks (interval, deviceorientation listener, canvas and text cleared on stop/review/hide/flip); the listener is passive with no requestPermission, no UA sniffing, no network, no sound; the Permissions-Policy does not block sensors; the burst grabs 3 frames 250 ms apart, scores on a ≤256 px luma copy, holds at most two full-size canvases, releases the losers and never edits pixels; roll math checked against the W3C frame (beta 80/gamma 90 → 10°, pitch ignored, flat → null); copy is plain, core-glyph only, number-free, with the 「벽」 rewording logged in COPY.md; check-dist asserts exactly one hints chunk with no getUserMedia.
