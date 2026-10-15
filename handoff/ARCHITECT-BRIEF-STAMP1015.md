# Architect Brief — STAMP1015: 도장 만들기 (/stamp-maker/)

Author: Arch. Date: 2026-10-15. Worktree C:/dev/doc-tools-kr/wt/stamp-1015 (branch stamp-1015 = origin/main 7dd9ef6).
Owner request 2026-10-15: make stamp images from typed text, many frames at once, PNG download, continue to other tools.
Every TOOLS1015 locked decision (ARCHITECT-BRIEF-TOOLS1015.md 2-8: zero new core glyphs, registration list, live at
deploy + NOT_PRECACHED/RUNTIME_PAGES, budgets, usage whitelist, copy rules) applies unless overridden here. Bob copies
"Log notes" (end) into BUILD-LOG when S0 starts.

## Goal
A new live tool /stamp-maker/ 「도장 만들기」: type a name, see it in 12 stamp frames at once, pick one, fine-tune,
save a transparent PNG or stamp it on a PDF. No new npm dependency, no new font file, no wasm, no network beyond the
same-origin font slices the HWP tools already serve.

## Demand (Naver keyword tool, owner, 2026-10-15, monthly PC+mobile)
도장만들기 13,160 · 인감도장만들기 3,300 · 도장이미지만들기 2,460 · 전자도장 1,400 · 싸인만들기 1,260 · 도장이미지 1,120 ·
전자도장만들기 880 · 직인만들기 600 · 회사직인만들기 100. → /stamp-maker/ owns every 도장/직인/전자도장 term;
/stamp-signature/ keeps 싸인·전자서명 and 「도장 사진 배경 지우기」 (D2).

## Locked decisions
**D1 Slug and copy (core; every glyph checked against `uiCharSets('src').core` on this base, all OK).**
- Slug `stamp-maker` (ASCII, keyword-shaped like `id-copy`). Renaming later = `public/_redirects` line.
- name = h1: 「도장 만들기」.
- title (39): 「도장 만들기 — 도장 이미지 만들기 무료, 인감·직인 PNG | 문서딱」
- description (65): 「이름을 쓰면 원형·사각 인감·타원·회사 직인 도장 이미지를 한 번에 만들어요. 투명 PNG로 저장, 가입 없이 무료.」
- summary: 「이름이나 회사 이름을 쓰면 여러 모양의 도장 이미지를 한 번에 만들어 투명 PNG로 저장합니다.」
- keywords: 도장 만들기, 도장 이미지 만들기, 인감도장 만들기, 전자도장 만들기, 직인 만들기, 회사 직인 만들기.
- FAQ (6, all checked OK; Bob may tune within D9):
  1. 도장 이미지는 어떻게 만드나요? → 「도장에 넣을 이름을 쓰면 원형, 사각 인감, 타원, 회사 직인, 날짜 도장 등 여러 모양이
     한 번에 보입니다. 마음에 드는 모양을 누르고 글꼴, 색, 크기를 고른 뒤 PNG로 저장하세요. 배경이 투명해 문서 위에 바로
     올릴 수 있습니다. 종이에 찍은 내 도장은 사진으로 찍어 전자서명·도장 이미지 만들기에서 배경을 지우세요.」 link
     /stamp-signature/.
  2. 여기서 만든 도장도 법적 효력이 있나요? → 「이 도구는 도장 모양의 그림을 만들고, 법적 효력을 정하지 않습니다. 주민센터에
     신고한 인감도 아닙니다. 인감이나 회사 직인이 꼭 필요한 서류라면 받는 곳에 이 그림을 써도 되는지 먼저 물어보세요. 본인
     이름과 허락받은 회사 이름으로만 만드세요.」 link guide e-signature-law.
  3. 한자 도장도 되나요? → 「네. 이름을 한자로 쓰면 한자 도장이 됩니다. 사각 인감은 이름이 세 글자면 「인」, 두 글자면
     「지인」을 붙여 네 칸을 채우고, 한자 이름이면 한자로 붙입니다. 붙이지 않게 바꿀 수도 있습니다.」
  4. 회사 직인도 만들 수 있나요? → 「네. 법인 직인 모양은 원을 따라 회사 이름을, 가운데에 「대표이사」를 넣습니다. 가운데
     글자는 바꿀 수 있습니다. 사각 직인 모양도 있습니다.」
  5. 만든 도장을 PDF나 한글 문서에 찍으려면? → 「「PDF에 찍기」를 누르면 PDF 서명·도장 넣기로 넘어가 원하는 쪽, 원하는
     자리에 놓을 수 있습니다. 한글·워드 문서에는 저장한 PNG를 그림으로 넣으세요.」 link /pdf-sign/.
  6. 쓴 이름이 어디로 보내지나요? → 「어디로도 보내지 않습니다. 도장 그림은 이 기기 안에서 만들고, 쓴 글자도 저장하지
     않습니다.」
