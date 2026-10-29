# Review Request — FAIL1030 (도구 실패 줄이기, items A–F)
Date: 2026-10-30
Ready for Review: YES
Status: DONE (all gates green; see handoff/BUILD-LOG.md "2026-10-30 FAIL1030 build"). Not committed.

## Files Changed
### A. 배경 지우기 copy
- src/lib/bgremove/cloud.ts:4-5, 9 — header comment; imports stripJpegMetadata.
- src/lib/bgremove/cloud.ts:61-98 — CopyFail type; makeCopy returns copy-canvas / copy-blob / copy-size / copy-meta, strips the canvas JPEG, runs the unchanged isCleanJpeg on the stripped bytes, sends exactly those.
- src/lib/bgremove/cloud.ts:204-207 — cutoutOnce passes the CopyFail through as its fail.
- src/tools/remove-background/model.ts:69-84 — CloudFail: 'copy' → the four copy-* (cloudRetry unchanged: they are final).
### B. PDF 용량 줄이기 → PDF 나누기
- src/tools/pdf-compress/limits.ts:4, 22-23, 35-39, 42-46 — imports pdf-split LIMITS; optional LimitCopy.split; checkFileBytes returns split: true when the file fits the split limit.
- src/tools/pdf-compress/messages.ko.ts:92-93, 98-101 — over-both line gets 「컴퓨터에서 해 보세요.」 on phones; the split line + 「PDF 나누기로 열기」.
- src/tools/pdf-compress/controller.ts:167-196 — splitButton: sendTo pdf-split from pdf-compress, next event once stored, sendFailed alert otherwise.
- src/tools/pdf-compress/controller.ts:341 — shows the button when check.split.
### C. HWPX HWP 변환 already-hwp
- src/pages/hwpx-to-hwp/index.astro:59 — the two links as btn ghost in a .row (바로 보기 first).
- src/tools/hwp-shared/messages.ts:36-37 — already-hwp copy per brief.
### D. not-hwp sub-codes and lines
- src/lib/file/sniff-format.ts:101-121 — notHwpCode('empty' | 'unread' | hwp3 → not-hwp-old | hwpml → not-hwp-hwpml).
- src/tools/hwp-shared/not-hwp.ts:17-21, 53-55, 73-78, 96-104, 114, 142-145 — Family empty/unread; 보안 문서 hedge for other (합니다체 / 해요체); empty and unread lines; the read-throw path → unread, a file < 4 bytes → empty.
### E. Wrong file in photo / PDF tools
- src/lib/file/wrong-file.ts:1-171 (new) — lazy helper: wrongGroup, wrongFileHelp (codes, texts, actions), wrongFile (reads 64 KB ends), showWrongFile (link or hand-off button inside the error line; embed → new tab), handTo jpg-to-pdf.
- src/tools/stamp-signature/photo.ts:363-370 — unknown format → wrong-file (fallback: the old line and not-image).
- src/tools/id-photo/controller.ts:515-522 — same.
- src/tools/pdf-sign/controller.ts:460-468 — picture pick: not-image → wrong-file (only for a File).
- src/tools/pdf-sign/controller.ts:516-525 — PDF pick: not a PDF → wrong-file('pdf').
- src/tools/pdf-to-jpg/controller.ts:212-220 — same.
- src/styles/app.css:152-153 — margin for the button row inside .error-box / .notice.
### F. 증명사진 corrupt sub-code
- src/tools/id-photo/controller.ts:573-576 — decode failure logs corruptCode(sniff.format) via a lazy sniff-format import.
### Usage whitelist
- scripts/lib/usage.mjs:460-464, 480-492 — 15 FAIL_LABELS entries (cloud-copy-*, not-hwp-empty/unread/old/hwpml, not-image-*, not-pdf-*).
### Tests
- tests/unit/fail1030.test.ts (new) — wrong-file × families × tool kinds, texts, CFB rule, unreadable file; B decision mobile/desktop at both edges, lines, EN without the step, LIMITS unchanged; every new code: CODE_RE, label, validate, /api/usage Function 204.
- tests/unit/bgcloud.test.ts:21-56, 270-310, 525 — real JPEG-structure fixtures; encoder APP1/APP13/COM stripped and the sent bytes pass isCleanJpeg; each copy-* reason; retry list.
- tests/unit/not-hwp.test.ts, tests/unit/sniff-format.test.ts — empty / unread / HWP 3 codes and lines.
- tests/unit/compress-helpers.test.ts:138-142, tests/unit/messages-ko.test.ts:171, tests/unit/en-check.test.ts:252-255, tests/unit/hwpx-to-hwp.test.ts:61 — new lines; EN catalog compared without limits.split; HWPX allowed in the no-English check.
- tests/e2e: stamp-signature (PDF, .hwp, text), id-photo (PDF + embed new tab), pdf-sign (photo as PDF → /jpg-to-pdf/; PDF as picture), pdf-to-jpg (photo → /jpg-to-pdf/; text; not_a_pdf is PNG bytes → photo line), pdf-compress (phone over 50 MB → /pdf-split/ receives it), hwp-viewer (noise → 보안 문서 line, empty file), hwpx-to-hwp (buttons ≥ 44 px, new copy, noise line), usage.spec (id-photo not-image-pdf + corrupt-jpg beacons).

## Open Questions
- A: the strip runs on every copy, also a clean one (it drops nothing then). isCleanJpeg is unchanged and still runs on the sent bytes. Please confirm stripping JFIF-only canvas output can never break the cloud request (unit-tested with a structural JPEG; the cloud e2e runs real Chromium canvas output).
- D: the brief named the HWP 3 code not-hwp-hwp3; CODE_RE forbids digits, so it is not-hwp-old (labelled 「옛 한글(HWP 3.0)」).
- E: in photo tools the 한글 line deviates from the brief's text (it says to use HWP PDF 변환, not 「다시 골라 주세요」, since a photo tool cannot take that PDF either). Logged as a decision.
- E: the next step sits inside the role="alert" error line (so every existing clear removes it). Screen readers read the button label with the line; tell me if you want it as a sibling instead.
- B: /en/pdf-compress/ gets no split step (no English PDF 나누기 page). en-check now compares the catalogs without limits.split.

## Out of Scope (logged in BUILD-LOG)
- Brief's Known Gaps unchanged: HEIC1030, HWP→HWPX tool, phone memory measurements before any limit raise, allpaper/noink thresholds, unknown-render / compress corrupt / hwp corrupt need finer data.
