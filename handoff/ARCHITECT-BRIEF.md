# Architect Brief — FORM1020 위임장 만들기 + 양식 채우기 엔진

Owner 2026-10-20: 「다음 툴 작업해」 → scout 2026-10-16 rank #2 (reports/growth/tool-scout-2026-10-16.md). Arch decides
everything below; owner-only items are at the end and never block the build.
Same house rules as ROMANIZE1016 / TOOLS1015: zero new core glyphs, registration list (D9), NOT_PRECACHED +
RUNTIME_PAGES, budgets never raised, every guide quote verbatim (check:quotes), plain language (docs/COPY.md).

## Goal
/power-of-attorney/ 「위임장 만들기」: the visitor fills blanks (or none) and downloads the same document as **HWP and
PDF**, built on the device by the HWP engine we already ship; the engine (FormSpec → rhwp document) is reusable for
차용증·사직서·이력서 without new engine code.

## Demand (scout, Naver keyword tool via next-t, 2026-10-16, monthly)
위임장 양식 15,220 · 위임장 10,230 · 인감증명서 위임장 5,280 · 대리인 위임장 양식 4,010 · 대리인 위임장 2,290 ·
위임장 쓰는법 1,990; ad clicks 410 (양식). Competitors: 비즈폼·예스폼 (paid / sign-up).

## Spike already done by Arch (2026-10-20; scripts + output in handoff/sources/form1020/)
- Node, vendored @rhwp/core 0.8.6: `HwpDocument.createEmpty()` → `createBlankDocument()` (embedded blank2010.hwp,
  fonts 함초롬돋움/함초롬바탕) → `insertText` → `splitParagraph` → `createTable(0,1,0,4,2)` → `insertTextInCell` ×8 →
  `mergeTableCells` → `exportHwpWithReport()` loss count 0, 13,312 B → reload pages 1, SVG contains the text;
  `exportHwpx()` 8,054 B.
- **Real 한글 check works on this PC:** 한글 2018 (HOffice100) is installed with COM automation (`HWPFrame.HwpObject`).
  open.ps1 opened probe.hwp: `open=True pages=1`, `GetTextFile("UNICODE")` = the title + all 8 cell texts
  (probe.hwp.txt). So the "does an rhwp-generated HWP open in 한글" risk is testable by script, not owner-only.
  Residual risk: newer 한글 (2022/2024), 한글 viewer, mobile 한글 → owner O1 (non-blocking).

## Locked decisions
- **D1 Scope: a general 위임장 only.** Never recreate a statutory form (인감증명서 발급 위임장 or any form an agency
  fixes by 별지 서식). The page and the guide say: an agency that has its own 위임장 form wants that form; for
  인감증명서 link the official page found in F0. If F0 finds no fetchable official page, say only 「관공서에 따라 정해진
  위임장 서식이 있어요. 내기 전에 그 기관에 확인하세요.」 — no law names, no form numbers.
- **D2 Build model: runtime from a declarative spec, no template asset.** `FormSpec` (TS data) → rhwp calls in the
  existing HWP worker → in-memory document. One source of truth (the spec), no binary in git, no extra fetch. Rejected:
  committed template .hwp (two truths, drift), hand-written HWPX XML (unverified OWPML), ClickHere 누름틀 fields
  (unverified in 한글), DOCX (not needed once HWP is proven; Known Gap).
- **D3 Engine = `src/lib/form/`** (pure, rhwp injected like export-hwp.ts):
  - `spec.ts` types: `FormSpec { id, fileBase, title, blocks[] }`; blocks: `title` (centered, bold, size),
    `para` (text with `{field}` slots, align), `table` (rows of `[label, field]`, optional section label merged
    down the left column, column widths), `dateLine` (field, align), `signLine` (label + field + 「(서명 또는 인)」).
    Field: `{ id, label (UI), docLabel, kind: text | multiline | date, maxLength, maxLines?, placeholder? }`.
    No computed fields, images or validation rules in v1 (차용증 금액 한글 comes with its own step).
  - `values.ts`: normalize (NFC, strip C0/C1 controls except newline for multiline, cut to maxLength by code
    points, cap lines at maxLines); empty allowed everywhere (D6). Pure, unit-tested.
  - `build.ts`: `buildForm(Doc, spec, values)` using only spike-proven calls plus formatting calls Bob proves in F1
    (`applyCharFormat`, `applyParaFormat[InCell]`, `createTableEx` colWidths, `splitParagraphInCell` for multiline).
    Any rhwp call that returns ok:false or throws → HwpError `export` (one code path).
  - `src/data/forms/power-of-attorney.ts`: the 위임장 spec (D5). Future forms = one data file + one page.