- 사용 방법 (3): 도장에 넣을 글자 쓰기 · 모양 고르기 · 다듬고 저장하기. 알아 두면 좋아요 (1 block): 그림만 만든다(인감
  신고·법적 효력과 무관) + 가입·설치 없이 무료.
- **Core glyphs missing on this base — never in page/tools.ts copy:** 테 황 랑 굵 딕 之 印 싸 뀝 옵 뿐 듭 깥 레 (plus the
  TOOLS1015 list). So: no 「테두리」 (say 「선」), no 「고딕/굵기/주황/파랑/之印」 in core (they are control labels in the
  controller = late copy), no 「싸인」 in core strings. Bob re-runs the glyph check per commit; tripwire 94,884 B untouched.

**D2 Relation to /stamp-signature/ (URL kept).**
- Name/h1 stay 「전자서명·도장 이미지 만들기」 (no cascade through pdf-sign copy, guides, e2e). Only title, description,
  keywords change (S5, own commit, revertable alone): title (36) 「전자서명 만들기 — 서명 그리기·도장 사진 배경 지우기 |
  문서딱」; description (69) 「전자서명 만들기와 도장 사진 배경 지우기를 무료로. 서명을 직접 그리거나 종이 사진에서 배경을 지워
  투명 PNG로 저장해요.」; keywords drop 도장이미지만들기 / 전자도장 / 온라인도장만들기, keep 전자서명만들기 / 싸인누끼 /
  도장누끼 / 도장배경제거, add 서명 만들기. `updated` bumped. og.json line for stamp-signature unchanged.
- Cross-links both ways: /stamp-signature/ lead gets one sentence 「이름으로 새 도장 그림을 만들려면 [도장 만들기]」 (checked
  OK); /stamp-maker/ FAQ 1 + a 「서명도 만들기」 button (D6). RelatedTools: stamp-maker → stamp-signature, pdf-sign,
  jpg-to-pdf; stamp-signature and pdf-sign gain stamp-maker (first).
- /pdf-sign/ hint 「그림이 없다면 … 에서 만든 뒤」 names both tools (도장 만들기 · 전자서명·도장 이미지 만들기).
- Menu/home: tools.ts entry inserted **immediately before** `stamp-signature` (signature group: 도장 만들기, 전자서명·도장
  이미지 만들기, [배경 지우기 flag]). HOME_DESC_ORDER: `stamp-maker` right after `pdf-edit`. Icon: round seal outline.
- Inbound one-sentence body links (S4, `updated` bumped): guides stamp-image, e-signature-law, pdf-sign.
- Affiliate (behind the existing PUBLIC_AFF_COUPANG flag, all REV2/REV3 rules): add `stamp-maker` → `cp-stamp` to
  TOOL_AFF / GUIDE_AFF (src/data/affiliate.ts) and TOOL_OUT / GUIDE_OUT (scripts/lib/usage.mjs; the unit test keeps
  them equal), lead 「실물 도장이 필요할 때」 as stamp-signature; placed below the result, never above the tool.

