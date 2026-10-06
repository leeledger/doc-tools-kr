# Review Request — Step TOOLS4 T0 + T1 (리팩터 + 증명사진 프리셋)
Date: 2026-10-06
Ready for Review: YES. Status **DONE** (T0 and T1). Not committed; T0 is meant as its own commit (file split below). Build notes, Step 0 table, decisions, gates: BUILD-LOG "TOOLS4 T0 build notes", "TOOLS4 Step 0", "TOOLS4 T1 build notes".

## Files Changed — T0 (refactor, no visible change; every `_astro` chunk byte-identical)
- src/lib/ui/reorder.ts:1-8 — moved from src/tools/pdf-merge/drag.ts (git rename); only the header comment changed.
- src/tools/pdf-merge/controller.ts:17 — import from `../../lib/ui/reorder`.
- src/lib/pdf/qpdf/qpdf-run.ts:2,7-18 — moved from compress/ (git rename); now owns `QpdfResult` and the new `QpdfRun` type.
- src/lib/pdf/qpdf/load.ts:1-45 — new; `QPDF_VENDOR_DIR`, `loadQpdf`, `warmQpdf` moved verbatim from compress/wasm-browser.ts.
- src/lib/pdf/compress/wasm-browser.ts:1-16 — keeps only `loadCodecs`.
- src/lib/pdf/compress/deps.ts:4-6,15-16 — re-exports `QpdfResult`; `qpdf: QpdfRun`.
- src/lib/pdf/compress.worker.ts:12-13 — imports the qpdf loader from `./qpdf/load`.
- src/lib/pdf/page-range.ts:1-48 — new pure `parseRange(text, pageCount)` with typed errors.
- tests/unit/page-range.test.ts:1-68 — new; valid, edge, empty, out-of-range, reversed, junk.
- tests/helpers/compress-deps.ts:9, tests/unit/compress-helpers.test.ts:8,11, scripts/copy-vendor.mjs:52,56 — new paths.
- handoff/BUILD-LOG.md — "TOOLS4 — brief" log notes copied from the brief (+ owner E1/E2 = default).

## Files Changed — T1
- src/data/id-photo-presets.ts:5-8,11-28,54-76,101-110,120-156,348-395 — `print` status, `PRESET_GROUPS`/`group`, `HeadBand.measure`/`bandQuote`, `printPx`/`cmLabel`/`isSourced`; presets `id_card` and `driver_license`; passport `bandQuote`; new `validatePreset` rules (print, official band needs bandQuote inside quote, 35:45 rule for reference bands with the six-id exemption).
- src/data/preset-ids.ts:4, scripts/lib/usage.mjs:44,242-243 — the two ids added (lists stay equal); admin value labels.
- scripts/ops/lib/guides.mjs:87,97-98 — check:quotes reads `print` presets too.
- scripts/gen-ui-font.mjs:37-38 — strips `bandQuote` like `quote` (never rendered).
- src/data/guide-schema.ts:4,142 — a print preset counts as an official source.
- src/pages/id-photo/index.astro:12,51-60,173 — optgroups (empty groups skipped; 직접 입력 in 기타) and the `#idp-print` notice.
- src/tools/id-photo/controller.ts:4,44-45,132,652-654 — print note on the result screen.
- src/tools/id-photo/overlay.ts:12-13,136 — top label follows `measure`.
- src/data/tools.ts:224,245 — id-photo `updated`; FAQ 4 sentence replaced (FAQ 3 untouched).
- src/content/guides/id-card-photo.md:8,12,72-74, src/content/guides/driver-license-photo.md:8,12,66, src/content/hubs/photo-sizes.md:7,30 — deep-link CTAs to the new presets and the print wording.
- tests/unit/idphoto-core.test.ts:77-130,163-200, tests/unit/guides-schema.test.ts:52-58,178-179, tests/unit/ops.test.ts:231-243, tests/e2e/id-photo.spec.ts:201,243-260,595,614-615 — see BUILD-LOG.

## Open Questions
- Only 2 presets shipped, both `print` (주민등록증, 운전면허증, 413×531 at 300, no KB limit). Zero visa presets: no visa source is readable by check:quotes from here (BUILD-LOG Step 0 table). Escalation T1-b goes to Arch.
- `REFERENCE_ASPECT_EXEMPT` (history, korcham, teps, saramin, jobkorea, half_card): the decision-6 rule "reference band only within 1.5 % of 35:45" would reject these Step 4 / G2 presets, so I exempted them by id instead of changing shipped behaviour. Is an explicit list the right call?
- Escalation T1-a: 도로교통공단's digital spec is only in an `<img alt>`, which check:quotes does not read; `driver_license` stays `print` with no KB limit.
- `measure: 'hair'` and its overlay label exist per the brief but no shipped preset uses them; the "32–36 mm" copy in readout/warnings is still passport-only (Known Gap).
- Copy check please: FAQ 4 new sentence, the print note "사진관이나 인화 앱에서 3.5×4.5 cm로 인화하세요.", the preset notes "… 그 크기로 인화할 수 있게 맞춥니다.", and the guide paragraphs.

## Out of Scope (logged in BUILD-LOG)
- check:quotes reading `alt` text (T1-a); a browser-read path for preset sources (T1-b).
- Deriving the head-length copy from the band (needed when a non-passport band ships).
- regress:idphoto p07 landmark miss (known since Step 4).

## Round 2 (2026-10-06) — owner decisions T1-a yes / T1-b no visa, Richard Should Fix 1–2
Exactly what changed since round 1 (details and gates: BUILD-LOG "TOOLS4 T1 round 2"):
- scripts/ops/lib/html.mjs:115-150 — new `withAltText` (an `<img>` becomes its alt text between breaks) and `withoutCode`; `pageText` and `pageTextExact` use them, so source-watch and check:quotes read alt text.
- src/data/id-photo-presets.ts:1-7 — header comment fixed (SF1).
- src/data/id-photo-presets.ts:138-164 — `driver_license` is now `official`: 413×531, pxRange 395–431 × 507–550, 500 KB 이하, official crown band 32–36 mm with `bandQuote`, second source = the 도로교통공단 rule popup, quote verbatim from its alt text; label "운전면허증 (적성검사·갱신)".
- src/data/id-photo-presets.ts:395 — an official band requires an official/print preset (SF2).
- scripts/lib/usage.mjs:243 — value label "운전면허증".
- src/content/guides/driver-license-photo.md:39,50,67-69 — preset source added; file spec sentences (500KB, 413×531, 3.2~3.6cm) and FAQ answer; print advice kept.
- src/content/hubs/photo-sizes.md:31 — print bullet names 주민등록증 only.
- tests/unit/ops.test.ts (alt-text case), tests/unit/idphoto-core.test.ts (print = id_card only, driver_license official, SF2 case, official bands list), tests/unit/guides-schema.test.ts:55 (print case uses id_card).
- Not changed: the "32–36 mm" copy (driver_license's band equals the passport's, so no derivation was needed); REFERENCE_ASPECT_EXEMPT (owner: keep); no visa presets (owner).
Open question: alt text now counts as page text for every watched source; any guide quote that only matched visible text still matches (142/142 verbatim), but a source whose images carry long alt text adds noise to the weekly "changed" context only.
