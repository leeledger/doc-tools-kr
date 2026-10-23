# Review Request — IDCAM1022 Step E (guide /guide/self-id-photo/ 「집에서 증명사진 찍는 법」)
Date: 2026-10-23
Ready for Review: YES
Status: DONE_WITH_CONCERNS (PUBLIC_ID_CAMERA=0 build not run locally: memory; CI)
Branch: idcam1022-e (stacked on idcam1022-d / PR #19). Commits: "[IDCAM1022 D fix] …" (2 lines, Step D code) and "[IDCAM1022 E] …".

## Files Changed
- src/content/guides/self-id-photo.md (new) — query 「집에서 증명사진 찍기」; `requires: id-camera`; 15 verbatim URL quotes
  (외교부 menuPos=32 ×9, menuPos=12 ×3, 도로교통공단 popup ×2, 정부24 ×1) + preset passport_online; body 2,716 rendered chars;
  sections: 제출처 규칙 table, 자리 잡기 (흰 벽/앞쪽 빛/눈높이/도와줄 사람, no distance number), 셀카 vs 타이머, 안내선,
  문서딱 촬영 → 규격 맞추기 flow, 배경을 흰색으로 바꿔도 되는 사진 (이력서/반명함 only; 여권/운전면허 quotes), 사진관이 나은 경우, 안 될 때.
- src/assets/flagged/img/guide/self-id-photo/1-phone-setup.svg, 2-framing.svg (new) — own figures, no numbers; copied to
  public/ by gen-brand only with the flag on (.gitignore:18).
- src/content/guides/passport-photo.md:201-202, driver-license-photo.md:182-183, resume-photo.md:134-135, id-card-photo.md:134-135
  — one-line paragraph + link to the guide (each sentence worded differently); `updated` 2026-10-22.
- src/content/tool-notes/id-photo-camera.md:21-22 — link to the guide.
- src/data/guide-schema.ts:79-92 — `requires` enum adds 'id-camera' (FLAG_TOOLS → id-photo-camera); isVisibleGuide(data, bgOn, idCameraOn = true).
- src/data/guides.ts:13, 84 — passes __ID_CAMERA__; NEXT_GUIDES comment.
- src/data/tool-guide-order.ts:29-30 — pin 'id-photo-camera' → ['self-id-photo'].
- scripts/lib/drop-links.mjs (new) — Sätteri hast plugin: removes each p/li linking a hidden path (once per block).
- scripts/lib/idcamera.mjs:23-29 — ID_CAMERA_GUIDE_PATH, idCameraHiddenPaths(on).
- astro.config.mjs:2, 13, 41-42, 82-84 — `markdown.processor: satteri({ hastPlugins: [dropLinksPlugin] })` only when a path is hidden
  (flag off); flag on = Astro's default processor, untouched.
- scripts/check-dist.mjs:17, 678-682, 880 — flag off: no text file names /guide/self-id-photo/, no file path contains self-id-photo;
  the visible-guide list honours requires: id-camera.
- scripts/gen-brand.mjs:231-234, 287 — FLAGGED_GUIDE_IMAGES self-id-photo: idCamera.
- scripts/lib/guide-titles.mjs:44 (regenerated), lighthouserc.json (+ /guide/self-id-photo/).
- tests/unit/guides-schema.test.ts:418-420, 505-549 — OWN_COUNT/partial + id-photo-camera; new describe (requires, visibility, link
  paragraphs are one line, no always-shown guide links /id-photo-camera/).
- tests/unit/drop-links.test.ts (new) — runs the real Sätteri pass with the flag-off and flag-on path lists.
- src/tools/id-photo-camera/send.ts:36-40 — [IDCAM1022 D fix] sendToBg is a stub without __BG_REMOVE__ (the default build's check-dist
  failed: the camera initial chunk named 'remove-background' with the flag off).

## Gates run
- `npm run check`: 0 errors, 0 warnings (12 hints, unchanged kinds).
- `check:quotes` (--exact): 608 quotes verbatim, exit 0; the guide's 15 alone: 0 changed, 0 unreachable.
- vitest: guides-schema, guide-check, drop-links, visits, id-photo-camera, idphoto-bglink, adsense, en-check, tool-notes, next-steps,
  postbuild + visits on the final default build: 124/124 (an earlier run caught the banned 「처음부터」 in the guide; reworded, rebuilt).
- Default build (PUBLIC_SITE_URL=https://docttak.com) + check-dist OK (guide length/figures/SVG safety/shared-block/Jaccard checks
  included); guide-length self-id-photo 2,716 ok; precache 427.1 / 450 KB. Guide prose is Markdown in the system font (UI font
  preload untouched).

## Open Questions
- Gating choice: the guide is `requires: id-camera` (its CTA and flow are the camera page). To keep the kill switch clean, flag off drops
  the five link paragraphs via the Sätteri plugin rather than leaving 404 links or failing the build. The import is
  `@astrojs/markdown-satteri` (astro 7.3.5 pins 0.4.2 exactly, MIT, already installed) — not added to package.json; say if you want
  it declared.
- `updated` bumped on the four linking guides for a one-sentence addition (LOAN1022 precedent). Fine?

## Out of Scope (logged in BUILD-LOG)
- PUBLIC_ID_CAMERA=0 / BG / cloud builds, Playwright, LHCI, qa:visual not run locally (memory) → CI.
