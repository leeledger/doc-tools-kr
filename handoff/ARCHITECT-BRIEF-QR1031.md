# Architect Brief — QR1031: QR코드 색 바꾸기 + 로고·사진 넣기

Owner 2026-10-31: 「qr코드 생성 기능 추가해」 → chose 「색·가운데 로고」. One step, one PR (branch qr1031, worktree
C:\dev\doc-tools-kr\wt\qr1031, E2E_PORT=4273). Commits: (1) engine refactor with defaults byte-identical, (2) behavior + UI,
(3) copy/guide/registration. Base CARD1026 (handoff/ARCHITECT-BRIEF-CARD1026.md, BUILD-LOG CARD1026 A–D).

## Goal
/qr-code/ gets a closed-by-default 「색 바꾸기·로고 넣기」 panel under the 받기 buttons: QR color + background color
(contrast-checked) and a picture in the center (H error correction, capped cover area), applied to both PNG and SVG.
Defaults (closed, black on white, no logo) produce byte-identical output to main.

## Flow
```
 fields ─┐                         ┌─ fg/bg <input type=color> ─ checkColors() ─ ok / low / inverted
         ├─ build() → payload ─────┤
         │                         └─ logo? (in memory only: PNG dataURL + bitmap)
         ▼
 encodeQr(payload, logo ? {ecc:H, minVersion:5} : default M)   cap: H 1,273 / M 2,331 bytes
         ▼                     tooLong → logo over line (logo on) / existing tooLong
 qrSvg(modules, style) ──► preview innerHTML  (colors always rendered so the user SEES a faint QR)
         │                                     color error → red line + aria-invalid on the QR color input
 받기 PNG/SVG ─ ready(): payload errors → existing path; color error → open details, focus fg input, no file
         ├─ PNG: qrRgba(modules, px, style) → putImageData → drawImage(logo bitmap into plate) → toBlob
         └─ SVG: rect bg + path fg + plate rect bg + <image href="data:image/png;base64,...">

 file pick (#qr-logo-input change) ─ import('./logo')  [own lazy chunk, NOT in the controller static closure]
   sniffImage(head, tail) → png|jpeg|webp|heic → decodeImage(maxLongEdge 512) → canvas → PNG dataURL (EXIF gone)
   errors: not-image / heic / corrupt / too-big / oom → one line under the picker, logo stays off
```

## Decisions locked (D1–D14)
- D1 Placement: one native `<details id="qr-style" class="qr-style">` inside `.qr-out`, AFTER `.qr-actions`, closed by
  default; summary 「색 바꾸기·로고 넣기」 (glyph-check, D12). Preview and buttons never move: opening it only adds height
  below the buttons. No pop-up, no modal, nothing above the tool, hero lead unchanged.
- D2 Colors: two `<input type="color">` with visible labels 「QR 색」 (default #000000) and 「바탕 색」 (default #ffffff),
  plus a 「검은색·흰색으로」 reset button. Values validated with /^#[0-9a-f]{6}$/i before entering any SVG or attribute
  (anything else = default). No transparent background (Known Gap).
- D3 Contrast rule = BLOCK, not warn (worst case is a printed QR that never scans: silent and expensive). Measure with the
  W3C WCAG relative-luminance contrast ratio. Blocked when (a) QR color is not darker than 바탕 색 (luminance fg >= bg;
  light-on-dark is not read by every phone; product rule, no copy cites a standard for it), or (b) ratio < 3:1 (WCAG 2.2
  SC 1.4.11 Non-text Contrast, the W3C minimum for graphical objects; a QR is one). While blocked: preview still renders
  in the chosen colors, a red line under the colors (error slot, aria-invalid on the QR 색 input), a 받기 press downloads
  nothing, opens the details and focuses the QR 색 input. `MIN_CONTRAST = 3` in src/lib/qr/style.ts with the source
  comment. Prove with jsQR: a pair at ratio just >= 3 decodes (with and without logo). Never lower the threshold to pass a
  test; if 3:1 fails jsQR, RAISE it and log.
- D4 Logo picker: visible-label file input 「로고·사진 고르기」 (accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp,.heic,.heif",
  NO name attribute) + 「로고 빼기」 button (hidden until a logo is set). Decode path = pdf-sign's (src/tools/pdf-sign/
  controller.ts ~L98-130): `sniffImage` + `decodeImage(file, sniff, { maxLongEdge: canShrinkOnDecode() ? 512 : null })`,
  then draw to a <=512 px canvas, keep a PNG data URL + bitmap in memory only. Error strings: reuse the exact pdf-sign
  texts where they fit (0 new glyphs); one line under the picker. The file never leaves the device (no fetch/XHR/beacon;
  the no-upload fixture passes on every new test). Nothing stored; check-dist storage/URL regex extended to the logo chunk.
