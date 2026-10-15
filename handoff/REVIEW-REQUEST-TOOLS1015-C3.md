# Review Request — TOOLS1015 tool 3: /pdf-edit/ PDF 글자 넣기·편집 (E0 + E1 + E2)
Date: 2026-10-15
Ready for Review: YES
Branch: tools-1015. Commits: d10488c (E0 refactor only), 75f9bcf (E1 tool), 644ff5a (E2 option, default off). Not pushed.
Status: DONE (BUILD-LOG "TOOLS1015 E0", "E1", "E2" have gates, probes and decisions).

## Round 2 (after REVIEW-FEEDBACK-TOOLS1015-C3.md) — one commit on top of 259202c; BUILD-LOG "TOOLS1015 C3 round 2"
- src/lib/pdf/edit.ts flattenPdf + dropFields + dropUnreachable — Must Fix 1: the replaced pages' widgets leave /AcroForm /Fields (fields left without widgets go, /V with them), then every object unreachable from trailer /Root and /Info is deleted before save.
- tests/helpers/pdf-traces.ts — raw bytes + every object + every decoded stream; hasSecret checks literal and hex.
- tests/unit/pdf-edit.test.ts — 「flattenPdf (round 2)」: SECRETWORD (content) and FIELDSECRET (field) gone, KEEPME and FIELDKEEP kept, only the kept field left; fails on 644ff5a, passes now.
- src/tools/pdf-edit/flatten.ts renderFlat(…, paint) + controller paintOver — Must Fix 2a (Arch): white boxes painted after pdf.js drew the annotations, overlapping text items painted again on top.
- src/tools/pdf-edit/controller.ts loadAnnots / onAnnot / FIELD_NOTE / FIELD_RESULT_NOTE, src/pages/pdf-edit/index.astro #ed-item-note (empty) — Must Fix 2b: the note on the selected item and in the result; nothing deleted on a normal save. Late face only, 0 new core glyphs.
- tests/e2e/pdf-edit.spec.ts — Must Fix 2c: field-form.pdf fixture; the warning test (value still in the file) and the E2 test (FIELDSECRET and COVERTEXT gone from the whole file, FIELDKEEP stays); the old E2 test also checks OLDTEXT is gone from the file.
- Questions for round 2: the item note shows for any annotation that draws (not Link/Popup), not only form widgets — stamps and comments behave the same in viewers, so the same words fit; OK? pdf-edit controller is 17.8 / 18.5 KB (0.7 KB headroom).

## Files Changed
E0 (no visible change on /pdf-sign/)
- src/lib/pdf/page-stage.ts:1-318 — createPageStage: page geometry, page drawing, overlay boxes (drag, corner resize aspect/free, arrows 1/10 pt, Delete), selection, focus kept; E1 added render(el, scale, shown) and the 24 px minimum target (boxStyle 159-174, targetPad).
- src/tools/pdf-sign/controller.ts:220-270 (hooks object at 227-268) — the stage hooks replace the old preview/drag code (items, boxOf, store, editable, selected, moved, remove, changed); `cur` → pageStage.page.
- src/tools/pdf-sign/place.ts:100-110 — pure resizeFree (MIN_EDGE each side, at most the page, top-left fixed).
- tests/unit/pdf-sign.test.ts — resizeFree test.

