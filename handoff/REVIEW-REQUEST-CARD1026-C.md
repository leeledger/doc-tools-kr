# Review Request — CARD1026 Step C (/business-card/ 전자명함 만들기)
Date: 2026-10-26
Ready for Review: YES
Status: DONE (branch card1026-c, stacked on card1026-b / PR #26, itself on card1026-a / PR #25)

## Files Changed
- src/pages/business-card/index.astro:1-145 — the page: hero, ContactFields (prefix bc), privacy line, 명함 그림 (모양 가로/세로, 색 남색/초록/검정, canvas preview, 명함 그림 받기, 보내기 shipped `hidden`), 연락처 QR (preview, PNG/SVG), 연락처 파일, how-to, 알아 두면 좋아요, ToolNotes, FAQ, RelatedTools (qr-code, english-name, english-address, stamp-maker).
- src/tools/business-card/entry.ts:1-50 — usage start, lazy controller load (Step B pattern), replay of an early 받기 press only (#bc-card-png, #bc-qr-png, #bc-qr-svg, #bc-vcf); never names #bc-share.
- src/tools/business-card/controller.ts:1-252 — fields → checkContact → vcard (unfolded) → encodeQr → SVG preview + card redraw (debounced 250 ms); card file made after each redraw (toBlob, :121-136) and 보내기 shown only when canShare({files}) (:51-59, :133); 보내기 press (:215-228) uses that file or makes one synchronously (toDataURL, :61-65) after flushing new typing, AbortError silent, other errors → the plain message; downloads 연락처.vcf (text/vcard, folded, :244-250), 연락처-QR.png/.svg, 명함.png; usage start once + download per file (share success counts as download).
- src/tools/business-card/layout.ts:1-156 — pure layoutCard (SPECS for 1800×1000 and 1080×1350; shrink to a floor, 주소 in two lines, then 「…」).
- src/tools/business-card/draw.ts:1-47 — canvas paint (system font stack, accent band, QR from qrRgba at an integer module size with the quiet zone).
- src/tools/business-card/business-card.css:1-17 — page-only styles, inlined.
- src/content/tool-notes/business-card.md:1-51 — tool note (4 CONTENT1021 headings, Apple iCloud vCard 3.0 quote, qrcode.com 명함 trademark FAQ quote, E3 line verbatim; no stated tool limit).
- src/data/tools.ts:910-944 — entry right after qr-code (title 39, description 71, FAQ ×5, keywords incl. 모바일명함 / 디지털명함 / QR명함 / 카톡 명함); src/data/site.ts HOME_DESC_ORDER; src/data/og.json image + page.
- scripts/check-dist.mjs:40-42, 1126-1162 — budgets (initial 12.6 KB, controller 11.1 KB = measured + 20 %) and the /business-card/ block (lazy controller, page script never names bc-share, 보내기 hidden in HTML, fixed file names + text/vcard in the controller, no storage/cookie/history, no form or named text field, layouts/colours, no AdSense, no off-site script).
- src/pages/english-name/index.astro:139, src/tools/english-address/page.astro:91, src/pages/stamp-maker/index.astro:112 — reverse RelatedTools links (C19).
- scripts/gen-sw.mjs, src/sw/sw.ts, scripts/lib/bgcloud.mjs, scripts/lib/usage.mjs, src/lib/ui/usage.ts, lighthouserc.json, scripts/qa/visual.mjs, docs/COPY.md — one-line registrations.
- tests/e2e/business-card.spec.ts:1-275 — .vcf bytes (no BOM, CRLF, ≤ 75 octets per line, a fold, unfold = exact vCard incl. ORG escapes, URL %2C, ADR \,, NOTE \n); QR PNG + both card layouts decode to it (jsQR); all-max card both layouts; 보내기 stubs (ok → shared file decodes; typing then press shares the new card; AbortError; NotAllowedError → message + download; canShare false → hidden; hidden before load); errors + hint + focus; first-press replay; URL/storage/requests clean; axe; 360 px.
- tests/unit/business-card-layout.test.ts:1-111 — layoutCard with a fake measure (order, sizes, company-only, shrink, 2-line 주소, all-max both layouts inside the box and clear of the QR).
- tests/e2e/site.spec.ts, polish.spec.ts, usage.spec.ts (new 전자명함 test), english-address.cloud.spec.ts; tests/unit/{polish,postbuild,bgcloud,tool-notes,usage}.test.ts — list/count updates.

## Gates run (local)
npm run check 0/0; vitest 45 files (business-card-layout, qr-*, registry readers) green; production-flag build + default build, check-dist OK on both; e2e business-card.spec 45/45 on all 5 projects, site + polish chromium 191 passed / 1 skipped, qr-code + english-name + stamp-maker chromium 38/38; the note's 3 quotes verbatim (source-watch --exact on this note). Budgets: initial 8.9 / 10.5 KB, controller 9.2 KB, precache 440.5 / 447.9 of 450 KB (default / production flags), preload 92.1 / 92.2 of 92.66 KB, 0 new glyphs. CI covers the cloud usage spec, the english-address cloud spec and LHCI.

## Open Questions
- 보내기 never replayed (orchestrator decision after review B): please confirm the controller-only show path (:121-136) and the synchronous fallback for a press after new typing (:215-228) keep navigator.share inside the press on WebKit. The toDataURL fallback costs one PNG encode in the gesture (about 1800×1000).
- Production-flag precache is 447.9 / 450 KB (2.1 KB left). The next precached-page growth will need the D10 move of /photo-compress/; nothing moved now since it is under the limit.
- Tall layout: an all-max contact (version 40) gets 2 px modules in the 460 px QR square; the e2e decodes it, but a real phone camera may struggle on such a dense card. Ordinary cards are version ~10–15 (5+ px). Worth a hint, or fine as is?
- Output order 명함 그림 → 연락처 QR → 연락처 파일 (brief lists 1 vcf, 2 QR, 3 card without an order rule).

## Out of Scope (logged in BUILD-LOG)
- Guide pin + NEXT_GUIDES (Step D); CLAUDE.md line 3 tool list (orchestrator); O1 real-phone items (보내기 → KakaoTalk, .vcf open, contact URL with a comma).