- **D4 Worker:** one new message `form-build {specId, values}` on the existing hwp.worker.ts: builds, keeps the doc
  as the session doc, replies `parsed` (pages, pageInfos) exactly like `open`. Then the existing `render` (preview +
  PDF) and the existing `export-hwp` (reload gate; export-hwp.ts unchanged) run as today. The spec is looked up by id
  inside the worker (never sent as code). Order on 「만들기」: form-build → render all pages (keep SVG + runs) →
  export-hwp → HWP blob ready. PDF is built on 「PDF로 받기」 from the kept SVGs with the existing
  src/lib/hwp/pdf/export.ts (fonts fetched then). A failed HWP gate still leaves PDF available (and vice versa); each
  button shows its own error.
- **D5 위임장 content (our layout; no legal claim in the document):** title 「위 임 장」; table 위임하는 사람(위임인):
  성명, 생년월일(주민등록번호), 주소, 연락처; table 위임받는 사람(대리인): 성명, 생년월일(주민등록번호), 주소,
  연락처, 위임인과의 관계; table 위임하는 내용: 제출할 곳, 맡기는 일 (multiline, maxLines 6); para 「위 사람에게 위
  내용에 관한 권한을 위임합니다.」; dateLine (default today, 「2026년 10월 20일」; empty → 「     년     월     일」);
  signLine 「위임인  {성명}  (서명 또는 인)」; para 「{제출할 곳} 귀중」 only when filled. UI labels plain
  (「맡기는 사람」「맡는 사람(대리인)」「맡기는 일」), document labels as listed. maxLength per field chosen so the
  all-max case is **1 page** in rhwp layout AND in 한글 (F2 proves both).
- **D6 Blank form is a feature:** no required fields; a secondary button 「빈 양식으로 받기」 builds with all fields
  empty (date line blank) → HWP/PDF for handwriting. This serves the biggest query (위임장 양식).
- **D7 Privacy:** typed text never leaves the device and is never stored: no localStorage/sessionStorage/IndexedDB,
  no values in URL, history, filenames, usage beacon or GA. Filenames fixed: 「위임장.hwp」「위임장.pdf」 (download.ts
  withExt). Reset clears all fields. Tool page CSP stays self (not a content page; ADS1020 unchanged).
- **D8 Chain:** NextSource `power-of-attorney` (PDF result) → FLOW `[pdf-sign, pdf-edit, pdf-compress]` (pdf-sign
  first: 도장·서명 넣기). Plus a static 「함께 준비하는 것」 link row (not a file handoff): /id-copy/ 신분증 사본
  만들기, /stamp-maker/ 도장 만들기, /pdf-merge/ PDF 합치기 (위임장 + 신분증 사본을 한 파일로). Reverse: a related
  link to /power-of-attorney/ from id-copy, stamp-maker, pdf-sign (related lists, no handoff). pdf-merge as a handoff
  target = Known Gap.
- **D9 Registration** = TOOLS1015 decision 3 / ROMANIZE D8 list: tools.ts (after stamp-signature), page
  src/pages/power-of-attorney/index.astro, og.json + OG image, JSON-LD (WebApplication + FAQPage), sitemap/llms via
  generators, tool-facts, NEXT_GUIDES + tool-guide-order, lighthouserc, qa:visual, site/polish/growth e2e lists,
  postbuild OG list, CLAUDE.md line 3 (「위임장 만들기」), docs/COPY.md line, bgcloud LOCAL_SCOPE_RE, HOME_DESC_ORDER
  (after stamp-signature), usage TOOLS/labels (events: start, build {blank|filled}, download {hwp|pdf}, next; never
  values), gen-sw NOT_PRECACHED + RUNTIME_PAGES, check-dist block (D10).
- **D10 check-dist block:** /power-of-attorney/ offers no 인감증명 form (the word appears only in the D1 caution and
  its link); no off-site script; not an ads content page; no localStorage/sessionStorage in the tool chunks; initial
  JS logged and within the hwpx-to-hwp budget class.
- **D11 Fonts / PDF:** rhwp reports 함초롬돋움/함초롬바탕 → existing faces.ts resolution (Nanum + Noto fallback).
  F1 proves glyph coverage for all 11,172 Hangul syllables, ASCII, common punctuation and the Hanja in the fallback
  slice; a missing glyph takes the writer's existing per-page raster fallback (never silent tofu: e2e with an emoji
  and a rare Hanja). PDF fonts embedded (pdf-lib check: every font has FontFile2/FontFile3).
