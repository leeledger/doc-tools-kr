# Architect Brief — REQ1015 (HEIC 열기, PDF→JPG 알 수 없는 오류, 배경 지우기 점검, AI 유입, 딥링크 「해당 없음」)

Base: branch req-1015 = origin/main 807d8b8. Owner report 2026-10-15 (admin 10/8~10/15).
Copy rules: CLAUDE.md (no 브라우저/업로드/서버 in Korean copy, 문서딱 brand, every guide number sourced, permissive licenses only).

## Goal
iPhone HEIC photos open on PC/Android Chrome and Edge that have hardware HEVC (WebCodecs, no new dependency); HEIC copy stops over-promising until then; PDF→JPG "unknown" failures get a cause code and the dead-document retry loop is fixed; the admin counts AI-service visits and shows 「해당 없음」 for guides whose tool has no deep link.

## Findings (code + sources, 2026-10-15)
- F1 HEIC: src/lib/image/decode.ts:18-24 decodes only through createImageBitmap; a HEIC the platform cannot decode -> PhotoError 'heic'. Callers: image-to-jpg + id-photo (main thread), photo-compress (src/lib/image/photo.worker.ts:103), jpg-to-pdf (src/lib/pdf/images.worker.ts:48); pdf-sign, stamp-signature, remove-background map 'heic' too.
- F2 Native HEIF support (caniuse features-json/heif.json, fetched 2026-10-15): Safari 17+ (macOS) and iOS Safari 17+ = yes; Chrome, Edge, Firefox, Android Chrome, Samsung Internet = no. PC Chrome fails by design today.
- F3 WebCodecs HEVC (chromestatus feature 5153479456456704, fetched 2026-10-15, verbatim): "The codec is already available in WebCodecs (M130)" and "if it is available in hardware (we will not provide a software implementation)". So Chrome/Edge 130+ decode HEVC through VideoDecoder only where the GPU/SoC has an HEVC decoder.
- F4 Licenses: libheif and libde265 are LGPL (not allowed; heic2any, libheif-js, heic-decode, heic-to all wrap them). FFmpeg hevc = LGPL. The permissive software HEVC decoder that exists: libhevc (Ittiam; AOSP external/libhevc NOTICE = Apache-2.0; upstream github.com/ittiam-systems/libhevc v1.6.0; fetched 2026-10-15). Not built in this brief (D-H9, owner question).
- F5 Apple (support.apple.com/ko-kr/116944, fetched 2026-10-15, verbatim): 「설정을 연 다음 '카메라'를 탭합니다.」 「'포맷'을 탭한 다음 '높은 호환성'을 탭합니다.」; sharing by AirDrop/메시지/이메일 「…자동으로 JPEG 또는 H.264와 같이 호환성이 더 높은 포맷으로 공유될 수 있습니다.」; USB import 「포맷이 변환되지 않도록 하려면 설정을 열고 '앱' 및 '사진'을 차례로 탭한 다음 아래로 스크롤하여 '원본 유지'를 탭합니다.」 (the guide already cites this page).
- F6 PDF→JPG: src/tools/pdf-to-jpg/guards.ts:13-19 maps everything that is not CanvasError / OOM / 4 pdf.js names to 'unknown'. controller.ts:386-393 on any failure sets state 'ready' and keeps `opened` (same pdf.js doc + the shared worker of src/lib/pdf/inspect.ts:25-37). If the pdf.js worker or transport is gone (killed under memory pressure, phone tab backgrounded; "Worker was destroyed" / "Transport destroyed"), every retry calls doc.getPage on a dead doc and fails 'unknown' again. This fits 14 fails from 4 picks (3-4 retries per file). Fail events carry no ppi (o/v only on start; usage.mjs ONLY), so "all 96ppi" comes from start events: 96 is likely what users switched to while retrying. Fix = reopen on retry + stage codes so next week names the real cause.
- F7 Admin 「해당 없음」: NOT implemented. scripts/lib/usage.mjs:635-637 table 「안내 글에서 도구로」 always prints rate(a.dl, a.n), so HWP / 도장 / 누끼 / HEIC guides show 0%. REQ1014-C "Handoff to A" item 1 was never built. Small fix (Step 3).
- F8 Referrers: scripts/lib/visits.mjs:56 fetches top CHUNK_TOP=50 refererHost by visits; shapeVisits shows the top 10 via referrerLabel. Android apps arrive as package names (cf. REFERRER_LABELS 'com.docttak.app'), so AI apps do too.

