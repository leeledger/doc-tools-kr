# Architect Brief — Step 5: HWP PDF 변환 `/hwp-to-pdf/`

Author: Arch. Date: 2026-09-30.
Status: **staged**. The orchestrator promotes it after Step 4 ships (release order in BUILD-LOG). Step 3, Polish P and Step 4 artefacts are assumed present: `src/lib/ui/engine-error.ts`, the service worker, preload-on-interaction, carry-forward and `deploy-manifest.json`.
The program plan and the §0 non-negotiables, §3 quality gates, §4 legal texts, §5 SEO rules and §6 handoff protocol are in ARCHITECT-BRIEF.md. All of them apply unchanged.
Evidence (local, git-ignored):
- `spikes/hwp/SPIKE-HWP.md`: "Corpus v2 (100+)" supersedes v1 §1–§9
- `spikes/hwp/convert.html`: the reference wrapper
- `spikes/hwp/scripts/{features,gate,recall2,compare}.py`
- `spikes/hwp/results/{features,run.bundled,recall2.bundled,compare.bundled,classes.v2,gate.v2,mobile}.json`

## Gate result (input to this brief)
- **120-file corpus:** 6/120 broken = **5.0 %** (Wilson 95 % CI 2.3–10.5 %). Verdict: **SHIP converter, with guards** (orchestrator decision).
- **With the routing guard:** the converter set is 101 files with **2 broken (2.0 %, CI 0.5–6.9 %)**: adm06 (R7) and nt08 (R6). The guarded-out set is 19 files, 4 of them broken.
- **Guarded-out keys** (the parity target for our TS scan): `adm04 adm07 adm11 adm16 adm19 adm28 adm29 adm30 law09 law14 law16 law17 law19 law20 law21 nt01 nt02 nt03 nt04`.

## Goal
`/hwp-to-pdf/` opens an HWP 5.x, HWP 3.0 or HWPX file in the browser and shows a paged preview. It saves the file as a vector PDF with selectable text through the browser's print dialog ("PDF로 저장").
- Risky documents open viewer-first.
- Documents over the device caps are viewer-only.
- Nothing is uploaded.

Demand (Naver, per month):

| Keyword | Searches |
|---|---|
| hwp pdf 변환 | 11,930 |
| 한글파일pdf로변환 | 8,330 |
| hwp 뷰어 | 3,560 |
| 한글파일 pdf 변환 | 1,340 |
| hwpx 변환 | 840 |
| hwpx 열기 | 130 |

## Flow
```
file picked / dropped (main, one file)
  │ size > HARD (desktop 150 MB │ mobile 25 MB) ─────────────────────────► error too-large (numbers)
  │ head 64 B: sniff.ts  CFB │ PK │ "HWP Document File V3" │ <?xml…HWPML ─► unsupported │ else ─► not-hwp
  │ sessionStorage 'hwp-inflight' = {bytes}  (cleared on ready/error/reset)
  ▼ engine load (worker + /vendor/rhwp/0.8.6/rhwp_bg.wasm, progress over the build-time raw size)
  │ load/compile fails ─► engine-error helper (code engine; offline/new-deploy/generic copy, 새로고침)
worker: open(bytes)
  1 scan    features.ts: CFB → FileHeader (signature, flags) → BodyText records
                         ZIP dir → mimetype, section*.xml, BinData sizes │ HWP3: format only
            CFB w/o HWP signature, zip w/o application/hwp+zip ─► not-hwp
            password flag ─► error password (rhwp never called)
            post 'scanned' {format, equations, textboxes, imageBytes, distribution}
  2 parse   new HwpDocument(bytes)   throws ─► distribution flag ? distribution : corrupt
                                     RangeError / out of memory ─► oom
            post 'parsed' {pages, pageInfos[], wasmBytes = memory.buffer.byteLength, measureCalls}
  ▼ main: route(device, fileBytes, pages, wasmBytes, imageBytes, equations, textboxes)
  ├─ any cap exceeded ──────────────────────────► VIEWER-ONLY  (lazy window, no print, reason + numbers)
  ├─ pages ≥ 100 │ equations > 0 │ textboxes ≥ 3 ─► VIEWER-FIRST (lazy window, warning, [그래도 PDF로 저장])
  └─ else ──────────────────────────────────────► CONVERT      (full render now, [PDF로 저장])
render page i (worker): renderPageSvg(i) → rewriteFonts → scopeIds('p{i}_') ; getPageTextLayout(i).runs
                        (getPageText is never called)                   post 'page' {i, svg, runs}
main, per page: DOMParser(image/svg+xml) → sanitize → ensureViewBox → dropCellClips → fitFillImages
                → adopt into <div class="page p{W}x{H}" role="group" aria-label="{i+1}쪽"> → addSpaces(runs)
                → downscaleImages (data: → blob:, ≤ 200 dpi at the printed size)
full render (CONVERT, or VIEWER-FIRST after [그래도 PDF로 저장]): pages 0..n-1 in order, progress "N/M쪽",
                cancelable ; then terminate the worker (frees WASM) ; one @page rule per distinct size
[PDF로 저장]: await document.fonts.ready → title := base name → window.print()
              → afterprint: restore title, show the "저장이 안 됐다면" note + guidance
watchdog: no worker message for 90 s ─► terminate ─► error timeout
worker crash (onerror / messageerror) ─► oom
page load with 'hwp-inflight' still set ─► notice "이전 문서가 너무 커서 브라우저가 멈췄습니다…" (once, then cleared)
```

## Build Order

### 0. Preparatory (behaviour-neutral)
- **No refactor of existing tools.** Confirm every Step 1–4 test is green before adding code, and paste the counts in REVIEW-REQUEST.
- **Network guard:** `FETCH_ALLOWLIST` gains exactly `lib/hwp/wasm-browser.ts`, with the comment "rhwp wasm, own origin". Update the exact-list assertion.
- **New static unit test** `tests/unit/source-bytes.test.ts`: no file under `src/` or `scripts/` contains a C0 control byte other than TAB, LF or CR.
  - This is the root cause of the spike's dead word-boundary regex (a literal 0x08 byte) and of the Step 3 NUL byte.

