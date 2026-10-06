# Architect Brief — Step TOOLS4: 증명사진 프리셋 확대 + 사진→PDF + PDF→JPG + PDF 암호

Author: Arch. Date: 2026-10-06. Worktree C:/dev/doc-tools/c2. **Build only after Step USAGE is committed** (this brief
extends its whitelist). Basis: `C:/dev/doc-tools-kr/reports/문서딱 기능 시장성 조사.md` (priorities 1-4),
`research_notes/문서딱 기능 시장성 조사/feasibility.md`, `search_demand.md`.
Pointer `handoff/ARCHITECT-BRIEF.md` and BUILD-LOG were not touched (USAGE build in progress); log notes are at the end
of this file. Copy them into BUILD-LOG when T0 starts.

## Goal
Four sub-steps, each its own Bob → Richard → deploy gate: (T1) /id-photo/ gains sourced visa / 신분증 / 원서 presets in
grouped categories with no face or background editing; (T2) new /jpg-to-pdf/; (T3) new /pdf-to-jpg/; (T4) new
/pdf-password/. Every new tool emits USAGE events. **Zero new npm dependencies.**

## Order (one sub-step at a time; N+1 starts after N is deployed and logged)
- **T0** refactor, no behaviour change (one commit, gates green): see Build Order T0.
- **T1** 증명사진 프리셋 (Step 0 sourcing first). First because it is the 20만 군집 and 증명사진 search peaks in October.
- **T2** 사진 PDF 변환 `/jpg-to-pdf/`.
- **T3** PDF JPG 변환 `/pdf-to-jpg/`.
- **T4** PDF 암호 해제·설정 `/pdf-password/`.
- **T1b** (배경 흰색) is **not built** unless the owner picks option B in Escalation E1.

## Locked decisions
1. **No release flags for T2-T4.** Each ships `status: 'live'` in tools.ts at its own deploy (C1 /stamp-signature/
   precedent). They are static, send nothing, and roll back with one revert. The flag pattern (`__BG_REMOVE__`) stays for
   tools with large downloads or cloud cost only.
2. **No libheif, no LGPL.** CLAUDE.md: "Permissive licenses only (no GPL/AGPL/LGPL; MPL only via the logged exception)".
   HEIC = native decode only via the existing `src/lib/image/decode.ts` (`PhotoError('heic')` when the device cannot open
   it), with the existing HEIC guidance copy (아이폰 설정 > 카메라 > 포맷 > 높은 호환성). No heic2any (mislabelled LGPL).
   The owner may grant an exception: Escalation E2.
3. **배경 흰색 is NOT offered in /id-photo/ (default).** Reasons: 외교부 lists "배경색을 사진 편집 프로그램으로 제거하여
   사진이 변형된 경우" as 제출 불가 and says "임의로 보정된 사진(AI를 활용한 편집·가공·합성·창조 제작물 포함)은 허용 불가함"
   (both already quoted in tools.ts); the tool promises "보정은 하지 않습니다"; the background model is ~100 MB on device,
   or the cloud path sends a face photo, which the owner kept out of 증명사진 (C2-cloud r4, 2026-10-05). Instead: the
   existing background check (`src/lib/idphoto/background.ts`) keeps warning with the existing "흰 배경에서 다시 찍어
   주세요" copy, for new presets too. Option B is the owner's call (E1).
4. **One-stop = make what exists reachable.** Crop + exact pixels + KB fit are already one flow in /id-photo/. T1 adds the
   destinations (presets), groups them, and links guides to deep links (`?preset=`). No new editing.
5. **Preset sourcing rule (unchanged, stricter for foreign sites):** a preset ships only with an official page URL, a
   verbatim quote, a retrieval date, and `npm run check:quotes` passing. Official = a government domain, that country's
   embassy or consulate in Korea, or an application centre that the embassy page itself names as the channel (cite both).
   Blogs, photo studios, visa agencies: never. No quote, no preset (log "확인 필요" as today).
