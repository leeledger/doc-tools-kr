# Architect Brief — IDCAM1022 (design): 증명사진 촬영 `/id-photo-camera/`

Status: DESIGN, locked 2026-10-22 (Arch). Build starts only after LOAN1022 (차용증) is deployed and logged; rebase on it first
(both add a tool: TOOLS list, usage TOOLS, menu, home, sitemap, llms, tool-count tests).
Owner request (2026-10-22): 「차용증 만들기 이후 증명사진 촬영을 만드는데 … 증명사진 규격 맞추기 기존의 기능과 연계 … 배경지우기와도 관련」.
Sources saved: handoff/sources/idcam1022/official-photo-rules-2026-10-22.txt (외교부 menuPos=32/12 re-read today; every quote below
found verbatim), handoff/sources/idcam1022/search-suggest-2026-10-22.txt (Google/Naver suggestions, today).

## Goal
A phone user takes an ID photo with the camera, framed live to the head guide of the chosen 제출처, and lands in the existing /id-photo/
crop/size/KB/save pipeline without downloading anything; background help only where no cited rule forbids it.

## Locked decisions

D1 Product shape: NEW page `/id-photo-camera/` (menu/H1 「증명사진 촬영」, title 「집에서 증명사진 찍기 – 휴대폰 카메라로 규격 맞춰 촬영 | 문서딱」)
  plus a 「카메라로 찍기」 link on /id-photo/ (→ `/id-photo-camera/?preset=<current>`). NOT a mode inside /id-photo/.
  Why: (a) separate search intent. Suggestions today: 「집에서 증명사진 찍기」「핸드폰으로 증명사진 찍기」「여권사진 집에서 찍기」
  「셀프 증명사진 촬영」「증명사진 어플 무료」 (search-suggest file) vs the 규격 intent of /id-photo/ (증명사진 cluster ~20만/월, mobile 85–90 %,
  search_demand.md). One URL cannot carry both titles. (b) Permissions-Policy camera opens only on the new route; /id-photo/
  (top tool, 291 sessions in wk 43) keeps camera=() and its LCP. (c) Regression risk to /id-photo/ limited to one receiver hook.
D2 One pipeline: the camera page only CAPTURES. Crop/rotate/checklist/KB/pixel limits/save stay in /id-photo/ (single source of truth).
  Hand-over = the existing 이어서 하기 store (src/lib/ui/handoff.ts sendTo → IndexedDB, 10 min TTL, nothing leaves the device) plus
  URL `/id-photo/?preset=<id>`. /id-photo/ becomes a handoff receiver (it is not one today; receivers: jpg-to-pdf, photo-compress, pdf-*).
D3 Pre-framed capture: the saved still = the overlay rectangle (exact preset aspect outW:outH) cut from the full video frame at native
  resolution. /id-photo/ manualFrame (largest centred crop of the preset aspect; src/lib/idphoto/frame.ts) then equals exactly what the
  user lined up; they may still nudge. Preset change after arrival works as today.
D4 Guide overlay = the SAME geometry /id-photo/ draws (crown line, head band, centre line, face oval; CROWN_FRAC/HEAD_FRAC,
  preset.headBand, LABELS). Official band only where headBand.kind is official (passport_online, driver_license:
  「머리 길이는 정수리(머리카락을 제외한 머리 최상부)부터 턱까지 3.2~3.6cm 사이인 사진을 제출해야 함」, 외교부 menuPos=32, re-read 2026-10-22);
  every other preset keeps the 참고 label. No new numbers. Step A extracts the geometry so both pages share it.
D5 Camera: starts only on tap 「카메라 켜기」 (no prompt on load). getUserMedia {video:{facingMode, width:{ideal:2560},
  height:{ideal:1440}}, audio:false}; video element playsinline muted autoplay. Default front camera; 「앞/뒤 카메라 바꾸기」.
  Front preview mirrored; the saved photo is NOT mirrored. Timer 「바로 / 3초 / 10초」, default 3초, big countdown digits, no sound.
  Burst: 3 frames ~250 ms apart, keep the sharpest (variance of Laplacian on a ≤256 px luma copy). Review: 「다시 찍기」 /
  「이 사진으로 규격 맞추기」. Tracks stopped on capture, review, visibilitychange hidden, pagehide and navigation.