### 1. Dependencies and assets (exact pins; log each in BUILD-LOG with its license before use)
- **`@rhwp/core@0.8.6` (MIT).**
  - Record the crate licences from upstream THIRD_PARTY_LICENSES.md in `licenses/third-party/rhwp/` and SOURCES.md. They are MIT, Apache-2.0, BSD-3, Zlib, ISC and Unicode-DFS, all allowlisted.
- **wasm vendoring:** `scripts/vendor-rhwp.mjs` (prebuild) copies `node_modules/@rhwp/core/rhwp_bg.wasm` to `public/vendor/rhwp/0.8.6/rhwp_bg.wasm`.
  - It first checks a SHA-256 pinned in the script. Compute the hash once from the installed file and log it.
  - The file is not committed; add it to .gitignore.
  - The build fails on a hash mismatch.
- **The glue `rhwp.js`** is bundled into the worker by Vite.
  - Always call `init({ module_or_path: compiledModule })`, so its default `new URL('rhwp_bg.wasm', import.meta.url)` never runs.
  - **check-dist asserts exactly one `rhwp_bg*.wasm` in `dist/`.** Rollup may emit a second copy from that `new URL` pattern. If it does, stop it with Vite config or an alias to a re-export, and log how.
- **Fonts** (OFL-1.1, self-hosted, byte-identical to upstream):
  - `@fontsource/noto-serif-kr`, `@fontsource/noto-sans-kr`, `@fontsource/nanum-myeongjo` and `@fontsource/nanum-gothic`.
    - Pin the exact versions npm resolves today.
    - Weights 400 and 700 only, using the unicode-range woff2 slices they ship.
    - Package code is MIT; the fonts are OFL.
  - **Pretendard:** reuse the existing byte-identical dynamic subset (`public/fonts/pretendard/1.3.9/`, family "Pretendard Variable"). No new Pretendard bytes.
  - `scripts/gen-hwp-fonts.mjs` (prebuild):
    - It copies the slices to `public/fonts/hwp/<pkg>@<ver>/`, which is versioned and immutable.
    - It writes one CSS file with the families renamed **in CSS only**: `Anolim HWP Serif`, `Anolim HWP Sans`, `Anolim HWP Myeongjo`, `Anolim HWP Gothic`.
    - `font-display: block`.
    - The font files are untouched, so the OFL Reserved Font Name rules are not engaged.
  - **Fallback face** for ㊞ (U+329E), ㆍ (U+318D), ᆞ (U+119E) and ‧ (U+2027):
    - Bob probes the cmap of each OFL candidate with harfbuzzjs (already a dev dependency through subset-font). Candidates: the four families above, Pretendard, Noto Sans CJK KR and Noto Sans Symbols 2.
    - If one covers the code points, subset them into `Anolim HWP Fallback`. Keep GSUB, so old-Hangul jamo sequences compose. Limit `unicode-range` to these code points.
    - Read its name ID 0. If a Reserved Font Name appears in any name record, rename it through `scripts/font-rename.mjs`, following the Pretendard precedent.
    - If no OFL face covers a code point, log a Known Gap. It is not a blocker.
- **`jsdom` (MIT), dev only, exact pin.** It is used for the DOM unit tests of the SVG post-processing (a `@vitest-environment jsdom` comment per file).
- **Not added:**
  - `cfb`/SheetJS: we write our own read-only CFB reader (below)
  - jsPDF and svg2pdf: rejected in the spike
  - any Hancom or Microsoft font
  - `@rhwp/editor`
- **`licenses.manifest.json`** adds @rhwp/core (LICENSE plus the crate notices), the four @fontsource packages (LICENSE plus OFL), and the fallback face (OFL plus source). `check:licenses` stays green.

### 2. Shared HWP module — `src/lib/hwp/` (framework-free; the pure parts run in Node)
`features.ts` and `cfb.ts` carry the Hancom notice in their header comment. This covers the source-code obligation.
- **`sniff.ts`** (main thread, pure): the first 64 bytes give `cfb | zip | hwp3 | unsupported | unknown`. `.hml` (XML beginning `<?xml` that contains `HWPML`) is `unsupported`.
- **`cfb.ts`** (pure, read-only):
  - Every offset is bounds-checked. It never throws anything but `CorruptError`.
  - It reads the header, DIFAT (including extra DIFAT sectors), FAT, mini FAT and the directory tree.
  - API: `listStreams()`, `readStream(path)`, `streamSize(path)`.
  - It supports 512- and 4096-byte sectors, with a cycle guard on every chain.
- **`zipdir.ts`** (pure):
  - EOCD plus central directory → `{name, compressedSize, size, method, offset}`.
  - `readEntry` uses fflate `inflateSync` (fflate is already a direct dependency).
  - ZIP64 returns "unsupported". Files that large are over the cap anyway.
- **`features.ts`** ports `spikes/hwp/scripts/features.py`. **Only the guard fields** are ported, with the same semantics bit for bit.
  - **HWP5:**
    - FileHeader signature "HWP Document File"; version u32 at offset 32; props u32 at 36: compressed (bit 0), password (bit 1), distribution (bit 2).
    - For each `BodyText/Section*`, raw-inflate when compressed. A stream that fails to inflate sets `decodeError`, and the scan continues.
    - Record walk: tag = h & 0x3FF, size = h >> 20; 0xFFF means the size is in the next u32.
    - `equations` = count(tag 88) + count(ctrl `eqed`). A ctrl is tag 71; its id is a LE u32 read as 4 chars, as in `cid()`.
    - `textboxes` = count of tag 76 with ids `$rec`, `$ell` or `$pol`.
    - `imageBytes` = sum of the sizes of the `BinData/*` streams.
  - **HWPX:**
    - The `mimetype` entry must be `application/hwp+zip`; otherwise the file is not-hwp.
    - Concatenate the `Contents/section<N>.xml` entries, decoded as UTF-8.
    - `equations` = matches of `<hp:equation` followed by a word boundary; `textboxes` = matches of `<hp:drawText` followed by a word boundary (the features.py regexes).
    - `imageBytes` = sum of the uncompressed sizes of `BinData/*`.
  - **HWP3:** `{format:'hwp3'}` only, with no feature counts. The guard uses pages and caps only.
  - Distribution documents are not rejected here; rhwp may render them.
  - **Hard input bounds:** stop the record walk at 5 M records per stream. Inflate with a 512 MB output cap; beyond that the file is `corrupt` (zip-bomb guard).