## Decisions
- D-H1 Chosen HEIC path: our own permissive HEIF container parser (TypeScript) + platform HEVC decode via WebCodecs VideoDecoder. Order in decodeImage: native createImageBitmap first (unchanged; Safari/iOS keep the current path) -> only if sniff.format === 'heic' and native fails with a non-RangeError -> lazy import('./heif/decode-heif') -> WebCodecs. No new npm dependency, no codec shipped, no patent-pool exposure (the licensed decoder of the platform does the work).
- D-H2 Coverage (say exactly this, never stronger): iPhone/iPad iOS 17+ and Mac Safari 17+ = native (today). Chrome/Edge 130+ on Windows, macOS, Android, ChromeOS WITH hardware HEVC = new path. Not covered: PCs/phones without hardware HEVC (old GPUs, many VMs / remote desktops), Firefox (no claim), iOS < 17, Chrome < 130. Those keep the interim message. Real coverage is measured by the sub-codes (D-H6) for 7 days before any copy says more.
- D-H3 Any failure inside the HEIF fallback is PhotoError 'heic' (user sees the HEIC message), never 'corrupt': a valid HEIC we cannot read must not be called 손상. PhotoError gains optional `readonly sub?: HeicSub`, HeicSub = 'nocodec' | 'parse' | 'unsup' | 'decode' | 'timeout'.
- D-H4 Parser scope (iPhone + Samsung 고효율 subset): ftyp; meta (hdlr 'pict', pitm, iinf/infe v2-3, iloc v0-2 incl. construction_method 0 and 1 (idat), base_offset, multiple extents concatenated); iref 'dimg' (grid); iprp/ipco + ipma (v0/v1, flags&1 = 15-bit index): hvcC, ispe, irot, imir, clap, colr (nclx|prof), pixi; item types 'hvc1' and 'grid' (ImageGrid: version, flags&1 32-bit sizes, rows-1, cols-1, output w/h). Anything else as primary ('av01', 'tmap' gain map, 'iovl', 'iden', 'unci') -> 'unsup'; aux items (alpha/depth 'auxl', thumbnails 'thmb', Exif) ignored. All reads bounds-checked; out of range -> 'parse'. Max 256 tiles and output <= 100,000,000 px, else 'unsup'.
- D-H5 Decode: codec string from hvcC per ISO/IEC 14496-15 Annex E: hvc1.{none|A|B|C}{profile_idc}.{compat flags bit-reversed, hex}.{L|H}{level_idc}[.constraint bytes hex, trailing zero bytes dropped]; description = hvcC box payload; codedWidth/Height = tile ispe. VideoDecoder missing, or isConfigSupported(...).supported !== true -> 'nocodec'. If profile_idc = 3 (Main Still Picture) is refused and its Main compat flag (bit 1) is set, retry the check with profile 1 in the string (Step 5 spike decides whether this stays). Each tile = one EncodedVideoChunk({ type: 'key', timestamp: tileIndex, data }) (iloc bytes are length-prefixed NALs, as hvc1 expects). Feed all tiles, flush(). In output: draw the frame at its grid rect and frame.close() at once (held frames stall the decoder). Map frames to tiles by timestamp, never arrival order. A tile missing after flush -> 'decode'; decoder error -> 'decode'; whole decode > 20 s -> 'timeout'. decoder.close() in finally. One HEIF decode at a time per JS context (module-level promise chain): hardware decoder instances are limited.
- D-H6 Usage fail codes (additive FAIL_LABELS block "REQ1015"): heic-nocodec 「HEIC: 이 기기에 여는 기능 없음」, heic-parse 「HEIC: 파일 구조를 읽지 못함」, heic-unsup 「HEIC: 지원하지 않는 HEIC 종류」, heic-decode 「HEIC: 그림 풀기 실패」, heic-timeout 「HEIC: 시간 초과」. Plain 'heic' stays valid (old builds). Every call site that sends usage code 'heic' sends heicUsageCode(err) instead (new helper in src/lib/image/messages.ts: heic-SUB, or plain heic with no sub). Workers post the sub in their error message (images.worker.ts:97 and the photo.worker.ts error post).
- D-H7 Geometry: compose tiles onto an OffscreenCanvas of the grid output size (tiles past the output edge are cropped), then clap, then irot (anticlockwise 90 deg x angle), then imir (ISO/IEC 23008-12 order clap -> irot -> imir; Bob confirms the imir axis meaning from the spec text or libheif docs, not from memory, and pins it in a unit test). HEIF EXIF orientation is ignored: irot/imir are authoritative and the canvas result carries no EXIF, so nothing rotates twice. With maxLongEdge and a larger image: draw each tile scaled into the capped canvas using integer rects from cumulative edges (x0 = round(c*tw*s), x1 = round((c+1)*tw*s)) so tiles abut with no gap; else full size. Return an ImageBitmap (createImageBitmap(canvas)) in the same Decoded shape (sourceWidth/Height = oriented natural size; capped set).
- D-H8 Colour: rely on the colour space the decoder attaches to each frame (VUI) when drawn to an sRGB 2d canvas. ICC 'prof' (iPhone Display P3) is not applied, so P3 photos may look slightly less saturated. Known Gap, not a blocker.
- D-H9 OWNER QUESTION (not built): devices without hardware HEVC need a software decoder. The only permissive one is libhevc (Apache-2.0), compiled to wasm (precedent: qpdf wasm in src/lib/pdf/qpdf). The license rule allows it; open points are HEVC patent-pool exposure of shipping a software HEVC decoder, about 0.5-1 MB lazy wasm, and maintenance. Recommendation: decide after 7 days of heic-nocodec counts from Step 6. LGPL exception (libheif/libde265): recommend NO (libhevc makes it unnecessary).
- D-H10 Interim copy (Step 1) ships before any decoder work. Only claims sourced in F2/F5 or measured by our own tool. No 브라우저 in Korean copy; the app names 크롬·엣지 are allowed. The e2e substring 「아이폰 설정 > 카메라 > 포맷에서 「높은 호환성」」 (tests/e2e/image-to-jpg.spec.ts:218) stays in the message.
- D-P1 PDF→JPG stage codes: run() tracks stage 'page' | 'render' | 'encode' | 'stamp' | 'zip'. runErrorCode(err, isOom, stage): canvas / oom / corrupt as today; worker gone (message matches /worker was (destroyed|terminated)|transport destroyed|worker is being destroyed/i) -> 'worker-gone'; else unknown-STAGE (all match ^[a-z-]{1,24}$). Bob checks the exact pdf.js 6.3.289 messages in node_modules/pdfjs-dist/build/pdf.mjs and pins them in the test. User text for worker-gone and unknown-* = MESSAGES.unknown. FAIL_LABELS: worker-gone 「PDF 읽는 기능이 멈춤」, unknown-page 「알 수 없음: 쪽 읽기」, unknown-render 「알 수 없음: 쪽 그리기」, unknown-encode 「알 수 없음: JPG 만들기」, unknown-stamp 「알 수 없음: 해상도 기록」, unknown-zip 「알 수 없음: ZIP 만들기」.
- D-P2 PDF→JPG fix: after any non-cancel failure set stale = true. The next run() with stale first reopens: await opened.close(), then openPdf(bytes, lastPassword) (lastPassword = the password that unlocked this file; controller closure only; cleared on reset, new file and close; never tracked or logged). For worker-gone, inspect.ts exports resetPdfJsWorker() (destroys the shared PDFWorker, pdfjsPromise = null) and the reopen calls it first. A worker-gone failure also retries the run once automatically (reopen + same pages + same ppi) before the alert; the usage fail is sent only if that retry fails (code of the final failure). No other behaviour change.
- D-B1 배경 지우기: no code change (no concrete cause). Check plan below.
- D-A1 AI referrers: scripts/lib/visits.mjs exports AI_SERVICES (label -> hosts and Android package names) and aiServiceOf(host) (lowercase; exact host or dot-suffix match; package names exact).
  ChatGPT = chatgpt.com, chat.openai.com, com.openai.chatgpt. Perplexity = perplexity.ai, ai.perplexity.app.android. Gemini = gemini.google.com, bard.google.com, com.google.android.apps.bard. Copilot = copilot.microsoft.com, copilot.cloud.microsoft, com.microsoft.copilot. Claude = claude.ai, com.anthropic.claude. 기타 AI = chat.deepseek.com, grok.com, wrtn.ai, clova-x.naver.com, poe.com, you.com, chat.mistral.ai, meta.ai.
  Not matched on purpose: google.com, bing.com, naver.com, openai.com (search or company sites, not AI answers).
