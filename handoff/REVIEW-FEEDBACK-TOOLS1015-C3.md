# Review Feedback — TOOLS1015 C3 (/pdf-edit/ E0 + E1 + E2)
Date: 2026-10-15
Ready for Builder: NO (round 1; see Round 2 below)

## Must Fix

1. src/lib/pdf/edit.ts:150-155 (flattenPdf) (confidence: 10/10) — E2 「그림으로 바꿔 저장」 does NOT remove the covered text from the file.
   `doc.insertPage(...)` + `doc.removePage(p.index + 1)` deletes only the page dictionary (pdf-lib removePage:
   `this.context.delete(page.ref)`); the old page's /Contents stream(s), its /Resources and /Annots stay in the context, and
   PDFWriter saves every object from `context.enumerateIndirectObjects()`. Verified with a scratch script on the repo's
   @cantoo/pdf-lib: a page with "SECRET", run through insertPage+removePage+save → the saved file still holds stream
   `6 0 R` with `<534543524554> Tj`. So the checkbox label 「(가린 글자가 남지 않게)」, the FAQ 「그 쪽은 그림이 되어 원래 글자가
   남지 않습니다」 and the flatten.ts header are untrue; anyone with a PDF tool can recover the text. The unit and e2e tests
   only check `getTextContent()` of the new page, which cannot see orphans.
   Fix: after the replacements, drop every object not reachable from the trailer (/Root, /Info; walk refs) before save —
   or at least context.delete the old page's /Contents refs and the annotations/XObjects/fonts only it used. Also remove from
   /AcroForm /Fields the fields whose widgets were on a replaced page (their /V keeps the typed value). Add a unit test that
   inflates every stream (and scans every string) of the flattenPdf output and finds no trace of the covered text, and the
   same check on the E2 e2e bytes.

2. White box and inserted text vs. annotations / form fields (confidence: 8/10) — preview and output disagree.
   The preview draws the page with annotations into the canvas (src/lib/pdf/page-stage.ts:141
   `await page.render({ canvas, viewport }).promise;`, default annotation mode) and the HTML box sits on top, so a white box
   over a filled form field or a stamp/comment annotation looks covered. The writer puts the rectangle into the page content
   (edit.ts `page.drawRectangle(...)`), and viewers paint annotations after the content, so in the saved file the field value
   / annotation shows through the box; inserted text under an opaque widget is hidden. E2 renderFlat (flatten.ts
   `page.render({ canvas, canvasContext: ctx, viewport ... })`) also paints the annotation over the box into the JPEG.
   정부24-style fillable forms are the tool's target documents.
   Minimum fix (code level): read the page's /Annots rects (pdf.js getAnnotations is already loaded) and, when a white box
   or text item overlaps one, say so plainly on the item / before saving (e.g. 「이 자리에는 입력 칸이 있어 흰 상자가 그 위를
   가리지 못합니다」) and in the result notes. Add one fixture with an AcroForm text field + e2e. How far to go beyond that
   (drop overlapped annotations in E2, flatten fields) → see Escalate.

## Should Fix
- scripts/check-dist.mjs:288 — pdf-sign lazy closure 16.3 → 17.6 KB (+8 %) under the unchanged 18.4 KB line. Accepted:
  the line was not raised, the growth is the shared page-stage chunk, and E0 alone was 16.8. Log in BUILD-LOG that headroom
  is now 0.8 KB so the next pdf-sign change knows.
- scripts/check-dist.mjs:310 — edit.worker 360 KB with 335.3 KB measured (7 %): accepted, it is the brief's ceiling and a
  new tool's line. No change.
- src/content/guides/yearend-tax-pdf.md:8 — `updated` kept at 2026-10-14 while a link bullet was added (line 92). Accepted:
  a one-line cross-link is not a content revision and the date is pinned for the GSC set; note it in BUILD-LOG.