- **`route.ts` + `limits.ts`** (pure): the table in 3.4.
  - Returns `{mode: 'convert'|'viewer-first'|'viewer-only', reasons: Reason[]}`.
  - Caps are checked first, then the guard.
  - Every threshold is a named constant. Boundaries are exactly as written in 3.4.
- **`svg-string.ts`** (pure, used in the worker):
  - `rewriteFonts(svg)` ports `pick()` exactly:
    - HEAVY regex → Sans plus `font-weight="700"`
    - 나눔명조 → Myeongjo; 나눔고딕 → Gothic
    - 맑은, Malgun or Pretendard → `"Pretendard Variable"`
    - a serif chain → Serif; anything else → Sans
    - Output families end with the fallback, for example `'Anolim HWP Serif','Anolim HWP Fallback',serif`.
  - `scopeIds(svg, pre)` uses the three regexes of the fixed convert.html (lines 69–73): `id="…"` with a leading word boundary, `url(#…)`, and `href`/`xlink:href="#…"`.
    - The word boundary must be the two source characters backslash + b, never byte 0x08.
    - This is enforced by the source-bytes test plus a unit test that a scoped `clip-path` resolves.
- **`svg-dom.ts`** (main thread; DOM only, no layout):
  - `parsePageSvg(str)` uses `DOMParser` with `image/svg+xml`. A `parsererror` gives a page placeholder "이 쪽을 표시하지 못했습니다". It is counted and never silent.
  - `sanitize(svg)` is defence in depth; CSP already blocks inline script.
    - It removes `script`, `foreignObject`, `iframe`, `object`, `embed`, `animate`, `set`, `animateTransform` and `animateMotion`.
    - It unwraps `a` and keeps its children.
    - It drops every `on*` attribute.
    - It drops `href`/`xlink:href` unless the value is `#…`, or, on `image` only, `data:image/…` or `blob:`. rhwp emits `data:image/svg+xml` too; it stays (scripts never run inside an `<image>`).
    - It returns a removal count. The harness requires 0 on all 120 corpus files; a non-zero count means we are deleting real content (Flag).
  - `ensureViewBox(svg)` adds `viewBox="0 0 W H"` from width/height when missing, so the screen preview can scale.
  - `dropCellClips(svg)` removes `clip-path` from `g[clip-path*="cell-clip"]` only. Body and fill clips stay.
  - `fitFillImages(svg)` is an exact port: 5 % tolerance, `xMidYMid meet`, centred in the fill-clip rect.
  - `addSpaces(svg, runs)` is an exact port: the row index (floor(y)), the 0.75 px nearest-glyph tolerance, and the leading-space skip.
- **`downscale.ts`** (main thread, needs layout). For each `<image>` with a `data:` href:
  - Printed box = attribute size × the CTM scale to the page (`getCTM()`), in CSS px. Target = box × 200/96 px.
  - It acts only when the natural width or height is > 1.25 × the target **and** the payload is > 100 KB.
  - Decode: base64 → Blob → `createImageBitmap`. No `fetch`.
  - Draw on an `HTMLCanvasElement` at the target size. Do not use OffscreenCanvas, so WebKit on Windows works.
  - Encode JPEG q 0.85 when the source is JPEG or the downscaled pixels have no alpha below 255; otherwise PNG.
  - Keep the smaller of old and new. Replace the href with a tracked `blob:` URL, revoked on reset.
  - SVG sources are left alone; BMP is treated like PNG.
  - Close bitmaps and zero the canvases afterwards.
- **`wasm-browser.ts`** (the only `fetch(` in this module):
  - It fetches `/vendor/rhwp/0.8.6/rhwp_bg.wasm` through a byte-progress reader. The denominator is the build-time raw size, injected by Vite `define`.
  - It compiles with `WebAssembly.compile` on the ArrayBuffer; `compileStreaming` cannot be combined with the progress reader.
  - The module is cached per worker.
- **`hwp.worker.ts`** (module worker):
  - Before init it registers `globalThis.measureTextWidth`:
    - OffscreenCanvas `measureText` when available
    - otherwise a deterministic estimate: CJK 1.0 em, others 0.55 em, px parsed from the font string
    - It increments a counter, and every `parsed`/`page` message carries `measureCalls`. The spike found 0 calls, because layout uses rhwp's internal metrics.
  - Messages in: `open {bytes}` (transferred), `render {i}`, `renderAll {from}`, `close`.
  - Messages out: `progress`, `scanned`, `parsed`, `page`, `error {code}`.
  - One document per worker. `close` calls `doc.free()`. Cancel and reset use `terminate()`.
  - **If rhwp cannot initialise inside a module worker in any of the three engines**, run the same module on the main thread in every browser (one code path).
    - Probe this first, before writing the controller.
    - Main-thread mode yields between pages (`setTimeout 0`), cancels by run token, and calls `doc.free()` on reset.
    - Log it. This is decided, not a Flag.

### 3. Tool page `/hwp-to-pdf/`
Page: `src/pages/hwp-to-pdf/index.astro`. Code: `src/tools/hwp-to-pdf/`:
- `controller.ts`: the state machine
- `limits.ts`: re-exports
- `messages.ts`
- `guidance.ts`: browser detection and steps
- `viewer.ts`: the lazy page window
- `print.ts`: full render, @page CSS, title swap, print

#### 3.1 Server-rendered content (합니다체, docs/COPY.md)
- **H1** "HWP PDF 변환". The lead contains "한글파일 PDF로 변환", "HWP·HWPX" and "한글 프로그램 없이", and mentions the viewer use ("HWP 뷰어처럼 바로 열어 볼 수도 있습니다").
- **File picker:** one file, with `accept=".hwp,.hwpx,application/x-hwp,application/haansofthwp,application/vnd.hancom.hwp,application/vnd.hancom.hwpx"`. Next to it, the §4 line "파일은 이 기기 밖으로 전송되지 않습니다." with the /privacy/ link.
- **도움말 section** (server-rendered, always visible below the tool):
  1. "PDF로 저장하는 방법": one `details` per browser (3.3).
  2. "원본과 다를 수 있는 문서": equations, many text boxes/도형, and 100쪽 이상. Honest wording, no percentages.
  3. The Hancom notice and the trademark line.