- D-A2 shapeVisits adds ai = { total: { visits, pageViews }, rows: [{ label, visits, pageViews }] (visits desc, zero rows omitted), partial } computed from all cur.referrers rows (up to 50) before the top-10 slice. partial = cur.referrers.length >= CHUNK_TOP. referrerLabel shows an AI host as LABEL (host). No new GraphQL node (a refererHost_in filter is unverified against the API; Known Gap).
- D-A3 Admin: new section s-ai 「AI 서비스에서 들어옴」 right after s-referrers, head [서비스, 방문, 페이지뷰], last row 「합계」; empty -> the existing empty-table text; partial -> muted note 「들어온 곳 상위 50곳 안에서 센 값입니다.」. Weekly report (scripts/ops/growth.mjs:99-120): visits.ai carried, one line 「- AI 서비스에서 들어옴 7일: N회 (ChatGPT n, Perplexity n …)」 (「… 0회」 when none). Additive: every existing section, label and number unchanged.
- D-D1 「해당 없음」: scripts/lib/usage.mjs adds DEEP_LINK_TOOLS = [id-photo, photo-compress, pdf-compress]; in the table 「안내 글에서 도구로」 the last cell = rate(a.dl, a.n) when the tool is in DEEP_LINK_TOOLS, else 해당 없음. A unit test holds DEEP_LINK_TOOLS equal to Object.keys(DEEP_PARAM) of src/lib/ui/deeplink.ts (REQ1014-C rule: no hand-kept list without the test).

