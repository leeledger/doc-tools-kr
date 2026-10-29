# Review Feedback — FAIL1030 (도구 실패 줄이기, A–F)
Date: 2026-10-30
Ready for Builder: YES

## Must Fix
None.

## Should Fix
- tests/unit/bgcloud.test.ts (the `gps` case in "never sends a copy with EXIF/GPS") (confidence: 8/10) — `expect(typeof gps !== 'string' && markers(gps.bytes).includes(0xe1)).toBe(false)` also passes when makeCopy *failed* (the left side is false). Privacy holds either way, but the assertion cannot tell "stripped and sent clean" from "refused". Fix: assert which outcome is expected (`expect(typeof gps).not.toBe('string')` first, or `toBe('copy-meta')` if that fixture cannot strip), then the marker check.
- src/tools/hwp-shared/not-hwp.ts:116-131 + 70-78 (confidence: 5/10, verify) — a HWP 3.0 or HWPML file that reaches notHwpHelp now logs not-hwp-old / not-hwp-hwpml but familyOf maps it to `other`, so the visitor reads the 보안 문서 hedge for a file that is plainly an old 한글 file. Session.ts routes `unsupported` containers earlier, so this path may be rare; week-45 data (not-hwp-old count) will show. If it is non-zero, give hwp3/hwpml their own line (e.g. 옛 한글 파일 → 한글에서 HWP로 다시 저장). Log to BUILD-LOG if not fixed now.

## Appendix (low confidence, no action required)
- src/tools/pdf-sign/controller.ts:460-467 (confidence: 4/10) — a PDF picked as the *signature picture* gets a same-tab link to PDF JPG 변환, which leaves the PDF the visitor has open in PDF 서명·도장 넣기. It is the visitor's own click and the brief asked for the link; noted only.

## Deviations judged
- not-hwp-old instead of not-hwp-hwp3: required — CODE_RE is `/^[a-z-]{1,24}$/` (scripts/lib/usage.mjs:96). Accepted.
- 한글 document line in photo tools (「…HWP PDF 변환을 이용하세요」 instead of 「다시 골라 주세요」): correct — a photo tool cannot take the PDF either. Accepted.
- CFB counts as 한글 문서 only when named .hwp: prevents calling an old .doc/.xls a 한글 문서. Accepted.
- handTo kept local in wrong-file.ts: brief allowed it; not-hwp's `from` type is HWP-only and importing it would pull HWP copy. Accepted.
- Embed links open a new tab with 「(새 창)」 + rel=noopener: matches the existing IdPhotoTool embed rule. Accepted.
- /en/pdf-compress/ has no split step: there is no English PDF 나누기 page; LimitCopy.split optional; en-check still compares every other key and asserts KO split exists. Accepted.
- Next-step control inside the role="alert" line: every existing clear (textContent) removes it; announce()/showError() write synchronously, so the append is never wiped by a queued frame. Accepted.
- Changed test expectations (hwpx-to-hwp already-hwp/noise, pdf-to-jpg not_a_pdf = PNG bytes, compress/messages-ko limit lines, not-hwp/sniff-format codes, bgcloud fixtures): each still tests its original intent; the generic not-a-PDF line is still covered by the new text-file e2e. Accepted.

## Verified
- A privacy: makeCopy strips (APP1/APP13/COM/trailers dropped, JFIF/ICC/Adobe kept), runs the unchanged isCleanJpeg on the stripped bytes, and sends exactly those bytes; strip throw → copy-meta, nothing sent; size check before strip (stripped ≤ original). cloudRetry unchanged — copy-* are final (no new send). Cloud chunk 1.5 / 3 KB budget unchanged; cloud-chromium e2e (real canvas, POST without EXIF) green per BUILD-LOG.
- No other bytes leave the device: wrong-file reads 64 KB ends locally; hand-offs go through IndexedDB sendTo.
- LIMITS, SEND_EDGE, MAX_SEND_BYTES, isCleanJpeg, budgets untouched; B imports pdf-split LIMITS (no duplicated numbers).
- Usage: 15 new codes all ≤ 17 chars, a–z and - only, labelled in FAIL_LABELS; `next` events use o=next and a TOOLS slug (pdf-split, jpg-to-pdf), accepted by validate().
- Copy: no 업로드/서버/브라우저/네트워크 in new visitor lines; 합니다체 on photo/PDF/HWP pages, 해요체 on /hwpx-to-hwp/; brief texts word for word except the logged deviation.

## Escalate to Architect
None.

## Cleared
A–F, the usage whitelist and all listed tests were reviewed against the brief; privacy is stricter than before, no limit or threshold moved, and every deviation is justified.
