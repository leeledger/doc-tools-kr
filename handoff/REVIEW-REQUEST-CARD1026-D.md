# Review Request — CARD1026 Step D (/guide/qr-code/ + /photo-compress/ to the runtime cache)
Date: 2026-10-26
Ready for Review: YES
Status: DONE (branch card1026-d, stacked on card1026-c / PR #28, on card1026-b / PR #26; Step A is on main)

## Files Changed
- scripts/gen-sw.mjs:61-65 — CONTENT1021 D10, second in the pre-locked order: /photo-compress/ joins NOT_PRECACHED (comment with the reason and the 447.9 / 450 KB production-flag figure after Step C).
- src/sw/sw.ts:34-36 — /photo-compress/ joins RUNTIME_PAGES (stored on a successful visit; its /_astro/ scripts are runtime-cached on first use), so it still opens and works offline after one visit.
- tests/e2e/sw.spec.ts:8, 15, 108-133 — new: /photo-compress/ is not in __PRECACHE__, and after one online use the page reloads and compresses a photo offline (chromium + firefox pass; WebKit skipped with the existing setInputFiles-offline reason). Fails without the move (the precache assertion).
- tests/unit/postbuild.test.ts:934-936, tests/unit/pdf-password.test.ts:199-203, tests/unit/polish.test.ts:679 — precache/runtime assertions follow the move (not precached; in RUNTIME_PAGES; stored when visited, served offline).
- src/content/guides/qr-code.md:1-190 — the guide 「QR코드 만들기 전에: 와이파이·연락처 QR, 잘 찍히는 QR」 (40 with the suffix, the limit): H2s QR에 담기는 것 · 종류별로 만드는 법 (6-kind table) · 와이파이 QR (format example, escaping in plain words, no hidden-network option per E1) · 연락처 QR과 연락처 파일 (vCard 3.0 sample, N/FN, why no photo) · 많이 담으면 칸이 작아져요 (version rows 1/15/16/40 at level M, quiet zone) · 안 찍힐 때; FAQ ×4 (license/trademark scope, changed Wi-Fi password, iPhone + hidden network, photo in a contact QR), none copied from tools.ts; the E3 trademark line verbatim at the end; 17 source quotes (qrcode.com ×10, ZXing ×2, Apple ×3, RFC 2426 ×2), all retrieved 2026-10-26 and saved in handoff/sources/card1026/; toolFacts qr-code.maxBytes 2331, quietModules 4. Rendered body 3,434 chars (bar 2,500).
- public/img/guide/qr-code/1-wifi-tab.webp — scripts/guide-shots.mjs of /qr-code/?tab=wifi with a made-up network 「우리가게 손님용」 / 「example-1234」, 720×866, 22.0 KB.
- public/img/guide/qr-code/2-quiet-zone.svg — hand-made: a real version-1 M QR of 「docttak.com」 (generated with uqr, decodes with jsQR) inside a shaded 4-module quiet zone, with the 21×21 / +4 / 177×177 rule; source named, no quote; 640×480, 4.3 KB.
- scripts/guide-shots.mjs:20-23, 83-94, 134-143 — the qr-code shot and an optional per-shot `bottom` selector (the clip ends 16 px under the 받기 buttons); the three existing shots are byte-identical after a re-run.
- src/data/tool-guide-order.ts:29-31 — pins: qr-code → [qr-code], business-card → [qr-code].
- src/data/guides.ts:63-65, 86-87 — NEXT_GUIDES: qr-code → kakao-photo, stamp-image; business-card → passport-english-name, kakao-photo, stamp-image (doc comment updated).
- src/content/guides/stamp-image.md:8, 105 — the inbound sentence (도장 옆에 QR을 넣는 안내문·명함 → the guide); updated 2026-10-26.
- src/content/tool-notes/qr-code.md:33-34, src/content/tool-notes/business-card.md:26-27 — one line each pointing to the guide (LOAN1022 precedent); notes now 2,535 / 2,464 chars.
- scripts/lib/guide-titles.mjs:42 (regenerated), lighthouserc.json:50 — registration.
- tests/unit/guides-schema.test.ts:418, 420 — qr-code and business-card in the GROWTH3 G0 partial list with 1 own guide each; tests/unit/guide-check.test.ts:111-112 — the taller shot's size.

## Open Questions
- Topic 「서명·도장」 for the guide: TOPICS has no closer group (명함/QR); adding a topic changes /guide/ for one page. Bob's call, logged; Arch may prefer another.
- The Growth T9 rule (no non-statute quote rendered on a guide page) means the guide paraphrases every source in Korean; only the E3 trademark line is verbatim, and that sentence is deliberately not one of the source quotes (the FAQ's trademark-scope sentence is cited instead). Please check the paraphrases keep the sources' meaning (ZXing Wi-Fi prompt + escaping, Apple hidden SSID / vCard, RFC 2426 N order + VERSION 3.0).
- CTA is plain /qr-code/ (deeplink parseHref does not accept ?tab=; extending it was out of scope).
- 1-wifi-tab.webp shows the tool's own privacy line (「쓴 내용은 이 기기 밖으로 보내지 않습니다.」) as part of the screenshot; it is an image of the tool page, not guide text (check-dist passes).

## Out of Scope (logged in BUILD-LOG)
- ?tab= deep links in guide CTAs (parseHref); a 명함/QR guide topic.