D6 Live hints (advisory, never block, ≤4 Hz on a ≤160 px downsample, no model):
  (1) background: reuse checkBackground (src/lib/idphoto/background.ts, same thresholds) on the overlay strips →
      「뒤 배경이 흰색으로 고르지 않아요. 흰 벽 앞에 서 주세요.」
  (2) face zone too dark: mean L* in the oval < 35.
  (3) backlight: background L* minus oval L* > 40 → 「뒤쪽이 너무 밝아요. 창문을 등지지 마세요.」
  (4) phone level from deviceorientation only where events arrive without a prompt (Android); iOS: no motion prompt, no level.
  35/40 are OUR heuristics (logged, tuned on fixtures, never shown as a rule). NO distance or head-tilt hint: needs face detection;
  MediaPipe stays on /id-photo/ behind PUBLIC_ID_PHOTO_AUTOFRAME (off in production; licence = owner item) → Known Gap.
D7 Fallback: feature-detect navigator.mediaDevices?.getUserMedia; on absence or any error show an input type=file accept=image/*
  capture=user 「휴대폰 카메라로 찍기」 (native camera app); that photo (not pre-cropped) goes to /id-photo/ the same way.
  No UA sniffing for behavior. Error copy (plain Korean; never 브라우저/권한/서버/업로드):
  - NotAllowedError/SecurityError: 「카메라를 쓸 수 없어요. 카메라 사용을 허용하지 않았거나 휴대폰 설정에서 막혀 있어요. 설정에서 카메라를 허용하거나, 아래 「휴대폰 카메라로 찍기」를 눌러 주세요.」
  - NotFoundError/OverconstrainedError: 「이 기기에서 카메라를 찾지 못했어요. 아래 「휴대폰 카메라로 찍기」를 눌러 주세요.」
  - NotReadableError: 「다른 앱이 카메라를 쓰고 있어요. 그 앱을 닫고 다시 눌러 주세요.」
  - no API: 「여기서는 화면 안 촬영을 쓸 수 없어요. Chrome, Safari, 삼성 인터넷에서 열거나 아래 「휴대폰 카메라로 찍기」를 눌러 주세요.」
  No app-specific menu instructions (KakaoTalk UI unverified → owner O2).
D8 Background (the 배경 지우기 link), rule-driven. Citations:
  - 외교부 menuPos=32: 「사진 편집 프로그램, 사진 필터 기능 등을 사용하여 임의로 보정된 사진(AI를 활용한 편집·가공·합성·창조 제작물 포함)은 허용 불가함」
  - 외교부 menuPos=12 (제출 불가 사례): 「배경이 흰색이 아니거나, 배경색을 사진 편집 프로그램으로 제거하여 사진이 변형된 경우」
  - 도로교통공단 (guide driver-license-photo, retrieved 2026-10-06; the popup is script-rendered today): 「복사 또는 포토샵 등으로 수정하지 않은 사진」, 「인위적으로 합성된 사진 불가」
  (a) The camera page NEVER edits pixels except crop; background is fixed at capture time (hint D6.1 + copy).
  (b) 「배경을 흰색으로 바꾸기」 is offered ONLY for saramin, jobkorea (group 이력서), half_card (기타, arithmetic) and custom. It is a chain
      to the existing /remove-background/ (its own consent; local engine or the owner-approved cloud copy ≤1024 px behind PUBLIC_BG_CLOUD,
      explicit tap). The camera page itself never sends anything. /remove-background/ becomes a receiver; an arriving photo stops at
      ready (cloud) or consent (local) and NEVER auto-sends. Its result offers 「이력서 사진 규격 맞추기」 →
      /id-photo/?preset=(incoming allowlisted id, else saramin). Whole link gated by __BG_REMOVE__.
  (c) /id-photo/ receiving a photo whose handoff from is remove-background: passport_online and driver_license → blocking checklist
      item quoting the rule (save disabled; 「원본 사진으로 다시 하기」). Every other preset outside 이력서/기타/custom → non-blocking
      「배경을 지운 사진은 기관에 따라 받지 않을 수 있어요」. Provenance is lost if the user saves and reopens: accepted; tool notes and guide say it.
  (d) Passport honesty: preset passport_online shows 「외교부는 휴대폰으로 찍은 사진을 권장하지 않아요. 직접 찍은 사진은 규격에 맞을 때만 쓸 수 있어요.」
      (menuPos=12 「휴대폰 등 모바일 기기로 촬영된 사진, 사진 편집 프로그램 등으로 과도한 보정을 한 사진은 여권 발급 시 사진이 실물과 다르게 표현될 수 있으므로 권장하지 않음」;
      menuPos=32 「본인이 직접 촬영한 사진은 여권사진 규격에 적합한 경우에만 사용 가능함」) + the existing 외교부 사진 확인 link (PASSPORT_CHECK_URL).
      Close selfies (menuPos=32 「머리를 카메라를 향해 앞 또는 뒤로 기울이거나 얼굴을 가까이 근접 촬영한 사진은 사용 불가함」) →
      copy 「팔을 뻗은 셀카보다 휴대폰을 세워 두고 떨어져서 타이머로 찍으세요.」 No distance number (none is published).
  (e) /remove-background/ NOT_FOR_ID copy stays as is.
D9 Privacy/runtime: no new POST, no new third party, CSP unchanged (MediaStream via srcObject; verified in Step B e2e: 0 CSP errors).
  _headers: block /id-photo-camera/ with "! Permissions-Policy" + "Permissions-Policy: camera=(self), microphone=(), geolocation=()";
  check-dist asserts camera=(self) on that route only and camera=() everywhere else (incl. /embed/*). No AdSense (tool page).
  Usage beacon: slug id-photo-camera in scripts/lib/usage.mjs TOOLS and the Function whitelist; events: cam ok, cam fail
  (denied|notfound|busy|nosupport|other), capture, handoff, fallback. Never pixels.
D10 Kill switch PUBLIC_ID_CAMERA (default ON in code). =0: page not built; links, menu, sitemap, llms entries and the _headers block
  absent (check-dist). Real-phone tests are post-launch owner items, not a gate (never stop); the native-input fallback covers failures.
D11 Budgets (never raise): initial JS ≤30 KB; camera controller lazy (first tap), budget = measured +20 % logged in check-dist; precache
  ≤450 KB (page goes to the runtime cache like /stamp-signature/); preloaded UI fonts ≤92.66 KB (tripwire ~0.06 KB from the limit):
  reword copy to reuse core glyphs, never grow the preload; Lighthouse thresholds unchanged. Content bars: tool page ≥2,000 chars
  (tool-notes); guide ≥2,500 + 2 own images.
D12 Not in v1: print sheet (10×15 모아찍기) → Step F candidate with its own brief; live face detection; beautify/filters (never).

## Flow

    /id-photo/ --「카메라로 찍기」--> /id-photo-camera/?preset=P            (also: guides, menu, search)
                                       | tap 「카메라 켜기」
                         getUserMedia? +-- none / error --> mapped copy + input capture --> photo --+
                                       v                                                          |
                          live view + overlay(P) + hints(D6) + timer                              |
                                       | shutter -> countdown -> 3-frame burst -> sharpest         |
                                       v                                                          |
                           crop to overlay rect (P aspect), unmirror --> review                   |
                             「다시 찍기」 <-+   | 「이 사진으로 규격 맞추기」                               |
                                             v                                                    |
                             sendTo(id-photo, jpeg, from=id-photo-camera) <------------------------+
                                             v
                             /id-photo/?preset=P : takeHandoff -> open(file) -> crop/checklist/KB -> save (unchanged)

      P in {saramin, jobkorea, half_card, custom} and __BG_REMOVE__:
        review 「배경을 흰색으로 바꾸기」 -> sendTo(remove-background) -> /remove-background/?bg=white&preset=P
          -> stops at ready|consent (user taps) -> result 「이력서 사진 규격 맞추기」 -> sendTo(id-photo, from=remove-background)
          -> /id-photo/?preset=P ; user switches to passport/driver -> blocking item (D8c)

## Build Order (each step: Bob -> Richard -> deploy -> live smoke)

Step A — refactor only (no behavior change)
- Extract pure guide geometry from src/tools/id-photo/overlay.ts into src/lib/idphoto/guides.ts (positions in output coords per preset);
  overlay.ts draws from it. Unit tests for guides.ts.
- Acceptance: vitest green; id-photo.spec (manual + autoframe builds) green; qa:visual /id-photo/ no diff.

Step B — /id-photo/ receiver + camera page core
- src/tools/id-photo/entry.ts: pendingHandoff(id-photo) -> receiveHandoff -> open(file); controller API open(file, {from}) for D8c;
  D8c items in src/lib/idphoto/warnings.ts (Step B adds the plumbing; the remove-background sender arrives in Step D).
- New src/tools/id-photo-camera/{entry.ts, controller.ts, capture.ts (pure: rect math, unmirror, sharpness), errors.ts (error -> copy),
  copy.ts}; src/pages/id-photo-camera/index.astro; preset select reuses src/data/id-photo-presets.ts + renderSource (source.ts).
- src/data/tools.ts entry (FAQ, tool notes ≥2,000), menu, home card, sitemap, llms.txt, OG image, ~~next-steps id-photo-camera -> id-photo~~ (superseded in Step B: the review button hands over with sendTo + ?preset, src/tools/id-photo-camera/send.ts; see BUILD-LOG IDCAM1022 B).
- public/_headers block (D9) + check-dist rules; PUBLIC_ID_CAMERA (D10) in astro.config define + check-dist + postbuild test.
- Usage slug (D9). 「카메라로 찍기」 link on /id-photo/ (flag on only). Review-screen fallback 「사진 저장」 when the handoff store fails.
- Flag: Bob must not add pixel edits, sounds, a motion-permission prompt, UA-based behavior, or any network call.
Step C — live hints + burst (D5 burst, D6). Pure analysers in src/lib/idphoto/live.ts (luma/L* stats; reuse checkBackground).
Step D — background link (D8b/c): /remove-background/ receiver (stop at ready/consent), ?bg=white preselect, ?preset allowlist
  pass-through, result link to /id-photo/; camera review button for allowed presets; all behind __BG_REMOVE__;
  /id-photo/ 「원본 사진으로 다시 하기」 button on the D8c blocking item (deferred from Step B).
Step E — guide /guide/self-id-photo/ 「집에서 증명사진 찍는 법」 (query 「집에서 증명사진 찍기」; ≥2,500 chars; 2 own SVGs: phone setup,
  good/bad framing silhouettes; every number cited, reuse the quotes above, check:quotes --exact); links from passport-photo,
  driver-license-photo, resume-photo and id-card guides (「직접 찍을 때」 parts) and the tool page. Similarity bar as CONTENT1021.
Step F (candidate, own brief later) — 인화용 모아찍기 sheet on the /id-photo/ result (serves 「집에서 증명사진 출력/인쇄」).

## Failure modes
| Path | Realistic failure | Handling | User sees |
|---|---|---|---|
| getUserMedia | in-app WebView without API / silent deny | feature detect + D7 copy + native input | clear message + working fallback |
| permission | user blocked it earlier (persisted) | NotAllowedError copy (D7) | clear |
| camera busy | another app holds the camera | NotReadableError copy | clear |
| stream | tab hidden mid-countdown (call, app switch) | stop tracks, cancel timer, show 「카메라 켜기」 again | clear |
| iOS video | black frame (missing playsinline/muted) | attrs set; capture refuses a frame with mean luma ~0 -> 「다시 찍기」 | clear |
| resolution | front cam 640x480 -> crop below preset px | review warns when crop < preset px; /id-photo/ lowres block as today | clear |
| handoff | IndexedDB blocked (private mode) / >10 min | existing TAKE_FAILED; review offers 「사진 저장」 of the still | clear |
| mirror | saved image mirrored | unit test unmirror; e2e asserts an asymmetric fixture orientation | n/a (tested) |
| bg chain | photo auto-sent on arrival | state test: arrival -> ready/consent only; cloud spec: 0 POSTs until tap | n/a (tested) |
| bg -> passport | bg-removed photo saved as passport | D8c blocking item | clear |
| headers | Permissions-Policy merged to camera=(), camera=(self) | detach line + check-dist + live curl in smoke | n/a (tested) |
| font budget | new glyphs push preload over 92.66 KB | check-dist fails; reword | n/a |
No silent and untested path remains.

## Test map
- [GAP->B] unit capture.ts: rect per preset aspect in portrait/landscape frames; unmirror; lowres flag.
- [GAP->B] unit errors.ts: each DOMException name -> copy; no 브라우저/권한/업로드/서버 in copy (dist copy test too).
- [GAP->B] e2e chromium + mobile-chrome: launch args --use-fake-ui-for-media-stream --use-fake-device-for-media-stream
  --use-file-for-fake-video-capture=tests/fixtures/idcam/(white-bg|dark|backlit).y4m (small committed synthetic y4m): tap 켜기 ->
  shutter(바로) -> review -> 규격 맞추기 -> /id-photo/?preset=passport_online shows the photo; save 413x531, ≤500 KB; no-upload fixture
  (0 POSTs); 0 console/CSP errors; camera track ended after capture.
- [GAP->B] e2e firefox: prefs media.navigator.streams.fake=true, media.navigator.permission.disabled=true; same happy path.
- [GAP->B] e2e webkit/mobile-safari (no fake camera in Playwright): getUserMedia stubbed undefined -> fallback input; setInputFiles -> /id-photo/.
- [GAP->B] e2e denied: addInitScript makes getUserMedia reject NotAllowedError -> D7 copy + fallback.
- [GAP->B] e2e /id-photo/ receiver (chain.spec pattern) -> photo opens; without a marker IndexedDB is not touched.
- [TESTED] /id-photo/ crop/limits/save (id-photo.spec): must stay green in A, B, D.
- [TESTED] chain id-photo -> jpg-to-pdf (chain.spec:494): stays green.
- [GAP->B] check-dist: Permissions-Policy per route; PUBLIC_ID_CAMERA=0 build has no camera route/link/header; usage slug present.
- [GAP->C] unit live.ts: L*/backlight on synthetic ImageData; checkBackground reuse; sharpness picks the sharp one of 3.
- [GAP->C] e2e: dark.y4m shows the dark hint, backlit.y4m the backlight hint, white-bg none.
- [GAP->D] unit bg phase model: arrival in {ready, consent}; remove-background.spec + cloud spec: POST count 0 until tap; preset
  allowlist; /id-photo/ from=remove-background + passport -> save disabled with the quote; + saramin -> no item.
