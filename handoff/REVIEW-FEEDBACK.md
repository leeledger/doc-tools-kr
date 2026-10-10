# Review Feedback — Step CHAIN X1 (round 2)
Date: 2026-10-11
Ready for Builder: YES

## Must Fix
None.

## Should Fix
- src/tools/photo-compress/controller.ts:836-839 (confidence: 8/10). In the `ph-unsupported` branch, `pendingHandoff('photo-compress')` is never checked, so the marker and the IDB record are never taken. BUILD-LOG says "the record waits for the sweep (at most 10 min)", but that is wrong. `sweep` only runs inside `sendTo` and `takeHandoff` (handoff.ts:189, :217). The record stays on the device until the next 이어서 하기 use, which may never come. X1 cannot reach this (no X1 sender targets photo-compress), but X2 image-to-jpg will. Fix: in the unsupported branch, when `pendingHandoff` is true, still import handoff and call `takeHandoff('photo-compress')` and discard the result (the record gets deleted and the marker removed). Optionally also show TAKE_FAILED in the notice. Correct the BUILD-LOG wording.
- BUILD-LOG Known Gap "tab closed between put and navigate … at most 10 min" (confidence: 8/10). The same false bound applies: a lingering record has no time limit until the next put/take. The same is true when a receiver's `import('../../lib/ui/handoff')` fails (entry.ts `.catch(() => void showEngineError())`). The marker stays and so does the record; a reload retries, which is fine. Fix the log text so it states the real behaviour. See the escalation below for the privacy wording.
- src/lib/ui/handoff.ts:129-136 (confidence: 5/10, verify). The F3 fallback catches every `put` error, including quota exceeded or blocked IndexedDB. In those cases it still copies up to 200 MB into an ArrayBuffer and retries a put that will fail again. That is a memory spike on phones for nothing. Also on the fallback path, `get` (line 141) wraps the ArrayBuffer in a new Blob, then `takeHandoff` (line 179) copies it again with `arrayBuffer()`, and `new File([bytes])` may copy a third time. Recommendation: skip the retry when `openDb` itself failed (catch inside `run` before the transaction starts). Have `get` return the raw bytes so `takeHandoff` can use them without the extra Blob. Not blocking: real Safari stores Blobs; the refusal was seen in Playwright WebKit on Windows.
- src/lib/ui/next-steps.ts:116 (confidence: 6/10, informational). `track(next)` fires before the store attempt, so a failed store still counts as a `next`. This matches the brief's flow (track, then put), so leave it. Note it in BUILD-LOG so the numbers are read correctly once an admin view exists.
- tests/unit/handoff.test.ts (confidence: 6/10). `idbStore` itself has no unit coverage: the put fallback, `get` turning an ArrayBuffer back into a Blob, and the sweep cursor's `!(at >= before)` delete. Only chain.spec on WebKit/Firefox exercises them. That is acceptable for X1. A small fake-indexeddb test would pin the fallback cheaply if a dev dependency is allowed; otherwise log it.

## Escalate to Architect
- Privacy page sentence (privacy/index.astro:43): 「…다음 도구가 열리면 바로 지워져요.」 The brief's failure-mode table says the put→assign lingering case is "disclosed on privacy page", and the page does not disclose it. As noted above, such a record has no 10-minute bound; it lingers until the next 이어서 하기 use. Options: (a) accept it as is (rare: tab closed mid-store, a receiver chunk that fails to load, or an unsupported receiver once the Should Fix above is done). (b) Add a short clause in core-font characters, e.g. that a file not handed over is deleted the next time 이어서 하기 is used. (c) Sweep on every tool page load, which conflicts with F4 (no IndexedDB on normal visits). This is a wording and product decision, not a code one.

## Cleared
Reviewed handoff-marker.ts, handoff.ts (IDB lifecycle, delete after read, TTL, per-tab random key, Firefox read-before-delete, WebKit fallback), next-steps.ts (flow table, 200 MB / single-file gate, busy/re-enable, lazy import), the four lazy receivers and the pdf-compress/photo-compress eager receivers, the jpg-to-pdf/pdf-compress senders (hidden on every non-done state; bfcache `pageshow` resets clear the slot), the usage `next` whitelist (o=next + v in TOOLS, o=next refused elsewhere, settings query limited to `start`, shapeUsage skips next), the privacy wording/date/history and legal.ts constants, and the unit/e2e coverage. No data leaves the browser, the key is never sent, track() is synchronous sendBeacon before navigation, and no Must Fix issues were found.

---

# Review Feedback — Step CHAIN X1 (round 3)
Date: 2026-10-11
Ready for Builder: YES

## Must Fix
None.

## Should Fix
- src/lib/ui/handoff.ts:149 vs :213 (confidence: 5/10, informational; log it, don't fix now). There is a cross-tab clear race. Tab A runs `if ((await store.count()) === 0) …removeItem(SWEEP_FLAG)`. If tab B finishes its put and sets the flag between A's `count()` and A's `removeItem`, B's record loses its flag. That record only lingers if B's tab also closes before the receiver takes it. Two unlikely events in a window of a few milliseconds. Add it to the BUILD-LOG Known Gap. No code change needed.

## Escalate to Architect
None. The round 2 escalation is resolved by the orchestrator decision: the flag sweep plus the extended privacy sentence. privacy/index.astro:43 now matches the code. A record that was never taken is deleted only after 10 minutes, on a later visit to one of the six receiver pages, and the two X1 senders are also receivers. X2 must keep the "이어서 하기를 쓰는 도구" promise for every new sender (Bob logged it).

## Cleared
Round 3 reviewed:
- SF1: photo-compress unsupported branch (controller.ts:840-844) takes and drops the waiting photo, or runs the flag sweep.
- SWEEP_FLAG / `sweepDue` (synchronous, localStorage only; a normal visit with no marker and no flag still loads no handoff code and opens no IndexedDB).
- `sweepLingering`: never throws; the flag is cleared only when `count()` is 0; it runs at the end of every take.
- `sendTo` sets the flag after the put and before the marker.
- The `else if (sweepDue())` wiring in all six receivers.
- SF3: `isBlobRefusal` narrows the byte retry to DataCloneError and WebKit's Blob UnknownError; `run` now rejects with the request's error; `get` returns raw bytes and `recordBytes` uses them without an extra copy (tag check across realms).
- `isStale` treats non-numeric `at` as stale.
- The privacy sentence is accurate.
- The new unit and e2e tests cover the flag lifecycle and the unsupported-browser drop.
No Must Fix issues.
