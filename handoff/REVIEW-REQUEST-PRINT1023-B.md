# Review Request — PRINT1023 Step B (인화용 모아찍기)
Date: 2026-10-24
Branch: print1023-b (on print1023-a)
Status: DONE
Ready for Review: YES

## Files Changed
- handoff/sources/print1023/print-size-2026-10-23.txt:10-22 — B0 raw dump: 찍스 line verbatim + sha256; 3 other services not found / not citable.
- src/lib/idphoto/sheet.ts (new, 1-80) — pure layout: tileSize, sheetPlan (both orientations, tie portrait, centred grid, outline rings), sheetUpscales.
- src/lib/idphoto/render.ts:46-80 — renderOutput gains `scale = 1` (prescale on st.s·scale; white pre-fill only when scaled).
- src/tools/id-photo/sheet-build.ts (new, 1-109) — lazy builder: composeSheet (white, #999 rings, putImageData tiles), buildSheet (never throws; JFIF always 300), pageDeps (worker per sheet, AbortSignal).
- src/tools/id-photo/controller.ts:5,16,151-164,186-190,202,458,659,684,726,736-818,842 — sheet elements (null in embed), snapshot in showDone, hide on non-done/again/new, revoke on pagehide, make handler with run token + abort, sheet download beacon.
- src/data/print-sheet.ts (new) — SHEET_COPY (no closing brace in any value).
- scripts/lib/ui-font-chars.mjs:28-29 — SHEET_COPY added to the stripComments regex.
- src/components/IdPhotoTool.astro:4,12,178-194 — #idp-sheet block (!embed), after #idp-english, before #idp-print-links.
- src/styles/app.css:412-416 — result grid, preview ≤ 320 px, .btn box kept inside .out-links.
- src/data/tools.ts:725-729,740 — FAQ 「증명사진을 여러 장 인화하려면 어떻게 하나요?」 (core glyphs only); keywords += 증명사진 출력, 증명사진 인쇄.
- src/content/tool-notes/id-photo.md:22 — one bullet under 주의할 점 (no unit numbers).
- scripts/lib/usage.mjs:18,89-94,497 — SHEET_PRESETS, DOWNLOAD_SETTING['id-photo']='sheet', SETTINGS.sheet, SETTING_LABELS.sheet=모아찍기.
- src/lib/ui/usage.ts:7,57-58,125-127 — UsageEvent variant + buildPayload branch (o/v only for a SHEET_PRESETS id).
- scripts/check-dist.mjs:680-682 — /id-photo/ must have #idp-sheet; no embed page may.
- tests/unit/print-sheet.test.ts (new, 32 tests) — layout table, margins/gaps/centring/outline rings, tie rule, upscale rule, render scale (identical pixels at 1, opaque at k), compose + failing surfaces, real MozJPEG 1800×1200 verifyOutput, SHEET_COPY rules, usage whitelist + client payload.
- tests/unit/usage.test.ts:977 — DOWNLOAD_SETTING equality now includes id-photo: sheet.
- tests/e2e/id-photo.spec.ts:9-12,113-136,402-406,717-789,821 — sheet e2e (passport 8 + pixels + axe + saramin none + again hides; police 9 portrait), lowres gosi note, FAQ count 7, expectSpec headerOnly for sheets.
- tests/e2e/remove-background.spec.ts:343-344 — D8c: #idp-sheet hidden.

## Open Questions
- FAQ question reworded from the brief (뽑 not in the core font). OK, or would Arch rather spend the glyph?
- expectSpec headerOnly for the sheet files: please confirm this is a fix of a false positive, not a weaker check (APP1 marker and sniff hasExif/hasGps still apply to the whole file).
- Production precache now 444.8 / 450 KB (5.2 KB headroom). Within budget, but the next tool will be tight.

## Out of Scope (logged in BUILD-LOG)
- Other sheet sizes, mixed presets, copy-count picker, sheet in /embed/ and /en/, PDF sheet; e2e for the sheet beacon; check:licenses run in a non-junction checkout; LHCI (CI).
