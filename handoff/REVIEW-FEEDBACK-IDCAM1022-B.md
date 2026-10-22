# Review Feedback — IDCAM1022 Step B (/id-photo/ receiver + /id-photo-camera/ core)
Date: 2026-10-22
Ready for Builder: YES
Reviewed: `git diff idcam1022..dd9bcd2` (branch idcam1022-b). vitest id-photo-camera + handoff: 45/45 green (re-run by reviewer).

## Must Fix
None.

## Should Fix
- src/tools/id-photo-camera/controller.ts:266-278, 310-313 (confidence: 7) — after a successful hand-over, `use()` leaves `useBtn.disabled = true` and the page navigates; a Back press restores the page from bfcache in `review` with 「이 사진으로 규격 맞추기」 still disabled (the record was already taken by /id-photo/). Only 「다시 찍기」 works. — Add a `pageshow` listener: `if (e.persisted && phase === 'review') useBtn.disabled = false;` (re-sending simply stores a new record). Under 5 minutes.
- src/tools/id-photo-camera/controller.ts:185-191, 208-243 (confidence: 6, verify) — with 「바로」 the 찍기 button stays enabled while `capture()` awaits `toBlob`; a double tap runs two captures, the second overwrites `shot`/`shotUrl` without revoking the first object URL. Harmless to the user, a small leak. — Guard with a `capturing` flag (or disable shootBtn at capture start).
- src/content/tool-notes/id-photo-camera.md:29 (confidence: 6) — 「한두 걸음 떨어져」 is a distance figure; D8(d) and Bob's own docs/COPY.md line say 「거리 숫자는 쓰지 않습니다(공식 숫자 없음)」. — Say 「조금 떨어져」 as the page and FAQ do.
- src/tools/id-photo-camera/controller.ts:300-302 (confidence: 5) — changing the 제출처 in `review` sends the new preset id with a still cut at the old aspect; the lowres note stays from the old preset. /id-photo/ re-frames it (largest centred crop), so nothing breaks; consider hiding the select's effect in review or recomputing the note. Log if not fixed.

## Escalate to Architect
- None blocking. Bob's flagged decisions, judged:
  - Direct `sendTo` + `?preset=` instead of a next-steps FLOW row: accepted (the review screen owns the button; FLOW labels do not fit). Brief line "next-steps id-photo-camera -> id-photo" is superseded; Arch to note it in the brief.
  - Usage on existing kinds (start/fail/success/next/pick; codes pass CODE_RE; no Function change): accepted.
  - Copy reworded for glyphs (「카메라 바꾸기」, selfie line, 「뒤가 흰색인 곳」): accepted; meaning preserved, logged in COPY.md.
  - No 직접 입력 on the camera page: accepted (custom size needs the /id-photo/ inputs; custom on /id-photo/ links to the default).
  - 「원본 사진으로 다시 하기」 deferred to Step D: accepted — no sender of `from=remove-background` exists in B (gated by `__BG_REMOVE__`), the block text already says 「원본 사진으로 다시 해 주세요」. Step D brief must carry the button.

## Cleared
Privacy (no network call; getUserMedia only in the lazy controller on tap, check-dist enforced; tracks stopped on capture, hide, pagehide, flip and failure, with a run counter dropping late streams), Permissions-Policy (detach + camera=(self) on /id-photo-camera/* only, policyFor/cameraHeaderProblems cover /, /id-photo/, /embed/id-photo/, prefix look-alike; flag-off build names nothing), crop math (stage aspect = frame aspect with object-fit: fill, so toBox is exact; centred rect, unmirrored from the raw frame; e2e asymmetric-fixture orientation test), /id-photo/ receiver (only with #idp-notice + a session marker, plain visits still sweepIfDue and load no handoff chunk, takeHandoff unchanged for other receivers), D8c blocking via checklist blocks → canSave, quotes verified in handoff/sources/idcam1022/ and the driver-license guide, plain Korean copy, budgets unchanged (new camera budgets per D11), tests meaningful.
