# Review Feedback — Step 4 (여권·증명사진 규격 맞추기, /id-photo/)
Date: 2026-09-30
Reviewer: Richard
Diff: uncommitted working tree against HEAD 9c4e019
Ready for Builder: YES (round 2, 2026-09-30; round-1 findings below are resolved)

## What I ran myself
| Gate | Result |
|---|---|
| `npm run check` | 0 errors, 0 warnings, 0 hints (172 files) |
| `vitest run` | 393/393 (18 files) |
| `npm run build` (flag default = 0, the shipping build) | green; check-dist OK, 338 files; UI fonts 178.0/180 KB; precache 297.5/450 KB, `/licenses/` not in sw.js; `check-dist --no-mediapipe` OK |
| grep of the flag-0 dist for `mediapipe`, `FaceLandmarker`, `odml`, `vision_wasm`, `tasks-vision` | no hits. `dist/vendor` holds only pdfjs and qpdf |
| `check:licenses`, flag 0 | OK: 26 packages, 3 components, 0 exceptions |
| `PUBLIC_ID_PHOTO_AUTOFRAME=1 npm run build` | green; vision_bundle 43.9/50, loaders 76.2/76.1 of 90, wasm 11,481 KB raw and 3,360 KB gzip, lazy total 6,736.5/7,372.8 KB, fonts 179.1/180, precache 298.4 |
| `check:licenses`, flag 1 | FAIL on fft2d `LicenseRef-Ooura` only; Eigen exception used. This is expected; the Arch decision keeps it off |
| e2e id-photo spec: chromium, firefox and webkit (flag-1 dist, plus dist-noauto for the kill switch) | 85 passed, 1 flaky (firefox `page.goto` timeout in `gotoReady`, the known race; passed on retry), 10 skipped (stated reasons), 0 failed |
| lockfile | `package-lock.json` diff is +7/−0: only `@mediapipe/tasks-vision@1.0.1` with its integrity hash. The repo builds green from the restored node_modules. |

Manual pass on the shipping (flag-0) build in Chromium: desktop 1280, Pixel 7 and dark. I captured screenshots of the empty, adjusting, confirm-unchecked, confirm-checked, done and outside states and looked at them with Read.
- No off-origin request, no non-GET request, no MediaPipe request, no console error. Horizontal scroll is 0 on all three.
- **Downloaded files, parsed byte by byte by me (PIL agrees):**
  - passport 413×531, 72,191 B, SOF0, JFIF units 1 at 300/300, markers e0,db,c0,c4,da (no APP1), EOI present, no "Exif".
  - From the 3200×4000 spike p01 (prescale path), every preset: gosi 137×177 at 99 dpi, qnet 413×531 at 300, saramin 100×140 at 96, jobkorea 150×210 at 96, halfcard 354×472 at 300. Custom 200×250 with 10 KB gave 8,570 B at 96 dpi.
  - Rotated +5° after zooming in gave 413×531 with real photo pixels in all four corners (no white fill).
  - All of them are exact and under their limits.
