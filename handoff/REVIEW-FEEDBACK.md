# Review Feedback — TOOLS5 U0+U1
Date: 2026-10-08
Ready for Builder: YES (after round 2)

## Must Fix
- src/tools/image-to-jpg/controller.ts:222, 374-376, 441-443, 451-455 (confidence: 8/10) — Errors from the conversion run (encoder / canvas / oom / unknown) stay on the row for good: `markError(e, code, …)` in run(), and `ready = () => entries.filter((e) => !e.checking && e.error === null)`. Nothing ever sets `error` back to null (the only write is line 375). The encoder message says 「이 형식으로 저장하지 못했습니다. 다른 저장 형식을 골라 다시 해 주세요.」 but the user can't do that. If every row fails (for example the WebP worker doesn't load), run() returns to 'listing' with `n === 0`, so the run button is disabled ("변환하기"). Changing 저장 형식 does not bring the rows back. The only way out is to remove each photo and pick it again. Cancel leaves the same mark on rows that failed before the cancel. — Keep only the parse-phase errors (heic, not-image, corrupt, empty from checkEntry) as permanent. Clear the run-phase errors (canvas, encoder, oom, unknown, and heic/corrupt raised during the run) when a new run starts and when 저장 형식 or 화질 changes, so the next 변환하기 includes those rows again. Add an e2e test: force the WebP fallback to fail, switch to JPG, and check that the row converts.

## Should Fix
- src/content/guides/heic-to-jpg.md:46, 66 (confidence: 7/10) — 「Apple 안내에 따르면 … AirDrop, 메시지, 이메일로 보낼 때 JPEG로 바뀌어」 credits Apple for naming AirDrop / 메시지 / 이메일, but none of the five quoted sources says that. The quote at line 30 only says 「수신 기기에서 최신 미디어 포맷을 지원하지 않는 경우, … 자동으로 JPEG … 공유될 수 있습니다.」 — Either add the Apple KR sentence that names those channels as a verbatim `sources` quote (check:quotes), or take the three channel names out of both sentences.
- src/tools/image-to-jpg/controller.ts:457-470 (confidence: 5/10, verify) — With several photos, each result is kept twice: once as the row's Blob (for that row's 내려받기) and again inside the ZIP Blob. The ZIP step also copies each Blob into the JS heap (`await m.blob.arrayBuffer()`). At the phone limit of 50 photos up to 8,192 px, this could be several hundred MB on iOS. This is the price of the per-row download the brief asks for. Log it as a known gap and have the owner check it on a device. No code change now.
- src/lib/ui/device.ts:7-9 (pre-existing; confidence: 4/10, appendix) — An iPad Pro 12.9 has `screen.width` 1024, so it gets 'desktop' caps (50 MP). That is above the iPad Safari canvas limit. The row then gets the canvas error message, not a silent blank image, because `ctx` null leads to ConvertError('canvas'). pdf-to-jpg has the same issue. Log it, don't fix it here.

## Escalate to Architect
- None. Answers to Bob's open questions: (1) The `renderPageThumb(doc, index, maxW, maxH = Infinity)` signature is justified. With maxH at Infinity, `thumbCssWidth` returns maxW, so inspect() and pdf-compress get the same width as before. U2 can pass maxH. (2) The WebP fallback as a lazy worker is the right choice: it avoids a second wasm copy and is checked by check-dist (11.2 KB). (3) jpg-to-pdf sending one heic event per photo: the brief says "check, do not change", so logging it is correct. Arch decides whether to schedule the fix. (4) Problem rows not blocking the run and (5) encoding on the main thread both follow brief decisions 6-8.

## Cleared
U0 changes no behaviour: StoredZip and dedupeNames are verbatim moves, the fitsCaps/fitWithinCaps arithmetic is the same as pageScale's, the renderPageThumb call sites give the same widths, and no old symbol is still referenced. In U1 I checked: the format rules, the strip-only rule (ICC kept, EXIF/XMP/trailers dropped), orientation on decode, the white fill plus transparency note for JPG only, alpha kept for PNG/WebP, the WebP type check and worker fallback, caps clamping with a row note, the batch limits from planAdd, cancel via runId, one `fail c=heic p=parse` per batch through oncePerCode, usage payloads without file data, registration/SW/precache lists, check-dist budgets, page copy and FAQ numbers from limits. All of it passed apart from the items above. Unit tests image-to-jpg, tools5-shared and pdf-to-jpg: 48 passed.

---

# Review Feedback — TOOLS5 U1 round 2
Date: 2026-10-08
Ready for Builder: YES

## Must Fix
- None.

## Should Fix
- src/tools/image-to-jpg/controller.ts:396 (confidence: 5/10, appendix) — After a partly successful run the page is in 'done' and the options are hidden. A row that failed there still says 「다른 저장 형식을 골라 다시 해 주세요」, but the way back is 처음으로 and picking the photos again. This matches the other tools' done flow, so no change is needed. Note it in BUILD-LOG if the owner asks.

## Escalate to Architect
- None. Bob's question: yes, keep the run button on for the same format after every row failed. A failed worker load can be temporary, and the error copy still suggests another format.

## Cleared
Round 1's Must Fix is resolved. `runError` marks only errors from the run (markError(…, true) at :467). Errors found when photos are first checked stay permanent (checkEntry :407-424, default false). `clearRunErrors()` runs at the start of run() (:440) and on any 저장 형식 / 화질 change in 'listing' (:394-400, wired at :591). Rows marked before a cancel are counted by `runnable()` and cleared by the next run. The hint shows only for errors from the first check. The new e2e test covers WebP fail → same-format retry button enabled → JPG converts. heic-to-jpg: the share quote is now Apple's full sentence naming AirDrop / 메시지 / 이메일, so lines 46 and 66 are sourced. check:quotes reports 148 verbatim.