## Flow: HEIC decode (decodeImage after D-H1)
```
file + sniff --> createImageBitmap (native)
                   | ok ------------------------------------> Decoded (unchanged path)
                   | RangeError -> rethrow (oom as today)
                   | other error
                   v
        sniff.format is heic? --no--> PhotoError corrupt                  (unchanged)
                   | yes
                   v
        import ./heif/decode-heif  --load fail--> heic / nocodec
                   v
        parseHeif(bytes) --bad box, bounds--> heic / parse ; unsupported kind --> heic / unsup
                   v
        VideoDecoder present + isConfigSupported(hvc1...) --no--> heic / nocodec
                   v
        decode tiles (key chunks, ts = index) -> draw at rect -> frame.close()
             | error, missing tile --> heic / decode ; over 20 s --> heic / timeout
                   v
        clap -> irot -> imir -> (cap) -> ImageBitmap --> Decoded
```

## Flow: PDF→JPG run (after D-P1, D-P2)
```
run() --stale?--yes--> [worker-gone: resetPdfJsWorker()] -> close + openPdf(bytes, lastPassword) --fail--> same mapping as openWith (corrupt / oom / engine)
   | no                                                       | ok
   v                                                          v
 per page: getPage[page] -> render[render] -> toBlob[encode] -> setJfifDpi[stamp] -> zip.add / finish[zip]
   ok  -> finish(), stale = false
   err -> cancelled? return
       -> code = runErrorCode(err, isOom, stage); stale = true
       -> worker-gone and not yet retried? reopen + rerun once
       -> usageFail(code, process) + alert
```

