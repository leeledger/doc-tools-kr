# Architect Brief — REQ1014-B: fewer tool failures

Base: `req-1014` = origin/main ee4950c. Parallel briefs: -A (analytics/admin; owns `sniffFormat` and the not-hwp-* logging codes), -C (guides/presets). Do not touch `handoff/ARCHITECT-BRIEF.md`. Other worktrees (c2, emb2, rev6) edit `scripts/lib/usage.mjs`, `admin-view.mjs`, `src/data/legal.ts`: stay out, except the one FAIL_LABELS block in D12.

## Goal
A wrong file, a flaky cloud answer, a faint signature, an oversized photo set or a slow HWPX no longer ends in a dead end: the tool names what the file is and offers the next step, retries once where a retry can help, and falls back to the device. Targets (7-day admin after deploy): 배경 지우기 >= 85 %, HWPX→HWP >= 85 %.

## Root causes found (from code; there are no server logs: workers/bg has observability off)
- **HWP 보기 not-hwp x11:** `sniffContainer` (src/lib/hwp/sniff.ts) knows only cfb/zip/hwp3/hml. Everything else (PDF, JPG, TXT) gets `not-hwp` at once; a ZIP that is not HWPX (DOCX/XLSX/PPTX/plain ZIP) and a CFB that is not HWP (old .doc/.xls/.ppt) get `not-hwp` from the worker (features.ts:196/199/240/242). One generic line for all. HWPX is already supported by /hwp-viewer/ (zip path): no routing needed there.
- **HWPX→HWP not-hwpx x7:** same: `kind !== 'zip'` gives the generic HX_COPY.notHwpx. A real .hwp already gets `already-hwp` with links (controller.ts:217), but the links are plain `<a>` to /hwp-viewer/ and /hwp-to-pdf/: the user must pick the file again. Neither HWP page is a handoff receiver today.
- **HWPX→HWP timeout x3:** 90 s watchdog (hwp-shared/watchdog.ts) is blind to a hidden page. (a) Phones freeze workers when the user switches app; the main-thread timer fires on return: a false `timeout`. (b) An engine download that stalls mid-stream posts no progress: `timeout` (a retry helps). (c) A real rhwp parse hang (a retry does not help). Export itself takes 2–56 ms (SPIKE-HWPX-TO-HWP), so it is not the export. Admin cannot tell (a)/(b)/(c) apart: engine stage and parse stage both log phase `parse`.
- **HWPX→HWP verify-failed (= `unverified`) x2:** export-hwp.ts demands `pagesOut === pagesIn` exactly. rhwp's page count is rhwp's own layout (spike item 6: off by 1 from 한글 on adm02/adm14), and a re-laid-out HWP of the same content can land 1 page off. Missing CFB magic, a reopen throw and a page diff all log one code.
- **배경 지우기 cloud-failed 9/46:** one code for many causes (cloud.ts `readAnswer`/`requestCutout`, bg.ts `sendCloud`): 30 s timeout, network drop, 502 `engine` (Images binding threw), 503 non-quota (`BG` binding missing), 4xx (403 `origin` when the browser sends no `Sec-Fetch-Site`, e.g. iOS < 16.4 WebViews; 413/415), 200 without `image/webp`, `makeCopy`/`decodeAlpha` null, cloud chunk import failure. Nothing is retried. The fallback button exists (`#bg-device-retry`, 「기기에서 처리」) but it *remembers* device mode for good (chooseDevice(true)).
- **서명·도장 allpaper 7 / noink 1:** one run at 진하기 0; no automatic second try; no shooting tip before the pick.
- **사진 PDF too-big x3:** `planAdd` caps total input bytes (phone 150 MB) even with 「줄이기」 (긴 변 2,000픽셀), where the output is about 1 MB per photo and the worker reads one File at a time (images.worker.ts `build`). One code for "one photo too big" and "total too big".
- **증명사진 corrupt x3:** decode.ts maps every non-RangeError `createImageBitmap` rejection to `corrupt`, including the *resize-option* attempt, and never falls back to a plain decode + canvas shrink in that case (it does only on an aspect mismatch). HEIC is already its own code. Cheap hardening only (D11); the format logging is -A's.