**D3 Frames: 12 styles, all rendered at once in a preview grid.** Style ids are the usage values (D8).
| id | Name (late label) | Frame | Default text layout | Max graphemes |
|---|---|---|---|---|
| round | 원형 | one ring | 1 centre; 2-3 vertical stack; 4 = 2×2; 5-6 = 3×2 | 6 |
| round-double | 겹원 | outer ring + thin inner ring | as round | 6 |
| oval | 타원 | vertical ellipse (w:h 0.72) | vertical column 1-4; 5-6 = 2 columns | 6 |
| square-seal | 사각 인감 | square, thick line | 2×2 grid with auto 인/지인 (D4); 5-6 = 3×2; 7-9 = 3×3 | 9 |
| square-round | 둥근 사각 | square, corner radius 18 % | as square-seal | 9 |
| square-inverse | 사각 음각 | filled square, text cut out (destination-out) | as square-seal | 9 |
| rect-v | 세로 직사각 | rectangle w:h 0.5 | one vertical column | 5 |
| rect-h | 가로 직사각 | rectangle w:h 2.4 | one horizontal row | 8 |
| plain | 선 없는 이름 | none | one horizontal row (toggle vertical) | 8 |
| corp-round | 법인 직인 | outer ring + inner ring; company name on the arc band; centre text (default 대표이사, 2×2) | arc 3-20 | 20 |
| corp-square | 사각 직인 | square; company name + 지인/之印 in an n×n grid, column-major right→left | 4-16 | 16 |
| date-round | 날짜 도장 | ring split by 2 chords: top label, middle date, bottom name | label ∈ 확인·승인·검토·접수·완료·결재; date YYYY.MM.DD, local today, editable (input type=date); name ≤ 5 | 5 |
- A tile whose limit is exceeded shows a disabled state with late text 「글자가 많아 이 모양에는 넣지 못해요」, never clipped.
- Multi-cell 결재란 tables (담당/과장/부장) are **out** (Known Gap): they are tables, not stamps; date-round covers
  승인/검토/확인 with a date.
- Grid = role=radiogroup, tiles role=radio + aria-checked, roving tabindex, arrow keys; tile label = style name.
  Before the user types, the grid paints sample text 「홍길동」 (「문서딱」 for corp styles; late copy, marked 예시).

**D4 Text layout rules (pure `layout.ts`, unit-tested; no DOM).**
- Normalize: NFC (maps KS X 1001 compatibility ideographs to unified ones), trim, drop all whitespace except in rect-h,
  plain and corp company names (collapsed to one space); split by `Intl.Segmenter` graphemes (code-point fallback).
- Allowed: Hangul syllables U+AC00–D7A3, CJK unified U+4E00–9FFF, A–Z a–z 0–9, `·` `&` `(` `)` `-` `.`, space where
  kept. Anything else → inline error 「도장에 넣을 수 없는 글자: X」 (late); grid + save disabled until removed. maxlength 20.
- Script: every grapheme Hanja → suffix 印 / 之印; Hangul or mixed → 인 / 지인; Latin/digits only → no suffix.
- Suffix control (square-seal, square-round, square-inverse, corp-square): [자동 (default) | 붙이지 않음 | 인 | 지인].
  자동 = personal 3 → +인, 2 → +지인, 1 or ≥ 4 → none; corp-square → +지인 unless the count already fills the grid.
- Vertical = traditional column-major, columns right→left, top→bottom. Horizontal = row-major left→right. 가로/세로
  toggle on round, round-double, oval, square-*, plain (rect-v / rect-h fixed by shape).
- Auto-fit: frame inset by line width + 6 % padding → cell rects → each glyph fitted to its cell from its measured ink
  box (`measure(ch, font)` injected: `actualBoundingBox*` in the page, @napi-rs/canvas in unit tests), non-uniform
  stretch clamped to x/y ratio [0.6, 1.6] (tall cells get tall glyphs, the seal look); one common scale per row/column
  so a name keeps an even size.
- Arc (corp-round): glyphs centred on the top, tangent-rotated, span = min(300°, n × step), step from the band height;
  no symbols added in the gap. Centre text 1-6 graphemes, same grid rules.
- Line width [얇게 | 보통 (default) | 두껍게] = 3 / 5 / 7 % of the short edge (inner ring 40 % of the outer).
- Output = a draw list in unit coordinates (shapes + glyph placements + per-glyph family); the same list paints the
  tiles, the large preview and the PNG (what you see is what you save).