- D5 Logo lazy: decode path in src/tools/qr-code/logo.ts, loaded by `import('./logo')` from the controller on the first
  file change only. check-dist: logo chunk not in initial JS nor the controller static closure; own budget `QR_LOGO_KB`
  = measured + 20 %. QR_INITIAL_KB 12.9 and QR_CONTROLLER_KB 9.2 stay (never raised); if colors push the controller over,
  move code into the logo chunk, not the budget. If the logo import rejects (offline): line under the picker (reuse a
  pdf-sign retry text), QR keeps working, usage `fail` not added (beacon unchanged).
- D6 ECC with logo = H; without = M (unchanged). `encodeQr(text, { ecc, minVersion })`; no-arg call identical to today.
  Basis (save verbatim, D13): qrcode.com 오류 복원 page (「레벨Q 또는 H를 선택」 for dirty environments, 「레벨M(15%)」),
  uqr 0.1.3 dist/index.d.ts 「H - Allows recovery of up to 30% data loss」. H v40 binary capacity 1,273 (already saved:
  handoff/sources/card1026/qrcode-com.txt line 13). Logo on and UTF-8 > 1,273 bytes → over line 「로고를 넣으면 QR에 담을
  수 있는 글자가 줄어요. 글자를 줄이거나 로고를 빼 주세요.」 (glyph-check), no file.
- D7 Logo cap: centered square plate (filled with 바탕 색) of side = largest ODD module count <= 0.22 x symbol size (sizes
  are odd, so the plate sits on the module grid); picture drawn contain-fit inside the plate, inset 1 module per side.
  With logo, minVersion 5 (37 modules → plate 7 = 3.6 % of the symbol; v40 177 → 37 = 4.4 %). <= 4.4 % covered vs the
  ~30 % H budget: the rest stays for print blur, glare, scratches. Never touches finder patterns (plate spans 39-61 % of
  the side). `logoPlate(size)` pure, exported, unit-tested.
- D8 Version sweep: unit test decodes styled RGBA with jsQR, plate filled with an adversarial fg/bg checker (worst picture),
  versions 5, 7, 10, 15, 20, 25, 30, 35, 40. If any fails, set `LOGO_MAX_VERSION` = the largest version with every lower
  tested version passing, block above it with the D6-style line, log it. Never weaken the jsQR assertion.
- D9 Renderers: `qrSvg(modules, style?)`, `qrRgba(modules, px, style?)`, `qrPng(modules, style?)`; style undefined →
  exactly today's bytes (business-card untouched, its tests unchanged). SVG with logo: bg rect, fg path, plate rect,
  `<image href="data:image/png;base64,..." x y width height preserveAspectRatio="xMidYMid meet"/>` (add xlink:href too
  only if a check shows a common viewer needs it; log). CSP already allows img-src data: blob: (public/_headers): no header
  change. PNG with logo: putImageData, then drawImage(bitmap) inside the plate with smoothing on.
- D10 State: colors/logo persist across kind switches in the page view; nothing written to storage/URL/history. Usage beacon
  unchanged (no new fields; whitelist untouched).
