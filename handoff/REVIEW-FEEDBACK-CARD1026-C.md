# Review Feedback — CARD1026 Step C (/business-card/)
Date: 2026-10-26
Ready for Builder: NO (1 Must Fix)

## Must Fix
- src/tools/business-card/draw.ts:42 + layout.ts:76 + controller.ts:154-158 (confidence: 8/10) — the card QR can come out too small to scan, with no warning. Quoted: `const px = Math.floor(plan.qr.w / (modules.length + QUIET * 2));` with `qr: { x: 310, y: 800, w: 460, h: 460 }` (세로).
  Measured with the real vcard() + encodeQr() (vite-node, scratch script): all-max = 2,304 B → version 40 (177 modules) → 세로 **2 px**, 가로 **3 px** modules. All-max without NOTE: v38, 2 px. Without NOTE and ADR: v35, still 2 px. Dropping NOTE/ADR from the card QR does not fix it (the Hangul URL percent-encodes to 9 B per character), so that option is out. A heavy real card (회사, 부서, 3 phone numbers, email, URL, 40-character 주소, a 1-line 메모) = 492 B → v17 → 세로 4 px / 가로 6 px, which is fine.
  Why it matters: the card is a 1080 px picture shown about full-width on a phone. A 2 px module there is about 0.13 mm on the screen. Messengers (KakaoTalk 일반 화질) resample and JPEG-compress the image by a non-integer factor, which smears 2–3 px modules. The e2e decodes the pristine PNG, so it says nothing about a camera reading a re-sent picture. The brief's acceptance asks for "card PNG in 2 layouts with a **scannable** QR". The tool note also recommends 세로 for phone viewing, which is the worst case.
  Fix (keep payload identical; do not change ECC or the 연락처 QR):
  1. Export one function, e.g. `cardModulePx(layout, size)` (layout.ts or draw.ts), and use it in draw.ts:42 so the two cannot drift. Add `CARD_MIN_MODULE_PX = 4` (internal engineering floor, never stated in page copy).
  2. When the current layout gives < 4 px, show a plain, polite hint under the card preview (its own `<p class="hint" aria-live="polite">`, not role=alert, not an error, outputs and downloads stay). Suggested wording, glyph-checked by you: 「글자가 많아 명함 그림 속 QR이 작아요. 메모나 주소를 줄이면 더 잘 찍혀요. 연락처 파일을 같이 보내도 돼요.」. Re-evaluate on every redraw and on a layout change. Clear it in clear().
  3. Tests: a unit test of cardModulePx at the boundary (세로: 105 modules → 4, 109 → 3 = hint; 가로: 141 → 4, 145 → 3); an e2e where the all-max card shows the hint in both layouts and an ordinary contact shows none in 세로.
  Optional, your call (log it): enlarge the 세로 QR square (e.g. 560 at y 740) so 세로 matches 가로's 3 px at v40 and 4 px up to ~v27. Only if layout unit tests still fit the all-max text.

## Should Fix
- handoff/BUILD-LOG.md (Budgets, Step C) (confidence: 8/10) — production-flag precache is 447.9 / 450 KB, which leaves 2.1 KB. Step D adds a guide plus guide-hub/home links whose HTML is precached. Recommendation: Arch decides the D10 move of /photo-compress/ to runtime caching before Step D is built, not after a CI failure. Log it as a Step D precondition.

## Escalate to Architect
- Precache headroom (above): D10 move now or at Step D? This is a planning call, not a code defect in Step C.

## Verified (no finding)
- navigator.share stays inside the press. controller.ts:215-219 calls `navigator.share` synchronously in the click handler. The file is either the toBlob result from the last redraw (`file.gen === gen`) or `fileNow(canvas)` (toDataURL → atob → File, synchronous, :61-65). The async `canvas.toBlob` (:129-134) only prepares the file and sets `shareBtn.hidden`; it is never awaited in the press. A press after new typing runs ready() → update(true) → redrawCard (gen++) → stale file → synchronous fallback, so the old card is never sent. A layout/colour change does the same. AbortError is silent. Other errors (incl. WebKit NotAllowedError) show the plain message, and 명함 그림 받기 stays.
- 보내기 is never replayed: entry.ts:20 selector excludes #bc-share. The button ships `hidden` (index.astro:75) and is shown only at controller.ts:133 after canShare({files}) on the real file. clear() hides it again.
- .vcf: `vcard(current.f, { fold: true })` as a string Blob = UTF-8 without BOM, CRLF from vcard.ts, type text/vcard, fixed name 연락처.vcf. The QR/card use the unfolded text. e2e covers CRLF, ≤ 75 octets, fold/unfold, URL %2C, ADR \, and NOTE \n.
- Privacy: no storage/URL/form/names on fields. The SVG preview is made from modules only (innerHTML safe). Usage events carry no values.
- Copy: brand 문서딱. Plain language. 메신저 in visible copy, 카톡 only in keywords (톡 glyph). 0 new glyphs logged. The privacy line matches /qr-code/. The note quotes (Apple vCard 3.0, qrcode.com 명함 sentence, E3 trademark line) are verbatim, and no page copy states a fold length (E2).
- Registration and reverse links (english-name, english-address, stamp-maker), the RelatedTools list, page-only inlined CSS, and the 360 px grid (minmax(0,1fr), tall box min(100%,360px)) all checked. Budgets are measured + 20 %.

## Cleared
Everything above except the card-QR module floor. Once that hint (with its tests) lands, Step C is clear from my side.
