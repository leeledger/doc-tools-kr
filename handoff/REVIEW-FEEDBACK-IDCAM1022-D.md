# Review Feedback — IDCAM1022 Step D (background link, D8b/c)
Date: 2026-10-22
Ready for Builder: YES

Reviewed: `git diff idcam1022-c..8cd4a13` (src, docs, tests) against brief D8 (a–d), D9–D11, Step D, Failure modes, Test map.
Vitest (bglink, bgcloud, bgremove, id-photo-camera, idphoto-live): 5 files, 147 passed. No Playwright, no builds (memory).

## Must Fix
None.

## Should Fix
- (none blocking; notes only)
- src/lib/idphoto/bglink.ts:13-17 (confidence: 6/10) — `custom` is offered on the camera, but the way back always lands on saramin, so a user who chose custom size comes back on a different 규격 without being told. Matches the brief's "else saramin" and /id-photo/ deep links cannot carry custom; acceptable. If it bothers users, hide the offer for custom instead (one-line change in bgOffered). Log only.
- src/tools/remove-background/entry.ts:82-86 (confidence: 5/10) — when a handoff is pending, `sweepIfDue()` is skipped for that visit. Harmless (the next plain visit sweeps; the take deletes its own record). No action.

## Escalate to Architect
- None. Bob's three open questions: (1) held + cached engine reuses the consent panel with its own line — agree, it satisfies "arrival -> ready|consent" and the press is the start; (2) 「이력서 사진 규격 맞추기」 only with ?preset= — agree, keeps C2 "not for ID photos" on plain visits; (3) 원본 사진으로 다시 하기 -> empty picker — agree (the original is not on /id-photo/; 카메라로 찍기 is there).

## Verified
1. Privacy. Cloud: openFile (bg.ts:575-582) sets phase 'ready' and returns for every pick, held or not; the only POST stays behind #bg-send. Device: `startsAtOnce(engineReady, held) = engineReady && !held` (model.ts:51); held + cached engine shows COPY.held + 「배경 지우기」 and waits (bg.ts onDevice). Camera page: sendToBg only writes the 이어서 하기 store and navigates; no fetch. No new network path; usage `next` values ('remove-background' from id-photo-camera, 'id-photo' from remove-background) pass the server check (scripts/lib/usage.mjs:260-261 requires TOOLS.includes(v)). Cloud spec asserts 0 POSTs for 2 s then exactly 1 after the press; local spec asserts 0 model requests for 1.5 s and the store empty.
2. Block. Camera offers only saramin/jobkorea/half_card/custom (unit test vs PRESETS and BG_FORBIDDEN). Every outgoing address goes through bgPreset (allowlist, else saramin): bgUrl, parseBgLink, idPhotoBack; the unit test parses each way-back URL with the real deep-link parser and never gets passport/driver. /id-photo/ still blocks by provenance (from === 'remove-background', reset on every openFile, controller.ts:464), so switching preset there hits the D8c item; 「원본 사진으로 다시 하기」 -> toEmpty only, no bypass. 외교부 quote in the tool note is exact to brief D8 (menuPos=12).
3. Unchanged for plain visits: no marker -> sweepIfDue as before; #bg-idphoto only with ?preset=; non-held consent path is byte-for-byte the old behaviour (asked always true when not held: same text, keep line, 받고 시작, extra, low-device). The camera is the only sender to remove-background in src; /id-photo/ redo item is only under __BG_REMOVE__ and only on the bgremoved item. Transparent result handed to /id-photo/ is drawn on white (lib/idphoto/render.ts:33).
4. Copy: 배경 지우기 exception (sending) is not named on the camera page or /id-photo/ — only the button 「배경을 흰색으로 바꾸기」. New copy passes JARGON; plain Korean.
5. Budgets: no script/threshold touched in the diff; preload 92.2 < 92.66 KB.
6. Tool note line (remove-background.md:41) is in commit 8cd4a13; one new unique <li>, no numbers, so the shared-block rule (guide-check sharedBlocks) and the ≥2,000 tool-page bar only gain. CI must still run the full builds and specs Bob could not run locally.

## Cleared
The 증명사진 촬영 -> 배경 지우기 -> 규격 맞추기 chain holds every photo until the user presses, cannot carry passport/driver ids, leaves plain visits unchanged, and keeps budgets; Step D passes pending CI.
