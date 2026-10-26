# Architect Brief — CARD1026 QR코드 만들기 (/qr-code/) + 전자명함 만들기 (/business-card/)

Owner 2026-10-26 (verbatim): 「전자명함 만들기 기능도 시장 조사를 하고 만들어봐」. Research:
reports/growth/전자명함 시장 조사 2026-10-26.md (Naver volumes are third-party 넥스트티 numbers, indicative only):
QR코드만들기 ~122,700/mo, 큐알코드만들기 ~62,400, QR코드생성 ~9,900, 와이파이QR코드 ~880; 모바일명함 ~1,020,
전자명함 ~790, 디지털명함 ~650, 모바일명함만들기 ~590, QR명함 ~150. Competitors need signup, charge, or expire
(dynamic QR trials stop working). House rules unchanged (CLAUDE.md): Arch → Bob → Richard → PR → owner merges → live
smoke; budgets never raised; plain language (docs/COPY.md); brand 「문서딱」; nothing typed leaves the device; every
number on a guide/tool note cites an official source with a fetch date. handoff/ARCHITECT-BRIEF.md belongs to other
sprints — do not touch it.

## Goal
Two Korean tool pages on one in-page QR engine: /qr-code/ (6 kinds of static QR → PNG/SVG) and /business-card/
(contact fields → 연락처.vcf (vCard 3.0), 연락처 QR PNG/SVG, a 명함 그림 PNG to send in KakaoTalk); then one guide.

## Arch probes done (2026-10-26, from this PC)
- npm: uqr 0.1.3 MIT (LICENSE: 「Copyright (c) Project Nayuki」 + 「Copyright (c) 2023 Anthony Fu」), ESM, 0 deps,
  dist/index.mjs 27,482 B raw / 7,843 B gz unminified (~4.4 KB gz minified per bundlephobia in the report).
  Options: `ecc` default **'L'**, `border` default **1**, `boostEcc` default false, min/maxVersion. Text → bytes via
  `toUtf8ByteArray` = `encodeURI` then bytes, i.e. UTF-8 byte mode — **`encodeURI` throws URIError on a lone surrogate**.
- npm: qrcode-generator 2.0.4 MIT (default string→bytes is not UTF-8 unless `stringToBytesFuncs['UTF-8']` is set).
- npm: jsqr 1.4.0 Apache-2.0; result has `binaryData: number[]` (raw bytes → TextDecoder for an exact UTF-8 check).
- Glyph diff (scripts/lib/ui-font-chars.mjs uiCharSets on main 726d149): 전자명함 만들기, 모바일 명함, QR코드 만들기,
  연락처, 와이파이, 인터넷 주소, 글자, 전화 걸기, 문자 보내기, 성/이름/회사/부서/직함/직책, 휴대폰/회사 전화/이메일/
  홈페이지/주소/메모, 비밀번호 없음, 보안 방식, 와이파이 이름, 가입 없이 무료, 기간이 지나도 QR이 멈추지 않아요,
  연락처 파일 받기, 명함 그림, QR 그림 받기, 이 기기에서는 바로 보내기가 안 돼요, 글자가 너무 많아 QR에 다 들어가지
  않아요, 이름이나 회사 중 하나는 써 주세요, 전화번호는 숫자로 써 주세요, FAX — all already in the core set.
  **Not in core: 큐 팩 숨 김 톡 촘 틀 힐 랑** (avoid in any UI string; 김 and 힐 and 랑 are late-only).

## Locked decisions
- **C1 (= orchestrator D1)** One engine (src/lib/qr/), two pages: `/qr-code/` 「QR코드 만들기」 and `/business-card/`
  「전자명함 만들기」. Static QR only — never a dynamic/tracked/redirect QR; the QR holds the content itself, so it never
  stops working. Said plainly on both pages: 「가입 없이 무료」, 「기간이 지나도 QR이 멈추지 않아요」.
- **C2 (= orchestrator D2)** No share link carrying card data (no URL fragment or query with values) in this sprint.
  Possible later step (noindex save-only page + warning), owner decision. The page URL never changes with typed data.