- **Tool footer block** (inside the tool page, above the site footer): the Hancom notice and the trademark line, both verbatim.
- **FAQ** (tools.ts `faq[]`, JSON-LD FAQPage):
  - 한글 프로그램 없이 되나요
  - HWPX도 되나요 (covers hwpx 변환 and hwpx 열기)
  - 원본과 똑같이 나오나요
  - 휴대폰에서도 되나요 (the mobile caps, in numbers)
  - 파일이 업로드되나요
  - 비밀번호가 걸린 문서는요
  - 저장 버튼을 눌렀는데 인쇄 창이 떠요 (why the print dialog is the save path)
  - HWP 뷰어로만 써도 되나요
- **Verbatim texts:**
  - Hancom: "본 제품은 한컴의 HWP 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다."
  - Trademark: "한글, 한컴, HWP, HWPX는 한글과컴퓨터의 등록상표이며, 본 서비스는 한글과컴퓨터와 무관합니다."
  - Both also go on `/licenses/`, in a top section "한글(HWP) 문서 관련 고지". The Hancom line also goes in README.md.

#### 3.2 States
- **empty** → **loading**, with 취소. Progress shows the engine %, then "문서를 여는 중", then "N/M쪽 준비 중".
- **convert:**
  - a preview of all pages
  - the primary button **"PDF로 저장"**
  - the guidance card for the detected browser, directly under the button
  - the small note "원본 프로그램과 글꼴·줄바꿈이 조금 다를 수 있습니다."
- **viewer-first:**
  - a lazy preview
  - a reason-specific warning banner (role="status"):
    - equations or textboxes: "이 문서는 수식·도형이 많아 변환 결과가 원본과 다를 수 있습니다" (verbatim, orchestrator text)
    - pages ≥ 100: "이 문서는 100쪽이 넘어 변환 결과가 원본과 다를 수 있습니다"
    - both: the first line, followed by "(100쪽 이상)"
  - the secondary button **"그래도 PDF로 저장"**. It runs the full render (with progress, cancelable back to viewer-first), then shows the convert-state guidance, then prints.
- **viewer-only:**
  - a lazy preview
  - a banner with the reason and its numbers, for example "이 기기에서는 60쪽이 넘는 문서를 PDF로 저장할 수 없어 보기만 제공합니다 (이 문서 128쪽). 컴퓨터에서 열면 저장할 수 있습니다." The desktop wording drops the last sentence.
  - no print button
  - Ctrl/Cmd+P: a `beforeprint` handler cannot cancel printing. So in viewer-only the print CSS shows only the one-line notice "이 문서는 보기 전용입니다", never partial pages.
- **error:** the code maps to copy in messages.ts, and focus moves to the message.

  | Code | Copy / behaviour |
  |---|---|
  | `not-hwp` | "한글(HWP·HWPX) 문서가 아닙니다" |
  | `unsupported` | HWPML (.hml) is not supported |
  | `password` | "비밀번호가 걸린 문서는 열 수 없습니다. 한글 프로그램에서 암호를 해제한 뒤 다시 시도해 주세요." |
  | `distribution` | "배포용 문서는 열 수 없습니다…" |
  | `corrupt` | damaged file |
  | `too-large` | with the numbers |
  | `oom`, `timeout` | the document is too heavy for this browser |
  | `engine` | the shared engine-error helper with its 새로고침 button, and one automatic retry (Polish P rule) |
- **Lazy viewer** (`viewer.ts`):
  - Every page gets a placeholder sized from `pageInfos`.
  - An IntersectionObserver renders the visible pages ±2 and evicts pages beyond ±6, revoking their blob URLs.
  - Keyboard: the preview region is focusable and scrolls natively with arrows and PageUp/PageDown. No custom keys.
- **Screen scaling:** `.page` max-width = the page's px width, and `svg {width:100%; height:auto}`. No horizontal scroll at 360 px.

- **Print CSS** (`@media print`):
  - Everything except `#hwp-print-root` is hidden: header, footer, banners, the SW update bar, guidance.
  - `@page {margin:0}`.
  - For each distinct size: `@page p{W}x{H} {size: {W·0.75}pt {H·0.75}pt; margin:0}` and `.p{W}x{H} {page: p{W}x{H}; width:{W}px; height:{H}px}`.
  - `.page {break-after: page; overflow:hidden; print-color-adjust: exact}` and `.page:last-child {break-after:auto}`.
  - The SVG fills 100 % of its page box.
  - The default `@page` size is the first page's size, as a fallback for engines without named pages.
- **Title swap:** during print, `document.title` = the sanitised base name, which Chrome and Edge use as the default PDF name. It is restored on `afterprint`.
- **After print:** the note "PDF 파일이 저장되지 않았다면 인쇄 창에서 PDF로 저장을 골랐는지 확인해 주세요." Focus stays on the save button.
- **Reset** ("다른 문서 열기"): terminate the worker, revoke blob URLs, clear the DOM and the @page style, and clear `hwp-inflight`.

#### 3.3 Per-browser guidance (`guidance.ts`)
- Detection uses UA plus platform, in a pure function unit-tested with UA strings.
- The detected browser comes first; the rest are in `details`.
- Label strings must match each browser's Korean UI. Gate 11 verifies them.

