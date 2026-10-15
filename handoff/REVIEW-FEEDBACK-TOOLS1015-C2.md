# Review Feedback — TOOLS1015 C2 (I1 /id-copy/ + I2 guide id-card-copy)
Date: 2026-10-15
Range: bbdf213..7b4418d (I1 9c57b9f, I2 7b4418d)
Ready for Builder: I1 NO (one copy fix) · I2 YES

Verified by me: vitest id-copy / usage / next-steps / guides-schema 251 passed; `npm run check:quotes` 248 verbatim.
e2e not run (as instructed); read the specs.

---

## I1 — /id-copy/ tool: CHANGES REQUIRED

### Must Fix
- src/pages/id-copy/index.astro:26 (confidence: 8/10) — lead says
  「주민번호 뒤 7자리와 주소처럼 **내지 않아도 되는 곳**을 검은 상자로 가리고」. This states as fact that those parts need
  not be submitted. No official source says so, and some receivers (employers, banks) do need them. It contradicts
  the page's own FAQ / 「받는 곳에 먼저 물어보세요」 framing, and it is exactly the brief's "I trust" failure mode
  (masking seen as required or sufficient). Top-of-page copy, so it matters most.
  Fix: describe what the tool does, not what the user need not send, e.g.
  「신분증 사진에서 주민번호 뒤 7자리나 주소처럼 가리고 싶은 곳을 검은 상자로 가리고, 「회사 제출용」 같은 용도 문구를
  넣어 JPG·PDF로 저장합니다.」 (check glyphs; no new core glyphs). Update COPY.md if it records the lead.

### Should Fix
- src/data/tools.ts summary (confidence: 6/10) — 「…사본으로 저장합니다.」 vs brief 「…사본을 만듭니다.」 Harmless drift;
  keep yours or the brief's, but log it as a deviation in BUILD-LOG.
- src/tools/id-copy/mask.ts:140-152 (confidence: 4/10, informational) — photo drawn with `imageSmoothingQuality='high'`
  before the boxes; when k < 1 or crop.x is fractional the filter kernel can blend a 1 px fringe of under-box colour
  into the pixel just outside a box. Not recoverable text; no action needed beyond awareness. If you want it airtight:
  widen `coverPixels` by 1 output pixel on each side when `scale !== 1`.
- controller.ts:111 (confidence: 5/10, verify) — without OffscreenCanvas (old iOS Safari < 16.4) the photo is decoded
  at full size before the page-canvas shrink; a 48 MP photo may hit oom there. Handled (ERRORS.oom), just a note for
  O3's real-phone check.

### Leak path (Bob's open question) — passes
- drawCopy order: white fill → photo → opaque `#000` boxes at globalAlpha 1 → watermark. Boxes are drawn after the
  photo, so covered pixels are overwritten before `toBlob`; JPEG encodes only those pixels.
- coverPixels: floor of the start, ceil of the end → covers every partially covered output pixel. Correct for
  fractional scale.
- Crop clamp (toggleCrop → clampRect into the crop) moves a box inward; I checked it still covers the visible part of
  what it covered before (shift keeps [a,d] ⊆ [d-w,d]; oversize boxes clamp to the whole crop).
- Rotation: turnRect (x' = h − y − h_r, y' = x) matches canvas clockwise rotate; unit-tested four-turn identity.
- PDF: `pdfRequest` hands the worker only the canvas JPEG blob (no name, rotation 0); worker sets producer 문서딱,
  no title from file names. e2e asserts 1 image XObject, 0 fonts, empty getTextContent, black pixels under the box.
- JPG: e2e asserts no EXIF, no GPS, no orientation, upright 900×1200.
- No file bytes leave: only the worker postMessage; beacon fields are t / e / o=mark / v=on|off / fail codes. No text,
  dates, box counts or positions. Whitelist (usage.mjs MARK_STATES, labels) correct.

### Builder deviations — my view
- Empty file → usage code `corrupt`: acceptable. Brief's list has no `empty`, and pdf-sign does the same. (Other image
  tools send `empty`; if Arch wants consistency later, it is a one-word change.)
- Tool order after id-photo, HOME_DESC_ORDER as brief: fine.
- Inbound links skipped for id-card-photo (off-topic) and work24-resume-upload (draft): fine, logged.
- Lazy budget 15.9 KB for 13.2 KB measured (+20 %): in line with house practice.

### A11y — passes
Boxes are real buttons (aria-label 「가릴 곳 N」, aria-pressed, aria-describedby hint); arrows move, Shift+arrows resize,
Delete removes; focus moves to the new box and back to 「가릴 곳 추가」 when the last one goes; status announced.
Touch: boxes `touch-action:none`, stage `pan-y`, 24 px resize handle (meets WCAG 2.5.8 minimum).

---

## I2 — guide id-card-copy: CLEAR

### Must Fix
None.

### Should Fix
- src/content/guides/id-card-copy.md:74 (confidence: 6/10) — 「법령에 근거가 있는 경우 **등을** 빼면」: the quoted text is
  only 「다음 각 호의 어느 하나에 해당하는 경우를 제외하고는」; the "법령에 근거" part paraphrases 제1호, which is not
  quoted. Answer to Bob's question: acceptable in substance, but tighten to what is quoted, e.g.
  「개인정보 보호법은 법에서 정한 경우를 빼면 개인정보처리자가 주민등록번호를 처리할 수 없게 정하고 있어요.」
  (or add the 제1호 text as a second quote). Under 5 minutes; do it inline.

### Checked
- Five sources, each claim traced: 등본/초본 definitions, 신청 장소, 400원 / 500원 / 인터넷 무료, 제24조의2, 금감원
  2025-02-16 보도자료 (wording 「고수익을 내세워」 faithful to 「고수익으로 현혹하며」). All retrieved 2026-10-15,
  check:quotes passes.
- No masking advice attributed to any body; 「가려도 되는지 먼저 물어보세요」 framing used in body and FAQ.
- 「신분증 사본은 따로 발급받는 서류가 아니라」 is a definition, not a rule or number; matches brief's intended framing.
- ≥ 4 distinct internal body links; answer ≤ 120 chars; brand/plain language fine; 뒷면/앞면 in body has precedent
  (jlpt-photo) and does not touch the core UI font.
- Inbound one-sentence links in kosaf-docs / univ-docs-upload are on-topic, `updated` bumped.

## Escalate to Architect
None.

## Cleared
I2 guide is clear and can ship alone; I1 is sound on the leak path, privacy, beacon and a11y, and clears once the
lead sentence at index.astro:26 stops asserting what need not be submitted.