## Failure modes
| Path | Realistic failure | Handling | User sees |
|---|---|---|---|
| HEIF parse | iOS adds a box we do not know / gain-map primary | unsup or parse -> heic | HEIC message (clear) + sub-code counted |
| isConfigSupported | PC without hardware HEVC, VM, remote desktop | nocodec | HEIC message; counted (feeds D-H9) |
| MSP profile | iPhone hvcC profile 3 refused by the Windows decoder | Step 5 spike decides the profile-1 retry | HEIC message if refused |
| VideoDecoder hang | no output (GPU reset, codec reclaimed in a background tab) | 20 s timeout, close() in finally | HEIC message; heic-timeout |
| Frame leak | frames not closed -> decoder stalls after N tiles | close in the output callback; unit test asserts every fake frame closed | (prevented) |
| Two photos at once | second hardware decoder refused | module-level serial queue | (prevented) |
| 48 MP HEIC on Android | canvas out of memory | cap path draws scaled tiles; RangeError -> oom as today | existing OOM message |
| Scaled tiles | 1 px gaps or overlaps | integer cumulative rects; unit test | (prevented) |
| Rotation | irot + EXIF applied twice | canvas output has no EXIF; e2e asserts rotated dims and quadrant colours | (prevented) |
| Lazy chunk load fails | offline / deploy swap | caught -> heic / nocodec | HEIC message (it lists what to do) |
| PDF dead worker | worker killed between runs | stale -> reset worker + reopen; one auto-retry | success, or the unknown message once |
| PDF reopen fails | OOM while reopening | openWith mapping | that file message |
| lastPassword kept | memory exposure | closure only, cleared on reset/new file; never tracked | none |
| AI host below rank 50 | many referrers | partial note | admin note (clear) |
| Deep-link list drift | a new deep-link tool | equality unit test fails | none |

No row is no test + no handling + silent.