## Flow: HWP tools, wrong file
```
pick -> size cap -> head 1 KB sniffContainer
          | unknown, or worker 'not-hwp' (zip not HWPX / cfb not HWP)
          v
   notHwpHelp(file, tool, workerSaid)   (lazy chunk; reads head 64 KB + tail 64 KB)
          | sniffFormat(head, tail)      [-A helper]
          +- pdf    -> text + [PDF 열기 (blob link)] [PDF 쪽 보기·나누기 -> sendTo pdf-split]
          +- image  -> text + [사진 PDF 변환으로 열기 -> sendTo jpg-to-pdf]
          +- docx/xlsx/pptx/office-old/zip/text -> text naming the format, no button
          +- other  -> existing generic line
   track fail c = -A's not-hwp-<family> code
```
## Flow: HWPX→HWP, links
```
already-hwp | export | unverified -> error + [바로 보기] [PDF로 바꾸기]
   click -> sendTo('hwp-viewer'|'hwp-to-pdf', 'hwpx-to-hwp', file)
              ok   -> target boot: pendingHandoff -> receiveHandoff -> controller start.file
              fail -> browser follows the href (pick again)
```
## Flow: HWPX→HWP watchdog
```
open sent [stage start] -> engine progress [engine] -> progress parse [parse] -> parsed -> export-hwp sent [export] -> hwp
watchdog 90 s, paused while document.hidden
fire in start/engine, first time -> terminate, new worker, re-read file, resend open (silent)
fire otherwise -> timeout; usage phase load (start/engine) | parse | process (export)
```
## Flow: 배경 지우기 cloud
```
배경 지우기 -> request 1 -ok-> result
                 | failure kind
                 +- quota -> existing device path + notice
                 +- busy (429) -> existing busy line + buttons
                 +- timeout | refused (4xx) | copy -> final error (no retry)
                 +- network | server (5xx) | answer | load -> wait 1,200 ms -> request 2 -ok-> result
                                                                         \- fail -> final error
final error: CLOUD.failed + [다시 시도] [이 기기에서 처리]
[이 기기에서 처리] -> onDevice(run), this photo only (model consent if not cached); NOT remembered
usage: one fail per user-visible failure, code cloud-<kind> (D12)
```
## Flow: 서명·도장 photo
```
photo loaded -> run (strength 0) -> ok -> result
                                  \- noink|allpaper, first result of this photo, slider untouched
                                       -> ladder (+1,+2 | -1,-2) on cached planes -> first ok -> result + slider moved + status line
                                                                                  \- none -> original message, slider 0, one fail
```

## Decisions
1. **Format helper = -A's `sniffFormat`.** Import from `src/lib/file/sniff-format.ts` (the path the -A brief names, its merge note). Re-check `handoff/ARCHITECT-BRIEF-REQ1014-A.md` before starting; if it names another path or signature, follow it and adapt `not-hwp.ts` only. If the file does not exist when you start, create it with this contract (-A's builder then extends it: add members, never rename):
   `export type FileFamily = 'hwp' | 'hwpx' | 'hwp3' | 'hwpml' | 'pdf' | 'docx' | 'xlsx' | 'pptx' | 'office-old' | 'zip' | 'image' | 'text' | 'other';`
   `export function sniffFormat(head: Uint8Array, tail?: Uint8Array): FileFamily` (pure). PDF: `%PDF-` within the first 1,024 bytes. Images: the existing `sniffImage` signatures (jpeg/png/gif/webp/bmp/heic/avif/tiff) give `image`. CFB gives `hwp` (bytes alone cannot see the FileHeader stream cheaply); the caller turns it into `office-old` when the worker said not-hwp (D2). ZIP: first local header named `mimetype` with `application/hwp+zip` gives `hwpx`; otherwise central-directory names from `tail` (EOCD scan, no inflate, tolerate a partial buffer): `word/` docx, `xl/` xlsx, `ppt/` pptx, else `zip`; no tail gives `zip`. `text`: first 512 bytes are UTF-8 (or UTF-16 with BOM) with no NUL and >= 90 % printable. HWP3 signature gives `hwp3`; HWPML XML gives `hwpml`. Logging codes are -A's: if -A exports `notHwpCode(family)`, use it; otherwise emit `not-hwp-pdf|hwpx|docx|zip|img|other` (docx/xlsx/pptx/office-old -> docx, image -> img, text/hwpml/hwp3/other -> other). Reason: one sniff for UX and logging.