- **C3 (= orchestrator D3) Library: uqr 0.1.3, pinned exact**, dependencies. Why over qrcode-generator: Nayuki core
  (reference-grade), UTF-8 byte mode by default, ESM, smaller. Wrapper sets ecc M, border 0 (we draw the quiet zone
  ourselves), boostEcc false. licenses.manifest.json entry (name, use 「QR코드 만들기·전자명함 만들기: QR 그림」, files
  [LICENSE]) like fflate; /licenses/ shows it; check:licenses green. **jsqr 1.4.0 devDependency** (Apache-2.0) for
  decode round-trips in unit + e2e only; never shipped (check-dist: no jsQR string in dist).
- **C4 Encoder wrapper** src/lib/qr/encode.ts `encodeQr(text)` returns ok + {size, modules, version}, or not-ok with
  code empty or tooLong. Before encoding, replace lone surrogates with U+FFFD (a loop, no lookbehind regex) so
  encodeURI never throws. Capacity: UTF-8 byte length (TextEncoder) over 2,331 (version 40-M byte mode; cite
  qrcode.com in Q0) gives tooLong, never a throw. `dense = version > 15` (the 412-byte line at M in the research)
  drives a UI hint.
- **C5 Quiet zone 4 modules** on every output (PNG, SVG, card image), cite qrcode.com in Q0. Colors fixed: #000 on
  #fff (no color/logo/inverted QR in v1 — scan reliability; Known Gap).
- **C6 Renderers** src/lib/qr/render.ts (pure where possible):
  - `qrSvg(modules)` → string: viewBox in modules incl. quiet zone, white rect background, one path of 1×1 squares,
    `shape-rendering="crispEdges"`, role img + a title element 「QR 코드」 for the inline preview.
  - `qrPng(modules)` → Blob via canvas: integer module px `s = max(8, floor(1200 / (n + 8)))`, integer fillRect, no
    smoothing → crisp ~1,200 px PNG (print-friendly; no dpi talk in copy).
  - `qrRgba(modules, s)` pure (Uint8ClampedArray) — used by unit tests with jsQR and by the canvas path.
- **C7 Payload builders** (pure, src/lib/qr/payload.ts):
  - URL: trim; no scheme → prepend `https://`; `new URL()`; only http/https (javascript:, data: … → error url);
    payload = `url.href` (ASCII; punycode/percent-encoded; canonical).
  - 글자: as typed (line breaks kept), non-empty.
  - 전화: strip spaces, `-`, `(`, `)`, `.`; must match `^\+?\d{3,15}$` else error phone; payload `tel:<digits>`.
  - 문자: number as 전화 + message (≤ 300 chars); payload `SMSTO:<digits>:<message>` (ZXing form). If O1 shows the
    iPhone camera ignores SMSTO, the fallback (not now) is `sms:<digits>`; log it then.
  - 와이파이: `WIFI:T:<WPA|WEP|nopass>;S:<ssid>;` + (`P:<pw>;` unless nopass) + (`H:true;` if hidden) + `;`.
    In S and P, put a backslash before each of: backslash (first), semicolon, comma, colon, double quote. No hex
    quoting. SSID required (≤ 32 chars); password required unless 「비밀번호 없음」. Options: 「WPA·WPA2·WPA3 (대부분)」
    → WPA, 「WEP (오래된 공유기)」, 「비밀번호 없음」. Hidden checkbox 「이름이 안 보이는 와이파이」. Format and escaping
    cited from the ZXing Barcode-Contents wiki in Q0.
  - 연락처: `vcard(fields, {fold})` per C8.