- src/tools/pdf-edit/items.ts:28,95 — box height is 1.3 em per line but the first baseline is at 1.03 em, so Noto Sans KR
  descenders (~0.29 em) end about 0.02 em below the box. Harmless for placement; mention only if the e2e ±3 pt band ever
  flakes on g/y/p at 48 pt.

## Escalate to Architect
- Annotations under a white box (Must Fix 2): beyond the honest note, should E2 also remove overlapped annotations/fields
  on replaced pages (they would otherwise survive as orphans or reappear in the picture)? Product choice: losing a form
  field vs. keeping it visible.

## Cleared
Reviewed E0 page-stage extraction (pdf-sign hooks, resizeFree, 24 px target pad with box-sizing keeping the picture on its
box), textOrigin/baseline maths (canvas preview and PDF share baselineOf/ASCENT, rotate = /Rotate counter-clockwise is
correct for 0/90/180/270, CropBox via convertToPdfPoint), run-per-face embedding, missing-glyph blocking and the font-fetch
failure path (face list fail → `font`; slice fail + unresolved char → `font`, not a false 「넣을 수 없는 글자」), copy word
swaps (원래 있는, 가린 글자가) and the gov24 sentence: all pass. Unit suites pdf-edit + pdf-sign: 53/53 green.

---

# Review Feedback — TOOLS1015 C3 round 2 (commit 0242667)
Date: 2026-10-15
Ready for Builder: NO

I tried to break it with a scratch harness that runs the real `flattenPdf` and `pdfTraces`. The fixture has a page with
"SECRETWORD" content and a pdf-lib text field whose value is "FIELDSECRET". Page 0 is flattened.
- plain fixture: content gone, field value gone, KEEPME kept — pass.
- the same plus `/AcroForm /CO [field]`: `hasSecret` says FIELDSECRET is gone, but the UTF-16BE /V
  (`FEFF0046 0049 …`) is still in the file.
- the same plus `/StructTreeRoot` → StructElem → `OBJR /Obj <widget>` (normal in tagged PDFs, which accessible
  government forms are): `hasSecret(t,'FIELDSECRET') === true`. The widget and its appearance stream survive.

## Must Fix

1. src/lib/pdf/edit.ts flattenPdf / dropFields / dropUnreachable (confidence: 9/10, reproduced) — sweeping only what is
   unreachable is not enough. Anything else in the catalog that still points at a replaced page's annotations or fields
   keeps them alive, together with their /V and /AP (the typed value): /StructTreeRoot OBJR and /ParentTree, /AcroForm /CO,
   another page's /Popup or /IRT. Fix: before the sweep, explicitly `context.delete` every ref in the replaced pages'
   /Annots, every field ref that dropFields pruned (and its now-empty parents), and the old page's /Contents refs. Drop
   those refs from /AcroForm /CO as well. Then run the sweep for the rest. A reference to a missing object reads as null
   (PDF 32000 7.3.10), so the struct tree, outlines and /Dests stay valid. Add unit cases for /CO and for a StructTreeRoot
   OBJR to the widget.

2. tests/helpers/pdf-traces.ts `hasSecret` (confidence: 9/10, reproduced) — it checks the literal text and the hex of its
   latin1 bytes only. Field values are written as UTF-16BE strings (pdf-lib `setText`, Acrobat, and every Korean value), so
   the helper reports "gone" while `<FEFF0046…>` is still in the file. That makes the round-2 FIELDSECRET assertions weaker
   than they look: the unit test passes only because the plain fixture has no other reference. Also match the UTF-16BE
   hex and the UTF-16BE raw bytes, and use a Korean secret in one case so the check covers what users type.
   Object streams are fine: the parsed objects inside them are walked via `enumerateIndirectObjects`, and a retained
   container is decoded with Flate.

## Should Fix
- controller.ts loadAnnots filter — pdf.js marks hidden or NoView widgets with `hidden: true` (pdf.worker
  `data.hidden = … HIDDEN || … NOVIEW`). They paint nothing, but they still trigger the 입력 칸 warning. Add
  `&& !a.hidden` (and skip zero-area rects).