- **D12 Real-한글 gate (local, this PC):** `scripts/forms/hancom-check.mjs` + `scripts/forms/hancom-open.ps1` (from
  handoff/sources/form1020/open.ps1): for every spec, build {blank, sample, all-max} in Node with the real engine,
  write .hwp, open each in 한글 via COM: open=True, PageCount == 1, UTF-8 text contains every non-empty value and every
  docLabel. Also save 한글's own PDF (SaveAs ... PDF) next to it for Richard's visual compare. `npm run forms:hancom`;
  without HWPFrame.HwpObject it exits 0 with 「SKIP: 한글 not installed」 (never in CI). Must pass before every deploy
  that changes a spec or build.ts; result + 한글 version logged in BUILD-LOG. If it fails and cannot be fixed: ship
  PDF only (HWP button off via a `FORM_HWP` constant in the spec module), log the gap, and Arch briefs DOCX as the
  editable fallback next.
- **D13 Guide (F4)** slug `power-of-attorney`, title 「위임장 쓰는 법: 들어갈 내용과 정해진 서식이 있는 경우」,
  query 「위임장 쓰는법」/「위임장 양식」, tools: power-of-attorney. ≥2,500 chars unique body (AdSense P1 bar); every
  legal statement backed by a verbatim quote with fetch date (F0). H2s: 위임장이 하는 일 (민법 위임·대리 quotes),
  들어가는 내용 (described as what our form contains, not as a legal requirement unless quoted), 정해진 서식이 있는
  위임장 (인감증명서 etc., official link), 대리인이 챙길 것 (quoted items only), 빈 양식으로 손으로 쓰기, 안 될 때,
  FAQ ×4 not copied from tools.ts. One-sentence inbound link from guides id-card-copy and the stamp guide. If F0
  yields < 2 official quotes, the guide stays a draft (Known Gap) and the tool ships alone.

## Flow
```
 form inputs --(만들기 | 빈 양식으로 받기)--> values.ts normalize (main thread)
        |
        v postMessage form-build {specId, values}
 hwp.worker: createEmpty -> createBlankDocument -> build.ts(spec) --fail--> error export -> 「만들지 못했어요」 + 다시 해 보기
        | parsed {pages}
        v render i = 0..n-1 (SVG + runs kept) --> preview page 1
        v export-hwp (export-hwp.ts: loss count, CFB magic, reload, page tolerance)
        |        +--fail--> HWP button error (unverified | export); PDF button still works
        v HWP blob ready --> 「한글(HWP)로 받기」
 「PDF로 받기」 --> pdf/export.ts (fonts fetched, per-page raster fallback) --> PDF blob --> 이어서 하기 (D8)
 any field edited after a build --> result marked stale, download buttons hidden until 만들기 again
```

## Failure modes
| Path | Realistic failure | Handling | User sees |
|---|---|---|---|
| form-build | rhwp call ok:false / throws (rhwp upgrade, odd input) | HwpError export; unit test per block type with the real engine | clear error + retry |
| Overflow | long values push to 2 pages | maxLength/maxLines; all-max unit test pages == 1 (rhwp) + D12 (한글) | prevented |
| HWP gate | reload fails | existing export-hwp.ts codes; PDF unaffected | clear HWP error |
| 한글 compat | opens in rhwp, not in 한글 | D12 COM gate before deploy; O1 for newer 한글 | prevented / owner check |
| PDF fonts | font slice fetch fails (offline) | existing export.ts error path | existing clear error |
| Missing glyph | emoji / rare Hanja | existing raster page fallback + e2e | correct page (raster) |
| Worker OOM / engine load | low-end phone | existing oom / engine codes | existing clear errors |
| Stale result | user edits after build, downloads old file | input event marks stale, hides buttons | 「바뀐 내용으로 다시 만들어 주세요」 |
| Privacy | value leaks to beacon / URL / storage / filename | D7; unit + e2e: beacon whitelist, no storage writes, URL unchanged, fixed names | n/a |
No silent untested path remains.

## Unverified claims (Bob probes in F1, logs verbatim; nothing assumed)
- `applyCharFormat` / `applyParaFormat(InCell)` props JSON keys (bold, size, align): read rhwp.d.ts docs, probe.
- `createTableEx` colWidths unit; `splitParagraphInCell` for multiline; whether `insertTextInCell` accepts a newline.
- Cell index order after `mergeTableCells` (spike: 8 cells → 7).
- Whether exportHwp output is byte-deterministic (tests never assert bytes unless proven).
- 한글 PDF via COM SaveAs format string (optional evidence only).

## Test map ([GAP → new] unless marked)
- values.ts: NFC, control strip, maxLength by code points, maxLines, empty → blank [GAP → unit].
- build.ts with the real engine: each block type; blank / sample / all-max → loss 0, reload ok, pages 1, glyphText has
  every value + docLabel; ok:false → HwpError export (fake doc) [GAP → unit].