| Browser | Steps |
|---|---|
| Chrome / Edge (PC) | "대상" (Edge: "프린터") → **PDF로 저장** → 저장. 여백 기본, 머리글과 바닥글 끄기. |
| Safari (Mac) | 인쇄 창 왼쪽 아래 **PDF** 메뉴 → **PDF로 저장** |
| Firefox (PC) | "대상" → **PDF로 저장** → 저장 |
| Android Chrome / 삼성 인터넷 | 위쪽 프린터 선택 → **PDF로 저장** → PDF 다운로드 버튼 |
| iPhone·iPad Safari | 프린트 옵션 → 공유 버튼 → **파일에 저장** |
| Android Firefox | Print support varies. The card says "인쇄 메뉴가 없으면 Chrome에서 열어 주세요." |
| In-app browsers: UA contains KAKAOTALK, NAVER with inapp, Instagram, FBAN, FBAV or Line/ | Lead card: "오른쪽 위 메뉴에서 「다른 브라우저로 열기」를 누른 뒤 다시 시도해 주세요." The save button stays, because detection can be wrong. |

#### 3.4 Limits and routing (`src/lib/hwp/limits.ts`; mobile as defined in §3 gate 6)
| Check | Desktop | Mobile | Over → |
|---|---|---|---|
| File bytes (hard, before any parse) | > 150 MB | > 25 MB | error too-large |
| File bytes (cap) | > 80 MB | > 10 MB | viewer-only |
| Pages (cap) | > 300 | > 60 | viewer-only |
| WASM memory after parse (cap) | > 1 GiB | > 256 MiB | viewer-only |
| Embedded image bytes (cap) | > 60 MB | > 8 MB | viewer-only |
| Guard: pages ≥ 100, or equations > 0, or textboxes ≥ 3 | same | same | viewer-first |