**D5 Fonts — reuse the HWP faces already served; zero new font files.** Measured 2026-10-15 with @cantoo/fontkit over
the cmap union of every WOFF slice in node_modules; `npm view` and the licence URLs fetched the same day (HTTP 200, OFL
text).
| Late label | CSS family (scripts/gen-hwp-fonts.mjs) | Package | Licence | Hangul KS X 1001 2,350 / all 11,172 | KS X 1001 한자 (4,888) |
|---|---|---|---|---|---|
| 명조 (default) | Anolim HWP Serif 700 | @fontsource/noto-serif-kr 5.3.0 | OFL-1.1, https://raw.githubusercontent.com/notofonts/noto-cjk/main/Serif/LICENSE | 2,350 / 11,172 | 4,883 (5 misses are compatibility code points; NFC → unified) |
| 고딕 | Anolim HWP Sans 700 | @fontsource/noto-sans-kr 5.3.0 | OFL-1.1, https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/LICENSE | 2,350 / 11,172 | 4,885 (3 compat) |
| 나눔명조 | Anolim HWP Myeongjo 700 | @fontsource/nanum-myeongjo 5.3.0 | OFL-1.1 with RFN (files unmodified), https://raw.githubusercontent.com/google/fonts/main/ofl/nanummyeongjo/OFL.txt | 2,350 / 11,172 | 0 |
| 나눔고딕 | Anolim HWP Gothic 700 | @fontsource/nanum-gothic 5.3.0 | OFL-1.1 with RFN (files unmodified), https://raw.githubusercontent.com/google/fonts/main/ofl/nanumgothic/OFL.txt | 2,350 / 11,172 | 0 |
- Already in licenses.manifest.json and /licenses/: no manifest change. PNG output is a rendering, not font software.
- **Per-glyph family is explicit, not engine fallback:** layout.ts gives each grapheme a family; Hanja in a Nanum family
  → its Noto counterpart (나눔명조 → Serif, 나눔고딕 → Sans).
- 굵기 [가늘게 = 400 slices | 보통 = 700 (default) | 굵게 = 700 + same-colour stroke 2.5 % of glyph height]. gen-hwp-fonts
  copies only 400/700; no 900 copies (zero new files); the stroke gives the heavy seal look.
- **Loading:** the controller injects the existing `hwp-fonts.<hash>.css` link (src/generated/hwp-fonts.json; the
  loadHwpFonts pattern without loadDynamicFont) on first need, then `document.fonts.load` per used (family, weight) with
  the typed text before painting. Only the unicode-range slices that text needs are fetched. Measured: 20 common
  surname/given-name syllables hit 6 slices: Serif 700 111 KB, Sans 700 51 KB; Hanja slices 13-41 KB each; a 3-syllable
  name ≈ 2-3 slices. The grid paints in the selected family only (default 명조) → first view ≈ 60-110 KB; other
  families load when chosen. The CSS is 474 KB raw / 31 KB gzip, already cached for HWP visitors. Input debounce 250 ms.
- Never: a preload for these, any change to the UI font core set, fontkit in the page (PNG only, not needed).
- Font failure (offline, 404, 4 s timeout, `document.fonts.check` false after load): paint with system serif / sans,
  late note 「글꼴을 받지 못해 기본 글꼴로 보여 드려요. 인터넷 연결을 확인해 주세요.」; save still allowed (WYSIWYG); usage
  fail c=font.
- **Not taken (verified, logged):** no seal-script (전서·인장체) face with an OFL/Apache licence among fontsource Korean
  families. @fontsource/black-han-sans 5.3.0 and @fontsource/song-myung 5.3.1 exist (OFL-1.1; google/fonts
  ofl/blackhansans and ofl/songmyung OFL.txt fetched) but cover KS X 1001 Hangul only (8,591 / 8,822 of 11,172
  syllables missing), no Hanja, and add a dependency → Known Gap "more stamp faces".

**D6 Colour, texture, size, output.**
- Colour (late labels): 인주 빨강 #D0202E (default) · 주황 #E0482A · 검정 #1A1A1A · 파랑 #1D4ED8 (pdf-edit's blue).
- 인주 질감 toggle (default off) + 「질감 다시 만들기」: mulberry32(seed) → 2-octave value noise erodes alpha (keeps
  60-100 %), ≤ 2 % pin-hole speckles, edge roughness ±1 px at 1x. Deterministic: same (draw list, size, seed) →
  identical pixels. Seed starts at 1; the button increments it. Applied after painting, before encoding; tiles show it.
- Size 「문서에 찍힐 크기」 (long edge): 12 · 15 · 18 · 21 · 24 · 30 mm. Defaults: personal 15, date 18, corp 24 mm.
  Pixels = round(mm / 25.4 × 600) at 1x (18 mm → 425); checkbox 「2배로 선명하게」 = 1,200 ppi (850). The PNG carries a
  pHYs chunk with that density (pure png.ts inserts it after IHDR, CRC computed). UI shows 「18 mm (425×425픽셀)」; no
  claim that an app keeps the size (probe (c)). These are tool choices, never called 규격.