- **C8 vCard 3.0** (src/lib/qr/vcard.ts; RFC 2426 + RFC 2425 §5.8.1 folding, quoted in Q0). Lines in this order:
  `BEGIN:VCARD` · `VERSION:3.0` · `N:<성>;<이름>;;;` · `FN:<표시 이름>` · `ORG:<회사>;<부서>` (only if either) ·
  `TITLE:<직함>` · `TEL;TYPE=CELL:<휴대폰>` · `TEL;TYPE=WORK,VOICE:<회사 전화>` · `TEL;TYPE=WORK,FAX:<FAX>` ·
  `EMAIL;TYPE=INTERNET:<이메일>` · `URL:<홈페이지 href>` · `ADR;TYPE=WORK:;;<주소>;;;;` · `NOTE:<메모>` · `END:VCARD`.
  - Empty fields → line omitted (except N and FN). Every line ends CRLF, the last too. UTF-8, no BOM, no CHARSET.
  - FN: if 성 or 이름 contains a Latin letter → `이름 성` (trimmed); else `성이름`; if both empty → 회사. N stays
    `;;;;` when 성/이름 are empty (N is required in 3.0).
  - Text escaping of every value (RFC 2426 text rule), backslash handled first: backslash → two backslashes;
    semicolon → backslash + semicolon; comma → backslash + comma; CR, LF or CRLF → backslash + n. The component
    separators in N/ORG/ADR are the only raw semicolons.
  - `.vcf` file: folded at 75 octets (UTF-8 bytes, CRLF not counted): continuation = CRLF + one space; never split a
    UTF-8 sequence or a backslash escape pair. **QR payload: same serializer, fold off** (folding is SHOULD; costs
    bytes; unfolding in camera readers is unverified). Filename fixed 「연락처.vcf」, MIME `text/vcard`.
  - Not in v1: PHOTO, 영문 이름/phonetic fields, BDAY, multiple emails, MECARD (Known Gaps).
- **C9 Contact fields** (shared src/components/ContactFields.astro + one validate module, used by both pages: same
  behavior, one place to fix). maxLength: 성 10, 이름 20, 회사 30, 부서 30, 직함 20, 휴대폰 20, 회사 전화 20, FAX 20
  (label 「FAX」: 팩 is not in core), 이메일 80, 홈페이지 100, 주소 80, 메모 100. /qr-code/ 연락처 tab = the same
  component. Validation: at least one of 성/이름/회사 (「이름이나 회사 중 하나는 써 주세요.」); phones as C7 (「전화번호는
  숫자로 써 주세요.」); email `^[^\s@]+@[^\s@]+\.[^\s@]+$`; 홈페이지 as the C7 URL rule. Inline field error +
  aria-invalid + aria-describedby; focus the first invalid on a download click; outputs hidden while invalid. The
  all-max worst case (every field at max, Hangul + maximal escapes) must still encode (unit); if not, cut maxLength,
  log.
- **C10 /qr-code/ tabs, in this order:** 인터넷 주소 (default), 글자, 연락처, 와이파이, 전화, 문자. Accessible tabs
  (tablist/tab/tabpanel + arrow keys) or a radio group — Bob picks whichever passes axe with less code; log.
  `?tab=url|text|contact|wifi|tel|sms` selects a tab on load (read-only; never written back). Live preview debounced
  150 ms; preview = inline SVG; buttons 「QR 그림 받기 (PNG)」 / 「SVG로 받기」; filenames 「QR코드.png」 「QR코드.svg」.
  글자 textarea maxLength 2,331; tooLong → 「글자가 너무 많아 QR에 다 들어가지 않아요.」; dense → a plain hint that
  the squares get small and the QR should be printed bigger (Bob words it from core glyphs).
