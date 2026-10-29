# Architect Brief — FAIL1030 도구 실패 줄이기

## Goal
The six biggest addressable failure groups in reports/growth/2026-44.md (week 44: 1,492 ok / 181 fail) either become a
result (a working fallback or a one-tap handoff to the tool that can do it) or end with a plain next step, and every
group we cannot fix yet gets a finer fail code so week 45 shows what the files really are.

## Diagnosis (what the code does now)
| # | Tool / code (count) | Trigger (file:line) | Visitor sees now |
|---|---|---|---|
| A | 배경 지우기 cloud-copy (15 of 75 cloud starts = 20 %) | src/lib/bgremove/cloud.ts makeCopy: null on canvas null, toBlob null, size 0 / >2 MB, or **isCleanJpeg false** (canvas JPEG carries APP1/Exif/XMP/GPS flag) | CLOUD.failed + 다시 시도 / 이 기기에서 처리. Retry repeats the same failure. Suspect: an encoder that writes its own APP1 (WebKit/ImageIO adding Exif ColorSpace/PixelDimension — UNVERIFIED, no iPhone here). Canvas output never holds the source photo metadata. |
| B | PDF 용량 줄이기 too-large (15) | pdf-compress/limits.ts hardBytes: mobile 50 MB, desktop 100 MB (spike: 74 MB → +1.5 GB peak) | Dead end: 「휴대폰에서는 50 MB까지 줄일 수 있습니다…」. /pdf-split/ opens up to 100 MB on phones, 150 MB desktop (measured). |
| C | HWPX HWP 변환 already-hwp (24) | hwpx-to-hwp/controller.ts:279 sniff cfb/hwp3 | Error line + two small hint links (바로 보기 · PDF로 바꾸기; they DO hand the file over). Only 8 of 24 followed them. |
| D | HWP 파일 보기 not-hwp-other (18) | session.ts:441 container unknown → not-hwp.ts; sniffFormat other (not image/pdf/text/zip/cfb), also size < 4 bytes and an unreadable file | Generic 「한글(HWP·HWPX) 문서가 아닙니다…」 — no idea what the file is. |
| E | not-image: 서명·도장 만들기 6, 증명사진 6, PDF 서명·도장 넣기 5; not-pdf: PDF 서명·도장 넣기 3, PDF JPG 변환 3 | sniffImage unknown (stamp-signature/photo.ts:363, id-photo/controller.ts:515, pdf-sign/controller.ts:113); pdf-sign / pdf-to-jpg not-pdf checks | 「사진 파일이 아닙니다. JPG·PNG·WebP…」 — never says it is a PDF/HWP or where to go. |
| F | 증명사진 corrupt (6) | id-photo/controller.ts:565 | One code; corruptCode() (sniff-format.ts) exists and is unused. |

## Flow (shared wrong-file path, E; D reuses not-hwp.ts)

    pick → sniffImage/isPdf says "not mine"
       └─ await import(src/lib/file/wrong-file.ts)   (error path only; initial JS unchanged)
            ├─ read head 64 KB + tail 64 KB (read throws → family other, code ...-other)
            ├─ sniffFormat → family
            ├─ pdf      → (image tools) text + link /pdf-to-jpg/
            ├─ image    → (pdf tools) text + button 「사진 PDF 변환으로 열기」 (handTo jpg-to-pdf, existing)
            ├─ hwp/hwpx → text + link /hwp-to-pdf/
            └─ other    → the current line (unchanged)
       usage fail code = sub-code: not-image-pdf | not-image-hwp | not-image-doc | not-image-other |
                                   not-pdf-img | not-pdf-hwp | not-pdf-other

Cloud copy (A):

    canvas2d null ───────────────► fail copy-canvas
    canvas → toBlob jpeg ──null──► fail copy-blob
       │ size 0 / >2MB ──────────► fail copy-size
       ▼
    stripJpegMetadata (src/lib/image/jpeg-strip.ts; throws → fail copy-meta)
       ▼
    isCleanJpeg(stripped) ─false─► fail copy-meta     (check UNCHANGED, now run on the stripped bytes)
       ▼ true
    send the stripped bytes (exactly the checked bytes)