## Test map
HEIC (Step 6):
- [GAP -> unit] tests/unit/heif-parse.test.ts (new) on bytes from tests/helpers/heif-build.ts (new; builds ftyp/meta/iinf/iloc/iprp/ipma/iref/idat/mdat): single hvc1 item; 2x2 grid with output crop; iloc v1/v2 + base_offset + 2 extents; construction_method 1 (idat); ipma 15-bit index; irot 1/3 + imir 0/1; clap; truncated box -> parse; av01 / tmap primary -> unsup; 257 tiles -> unsup.
- [GAP -> unit] codec string: 3 hvcC vectors (Main, MSP, tier H) incl. bit-reversed compat flags and trailing-zero trimming; expected strings worked out by hand in the test comment from Annex E.
- [GAP -> unit] layout: tileRects(grid, scale) abut exactly (widths sum to the canvas width, no overlap) at scale 1, 0.37, 0.5; orientation transform for all 8 irot x imir cases maps the 4 corners correctly (pure).
- [GAP -> unit] decode-heif with an injected fake decoder factory: shuffled output order mapped by timestamp; every frame closed; missing tile -> decode; hang -> timeout (fake timers); isConfigSupported false -> nocodec; serial queue (second call starts after the first settles).
- [GAP -> unit] heicUsageCode: each sub -> heic-SUB, none -> heic; FAIL_LABELS holds all five (usage.test.ts).
- [TESTED, must stay green] tests/e2e/image-to-jpg.spec.ts:217-218 fake.heic -> message contains 「아이폰 설정 > 카메라 > 포맷에서 「높은 호환성」」 (in Playwright Chromium the fallback ends in parse or nocodec -> same message).
- [GAP -> e2e] image-to-jpg (chromium): page.addInitScript installs a fake VideoDecoder (isConfigSupported -> supported; output = new VideoFrame(OffscreenCanvas filled with one colour per timestamp)); pick a synthesized 2x2 grid HEIC with irot=1 -> the result JPG has the rotated dims and each quadrant the expected colour (4 sampled pixels). Second case: VideoDecoder deleted -> HEIC message. (addInitScript does not reach workers: the worker paths of jpg-to-pdf / photo-compress are covered by the unit fake + the local gate.)
- [GAP -> local gate] real decode on owner PC Chrome (Playwright channel chrome, or chrome-cdp :9333) and one Android Chrome, corpus HEICs via regress:photo (local only, never committed). scripts/regress/photo.mjs:114 special check becomes: where isConfigSupported is true the HEIC must give a result with dims = oriented ispe; else heic.
- [Regression] tests/unit/decode-fallback.test.ts (REQ1014-B D11) unchanged and green; no diff in decode.ts outside the heic branch.
PDF→JPG (Step 4):
- [GAP -> unit] tests/unit/pdf-to-jpg.test.ts: runErrorCode per stage; worker-gone for each pinned pdf.js message; CanvasError / OOM / corrupt unchanged; every result matches CODE_RE.
- [GAP -> unit] pure retry helper: stale -> reopen; worker-gone retries once only; cancel never retries.
- [GAP -> e2e] tests/e2e/pdf-to-jpg.spec.ts: two consecutive 작게(96) runs succeed; cancel mid-run then run again at 작게 succeeds. No deterministic worker kill without a production test hook is known; if Bob finds one, add it, else the reopen branch stays unit-only (log it).
- [Regression] existing pdf-to-jpg.spec cases (password file, range errors, 150/300) green.
Admin (Steps 2-3):
- [GAP -> unit] visits.test.ts: aiServiceOf for every listed host, www. prefix, upper case, package names; google.com / naver.com / docttak.com -> null; shapeVisits ai totals/rows/partial; referrerLabel(chatgpt.com) = ChatGPT (chatgpt.com); other referrer rows unchanged.
- [GAP -> unit] admin-view.test.ts: s-ai with rows + 합계; empty; partial note; labels escaped.
- [GAP -> unit] weekly report line (Bob finds the existing summaryBody test).
- [GAP -> unit] usage.test.ts: DEEP_LINK_TOOLS equals Object.keys(DEEP_PARAM); hwp-to-pdf arrival row shows 해당 없음, id-photo shows a percent.
Copy (Step 1):
- [TESTED] check-dist / postbuild copy rules (brand, 브라우저 ban, unsourced numbers) and check:quotes --exact.
- [GAP -> unit/dist] dist assertion: /guide/heic-to-jpg/ and llms.txt no longer contain the unconditional 「HEIC 사진을 고르고 변환하기를 누르면 JPG로 저장되고」.