- **Confirmation:** save is disabled with the visible reason. The checkbox clears on every adjustment: arrow key, −, [, Home, nudge button, reset, zoom slider, rotate slider, mouse drag and preset change.
- **Zoom and rotation limits:** zoom-in stops at s = 1 (range 1000/1000). Rotation stops at 5.0°. Zooming out to the minimum shows the hatched area, the outside block and a disabled save.
- **Download button:** visible in the viewport on the done state at desktop (y 590 of 900) and on mobile (y 550 of 839).
- **Copy on the page:** the six notices and the confirmation label are verbatim (e2e 11 as well). The checker link has rel noopener noreferrer, target _blank and "(새 창)". The 6 MB line is absent with the flag off.

Not re-run by me: Lighthouse, qa:visual, smoke:assets, the regress suites, mobile projects in e2e. I relied on the numbers Bob reported for those.

## Must Fix
- src/pages/id-photo/index.astro:35, :182 and src/data/tools.ts:160 (confidence: 9/10) — **The shipping build advertises a feature it does not have.** With the Arch decision "ship MANUAL-ONLY", the flag-0 page still says:
  - lead: "얼굴 위치를 자동으로 잡아 드리고, 안내선을 보며 직접 맞춘 뒤 …"
  - 사용 방법 2: "얼굴 위치를 자동으로 맞춘 뒤 안내선이 나타납니다."
  - FAQ 2 (also in the FAQPage JSON-LD): "얼굴 위치 자동 맞춤은 추정값이어서, …"
  I confirmed all three in the built `dist/id-photo/index.html` of the default build. A user sees no auto frame, only the largest centred crop with "직접 맞추기: 안내선에 정수리와 턱을 맞추세요". This is exactly the kind of claim the owner would have to apologise for.
  - Fix: gate these three strings on `__ID_PHOTO_AUTOFRAME__`, as the 6 MB line already is (index.astro:13/77). tools.ts needs the same define (vitest.config already has it).
  - Give each one a manual-mode variant, for example lead "… 안내선을 보며 사진 위치를 직접 맞춘 뒤 …", step 2 "안내선이 나타나면 끌어서 옮기고 확대·축소해 정수리와 턱을 안내선에 맞춥니다.", and FAQ 2 without the 자동 맞춤 sentence ("안내선을 보고 정수리와 턱 위치를 직접 확인해야 저장할 수 있습니다.").
  - Add a postbuild/e2e assertion: a flag-0 dist contains no "자동으로 잡아", "자동으로 맞춘" or "자동 맞춤은" on /id-photo/.
  - The exact wording is for Arch to decide (see Escalate); the gating is not optional.

## Should Fix
- src/tools/id-photo/autoframe.ts:61-64 (confidence: 8/10, flag-1 only, so not shipped today) — **A skip or timeout during model init leaves the crash flag set for the whole session.**
  - The code is `const lm = await landmarker; const bm = await bitmap; if (done) return;`. This path returns without `clearAttempt(storage)`, although `markAttempt` ran at :49.
  - After "건너뛰고 직접 맞추기" (or the 60 s timeout) while `createLandmarker` is still running, `idphoto-mp-attempt` stays in sessionStorage. Every later photo in that tab then goes manual, because the guard reads it as a crash.
  - Fix: call `clearAttempt(storage)` before that early return, since the tab evidently survived init. Add a unit test: skip during init, then resolve init, and the key is gone.
- scripts/regress/idphoto.mjs:36 (confidence: 9/10) — **The Arch Firefox PSNR floor is not implemented.** The code still has `const PSNR_MIN = 38;` for every browser. Arch decided on 37.0 dB for Firefox only, with Chromium and WebKit kept at 38.0.
  - The harness still reports Firefox check 6 as a FAIL, so the recorded gate and the decision disagree.
  - Fix: make PSNR_MIN 37 when the browser is firefox and 38 otherwise, with a comment citing the BUILD-LOG decision. Re-run `regress:idphoto` on firefox and paste the result.
- src/pages/id-photo/index.astro:158 / the `.save-name` style (confidence: 7/10) — **The file name on screen does not match the real one.** "저장될 이름: passport_413x531.jpg" renders as "passport_413×531.jpg". The UI font contextual alternates turn digit-x-digit into ×, as seen in the desktop and mobile done screenshots.
  - The DOM text and the real file name are ASCII "x", but a user who types or compares the name sees a character that is not in the file.
  - Fix: `font-feature-settings: "calt" 0` on `.save-name`. Check the name lines of the other tools too.
- scripts/gen-sw.mjs (confidence: 7/10) — **Offline first use of /id-photo/ gets the engine panel.** The page is precached but its lazily imported controller chunk is not (open question from Bob).
  - The controller chunk plus its static imports are a few KB. Adding them to the precache list does not touch LCP, because the SW installs after load, and it makes the precached page actually work offline.
  - Recommend adding it, or have Arch accept the gap explicitly.

## Escalate to Architect
- **Copy for the manual-only build.** The Must Fix needs flag-0 wording for the lead, step 2 and FAQ 2. The lead in the brief is "verbatim" and assumes auto-framing. I proposed text above; Arch owns the final words.
- **Offline first use of /id-photo/** (open question from Bob). Precache the controller chunk (my recommendation) or accept the gap.
- **UI font headroom** is ~1 KB with the flag on (179.1/180) and 2 KB with it off. The next tool with new copy will break the budget; a decision is due before Step 5 merges its copy.
- **Flag-1 e2e only.** The main id-photo e2e suite assumes flag 1. The shipping flag-0 build is covered by one chromium kill-switch test plus the manual fallback paths that run inside flag 1. My manual pass found the shipping build behaving correctly.
  - Once the Must Fix gates copy on the flag, consider running the notices, SEO and copy tests against dist-noauto as well, so that the shipped configuration is what gets tested.

## Cleared
The spec output is correct. I checked it by reading the code and by parsing files I downloaded myself from the shipping build:
- exact pixels per preset, gosi at 349,999 B, and JFIF dpi 300/99/96/96/300/96;
- the verify-or-discard step, and SOF0 with no APP1;
- s ≤ 1 with no padding (white fill only within the 0.5 px tolerance), and rotation corners.

Also cleared:
- The reducer clears the confirmation on every adjustment.
- The notices are verbatim, the presets are sourced, and the dropped presets are absent.
- The flag-0 dist carries no MediaPipe byte or string, and the flag-0 license set is clean.
- Flag-1 telemetry is detached and CSP-blocked (e2e green).
- The /licenses/ precache removal and the ui-shared chunk behave as Bob reported. The lockfile adds only tasks-vision.
- check, unit, both builds and the three-browser id-photo e2e are green.

Step 4 clears once the Must Fix lands.

---

# Round 2 — Richard, 2026-09-30
Ready for Builder: YES. **Step 4 is clear.**

## Gates I ran
| Gate | Result |
|---|---|
| check | 0 / 0 / 0 |
| unit | 397/397 (19 files); I re-ran it after the builds settled |
| build, flag off (default, shipping) | check-dist OK, 338 files; fonts 178.0/190; precache 327.5/450, 20 URLs incl. `controller.*.js` |
| build, flag off into dist-noauto | `check-dist --dist dist-noauto --no-mediapipe` OK |
| build, flag 1 | check-dist OK, 345 files; fonts 179.1/190; precache 330.1/450 |
| licenses | flag 0 OK (26, 3, 0 exceptions); flag 1 FAIL on fft2d only (accepted Known Gap) |
| e2e id-photo, chromium + manual-chromium | 49 passed, 15 skipped, 0 failed, 0 flaky |

## Verified
- **Must Fix: resolved.**
  - A grep of the shipping `dist/id-photo/index.html` (and `dist/index.html`) finds none of "자동으로 잡아", "자동으로 맞춘", "자동 맞춤", "건너뛰고" or "6 MB의".
  - The lead now reads "…안내선을 보며 사진 위치를 직접 맞춘 뒤…". The skip button is not rendered, and reset reads "처음 위치로".
  - The flag-off controller chunk still holds `manualSwitch` and `resetAuto` strings. They are unreachable there: `photo.face` and `note = COPY.manualSwitch` are set only inside the `__ID_PHOTO_AUTOFRAME__` branch. Harmless.
- **Phrase guard, both directions.**
  - The flag-0 build passes.
  - Running `PUBLIC_ID_PHOTO_AUTOFRAME=0 node scripts/check-dist.mjs` against the flag-1 dist FAILs, naming all five phrases.
  - The flag-1 page still carries the auto copy (1 hit for "자동으로 잡아").
- **Should Fix 1** (autoframe.ts:58-66): `clearAttempt(storage)` now runs on the `done` early return. There is a new unit test for skip and timeout with a late init.
- **Should Fix 2** (regress/idphoto.mjs:38): `PSNR_MIN = browserName === "firefox" ? 37 : 38`, citing the Arch decision.
- **Should Fix 3** (app.css:231-233): calt is off on `.save-name` and on the merge/photo name rows.
- **Should Fix 4** (gen-sw): the lazy controller chunk is precached; I confirmed `controller.*.js` is in the shipping `sw.js`.
- **Font budget** is 190 KB in check-dist, logged as an Arch decision; usage is 178.0 / 179.1 KB.
- **manual-chromium** runs the whole id-photo suite against dist-noauto on port 4181. It appears only when dist-noauto exists (see the note below).
- **Keyboard test (Home instead of ArrowUp in manual mode): a test fix, not a regression.** I checked this on the shipping build.
  - The manual start frame is the largest centred crop, so there is no margin. ArrowUp moves the frame 1 output px past the photo edge.
  - The outside block is therefore correct ("never pad"). Save is disabled with the reason "확인 목록에 저장을 막는 항목이 있습니다…".
  - The checklist and the live region both read "저장할 수 없습니다. 사진 바깥 부분이 들어갑니다. 빈 곳을 채우지 않으니 확대하거나 위치를 옮기고…". That message tells the user exactly what to do.
  - After 5× "+" then ArrowUp, save is enabled again.

## Should Fix (informational, does not block)
- src/tools/id-photo/controller.ts, manual readout (confidence: 5/10). At the manual start, the first natural move (drag the head up to the crown line) blocks at once, and the 1-px hatched sliver is hard to see. The message is clear, so this is UX polish only.
  - Consider making the manual readout say "먼저 확대한 뒤 끌어서 정수리와 턱을 안내선에 맞추세요". That would be a copy change for Arch.
- playwright.config.ts (confidence: 6/10). `manual-chromium` exists only when `dist-noauto/` is present, and the folder is git-ignored. A CI run or a fresh clone that builds only `dist/` silently skips the shipping configuration.
  - The deploy gate should build dist-noauto first, as the REVIEW-REQUEST reproduction note says. Better still, fail loudly in CI (`process.env.CI && !MANUAL`) so it is never skipped quietly.

## Still owed (not a code finding)
- Gate 11 (real Chrome/Firefox/Edge plus one phone) and the real-iPhone check stay with the owner or orchestrator.
- The p07 chin miss and the license flag are accepted Known Gaps, and apply only with auto-framing on.

Step 4 is clear.