## Build Order (one commit per item, in this order)
- **A. 배경 지우기 copy** — src/lib/bgremove/cloud.ts makeCopy: run stripJpegMetadata on the canvas JPEG, then the
  existing isCleanJpeg on the result; bytes = the stripped bytes. Return a reason instead of null
  (copy-canvas | copy-blob | copy-size | copy-meta) and log cloud-copy-canvas etc. (bg.ts cloudFail; CloudFail in
  model.ts). After a copy failure the error keeps 「이 기기에서 처리」 (no auto switch: that is a model download the
  visitor did not agree to).
  Flag: privacy gets STRICTER — stripping removes APP1/APP13/COM; isCleanJpeg is never weakened or skipped.
  Flag: the cloud chunk stays within its existing budget; no budget raised.
- **B. PDF 용량 줄이기 too-large → 나누기** — when the hard byte limit fires and the file fits the /pdf-split/ limit for
  the device (import the pure limit from src/tools/pdf-split/limits.ts; no duplicated numbers), show the limit line +
  a plain next step and a button 「PDF 나누기로 열기」 (existing handoff sendTo pdf-split from pdf-compress; add the
  sender to NextSource if missing). Copy (합니다체): 「…까지 줄일 수 있습니다. 쪽을 나눠 작은 파일 몇 개로 만든 뒤 하나씩
  줄여 보세요.」 Over the split limit too: the current line, plus 「컴퓨터에서 해 보세요」 on mobile. Usage code stays
  too-large; the click is the existing next event. Do NOT change LIMITS.
- **C. HWPX HWP 변환 already-hwp** — src/pages/hwpx-to-hwp/index.astro #hx-error-links: the two links get button
  styling (existing btn classes, ≥ 44 px tap), 「바로 보기」 first. Copy (해요체, the page exception):
  「이미 HWP 파일이에요. HWPX로 바꾸지 않아도 되고, 아래 버튼으로 바로 열어 보거나 PDF로 바꿀 수 있어요.」 (honest: no
  HWP→HWPX tool exists). Handoff behaviour and codes unchanged.
- **D. HWP not-hwp-other** — sniff-format.ts notHwpCode + not-hwp.ts: new codes not-hwp-empty (size 0 or < 4 bytes),
  not-hwp-unread (the read threw), not-hwp-hwp3 / not-hwp-hwpml if those families reach the default branch;
  not-hwp-other only for truly unknown bytes. Copy for other on /hwp-viewer/ and /hwp-to-pdf/ (합니다체):
  「한글 문서로 읽을 수 없는 파일입니다. 회사·기관에서 받은 보안 문서라면 보낸 곳에 PDF로 요청해 주세요.」;
  empty: 「빈 파일입니다. 파일을 다시 내려받은 뒤 시도해 주세요.」; unread: the ERRORS.corrupt line. /hwpx-to-hwp/
  gets 해요체 versions.
  Flag: no DRM byte signatures (unverified); the copy is a hedge, not a detection claim.
- **E. Wrong file in image / PDF tools** — new lazy src/lib/file/wrong-file.ts (pure helper + texts; reuse
  sniffFormat and the handTo pattern of not-hwp.ts; move handTo to a shared module only if both callers need the same
  signature). Wire into stamp-signature/photo.ts, id-photo/controller.ts, pdf-sign (image and pdf picks), pdf-to-jpg
  not-pdf. Texts (합니다체): PDF in an image tool 「PDF 파일입니다. 이 도구는 사진만 엽니다. PDF 쪽을 사진으로
  바꾸려면 PDF JPG 변환을 이용하세요.」 + link; photo in a PDF tool 「사진 파일입니다. 먼저 PDF로 만들어 주세요.」 +
  「사진 PDF 변환으로 열기」; hwp/hwpx 「한글 문서입니다. HWP PDF 변환으로 PDF를 만든 뒤 다시 골라 주세요.」 + link;
  other: the current line.
  Flag: if the same controller serves /en/ or /embed/, English strings go in src/i18n/en/ (plain English) and /embed/
  keeps its existing link rules. Check docs/COPY.md word list.
- **F. 증명사진 corrupt sub-code** — id-photo/controller.ts corrupt path logs corruptCode(sniff.format) (labels exist).
- **Usage whitelist** — every new code gets a FAIL_LABELS entry in scripts/lib/usage.mjs (CODE_RE ≤ 24 chars, a–z and
  -) and passes the /api/usage Function validation; unit test that each new code is labelled.
