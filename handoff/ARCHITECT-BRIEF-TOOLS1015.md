# Architect Brief — TOOLS1015: 글자수 세기 + 신분증 사본 만들기 + PDF 글자 넣기·편집

Author: Arch. Date: 2026-10-15. Worktree C:/dev/doc-tools-kr/wt/tools-1015 (branch tools-1015 = origin/main a7d76b8 +
scout report). Basis: `reports/growth/tool-scout-2026-10-15.md` (incl. the official Naver keyword-tool table).
Every TOOLS4/TOOLS5 rule (ARCHITECT-BRIEF-TOOLS4.md decisions 1, 2, 8-12, 16; ARCHITECT-BRIEF-TOOLS5.md decisions 4, 5,
11-13) applies unless overridden here. Arch does not touch BUILD-LOG: Bob copies "Log notes" (end) into BUILD-LOG when
C1 starts.

## Goal
Three new live tools, each its own reversible step (own commits, own Richard review, own deploy; one revert rolls it
back): **C** /char-count/ 글자수 세기, **I** /id-copy/ 신분증 사본 만들기 (+ sourced guide), **E** /pdf-edit/ PDF 글자
넣기·편집. Zero new npm dependencies, no new wasm, no new font files.

## Order (N+1 starts only after N is deployed, live-smoked and logged)
- **C1** /char-count/ (S, ~1-1.5 days).
- **I0** Step 0 sourcing for the 신분증 guide (may run during C1 review waits; touches no shipped file).
- **I1** /id-copy/ tool (M-, ~2-3 days). **I2** guide `id-card-copy` (~1 day; same deploy as I1 or right after).
- **E0** refactor only: page stage out of the pdf-sign controller (~1 day, no visible change, own commit + own gate).
- **E1** /pdf-edit/ text · date · white box (M, ~3-4 days). **E2** option 「가린 쪽을 그림으로 바꿔 저장」 (~1 day, own
  commit, may ship after E1).
- **Out, noted:** 4th candidate QR코드 만들기 (117,000/월, ad clicks 184; off-brand for a 서류 site) → BUILD-LOG Known
  Gaps "next candidates" with 문서 스캔. No work in this brief.

## Locked decisions (all steps)
1. **Slugs (ASCII, keyword-shaped like the existing ones):** `char-count`, `id-copy`, `pdf-edit`. Korean keywords live in
   title/h1. Guide slug `id-card-copy`. Renaming after ship needs a `public/_redirects` line (owner O1).