- D11 File names unchanged (QR코드.png / QR코드.svg).
- D12 Glyphs: target 0 new core and 0 new late (diff `uiCharSets` before/after, as CARD1026 B). Page HTML = core,
  controller/logo strings = late. Reword before adding glyphs (e.g. if 꾸 is not core: 「색·로고 넣기」). Any new glyph must
  pass check-dist font budgets unchanged; log each one.
- D13 Sources → handoff/sources/qr1031/ (fetched 2026-10-31, verbatim, sha256 headers): qrcode.com ko + en
  error_correction.html; W3C Understanding SC 1.4.11 + WCAG 2.2 definitions of relative luminance and contrast ratio;
  uqr 0.1.3 dist/index.d.ts ecc lines. Copy never states "30%" (on qrcode.com it is only in a table image).
- D14 Copy (plain Korean, 문서딱, no 업로드/서버/브라우저/네트워크):
  - tools.ts qr-code: updated '2026-10-31'; FAQ +2: 「QR코드 색깔을 바꿀 수 있나요?」 (어두운 QR 색 + 밝은 바탕만 받기,
    비슷한 색이면 알려 드림, 기본은 검은색·흰색) and 「QR코드 가운데에 로고나 사진을 넣을 수 있나요?」 (고른 사진은 이
    기기 안에서만 쓰고 보내지 않음; 로고를 넣으면 가려져도 읽히도록 복원 레벨을 가장 높게 올리고 로고는 가운데에 작게;
    받기 전에 한 번 찍어 보세요). keywords + 'QR코드 색깔', 'QR코드 색상 변경', 'QR코드 로고 넣기', '로고 넣은 QR코드'.
    description may add 색·로고 only if meta-length tests pass with 무료 kept; title unchanged.
  - src/content/tool-notes/qr-code.md line 56 (「흰 바탕에 검은색으로만 만듭니다」) rewritten to the new truth; quotes stay
    verbatim; toolFacts unchanged unless a new number is shown (then sourced).
  - /guide/qr-code/ (src/content/guides/qr-code.md): line 185 bullet rewritten; new short section 「색과 로고를 넣을 때」
    with the qrcode.com quotes (sources entries + fetch date), `updated` bumped; guide-length/guides-schema/guide-check pass.
  - docs/COPY.md qr-code line updated if it lists options.

## Build Order
1. src/lib/qr/encode.ts: `encodeQr(text, opts?)` with `{ ecc: 'M' | 'H', minVersion }`, `QR_MAX_BYTES_H = 1273`; M path
   untouched. Unit: default call identical to main for 6 payloads.
2. src/lib/qr/style.ts (new, pure): `parseHex`, `luminance`, `contrastRatio`, `checkColors(fg, bg) → 'ok' | 'low' |
   'inverted'`, `MIN_CONTRAST`, `logoPlate(size) → { start, side }`, `LOGO_EDGE = 512`, `LOGO_MIN_VERSION = 5`.
