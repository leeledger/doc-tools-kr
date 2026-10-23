# Architect Brief — PRINT1023: 인화용 모아찍기 on /id-photo/ + CI flag-off build

Status: LOCKED 2026-10-23 (Arch). Base: main d927cb6 (IDCAM1022 A–E live). Worktrees under wt/ (wt/print1023-a, -b, -c).
Owner request: IDCAM1022 Step F 「인화용 모아찍기」 (queries 「증명사진 출력」「증명사진 인쇄」「집에서 증명사진 인화」) + close the
Known Gap "CI has no PUBLIC_ID_CAMERA=0 build job".
Sources: handoff/sources/print1023/print-size-2026-10-23.txt (찍스 lists 「4x6 (10.2cm x 15.1cm)」, fetched 2026-10-23; Bob
raw-dumps it in B0). Photo sizes come from the existing sourced `mm` of each preset (id-photo-presets.ts), nothing new.

## Goal
After saving a fitted photo whose 제출처 states a paper size, the user can also save one 4×6 JPG with that photo tiled N times and
cut lines, ready for a print service; and CI builds the camera kill-switch configuration on every PR.

## Locked decisions
P1 Sheet = ONE size, 4×6 inch at 300 ppi: 1800×1200 px (landscape) or 1200×1800 (portrait), JFIF 1/300/300, baseline, sRGB, no
   APP1. Why 4×6: the size print services sell (찍스 「4x6 (10.2cm x 15.1cm)」), 2:3 like our pixels. 5×7/A4/L판 -> Known Gap.
   Pixel math (1 in = 25.4 mm; 300 ppi = the existing PRINT_PPI) is arithmetic; the page never states 1800×1200 or 300.
P2 Which presets: only presets with `mm` (35×45: passport_online, id_card, driver_license, gosi, kuksiwon, jlpt; 30×40: police,
   hanja, half_card). Presets without a stated paper size (qnet, history, korcham, teps, saramin, jobkorea, custom) get NO sheet
   block (printing them at a size we chose = inventing a spec). Pure sheetPlan(p) returns null for them.
P3 Tile pixels: k = min(printPx(mm.w)/outW, printPx(mm.h)/outH); tile = round(outW*k) × round(outH*k); rendered from the ORIGINAL
   bitmap with the saved crop state at scale k (never upscaled from the small saved file). Expected: 413×531 for
   passport/id_card/driver/jlpt (k=1), gosi 411×531, kuksiwon 413×530, police/half_card 354×472, hanja 350×472.
P4 Layout (our own choices, logged, never shown as a rule): margin m = printPx(3) = 35 px each edge (absorbs the 2:3 vs 102:151
   crop and borderless overspray), gap g = printPx(2) = 24 px. Per axis n = floor((L - 2m + g)/(t + g)). Try both orientations,
   keep the larger count; tie -> portrait. Grid centred. Expected: 35×45 -> landscape 4×2 = 8; 30×40 -> portrait 3×3 = 9.
P5 Cut guides: each tile gets a 2 px #999 outline drawn OUTSIDE the tile (inside the gap), so cutting on the inner edge of the
   grey line gives the exact tile; 20 px white between neighbouring outlines. No text, no logo, no crop marks on the sheet.