2. **`src/tools/hwp-shared/not-hwp.ts` (new, lazy):** `notHwpHelp(file: File, tool: 'hwp-viewer'|'hwp-to-pdf'|'hwpx-to-hwp', workerSaid: 'cfb'|'zip'|null): Promise<{ code: string; text: string; action: 'pdf'|'image'|null }>`. Reads `file.slice(0, 65536)` and the last 65,536 bytes; CFB + worker not-hwp gives `office-old`. Text table in D3. Loaded with `import()` only on the not-hwp path, so the initial JS of the 3 HWP pages does not change. session.ts and the hwpx controller keep the picked File until reset so the helper and the buttons can use it. Reason: one place for three tools, zero cost on the success path.
3. **Copy.** docs/COPY.md: /hwp-viewer/ and /hwp-to-pdf/ tool lines are 합니다체; /hwpx-to-hwp/ tool lines are 해요체 (its existing exception). Each line two sentences; no 업로드/서버/브라우저; particles after variables via josa().
   - viewer/to-pdf: pdf on viewer 「PDF 파일입니다. PDF는 휴대폰·컴퓨터에서 바로 열 수 있습니다.」; pdf on to-pdf 「이미 PDF 파일입니다. 바꾸지 않아도 됩니다.」; docx 「워드 파일(.docx)입니다. 한글 문서라면 .hwp 또는 .hwpx 파일을 골라 주세요.」; xlsx 「엑셀 파일(.xlsx)입니다.」 + the docx second sentence; pptx 「파워포인트 파일(.pptx)입니다.」 + the same; office-old 「워드·엑셀 같은 다른 프로그램의 파일입니다.」 + the same; zip 「압축 파일(ZIP)입니다. 압축을 푼 뒤 안에 있는 .hwp 또는 .hwpx 파일을 골라 주세요.」; image 「사진 파일입니다. 사진을 PDF로 만들려면 아래 버튼을 누르세요.」; text 「글자만 있는 파일입니다. 한글 문서라면 .hwp 또는 .hwpx 파일을 골라 주세요.」; other = the existing generic not-hwp line.
   - hwpx-to-hwp: pdf 「PDF 파일이에요. HWP로 바꿀 필요 없이 바로 열 수 있어요.」; docx/xlsx/pptx/office-old 「워드 파일(.docx)이에요. 확장자가 .hwpx인 한글 파일을 골라 주세요.」 (format name per family as above); zip 「압축 파일(ZIP)이에요. 압축을 푼 뒤 안에 있는 .hwpx 파일을 골라 주세요.」; image 「사진 파일이에요. 사진을 PDF로 만들려면 아래 버튼을 누르세요.」; text/other = HX_COPY.notHwpx.
   - Buttons: 「PDF 열기」, 「PDF 쪽 보기·나누기」, 「사진 PDF 변환으로 열기」.