- **PNG only, no SVG** (Arch): SVG text needs font embedding or outline extraction (fontkit in the page), the texture is
  raster, and 한글 / 워드 / pdf-sign take PNG. Known Gap.
- Buttons under the fine-tune panel: 「PNG 저장」 (primary; file `도장_{style id}_{YYYYMMDD}.png`, never the typed text) ·
  「이미지 복사」 (only when ClipboardItem + clipboard.write accept image/png; hidden otherwise; status 「복사했어요. 한글·
  워드에 붙여 넣으세요.」 / 「복사하지 못했어요. PNG 저장을 써 주세요.」) · 「PDF에 찍기」 · 「서명도 만들기」 (link
  /stamp-signature/).
- Late legal note beside the buttons (checked OK): 「이 그림은 인감으로 신고한 도장이 아니에요. 인감이 꼭 필요한 서류는 받는
  곳에 먼저 물어보세요.」
- Storage: none except the one-shot hand-off key. The typed text is never put in a URL, file name, title or beacon.

**D7 Chain to /pdf-sign/ (reuse src/lib/ui/sign-handoff.ts).**
- S0 refactor (no visible change): `sendToPdfSign(png, from: SignSource = 'stamp-signature', go, track)` stores the PNG as
  today plus key `docttak:sign-from` = from; usage next t = from. `takeSignPng` returns `{blob, from}` and removes both
  keys; missing or unknown source → stamp-signature (back-compat for a tab open across the deploy).
- /pdf-sign/ arrival copy names the source: 「{도장 만들기 | 전자서명·도장 이미지 만들기}에서 만든 그림을 가져왔습니다. 이제
  PDF 파일을 고르세요.」 and image info 「…에서 가져온 그림」 (one map in sign-handoff.ts, unit-tested equal to tools.ts
  names). stamp-signature wording, and its e2e strings, unchanged.
- Storage full or blocked → existing HANDOFF_FAILED 「PNG를 내려받은 뒤 PDF 서명·도장 넣기에서 골라 주세요.」
- /pdf-edit/ is **not** a target: it places text, dates and white boxes only, no pictures.
- No FLOW / next-steps row (a PNG is not a document); the four buttons are the 이어서 하기 surface.

**D8 Usage (scripts/lib/usage.mjs single source).** TOOLS += stamp-maker; TOOL_LABELS 「도장 만들기」. `start` once per
page view on the first tile pick: o=style, v ∈ the 12 ids (VALUE_LABELS = D3 names, SETTING_LABELS 「도장 모양」).
`success` on PNG made, `download` on save or copy, `next` (sign-handoff) on 「PDF에 찍기」, `fail` c ∈ font, canvas,
encoder, unknown. **Never** the text, its length or script, colour, size, seed or date. If /privacy/ lists setting
keys, add 「도장 모양」.

**D9 Copy rules.** 문서딱 only; no 업로드/서버/브라우저/네트워크/메모리/px/dpi (postbuild JARGON; 「픽셀」 and 「mm」 ok);
lead with what the tool does; 「보내지 않습니다」 only in FAQ 6 and the small line beside the input (「쓴 글자는 이 기기 밖으로
보내지 않습니다.」 + privacy link); never 「법적 효력이 있습니다」, 「인감 대신」, 「인감 등록」 as something the tool does; no
fear words (위험, 불법, 처벌). COPY.md gains a 도장 만들기 line: 「도장 그림」, 「모양」, 「인주 질감」; never 「스탬프」.

**D10 Guide (S6, conditional).** Candidate 「전자도장 만드는 법·인감도장과 다른 점」 (slug e-stamp, tools: [stamp-maker]).
Step 0 sourcing (official only, verbatim, check:quotes --exact): 국가법령정보센터 인감증명법 and its 시행령 (인감 신고 조항),
정부24 인감 신고 / 인감증명서 발급 page; log every URL tried. Ships only with ≥ 3 sourced facts **and** the dup gate
passing against e-signature-law and stamp-image; otherwise deferred and logged (FAQ 2 already answers the legal question).
No number without a cited source and fetch date (no 인감 mm sizes).