- controller.ts run → drawFlat/paintOver and finish → onAnnot — the annotation list loads in the background when a page
  is shown. On a fast save, a page's list may not have arrived yet. paintOver would then not repaint a text item that lies
  over a field (the field hides it in the picture), and the result note would be missing. Before planning, await the load
  for every page that has an item.
- Warning wording: I accept warning for every annotation that draws except Link and Popup. Stamps, notes and highlights
  are also painted over the content in viewers. 「입력 칸」 is not exact for a stamp or a note, but the message is hedged
  (「…수 있어요」) and plain. 「입력 칸이나 메모」 would be more exact if the glyph budget allows; this is optional.
- pdf-edit controller is at 17.8 / 18.5 KB (0.7 KB headroom), and Must Fix 1 lives in the worker, not the controller.
  If the Should Fix items push the controller over, raising this new tool's line with a BUILD-LOG justification is
  acceptable. Do not raise the pdf-sign line.

## Round 2 — Cleared
/pdf-sign/: round 2 does not touch page-stage.ts, src/tools/pdf-sign or merge.worker (empty diff), so the round-1
clearance stands. The E2 paint order is correct: white boxes are painted over pdf.js's annotation layer, and text that
overlaps them is painted again on top. The overlap test converts the annotation rects through the page viewport, so
rotation and CropBox are handled. A normal save deletes nothing and says so honestly. Unit tests: pdf-edit and pdf-sign,
54/54 passed.

---

# Review Feedback — TOOLS1015 C3 round 3 (commit db870c9)
Date: 2026-10-15
Ready for Builder: NO