- Flag: do not touch src/content/guides/*, photo-sizes or src/data/tools.ts (SEO1030 in wt/seo1030). A–F need none.

## Out of Scope (→ BUILD-LOG Known Gaps)
- HEIC decoder (사진 JPG 변환 heic 14): libheif/libde265 are LGPL (banned); the permissive route is a WebCodecs HEVC
  spike (REQ1015 steps 5–6), needs sample iPhone HEIC files and a real-phone check → own sprint HEIC1030.
- HWP→HWPX tool (16 of 24 already-hwp visitors left): rhwp has exportHwpx, but output needs an owner 한글 check
  (HWPX2HWP log). Product candidate for the next tool-scout.
- Raising the PDF 용량 줄이기 mobile 50 MB, /pdf-split/ too-big (4) or 사진 PDF 변환 50-photo (5) limits: needs phone
  memory measurements (owner-only). Not raised.
- 서명·도장 만들기 allpaper 6 / noink 4: detection thresholds, not lowered. PDF JPG 변환 unknown-render 5, PDF 용량
  줄이기 corrupt 5, HWP viewer corrupt 3: need finer data first.

## Failure modes
| Path | Realistic failure | Handling | User sees |
|---|---|---|---|
| A strip | stripJpegMetadata throws on an odd encoder output | caught → copy-meta, nothing sent | current error + 이 기기에서 처리 (clear) |
| A strip | stripped bytes still flagged by isCleanJpeg | copy-meta, nothing sent | same (clear) |
| B handoff | IndexedDB refuses a 60 MB Blob (private mode / quota) | handTo false → sendFailed alert (existing) | clear alert, file still pickable |
| B handoff | split page rejects the file anyway (limit drift) | its own too-big line | clear |
| D | file read throws (Android revoked pick) | not-hwp-unread + corrupt line | clear |
| E | lazy chunk fails to load (offline) | catch → current generic line + code not-image | clear (as now) |
| E | handoff of a photo from pdf-sign fails | sendFailed alert (existing) | clear |

No silent path.

## Test map
- A: unit cloud.test — canvas JPEG with an APP1 → sent bytes have no APP1 and pass isCleanJpeg [GAP]; strip throws →
  copy-meta [GAP]; toBlob null → copy-blob [GAP]; >2 MB → copy-size [GAP]; canvas null → copy-canvas [GAP]; the
  existing refuses-APP1 test is updated to assert the sent bytes carry no APP1 (intent kept) [TESTED→update]. e2e
  remove-background.cloud.spec: the one allowed POST body has no APP1/Exif [TESTED].
- B: unit — over-limit decision: fits split → button, over split → no button (mobile/desktop) [GAP]; e2e pdf-compress
  mobile emulation, file over 50 MB → button → /pdf-split/ receives the file [GAP]; limits regression [TESTED].
- C: e2e hwpx-to-hwp .hwp fixture → buttons visible, 바로 보기 opens the viewer with the file [TESTED→update selectors].
- D: unit notHwpCode/notHwpHelp: empty, unread, unknown bytes, hwp3/hwpml codes + texts [GAP]; e2e viewer with a
  random-bytes fixture shows the new line [GAP].
- E: unit wrong-file: pdf/image/hwp/hwpx/other × tool kind → code + text + action [GAP]; e2e one per tool
  (stamp-signature PDF, id-photo PDF, pdf-sign photo-as-pdf, pdf-to-jpg photo) [GAP]; initial-JS budgets [TESTED].
- F: id-photo truncated JPEG → corrupt-jpg logged [GAP].
- Usage: every new code labelled; Function accepts it [GAP].
- All: no-upload fixture on every e2e, check-dist, COPY word scan (no 업로드/서버/브라우저) [TESTED].

## Acceptance
- npm run check 0 errors; npm test green; build + check-dist OK (default and dist-bgcloud); playwright chromium and
  cloud-chromium green; budgets (precache ≤ 450 KB, initial JS per page, cloud chunk) unchanged or lower.
- Diff leaves LIMITS, isCleanJpeg, SEND_EDGE, MAX_SEND_BYTES and every threshold untouched.
- handoff/REVIEW-REQUEST-FAIL1030.md lists every file + line range; BUILD-LOG build entry with gates.

## Owner-only
- O1 iPhone Safari: 배경 지우기 (서버에서) on a camera photo → result, not the copy error (confirms A).
- O2 Android: a 60 MB PDF in PDF 용량 줄이기 → 「PDF 나누기로 열기」 → split → compress one part.
- O3 Week-45 report: read cloud-copy-*, not-hwp-*, not-image-* sub-codes; decide HEIC1030 / HWP→HWPX from them.