P6 Gate = the existing save gate. The block lives in the done panel (#idp-done), shown only in phase "done", for the preset
   SNAPSHOT of that save ({p, st} captured in save(), kept by showDone). D8c (bg-removed photo + passport/driver) blocks save, so
   done and the sheet are unreachable; lowres/outside/custom blocks likewise. 「다른 규격으로 다시 만들기」/「다른 사진 처리하기」
   hide the block and revoke its URL. Defensive: the builder refuses without a snapshot.
P7 Low source: if st.s*k > 1 (the tile would be upscaled) show the non-blocking 「원본 사진이 작아서 인화하면 흐릿할 수 있습니다.」
   (our heuristic; no number shown).
P8 Encode: reuse the encode worker (encodeIdPhoto) with spec {outW: W, outH: H, dpi: 300}, no limitBytes (top quality), same
   verifyOutput. Composition: one tile via renderOutput with a NEW optional scale arg (default 1 = unchanged), then a W×H canvas:
   white fill, drawImage tile N times, outlines, getImageData -> worker. Zero all canvases after.
P9 UI (not in embed): inside #idp-done, after #idp-print, before #idp-print-links:
   div.out-links.idp-sheet#idp-sheet[hidden]: lead; count line (「3.5×4.5 cm 사진 8장」 via cmLabel); button 「인화용 모아찍기 만들기」
   (disabled while building); then link 「모아찍기 내려받기」 + preview img (max 320 px wide, alt names N); how-to note; lowres
   note; error line #idp-sheet-error (inside the block). File name print4x6_{fileTag}_{n}.jpg (ASCII).
P10 Copy (plain). All strings in SHEET_COPY in NEW src/data/print-sheet.ts, rendered in the system font like PRINT_COPY; add
   SHEET_COPY to the stripComments regex in scripts/lib/ui-font-chars.mjs; values contain NO closing brace (count line and how-to
   are assembled by concatenation):
   lead 「집에서 종이 사진으로 뽑으려면, 이 사진을 4×6 크기 한 장에 여러 장 모아 저장할 수 있습니다.」
   howtoA + cm + howtoB 「사진 인화 앱이나 사진관에서 4×6 크기로, 사진이 잘리지 않게 뽑으세요. 뽑은 뒤 한 장을 자로 재어 」+cm+
   「인지 확인하고, 회색 선 안쪽을 따라 자르세요.」
   error 「모아찍기를 만들지 못했습니다. 다시 눌러 주세요. 한 장짜리 사진은 위에서 그대로 내려받을 수 있습니다.」
   status (live region) 「모아찍기를 만드는 중입니다」 / 「모아찍기를 만들었습니다」.
   Never: 편의점/키오스크 (unsourced), 업로드/서버/브라우저, any px/dpi number, any acceptance promise.
P11 Budgets (never raised): pure layout src/lib/idphoto/sheet.ts may be static in the controller (<1 KB); the canvas builder
   src/tools/id-photo/sheet-build.ts is a dynamic import on the first tap. Initial JS <=30 KB unchanged; precache <=450 KB (report
   delta); UI font preload unchanged (SHEET_COPY stripped); FAQ/tool-note text (core font) reuses existing glyphs, reword if the
   check-dist tripwire moves; late face <=8 KB.
P12 Usage beacon: sheet download click -> track({e: "download", t: "id-photo", o: "sheet", v: <preset id>}). scripts/lib/usage.mjs:
   DOWNLOAD_SETTING["id-photo"] = "sheet"; SETTINGS.sheet = preset ids with mm (unit test keeps it equal to PRESETS with mm);
   SETTING_LABELS.sheet = 모아찍기. Verify the Function uses the same module. Plain id-photo download unchanged.
P13 No feature flag (small, additive; rollback = revert). /embed/id-photo/ never renders the block (check-dist asserts no
   id="idp-sheet" under dist/embed/).
P14 CI (Step A): NEW parallel job flag-off in .github/workflows/ci.yml (ubuntu-24.04, timeout 25, npm ci, no Playwright).
   Build 1: PUBLIC_ID_CAMERA=0, defaults (check-dist runs in postbuild). Build 2: PUBLIC_ID_CAMERA=0 + the dist-bgcloud env
   (BG_REMOVE, BG_CLOUD, ADDR_EN, USAGE_STATS, GA test id, AFF, ADSENSE test client, officer, contact) = production with the kill
   switch used. After each: the vitest files that read dist (postbuild/visits; Bob names them). Existing jobs untouched; parallel,
   so off the critical path. Also closes the IDCAM1022 D Known Gap: with camera off the /remove-background/ tool note must not
   name 증명사진 촬영 (gate that sentence on __ID_CAMERA__) + check-dist flag-off rule: dist/remove-background/index.html has no
   「증명사진 촬영」 and no /id-photo-camera/.
P15 Content: Step B adds to /id-photo/ one tool-note paragraph and one FAQ 「집에서 증명사진을 뽑을 수 있나요?」 (tools.ts), and
   keywords += 증명사진 출력, 증명사진 인쇄 (not rendered). Title/description unchanged. Step C: /guide/self-id-photo/ gets H2
   「찍은 사진 종이로 뽑기」 (~500–700 chars: steps, 4×6 cited to 찍스 with fetch date, 3.5×4.5 cm via the existing 외교부 quote,
   ruler check) + 1 own SVG of a 4×6 sheet with 8 tiles and grey lines (no numbers; flagged assets dir like its other figures).
   No new guide (too few sourced print facts for 2,500 chars).

## Flow
    save() ok --> showDone(p, bytes); snapshot = {p, st}
                     | p.mm ? --no--> #idp-sheet stays hidden
                     v yes
       #idp-sheet shown: count = sheetPlan(p).n (+ lowres note if st.s*k > 1)
                     | tap 「인화용 모아찍기 만들기」 (button disabled)
                     v
       dynamic import sheet-build -> renderOutput(bitmap, st, outW, outH, k) -> tile
          -> W×H canvas: white, N tiles, outlines -> ImageData -> encode worker {W, H, dpi 300}
                     |-- any throw / worker error --> #idp-sheet-error (single download unaffected)
                     v
       blob URL -> 「모아찍기 내려받기」 print4x6_<tag>_<n>.jpg + preview; beacon on click
       again / new / pagehide --> hide block, revoke URL
    D8c / lowres / outside / custom blocks --> save disabled --> never done --> no sheet

## Steps (each: Bob -> Richard -> deploy -> live smoke)
Step A — CI flag-off job + IDCAM1022 D gap (P14). Branch print1023-a. Small; ships first.
- Acceptance: the new job green on the PR (both builds), other jobs byte-identical in the diff, job wall time logged.
Step B — the sheet (P1–P13, P15 tool part). Branch print1023-b.
- B0: raw-dump 찍스 (try 2 other print services too) into handoff/sources/print1023/; cite only verbatim lines.
- src/lib/idphoto/sheet.ts (pure): tileSize(p), sheetPlan(p) -> {orientation, W, H, cols, rows, n, rects, outlines} | null.
- src/lib/idphoto/render.ts: renderOutput(..., scale = 1) (prescale uses st.s*scale).
- src/tools/id-photo/sheet-build.ts (lazy): compose + encode; injectable surface for tests.
- controller.ts: snapshot in save/showDone; show/hide; tap handler with run token; revoke on again/new/pagehide; track.
- IdPhotoTool.astro markup (!embed); src/data/print-sheet.ts; ui-font-chars.mjs regex; minimal CSS.
- tools.ts FAQ + tool note; usage.mjs (P12) + admin label.
- Flag: no network call, no text on the sheet, no number on a page that is not in a preset or the 찍스 source.
Step C — guide section + figure (P15). Branch print1023-c. check:quotes --exact, guide-length, similarity bar as CONTENT1021,
  updated date.

## Failure modes
| Path | Realistic failure | Handling | User sees |
|---|---|---|---|
| compose | low-memory phone: getContext null / getImageData throws | try/catch -> #idp-sheet-error; unit test with failing surface | clear; single file still downloadable |
| encode | worker or MozJPEG fails | canvas fallback (existing), else error line | clear |
| gate | sheet for a blocked photo (D8c) | only in done + snapshot; e2e D8c asserts hidden | n/a (tested) |
| preset drift | preset changed after done | snapshot; again/new hide block; e2e | n/a (tested) |
| upscale | tiny source -> blurry print | P7 note | clear |
| print scaling | service fits/fills 4×6 slightly differently (10.2×15.1 vs 2:3) | 3 mm margins; ruler step in how-to; O1 | clear (ruler step) |
| URL leak | blob URL kept | revoke on again/new/pagehide/rebuild | n/a |
| double tap | two sheets race | button disabled + run token | n/a |
| fonts | FAQ/note glyphs push preload over 92.66 KB | check-dist fails; reword | n/a |
| CI | flag-off build fails on a real trace | fix the trace; never relax check-dist | n/a |
No silent untested path remains.

## Test map
- [GAP->B] unit sheet.ts: each preset with mm -> expected tile and n (8 for 35×45 incl. gosi/kuksiwon; 9 for 30×40 incl. hanja);
  no-mm presets and custom -> null; rects inside [m, L-m]; pairwise gap >= g; centred (|left-right| <= 1); outlines only in gaps,
  never over a tile; orientation tie rule.
- [GAP->B] unit render: scale omitted = identical pixels to today; scale k -> round(outW*k)×round(outH*k).
- [GAP->B] unit sheet-build with fake surface: failing getContext -> error result; success -> ImageData W×H; real MozJPEG encode of
  a 1800×1200 synthetic passes verifyOutput at dpi 300.
- [GAP->B] unit: SHEET_COPY stripped by stripComments; no closing brace in its values; no banned words (업로드/서버/브라우저/키오스크/편의점).
- [GAP->B] unit usage: id-photo download o=sheet v=passport_online accepted; v=saramin rejected; another tool with o=sheet
  rejected; SETTINGS.sheet equals presets with mm.
- [GAP->B] e2e id-photo.spec (5 projects): passport_online save -> #idp-sheet visible, 「3.5×4.5 cm 사진 8장」 -> make -> download:
  JPEG 1800×1200, JFIF 300 (sniff/readJfif in node), tile-centre pixel ~ saved photo centre, an outline pixel grey, a margin
  pixel white; saramin save -> hidden; 「다른 규격으로 다시 만들기」 -> hidden; no-upload fixture; axe on done.
- [GAP->B] e2e D8c (existing from=remove-background + passport case): save disabled AND #idp-sheet hidden.
- [GAP->B] check-dist: no id="idp-sheet" under dist/embed/; /id-photo/ has it.
- [GAP->A] CI flag-off job: both builds + check-dist + dist-reading tests; check-dist rule for the /remove-background/ mention.
- [TESTED] id-photo save/limits/lowres (id-photo.spec), chain id-photo -> jpg-to-pdf (chain.spec), camera handoff specs: stay green.
- [GAP->C] guide-length, check:quotes --exact, similarity, figure present, link to /id-photo/.
- Every step: no-upload fixture, axe, LHCI on /id-photo/ (thresholds unchanged), qa:visual /id-photo/ done state.

## Unverified claims (never on a page)
- 편의점 photo kiosks print 4×6 from a phone file: unverified (O2). Copy says 「사진 인화 앱이나 사진관」 only.
- Print services keep the full 2:3 image within ~1 mm: unverified; 3 mm margins + ruler step cover it (O1).
- Agencies accept a home-cut print: not claimed.
- 찍스 string is from a WebFetch digest today; B0 must confirm it in a raw dump before any page cites it (else drop the cm figure
  and say only 4×6 with whatever source B0 finds; if none, Arch re-decides before B ships).

## Out of Scope (-> BUILD-LOG Known Gaps)
- Other sheet sizes (5×7, A4 home printer, L판), mixed presets on one sheet, copy-count picker, sheet in /embed/ and /en/, PDF sheet.

## Owner-only
- O1 Print one passport sheet through any 4×6 print service; measure one tile with a ruler (expect 3.5×4.5 cm); report.
- O2 Optional: try a 편의점 photo kiosk with the JPG; report (only then may copy name kiosks, with a source).

## Acceptance
- A: new CI job green on the PR (both builds), other jobs unchanged, D gap closed; Richard CLEAR; merged.
- B/C: npm run check 0/0; vitest all; default + PUBLIC_ID_CAMERA=0 + cloud builds check-dist OK; check:licenses (no new deps);
  e2e 5 projects green; budgets unchanged (report initial JS, precache delta, font preload); Richard CLEAR; live smoke on
  docttak.com: /id-photo/ passport save -> sheet download 1800×1200.
