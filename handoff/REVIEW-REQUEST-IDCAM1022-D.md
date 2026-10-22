# Review Request — IDCAM1022 Step D (background link, D8b/c)
Date: 2026-10-22
Ready for Review: YES
Status: DONE_WITH_CONCERNS (only the bg-chromium e2e and the BG-on build ran locally; cloud spec, other builds and browsers -> CI)

## Files Changed
- src/lib/idphoto/bglink.ts (new) — pure allowlist (saramin, jobkorea, half_card; custom offered but maps to saramin), ?bg/?preset parsing, both addresses.
- src/tools/id-photo-camera/page.astro:100-101 — 「배경을 흰색으로 바꾸기」 (#cam-bg), rendered only under __BG_REMOVE__, hidden until review.
- src/tools/id-photo-camera/controller.ts:9-19, 64-65, 312-315, 331-342, 364, 387-389 — show #cam-bg in review for bgOffered presets; use(toBg) hands over to /remove-background/ (both buttons disabled while storing, re-enabled on failure and on bfcache return).
- src/tools/id-photo-camera/send.ts:5-40 — shared send(); sendToBg -> sendTo('remove-background') -> /remove-background/?bg=white&preset=<allowed>.
- src/tools/id-photo-camera/copy.ts:15-16 — sendingBg line.
- src/tools/remove-background/entry.ts:5-17, 62-84 — receiver: pendingHandoff -> receiveHandoff -> open(file, {held:true}); ?bg=white checks the 흰색 chip; sweep only when not receiving.
- src/tools/remove-background/model.ts:45-51 — startsAtOnce(engineReady, held).
- src/tools/remove-background/bg.ts:15-19, 43, 57, 111-122, 155-157, 211, 530, 584-615, 801-821, 842 — held photos stop at ready (cloud, unchanged) or consent even with a cached engine (own line + 「배경 지우기」 button); #bg-idphoto shown with the result only when ?preset= is in the address; it encodes the chosen background and sendTo('id-photo', from 'remove-background') -> /id-photo/?preset=<allowed>.
- src/tools/remove-background/copy.ts:57-64, page.astro:72-73, 97, 101, 151-152 — held/start/toIdPhoto copy, #bg-arrived notice, #bg-consent-keep id, #bg-idphoto button.
- src/tools/id-photo/controller.ts:360-395 — the D8c 'bgremoved' block item gets 「원본 사진으로 다시 하기」 (#idp-redo; only under __BG_REMOVE__) -> empty picker.
- src/content/tool-notes/remove-background.md:41, docs/COPY.md — the chain, the press, provenance loss (D8c) with the 외교부 quote.
- tests/unit/idphoto-bglink.test.ts (new) — allowlist vs PRESETS/BG_FORBIDDEN, every way-back URL parsed by the real deep-link parser never yields passport/driver, startsAtOnce, arrival phases idle-panel only, plain words.
- tests/e2e/remove-background.spec.ts — camera chain (passport: no button; saramin: button -> consent, 0 model requests for 1.5 s, store empty -> result on white -> /id-photo/?preset=saramin, no item -> passport: quote + save disabled -> 원본 사진으로 다시 하기 -> empty); held with a cached engine (?preset=passport_online returns as saramin); plain visit has no #bg-idphoto.
- tests/e2e/remove-background.cloud.spec.ts — handed-over photo waits at ready, 0 POST /api/remove-bg for 2 s, exactly 1 after the press, back to /id-photo/?preset=jobkorea.
- tests/e2e/idcam.ts, id-photo-camera.spec.ts — syntheticCamera moved to the shared helper; seedHandoff added; flag-off build asserts no #cam-bg.

## Open Questions
- Held + cached engine reuses the consent panel with its own line (no download wording) instead of auto-starting. OK under "arrival -> ready|consent"?
- 「이력서 사진 규격 맞추기」 is shown only when the address carries ?preset= (camera chain), never on a plain visit — keeps the C2 "not for ID photos" positioning. Agree?
- 「원본 사진으로 다시 하기」 returns to the empty picker (사진 선택 / 카메라로 찍기): the original still is not on /id-photo/.

## Not run locally (memory)
- default, PUBLIC_ID_CAMERA=0 and cloud builds; remove-background.cloud.spec; id-photo-camera.spec (dist/ was a pre-change build); bg-mobile-safari; LHCI; qa:visual. The tool-note line was appended while the BG build ran (not in that dist).

## Out of Scope (logged in BUILD-LOG)
- bfcache return to a /remove-background/ result shows a freed canvas (pre-existing pagehide release).
- PUBLIC_ID_CAMERA=0 with 배경 지우기 on: the remove-background tool note still names 증명사진 촬영.
