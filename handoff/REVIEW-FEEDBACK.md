# Review Feedback — Step CHAIN X2 (+ X1 CI fix)
Date: 2026-10-11
Ready for Builder: YES

## Must Fix
None.

## Should Fix
- tests/e2e/chain.spec.ts:235-436 (confidence: 7/10) — No X2 test shows a group and then checks that it goes away. Every test only checks a group that was never shown (ranges mode, lock result, several photos). In the code, every sender hides the slot whenever it leaves done: `if (next !== 'done') hideNextSteps(nextSlot)` in the setState of pdf-merge, pdf-split, pdf-sign, image-to-jpg and pdf-password; `dropResult()` in hwp session.ts; `if (phase !== 'done') hideNext()` in bg.ts; `setPhase` in id-photo. So no bug today. But no test would catch a regression. — Add one e2e: get a group showing on one sender (pdf-merge or pdf-sign is cheapest), press reset / 다시 편집하기, then assert `#<slot>` is hidden and has 0 buttons.
- tests/e2e/chain.spec.ts (photo-compress) (confidence: 7/10) — For photo-compress, only one photo → jpg-to-pdf is tested. Not tested: (a) two done photos → no group (brief test map: "multi-photo → no buttons"; it is tested only for image-to-jpg); (b) removing one of two done rows → group appears. Case (b) is the special path `updateNext()` was written for (controller.ts:266-283, removeRow → setState(state)). — Add both checks to the photo-compress test.
- src/tools/pdf-password/controller.ts:348-353 (confidence: 5/10, verify) — The guard `state === 'done' && blobUrl === shown` is right, but no test covers it. A reset while the lazy chunk is still loading is hard to time in e2e. If it is cheap, a unit test is enough. Otherwise leave it.

## Escalate to Architect
- None new. The orchestrator already decided the three open questions Bob lists (remove-background takes the choice at click time; photo-compress offers a kept original; next-steps-lazy). One item to carry: cloud precache is 446.8 / 450 KB, so the next step that adds JS on the cloud build has about 3 KB of room.

## Cleared
I checked:
- **X1 CI fix.** It is a real timing fix. `settled()` (pdf-sign.spec.ts:104-108) waits until scrollY holds steady across two animation frames. The smooth focus-scroll has already started when the wait begins. The WCAG 2.4.11 assertion (`field bottom <= bar top + 1`) is unchanged.
- **Privacy sentence (sweep flag).** All 11 senders run the flag check:
  - 6 receivers: `sweepDue` else-branch.
  - pdf-merge and hwp-to-pdf: controller init.
  - image-to-jpg, id-photo, remove-background: entry.
  - e2e covers 4 of them, and the cloud spec covers remove-background.
- **Button visibility on done/reset.** Correct on every sender.
- **Locked PDFs.**
  - A pdf-password lock result never loads next-steps.
  - pdf-merge, pdf-split and pdf-sign write unencrypted output. Their notes say so: "합친 파일에는 비밀번호가 걸려 있지 않습니다" and NO_PASSWORD_NOTE.
- **Single-file rule.**
  - pdf-split: `!many && (edit|extract)`.
  - image-to-jpg: `count === made.length === 1`.
  - photo-compress: exactly one result or kept row.
- **NextMaker.** null, a throw and over 200 MB all go to the alert. Unit tests cover each.
- **Test adequacy.** Adequate apart from the Should Fix gaps above.