6. **New preset kinds** (`src/data/id-photo-presets.ts`):
   - `status: 'print'`: the source states only a paper size (mm). Pixels = mm at 300 ppi (`dpiFor` must return 300); no
     KB limit unless quoted; requires `sourceUrls` + `quote`; label ends "(인화용 W×H cm)"; result screen adds "사진관이나
     인화 앱에서 W×H cm로 인화하세요." guide-schema treats `print` as sourced.
   - `headBand.kind: 'official'` allowed for any `official` or `print` preset whose source states the head rule. Replace
     the passport-only check in `validatePreset` with "official band requires non-empty `bandQuote`". New field
     `headBand.measure: 'crown' | 'hair'` (crown = 정수리(머리카락 제외), today's meaning; hair = 머리카락 포함, as some
     visa rules measure). Overlay labels follow `measure`.
   - No head rule in the source and aspect within 1.5 % of 35:45: today's `reference` band. No head rule and any other
     aspect (square visas): **do not ship that preset** (a passport ratio on a square photo would be a made-up guide).
   - Optional `minBytes`, only if a shipped preset quotes a minimum: the encoder retries at higher quality; still under
     gives the warning "제출처 최소 용량 N KB보다 작습니다." (no padding tricks).
   - Source requires a non-white background: do not ship (the background check knows white only). Log it.
7. **Preset UI:** `<optgroup>` groups 여권·신분증 / 비자 / 시험·원서 / 이력서 / 기타 (반명함, 직접 입력). Default stays
   `passport_online`. `PRESET_IDS`, usage.mjs `PRESETS` and `PRESETS` stay equal (existing tests).
8. **Slugs, names, SEO** (Bob may tune wording; existing tests enforce name = h1 and description 80-120 chars):

   | slug | name = h1 | title |
   |---|---|---|
   | `jpg-to-pdf` | 사진 PDF 변환 | 사진 PDF 변환 — JPG·PNG·아이폰 사진을 PDF 하나로 무료 &#124; 문서딱 |
   | `pdf-to-jpg` | PDF JPG 변환 | PDF JPG 변환 — 쪽마다 사진으로 저장 무료 &#124; 문서딱 |
   | `pdf-password` | PDF 암호 해제·설정 | PDF 암호 해제·설정 — 비밀번호 풀기·걸기 무료 &#124; 문서딱 |

   Description drafts:
   - jpg-to-pdf: 「사진 PDF 변환을 폰·컴퓨터에서 바로. JPG·PNG·아이폰 사진 여러 장을 원하는 순서로 PDF 하나로 묶고, A4
     용지나 사진 크기에 맞춥니다. 가입 없이 무료.」
   - pdf-to-jpg: 「PDF JPG 변환을 폰·컴퓨터에서 바로. PDF의 쪽마다 JPG 사진으로 저장하고, 여러 쪽은 ZIP 파일 하나로
     받습니다. 선명도도 고를 수 있고 가입 없이 무료.」
   - pdf-password: 「PDF 암호 해제와 암호 설정을 무료로. 비밀번호를 아는 PDF는 암호를 풀어 저장하고, 내 PDF에는 열 때
     필요한 비밀번호를 겁니다. 가입 없이 바로 씁니다.」
   Keywords (reference only): 사진 pdf 변환, jpg pdf 변환, 아이폰 사진 pdf 변환, 사진 pdf로 묶기 / pdf jpg 변환, pdf
   이미지 변환 / pdf 암호 해제, pdf 비밀번호 해제, pdf 암호 설정, 정부24 pdf 암호 해제, 홈택스 pdf 비밀번호.
   Copy follows docs/COPY.md: 합니다체, no 업로드/서버/브라우저/메모리/dpi; "밖으로 보내지 않습니다" only beside the file
   picker, in the FAQ and on /privacy/, never in title, description or first sentence (owner 2026-10-05).