4. **「PDF 열기」** = `<a target="_blank" rel="noopener">` with `href = URL.createObjectURL(new Blob([file], { type: 'application/pdf' }))` (a renamed file carries the wrong type). Revoked on reset, a new pick and pagehide. Nothing leaves the device. See U1 for the probe and fallback. 「PDF 쪽 보기·나누기」 = `sendTo('pdf-split', tool, file, file.name, 'application/pdf')` (existing receiver). Image: `sendTo('jpg-to-pdf', ...)` (existing receiver). sendTo false: show `sendFailed(label)` from next-steps.ts in the alert. Each successful send tracks `{ e: 'next', t: tool, o: 'next', v: target }` (v is in TOOLS, already valid server-side).
5. **Markup:** add `<p class="hint" id="hw-error-actions" hidden></p>` after `#hw-error` in src/pages/hwp-viewer/index.astro and src/pages/hwp-to-pdf/index.astro; in hwpx-to-hwp keep `#hx-error-links` for D7 and add `#hx-error-actions` for the D4 buttons. Actions are built in JS, cleared on reset/new pick. Focus stays on the error box (existing).
6. **HWP pages become handoff receivers** (hwp-viewer, hwp-to-pdf). `src/tools/hwp-shared/boot.ts`: static `pendingHandoff(slug)` from handoff-marker.ts (sync, small); when pending, start the controller at once (skip the after-paint wait) and run `receiveHandoff(slug, root, open, { notice })` through a dynamic import of `../../lib/ui/handoff`. Add `<p class="notice" id="hw-arrived" hidden></p>` to both pages. Run the sweep the way jpg-to-pdf/entry.ts does (`sweepDue`). Not pending: same behaviour as today. Reuse `BootStart.file` to hand the file to the controller. LHCI on the 3 HWP pages stays within thresholds.
7. **HWPX→HWP links become the chain.** `#hx-error-links` items: 「바로 보기」 (href /hwp-viewer/) and 「PDF로 바꾸기」 (href /hwp-to-pdf/). Click while a picked File is held: `preventDefault`, then `sendTo(target, 'hwpx-to-hwp', file, file.name, file.type || 'application/octet-stream')`; false: follow the href. Applies to every WITH_LINKS code (already-hwp, export, unverified: the viewer and HWP PDF 변환 open HWPX too). The already-hwp text stays.
8. **Watchdog pauses while the page is hidden.** `createWatchdog(onFire, ms, deps = { doc: globalThis.document })`: `visibilitychange` to hidden clears the timer and remembers it was armed; back to visible re-arms a full window; `stop()` clears the armed flag; no doc: old behaviour. Shared by session.ts and the hwpx controller (fixes cause (a) everywhere).
9. **HWPX→HWP stage tracking + one engine-stage retry.** The controller keeps `stage` as in the flow. A timeout in start/engine, first time for this file: stop the worker, create a new one, read `file.arrayBuffer()` again (the first buffer was transferred), resend open; no extra pick/start events; progress text unchanged. Second timeout, or a timeout in parse/export: `fail('timeout')` with usage phase `load` (start/engine), `parse`, or `process` (export). Reason: (b) is cured by a retry; (c) is not, and the phase separates them in admin with no new code.
10. **Verify gate tolerance (export-hwp.ts).** Pass when the bytes have CFB magic, the reopen works, `pagesOut >= 1` and `abs(pagesOut - pagesIn) <= max(1, round(pagesIn * 0.05))`. The result carries `pageShift` (pagesOut differs from pagesIn); the worker's `hwp` message passes it on. On pageShift the result card shows a warn line in `#hx-loss` (same box as losses) 「쪽 나눔이 원본과 조금 다를 수 있어요. 한글에서 꼭 확인한 뒤 내세요.」 without page numbers (rhwp counts are not 한글's). Beyond tolerance: `unverified`, no download (unchanged). `HwpError` gets an optional `detail`; the worker `error` message carries `detail?: 'pages' | 'reopen' | 'bytes'`; the controller logs `unverified` (pages), `unverified-reopen`, `unverified-bytes`. Reason: the gate exists to stop broken files, not a 1-page rhwp re-layout; every content loss is still reported. This is a product gate, not a test threshold.
11. **증명사진 decode hardening (src/lib/image/decode.ts):** if the resize-option `createImageBitmap` rejects with a non-RangeError, fall through to the plain decode + `shrink` path (as the aspect-mismatch branch does); only a failure of the plain decode maps to heic/corrupt. Helps id-photo, jpg-to-pdf, image-to-jpg and the photo worker. No `<img>` fallback (Known Gap).
12. **Usage codes** (CODE_RE `^[a-z-]{1,24}$`; no whitelist change). New: `cloud-timeout`, `cloud-network`, `cloud-server`, `cloud-refused`, `cloud-answer`, `cloud-copy`, `cloud-load`, `unverified-reopen`, `unverified-bytes`, `too-big-file`, `too-big-total`. `cloud-failed` stays as the catch-all. Admin labels: append ONE block at the end of `FAIL_LABELS` in scripts/lib/usage.mjs, marked `// REQ1014-B`, nothing else in that file (if -A appends its own block, keep both): 서버 응답 30초 넘김 / 보내다 인터넷 끊김 / 서버 오류(5xx) / 서버가 거절(4xx) / 서버 결과를 읽지 못함 / 보낼 사본 만들기 실패 / 보내기 기능 불러오기 실패 / 바꾼 파일이 다시 열리지 않음 / 바꾼 파일이 HWP 형식 아님 / 사진 한 장이 너무 큼 / 사진 합계가 너무 큼. Old `too-big`, `cloud-failed`, `unverified` labels stay (history).
13. **배경 지우기: one automatic retry.** src/lib/bgremove/cloud.ts: a failed `CloudResult` gains `kind: 'timeout' | 'network' | 'server' | 'refused' | 'answer'` (why stays busy/quota/failed/aborted). `readAnswer`: server for 5xx (503 non-quota included), refused for 4xx except 429, answer for 200 without image/webp. `requestCutout`: timeout vs network. bg.ts `sendCloud`: retryable = network, server, answer, and a failed cloud chunk import (load). Not retryable = timeout (the user already waited 30 s), refused (deterministic, e.g. 403 origin), copy, busy, quota. Retry once after 1,200 ms, honouring the abort signal and the run token (취소 during the wait: no second request); status text stays 「배경을 지우는 중…」. At most 2 requests per press. One fail event, only when the user sees the error: `cloud-<kind>`, cloud-copy or cloud-load. Update the "nothing is retried here" comments in both files. Cost: at most +1 transformation per failure.
14. **「이 기기에서 처리」 = this photo only.** `CLOUD.deviceButton` becomes 「이 기기에서 처리」; `CLOUD.failed` becomes 「지금은 처리할 수 없어요. 다시 시도하거나 「이 기기에서 처리」를 눌러 주세요.」. `#bg-device-retry` calls a new `deviceOnce()` = hideError + `onDevice(run)` without `chooseDevice(true)`; the remembered choice stays on its own control `#bg-device`. The model consent panel still shows when the model is not cached (download size on phones). The start event logs mode device as today.
15. **서명·도장: tip + automatic 진하기 ladder.** Static tip above the photo picker in src/pages/stamp-signature/index.astro: `<p class="hint" id="ss-tip">흰 종이에 진한 펜으로 쓰고, 그림자가 지지 않게 가까이 찍어 주세요.</p>`. New pure `src/tools/stamp-signature/auto.ts`: `autoLadder(status)` gives noink `[1, 2]`, allpaper `[-1, -2]`, ok `[]`. photo.ts: only on the FIRST result of a newly loaded photo and only while the slider is at 0; if the status is not ok, run the ladder through the cached planes (a `runAt`-like call with a strength override). The first ok wins: set the slider and its output label to that step and say 「진하기를 자동으로 맞췄습니다.」 (polite status). None ok: show the original status message, slider back to 0, log the original fail once. A user slider or mode change never triggers the ladder. Reason: cached reruns are cheap and the slider range already defines what is legitimate.
16. **사진 PDF: automatic 「줄이기」 when the total is too big.** `planAdd(sizes, current, currentBytes, device, size)` with size `'original' | 'reduce'`: with reduce the total-bytes cap is not applied (count and per-photo caps stay). addFiles: when the plan under original has overTotal > 0 and the plan under reduce accepts more, switch the `jp-size` radio to reduce, add with the reduce plan and show 「사진 합계가 150 MB를 넘어 사진 크기를 「줄이기」로 바꿨습니다. 긴 변 2,000픽셀로 줄여 만듭니다.」 (numbers from LIMITS and REDUCE_EDGE for the device; josa). While the list total is over maxTotalBytes the 「원본 그대로」 radio is disabled with the hint 「사진 합계가 150 MB를 넘어 원본 그대로는 만들 수 없습니다.」; removing photos re-enables it. Codes: `too-big-file` (per-photo cap), `too-big-total` (total cap, only reachable with original). FAQ and tool-facts numbers unchanged. Reason: the worker re-draws one photo at a time at 2,000 px, so the output (about 1 MB a photo, at most 50 photos on a phone) is no bigger than what the 150 MB cap allows today.