- **The hard limits are Arch's addition.** Viewer-only still parses, and parsing is where image-heavy files blow memory (kr01: 64 MB → 785 MB of WASM).
- MB = 1,000,000 bytes; WASM is in MiB. Messages show both numbers (the limit and this file's value).

#### 3.5 Performance
- **Initial page JS** (controller, sniff, route and guidance) is ≤ 30 KB gzip. Nothing from the worker, rhwp, the fonts or the post-processing chunk loads before a file is picked.
- **Preload:** the Polish P rule applies (after the first interaction plus idle; skipped on saveData/2G). This page preloads only the worker script, **not** the 10 MB wasm.
- **Fonts:** the font CSS loads on the first `page` message, and slices load by unicode-range. Save is enabled only after `document.fonts.ready`.
- **Memory:** convert mode terminates the worker after the last page, which frees WASM before print doubles the peak.
- Every page insertion yields to the event loop. The progress region updates at most every 250 ms.

#### 3.6 Site wiring
- **`src/data/tools.ts`:** set `hwp-to-pdf` to live.
  - `name` "HWP PDF 변환".
  - The description (80–120 chars) contains "hwp pdf 변환", "한글파일 PDF로 변환" and the no-upload benefit.
  - `keywords`: hwp pdf 변환, 한글파일 pdf로 변환, 한글파일 pdf 변환, hwp 뷰어, hwpx 변환, hwpx 열기.
  - The sitemap, home, OG/JSON-LD and RelatedTools follow from LIVE_TOOLS. Verify each one.
- **RelatedTools** on this page: PDF 합치기 and PDF 용량 줄이기. The convert-state after-print note links "저장한 PDF가 크면 PDF 용량 줄이기".
- **Service worker:** the allowlist covers `/vendor/rhwp/` and `/fonts/hwp/` (cache on use). Carry-forward covers both, since they are versioned paths.
- **CSP unchanged.** `img-src 'self' data: blob:`, `style-src 'unsafe-inline'` and `worker-src 'self' blob:` already allow everything used. The e2e asserts zero `securitypolicyviolation` events.
- Regenerate the UI font subset for the new copy.

### 4. Bundle budget (`scripts/check-dist.mjs`, gzip -9)
| Asset | Budget |
|---|---|
| `/hwp-to-pdf/` initial JS | ≤ 30 KB |
| `hwp.worker*.js` (rhwp glue, scan, cfb, zipdir, fflate inflate) | ≤ 90 KB |
| Post-processing, viewer and print chunk | ≤ 25 KB |
| `rhwp_bg.wasm` | raw ≤ 10.5 MB, exactly one copy; brotli size reported |
| HWP font CSS | ≤ 30 KB |
| Any single font slice | ≤ 250 KB raw |
| Fallback face | ≤ 60 KB raw |
| `dist/` file count | still < 15,000 (report the new total) |
| Font bytes fetched for law10 (26 p, measured in e2e) | ≤ 2.5 MB, reported |

Paste the table into REVIEW-REQUEST.

## Failure modes
| Path | Realistic failure | Handling (test) | User sees |
|---|---|---|---|
| Input | .doc/.xls renamed .hwp (CFB, no HWP signature) | features → not-hwp (unit: synthetic CFB) | Error copy |
| Input | .docx/.zip renamed .hwpx | mimetype check → not-hwp (unit; e2e) | Error copy |
| Input | HWPML `.hml` | sniff → unsupported (unit) | Error copy |
| Input | Password document | FileHeader bit 1 → password; rhwp is not called (unit: patched FileHeader; e2e: patched law05) | Error copy |
| Input | 배포용 document that rhwp cannot open | parse throws + bit 2 → distribution (unit: patched flag + a throwing fake) | Error copy |
| Input | Truncated download | CFB/zip bounds → corrupt, or rhwp throws → corrupt (unit; e2e: first half of law05) | Error copy |
| Input | Zip bomb in the section XML | 512 MB inflate cap → corrupt (unit) | Error copy |
| Input | HWP 3.0 | format hwp3, routed by pages and caps only (unit: magic; corpus nt01–nt04) | Normal |
| Engine | wasm 404 or wrong MIME after a deploy | engine-error helper, one retry, 새로고침 (e2e: routed 404) | Clear panel; the file is not blamed |
| Engine | rhwp needs `measureTextWidth` in a worker | registered before init, with a call counter (harness asserts 0 on 120 files) | Nothing |
| Parse | 64 MB image-heavy file on a phone | hard limit 25 MB; cap 10 MB → viewer-only (unit; e2e: padded file on mobile) | Message with numbers |
| Parse | The OS kills the tab mid-parse (iOS) | `hwp-inflight` flag → notice on reload (e2e: set the flag, reload) | Notice |
| Parse | Worker OOM | onerror → oom (e2e: routed crashing worker) | Error copy |
| Parse | Hang | 90 s watchdog → timeout (unit: fake timers) | Error copy |
| Render | Clip ids collide across pages (the v1 bug) | scopeIds + the source-bytes test + 0 dangling refs per page (unit; harness) | Correct pages |
| Render | A cell clip hides text (R12) | dropCellClips (unit, jsdom; harness: law18 recall ≥ 0.99) | Text visible |
| Render | A cell picture fill at natural size (R2) | fitFillImages (unit, jsdom, with a kr08-shaped SVG) | The logo fits |
| Render | Malicious SVG content from a crafted file | CSP + sanitize (unit: crafted strings) | Nothing runs |
| Render | A page SVG fails to parse | placeholder + count (unit) | "이 쪽을 표시하지 못했습니다" |
| Render | Equations, text boxes or long documents mis-render (R1, R4–R9) | guard → viewer-first + warning (unit: route; e2e: law09, law17, adm28) | A warning before saving |
| Output | A 38 MB PDF from oversized images (kr01) | downscale to 200 dpi (e2e: adm19 blob count; harness size rule) | A smaller PDF |
| Output | Missing ㊞ / 아래아 glyphs | fallback face, or a Known Gap (e2e glyph check) | The glyph, or a logged gap |
| Output | Copy/paste has no word spaces | addSpaces (unit; e2e: the Chromium PDF text has spaces) | Real words |
| Output | Mixed portrait/landscape pages | a named @page per size (e2e: Chromium page.pdf sizes for law05) | Correct sizes |
| Output | An engine without named pages prints everything at the first size | default @page = the first size; recorded in the Gate 11 matrix | A Known Gap per browser, if found |
| Output | An in-app browser has no print | guidance lead card (unit: UA) | Instructions |
| Output | The user presses Ctrl+P in viewer-only | print CSS shows the notice only (e2e: emulateMedia print) | A one-line notice, not partial pages |
| Output | Fonts not loaded at print → fallback glyph shapes | save is enabled only after fonts.ready (e2e: the button is disabled until then) | Correct fonts |
| Memory | A 300-page print on desktop | the worker is terminated before print; cap 300 (unit) | Works, or viewer-only |

No row is "no test + no handling + silent".

## Test map
Every item starts as [GAP]. Bob marks each one [TESTED].
- **sniff** [GAP]: CFB, PK, HWP3 magic, .hml, an empty file, a 3-byte file.
- **cfb** [GAP]:
  - 512- and 4096-byte sectors (fixtures plus a synthetic 4096 file)
  - the mini stream and the DIFAT chain
  - a FAT cycle, an out-of-range sector, a truncated header
  - it never throws anything but CorruptError: a seeded fuzz of 500 random truncations and bit flips of law05
- **zipdir** [GAP]: fixtures, a truncated EOCD, a ZIP64 marker, the inflate cap.
- **features** [GAP]:
  - every fixture equals the committed `features.expected.json` produced by features.py (guard fields and flags)
  - patched password and distribution bits
  - HWP3
- **route** [GAP]: every boundary in 3.4 on both devices (the value at the limit and one above), the reason order, and guard combinations.
- **svg-string** [GAP]:
  - the pick() table: every row of spike §4, plus HEAVY → bold
  - scopeIds on id, url(), href and xlink:href; a scoped url resolves
  - no 0x08 byte in the source
- **svg-dom (jsdom)** [GAP]:
  - sanitize: each removed element and attribute; data:image kept; blob kept; external href dropped; the count
  - dropCellClips keeps fill and body clips
  - fitFillImages: the kr08 shape; an image within tolerance is untouched
  - addSpaces: inserted count and positions on a synthetic run; a leading space is skipped
  - ensureViewBox; the parsererror placeholder
- **guidance** [GAP]: the UA table: Chrome, Edge, Safari and Firefox desktop; Android Chrome; Samsung Internet; iOS Safari; Android Firefox; KakaoTalk; the Naver app.
- **Controller and worker** (e2e) [GAP]: all states and errors below.
- **Existing behaviour at risk:**
  - the network guard's exact list: update the expectation [GAP]
  - the sitemap's exact list and the home/LIVE_TOOLS derivation [GAP]
  - RelatedTools on every tool page [GAP]
  - the SW allowlist and carry-forward still pass their Polish P tests [GAP]
  - the check-dist file count and the single-mozjpeg-wasm assertion [TESTED by the existing check-dist]

## Tests

### Fixtures — `tests/corpus/hwp/` (its own cap, ≤ 3 MB, asserted by a unit test; `tests/fixtures/` is untouched)
- **Only law.go.kr 별표·서식 and 행정규칙 attachments.** They are not protected works under 저작권법 §7.
- `SOURCES.md` lists each file's law.go.kr URL, the 법령/행정규칙 name and the download date, copied from `spikes/hwp/corpus/sources.md`.

| File | Why | Spike result |
|---|---|---|
| law05.hwp (17 KB) | landscape, 20+ column grid | 1/1 good |
| law07.hwp (16 KB) | middle-dot case, small | 1/1 minor |
| law10.hwp (161 KB) | 26 p; id-scoping regression (29 % recall without it) | 26/26 good |
| law18.hwp (99 KB) | R12 cell clip (the 주 block on p9) | 9 p |
| adm02.hwpx (52 KB) | HWPX; R8 row split (explained +1 page) | 8 official / 9 ours |
| adm14.hwpx (62 KB) | HWPX; R11 (explained +1 page) | 10 official (2-up) / 11 ours |
| law09.hwp (116 KB) | equations → viewer-first | 20/20 minor |
| law17.hwp (24 KB) | 29 text boxes → viewer-first (R5) | broken, routed |
| adm28.hwpx (238 KB) | 128 p → viewer-first on desktop, viewer-only on mobile | broken (R9), routed |
| adm19.hwpx (588 KB) | equations + 7.4 MB of images (under the 8 MB mobile cap); downscale | routed |

- **No official PDFs are committed.** `tests/corpus/hwp/expected.json` holds, per file:
  - the expected page count (our engine, from spike `run.bundled.json`)
  - the official page count, and the explained cause where they differ
  - the **content text of the official PDF** (Hangul syllables, Latin letters and digits only, in order)

  It is generated once by `scripts/regress/hwp-expected.mjs` from the local spike corpus with pdf.js.
- `features.expected.json`: the features.py output for these 10 files (guard fields only).
- **Generated at test time, not committed:**
  - truncated law05
  - password-patched and distribution-patched law05
  - a `.docx`-style zip renamed `.hwpx`
  - law05 padded to over 10 MB
  - adm14 with an added 9 MB `BinData/pad.bin` (stored), for the image cap

### Unit (`tests/unit/hwp-*.test.ts`, Node; jsdom where noted)
Everything in the Test map's unit lines, plus the source-bytes test and the fixture-cap test.

### E2E (`tests/e2e/hwp-to-pdf.spec.ts`)
All 5 projects, the no-upload helper on every test, and zero CSP violations.
- **Lazy load:** no worker, wasm or HWP font request before a file is picked.
- **Convert, law10:**
  - 26 page elements
  - the save button is enabled only after fonts.ready
  - `window.print` is stubbed and called once
  - the title is swapped, then restored on a synthetic `afterprint`
  - zero dangling `url(#…)` targets in any page
- **Chromium only** (page.pdf exists only in Chromium; the other engines skip with that reason): `emulateMedia('print')` + `page.pdf({preferCSSPageSize:true})` for law10, law05 and adm14. Parse in Node with pdf.js:
  - page counts = expected.json
  - page sizes (law05 is landscape)
  - content recall against the expected text ≥ 0.99
  - the extracted text has word spaces: the law10 word count is within 10 % of the official text's
- **Other engines:** a print-media screenshot shows only `.page` elements, and the first page box matches its size ± 1 px.
- **HWPX:** adm02 and adm14 open in convert mode with the expected page counts.
- **Viewer-first:**
  - law09 and law17 show the 수식·도형 copy; adm28 on desktop shows the 100쪽 copy
  - while scrolling adm28, the lazy window holds ≤ 13 rendered pages
  - "그래도 PDF로 저장" renders all pages with progress, then print is called
- **Viewer-only** (mobile projects):
  - adm28: the 60쪽 message with 128
  - padded law05: the 10 MB message
  - adm14 + 9 MB BinData: the image message
  - no save button; print media shows only the notice
- **Downscale:** adm19 after "그래도 PDF로 저장": at least one image href is `blob:`, and no `<image>` has a natural width over 1.25 × its 200-dpi target.
- **Glyph fallback** (if the face exists): a test string with ㊞ and ㆍ in `Anolim HWP Serif` renders non-tofu after fonts.ready (its canvas width differs from the tofu width of an unassigned code point).
- **Errors:**
  - not-hwp (.txt and a renamed .docx)
  - password
  - truncated → corrupt
  - too-large (mobile, a 26 MB synthetic file)
  - wasm 404 (routed) → the engine panel with 새로고침
  - crashing worker → oom
  - `hwp-inflight` set + reload → the notice
- **Cancel** during the adm28 full render: back to viewer-first, and no stale page is appended afterwards (run token).
- **Reset** ("다른 문서 열기"): the blob URL count is 0, no `.page` remains, and law05 then opens.
- **Keyboard** (desktop projects): pick a file, scroll the preview, activate 그래도 PDF로 저장 and PDF로 저장, and open a guidance `details`.
- **axe:** empty, convert (law10), viewer-first (law17), viewer-only (mobile adm28) and error states; `/` and `/licenses/` again.
- **SEO and legal:**
  - the sitemap's exact list gains `/hwp-to-pdf/`
  - one H1, the canonical, and parseable JSON-LD (FAQPage)
  - the home card links to the tool; RelatedTools is present
  - the Hancom and trademark lines appear verbatim in the tool footer, the 도움말 section and `/licenses/`
- **WebKit on Windows:** this tool must not depend on OffscreenCanvas (the worker uses the estimate path; downscale uses HTMLCanvasElement). The full suite runs on webkit and mobile-safari. Any skip needs a stated reason and is a Flag.

### Regression harness — `npm run regress:hwp`
- **Runner:** `scripts/regress/hwp.mjs` starts a Vite dev server (the Step 3 pattern).
  - The harness page `scripts/regress/hwp-harness/` runs the **production** worker, svg-string, svg-dom, downscale and print CSS.
  - Chromium: `emulateMedia('print')`, then `page.pdf({preferCSSPageSize:true})`.
  - Nothing from the harness enters `dist/`.
- **Inputs:**
  - the 10 fixtures, always
  - every file in `CORPUS_DIR` (default `spikes/hwp/corpus`), with the official twins from the same folder
  - the manual classes from `spikes/hwp/results/classes.v2.json` (override with `CLASSES`)
  - Without the corpus, the run exits 1 unless `--fixtures-only` is given; the header then says PARTIAL.
- **The harness forces a full render on every file.** Routing is recorded, not obeyed. Timeout 300 s per file; the browser restarts after a failure.
- **Baseline:** `scripts/regress/hwp-baseline.json`, generated once from spike `run.bundled.json`, `recall2.bundled.json`, `compare.bundled.json` and `features.json`. It holds ids and numbers only: pages, content recall, ink mean/min, ms, output bytes and the guard flag.
- **Per-file metrics:**
  - pages
  - content recall against the twin (port of recall2.py: the multiset of Hangul syllables, Latin letters and digits)
  - ink IoU mean/min at 36 dpi via `scripts/regress/lib.mjs` renderRgba. Only when page counts match; 2-up twins are compared as halves (port the compare.py detection).
  - dangling refs, sanitizer removals, measureCalls, spaces added, fillFitted, images downscaled
  - ms (init, parse, render, fonts, pdf)
  - PDF bytes and the ratio to the official PDF
  - route mode and reasons
- **Automated proxies.** Any one of these marks a file "auto-broken":
  - a conversion error or timeout
  - pages ≠ baseline pages
  - content recall < 0.99 (twin files), or < baseline − 0.002
  - dangling refs > 0
  - sanitizer removals > 0
  - ink mean < baseline − 0.03
- **Gate recompute:** broken = manual class "broken" OR auto-broken. Report n, broken, rate and the Wilson CI for:
  - all files
  - **the non-routed set, as routed by our TS scan and route.ts** (expected: 101 files, 2 broken)
  - the routed set
- **Pass rules** (do not lower them; report misses under Blocked, with numbers):
  1. Non-routed broken rate ≤ 5.0 % (expected 2/101).
  2. Routing parity: our routed set on the desktop profile equals the 19 keys at the top. Any difference is listed per file with the features that caused it.
  3. Fixtures: page count = expected.json; content recall ≥ 0.99 on every non-routed fixture; routing = the expected mode on both device profiles.
  4. measureCalls = 0 and sanitizer removals = 0 on every file.
  5. Size: for each non-routed file with ≥ 1 MB of images and a twin, PDF bytes ≤ 3 × official. The median ratio over those files is ≤ 1.5. kr01 ≤ 5 MB (spike: 38 MB against 1.7 MB official). Report kr17 and adm04 too.
  6. Time: any file over 2 × its baseline ms is flagged, not failed. law10 render-to-ready ≤ 3 s and adm28 ≤ 15 s on the dev desktop fail if missed.
- **Mobile profile** (`--mobile`: Pixel 7 emulation with a 4× CPU throttle, a port of spike mobile.cjs): law09, kr18, kr17 and adm04 (forced). Report ms and WASM bytes. No pass rule; the numbers feed the real-device check.
- **Output:** `regress-out/hwp.md`. Paste the summary, the gate table and every flagged row into REVIEW-REQUEST.
- **Every rhwp upgrade** re-runs this harness on the full corpus before merge. Put that line in docs/ and in the comment next to the pinned hash in `scripts/vendor-rhwp.mjs`.

## Flags (do not guess; write under "Blocked")
- Any regress pass rule is missed.
- Vite emits a second rhwp wasm, and neither config nor an alias stops it.
- measureCalls > 0 on any file in any engine.
- The sanitizer removes anything on the corpus.
- The screen `.page` count differs from the Chromium PDF page count on any file.
- An `@fontsource` package lacks the 700 weight or the Korean slices for any of the four families.
- `tests/corpus/hwp/` would exceed 3 MB.
- Any new behaviour beyond this brief: batch, an image-PDF download, editing, HWPML, a separate /hwp-viewer/ page.

rhwp failing to initialise in a worker is **not** a Flag: the main-thread path in section 2 is decided.

## Out of Scope (→ BUILD-LOG Known Gaps)
- A no-dialog PDF download: jsPDF/svg2pdf (rejected), and the canvas-raster "이미지 PDF" (spike path C).
- Batch conversion; HWPML (.hml); HWP → HWPX/DOCX; editing, or filling 누름틀.
- Workarounds for rhwp bugs R1–R13 beyond the four ported ones. Filing them upstream needs the owner's GitHub account.
- rhwp `devel` builds, or a self-built wasm.
- Middle-dot (U+00B7) width normalisation (the law07/law08 minor class).
- A feature scan for HWP 3.0. Unifying the HWP5 "textboxes" count ($rec + $ell + $pol) with the HWPX count (drawText). Both stay identical to the spike for gate parity.
- A dedicated `/hwp-viewer/` landing page for "hwp 뷰어" (3,560/mo). The tool page covers it in copy.
- Search, zoom controls and page thumbnails in the viewer.

## Acceptance
- **Every §3 quality gate is green:**
  - check and unit tests
  - e2e on 5 projects, with no-upload on every test and zero CSP violations
  - axe
  - Lighthouse on `/hwp-to-pdf/`: Perf ≥ 95, A11y 100, BP ≥ 95, SEO 100, LCP ≤ 2.0 s, CLS ≤ 0.01
  - licences, and the dist budgets in section 4
  - sitemap and tools data, RelatedTools, and the engine-error helper wired in
- `regress:hwp` on the full 120-file corpus meets rules 1–6. regress:merge, regress:compress, regress:photo and regress:idphoto are unchanged.
- `/licenses/` has @rhwp/core with the crate notices, the four font packages with OFL, the fallback face (if built), and the Hancom and trademark lines.
- **Gate 11 (Richard)** in real Chrome, Edge and Firefox on Windows:
  - law10, law05 (landscape) and adm14 (HWPX) saved through "PDF로 저장". Check the page count, the landscape page, selectable text with spaces, and that the PDF font list shows only our faces (Noto, Nanum, Pretendard, fallback).
  - law17 shows the viewer-first warning.
  - Record the dialog label strings against guidance.ts.
- **Real devices** (owner or orchestrator; owed and logged, non-blocking, as in earlier steps): one mid-range Android (about 4 GB) and one iPhone.
  - law10 through the save path in the guidance.
  - adm19 "그래도 PDF로 저장" completes without a tab kill.
  - A `.hwp` file is selectable in the iOS picker. If it is greyed out, drop `accept` on iOS and log it.
  - Safari macOS print-to-PDF, if a Mac is available.

## Deploy gate (Step 5), identical to Step 2
1. Richard writes "Step 5 is clear".
2. Arch commits locally ("[Step 5] HWP PDF 변환 …") and updates BUILD-LOG and the checkpoint.
3. The orchestrator pushes main (standing owner instruction) and runs the live smoke test on https://doc-tools-kr.pages.dev:
   - `/hwp-to-pdf/` returns 200 with the CSP header; `/sitemap.xml` lists it; the home card links to it.
   - `/vendor/rhwp/0.8.6/rhwp_bg.wasm` is served as `application/wasm` and is under 25 MiB. Report its content-encoding and transfer size.
   - `/fonts/hwp/…` slices are served with the immutable cache header.
   - In real Chrome, law10.hwp shows 26 pages, and "PDF로 저장" gives a 26-page PDF with selectable text. law17.hwp opens viewer-first with the warning. There is no non-GET or cross-origin request.
   - `/pdf-merge/` still merges its smoke file (the SW and carry-forward are unaffected).
4. If the smoke test fails, the orchestrator reverts the Step 5 commit and pushes, logs it, and reopens the step. If the SW changed, the Polish P kill-switch rule applies.