- [GAP->E] guide-length, check:quotes --exact, similarity, 2 images, links.
- Every step: no-upload fixture on all specs, axe, LHCI median-of-5 on /id-photo/ and /id-photo-camera/, qa:visual.

## Unverified claims (do not rely on)
- In-app (KakaoTalk/Naver/Instagram) getUserMedia support: unknown; the fallback covers it; owner O2.
- iOS Safari still from the video element is video resolution (typically ≤1920 px); enough for 413x531 at the overlay crop on paper
  (≥2x); verify on device (O1); the lowres path covers the worst case.
- srcObject not governed by CSP media-src: verify in Step B e2e (0 CSP errors); if wrong, add media-src on this route only.
- Cloudflare _headers detach for Permissions-Policy: same mechanism as the working CSP detach (/embed/id-photo/*, AdSense routes);
  verify by curl in live smoke.
- Local 배경 지우기 engine on mid phones: BiRefNet-lite 92.3 MB + ORT WASM 14.2 MB (src/generated/bgremove.json), heavy on mobile data;
  production runs the cloud path (live /remove-background/ shows 「보내지 않고 기기에서 처리」, probed 2026-10-22). Unchanged here.

## Out of Scope (-> BUILD-LOG Known Gaps if surfaced)
- Live face detection / distance and head-tilt hints (MediaPipe + owner licence decision). Beautify, skin, filters, background edits
  for official presets (never). 모아찍기 sheet (Step F). /en/ version. Embed widget camera. Video or sound.

## Owner-only
- O1 Real phones after Steps B/C ship: iPhone Safari 16.4+, Galaxy Chrome + 삼성 인터넷: camera on, front/back switch, timer, capture,
  photo not mirrored, lands in /id-photo/ and saves; deny then re-allow.
- O2 In-app: KakaoTalk, Naver app, Instagram: in-page camera works, or the fallback appears and works.
- O3 Optional: one self-taken photo through 외교부 사진 확인 (PASSPORT_CHECK_URL); report only, never claimed on the page.
- O4 (existing) auto-frame licence decision; would later enable distance hints.

## Acceptance (design)
- Steps A–E each pass: check 0/0, vitest, check-dist (default, PUBLIC_ID_CAMERA=0, AUTOFRAME=1, cloud/BG builds), check:licenses
  (no new dependency expected), e2e 5 projects with no-upload, axe, LHCI, qa:visual, budgets unchanged, Richard CLEAR, live smoke incl.
  curl -I https://docttak.com/id-photo-camera/ shows camera=(self) and /id-photo/ shows camera=().
