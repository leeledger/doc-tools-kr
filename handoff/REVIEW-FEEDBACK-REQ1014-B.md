# Review Feedback — REQ1014-B (fewer tool failures)
Date: 2026-10-14
Reviewer: Richard
Range: ee4950c..591a1d9 (branch req-1014-b)
Verdict: CLEAR
Ready for Builder: YES

## Must Fix
None.

## Should Fix
- src/tools/remove-background/bg.ts:1395-1400 (cloudOnce) + the retry loop in sendCloud (confidence: 7/10) — when the
  first try fails in decodeAlpha (`return m ? { mask: m } : { fail: 'answer' }`), cloudOnce has already run
  `setPhase('working')`; the loop then waits and sends the second request without going back to 'sending'. During that
  wait/second request 취소 reads `const sending = phase === 'sending';` as false and says COPY.cancelled instead of
  CLOUD.sendCancelled, and the view shows the "refining" phase while a request is in flight. Fix: `setPhase('sending')`
  next to `busy(CLOUD.working)` before the retry wait. Under 5 minutes; fix inline or log.

## Appendix (low confidence, no action required)
- src/tools/hwp-shared/boot.ts (pending path) (4/10) — the controller's init waits on `hold`, released only when
  receiveHandoff settles. takeHandoff rejects on `onblocked`, so a hang needs an IndexedDB open that never answers;
  if that is ever seen, add a short timeout that calls release().
- src/tools/stamp-signature/photo.ts ladder (4/10) — on success `show(r)` announces COPY.ready and the ladder then
  says `autoStrength + ready` right after; two polite announcements back to back. Harmless; the second wins.

## Open Question 1 — ui-shared +0.5 KB gzip (handoff-marker + announce static in boot.ts)
Recommendation: keep it as built. D6 asked for a static, synchronous pendingHandoff so the receiver can start the
controller before first paint; a separate chunk would add a request on exactly the two receiver pages and put it on
the path the handoff must win. Cost is 0.5 KB gzip, every budget and LHCI threshold holds (initial JS max 9.2 / 30 KB,
precache 408.1 / 450). Log the delta in BUILD-LOG; revisit only if ui-shared nears a budget.

## Open Questions 2–4
- Q2 merge with -A: sniff-format.ts verified byte-identical (blob 651e149 in both worktrees). usage.mjs FAIL_LABELS
  and usage.spec.ts: keep both appended blocks; the -A block already carries the not-hwp-* / corrupt-* labels B emits.
- Q3 codes: following -A's notHwpCode is what D1 asked. Correct.
- Q4 jpg-to-pdf total cap unit-only: acceptable per the brief's Fixtures rule; keep it in BUILD-LOG Known Gaps.

## Checked
- D1–D4: notHwpHelp never throws (read failure -> generic line + not-hwp-other); CFB + worker not-hwp -> office-old /
  not-hwp-cfb; PDF blob link revoked on reset, new pick, pagehide; buttons hand the file via sendTo (local IndexedDB),
  `next` tracked only after the store. Chunk is lazy (import() on the not-hwp path only).
- D5–D7: #hw-error-actions / #hx-error-actions disposed on reset; HWPX links preventDefault + handTo, fallback follows
  href; receivers start at once with BootStart.file, a user pick meanwhile wins; sweepDue sweep kept.
- D8–D9: watchdog pause/re-arm/stop correct, one instance per controller; retry only in start/engine, once per file
  (retried reset in convert), file re-read after transfer, phase load/parse/process on the final timeout.
- D10: tolerance max(1, round(5 %)), pagesOut >= 1, detail bytes/reopen/pages carried by the worker; pageShift line in
  #hx-loss without page numbers; downloads still blocked beyond tolerance.
- D11: only a non-RangeError on the resize attempt falls through; plain-decode failure still heic/corrupt.
- D12: 11 labels in one marked block; all codes match CODE_RE; no other usage.mjs change; beacon fields untouched.
- D13–D14: at most 2 requests per press, retry only network/server/answer/load, run token checked after the 1.2 s
  wait (취소 bumps run via release()), one fail event per visible error; cloud traffic still only /api/remove-bg.
  「이 기기에서 처리」 = deviceOnce, not remembered; #bg-device still remembers.
- D15: tip text as briefed; ladder only on the first result at 진하기 0; user change stops it; none passing -> original
  message, slider 0, one fail.
- D16: reduce skips only the total cap; too-big-file / too-big-total; 「원본 그대로」 disabled with hint while over.
- Copy: 합니다체 on viewer/to-pdf, 해요체 on hwpx-to-hwp, no 업로드/서버/브라우저 in user lines (서버 only in admin
  FAIL_LABELS, as briefed); josa on variable numbers.
- Unit: the 8 touched suites re-run here, 236/236 passed. e2e not re-run (machine load; Builder's numbers accepted).

## Cleared
REQ1014-B D1–D16 reviewed against the brief: spec-compliant, no privacy widening, no Must Fix. One small Should Fix
(bg retry phase) may be fixed inline.