I ran my scratch harness again against the real `flattenPdf` and `pdfTraces`. Page 0 has "SECRETWORD" in its content and
a field "FIELDSECRET"; page 1 has "KEEPME". Page 0 is flattened.
- plain, /CO and tagged OBJR (round-2 breakers): content, value and /AP are all gone, and KEEPME stays — fixed.
- hasSecret: now matches UTF-16BE with and without FEFF, as hex and as raw bytes, plus UTF-8 — fixed.
- **shared /Contents** (page 1 uses page 0's content stream): page 1's text went from "SECRETWORD" to "" — a page that
  was not converted lost its content.
- **pdf-lib shares the q / Q wrapper streams across every page it draws on.** On a 2-page file with drawText on both
  pages, the saved /Contents were `[12 0 R 6 0 R 13 0 R 14 0 R]` and `[12 0 R 8 0 R 13 0 R 15 0 R]`. 12 and 13 are
  shared by both pages.
- a Form XObject of the old page that a StructTree MCR `/Stm` points at: its text is still in the file
  (XOBJSECRET present).

## Must Fix

1. src/lib/pdf/edit.ts flattenPdf → `doomed.push(...contentRefs(doc, node.get(PDFName.of('Contents'))))` then
   `for (const r of doomed) doc.context.delete(r)` (confidence: 9/10, reproduced) — the stream refs are deleted even when a
   page that stays also uses them.
   - Every E1 output where white boxes are on one page and text items on another (the E2 e2e scenario: page 1 white box,
     page 2 「둘째 쪽」) shares pdf-lib's q/Q streams. Flattening page 1 deletes them, so page 2's /Contents keeps dangling
     refs. The original content of page 2 is no longer wrapped in q…Q. If the source content leaves a transform, clip or
     colour open (common: e.g. a `1 0 0 -1 0 h cm` flip without Q), it now applies to the inserted text, and that text is
     drawn misplaced or clipped. The e2e test only checks getTextContent, so it cannot see this.
   - A source PDF that shares a content stream between pages loses the other page's content outright (reproduced).
   - Fix: before deleting, collect every ref that a kept page uses (its /Contents stream or array items, and,
     recommended, its /Resources /XObject entries). Delete outright only refs not in that set; leave the others to the
     sweep.
   - Tests: (a) editPdf with text on pages 1 and 2, then flatten page 1 → every ref in page 2's /Contents resolves, and
     page 2 renders its ink at the same place as before flattening; (b) a fixture where two pages share one content
     stream → flatten one page, and the other keeps its text.

## Should Fix
- The open Form XObject gap (round-3 BUILD-LOG). Reproduced: an XObject used only by the replaced page survives when the
  struct tree reaches it through MCR `/Stm`. In practice this is rare; tagged generators mark content in the page stream.
  Not blocking on its own. But the "used by a kept page" set from Must Fix 1 makes it nearly free: also delete outright
  the replaced page's /Resources /XObject refs that no kept page uses (one level deep is enough). If you skip it, keep
  it as a Known Gap in BUILD-LOG with this exact case.

## Round 3 — Cleared
- /CO pruning, the pruned fields with their emptied parents and /AP, the annotation /AP deletes and the unreachable sweep
  are correct for the round-2 breakers.
- hasSecret is now strong enough to trust.
- Nits all done:
  - hidden/NoView and zero-area annotations are filtered;
  - the save awaits the annotation list of every page with an item, before the plan;
  - 「입력 칸이나 메모」 is accurate, hedged and plain.
- Passport sources: menuPos=11 returns HTTP 200 today, the title is 「외교부 여권안내 홈페이지」, and both quoted sentences
  are on the page (curl, 2026-10-15). Only the URL and the retrieved date changed, `updated` was kept, and the builder's
  check:quotes --exact ran clean. Accepted.
- /pdf-sign/: round 3 changes nothing in page-stage or pdf-sign. No regression.

---

# Review Feedback — TOOLS1015 C3 round 4 (commit 8f1e0fa)
Date: 2026-10-15
Ready for Builder: YES — CLEAR

I reran every breaker against the real `flattenPdf` and `pdfTraces`. Page 0 is flattened; page 1 stays.

| case | covered text gone | kept page intact |
|---|---|---|
| plain | SECRETWORD, FIELDSECRET gone | KEEPME kept, 0 dangling /Contents refs |
| /AcroForm /CO | gone | yes |
| tagged OBJR to the widget | gone | yes |
| MCR /Stm Form XObject (old page only) | XOBJSECRET gone | yes |
| pdf-lib shared q/Q (drawText on both pages after load, open flip cm on page 2) | gone | page 2 /Contents all resolve, 0 dangling |
| two pages share one source content stream | (that text is on page 2 too, so it stays, correctly) | page 2 content kept |
| Form XObject used by both pages (page resources) | — | X1 survives and resolves on page 2 |
| /Resources inherited from the /Pages node, X1 there, both pages `Do` it | SECRETWORD gone | X1 survives and resolves on page 2 (`Resources()` inherits) |

Unit tests: pdf-edit and pdf-sign, 62/62 passed. Round 4 touches only edit.ts and its tests. /pdf-sign/ is not changed.

## Must Fix
None.

## Should Fix (does not block; log if not done)
- src/lib/pdf/edit.ts kept set — a kept page's annotation /AP stream is protected, but not the Form XObjects in that
  stream's own /Resources. Nor are XObjects reached only through a kept page's Pattern resources. If a replaced page uses
  the same XObject directly, it is deleted outright, and the kept annotation or pattern loses it. This is very rare
  (shared XObjects between an annotation appearance and another page's content). Add the /AP streams' and patterns'
  /Resources to `xobjectRefs` for kept pages, or log it as a Known Gap.

## Escalate to Architect
None.

## Cleared
The E0/E1/E2 /pdf-edit/ work passes after four rounds:
- **E2 「그림으로 바꿔 저장」** now removes the covered page's text, field values and appearances from the file. It no
  longer touches anything a kept page uses.
- **The overlap warnings** are accurate and honest.
- **/pdf-sign/** shows no regression.