- **C11 /business-card/** = ContactFields + 3 outputs, live preview debounced 250 ms:
  1. 「연락처 파일 받기」 → 연락처.vcf (folded). 2. 연락처 QR (unfolded vCard) preview + 「QR 그림 받기」 「SVG로 받기」
  (연락처-QR.png/.svg). 3. 명함 그림 on a canvas, 2 layouts — 가로 1800×1000 and 세로 1080×1350 — and 3 accent colors
  (names from core glyphs; Bob runs the glyph check); QR drawn from the same modules with the quiet zone; text = name
  (large), 직함·부서, 회사, 휴대폰, 회사 전화, FAX, 이메일, 홈페이지, 주소 (memo not drawn). 「명함 그림 받기」 →
  명함.png; 「보내기」 (navigator.share with the PNG file) shown only when navigator.canShare with that file is true;
  the blob is rendered on preview update, before the click, so share runs inside the user gesture; AbortError = no
  message; other errors → 「이 기기에서는 바로 보내기가 안 돼요. 그림을 받아서 보내 주세요.」 and download stays.
  - Canvas fonts: system stack only (Apple SD Gothic Neo, Malgun Gothic, Noto Sans KR, sans-serif); no font
    download. Layout = pure `layoutCard(fields, layout, measure)` → lines with size and box; shrink-to-fit per line
    down to a floor, 주소 may wrap to 2 lines, then ellipsis — unit-tested with a fake measure.
  - Copy (hedged, research 3-3): 「카메라로 찍으면 연락처로 저장할 수 있어요 (기기마다 화면이 다를 수 있어요)」.
  - No 90×50 mm print PDF in v1: no official size source exists (research 3-5 found vendor pages only) and it would
    pull pdf-lib into the page. The card image never states a mm size. Known Gap.
- **C12 Privacy:** no storage of any kind (localStorage/sessionStorage/IndexedDB/cookies) — the opt-in 「기억하기」
  from the research is a Known Gap; no values in URL/history/filenames/usage/GA; fixed filenames; tool CSP self; not
  an ads content page; e2e no-upload guard on every test. Usage tool ids qr-code and business-card
  (scripts/lib/usage.mjs TOOLS + labels, src/lib/ui/usage.ts), existing event set only (start on the first valid
  preview per page view, download per file); never a typed value or payload.
- **C13 No env kill switch.** The repo flags only features with a network, permission or header change
  (PUBLIC_ADDR_EN, PUBLIC_ID_CAMERA, PUBLIC_BG_CLOUD); loan-note/stamp-maker have none. These pages add none →
  rollback = revert the PR.
- **C14 Precache:** both pages in gen-sw NOT_PRECACHED and src/sw/sw.ts RUNTIME_PAGES (stored when visited, as
  /stamp-maker/). Bob measures precache on default + cloud builds after the menu/home entries (they grow precached
  pages). If over 450 KB: move /photo-compress/ to NOT_PRECACHED + RUNTIME_PAGES (CONTENT1021 D10 pre-locked order).
  Never raise PRECACHE_LIMIT. Initial JS per page ≤ 30 KB: tiny entry; uqr + payload + render load in the controller
  on first interaction (repo entry → controller pattern). Log KB before/after.
- **C15 Fonts:** target 0 new core glyphs; gate = budgets (preload tripwire 94,884 B, late faces ≤ 8 KB each, total
  ≤ 190 KB). Long text in the tool notes (system font). SEO words with 큐/톡 only in title/description/keywords/tool
  note, never visible UI text. Log the glyph list and KB before/after.
- **C16 Trademark:** if Q0 saves the verbatim trademark sentence from qrcode.com, one plain line in both tool notes
  and the guide (e.g. 「QR코드는 (주)덴소웨이브의 등록 상표입니다.」, wording per the saved source). No competitor
  service names (리멤버, 캠카드 …) in titles, descriptions, keywords or copy.
- **C17 No terms change.** We store and publish nothing; the impersonation-by-link risk is excluded by C2.
- **C18 SEO** (tools.ts): /qr-code/ 「QR코드 만들기 — 무료, 가입 없이 인터넷 주소·와이파이·연락처 QR | 문서딱」;
  /business-card/ 「전자명함 만들기 — 모바일 명함 연락처 QR·카톡용 명함 그림 무료 | 문서딱」; lengths within the
  SEO-LENGTH limits (shorten, keep the head keyword first); keywords incl. 큐알코드 만들기, QR코드 생성, 와이파이
  QR코드 / 모바일명함, 디지털명함, QR명함. FAQ ×4–5 each (not copied into the notes). Menu/home: /qr-code/ then
  /business-card/ right after stamp-maker; log the exact spot.
- **C19 Related:** RelatedTools /qr-code/ ↔ /business-card/, + /english-name/, /english-address/, /stamp-maker/.
  Reverse related links to /business-card/ from /english-name/ and /english-address/ (영문 명함), to /qr-code/ from
  /stamp-maker/. No 이어서 하기 (NextSource) in v1.
- **C20 No /en/ page** this sprint (Known Gap; the English QR generator market is separate and crowded).

## Flow
```
 tab/fields --input (debounce)--> validate --invalid--> inline error, outputs hidden
                                     | ok
                                     v payload.ts (url | text | tel | sms | wifi | vcard fold:off)
                              encode.ts (surrogate fix; bytes > 2331 -> tooLong)
                 tooLong --> 「글자가 너무 많아…」          | ok {modules, version}
                                                          v dense? -> hint
                 render.ts: qrSvg (preview) -- qrPng (QR코드.png) -- SVG file
 business-card only:  vcard fold:on --> 연락처.vcf
                      layoutCard + canvas --> 명함.png blob (pre-rendered) --> 받기 | 보내기 (canShare) --> share
                                                                                      +-- error --> message, download stays
 usage: start/download events only, no values.   URL never changes.   No storage.
```

## Failure modes
| Path | Realistic failure | Handling | User sees |
|---|---|---|---|
| Encoder | lone surrogate (pasted text) → encodeURI URIError | U+FFFD replace before encode; unit | QR made |
| Capacity | long 글자 / all-max contact over 2,331 B | tooLong code, no throw; unit + e2e | inline 「글자가 너무 많아…」 |
| Korean bytes | non-UTF-8 encoding → 「홍길동」 garbled on scan | jsQR binaryData → TextDecoder equals payload; unit + e2e on PNG and card | prevented (O1 confirms phones) |
| vCard escaping | comma/semicolon in 회사 splits fields | escape table unit; round-trip parse in test | prevented |
| Folding | split inside a Hangul char or an escape pair | octet-aware fold unit (Hangul and escape at the boundary); unfold(fold(x)) equals x | prevented |
| Wi-Fi | semicolon or colon in password breaks join | escape unit; jsQR round trip; O1 phone join | prevented / O1 |
| URL | javascript: or junk typed | http(s) only after URL parse; unit | inline error |
| Phone | letters, too short | regex; unit + e2e | inline error |
| Canvas | long company name overflows card | layoutCard shrink → wrap → ellipsis, fake-measure unit; e2e all-max card decodes | prevented |
| Share | iOS loses the user gesture during toBlob → NotAllowedError | blob pre-rendered; non-Abort errors → message; e2e stubbed share (ok / AbortError / other) | clear message, download works |
| .vcf on phone | iOS Safari / Galaxy Chrome handle text/vcard oddly | text/vcard + fixed name; O1 real phone | O1 |
| Precache | menu/home entries push over 450 KB | C14 move; gen-sw fails the build | build fails, never shipped |
| Glyphs | a new UI word grows the preload | C15; check-dist tripwire | build fails, never shipped |
| Privacy | a value in beacon/URL/storage | C12 unit + e2e (cloud usage spec payload) + check-dist storage scan | n/a |

No silent untested path remains.

## Test map
- encode.ts: empty, ASCII, Hangul, emoji, lone surrogate, 2,331 vs 2,332 bytes, dense flag at v15/v16 [GAP → unit].
- render.ts: qrRgba → jsQR decode equals input for Hangul/emoji/URL; quiet zone = 4 white modules on all sides; PNG
  size formula; SVG path → module matrix equals encoder matrix; SVG has title + role [GAP → unit].
- payload.ts: URL cases (no scheme, http, https, javascript:, 한글 path → href, spaces), tel/SMSTO normalization and
  rejects, Wi-Fi escaping of backslash/semicolon/comma/colon/double quote, nopass/hidden/WEP forms [GAP → unit].
- vcard.ts: minimal (name only), company only (FN = 회사, N empty components), Latin FN order, every escape,
  multi-line memo, CRLF everywhere incl. the last line, no BOM, fold at 75 octets with Hangul and an escape at the
  boundary, unfold(fold(x)) equals the unfolded text, all-max worst case encodes [GAP → unit].
- layoutCard: all-max in both layouts with a fake measure; every line inside its box; ≤ 2 address lines; ellipsis
  flagged [GAP → unit].
- e2e /qr-code/ (5 projects, no-upload guard): each tab → preview → PNG download → decode (@napi-rs/canvas + jsQR)
  equals the expected payload (Hangul text, wifi with a semicolon, tel, SMSTO, contact); SVG download well-formed;
  ?tab=wifi opens wifi; invalid URL/phone inline errors + focus; tooLong; URL unchanged after typing; no storage
  writes; axe on each tab + an error state; 360 px no horizontal scroll [GAP → e2e].
- e2e /business-card/: fill a made-up sample (홍길동, an example company with a comma and a semicolon) → .vcf bytes
  equal the expected file (CRLF, folded, UTF-8) → QR PNG decodes to the unfolded vCard → 명함 PNG (both layouts,
  all-max) dimensions + jsQR finds the vCard on the card image → share stub ok / AbortError / other error; canShare
  false → no 보내기; axe; 360 px [GAP → e2e].
- Cloud usage spec: payloads of both tools have only whitelisted fields, no typed value [TESTED infra → extend].
- Regression: tool-count tests, site/polish/growth lists, reverse RelatedTools pages (english-name, english-address,
  stamp-maker) e2e, check:licenses (uqr allowed, jsqr dev only) [TESTED → extend/rerun].
- check-dist blocks for both pages (CSP self, no ads, no off-site script, no storage API strings in their chunks, no
  jsQR in dist, initial JS logged); tool notes ≥ 2,000; guide ≥ 2,500 + figures [TESTED infra → extend].
- LHCI both pages, median of 5 [GAP → run, log].

## Registration list (every place a new tool slug goes; grep loan-note and stamp-maker to confirm, add any missed)
src/data/tools.ts (entry, SEO, FAQ, keywords, menu/home order) · src/pages/<slug>/index.astro · src/data/og.json +
OG image (scripts/gen-brand.mjs; postbuild OG list + tests/unit/postbuild.test.ts) · JSON-LD (WebApplication +
FAQPage) · sitemap and llms.txt generators · src/data/tool-facts.ts (every maxLength/number stated in a note) ·
src/data/tool-guide-order.ts + NEXT_GUIDES (src/data/guides.ts) · src/data/site.ts · src/lib/ui/usage.ts +
scripts/lib/usage.mjs TOOLS/labels + tests/unit/usage.test.ts + tests/e2e/usage.spec.ts · scripts/gen-sw.mjs
NOT_PRECACHED + src/sw/sw.ts RUNTIME_PAGES · scripts/check-dist.mjs blocks · scripts/lib/bgcloud.mjs LOCAL_SCOPE_RE
· lighthouserc.json · scripts/qa/visual.mjs · tests/e2e/site.spec.ts + polish.spec.ts lists + tool-count tests ·
src/content/tool-notes/<slug>.md · reverse RelatedTools pages (C19) · docs/COPY.md lines · licenses.manifest.json
(uqr) · CLAUDE.md line 3 tool list → the orchestrator applies it (Bob does not edit CLAUDE.md).

## Build Order (each step = one PR; each commit green before the next)
- **Step A — sources + engine (PR 1; no visible change except /licenses/).**
  - Q0 → handoff/sources/card1026/*.txt (URL, fetched date, verbatim): RFC 2426 (text escaping, FN, N, ADR, ORG,
    TEL types, EMAIL — section numbers as in the RFC), RFC 2425 §5.8.1 folding, qrcode.com version/capacity (2,331
    at 40-M binary) + quiet zone (4 modules) + the trademark sentence, ZXing wiki Barcode-Contents (WIFI, SMSTO,
    tel), Apple WWDC17 session 206 lines (vCard/MeCard, Wi-Fi, tel, sms), Apple iCloud vCard 3.0 line. Log what
    could not be fetched; a number without a saved source is not stated anywhere.
  - npm i -E uqr@0.1.3; npm i -D -E jsqr@1.4.0; licenses manifest; check:licenses.
  - src/lib/qr/{encode,render,payload,vcard}.ts + tests/unit/qr-*.test.ts (all C4–C8 cases). No page imports yet.
  - → Richard → PR → owner merges → smoke: site unchanged, /licenses/ lists uqr.
- **Step B — /qr-code/ (PR 2).** Page (C10), ContactFields (C9), entry/controller (lazy), tool note
  src/content/tool-notes/qr-code.md (합니다체, ≥ 2,000, CONTENT1021 C headings 「…은 이럴 때 씁니다」 / 「휴대폰과
  PC에서 … 순서」 / 「결과가 이상할 때」 / 「주의할 점」, toolFacts for every number, sources for 2,331 and 4 modules, the
  C16 line, no ≥ 60-char block shared with any other note or guide), FAQ, full registration, C14/C15 measurements,
  check-dist block, e2e + axe → Richard → PR → merge → live smoke (phone + PC: each tab, PNG download decodes; a
  real phone scan is O1; no off-site requests) → IndexNow.
- **Step C — /business-card/ (PR 3).** C11 + C8 file output + layoutCard + share + note business-card.md (distinct
  from qr-code.md) + registration + reverse links (C19) + e2e → Richard → PR → merge → live smoke (.vcf bytes, QR
  decode, card PNG, 보내기 presence in mobile emulation) → IndexNow.
- **Step D — guide /guide/qr-code/ (PR 4).** Title 「QR코드 만들기 전에 알아 둘 것: 와이파이·연락처 QR과 잘 찍히는
  QR」; queries QR코드 만들기 / 와이파이 QR코드 / 연락처 QR; tools: qr-code, business-card. ≥ 2,500 rendered chars
  (scripts/guide-length.mjs). H2s: QR에 담기는 것 (static; the content is inside) · 종류별로 만드는 법 (6 kinds) ·
  와이파이 QR (format, escaping, plainly) · 연락처 QR과 연락처 파일 (vCard 3.0, N/FN, why no photo) · 많이 담으면 칸이
  작아져요 (version/capacity rows quoted from qrcode.com, quiet zone) · 안 찍힐 때 · FAQ ×4 not copied from tools.ts.
  Only numbers saved in Q0. Figures (CONTENT1021 D5.3): 1-wifi-tab.webp (scripts/guide-shots.mjs of
  /qr-code/?tab=wifi with a made-up network name), 2-quiet-zone.svg (QR + the 4-module quiet zone + the version size
  rule, quoted numbers only). One inbound sentence from the closest existing guide (e.g. /guide/stamp-image/) →
  Richard → PR → merge → live smoke. If Q0 yields fewer than 3 official quotes, the guide stays draft (Known Gap).

## Gates (per PR)
astro check 0 · vitest all · check:licenses · check:quotes --exact (Steps B–D) · check-dist OK on default, cloud
flag-on, BG and checks builds (precache ≤ 450 KB, preload ≤ 94,884 B, late ≤ 8 KB, total ≤ 190 KB — all logged) ·
tool notes ≥ 2,000 / guide ≥ 2,500 · new + regression e2e on 5 projects with the no-upload guard (on CI if the host
runs out of memory) · LHCI median of 5 · Richard "clear" · live smoke.

## Out of Scope (→ BUILD-LOG Known Gaps)
- Share link with data in the URL (C2) · dynamic/tracked QR (never) · QR colors/logo/inverted · MECARD · PHOTO in
  .vcf · 영문 이름/phonetic fields · 「이 기기에 기억하기」 storage · 90×50 mm print PDF and a 명함 사이즈 guide (needs
  an official source) · 종이 명함 OCR · Apple/Google Wallet passes · email (mailto) QR tab · 이어서 하기 chain ·
  /en/ twin · QR reading/scanning tool · batch QR.

## Acceptance
- Step A: engine unit-tested incl. jsQR round trips; uqr in the manifest; dist unchanged except /licenses/.
- Step B: /qr-code/ live (menu, home, sitemap, llms.txt, OG, JSON-LD); 6 tabs give PNG/SVG that decode to the exact
  payload (Hangul included); errors inline; no storage/URL/beacon values; budgets within limits (logged); note
  ≥ 2,000; Richard clear; live smoke.
- Step C: /business-card/ live; .vcf = vCard 3.0, CRLF, UTF-8, folded; QR decodes to the unfolded vCard; card PNG
  in 2 layouts with a scannable QR; share works or falls back with a clear message; same privacy/budget gates.
- Step D: guide live ≥ 2,500 with 2 own figures, every number sourced, check:quotes --exact green.

## Owner items (non-blocking; build proceeds on the defaults)
- **O1** Real phones (iPhone camera, Galaxy camera, KakaoTalk code scan, Naver app): contact QR with 「홍길동」 → 연락처
  저장 shows the name unbroken; Wi-Fi QR joins (incl. a password with a semicolon); tel; SMSTO (if the iPhone fails
  → sms: fallback, C7); URL. .vcf from iPhone Safari and Galaxy Chrome opens 연락처; 명함 그림 「보내기」 → KakaoTalk.
- **O2** Optional: official Naver keyword tool check of QR코드만들기 / 모바일명함 (research volumes are third-party).
- **O3** Merge: the owner merges each PR with gh pr merge N --merge when Richard is clear and CI is green.
