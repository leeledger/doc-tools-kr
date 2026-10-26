# Review Request — CARD1026 Step B (/qr-code/ QR코드 만들기)
Date: 2026-10-26
Ready for Review: YES
Status: DONE (branch card1026-b, stacked on card1026-a / PR #25)

## Files Changed
- src/pages/qr-code/index.astro:1-164 — the page: hero, the 6 kinds as a radio group of chips (C10 order), six panels (연락처 = ContactFields), privacy line, preview + PNG/SVG buttons, how-to, 알아 두면 좋아요, ToolNotes, FAQ, RelatedTools.
- src/tools/qr-code/entry.ts:1-67 — panel switching + ?tab= (read once, never written), usage start, lazy controller load (focus/key/press/input in the tool, or first signal + idle), replay of a 받기 press that came before the controller.
- src/tools/qr-code/controller.ts:1-216 — fields → payload → encodeQr → inline SVG (debounced 150 ms); inline errors (aria-invalid + the field's error line; format errors live, missing required fields on a 받기 click with focus); tooLong / dense; QR코드.png / QR코드.svg; usage start once + download per file.
- src/tools/qr-code/qr-code.css:1-27, src/styles/contact-fields.css:1-12 — page-only styles, inlined.
- src/components/ContactFields.astro:1-43 — the shared contact fields (C9 maxLengths from CONTACT_MAX, data-contact keys, per-field error slots, no name/form); Step C reuses it.
- src/lib/qr/contact.ts:1-35 — `checkContact` / `contactEmpty` / messages (one place for both pages); tests/unit/qr-contact.test.ts.
- src/content/tool-notes/qr-code.md:1-58 — tool note (4 CONTENT1021 headings, 3 qrcode.com quotes, toolFacts, the E3 trademark sentence verbatim).
- src/data/tools.ts:875-912 — tool entry (title 38 chars, description 70, FAQ ×5, keywords) right after stamp-maker; src/data/site.ts:40 HOME_DESC_ORDER; src/data/og.json (image + page); src/data/tool-facts.ts (3 facts).
- scripts/check-dist.mjs:36-39, 1092-1125 — budgets (initial 12.9 KB, controller 9.2 KB = measured + 20 %) and the /qr-code/ block (lazy controller, no storage/cookie/history, no form or named text field, kind order, no AdSense, no off-site script; no jsQR in any dist JS/HTML).
- scripts/gen-sw.mjs, src/sw/sw.ts, scripts/lib/bgcloud.mjs, scripts/lib/usage.mjs, src/lib/ui/usage.ts, lighthouserc.json, scripts/qa/visual.mjs, docs/COPY.md — one-line registrations.
- tests/e2e/qr-code.spec.ts:1-188 — every kind decoded from the PNG (jsQR via tests/helpers/qr-decode.ts), SVG well-formed, ?tab=, errors + focus, tooLong, dense, URL/storage/requests clean, axe on every kind and error states, 360 px, arrow keys.
- tests/e2e/site.spec.ts, polish.spec.ts, usage.spec.ts:429-443; tests/unit/{polish,postbuild,bgcloud,tool-notes,usage}.test.ts — list/count updates and the usage whitelist tests.

## Gates run (local, chromium only)
npm run check 0/0; targeted vitest (26 files) green; production-flag build + default build, check-dist OK on both; e2e chromium qr-code 10/10, site + polish green. Budgets: initial 9.1 / 10.7 KB (default / production flags), controller 7.6 KB, precache 437.2 / 444.7 of 450 KB, preload 92.1 / 92.2 of 92.66 KB, 0 new glyphs. CI covers the other projects, the cloud usage spec and LHCI.

## Open Questions
- Decision (c): missing required fields show only on a 받기 click (format errors show live). Is the empty preview text 「쓰는 대로 여기에 QR이 나와요.」 enough while e.g. only a phone is filled on 연락처?
- Decision (d): the replayed first click (entry.ts:34-49). A synthetic click on a hidden-anchor download outside the user gesture worked in Chromium; please look at whether WebKit could block it (CI webkit/mobile-safari run the "empty download click" test, which only focuses, and no first-click-download test).
- Title shortened from the brief's 45 chars to 38 (dropped 「인터넷 주소」, kept 「가입 없이」).
- The tool-note quote for 2,331 is the table cell run 「2,953 2,331 1,663 1,273」 (binary L/M/Q/H of version 40); verified verbatim on the live page.

## Out of Scope (logged in BUILD-LOG)
- qr-code guide pin + NEXT_GUIDES (Step D); reverse RelatedTools links (Step C); CLAUDE.md line 3 (orchestrator); check:licenses fails only in a worktree (junction), no dependency change here.