9. **Page registration per new tool** (mirror /stamp-signature/): tools.ts entry (FAQ 4-6 answering real queries,
   numbers read from the tool's `limits.ts` like `HWP_FAQ`), `src/pages/<slug>/index.astro`, og.json image + page
   description, gen-brand OG image, JSON-LD (existing generator), related-tools mapping (jpg-to-pdf: pdf-merge,
   pdf-compress, photo-compress; pdf-to-jpg: jpg-to-pdf, pdf-compress, photo-compress; pdf-password: pdf-merge,
   pdf-compress, pdf-to-jpg), `src/data/guides.ts` tool-to-guides, tool-facts entries for any number a guide may cite,
   lighthouserc URL, qa:visual page, site/polish e2e page lists, postbuild OG list, CLAUDE.md line 3 tool list, `updated`.
10. **Precache:** a new tool page and its first-interaction controller are precached only while gen-sw stays within
    450 KB. Bob measures after each sub-step; if over, add that page to `NOT_PRECACHED` (as /remove-background/) and log
    the number. Never raise the limit.
11. **Budgets:** every new lazy chunk or worker gets a check-dist budget = measured gzip + 20 % (C1 rule); initial JS per
    page stays under the existing 30 KB. pdf-lib, pdf.js and qpdf load on first use only (after a file is chosen), never
    with the page (check-dist assertion like the stamp-signature controls).
12. **USAGE wiring** (extends ARCHITECT-BRIEF-USAGE.md decision 5; single source `scripts/lib/usage.mjs`):
    - `TOOLS` += `jpg-to-pdf`, `pdf-to-jpg`, `pdf-password`; `TOOL_LABELS` = tools.ts names.
    - `SETTINGS` += `page: ['fit','a4']` (jpg-to-pdf), `ppi: ['p96','p150','p300']` (pdf-to-jpg),
      `action: ['lock','unlock']` (pdf-password). `SETTING_LABELS`: 용지 / 선명도 / 할 일. `VALUE_LABELS`: 사진 크기에
      맞춤, A4, 작게(약 96 ppi), 보통(약 150 ppi), 선명(약 300 ppi), 암호 걸기, 암호 풀기.
    - `PRESETS` += every shipped T1 preset id (the equality test with PRESET_IDS keeps it honest); `VALUE_LABELS` for them.
    - Events: pick / start (+ `o`/`v`, one setting per run) / success / fail (code + phase) / download; `arrive` via the
      shared logic. Fail codes match `^[a-z-]{1,24}$`: e.g. `heic`, `not-image`, `too-many`, `too-big`, `not-pdf`,
      `password`, `wrong-password`, `not-encrypted`, `already-encrypted`, `engine`, `canvas`.
    - **The password, file names, page counts and image counts never enter a payload** (the field-by-field builder
      enforces it; e2e asserts it, Test map).
    - Privacy text: no change needed ("고른 설정 … 처럼 정해진 값" covers 용지/선명도/할 일). Richard confirms at review.
13. **Password tool policy:** unlock only with the password the user types; one attempt per click; no guessing, no
    dictionary, no "restriction removal" feature. A file that opens without a password: "이 파일은 열 때 비밀번호가
    필요 없습니다. 암호를 풀지 않아도 됩니다." and stop (even if it carries owner-only restrictions). Forgotten password
    (FAQ): "문서딱으로는 풀 수 없습니다. 파일을 보낸 곳에서 안내한 비밀번호를 확인하거나 파일을 다시 받으세요." Never state
    what a 기관's password is unless a published guide quotes that 기관 (Step 0 rule).
14. **Signed documents:** T4 (both modes) runs the existing `hasSignature` (`src/lib/pdf/compress/signature.ts`) on the
    opened document; if true, before download: "전자서명이 들어 있는 문서입니다. 암호를 풀거나 걸어 새로 저장하면
    전자서명이 더 이상 유효하지 않습니다. 발급받은 증명서는 원본을 제출하세요." (same rule as pdf-compress FAQ 5).
15. **Encryption engine:** qpdf 12.2.0 (already vendored, Apache-2.0) for lock and unlock, in a new small worker reusing
    `runQpdf` / `loadQpdf`. Lock: AES-256 with named options `--encrypt --user-password=PW --owner-password=OWNER
    --bits=256 --` where OWNER = 32 random hex chars from crypto.getRandomValues; all permissions allowed (we add an open
    password only). Unlock: `--decrypt --password=PW`. Fallback only if the probe fails: `@cantoo/pdf-lib` `encrypt()`
    (already a dependency). Lock password rules: 4-64 characters, typed twice, any Unicode (Unverified c); show/hide
    toggle = existing `src/lib/ui/password`. qpdf logs are for error mapping only: never shown, never sent.
16. **Output names:** inspect what pdf-merge / pdf-compress do today and mirror it (log it). Default intent: `{base}.pdf`
    (jpg-to-pdf: first image's base), `{base}_p001.jpg` and `{base}_jpg.zip`, `{base}_암호.pdf` / `{base}_암호해제.pdf`.
    If the existing tools use ASCII-only names, use ASCII tags instead.

## Flow diagrams
```
T2 /jpg-to-pdf/
pick images --sniff--> jpeg/png/webp/heic? --no--> fail not-image (row message, other images kept)
   | yes   (count/size over limits -> message with numbers; extra files not added)
   v
thumbnail decode (decode.ts; HEIC the device cannot open -> fail heic + guidance)
   v
list: reorder (drag + up/down buttons), rotate 90, remove
options: 용지 [A4 | 사진 크기에 맞춤], A4 방향 [자동 | 세로], 여백 [없음 | 10 mm], 사진 크기 [원본 그대로 | 줄이기 (긴 변 2,000픽셀)]
   v
"PDF 만들기" -> per image (yield between images):
   raw embed? (JPEG, 1 or 3 components, orientation 1 or absent, rotation 0, 원본 그대로) --yes--> embedJpg(bytes)
        \--no--> decode (orientation applied, long-edge cap) -> canvas -> JPEG q0.92 (PNG with alpha -> embedPng)
   -> page size (layout fn) -> drawImage -> release bitmap/canvas
   v
save -> Blob -> result (쪽 수, 크기) -> download
```
```
T3 /pdf-to-jpg/
pick PDF --not pdf--> fail not-pdf
   v  pdf.js open (encrypted -> password prompt -> wrong -> retry message)
pages N; range "1-3, 5" (default all); 선명도 [작게 96 | 보통 150 (default) | 선명 300]
   v  run limits (pages in run <= cap; lower cap at 300 on mobile) else message asking for a range
for each page: scale = clamp(ppi/72; area <= AREA_CAP; long edge <= EDGE_CAP) -> canvas (white fill) -> render
   -> toBlob('image/jpeg', 0.92) -> fflate Zip entry (store) or keep single -> canvas.width = canvas.height = 0
   v
1 page -> .jpg download | >1 -> .zip download | clamped pages listed "N쪽은 W×H픽셀로 줄여 저장했습니다."
```
```
T4 /pdf-password/
mode [암호 풀기 (default) | 암호 걸기]
pick PDF --not pdf--> fail not-pdf
unlock: encrypted? --no--> not-encrypted message, stop
          \--yes--> password -> worker qpdf --decrypt --invalid--> wrong-password (field kept, retry)
                                                     \--ok--> signature? warn -> download
lock:   encrypted? --yes--> "이미 암호가 걸린 파일입니다. 먼저 암호를 풀어 주세요." [암호 풀기로 바꾸기]
          \--no--> password x2 (4-64, equal) -> worker qpdf --encrypt AES-256
                 -> verify with pdf.js (no password -> PasswordException; password -> same page count)
                 --fail--> fail engine, NO download   --ok--> signature? warn -> download
```

## Build Order
### T0 — refactor only (separate commit, all gates green, no visible change)
- Move `src/tools/pdf-merge/drag.ts` to `src/lib/ui/reorder.ts` (pdf-merge imports it; tests follow).
- Move `qpdf-run.ts` and `loadQpdf` / `QPDF_VENDOR_DIR` from `src/lib/pdf/compress/` to `src/lib/pdf/qpdf/` (compress
  imports from there). compress.worker size may not change by more than 1 %.
- New pure `src/lib/pdf/page-range.ts`: `parseRange("1-3, 5", n)` returns sorted unique 1-based pages or a typed error
  (empty, out of range, reversed, junk). Unit tests.

### T1 — 증명사진 프리셋
1. **Step 0 sourcing before any code** (ARCHITECT-BRIEF-G2.md line 179 protocol: curl first, then chrome-cdp from the
   owner's PC; log URL, status, bytes and the verbatim quote in BUILD-LOG "TOOLS4 Step 0"; check with `pageTextExact`;
   then `npm run check:quotes`). Candidates: 미국 비자 (travel.state.gov, kr.usembassy.gov), 일본 비자
   (kr.emb-japan.go.jp), 중국 비자 (주한중국대사관 + the centre it names), 베트남 (evisa.gov.vn, 주한베트남대사관), 인도
   (indianvisaonline.gov.in, 주한인도대사관), 운전면허 (safedriving.or.kr 적성검사 사진 등록 file spec), 주민등록증 (a
   gov.kr file spec if any; otherwise a `print` preset from the gov.kr quote already in id-card-photo.md), and the draft
   guides' destinations (local-gosi, mma, teacher-exam, toeic). Also quote each visa source's "no digital alteration"
   line when present (guides use it).
2. Schema: decision 6 fields + `validatePreset` + unit tests; overlay label by `measure`; `<optgroup>` select.
3. Add the presets that passed Step 0; update `PRESET_IDS` and usage.mjs `PRESETS` / `VALUE_LABELS`.
4. tools.ts id-photo: FAQ 4 (presetSummary picks up new presets; rewrite or drop the sentence "주민등록증·운전면허증은 …
   아직 넣지 않았습니다" to match what shipped); mention 비자 in the description only if 2+ visa presets shipped; `updated`.
   **FAQ 3 (no editing, no background change) stays word for word.**
5. Guides: one guide per shipped visa preset (`us-visa-photo` etc.); update `driver-license-photo`, `id-card-photo` and
   hub `photo-sizes`; promote a draft guide only when its source passed Step 0. Each guide carries facts that differ from
   the others (size, background, submission channel, source): no template clones (scaled-content risk, report §광고).
6. `npm run regress:idphoto -- --fixtures-only` covers every new preset (exact pixels, under the limit, JFIF density).

### T2 — /jpg-to-pdf/
- `src/tools/jpg-to-pdf/{limits,layout,embed,controller,entry}.ts`. Limits: images mobile 50 / desktop 200; per image
  mobile 50 MB / desktop 100 MB; total mobile 150 MB / desktop 500 MB; decode long-edge cap 4,096 px on mobile.
- `layout.ts` (pure): (imgW, imgH, rotation, options) -> page size in pt + draw rect. A4 = 595.28×841.89 pt; 자동 = page
  orientation follows the rotated image; contain-fit inside the margin, centred. 사진 크기에 맞춤 = page has the image's
  aspect, long side 841.89 pt, no margin.
- `embed.ts` (pure): `canEmbedRaw(info, rotation, sizeOption)` per the flow; EXIF orientation from the existing JPEG
  helpers (`src/lib/image/jfif.ts`, `jpeg-strip.ts`). Never raw-embed CMYK/YCCK JPEGs (re-encode).
- Flag: mirror pdf-merge for where pdf-lib runs and how progress/cancel work; do not invent a second pattern.
- The PDF carries nothing from the photos' metadata: no EXIF, no title from file names; producer/creator "문서딱".

### T3 — /pdf-to-jpg/
- `src/tools/pdf-to-jpg/{limits,scale,controller,entry}.ts`; pdf.js through the existing loader `src/lib/pdf/inspect.ts`.
- `scale.ts` (pure): `pageScale(wPt, hPt, ppi, caps)` -> { scale, clamped }. Caps: mobile area 16,000,000 px and long
  edge 4,096; desktop area 36,000,000 and long edge 8,192 (iOS canvas limits, feasibility §1 and §4).
- Limits: file mobile 50 MB / desktop 200 MB; pages per run mobile 100 (50 at 300 ppi) / desktop 500. Over: message with
  the numbers asking for a range (no silent truncation).
- ZIP: fflate streaming `Zip` + `ZipPassThrough` (store), chunks collected as Blob parts; canvas freed per page.
  JPEG via `canvas.toBlob('image/jpeg', 0.92)` after a white fill.

### T4 — /pdf-password/
- `src/lib/pdf/password.ts` (pure args builders + error mapping in the style of `qpdfFailure`), `password.worker.ts`,
  `src/tools/pdf-password/{limits,controller,entry}.ts`. Limits: mobile 50 MB / desktop 200 MB (qpdf holds ~3x).
- Encrypted detection: existing `hasEncryptKey` and pdf.js PasswordException; lock verification via pdf.js (flow).
- Always-visible line near the picker: "열 때 쓰는 비밀번호를 아는 파일만 풀 수 있습니다." FAQ: 비밀번호를 잊었어요
  (decision 13); 정부24·홈택스에서 받은 PDF (enter the password the sender gave; no specifics); 어떤 방식으로 걸리나요
  (AES-256, most PDF apps open it); 전자서명 문서 (decision 14); 휴대폰에서도 되나요 (limits from limits.ts).
- Guide `pdf-password` (how-to; numbers via toolFacts only). A 홈택스 / 정부24 password guide only if Step 0 finds an
  official quote.

## Unverified claims (Bob probes and logs verbatim results; none may be assumed)
- (a) The vendored qpdf 12.2.0 wasm accepts the named `--encrypt … --bits=256 --` form and its output opens in pdf.js
  with the password and not without. If named options fail: positional form and reject passwords starting with `-`. If
  AES-256 fails entirely: `@cantoo/pdf-lib` `encrypt()` fallback. Log which.
- (b) qpdf's random source works in the worker: two encryptions of the same file differ. Same probe.
- (c) A Korean password (`문서딱암호12`) round-trips (lock, then pdf.js open). If not: printable ASCII only, copy "영문·
  숫자·기호만 쓸 수 있습니다.", log it.
- (d) iPhone Safari HEIC native decode in decode.ts: owner real-device check (CLOUD-HANDOFF §8); not testable in CI.
  The Chromium/Firefox `heic` message path is tested.
- (e) Every visa number comes from Step 0 quotes only. Numbers in the report and notes are leads, not sources.

## Failure modes
| Path | Realistic failure | Handling | User sees |
|---|---|---|---|
| T1 preset | source page changes after ship | check:quotes at deploy + weekly source-watch (existing); 180-day staleness warning | old numbers until fixed (same as today) |
| T1 preset | square visa shipped with the passport band | decision 6 forbids; validatePreset rejects an official band without `bandQuote` | - (CI fails) |
| T1 background | user expects background whitening | background warning + FAQ 3 unchanged | clear "흰 배경에서 다시 찍어 주세요" |
| T2 decode | HEIC on Chrome/Windows | `PhotoError('heic')` row message + guidance; other images kept | clear message |
| T2 orientation | EXIF-rotated JPEG embedded raw, page sideways | raw only with orientation 1/absent; unit + e2e fixture | - |
| T2 colour | CMYK JPEG embedded raw, inverted colours | never raw-embed CMYK/YCCK; unit test | - |
| T2 memory | 50 phone photos kill an iPhone tab | per-device limits, long-edge cap, bitmaps released, yield; limits in FAQ | limit message before start |
| T3 canvas | 300 ppi large page passes the iOS canvas area, blank image | `pageScale` clamp + "줄여 저장했습니다" note; unit edge tests | clear note |
| T3 memory | 300-page ZIP | page caps + streaming zip + canvas freed per page | message asking for a range |
| T3 password | encrypted PDF | pdf.js password prompt; wrong -> retry message | clear |
| T4 wrong password | typo | `wrong-password` message, field kept, retry | clear |
| T4 lock | qpdf output unreadable or not actually encrypted | pdf.js verification (both checks) before download; failure -> `engine` message, no file | clear; never a falsely "locked" file |
| T4 engine | qpdf wasm fails to load | existing engine copy ("처리 도구를 불러오지 못했습니다. 파일에는 문제가 없습니다. …") | clear |
| T4 signature | decrypting a 정부24 issued PDF breaks its signature | `hasSignature` warning before download | clear warning |
| T4 privacy | password reaches a usage payload or a log | builder never takes it; e2e scans bodies; qpdf logs never surfaced | - |
| All | precache passes 450 KB | decision 10 | - (build fails loudly) |

No critical gaps: every path has handling plus a test, or fails the build.

## Test map
Unit (vitest); [GAP -> new] unless marked:
- presets: each new preset passes validatePreset; `print` requires quote + 300 ppi; official band without `bandQuote`
  rejected; non-35:45 aspect with a reference band rejected; PRESET_IDS = PRESETS = usage PRESETS minus custom
  [TESTED -> extend].
- guide-schema: `print` presets count as sourced [TESTED -> extend]; check:quotes covers the new quotes (deploy gate).
- page-range: valid, edge and invalid cases (T0).
- reorder / qpdf moves: existing tests pass unchanged [TESTED, regression].
- jpg-to-pdf layout: portrait / landscape / square × A4 자동 / 세로 × margin 0 / 10 mm × rotation 0/90/180/270; fit mode
  long side 841.89.
- canEmbedRaw: orientation 1/absent -> raw; 6 -> re-encode; CMYK -> re-encode; rotation ≠ 0 -> re-encode; 줄이기 -> re-encode.
- pageScale: A4 at 96/150/300 exact pixels; area and edge clamps for mobile and desktop caps; `clamped` flag.
- password args: lock args contain `--bits=256`, owner ≠ user, owner is 32 hex; unlock args; the password never appears in
  a returned log or error text; mapping invalid password -> `wrong-password`, none given -> `password`.
- usage.mjs: new tools / settings / values accepted, unknown value rejected, admin labels Korean [TESTED -> extend].
- postbuild / check-dist: new pages in sitemap, llms.txt and the OG list; pdf-lib / pdf.js / qpdf in no new page's
  initial JS; new budgets; plain-language rule on the new pages [TESTED -> extend].

E2E (chromium, firefox, webkit, mobile-chrome, mobile-safari; no-upload guard on every test); new specs:
- `jpg-to-pdf.spec.ts`: 3 fixtures (portrait JPEG, orientation-6 JPEG, PNG with alpha); move the last to first; A4;
  download; parse in the test with pdf-lib: 3 pages, order checked by page aspect, A4 within 0.5 pt, the orientation-6
  page is portrait; fit mode page aspect = image aspect; a non-image file -> row message; HEIC-header fixture -> `heic`
  message on chromium.
- `pdf-to-jpg.spec.ts`: 3-page fixture -> ZIP with 3 `.jpg` entries (JPEG SOI bytes; width = round(wPt / 72 × 150)
  ± 1); range "2" -> single `.jpg`; encrypted fixture -> prompt -> wrong message -> right password works; range "9" on 3
  pages -> message.
- `pdf-password.spec.ts`: lock with `문서딱암호12` (or ASCII per Unverified c); output: pdf.js without the password throws
  PasswordException, with it the page count matches; unlock that output -> opens without a password; wrong password ->
  message; plain PDF in unlock -> not-encrypted message; encrypted PDF in lock -> switch prompt; signed fixture ->
  signature warning.
- `id-photo.spec.ts`: one new visa preset end to end (exact pixels, under its KB), `?preset=<new id>` selects it,
  optgroups present [TESTED -> extend]; the passport flow unchanged [TESTED, regression].
- `usage.spec.ts` (cloud projects): jpg-to-pdf happy path events in order with `o=page`; pdf-password lock: no body
  contains the typed password, the file name or a page count [GAP -> new].
- site / polish / growth specs: new pages in the page lists, related links, axe [TESTED -> extend].
- Regress: `regress:idphoto -- --fixtures-only` for new presets [TESTED -> extend]. Lighthouse for the 3 new URLs,
  thresholds unchanged. qa:visual for the new pages, light and dark.

### CI
- No new build variants. New specs run in the default e2e build; the `usage.spec.ts` additions run in the existing
  dist-bgcloud (usage on) build. lighthouserc gains the 3 URLs (median of 5; the CI runner is the source of truth).
- Gates per sub-step = CLOUD-HANDOFF §3 (check, unit, check-dist, licenses, e2e + no-upload, axe, Lighthouse, qa:visual,
  regress fixtures-only); T1 also `npm run check:quotes`.

## Out of Scope (to BUILD-LOG Known Gaps if they surface)
- 배경 흰색 or any face/background change in /id-photo/ (E1); libheif (E2); a HEIC·PNG→JPG tool (report #5, next).
- Print sheet (several photos on 4×6 paper), PNG output in pdf-to-jpg, PDF split / rotate / delete tools, 암호 바꾸기 in
  one go, permission/restriction editing, signature images on PDFs (report #8).
- `HOME_TITLE` rewrite; new deep-link params for the new tools.
- Visa photo checks beyond size / KB / background (glasses, expression): quoted guide text only.

## Escalations (owner decisions; the build proceeds on the defaults)
- **E1 배경 흰색.** Default (built): not offered; background warning + "흰 배경에서 다시 찍어 주세요". Option B: a
  「배경을 흰색으로」 button only for 이력서 (사람인·잡코리아), 반명함 and 직접 입력, hidden for every 여권·신분증·비자·시험
  preset, labelled "보정을 막지 않는 제출처에만 쓰세요". B costs either a ~100 MB first-time download (device path) or
  sending a face photo through the cloud path (privacy policy change, and it reverses the owner's 2026-10-05 rule that
  증명사진 stays out of the cloud lines). Arch recommends the default; revisit B only if usage shows the 이력서 presets
  are a large share.
- **E2 HEIC on Chrome / Windows / Android.** Default: native decode only (permissive-licence rule). Option: a logged LGPL
  exception for `libheif-js` (separate replaceable wasm ~1.46 MB raw, lazy, licence notice on /licenses/; HEVC patent
  risk not zero). Arch recommends deciding after usage shows the `fail c=heic` count.

## Acceptance (per sub-step)
- T0: no visible change; all gates green; budgets within 1 %.
- T1: Step 0 log complete; only quoted presets shipped; check:quotes OK; guides published only with sources;
  regress:idphoto green; FAQ 3 unchanged; usage preset enum equal.
- T2-T4: page live in nav, home, sitemap, llms.txt, OG and JSON-LD; e2e specs green on all 5 projects with the no-upload
  guard; usage events verified; budgets and precache within limits (or the page in NOT_PRECACHED, logged); Lighthouse
  thresholds met; copy passes the plain-language test; Richard "clear"; live smoke (CLOUD-HANDOFF §6) with real output
  checks (pages, bytes, dimensions, password behaviour).

## Log notes (copy into BUILD-LOG "TOOLS4 — brief" when T0 starts)
- 2026-10-06 Arch: TOOLS4 brief written (owner task: 시장 조사 1-4위). Order T0, T1, T2, T3, T4.
- Locked: no flags for T2-T4; no new dependencies; no libheif (licence rule); no background whitening in /id-photo/
  (외교부 quotes, the no-edit promise, the owner's cloud rule); new preset kind `print`; official head band needs
  `bandQuote` and carries `measure`; square presets without a head rule are not shipped; qpdf AES-256 lock/unlock with
  pdf.js verification; unlock only with a typed password, no restriction removal; signature warning in T4.
- Open escalations: E1 (배경 흰색 option B), E2 (libheif LGPL exception).
