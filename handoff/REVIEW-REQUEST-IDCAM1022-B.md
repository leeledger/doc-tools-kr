# Review Request — IDCAM1022 Step B (/id-photo/ receiver + /id-photo-camera/ core)
Date: 2026-10-22
Ready for Review: YES
Status: DONE_WITH_CONCERNS (real phones and in-app viewers are owner items O1/O2; Firefox/WebKit e2e not run locally — CI)
Branch: `idcam1022-b` (stacked on `idcam1022` / PR #16). Brief: handoff/ARCHITECT-BRIEF-IDCAM1022.md Step B.

## Files Changed
New
- scripts/lib/idcamera.mjs:1-85 — PUBLIC_ID_CAMERA flag (DEFAULT "1"), the `/id-photo-camera/*` _headers block (`! Permissions-Policy` + `camera=(self), microphone=(), geolocation=()`), a small _headers evaluator `policyFor` and `cameraHeaderProblems` (camera route = camera=(self) when on, site policy when off; `/`, `/id-photo/`, `/embed/id-photo/`, … keep camera=(); exactly one camera=(self)).
- src/tools/id-photo-camera/page.astro:1-152 — the page (Base, JSON-LD + FAQPage, preset select from PRESETS without 직접 입력, passport 외교부 note D8d, 카메라 켜기, native input `capture="user"` fallback (hidden until needed), live stage (video playsinline muted autoplay + overlay canvas + countdown), 바로/3초/10초 (default 3초), review with 이 사진으로 규격 맞추기 / 다시 찍기 / 사진 저장 (hidden unless the hand-over fails), QuickLinks, how-to, tool note, FAQ, RelatedTools). Every static string is in the existing core glyphs.
- src/tools/id-photo-camera/camera.css:1-23 — page-only CSS (inlined), `cam-` prefix.
- src/tools/id-photo-camera/entry.ts:1-75 — initial script: usage start, ?preset deep link (readUrl/writeUrl 'id-photo'), passport note toggle, lazy controller on first press, 켜기 -> controller.start(), native-input photo -> send.ts (works without the controller).
- src/tools/id-photo-camera/controller.ts:1-317 — states idle/starting/live/countdown/review; getUserMedia `{video:{facingMode, width:{ideal:2560}, height:{ideal:1440}}, audio:false}` on tap only; mirror from track settings; `draw()` 155-184 (reviewer note: guide rectangle size to drawGuides, translated to its origin); `capture()` cuts the rectangle at frame resolution, refuses a black frame, stops every track; stop on visibilitychange hidden / pagehide; flip; hand-over with 「사진 저장」 fallback.
- src/tools/id-photo-camera/capture.ts:1-72 — pure: overlayRect, unmirrorRect, toBox, isLowres, meanLuma/isBlackFrame.
- src/tools/id-photo-camera/errors.ts:1-37 — DOMException name -> usage code + the brief's D7 copy (+ an `other` line).
- src/tools/id-photo-camera/copy.ts:1-16 — late status/alert copy.
- src/tools/id-photo-camera/send.ts:1-25 — sendTo('id-photo', 'id-photo-camera', …) with go -> `/id-photo/?preset=<id>` (unknown id -> default), usage next event.
- src/content/tool-notes/id-photo-camera.md:1-48 — tool note (sources: 외교부 menuPos=32 근접 촬영 quote, menuPos=12 휴대폰 사진 quote, 2026-10-22).
- tests/unit/id-photo-camera.test.ts:1-228, tests/e2e/id-photo-camera.spec.ts:1-200, tests/e2e/id-photo-camera.fake.spec.ts:1-55, tests/e2e/idcam.ts:1-77.

Changed
- src/lib/ui/handoff.ts:160-191, 244-260 — `takeHandoffFrom` (file + record `from`); `receiveHandoff` deliver gets `(file, from)`; `takeHandoff` behaviour unchanged.
- src/tools/id-photo/entry.ts:9-16, 55-59, 72-81, 94-108 — /id-photo/ becomes a receiver (only when #idp-notice exists and a marker for id-photo is waiting; otherwise sweepIfDue as before); 「카메라로 찍기」 href follows the select.
- src/tools/id-photo/controller.ts:85-89, 101, 168-169, 357-358, 443-445, 725 — `open(file, {from})`; checklist gets `bgEdited: __BG_REMOVE__ && from === 'remove-background'`.
- src/lib/idphoto/warnings.ts:33-35, 63-75, 96-100, 126-129 — D8c items: `bgremoved` (block; passport quotes 외교부 menuPos=12, driver 도로교통공단) / `bgmaybe` (warn; other presets outside 이력서/기타/custom).
- src/tools/id-photo/overlay.ts:79-86 — `drawGuides(g, preset, W, H)` extracted; drawOverlay calls it with the same W/H (same draw calls, same order).
- src/components/IdPhotoTool.astro:22-23, 86-87, 94-95 — #idp-camera link (flag on, not embed), #idp-notice (not embed).
- src/data/tools.ts:223-268, 737-738 — ID_CAMERA_TOOL + spread after id-photo when `__ID_CAMERA__`.
- scripts/check-dist.mjs:17-18, 37-39, 648-698 — camera rules + budgets (initial 30 KB, lazy 6.2 KB).
- scripts/gen-headers.mjs:15, 77-84 — appends the camera block once (idempotent: check-dist may see an already written dist/_headers).
- scripts/gen-sw.mjs:20, 62, 105 — runtime page (flagged) + NOT_PRECACHED.
- scripts/gen-brand.mjs — FLAGGED_IMAGES id-photo-camera (idCamera). src/data/og.json — image + /id-photo-camera/ description.
- astro.config.mjs, src/env.d.ts, vitest.config.ts — inject route + `__ID_CAMERA__` (vitest: true).
- scripts/lib/usage.mjs:48, 385 + src/lib/ui/usage.ts:13 — slug + label.
- scripts/lib/bgcloud.mjs:64 (LOCAL_SCOPE_RE), scripts/lib/ui-font-chars.mjs (CORE_PATHS page.astro), src/data/site.ts (HOME_DESC_ORDER after english-address), src/data/guides.ts (NEXT_GUIDES), src/data/tool-notes.ts (NOTE_SLUGS), lighthouserc.json, scripts/qa/visual.mjs, docs/COPY.md (rule line).
- Tests updated for the new live tool: tests/e2e/site.spec.ts, tests/e2e/polish.spec.ts, tests/unit/{adsense,addren-flag,handoff,postbuild,tool-notes}.test.ts.

## Decisions (logged in BUILD-LOG "IDCAM1022 B")
- Reviewer note applied via `drawGuides` + translate (controller.ts 155-184).
- Direct sendTo with `?preset=` instead of a next-steps FLOW row (labels/queries don't fit FLOW).
- `cam-` prefix (`.ic-stage` is a global id-copy rule).
- D8c string gated by `__BG_REMOVE__` (flag-off bundle may not name remove-background; check-dist caught it).
- Usage mapped onto existing event kinds (no Function change).
- Copy reworded to existing glyphs (D11): 「카메라 바꾸기」 not 「앞/뒤 …」; selfie line without 팔/뻗/벽; late 켰/껐/맣 avoided.
- Camera select has no 직접 입력; sharpness/burst deferred to Step C; no committed y4m (Chromium fake device + canvas-stream stub).

## Tests
- `npm run check`: 0 errors, 0 warnings (11 pre-existing hints).
- vitest: 99 files, 2,176/2,176 (new: tests/unit/id-photo-camera.test.ts 19; handoff `from` test; postbuild camera flag test).
- Builds (PUBLIC_SITE_URL=https://docttak.com): default (camera on) check-dist OK — /id-photo-camera/ initial JS 13.7/30 KB,
  controller 5.1/6.2 KB, fonts preloaded 92.1/92.66, precache 427.0/450; AUTOFRAME=1 check-dist OK (fonts 92.6/92.66);
  PUBLIC_ID_CAMERA=0 check-dist OK (no page, 0 camera=(self) in _headers, no path in sitemap/llms/sw.js, fonts 92.1,
  precache 423.9) and postbuild.test 77/77 against it.
- e2e, 1 worker, retries 0: id-photo-camera.spec + .fake.spec chromium 7/7 and mobile-chrome 7/7; id-photo.spec + chain.spec
  chromium (AUTOFRAME=1 dist) + manual-chromium (default dist) 89 passed / 16 skipped / 0 failed; site.spec + polish.spec
  chromium 177 passed after two fixes (landing `.card.live` count 21->22 in the test; a real 360 px overflow on the camera
  page from the preset select — fixed in camera.css, re-run green on chromium + mobile-chrome).
- Not run locally (CI): firefox, webkit, mobile-safari projects (camera specs designed for them: synthetic camera on Firefox,
  no-API/denied paths on WebKit); cloud-* projects (usage.spec with the new slug); LHCI; qa:visual (live-site matrix, deploy gate).

## Open Questions
- D8c 「원본 사진으로 다시 하기」 button not built: on /id-photo/ the original is not available; the block text says 「원본 사진으로 다시 해 주세요」 and 「다른 사진 처리하기」 already exists. Proposed for Step D with the sender.
- The brief's handoff URL is `/id-photo/?preset=P`; /id-photo/'s readUrl rewrites the default preset to `/id-photo/` (existing behaviour).
- Firefox fake camera resolution unknown; the synthetic-camera test uses a 432×560 canvas stream there, so passport saves regardless.

## Out of Scope (logged in BUILD-LOG)
- Live hints, burst/sharpness (Step C); background link and remove-background receiver (Step D); guide (Step E).
- Owner O1/O2 real-phone and in-app checks.