## Build order (one commit per step; each deployable alone)
Step 1 — HEIC interim copy (ships first, own deploy).
- src/lib/image/messages.ts:42 heic -> 「아이폰 사진(HEIC)을 이 기기에서 열지 못했습니다. 아이폰에서 이 페이지를 열어 바꿔 보세요. 앞으로 찍을 사진은 아이폰 설정 > 카메라 > 포맷에서 「높은 호환성」을 고르면 JPG로 저장됩니다.」 Grep every other copy of the HEIC message (image-to-jpg messages.ko.ts, jpg-to-pdf ERRORS, pdf-sign ERRORS, stamp / bg / id-photo) and keep them identical.
- src/data/tools.ts FAQ answers :283, :493, :521, :592, :628 -> 「아이폰 사진(HEIC)은 기기에 따라 열리지 않습니다. PC의 크롬·엣지에서는 열리지 않는 경우가 많아요. 그럴 때는 아이폰에서 이 페이지를 열어 바꾸거나, 아이폰 설정 > 카메라 > 포맷에서 「높은 호환성」을 골라 앞으로 찍을 사진을 JPG로 저장하세요.」 (:521 keeps its last sentence about only the failing photos being marked). :514 summary (also feeds llms.txt) -> 「PNG·WebP·AVIF와 아이폰 사진(HEIC)을 JPG로 바꿉니다. HEIC는 기기에 따라 열리지 않을 수 있습니다. 여러 장을 한 번에 바꿀 수 있습니다.」 Titles, descriptions, keywords unchanged (search terms; traffic rule).
- src/content/guides/heic-to-jpg.md: answer -> 「아이폰이나 맥에서 사진 JPG 변환을 열고 HEIC 사진을 고르면 JPG로 바꿀 수 있어요. PC 크롬·엣지에서 열리지 않으면 아이폰에서 바꾸고, 앞으로 찍을 사진은 카메라 포맷을 「높은 호환성」으로 바꾸면 JPG로 저장돼요.」 New short section after the steps 「PC에서 HEIC가 열리지 않을 때」 with 3 bullets: 아이폰에서 이 페이지를 열어 바꾸기; AirDrop·메시지·메일로 보내면 JPEG로 바뀌어 보내질 수 있음 (existing quote); PC로 가져올 때 JPEG로 바뀔 수 있고 「원본 유지」를 고르면 바뀌지 않음 (add the F5 USB quote as a source, retrieved 2026-10-15). Line 58 stays. updated 2026-10-15. No version numbers (iOS 17, Chrome 130) on the page: no quotable source text for them (unsourced-number gate). Never claim the iPhone always works; only 바꿔 보세요 wording.
- src/i18n/en/tools/image-to-jpg.ts:16 -> [This device cannot open iPhone photos (HEIC) here; Chrome and Edge on a PC often cannot. Open this page on the iPhone and convert there, or on the iPhone go to Settings > Camera > Formats and choose Most Compatible for new photos.] src/i18n/en/tools.ts:105, :108, :114 (description, summary, FAQ): same honesty (HEIC opens on iPhone and Mac Safari; Chrome and Edge on a PC often cannot open it yet). Keep HEIC to JPG in title and h1.
- Gate: check:quotes --exact; astro check; vitest; check-dist default + cloud; e2e image-to-jpg + en + site (chromium, mobile-chrome).

Step 2 — admin AI referrers: scripts/lib/visits.mjs (AI_SERVICES, aiServiceOf, shapeVisits.ai, referrerLabel), scripts/lib/admin-view.mjs (s-ai after s-referrers), scripts/ops/growth.mjs (one line), tests. No GraphQL change.

Step 3 — 해당 없음: scripts/lib/usage.mjs (DEEP_LINK_TOOLS + the arrivals cell), usage.test.ts.

Step 4 — PDF→JPG codes + reopen: src/tools/pdf-to-jpg/guards.ts (stage param, worker-gone, retry helper), src/tools/pdf-to-jpg/controller.ts (stage tracking, stale, lastPassword, reopen, one auto-retry), src/lib/pdf/inspect.ts (export resetPdfJsWorker; resetPdfJs callers unchanged), scripts/lib/usage.mjs FAIL_LABELS (6 codes), tests.

Step 5 — HEIC spike (no product code; GO / NO-GO). spikes/heic-webcodecs/ in the main checkout (not built, not shipped): parse real iPhone HEICs (owner supplies 3: portrait, landscape, newest iPhone; plus one Samsung 고효율 if available; local only, never committed); log hvcC profile/level, tile count, irot/imir/clap, isConfigSupported on owner PC Chrome (chrome-cdp :9333 or Playwright channel chrome) and one Android Chrome, decode ms, visual check against the same photo received as JPEG by mail (PSNR >= 30 dB after resize). Numbers into BUILD-LOG 「REQ1015 spike」. GO if PC Chrome decodes at least 2 of 3 iPhone files correctly. NO-GO -> Step 6 not built, Step 1 copy stays, D-H9 goes to the owner with the numbers.