## Build order
1. Refactor-only first (no behaviour change, own commit-sized step): watchdog deps param; export-hwp result shape (`pageShift` always false, exact gate kept); `HwpError.detail`; cloud.ts `kind` field; planAdd `size` param defaulting to original. Unit tests green.
2. Behaviour: D1/D2/D3/D4/D5 (not-hwp help) -> D6/D7 (receivers + chain) -> D8/D9 (watchdog, retry) -> D10 (tolerance) -> D13/D14 (bg) -> D15 (stamp) -> D16 (jpg) -> D11 (decode) -> D12 labels.
3. Flag for Bob: do not guess the -A helper's final shape; follow the -A brief if present, the D1 contract otherwise, and list any mismatch in REVIEW-REQUEST.

## Files (exact)
- new: `src/lib/file/sniff-format.ts` (only if -A's is absent; D1), `src/tools/hwp-shared/not-hwp.ts`, `src/tools/stamp-signature/auto.ts`
- `src/tools/hwp-shared/session.ts` (not-hwp path, actions, blob URL lifetime), `boot.ts` (D6), `watchdog.ts` (D8)
- `src/tools/hwpx-to-hwp/controller.ts` (D2, D7, D9, D10 display), `src/tools/hwpx-to-hwp/copy.ts`
- `src/lib/hwp/export-hwp.ts`, `src/lib/hwp/hwp.worker.ts` (detail, pageShift), `src/lib/hwp/errors.ts` (detail)
- `src/pages/hwp-viewer/index.astro`, `src/pages/hwp-to-pdf/index.astro`, `src/pages/hwpx-to-hwp/index.astro`
- `src/lib/bgremove/cloud.ts`, `src/tools/remove-background/bg.ts`, `src/tools/remove-background/copy.ts`
- `src/tools/stamp-signature/photo.ts`, `src/tools/stamp-signature/copy.ts`, `src/pages/stamp-signature/index.astro`
- `src/tools/jpg-to-pdf/limits.ts`, `src/tools/jpg-to-pdf/controller.ts`
- `src/lib/image/decode.ts`
- `scripts/lib/usage.mjs` (FAIL_LABELS block only)
- tests: `tests/e2e/hwp-fixtures.ts`, `tests/helpers/hwp.ts`, the specs and unit files below
- `docs/COPY.md`: no change expected (tones follow the existing exceptions). If Richard asks, add one 문체 line for the new hwpx lines.

## Fixtures (generated at test time from committed bytes, the repo convention in hwp-fixtures.ts; nothing new committed)
`makeHwpRuntimeFixtures` gains: `report-pdf.hwp` and `report.pdf` (bytes of tests/fixtures/gen_already_small.pdf), `photo.hwp` (tests/fixtures/photo/scene_cc0.jpg), `word.docx` (existing `docxLikeZip()`), `sheet.xlsx` (new `xlsxLikeZip()` in tests/helpers/hwp.ts: `[Content_Types].xml` + `xl/workbook.xml`), `archive.zip` (zipSync of one a.txt), `old-office.hwp` (law05.hwp with the ASCII `HWP Document File` in its FileHeader stream overwritten: a CFB without the HWP signature; new helper `cfbNotHwp()`). Existing: `notes.txt`, `word-renamed.hwpx`, law05.hwp. Stamp: a faint signature drawn in the page (canvas to JPEG, ink at about 33 % darkness) and passed with `setInputFiles({ buffer })`. jpg-to-pdf total cap: unit test for planAdd; e2e only if the existing spec already has a cheap way to exceed the phone total (padded JPEGs under 5 s); otherwise unit only and log it.

## Failure modes
| Path | Realistic failure | Handling (test) | User sees |
|---|---|---|---|
| notHwpHelp | slice read throws (file revoked on Android) | catch, generic line, code not-hwp-other (unit) | clear |
| PDF 열기 | blob tab refused by CSP, or Android downloads it | U1 probe, `download` fallback (e2e) | clear: opens or saves |
| sendTo (hwp, pdf-split, jpg-to-pdf) | IndexedDB refused (private mode) | false: sendFailed line or follow href (unit + e2e) | clear |
| HWP receiver | marker without record (expired) | receiveHandoff TAKE_FAILED alert (existing unit) | clear |
| watchdog pause | visibilitychange never fires (old WebView) | behaves as today | as today |
| engine retry | second stall | timeout, phase load (e2e or unit) | clear |
| verify tolerance | a real 1-page content drop | losses report still shown + pageShift warn (unit + e2e) | clear warning, never silent |
| bg retry | 429 on the retry (3 per 10 s limit) | busy line (unit) | clear |
| bg retry | 취소 during the 1.2 s wait | no second request (e2e) | clear |
| deviceOnce | model download fails | existing network/corrupt errors | clear |
| stamp ladder | blank paper reads as ok at +2 (noise) | despeckle/minInk; acceptance: blank and dark fixtures still fail; if not, ladder stops at +1/-1 | must never hand out garbage silently |
| jpg auto reduce | phone out of memory on 50 reduced photos | existing oom path | clear |
No critical gap: every new path has handling and a test.

## Test map
Unit (vitest) — all [GAP] today unless marked:
- `tests/unit/file-sniff.test.ts` (only if you create sniff-format.ts; else -A's covers it): pdf, jpeg/png/heic, cfb, hwpx zip, docx/xlsx/pptx via tail, zip without tail, text, UTF-16 BOM text, binary noise -> other, empty.
- `tests/unit/not-hwp.test.ts`: every family x 3 tools -> text/action/code; CFB + worker -> office-old; read failure -> other; every string passes the postbuild plain-language word list (no 업로드/서버/브라우저); josa.
- watchdog (extend existing, [TESTED] for the base): hidden pauses, visible re-arms a full window, stop while hidden stays stopped, no doc -> old behaviour.
- export-hwp (extend existing, [TESTED] for exact gate): diff 0 pass pageShift false; diff 1 pass pageShift true; 100 -> 105 pass; 100 -> 106 unverified detail pages; 1 -> 2 pass; 1 -> 3 unverified; no magic -> bytes; reload throws -> reopen; pagesOut 0 -> unverified.
- bg cloud (extend existing): readAnswer kinds for 502, 503 engine, 503 quota, 403, 413, 429, 200 png; requestCutout timeout vs network vs aborted.
- `tests/unit/stamp-auto.test.ts`: ladder per status; processInk on synthetic faint ink: noink at 0, ok at +2; synthetic blank paper with JPEG-like noise stays noink at +1 and +2; a dark page stays allpaper at -2.
- jpg-to-pdf limits (extend existing): reduce skips the total cap; per-file cap kept in both; codes too-big-file / too-big-total; count cap.
- decode.ts: stubbed createImageBitmap rejecting only with resize options -> plain path succeeds; both reject -> corrupt; heic sniff -> heic.
- usage.mjs: every new code matches CODE_RE and has a label.
E2E (5 projects: chromium, firefox, webkit, mobile-chrome, mobile-safari; the no-upload fixture on every test, except the cloud spec's one allowed POST):
- hwp-viewer.spec: PDF renamed .hwp -> PDF line, 「PDF 열기」 opens a blob: page (U1), 「PDF 쪽 보기·나누기」 arrives in /pdf-split/ with its pages; JPG renamed -> 사진 line, its button arrives in /jpg-to-pdf/; docx, xlsx, zip, old-office, notes.txt -> their lines, no buttons; no worker/wasm request for PDF/JPG/TXT; axe on the PDF error state. Existing ".txt is not a HWP file" test updated to the text line.
- hwp-to-pdf.spec: PDF -> 「이미 PDF 파일입니다…」 + 열기; a handoff from hwpx-to-hwp arrives (ARRIVED notice, document opens, no second pick).
- hwpx-to-hwp.spec: update the already-hwp test (link texts 「바로 보기」「PDF로 바꾸기」, hrefs kept); 바로 보기 opens /hwp-viewer/ with law05 rendered; PDF로 바꾸기 opens /hwp-to-pdf/ with it; report.pdf and word.docx get their lines (update the "noise and a text file" test where its expectations change); worker stub `hwp` with pageShift -> warn line and the download works; worker stub error detail reopen -> unverified line.
- hwpx-to-hwp watchdog: with page.clock or the existing worker-stub pattern: hidden past 90 s then visible -> no timeout; engine stage silent 90 s once -> automatic second open and success; twice -> timeout panel. If the clock cannot drive this on WebKit, keep it unit-only (controller logic in a pure helper) and log it.
- remove-background.cloud.spec (cloud-* x 5): 502 then 200 -> result, exactly 2 POSTs, no error; 502, 502 -> failed line, 「이 기기에서 처리」 -> consent/device path, reload -> no mode line (not remembered); 403 -> 1 POST and the error; hold 30 s -> 1 POST (no retry); 취소 during the retry wait -> 1 POST. Update the existing "5xx, a dropped connection and 30 s" and "429" tests to the new counts and button name.
- stamp-signature.spec: tip visible above the picker; faint in-page signature -> result + 「진하기를 자동으로 맞췄습니다.」 + slider at 1 or 2; existing "blank paper and a dark page" still fail with no download (regression, [TESTED]); a user slider move on a noink photo does not jump the slider.
- jpg-to-pdf.spec: total over the phone cap -> auto 「줄이기」 notice, 원본 그대로 disabled, the PDF builds (see Fixtures for when this is unit-only).
- usage.spec (cloud): one cloud-server fail beacon after two 502s; none after 502 + 200.
- Regression sweep, 5 projects: hwp-viewer, hwp-to-pdf, hwpx-to-hwp, chain, preload, site, polish, sw, id-photo, image-to-jpg, jpg-to-pdf, pdf-split, stamp-signature, remove-background, remove-background.cloud.

## Gates (CLAUDE.md + CLOUD-HANDOFF §3)
- `npm run check` 0 errors; vitest all green (default dist); `PUBLIC_SITE_URL=https://docttak.com npm run build`.
- check-dist OK on default, cloud flag-on, autoframe; precache at most 450 KB, report the delta.
- Budgets unchanged: jpg-to-pdf controller (lazy) 13.1 KB, stamp-signature controls 13.5 KB, initial JS at most 30 KB on every touched page. Over a budget: escalate in REVIEW-REQUEST, never raise it.
- Core UI font: list any new core characters from the tip/notice/button lines (0 preferred).
- `npm run check:licenses`; e2e as above, 0 failed; axe inside the specs.
- LHCI local, median of 5: /hwp-viewer/, /hwp-to-pdf/, /hwpx-to-hwp/, /stamp-signature/, /jpg-to-pdf/ within thresholds (CI is the source of truth).
- `npm run qa:visual`; `npm run regress:hwp -- --fixtures-only`, `regress:ink -- --fixtures-only`, `regress:photo -- --fixtures-only`.
- Richard writes "clear".

## Unverified claims (probe first, log the verbatim result)
- U1: a `blob:` PDF opened from `<a target=_blank>` on a page with our CSP renders on Chromium, Firefox and WebKit (blob documents inherit the creator's CSP; Chromium's PDF viewer may be refused). Probe in the e2e on all 5 projects. If refused on an engine, use `download={file.name}` for every engine (no UA sniffing) and keep 「PDF 쪽 보기·나누기」 as the in-site view; log it.
- U2: Android Chrome opens a blob PDF in a tab or downloads it: owner phone test; both are acceptable.
- U3: iOS WebViews before 16.4 omit `Sec-Fetch-Site`, so /api/remove-bg answers 403 `origin` (a hypothesis for part of cloud-failed; the new `cloud-refused` code will show it). Do not change the origin check in this step.
- U4: Cloudflare Images monthly free transformations: not needed for the decision (the retry adds at most 1 per failure).

## Out of scope (to BUILD-LOG Known Gaps if they surface)
- Rendering PDFs inside /hwp-viewer/; HWPML support; old .doc/.xls conversion.
- An `<img>` decode fallback for id-photo; AVIF/HEIC decoding changes.
- Changing /api/remove-bg's origin check or workers/bg; server-side logs.
- Per-photo cap changes in jpg-to-pdf; the same auto-reduce in image-to-jpg.
- Stage tracking/retry in the hwp-viewer/hwp-to-pdf sessions (only the watchdog pause applies there).
- English (/en/) copy for these lines (none of these tools has an EN twin).
- usage.mjs beyond the FAIL_LABELS block; admin-view.mjs; legal.ts.

## Acceptance
- Every test above green on the 5 projects; all gates green; Richard "clear".
- After deploy, 7-day admin: 배경 지우기 success >= 85 %, HWPX→HWP success >= 85 %; HWP 보기 not-hwp split by family (-A codes); cloud-failed replaced by cloud-<kind>; timeouts carry a phase that tells engine from parse.