2. **Font budget = zero new core glyphs (Arch decision; no owner call).** Core = every file outside src/tools/** and
   src/lib/** (pages, tools.ts title/description/summary/FAQ, og.json, site.ts, quicklinks); headroom ~20 bytes.
   Measured on this base with `uiCharSets` (scripts/lib/ui-font-chars.mjs): every glyph of the names, titles and
   descriptions below is already core. **Known missing core glyphs — never in core copy:** 뒷 덮 띄 왜 콘 앞 굳 완 얗 랑
   좌 융 킹 ○ ● ✓. Substitutes: 뒷자리 → 「뒤 7자리」; 덮기 → 「가리기」; 띄어쓰기 → 「공백(빈칸)」; 이모티콘 → leave
   out; ○○ → 「회사 제출용」 as the example; 앞뒷면 → 「양면」/「두 면」; 굳히기 → 「그림으로 바꿔 저장」; 완전히 →
   「남지 않게」; 파랑 → only in late copy (colour labels live in the controller). Late copy (src/tools/**, src/lib/**)
   may use any glyph; guide markdown renders in the system font. gen-ui-font logs new core characters: Bob lists them
   per step (must be none) with the tripwire margin. On breach: rephrase. Never raise the 94,884 B tripwire, never add a
   preload. If meaning cannot survive, escalate to Arch with the character list (option: late-face block below the fold).
   Helper Bob may reuse: `node -e` over `uiCharSets('src').core` to test a draft string before committing it.
3. **Registration per tool** = TOOLS4 decision 9 list: tools.ts entry (FAQ numbers from limits.ts via tool-facts), page,
   og.json + gen-brand OG image, JSON-LD (same jsonld.ts builders as /pdf-sign/), sitemap + llms.txt via the existing
   generators, tool-facts, guides.ts NEXT_GUIDES + tool-guide-order.ts, lighthouserc, qa:visual, site / polish / growth
   e2e lists, postbuild OG list, CLAUDE.md line 3 (tool names), docs/COPY.md if a new term, bgcloud LOCAL_SCOPE_RE,
   `updated` = ship date. HOME_DESC_ORDER (src/data/site.ts): `pdf-edit` after `image-to-jpg`, `id-copy` after
   `pdf-sign`, `char-count` after `id-copy` (demand × click intent). Home cards and menu mirror the current rule (no
   invented order). Pinned-test rule: each step adds its own id.
4. **Live at deploy, no flag, NOT_PRECACHED + RUNTIME_PAGES** (scripts/gen-sw.mjs) for all three pages. Precache is
   421.8/450 KB (cloud) after REQ1015; Bob logs precache KB for default, cloud flag-on and autoframe builds per step.
   450 is never raised.
5. **Budgets:** initial JS per page < 30 KB gzip; each new lazy controller/worker = measured gzip + 20 %, written into
   check-dist like the pdf-sign block (controller not in initial JS; pdf.js / pdf-lib / fontkit / workers never in
   initial JS). Existing budgets within 1 % (E0 especially).
6. **Usage** (single source scripts/lib/usage.mjs; TOOLS += slug in its own step; TOOL_LABELS = names; SETTINGS +
   SETTING_LABELS + VALUE_LABELS; FAIL_LABELS for any new code). Never text, counts, file names, sizes, coordinates,
   watermark words, page numbers. If /privacy/ enumerates setting keys, add the new ones (core copy → decision 2).
7. **Copy rules:** 문서딱 only; no 업로드/서버/브라우저/네트워크/메모리/px/dpi/EXIF (postbuild JARGON); lead with what the
   tool does; "보내지 않습니다" only beside the picker / FAQ / privacy (TOOLS4 decision 8); name = h1; title ≤ 40,
   description 40-80 characters (meta-length). Bob may tune wording within these rules; lengths below were measured.
8. **Out of scope everywhere:** English twins, /embed/ widgets, deep-link params for the new tools, ad placement.

---

## C1 — /char-count/ 글자수 세기

### Decisions
- **What it counts** (pure `src/tools/char-count/count.ts`, no DOM):
  - Input normalized: `\r\n` and `\r` → `\n`.
  - 공백 포함 = grapheme clusters (`Intl.Segmenter('ko', {granularity: 'grapheme'})`); fallback when the API is missing
    = code points (`[...s].length`). Newline = 1.
  - 공백 제외 = graphemes that are not whitespace (`/^\s+$/u`: space, tab, newline, NBSP, U+3000).
  - 바이트(한글 2) = per code point: U+0000-U+007F → 1, everything else → 2. 바이트(한글 3) = UTF-8 length
    (`TextEncoder`). Newline = 1 byte in both. Labels 「한글 2바이트로 셀 때」 / 「한글 3바이트로 셀 때」; never
    "UTF-8"/"EUC-KR" in copy.
  - 줄 수 = 0 for empty text, else lines split on `\n`. 문단 수 = non-empty blocks separated by ≥ 1 blank line.
- **Byte-rule claims (verified 2026-10-15, fetched):** 사람인 `https://www.saramin.co.kr/zf_user/tools/character-counter`
  shows only 「공백 포함 … byte / 공백 제외 … byte」; 잡코리아 `https://www.jobkorea.co.kr/service/user/tool/textcount`
  shows only 「총 0자 (0byte)」 and 「자기소개서 작성 시, 기업별로 요구하는 글자수에 맞는지 체크하세요.」. **Neither states
  bytes per 한글 or per newline**; 공기업 forms not checked. → Copy never says which site uses which rule. Both byte
  numbers shown; FAQ says counts can differ by site, leave a margin. No reverse-engineering of their scripts for copy.
- **Goal bar:** number input (1-100,000) + basis select [공백 포함 (default) | 공백 제외 | 바이트(한글 2) | 바이트(한글 3)];
  chips 500 · 700 · 1,000 · 1,500자. `<progress>` + text 「N자 남았어요」 / 「N자 넘었어요」 (bytes: 「바이트」). Over-goal
  uses the existing error colour **and** text. `aria-live="polite"` announces only when crossing the goal.
- **Buttons:** 복사하기 (`navigator.clipboard.writeText`; refused → select-all + late text 「Ctrl+C로 복사하세요」);
  지우기 (keeps the cleared text in a closure; 「되돌리기」 shows until the next input).
- **Storage: none.** No localStorage / sessionStorage / IndexedDB. `beforeunload` prompt attached only while the text is
  non-empty, removed when it empties (bfcache kept for empty pages). FAQ says the text is not saved.
- **Engine:** if the controller is < 5 KB gzip it ships in the initial JS (no lazy split); budget line
  `char-count initial JS` = measured + 20 %. Recount on `input` through one `requestAnimationFrame`.
- **Not built (Known Gaps):** several 문항 at once, 원고지 매수, 단어 수, `?goal=` deep link, draft saving.

### Copy (core; measured, all glyphs core)
- name = h1: 글자수 세기 · title (35): 「글자수 세기 — 자소서 공백 포함·제외, 바이트 무료 | 문서딱」
- description (64): 「자소서 글자수를 공백 포함·제외와 바이트로 바로 셉니다. 목표 글자 수까지 남은 양도 보여 줘요. 가입 없이 무료.」
- summary: 「붙여 넣은 글의 글자 수를 공백 포함·제외와 바이트로 셉니다.」
- FAQ (5): 공백 포함과 공백 제외는 무엇이 다른가요? (공백(빈칸)·줄바꿈을 세는지; 문항에 적힌 기준의 숫자를 보기) · 바이트가
  두 가지로 나오는데 어느 것을 보나요? (한글 2 / 3바이트, 영문·숫자·공백은 1; 받는 곳 안내 기준; 몇 자 여유) · 줄바꿈은
  어떻게 세나요? (공백 포함 1자, 공백 제외에서 뺌; 받는 곳과 조금 다를 수 있음) · 쓴 글이 저장되나요? (저장하지 않음; 닫으면
  사라지니 따로 저장) · 자소서를 다 쓴 다음에는? (links: 사람인·잡코리아 규격 증명사진, 고용24 이력서 올리기 guide).
- keywords: 글자수 세기, 글자수 계산기, 자소서 글자수 세기, 공백 제외 글자수, 바이트 계산기.
- Static help (3-step 사용 방법 + one 알아 두면 좋아요) in the /image-to-jpg/ layout.

### Chains
- Static block under the tool 「자소서를 다 썼다면」: 이력서 사진 사람인 규격 → `/id-photo/?preset=saramin`, 잡코리아
  규격 → `/id-photo/?preset=jobkorea`, guides `work24-resume-upload`, `resume-photo`. A click to /id-photo/ sends `next`
  (o=next, v=id-photo) once per page view. No file handoff (no FLOW entry).
- RelatedTools: id-photo, photo-compress, jpg-to-pdf. NEXT_GUIDES: resume-photo, work24-resume-upload, univ-docs-upload.
- Inbound: one-sentence body link to /char-count/ in guides `resume-photo` and `work24-resume-upload` (`updated` bumped).

### SEO note
Naver answers 「글자수 세기」 in its own widget (ad clicks 0 of 1,068,900/월): expect little Naver traffic. Title and
description target Google and the 자소서 context. JSON-LD WebApplication + FAQPage like the other tools.

### Usage
TOOLS += `char-count`. `pick` once per page view on the first non-empty input. `start` once per page view when a goal is
first set: o=`basis`, v ∈ ['space','nospace','byte2','byte3'] (labels 공백 포함 / 공백 제외 / 바이트(한글 2) / 바이트(한글
3)). No success/download/fail. Never the text, counts or goal number.

### Files
`src/tools/char-count/{count,controller,entry}.ts`, `src/pages/char-count/index.astro`, src/data/{tools,site,og,
guides,tool-guide-order}, scripts/lib/usage.mjs, scripts/gen-sw.mjs, scripts/check-dist.mjs, lighthouserc.json, 2 guide
.md body links, tests, CLAUDE.md line 3.

---

## I — /id-copy/ 신분증 사본 만들기 (+ guide)

### I0 Step 0 — guide sourcing (BUILD-LOG report before I2; check:quotes `--exact`)
- Facts in hand (official keyword tool, 2026-10-15): 신분증사본 17,230 (모바일 12,600), 신분증사본발급 10,280, 가리기·
  마스킹·워터마크 < 30 combined. **Demand is 「발급·제출 방법」**: the guide carries the traffic, the tool converts it.
- The scout's only source for 「뒷자리·주소 가리기 + 용도 워터마크」 is 보안뉴스 2026-08-12, which names **no official
  body** (verified 2026-10-15: 「…방법으로 자주 언급된다.」 and the reporter's own 「…지우는 것이 좋다.」). Not citable.
- Candidates (official only; `via: browser` where the schema allows): 국가법령정보센터 개인정보 보호법 제24조의2
  주민등록번호 처리의 제한 (lsInfoR.do path; the `/법령/…/제24조의2` URL returns only the title shell); 정부24 주민등록표
  등본(초본) 교부 page (answers 「발급」: 사본은 발급 서류가 아니고 등본·초본은 정부24); 금융감독원 / 금융위원회 소비자
  경보 on 신분증 사본 유출·비대면 계좌 개설 피해; 개인정보보호위원회 / KISA 개인정보 포털 (privacy.go.kr) on 신분증
  사본; 행정안전부 모바일 신분증 page. Log every URL tried with its result (`tried` field).
- Rule: any rule, number or recommendation sentence needs a verbatim quote. **No official quote for 「가리고 용도 문구를
  넣으라」 → the guide attributes it to nobody**: it is a how-to (what the tool does) plus 「받는 곳이 꼭 필요하다고 하지
  않은 정보는 가려도 되는지 먼저 물어보세요」. Guide ships with ≥ 3 sourced facts; fewer → I2 waits, I1 ships alone (Arch
  decision, logged).

### Decisions (I1 tool)
- **Input:** one photo (jpeg / png / webp / heic native / avif via `sniff` + `decodeImage`; HEIC failure → existing
  `ERRORS.heic`). PDF input out of scope. Decode long edge capped at 2,000 px (no upscaling) + `fitWithinCaps`.
- **Edit stage:** rotate 90° steps; optional rectangle crop (default = whole photo; same box drag code); **가릴 곳 추가**
  = opaque black boxes, free aspect, drag / corner resize / arrow keys, delete per box, max 20. No auto-detection, no
  OCR, **no blur/mosaic** (not a safe mask).
- **용도 문구 (watermark):** field 「어디에 낼 건가요」 (e.g. 회사 이름) → line 1 「{입력} 제출용」, line 2 「다른 용도 사용
  금지」, line 3 date `YYYY.MM.DD` (local date; toggle). Drawn at -30°, tiled over the whole image (cannot be cropped
  out), grey ~35 % opacity, canvas system sans-serif (pixels only: no UI-font impact). Size auto from image width; live
  preview. On once the field has text; empty → late note 「용도 문구를 넣으면 다른 곳에 쓰이는 것을 막는 데 도움이
  됩니다」 (no authority named).
- **Flatten:** one canvas: photo (rotated, cropped) → black boxes → watermark → `toBlob('image/jpeg', 0.9)`. Output =
  re-encoded pixels: no EXIF/GPS, no layers, covered pixels gone. **PDF** = that same JPEG through the existing
  `images.worker` (jpg-to-pdf), layout A4 portrait centred, `canEmbedRaw` path; no second pdf-lib copy, no text objects.
  No real-card-size print layout (주민등록증 크기 unsourced, existing Known Gap).
- **Outputs:** 「JPG로 저장」 `신분증_사본_{YYYYMMDD}.jpg` and 「PDF로 저장」 `.pdf`: fixed names, never the input name
  (it may hold a person's name). Next-steps row under the PDF button: FLOW `'id-copy': ['pdf-password', 'pdf-compress']`
  (NextSource += id-copy).
- **Privacy:** nothing stored; canvases / bitmaps released on reset and on leave; no beacon field carries any of the
  text or image. 「사진은 이 기기 밖으로 보내지 않습니다」 beside the picker + FAQ only (decision 7).
- **Limits:** image-to-jpg single-file numbers (phone 50 MB / PC 100 MB) in `src/tools/id-copy/limits.ts`.

### Copy (core; measured)
- name = h1: 신분증 사본 만들기 · title (39): 「신분증 사본 만들기 — 주민번호 가리기·용도 문구 넣기 무료 | 문서딱」
- description (≈69): 「신분증 사진에서 주민번호 뒤 7자리와 주소를 가리고 「회사 제출용」 문구를 넣어 JPG·PDF로 저장해요. 가입 없이
  무료.」 (Bob re-measures.)
- summary: 「신분증 사진의 주민번호·주소를 가리고 용도 문구를 넣어 사본을 만듭니다.」
- FAQ (6): 신분증 사본은 어디서 발급받나요? (발급 서류가 아니라 신분증을 복사·촬영한 것; 등본·초본은 정부24 — wording
  must match the I0 quotes; link the guide) · 무엇을 가려야 하나요? (받는 곳이 요구하지 않는 정보; 주민등록번호 뒤 7자리와
  주소를 많이 가림; 가려도 되는지 먼저 물어보기) · 가린 부분을 다시 볼 수 있나요? (없음: 사진 자체를 칠해서 저장, JPG·PDF
  어디에도 원래 글자가 남지 않음) · 용도 문구에는 무엇을 쓰나요? · 양면을 한 파일로 내야 하면? (두 면을 각각 저장 → 사진 PDF
  변환에서 합치기, link /jpg-to-pdf/) · 사진이 어디로 보내지나요? (어디로도 보내지 않음).
- keywords: 신분증 사본, 신분증 사본 만들기, 주민번호 가리기, 신분증 워터마크, 신분증 사본 워터마크.

### Chains
- RelatedTools: jpg-to-pdf, photo-compress, pdf-password. NEXT_GUIDES: id-card-copy (after I2), kosaf-docs,
  univ-docs-upload. Inbound one-sentence body links: kosaf-docs, univ-docs-upload, work24-resume-upload, id-card-photo
  (only where the guide talks about 신분증 사본 / 제출 서류; skip and log an off-topic one).

### I2 guide `id-card-copy` 「신분증 사본 만드는 법·가리는 법」
`tools: ['id-copy']`, cta `{href: '/id-copy/', label: '신분증 사본 만들기'}`, related id-card-photo, kosaf-docs,
univ-docs-upload. Sections: 신분증 사본이란 (발급 vs 등본·초본) · 휴대폰으로 사본 만드는 순서 · 가리기와 용도 문구 · 보내기
전에 확인할 것 · FAQ. Every rule/number cited with fetch date (I0). Dup gate (shingles) passes; ≥ 4 distinct internal
body links (existing rule); answer one sentence ≤ 120 chars (schema).

### Usage
TOOLS += `id-copy`. pick / start / success / download / fail as image tools. `start` o=`mark`, v ∈ ['on','off'] (용도
문구 넣음 / 안 넣음). Fail codes: heic, not-image, corrupt, too-big, canvas, oom, encoder, engine, unknown. Never box
counts, positions, the watermark text or dates.

### Files
`src/tools/id-copy/{limits,mask,watermark,controller,entry}.ts` (mask.ts / watermark.ts pure: box clamp, crop/rotate
mapping, tile layout, date format, file name), `id-copy.css`, `src/pages/id-copy/index.astro`,
`src/content/guides/id-card-copy.md` (I2), src/lib/ui/next-steps.ts (source id-copy), registration files (decision 3).
images.worker reused unchanged.

---

## E — /pdf-edit/ PDF 글자 넣기·편집

### E0 — refactor only (one commit, no visible change)
- Move the page preview + overlay mechanics out of `src/tools/pdf-sign/controller.ts` (1,010 lines) into
  `src/lib/pdf/page-stage.ts`: render page k with pdf.js (via `inspect.ts`), page navigation, overlay layer, pointer
  drag / corner resize / arrow-key move (1 pt, Shift 10), selection, `toPdfRect` use. Items are generic
  (`{box, render(el), resizeMode: 'aspect' | 'free'}`); pdf-sign passes its image item with `aspect`.
- `place.ts`: add pure `resizeFree(box, w, h, pageW, pageH)` (MIN_EDGE kept) beside `resizeBox`. Move place.ts to
  `src/lib/pdf/place.ts` only if that is the smaller diff (Bob picks, logs).
- Gate: pdf-sign + stamp-signature e2e unchanged and green on 5 projects; pdf-sign lazy budget line (18.4 KB) within
  1 %; merge.worker bytes identical.

### Decisions (E1)
- **Honest scope (near the top + FAQ):** 「새 글자를 넣고, 필요 없는 곳을 흰 상자로 가립니다. 원래 있던 글자를 고치지는
  못해요.」 Late note next to the 흰 상자 button: 「흰 상자는 위에 덮는 것이라 밑의 글자는 파일 안에 남습니다.」 (+ the E2
  option once shipped).
- **Items:** 글자 (multi-line, user line breaks only, no auto-wrap); 오늘 날짜 (text item prefilled, formats
  [2026. 10. 15. (default) | 2026년 10월 15일 | 2026-10-15], local date); 흰 상자 (white fill, free resize). Text item:
  size 6-48 pt (default 11; slider + corner handle scales size), colour [검정 #000000 | 파랑 #1d4ed8]. Max 200 items per
  document. Text on every page: not in E1 (Known Gap).
- **Font (reuse, no new files):** the HWP PDF face list (`/fonts/hwp/hwp-pdf-faces.*.json`, Noto Sans KR OFL slices
  from scripts/gen-hwp-fonts.mjs; family `Anolim HWP Sans`, weight 400). Output: `createFontSource()` +
  `FaceTable.resolve(chain, 400, cp)` per code point (src/lib/hwp/pdf/font-source.ts, faces.ts), split text into runs
  per resolved face, `embedFont(face.sfnt, { subset: true })` (WOFF 1.0 siblings through `woffToSfnt`, the
  spike-proven path; **never WOFF2 into fontkit** — woff.ts header), `drawText` per run advancing by
  `widthOfTextAtSize`; each face embedded once per document. Preview: the hwp-shared font CSS
  (src/tools/hwp-shared/fonts.ts loader), same family, so screen metrics match the output. **A character no face
  covers** (e.g. emoji) → item error 「넣을 수 없는 글자: X」 and save disabled until removed (never a silent box or drop).
- **Geometry:** pure `src/tools/pdf-edit/text-place.ts` `textOrigin(box, pageInfo, ascent, size)` → PDF point + rotate
  degrees, same convertToPdfPoint semantics as pdf-sign's `toPdfRect` (/Rotate 0/90/180/270, CropBox origin); white box
  via `toPdfRect` + `drawRectangle` (white, no border). Line height 1.3 × size.
- **Writer:** `src/lib/pdf/edit.ts` (load as `signPdf` does: password, `hasSignature`, PDF/A-1 object-stream retry,
  producer 문서딱) in a **new `edit.worker.ts`** (pdf-lib + fontkit + faces), keeping fontkit out of merge.worker, which
  pdf-merge / split / sign load. Font fetch runs in the worker (font-source's same-origin `/fonts/hwp/` guard). Budget:
  measured + 20 %, never above the hwp export chunk's 360 KB.
- **Output:** original pages stay vector (content appended; forms / links kept). Name `{base}_작성.pdf`. Encrypted input:
  mirror pdf-sign (prompt; output without password + note + link). Signed input: pdf-sign's SIGNATURE_NOTE before
  download. Limits = pdf-sign LIMITS (`src/tools/pdf-edit/limits.ts` re-exports or mirrors).
- **Chains:** FLOW `'pdf-edit': ['pdf-sign', 'pdf-compress', 'pdf-password']`; NextTarget += `pdf-edit`, appended **last**
  to the rows of `hwp-to-pdf`, `pdf-merge`, `pdf-password-unlock` (NEXT_LABELS 'PDF 글자 넣기·편집' = tools.ts name).
  RelatedTools: pdf-sign, pdf-merge, pdf-compress; pdf-sign gains pdf-edit. NEXT_GUIDES: pdf-sign, gov24-pdf-save,
  e-signature-law (Bob checks each is published). Inbound one-sentence body links: guides pdf-sign, gov24-pdf-save,
  yearend-tax-pdf.

### Decisions (E2 — option, own commit)
Checkbox shown only when a white box exists: 「흰 상자로 가린 쪽은 그림으로 바꿔 저장(밑의 글자가 남지 않게)」, default
**off** (keeps text selectable and the file small; the white-box note says when to turn it on). On: after E1's save,
render each affected page of the result with pdf.js at 200 ppi through `fitWithinCaps` (raster-render.ts), JPEG 0.9,
replace it with a same-size page holding only that image. Late note: 「N쪽을 그림으로 바꿔 저장했어요. 그 쪽의 글자는
복사할 수 없어요.」 Verify: `getTextContent()` of replaced pages is empty.

### Copy (core; measured)
- name = h1: PDF 글자 넣기·편집 · title (36): 「PDF 편집 — 글자 넣기·흰 상자로 가리기·날짜 무료 | 문서딱」
- description (68): 「PDF 빈칸에 글자와 날짜를 넣고 필요 없는 곳은 흰 상자로 가려요. 원래 있던 글자를 고치지는 못해요. 가입 없이
  무료.」
- summary: 「PDF 빈칸에 글자와 날짜를 넣고, 흰 상자로 필요 없는 곳을 가립니다.」
- FAQ (6): 원래 있는 글자를 고칠 수 있나요? (아니요; 흰 상자로 가리고 그 위에 새 글자) · 흰 상자로 가린 내용은 지워지나요?
  (아니요, 위에 올리는 것이라 파일 안에 남아 글자 복사로 볼 수 있음; E2 이후 「그림으로 바꿔 저장」) · 넣은 글자는 복사·검색이
  되나요? (됨, 무료 글꼴) · 서명도 넣을 수 있나요? (PDF 서명·도장 넣기 link) · 비밀번호·전자서명 문서 (pdf-sign wording) ·
  휴대폰에서도 되나요? 크기 제한? (numbers from limits). Every FAQ string through the glyph check (decision 2).
- keywords: pdf 편집, pdf 수정, pdf 글자 넣기, pdf 텍스트 넣기, pdf 편집 무료.

### Usage
TOOLS += `pdf-edit`. `start` o=`items`, v ∈ ['text','date','white','mix'] (what the saved document got; labels 글자 /
날짜 / 흰 상자 / 여러 가지). E2 adds no field. Fail codes: not-pdf, corrupt, wrong-password, too-big, font (new: a font
slice could not be fetched; FAIL_LABELS 「글꼴을 불러오지 못함」), canvas (E2), oom, engine, unknown.

### Files
E0: `src/lib/pdf/page-stage.ts`, `src/tools/pdf-sign/{controller,place}.ts`. E1: `src/tools/pdf-edit/{limits,items,
text-place,controller,entry}.ts`, `edit.css`, `src/lib/pdf/{edit.ts,edit.worker.ts}`, `src/pages/pdf-edit/index.astro`,
src/lib/ui/next-steps.ts, registration files. E2: `src/tools/pdf-edit/flatten.ts` + controller wiring.


---

## Flow diagrams
```
C1 /char-count/
textarea input -> rAF -> normalize CRLF -> count(): graphemes | non-space | bytes2 | bytes3 | lines | paragraphs
   -> numbers + goal bar (basis) -> crossed goal? -> aria-live once
first input -> usage pick (once) ; goal set -> usage start o=basis (once)
non-empty -> beforeunload on ; empty -> off ; copy -> clipboard | select-all fallback
```
```
I1 /id-copy/
pick photo -> sniff -> decode (cap 2,000) --heic fail--> ERRORS.heic (+usage fail c=heic)
   -> stage: rotate | crop | 가릴 곳 boxes (opaque) | 용도 문구 (tiled, -30 deg) live preview
   -> 만들기: one canvas: photo -> black boxes -> watermark -> toBlob(jpeg 0.9)   [pixels only, no metadata]
        |-> JPG download (fixed name)
        \-> images.worker (A4, raw embed) -> PDF download -> next: pdf-password | pdf-compress
```
```
E1/E2 /pdf-edit/
pick PDF -> inspect (password? -> prompt) -> page-stage (E0) page k
   items: text | date | white (move / resize / keys, size, colour); uncovered glyph -> item error, save disabled
   save -> edit.worker: load -> text runs: FaceTable.resolve -> embed subset once -> drawText(rotate)
                       white -> drawRectangle -> save
        -> verify page count -> signed? warn -> [E2 on and white boxes? render pages -> JPEG -> replace] -> download
        -> next: pdf-sign | pdf-compress | pdf-password
```

## Unverified claims (Bob probes, logs verbatim; nothing assumed)
- (a) `Intl.Segmenter` present in all 5 Playwright projects; fallback unit-tested either way.
- (b) Byte rule of 사람인 / 잡코리아 / 공기업 forms: **not stated on their counter pages (fetched 2026-10-15)**; copy claims
  nothing, so no probe.
- (c) fontkit subset of a Noto Sans KR WOFF 1.0 slice through pdf-lib `drawText` renders correct Hangul in pdf.js and in
  the Chrome/Edge viewer, and `getTextContent()` returns the inserted string (ToUnicode). E1 e2e + one manual open in a
  desktop reader (Adobe or 한컴 PDF if available; log).
- (d) Same-origin fetch of `/fonts/hwp/` from a module worker passes CSP and the e2e no-upload guard.
- (e) `textOrigin` upright on /Rotate 90/270 and CropBox-offset fixtures (pixel e2e, as TOOLS5 U3 (d)).
- (f) Canvas Hangul with the system font draws on all 5 projects (watermark); e2e compares pixels with / without the
  watermark inside the tile area, not glyph shapes.
- (g) I0: which official pages state 신분증 사본 facts. No quote → no claim.

## Failure modes
| Path | Realistic failure | Handling | User sees |
|---|---|---|---|
| C count | Browser without Intl.Segmenter | code-point fallback (unit) | differs only for emoji |
| C byte | Site counts bytes differently | both rules shown + FAQ margin advice | clear |
| C loss | Tab closed with a long 자소서 | beforeunload while non-empty; FAQ: not saved | browser prompt |
| C perf | 100,000-char paste | one rAF recount; unit perf < 50 ms | smooth |
| C clipboard | clipboard API refused | select-all fallback + late text | clear |
| I decode | HEIC on Chrome/Windows | ERRORS.heic + fail c=heic | clear |
| I leak | Covered digits recoverable | opaque fill burned into pixels, re-encode; e2e: masked pixels ≤ 8/255, no EXIF; PDF has 1 image XObject, no text | — |
| I leak | Original photo bytes in the PDF | PDF built only from the flattened JPEG (unit: worker input is the canvas blob) | — |
| I watermark | Cropped out later | tiled over the whole image | — |
| I canvas | 48 MP iPhone photo | decode cap 2,000 + fitWithinCaps | works |
| I trust | Masking seen as required or sufficient | FAQ: ask the receiver; no authority claimed | clear |
| E font | Slice fetch fails (offline / 404) | fail c=font; late message 「글꼴을 불러오지 못했어요. 인터넷 연결을 확인하고 다시 저장해 주세요.」 | clear |
| E glyph | Emoji / rare char | item error, save disabled | clear |
| E geometry | Rotated page → sideways text | textOrigin + rotate; unit 0/90/180/270 × CropBox; pixel e2e | — |
| E white box | User thinks content is deleted | honest note + FAQ; E2 option | clear |
| E signed / encrypted | 전자서명 broken / password | pdf-sign handling reused | clear |
| E memory | 300 pages + many slices | each face once; pdf-sign limits | limit message |
| E2 raster | Page over canvas caps / canvas fail | fitWithinCaps; fail c=canvas, nothing saved | clear |
| E0 | Refactor changes pdf-sign | pdf-sign e2e on 5 projects + budget within 1 % | — |
| All | precache / font tripwire / budgets | check-dist fails loudly | — |

No critical gaps: every new path has handling plus a test, or fails the build.

## Test map ([GAP → new] unless marked)
Unit (vitest):
- C: count() — empty, ASCII, Hangul, mixed, CRLF, tab, NBSP, U+3000, emoji ZWJ family (1 grapheme; fallback logged),
  decomposed jamo; bytes2 / bytes3; lines / paragraphs (trailing newline, several blank lines); goal text (남았어요 /
  넘었어요, byte wording); 100k-char perf.
- I: box clamp / min size / max 20; crop + rotate mapping; tile layout covers the corners for 3 aspect ratios; date
  format; fixed names; flatten order (injectable canvas, @napi-rs/canvas as today).
- E0: resizeFree; page-stage pure parts; pdf-sign place suite [TESTED, regression].
- E1: textOrigin 0/90/180/270 × CropBox (0,0)/(36,36); run split per face (Hangul + Latin + digits; uncovered char
  reported); date formats; items → `items` value; size clamp. edit.ts in Node with the built face list: output parses,
  same page count, `getTextContent` contains the string.
- E2: affected-page selection; replaced page has no text.
- usage.mjs: new tools / settings / values / `font` code accepted, unknown rejected, admin labels Korean [TESTED → extend].
- next-steps: FLOW / NEXT_LABELS equal to tools.ts names [TESTED → extend].
- postbuild / check-dist: sitemap, llms.txt, OG list, JARGON, meta lengths, no heavy engine in initial JS, budgets, font
  coverage + tripwire [TESTED → extend].

E2E (all 5 projects, no-upload guard on every test; Bob runs webkit + firefox + mobile-safari locally before review):
- `char-count.spec.ts`: paste fixture → 5 numbers exact; goal 10 → over text + progress value; basis switch; copy
  (Chromium clipboard) and fallback; clear + 되돌리기; beforeunload only when non-empty; storage untouched (local and
  session length unchanged); saramin / jobkorea links open the preset.
- `id-copy.spec.ts`: JPG with GPS EXIF → box over a known region → JPG masked pixels black, no EXIF/GPS; PDF: 1 A4 page,
  1 image, getTextContent empty, rendered masked region black; watermark on → tile-area pixels differ; rotate; crop;
  HEIC fixture → heic message (chromium, firefox); next → /pdf-password/ receives the file; fixed names.
- `pdf-edit.spec.ts`: 「홍길동 2026. 10. 15.」 on page 1 → getTextContent contains it, render dark pixels in the box ± 2 px;
  blue sampled; white box over fixture text → rendered white, text still extractable (honesty); E2 on → no text on that
  page; rotated-90 + CropBox fixtures; encrypted → prompt → note; signed → warning; emoji → save disabled; font route
  blocked → font message (+ fail c=font on cloud); next rows.
- `pdf-sign.spec.ts`, `stamp-signature.spec.ts`, chain specs [TESTED, regression] (E0 + new FLOW entries).
- `usage.spec.ts` (cloud): each happy path with its setting; bodies never contain text, counts, names, watermark words,
  coordinates.
- site / polish / growth: page lists, related, axe, no-late-face checks [TESTED → extend]. Lighthouse: 3 new URLs, LCP
  ≤ 2,000 ms, thresholds unchanged. qa:visual light and dark + 360 px.

## Gates (per step; CLOUD-HANDOFF §3)
astro check 0 · vitest all · check:licenses OK (no new package) · check:quotes --exact (I2 and edited guides) ·
check-dist OK on default, cloud flag-on, autoframe, bg builds (precache KB logged) · 0 new core glyphs (margin logged) ·
new + regression e2e on 5 projects · lhci median of 5 · Richard "clear".

## Live smoke (after each deploy)
- C1: paste a 자소서 sample on phone + PC; numbers equal local; goal bar; saramin link opens the preset.
- I1: phone photo of a sample card (owner device for iPhone HEIC); JPG + PDF; PDF text selection finds nothing; masked
  area solid when zoomed; beacon and GA requests carry no text.
- I2: guide live, sources open, CTA, sitemap / RSS / llms.txt entries.
- E1 / E2: fill a 정부24 PDF form with name + date; open in the Chrome viewer + one desktop reader; text selectable;
  rotated fixture upright; E2 page not selectable.

## Out of Scope (BUILD-LOG Known Gaps if they surface)
- QR코드 만들기 (4th candidate, noted), 문서 스캔, 사진 합치기 (양면 한 장).
- C: 여러 문항, 원고지, 단어 수, draft saving, `?goal=`.
- I: PDF input, auto-detection / OCR, blur or mosaic, real-size card print, two sides on one page.
- E: editing existing text, AcroForm field filling, check marks, drawing pad, bold or other fonts, text on all pages,
  page numbers, watermark, rasterizing whole documents.

## Owner decisions (build proceeds on the defaults)
- **O1 slugs** `/char-count/`, `/id-copy/`, `/pdf-edit/` (default). Change before C1 ships or pay a redirect later.
- **O2 push:** standing go-ahead per step when Richard is clear and CI is green (as TOOLS5 O5); owner confirms once.
- **O3 real-phone check (owner-only):** /id-copy/ with an iPhone HEIC photo and an Android camera photo after I1.
- Arch-decided (no owner call): zero new core glyphs; no draft storage on /char-count/ (beforeunload instead); opaque
  fill only on /id-copy/; E2 default off; byte-rule claims left out (unsourced).

## Acceptance (per step)
- Page live (nav, home, sitemap, llms.txt, OG, JSON-LD, related, NEXT_GUIDES); new e2e green on 5 projects with the
  no-upload guard; usage verified on the cloud build; NOT_PRECACHED + RUNTIME_PAGES; precache ≤ 450 KB in all builds;
  0 new core glyphs; Lighthouse LCP ≤ 2,000 ms; COPY.md; Richard "clear"; live smoke above.
- E0: no visible change; budgets within 1 %; pdf-sign e2e green.
- I2: check:quotes --exact passes; every rule or number cited with fetch date; ≥ 3 sourced facts or I2 deferred (logged).

## Log notes (copy into BUILD-LOG "TOOLS1015 — brief" when C1 starts)
- 2026-10-15 Arch: TOOLS1015 brief (owner: maximize traffic; scout 2026-10-15 + official Naver keyword table). Order C1
  /char-count/, I0-I2 /id-copy/ + guide id-card-copy, E0 refactor, E1 /pdf-edit/, E2 「가린 쪽을 그림으로」 option.
- Locked: zero new core UI-font glyphs (missing on this base: 뒷 덮 띄 왜 콘 앞 굳 완 얗 랑 좌 융 킹 ○ ● ✓); no new deps,
  wasm or font files; pdf-edit reuses the HWP PDF face list (Noto Sans KR WOFF 1.0 slices, subset embed) in a new
  edit.worker; id-copy reuses decode + images.worker, opaque fill + tiled watermark burned into one JPEG; char-count
  stores nothing.
- 사람인 / 잡코리아 counter pages state no per-character byte rule (fetched 2026-10-15) → copy shows both rules, claims
  neither. 보안뉴스 2026-08-12 names no official body → not a guide source.
- QR코드 만들기: 4th candidate, out of scope (Known Gaps "next candidates" with 문서 스캔).
- Open: O1-O3.