E1
- src/tools/pdf-edit/items.ts:1-118 — item types, date forms, sizes, cleanText/linesOf, textBox/fitSize, baselineOf (0.15 + 0.88 em, 1.3 em lines), uncovered, itemsValue, editName.
- src/tools/pdf-edit/text-place.ts:1-28 — textOrigin (baseline start through convertToPdfPoint, rotate = /Rotate), whiteRect = toPdfRect.
- src/tools/pdf-edit/coverage.ts:1-27 — face-list coverage for the item check (one same-origin GET; network-guard allowlisted + its own test).
- src/tools/pdf-edit/controller.ts:224-265 (measure + canvas preview at 100 px scaled), 269-320 (stage hooks; corner drag scales size), 355-405 (blocker / updateUi / updateControls), 407-462 (add / remove / changeText), 633-650 (plan → EditDraw), 651-685 (inWorker), 687-750 (run, error mapping: missing / font / canvas / engine), 755-790 (finish, notes).
- src/tools/pdf-edit/entry.ts, limits.ts, edit.css; src/pages/pdf-edit/index.astro.
- src/lib/pdf/edit.ts:59-135 — runsOf (runs per face), editPdf (resolve all first → MissingGlyphError; white boxes then text; each face embedded once; signPdf load/save rules).
- src/lib/pdf/edit.worker.ts:1-70 — edit / flatten messages; `font` when the face list or a slice did not arrive.
- src/lib/hwp/pdf/font-source.ts:31-51 — additive optional onLoadError (HWP→PDF unchanged).
- Registration: src/data/{tools,og.json,site,tool-facts,guides}.ts, src/lib/ui/{next-steps,usage}.ts, src/i18n/en/shared.ts, src/sw/sw.ts, scripts/{check-dist,gen-sw}.mjs (check-dist block at 291-312), scripts/lib/{usage,bgcloud}.mjs, scripts/qa/visual.mjs, lighthouserc.json, CLAUDE.md, docs/COPY.md; guides pdf-sign, gov24-pdf-save, yearend-tax-pdf (one body sentence each).
- Tests: tests/unit/pdf-edit.test.ts (new), tests/e2e/pdf-edit.spec.ts (new), usage/next-steps/polish/postbuild/bgcloud/network-guard unit and site/polish/chain/usage e2e lists.

E2
- src/tools/pdf-edit/flatten.ts:1-59 — pagesToFlatten, renderFlat (200 ppi within PDF JPG 변환 caps, JPEG 0.9).
- src/lib/pdf/edit.ts:136-169 — flattenPdf (insert same-size picture page, remove the old one).
- src/tools/pdf-edit/controller.ts:673-686 (drawFlat), 700-712 (run: flatten after the E1 save), finish note; page checkbox + copy in index.astro and tools.ts FAQ.

## Open Questions
- Budget reading of E0 "within 1 %": the pdf-sign lazy budget line stays 18.4 KB; the measured closure went 16.3 → 16.8 (E0, new module + hooks) → 17.6 KB (E1: page-stage and shared UI modules now in a chunk both controllers import). Still under 18.4. Is that the intended reading, or should the line be held to 16.3 ± 1 %?
- edit.worker budget: 335.3 KB measured; + 20 % would pass the HWP export chunk's 360 KB, so the line is 360 KB (brief: "never above"). Headroom is 7 %.
- Preview vs output text: the canvas preview draws at 100 px and scales down; the e2e checks ink inside the box ± 3 pt and none in 12 pt bands around it on 5 projects. Please look at items.ts ASCENT/HALF_LEADING and text-place.ts for the baseline maths.
- yearend-tax-pdf got the body link but keeps `updated: 2026-10-14` (guides-schema pins it for the GSC set). OK?
- gov24-pdf-save sentence limits the tool to 신청서 빈칸 and says 「발급받은 증명서는 원본 그대로 내세요」 — please check the tone against COPY.md.
- page-stage now pads boxes under 24 CSS px (axe target-size on a 17 px 흰 상자). This also applies to a tiny /pdf-sign/ picture (MIN_EDGE 12 pt at a small scale): the dashed border then frames the padded button, the picture stays on its box.

## Out of Scope (logged in BUILD-LOG)
- Brief Known Gaps for E: editing existing text, AcroForm filling, check marks, drawing pad, bold/other fonts, text on all pages, page numbers, watermark, whole-document rasterizing.
- E2: a replaced page loses its links, form fields and annotations; outline entries to it may stop jumping there.
- Owner-side live smoke: Chrome/Edge viewer + one desktop reader (Adobe or 한컴 PDF) open of an edited 정부24 form (probe c, desktop part).
- vitest full-suite timing flake seen once in E1 (char-count 100k perf 123 ms under load; passes alone; green in the E2 full run).
