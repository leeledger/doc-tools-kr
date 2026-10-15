# Review Feedback — REQ1015 steps 1–4
Date: 2026-10-15
Ready for Builder: NO — CHANGES REQUIRED (2 Must Fix, both copy, under 10 minutes total)

Reviewed: commits 4a14c12, 058ab5e, 46bbccd, d9c1a04 against handoff/ARCHITECT-BRIEF-REQ1015.md steps 1–4.
Re-ran: vitest visits/usage/pdf-to-jpg (250 passed). pdf.js 6.3.289 messages checked in node_modules/pdfjs-dist/build/pdf.mjs (lines 15529, 16394, 16535, 16554, 16780, 16874): the WORKER_GONE regex matches all six.

## Must Fix
- src/content/guides/heic-to-jpg.md:6 (confidence: 8) — the answer says 「아이폰·맥에서 사진 JPG 변환을 열고 HEIC 사진을 고르면 JPG로 바뀌고」. That is an unconditional promise (brief Step 1: "Never claim the iPhone always works; only 바꿔 보세요 wording"), and 「맥」 covers Chrome on a Mac, which F2 says cannot decode HEIC. This is the snippet answer, the most-read line on the page. — Fix: 「아이폰·맥 사파리에서 … 고르면 JPG로 바꿀 수 있고, …」 (118 chars, under 120), or drop 맥: 「아이폰에서 … 바꿀 수 있고, …」. The guide uses the system font, so no core-font cost.
- src/content/guides/jpg-to-pdf.md:92 (confidence: 9) — the troubleshooting bullet quotes the old error text 「아이폰 사진 형식(HEIC)은 지금 쓰는 앱에서 열 수 없습니다」. After Step 1 no tool shows this text (messages.ts:42 changed). The brief said to grep every copy of the HEIC message and keep them the same. — Fix: quote the new opening 「아이폰 사진(HEIC)을 이 기기에서 열지 못했습니다」 and give the same advice (아이폰에서 이 페이지를 열어 바꾸기, or 「높은 호환성」 for new photos), with the existing link to /guide/heic-to-jpg/. Then run check:quotes and check-dist.

## Should Fix
- src/content/guides/photo-kb.md:42 (confidence: 7) — the HEIC FAQ still gives the old advice (「사진을 JPG로 내보낸 뒤 다시 골라 주세요」). It is not an over-promise, but it no longer matches the tool FAQ. Align it with the tools.ts wording.
- scripts/lib/visits.mjs:468 (confidence: 6, verify) — `partial: referrers.length >= CHUNK_TOP` runs on the merged rows. On views longer than one chunk, the union of several cut-free chunks can reach 50, so the note shows when nothing was cut, and 「상위 50곳」 is per chunk, not overall. It only over-warns (safe), so it does not block. Better: set partial when any single chunk returned CHUNK_TOP referrer rows.
- src/tools/pdf-to-jpg/controller.ts:310-317 + 350 (confidence: 6) — if the user cancels during reopen(), the state is 'ready' but `opened` stays null until the reopen settles. A 「JPG로 변환」 click in that window silently does nothing (the run() guard `!opened`). There is no leak and no loop: I checked it, because the guard also blocks a second reopen. UX only. Log it if you don't fix it.

## Recommendations on Bob's deviations
1. Tool FAQ 「PC에서는 … 새로 찍을 사진」 instead of 「PC의 크롬·엣지에서는 … 앞으로 찍을 사진」: ACCEPT. Keep the wording and do not raise the font budget. The sentence is true (on PC, Chrome, Edge and Firefox do not decode HEIC; 「많아요」 hedges for Mac Safari), and the guide still names 크롬·엣지. Raising a tripwire to fit three glyphs is the "loosen the gate to pass" move the owner rule forbids. The ~20-byte headroom is a real problem for Step 7. Arch should decide the font budget as its own item (for example a budget review that removes glyphs nobody uses), not inside this copy step.
2. One-sentence guide answer: accept the shape, but not the wording (Must Fix 1).
3. Folding 「보낼 때 저절로 바뀌는 경우」 into the new section: ACCEPT (no duplicate, and both quotes are still cited).
4. EN description drops "never uploaded": ACCEPT. CLAUDE.md says no-upload is secondary on /en/ and is never the lead.

## Escalate to Architect
- /image-to-jpg/ lead (src/pages/image-to-jpg/index.astro:28) and the EN lead (src/i18n/en/tools.ts:107) still say plainly 「아이폰 사진(HEIC)…을 JPG로 바꿉니다」. The brief listed only title, description and keywords as frozen. The lead is a capability line, and the FAQ on the same page now qualifies it, so I am not blocking. Does Arch want the lead touched before Step 7? Changing it costs core-font glyphs.

## Cleared
- Step 1 (apart from the two items above): ERRORS.heic matches the brief word for word and is shared by every photo tool. The tool FAQs, the summary (llms.txt) and the EN error/description/summary/FAQ are truthful. None of them claims PC Chrome works. The Apple F5 USB quote matches the brief's F5 text word for word, retrieved 2026-10-15. The check-dist guard is in place. No 브라우저/업로드/서버 in the Korean copy.
- Step 2: host matching is exact or dot-suffix (no `evilchatgpt.com` match); package names are exact; matching ignores case. The search engines and openai.com are excluded. Each referrer row adds to exactly one service, so nothing is counted twice. Labels and the host are escaped (s-referrers and s-ai go through esc). The weekly line prints 「0회」 when there are no AI visits. The addition is additive only.
- Step 3: DEEP_LINK_TOOLS equals Object.keys(DEEP_PARAM) (src/lib/ui/deeplink.ts:18-22), and the unit test enforces it. Other tools show 해당 없음.
- Step 4: the stage codes all fit CODE_RE. track() replaces any code that does not match CODE_RE with 'unknown' (src/lib/ui/usage.ts:81), and the fail event carries only e/t/c/p. The auto-retry is limited by `retried` (at most one, and only for worker-gone). A cancel never retries (isCancelled -> stop). Each reopen failure ends the run through openFailed. lastPassword lives only in the closure: it is cleared in clearFile and never tracked. After a cancel, a new file or a reset, the reopened document is either kept as `opened` or closed (bytes !== b), so it does not leak. resetPdfJsWorker calls PDFWorker.destroy(), which is synchronous, so it cannot hang.