3. src/lib/qr/render.ts: optional style per D9; default bytes identical (snapshot vs main output for a fixed matrix).
4. tests/unit/qr-style.test.ts + extend qr-encode/qr-render tests: WCAG math (#000/#fff = 21, #777/#fff ≈ 4.48), low and
   inverted blocked, boundary pair decodes in jsQR, plate sizes (v5→7, v40→37, always odd, never overlaps finders), D8
   sweep, bad hex → default, exactly one `<image` only with a logo.
5. src/pages/qr-code/index.astro + qr-code.css: D1/D2/D4 markup (labels, aria-describedby slots `qr-color-error`,
   `qr-logo-error`), 48 px targets, dark mode keeps the preview box.
6. src/tools/qr-code/controller.ts: read style → encode/render, D3 block in `ready()`, D6 over line, reset, logo remove;
   src/tools/qr-code/logo.ts (D4/D5). Keep the first-click replay.
7. scripts/check-dist.mjs QR block: logo chunk lazy + QR_LOGO_KB + storage regex; HTML has `id="qr-style"` without `open`,
   file input without name, color defaults `value="#000000"` / `value="#ffffff"`.
8. tests/e2e/qr-code.spec.ts (chromium + webkit locally, E2E_PORT=4273), all via the no-upload fixture:
   a) defaults: details closed; PNG/SVG identical to a no-options run (SVG `fill="#000"`, no `<image`).
   b) #1a4d8f on #fff8e1 → PNG decodes (jsQR) to the href; SVG carries both fills.
   c) #cccccc on #ffffff (low) and #ffffff on #000000 (inverted): red line, aria-invalid, 받기 → no download, focus on QR
      색; reset → downloads work.
   d) logo via setInputFiles (in-test PNG and JPEG) → PNG decodes with jsQR; SVG has one `<image href="data:image/png;base64,`;
      로고 빼기 → SVG has no image (back to M); non-image bytes → error line, no logo.
   e) logo + text over 1,273 bytes → over line, no file.
   f) 390×844: #qr-preview top identical with details open vs closed; axe clean with details open and with an error shown.
9. Copy D14 + sources D13 + BUILD-LOG entry (measured budgets, glyph diff, sweep result).

## Failure modes
- Color pick yellow-on-white / white-on-black → D3 block, e2e c → clear red line, no file.
- Non-hex color value (odd UA, devtools) → regex → default colors; unit test.
- Logo decode: HEIC on Chrome, corrupt, huge photo, OOM → logo.ts error map (pdf-sign codes), e2e d → one line, logo off.
- Logo chunk import rejects (offline) → D5 line, QR keeps working; unit/e2e via route abort of the logo chunk.
- Logo + long text > 1,273 bytes → D6 line, e2e e.
- Logo hides the center alignment pattern at high versions → D8 sweep, LOGO_MAX_VERSION if needed → blocked with a line,
  never a silently bad file.
- Default regression (business-card / plain QR bytes change) → identity unit + e2e a + business-card.spec.
- Budget creep → D5; check-dist.
- Privacy: logo bytes sent → no network code; no-upload fixture on every test.
No critical gap: every path has handling + a test + a visible message.

## Test map
- encodeQr H/minVersion/H cap → [GAP] new unit; default path [TESTED] qr-encode.test.ts (+ identity).
- checkColors ok/low/inverted + jsQR boundary → [GAP] new unit.
- logoPlate + version sweep → [GAP] new unit.
- styled SVG/RGBA, default identity → [GAP] new unit; default render [TESTED] qr tests + business-card tests.
- UI block/reset/logo add/remove/error/over/fold/axe → [GAP] new e2e a–f.
- Existing qr-code.spec, business-card.spec, polish/site axe, LHCI /qr-code/ → [TESTED], must stay green.

## Out of Scope (→ BUILD-LOG Known Gaps)
- Transparent background; dot/rounded/gradient modules; eye colors; logo size slider; logo on /business-card/; style
  fields in the usage beacon; remembering choices; /en/ twin; HEIC decode beyond decodeImage (HEIC1030).

## Acceptance
- Build Order 8 green on chromium + webkit; qr-* unit files + postbuild/polish/tool-notes/guides-schema/guide-check/
  meta-length green; `npm run check` 0/0; `PUBLIC_SITE_URL=https://docttak.com npm run build` + check-dist OK (default
  and ci.yml production flags): precache <= 450 KB (limit unchanged), UI font preload/late within budget, QR_INITIAL /
  QR_CONTROLLER budgets unchanged, logo chunk lazy; no new dependency (check:licenses equivalence as CARD1026 A).
- Defaults byte-identical. Owner item O1 (not a blocker): real-phone scans of a colored QR and a logo QR (iPhone camera,
  Galaxy camera, KakaoTalk scanner).