- Spec lint: every field used exactly once, maxLength set, docLabel non-empty [GAP → unit].
- Worker form-build → parsed → render → export-hwp on the built doc [GAP → unit/e2e]; export-hwp.ts [TESTED].
- e2e /power-of-attorney/ (5 projects, no-upload guard): fill → 만들기 → preview → HWP download (reloaded in Node
  rhwp, text check) → PDF download (pdf.js text has the values, fonts embedded); 빈 양식 → 1-page HWP/PDF; stale
  marking; reset clears; emoji + Hanja → raster page; 이어서 하기 → /pdf-sign/ receives the PDF; 함께 준비 links; axe
  on form, error and result; no storage writes; cloud spec: beacon payload has no typed value [GAP → e2e].
- Regression: hwp-to-pdf, hwp-viewer, hwpx-to-hwp e2e + hwp unit suites after the worker change [TESTED → rerun];
  regress:hwp --fixtures-only [TESTED → rerun]; chain FLOW tests [TESTED → extend].
- check-dist D10 [GAP → check-dist + postbuild test]; LHCI /power-of-attorney/ (+ guide) median of 5.
- forms:hancom D12 [GAP → local script, logged].
- Guide: guides-schema, link-graph, check:quotes --exact [TESTED → extend].

## Build order (commits; each green before the next)
- **F0** sources to handoff/sources/form1020/ (date, URL, verbatim; law.go.kr via the lsInfoR.do form the other guides
  use): 민법 제680조 (위임) and 제114조 (대리행위의 효력); 인감증명법 시행령 article on 대리 발급 / 위임장 and its
  별지 서식; 정부24 인감증명서 발급 service page (구비서류); 찾기쉬운 생활법령 (easylaw.go.kr) 위임/대리 page if found.
  Log what could not be fetched. No page.
- **F1** engine src/lib/form/{spec,values,build}.ts + the probes above + unit tests with the real engine.
- **F2** worker message + spec power-of-attorney.ts + D12 hancom-check; run it, log the result and 한글 version.
- **F3** page + controller + entry + CSS + preview + downloads + stale/reset + D6 + D7 + chain D8 + registration D9 +
  check-dist D10 + e2e + axe + glyph log. → **Deploy A** after Richard "clear". Live smoke: phone + PC, filled and
  blank; the live-downloaded HWP through forms:hancom-open; the PDF opened; 이어서 하기 → pdf-sign; no off-site
  requests. After A (PC session): IndexNow ping, Naver 수집 요청 for /power-of-attorney/.
- **F4** guide (D13) if its gates pass. → **Deploy B**.

## Gates (per deploy; CLOUD-HANDOFF §3)
astro check 0 · vitest all · check:licenses OK (no new package) · check:quotes --exact · check-dist OK on default,
cloud flag-on, autoframe and bg builds (precache KB logged; 450 never raised; no budget raised) · 0 new core glyphs
(late face only; list + tripwire margin logged) · forms:hancom PASS (D12) · new + regression e2e on 5 projects with the
no-upload guard · lhci median of 5 · Richard "clear" · live smoke.

## Out of Scope (BUILD-LOG Known Gaps)
- 차용증·사직서·이력서 pages (next steps reuse the engine); DOCX / HWPX outputs; images (도장 image in the HWP, 이력서
  photo); 누름틀 fields; saved drafts; field deep links (personal data in URLs, never); statutory forms of any kind;
  /en/ twin; pdf-merge as a handoff target; multi-page forms; computed fields (금액 한글).

## Acceptance
- /power-of-attorney/ live in menu (after 서명·도장 이미지), home, sitemap, llms.txt, OG, JSON-LD; filled and blank
  builds give a 1-page HWP that opens in 한글 2018 (D12 log) and a 1-page PDF with embedded fonts; all e2e above pass
  on 5 projects; no typed value in storage, URL, filenames, beacon or GA; D1 caution present; chain to /pdf-sign/
  works; budgets and precache ≤ 450 KB unchanged; 0 new core glyphs; LHCI thresholds; COPY.md and CLAUDE.md updated;
  Richard "clear"; live smoke done. Deploy B: guide live, ≥2,500 chars body, check:quotes --exact green.

## Owner decisions (build proceeds on the defaults)
- **O1 (non-blocking):** open one downloaded 위임장.hwp in the newest 한글 you have (2022/2024) and on a phone (한컴
  오피스 앱 / 한글 뷰어). Until then the HWP ships on the 한글 2018 COM proof.
- **O2 push:** standing go-ahead per deploy when Richard is clear and CI is green.
- Arch-decided: slug /power-of-attorney/; runtime build from spec (no template asset); HWP + PDF only; blank-form
  button; no required fields; fixed filenames; chain to pdf-sign/pdf-edit/pdf-compress + static links.