Step 6 — HEIC WebCodecs decode (GO only). New src/lib/image/heif/parse.ts (pure), codec.ts (pure), layout.ts (pure rects + orientation), decode-heif.ts (WebCodecs + OffscreenCanvas; decoder factory injectable; serial queue). Edit src/lib/image/decode.ts (heic branch only), src/lib/image/messages.ts (PhotoError.sub, heicUsageCode), src/lib/image/photo.worker.ts + src/lib/pdf/images.worker.ts (post sub), every call site that sends usage heic (grep heic under src/tools), scripts/lib/usage.mjs FAIL_LABELS, scripts/regress/photo.mjs:114, tests. Flag: confirm import() inside the workers stays a lazy chunk; if Vite inlines it, accept only if each worker grows <= 6 KB gzip, else report numbers and stop.

Step 7 — copy after the decoder (not in this build): after 7 days of Step 6 data (heic-* vs image-to-jpg success on desktop Chrome), soften the Step 1 lines in the same files only as far as the numbers support.

## 배경 지우기 check plan (D-B1, no code)
- From 2026-10-21 (7 full days after the REQ1014-B deploy) read remove-background usage filtered to builds at or after the REQ1014-B build id (b, blob12) so pre-deploy rows are excluded.
- Compute start, success, fail by code + phase + device + br, and start - success - fail = left without finishing.
- Act only on a concrete pattern: one cloud-* code >= 40 % of fails -> brief for that cause (cloud-timeout: copy size or time limit; cloud-server: provider; cloud-network on phones: look at the on-device fallback rate); engine / model-corrupt on the device path -> vendor files and cache; left-without-finishing >= 50 % of starts -> waiting/progress copy brief. Otherwise no change.
- Same read for pdf-to-jpg (worker-gone vs unknown-*) and image-to-jpg (heic-*) 7 days after Steps 4 and 6.

## Gates (every code step)
astro check 0 errors; vitest green; check:licenses OK (no new dependency in any step); check-dist OK default + cloud flag-on; precache <= 450 KB (report before/after); initial JS of /image-to-jpg/, /jpg-to-pdf/, /photo-compress/, /id-photo/, /pdf-to-jpg/ unchanged within 0.2 KB gzip (HEIF code lazy only); HEIF lazy chunk <= 8 KB gzip; e2e chromium + mobile-chrome for touched tools + usage.spec (cloud-chromium) + site; no-upload fixture green on every spec (no new network request).

## Out of Scope (-> BUILD-LOG Known Gaps if they surface)
- libhevc wasm or any software HEVC decoder (D-H9, owner).
- ICC (Display P3) colour management for HEIC; HEIC alpha, depth, HDR gain map, image sequences / Live Photo.
- A refererHost_in GraphQL node for exact AI counts below rank 50.
- utm_source=chatgpt.com as a UTM_SOURCES value (help.openai.com returned 403; add later with a source).
- 배경 지우기 code changes; REQ1014-C D5/D6.
- Tool titles, descriptions and keywords that contain HEIC.

## Acceptance
- Step 1 live: /guide/heic-to-jpg/, /image-to-jpg/ FAQ, /en/image-to-jpg/, llms.txt and the HEIC error carry the D-H10 wording; check:quotes exact passes.
- Steps 2-3 live: admin shows 「AI 서비스에서 들어옴」 and 해당 없음 on HWP / 도장 / 누끼 / HEIC guide rows; weekly report has the AI line.
- Step 4: unit + e2e green; the admin fail table shows stage codes for pdf-to-jpg from the new build.
- Step 5: numbers and GO / NO-GO logged.
- Step 6 (GO only): owner PC Chrome converts the 3 iPhone HEICs on /image-to-jpg/, /jpg-to-pdf/, /photo-compress/, /id-photo/ (local gate); all CI gates green; heic-* codes appear in the admin.