## Flow
~~~
/stamp-maker/ (static HTML + tiny entry; no font link, no preload)
  load+idle  or first focus/pointer on the input  -> import(controller)
  controller: inject hwp-fonts.css once
  input --250 ms--> normalize/validate --bad char--> error; grid + save disabled
     -> fonts.load(family, weight, text) --fail / 4 s--> system font + note (+ fail c=font)
     -> 12 x layout(style, text, opts, measure) -> draw list
          -> over limit? tile disabled : paint tile (+ texture seed)
  tap tile -> selected (usage start o=style, once) -> fine-tune panel
     글꼴 | 굵기 | 색 | 가로/세로 | 붙이는 글자 | 선 두께 | 질감 + seed | 크기 mm | 2배 | 가운데 글자 | 날짜 도장 label/date
     -> repaint large preview + its tile
  PNG 저장    -> paint at mm x ppi -> texture -> toBlob(png) -> insert pHYs -> download (success, download)
  이미지 복사 -> same blob -> ClipboardItem (feature-detected)
  PDF에 찍기  -> sendToPdfSign(blob, stamp-maker) -> sessionStorage {png, from} -> /pdf-sign/
                  --storage full--> HANDOFF_FAILED note, download path
  /pdf-sign/: takeSignPng -> {blob, from} -> 「도장 만들기에서 만든 그림을 가져왔습니다…」 -> existing place/save flow
~~~

## Failure modes
| Path | Realistic failure | Handling | User sees |
|---|---|---|---|
| Font slices | Offline / 404 / slow mobile | 4 s timeout, system font, note, save allowed; fail c=font; e2e with the route aborted | clear note |
| Font coverage | Rare 한자 / symbol outside the faces | allowed-range check → error, save disabled; per-glyph Noto fallback for Nanum | clear |
| Canvas text | WebKit paints before the face is ready | paint only after fonts.load resolves and check() is true; webkit e2e pixel diff vs a system-font render | — |
| Layout | Long name clipped by the frame | per-style max; tile disabled with text; unit: ink boxes inside the inner frame for n = 1…max | clear |
| Layout | Arc glyphs overlap at 20 | step from band; unit: neighbour boxes never intersect | — |
| Output | 30 mm × 2 = 1,417 px on an old phone | far below canvas caps, fitWithinCaps anyway; toBlob null → fail c=encoder + message | clear |
| Hand-off | sessionStorage full / blocked | HANDOFF_FAILED; download path | clear |
| Hand-off | Tab stored before the deploy (no from) | default stamp-signature wording (unit) | — |
| Clipboard | Unsupported / refused | hidden / failure status | clear |
| Privacy | Name in beacon, URL, file name, title, storage | usage whitelist (unit), fixed file name, no URL state; e2e asserts storage and beacon bodies | — |
| Trust | Image taken as a registered 인감 or 직인 | FAQ 2 + late note; postbuild forbids 「법적 효력이 있」/「인감 대신」 on the page | clear |
| Budget | Controller or font CSS lands in initial load | check-dist rules (S2) | build fails |
| SEO | /stamp-maker/ and /stamp-signature/ compete for 도장 이미지 | D2 retitle (S5) + cross-links | — |

No critical gap: every new path has handling plus a test, or fails the build.

## Unverified claims (Bob probes, logs verbatim; nothing assumed)
- (a) fonts.load with unicode-range slices + fillText paints the webface on all 5 Playwright projects (pixel diff vs the
  system font).
- (b) measureText().actualBoundingBox* on all 5 projects; else em-box fallback (unit both paths).
- (c) Word / 한글 / LibreOffice insert size from pHYs: probe what is installed (LibreOffice at least), log; copy claims
  nothing about apps keeping the size.
- (d) ClipboardItem image/png: Chromium expected; WebKit and Firefox probed; hidden where unsupported.
- (e) The 5 compatibility 한자 misses are covered after NFC (unit over the 4,888 KS X 1001 list).
- (f) A PNG with pHYs goes through pdf-sign's image path unchanged (e2e).

## Test map ([GAP → new] unless marked)
Unit (vitest):
- layout.ts: NFC; allowed range (emoji, lone jamo rejected; Latin ok); script detection; suffix rules (n = 1-9 ×
  자동/없음/인/지인 × Hangul/Hanja/Latin); grid shape per style per n; column-major right→left order; 가로 toggle; auto-fit
  (every glyph box inside its cell and the inner frame, n = 1…max, all 12 styles); stretch clamp; arc non-overlap 3…20;
  limits → disabled; per-glyph family (Hanja + Nanum → Noto).
- ink.ts: same seed → identical alpha; other seed → differs; alpha only reduced; off → untouched.
- png.ts: pHYs after IHDR, CRC valid, 600/1,200 ppi round-trip; mm → px table (12…30 mm × 1x/2x).
- render in node (@napi-rs/canvas as today): each style non-empty; four corners alpha 0; exact colour with texture off;
  square-inverse has transparent glyph holes.
- sign-handoff: from stored / taken / removed; default on missing or unknown; name map = tools.ts names [TESTED → extend].
- usage.mjs: stamp-maker + 12 style values accepted, others rejected; Korean admin labels; affiliate maps equal
  [TESTED → extend].
- postbuild / check-dist: sitemap, llms.txt, OG list, JARGON, meta lengths, no font preload, no hwp-fonts link in the
  page HTML, controller not in initial JS, budgets, glyph tripwire, forbidden legal strings [TESTED → extend].

E2E (5 projects, no-upload guard on every test; webkit + firefox + mobile-safari run locally before review):
- stamp-maker.spec.ts: 「홍길동」 → 12 tiles painted, pairwise different; 7-syllable name → round tiles disabled with
  text; pick 사각 인감 → 4th cell has ink with 자동, none with 붙이지 않음; 洪吉童 paints (font requests only to
  /fonts/hwp/); emoji → error, save disabled; PNG 저장 → name 도장_square-seal_YYYYMMDD.png, PNG signature, 354×354 at
  15 mm and 709 with 2배, corners alpha 0, stroke pixels red within tolerance, pHYs present; 질감 with the same seed
  twice → identical bytes; font route aborted → note, tiles painted; arrows move the radio, Enter/Space picks; local and
  session storage unchanged; 「서명도 만들기」 → /stamp-signature/.
- chain: 「PDF에 찍기」 → /pdf-sign/ shows 「도장 만들기에서 만든 그림을 가져왔습니다. 이제 PDF 파일을 고르세요.」 → fixture PDF
  → place → save → the page has one image XObject with an SMask.
- stamp-signature.spec.ts, pdf-sign.spec.ts hand-off [TESTED, regression; stamp-signature wording unchanged].
- usage.spec.ts (cloud): start / success / download / next bodies; never contain 「홍길동」 or 洪.
- site / polish / growth lists, related, axe (grid, error, notes) [TESTED → extend]. LHCI /stamp-maker/ median of 5,
  thresholds unchanged, LCP ≤ 2,000 ms. qa:visual light / dark / 360 px.

## Build order (commits; each green before the next)
- **S0** sign-handoff from + /pdf-sign/ source-name map. No visible change on stamp-signature. Gate: unit, pdf-sign +
  stamp-signature e2e on 5 projects, pdf-sign lazy budget within 1 %.
- **S1** pure src/tools/stamp-maker/{styles,layout,ink,png,limits}.ts + unit tests (no page yet).
- **S2** page + controller: src/pages/stamp-maker/index.astro, src/tools/stamp-maker/{controller,render,fonts,entry}.ts,
  stamp-maker.css; full registration (TOOLS1015 decision 3 list: tools.ts before stamp-signature, og.json + gen-brand OG
  image, JSON-LD, sitemap / llms.txt, tool-facts, NEXT_GUIDES = stamp-image, e-signature-law, pdf-sign,
  tool-guide-order, lighthouserc, qa:visual, e2e lists, postbuild OG list, CLAUDE.md line 3 「도장 만들기」, COPY.md,
  bgcloud LOCAL_SCOPE_RE, HOME_DESC_ORDER, gen-sw NOT_PRECACHED + RUNTIME_PAGES, updated). check-dist block: initial JS
  < 30 KB gzip; controller lazy = measured + 20 %; no hwp-fonts link and no font preload in the page HTML.
- **S3** chain + clipboard + usage (D7, D8) + cloud usage spec.
  → **Deploy A** (S0-S3) after Richard "clear". Live smoke: phone + PC, 「홍길동」 and 洪吉童, PNG into 워드 (한글 on the
  owner's PC), PDF에 찍기 on a 정부24 PDF, beacon and GA requests text-free.
- **S4** cross-links (stamp-signature lead sentence, RelatedTools both ways, pdf-sign hint, 3 guide body links) +
  affiliate maps. **S5** stamp-signature title / description / keywords (D2), own commit. → **Deploy B** (Richard).
  After B (PC session): IndexNow ping, Naver crawl request for /stamp-maker/ and /stamp-signature/, Kakao cache refresh.
- **S6** guide (D10) only if Step 0 passes. → **Deploy C**.

## Gates (per deploy; CLOUD-HANDOFF §3)
astro check 0 · vitest all · check:licenses OK (no new package) · check:quotes --exact (S4 edited guides, S6) ·
check-dist OK on default, cloud flag-on, autoframe and bg builds (precache KB logged; 450 never raised) · 0 new core
glyphs (list + tripwire margin logged) · new + regression e2e on 5 projects with the no-upload guard · lhci median of 5 ·
Richard "clear" · live smoke.

## Out of Scope (BUILD-LOG Known Gaps)
- SVG output; more faces (Black Han Sans / Song Myung: OFL, KS X 1001 Hangul only, no 한자; a seal-script face if an
  OFL/Apache one appears); multi-cell 결재란 tables; logos or pictures inside a stamp; tilt; ring symbols (★);
  stamp-signature deep link to the draw tab; ?text= deep links (names in URLs); English twin; /embed/ widget.

## Acceptance
- /stamp-maker/ live in the menu (before 전자서명·도장 이미지 만들기), home, sitemap, llms.txt, OG, JSON-LD; 12 styles paint
  Hangul, Hanja and Latin names on 5 projects; PNG transparent with the chosen size and pHYs; PDF에 찍기 lands in
  /pdf-sign/ with the source name; stamp-signature hand-off unchanged; usage carries the style id only; 0 new core
  glyphs; budgets and precache ≤ 450 KB; LCP ≤ 2,000 ms; COPY.md updated; Richard "clear"; live smoke done.
- Deploy B: /stamp-signature/ title and description as D2; both pages link each other.

## Owner decisions (build proceeds on the defaults)
- **O1 slug** /stamp-maker/ (default). **O2 push:** standing go-ahead per deploy when Richard is clear and CI is green.
- **O3 real devices (owner-only):** iPhone Safari + KakaoTalk in-app: type a name, save the PNG to Photos, PDF에 찍기.
- Arch-decided (no owner call): reuse HWP faces, no new fonts; PNG only; 12 styles; stamp-signature keeps URL, name and
  h1 and gives its 도장 terms to stamp-maker; guide only with sources.

## Log notes (copy into BUILD-LOG "STAMP1015 — brief" when S0 starts)
- 2026-10-15 Arch: STAMP1015 brief (owner request 2026-10-15; Naver keyword table above). New tool /stamp-maker/
  「도장 만들기」, 12 styles: round, round-double, oval, square-seal, square-round, square-inverse, rect-v, rect-h, plain,
  corp-round, corp-square, date-round.
- Fonts: reuse /fonts/hwp/ faces (Noto Serif KR, Noto Sans KR, Nanum Myeongjo, Nanum Gothic; fontsource 5.3.0,
  OFL-1.1). Measured cmap coverage 2026-10-15: all 11,172 Hangul syllables in all four; KS X 1001 한자 4,883 (Serif) /
  4,885 (Sans) of 4,888 (misses are compatibility code points), none in Nanum → per-glyph Noto fallback. No OFL/Apache
  seal-script face found; Black Han Sans / Song Myung are OFL but KS X 1001 Hangul only, no 한자 → Known Gap.
- PNG only (no SVG); pHYs 600 / 1,200 ppi from mm choices; 인주 질감 seeded and deterministic.
- sign-handoff gains from; /pdf-sign/ names the source tool. /pdf-edit/ is not a chain target (no pictures).
- /stamp-signature/ keeps URL / name / h1; title, description and keywords move to 전자서명 + 도장 사진 배경 지우기 (S5).
- Core glyphs missing (never in core copy): 테 황 랑 굵 딕 之 印 싸 뀝 옵 뿐 듭 깥 레.
- Open: O1-O3.
