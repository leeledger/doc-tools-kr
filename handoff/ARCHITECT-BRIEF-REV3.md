# Architect Brief — REV3 (더 많은 제휴 자리 + HWP 고지 손질)

Source: owner "쿠팡 파트너스 등 수익화 가능한 수단을 최대한 많이 진행시켜" (2026-10-12); `C:/dev/doc-tools-kr/reports/문서딱 수익화 전략 검증.md` (제휴 규칙 L47, L71); `C:/dev/doc-tools-kr/reports/HWP 뷰어 한컴 저작권 검토.md` (표 L39-42).
Base: REV2 merged and deployed (src/data/affiliate.ts, print-links.ts, print-links-check.mjs, usage `out`). Do not start before REV2 is logged as deployed.

## Goal
With `PUBLIC_AFF_COUPANG=1`, every tool result screen and guide with a natural product fit shows one static, disclosed Coupang text-link block, every click is counted (tools and guides), the precache gate is measured in the production config, and the three HWP notice fixes ship.

## Locked decisions
1. **Placement map (single source: `src/data/affiliate.ts`).** `AFF_LINKS` keeps one entry per product (dest, label, href). New `TOOL_AFF: Record<ToolSlug, Dest[]>` and `GUIDE_AFF: Record<ToolSlug, Dest[]>` (key = the guide's `tools[0]`). Max 3 links per block. A dest with no `AFF_LINKS` entry is skipped at build (links the orchestrator has not created yet); a block with 0 links is not rendered.

   | Screen | Dests (in order) | Status |
   |---|---|---|
   | id-photo result | cp-printer, cp-paper, cp-backdrop | REV2, unchanged |
   | remove-background result | cp-backdrop | reuse |
   | stamp-signature result | cp-stamp | reuse (REV2 data) |
   | pdf-sign result | cp-stamp | reuse |
   | hwp-viewer, hwp-to-pdf, hwpx-to-hwp result | cp-hancom | reuse (REV2 data) |
   | pdf-merge, pdf-split result | cp-mfp | NEW link needed |
   | jpg-to-pdf result | cp-mfp, cp-scanner | NEW links needed |
   | guides, tools[0] = id-photo (~22 guides) | cp-tripod, cp-backdrop, cp-printer | cp-tripod NEW; ships with 2 until then |
   | guides, tools[0] in hwp-viewer / hwp-to-pdf / hwpx-to-hwp | cp-hancom | reuse |
   | guides, tools[0] in stamp-signature / pdf-sign | cp-stamp | reuse |
   | guides, tools[0] in pdf-merge / pdf-split | cp-mfp | NEW |
   | guides, tools[0] = jpg-to-pdf | cp-mfp, cp-scanner | NEW |
   | guides, tools[0] = remove-background | cp-backdrop | reuse |
   | **No block** | home, 404, offline, privacy, terms, licenses, /guide/ index, hubs (photo-sizes, upload-limits), pdf-compress, photo-compress, image-to-jpg, pdf-to-jpg, pdf-password, and every guide whose tools[0] is one of these | no product fit (upload/size tasks): ads there cost trust for ~0 revenue |
2. **Labels** (generic, no prices, suffix `(쿠팡, 광고, 새 창)` like REV2): cp-mfp `가정용 복합기(인쇄·스캔)`, cp-scanner `휴대용 문서 스캐너`, cp-tripod `스마트폰 삼각대(리모컨)`. Lead lines (`AFF_COPY`, plain Korean per docs/COPY.md): pdf `종이로 내야 하면`, scan `종이 서류를 자주 PDF로 만든다면`, photo-guide `집에서 직접 찍고 뽑으려면`, backdrop `다음에 흰 배경으로 찍으려면`; existing stamp-signature, hwp, id-photo lines reused. Bob may adjust wording within COPY.md rules; check:quotes green.
3. **One component** `src/components/OutLinks.astro` (props: links, lead, optional guide slug). Markup = the REV2 affiliate group: container `.out-links`, disclosure paragraph `AFF_DISCLOSURE` first, lead line, a list of `<a href rel="sponsored noopener" target="_blank" data-out={dest}>`. id-photo keeps its info link and uses the component for its affiliate group. Text links only: no image, banner, iframe, Coupang script, sticky or floating element.
   - Step R3.1 (refactor, no behavior change): rename `.print-links` to `.out-links` everywhere (system-font rule in app.css L486, fontcover exemption, check-dist, tests) and move the id-photo affiliate group into OutLinks. Default and flag-on id-photo HTML differ only by the class name (diff pasted in REVIEW-REQUEST).
4. **Tool pages:** the block sits inside each tool's result container (the element visible only with a result), directly after the download/result actions and before 이어서 하기 if present. No JS show/hide. hwp-viewer: inside the area that appears once a file is open (Bob picks the result-only container and names it in REVIEW-REQUEST).
5. **Guide pages (`src/layouts/Guide.astro`):**
   - Top disclosure (공정위 「추천·보증 심사지침」 2024-12-01, "첫 부분"): when the guide has at least 1 link, one line `AFF_COPY.top` = `이 글에는 쿠팡 파트너스 광고 링크가 있어요. 링크로 사면 문서딱이 수수료를 받을 수 있어요.` right after the H1/date meta row, before the answer block, small muted text. Must not become the LCP element (verify in the LHCI trace) and must not appear in meta description, og or JSON-LD.
   - The OutLinks block (full `AFF_DISCLOSURE` inside) is the first section of `aside.guide-more`, before 함께 보면 좋은 안내. Heading `도움이 되는 물건 (광고)`.
6. **Counting clicks.**
   - Tools: one shared helper in `src/lib/ui/usage.ts`, `trackOut(root, t, g?)` = one delegated click listener on `closest('a[data-out]')` then `track({ e:'out', t, o:'out', v, g })`. No preventDefault, no URL rewriting. Called once from each controller of a screen with a block (9 tools); id-photo switches to it. A no-op when stats are off (same as `track`).
   - Guides (decision: **count**): guides already run JS (`src/lib/ui/site.ts` via Base.astro L152), so a delegated listener is not a zero-JS regression. Add `src/components/GuideOutTracker.astro` whose script imports `trackOut` and binds it with t = tools[0], g = slug (via = guide); render it **only** when the guide has at least 1 link AND `PUBLIC_USAGE_STATS=1`. Guides are NOT_PRECACHED, so its chunk is not precached.
   - Flag: verify by dist grep that guides without links, and every stats-off build, have the same script-tag count as HEAD. If Astro ships the script regardless of conditional rendering, stop and tell Arch (fallback: site.ts dynamic-imports the tracker only when `.out-links[data-guide]` exists; measured).
   - `scripts/lib/usage.mjs` (the single whitelist): `OUT_DESTS` += cp-stamp, cp-hancom, cp-mfp, cp-scanner, cp-tripod; replace the `t === 'id-photo'` rule with `TOOL_OUT` and `GUIDE_OUT` (mjs copies of TOOL_AFF/GUIDE_AFF, plus photo-studio on id-photo); `ONLY.g` = arrive, out; an `out` with g must match GUIDE_OUT[t], without g TOOL_OUT[t]. A unit test imports affiliate.ts and usage.mjs and asserts the maps are equal (drift = red test, never silent server-side drops).
   - Admin + weekly (`usageSql().outs` adds `blob7 AS guide`): columns 자리 / 링크 / 누른 횟수 / 저장 성공 대비(%). 자리 = tool name for tool rows, `안내 글` (all guides summed) for guide rows; ratio only for tool rows (that tool's own success), `-` for guide rows. OUT_LABELS for new dests. Note text unchanged.
7. **Privacy:** the REV2 list sentence becomes `도구 결과 화면과 안내 글의 상품·사진관 링크를 눌렀는지(링크 종류와 화면 이름만)`; `PRIVACY_OUT` = REV3 deploy date; revision-history line; PRIVACY_REVISED / PRIVACY_TERMS_UPDATED per their existing rules. Nothing else changes.
8. **Precache (hard gate, production config).**
   - R3.0 prerequisite: the `.github/workflows/ci.yml` cloud build env (L102-109) gets `PUBLIC_AFF_COUPANG: "1"`, so the 450 KB gate measures what production builds. Skip if REV2 already added it.
   - R3.0: `/hwp-to-pdf/` joins `NOT_PRECACHED` (scripts/gen-sw.mjs L50) and sw.ts `RUNTIME_PAGES`, with a comment citing the hwp-viewer precedent (gen-sw L43-46: the 9.7 MB rhwp wasm is never precached, so a first offline visit cannot convert anyway; returning visitors keep it via the runtime cache). Measured saving at T4: 35.2 KB (cloud). Own commit, before any link work, before/after numbers.
   - After all of REV3: cloud build with `PUBLIC_AFF_COUPANG=1` at or under 450 KB; report remaining headroom. Never raise the limit.
9. **Fonts:** every new string lives in `affiliate.ts` constants covered by the REV2 `stripComments` exclusion (extend it to new constant names); blocks render in the system font via `.out-links`. Core preload faces +0 bytes from links. HWP text (Decision 10) may add syllables: measure; if core grows more than 0.4 KB, stop and report.
10. **HWP legal fixes** (report table L39-42):
    - `TRADEMARK_NOTICE` (src/tools/hwp-shared/messages.ts L11) becomes `한글, 한컴, HWP, HWPX는 (주)한컴(옛 한글과컴퓨터)의 상표입니다. 문서딱은 한컴과 제휴·후원·승인 관계가 없습니다.` Update the pins (tests/e2e/hwp-to-pdf, hwp-viewer, hwpx-to-hwp specs; tests/unit/hwp-tool.test.ts).
    - `HANCOM_NOTICE` stays (web wording). New `HANCOM_NOTICE_PDF` = `본 제품은 한글과컴퓨터의 한글 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.`, shown on /licenses/ next to HANCOM_NOTICE, and as a legal comment (`/*! ... */`) at the top of messages.ts and the hwp tool entry files. Flag: grep dist for the sentence in the hwp chunks; if the minifier drops legal comments, report it and keep the /licenses/ and source copies (HANCOM_NOTICE is in the bundle as UI text anyway). Do not fight the minifier config.
    - HWPX help line in the /hwpx-to-hwp/ and /hwp-viewer/ help sections: `HWPX는 국가표준 KS X 6101(OWPML)을 따르는 한글 문서 형식입니다.` (the what-is-hwpx guide already mentions it: leave it).
    - The cp-hancom label is a product name inside a Coupang ad next to a 제휴 관계가 없습니다 notice: descriptive use, fine. Never write 공식 / 정품 인증 / 한컴 제공, never a Hancom logo or image.
11. **No CSP / `_headers` / CLAUDE.md change.** No Coupang script, iframe, widget or dynamic banner. Live smoke "외부 요청 0" still holds.

## Flow
```
build: PUBLIC_AFF_COUPANG=1 ?
  no  -> no block, no top line, no tracker anywhere (HTML == R3.1 output)
  yes -> tool page:  TOOL_AFF[slug] ∩ AFF_LINKS -> 0 links? skip : <OutLinks> in result container
         guide page: GUIDE_AFF[tools[0]] ∩ AFF_LINKS -> 0? skip : top line + <OutLinks> in aside
                     + (PUBLIC_USAGE_STATS=1) <GuideOutTracker>
click a[data-out] -> new tab (browser default)
                  -> trackOut -> track({e:out, t, o:out, v, [g]}) -> /api/usage -> validate(TOOL_OUT | GUIDE_OUT) -> AE
admin/weekly: outs (tool, guide?, dest) -> 자리 / 링크 / 횟수 / 성공 대비
```

## Build Order
- R3.0 (own commit): ci.yml flag; hwp-to-pdf to NOT_PRECACHED + RUNTIME_PAGES; precache before/after.
- R3.1 (own commit, refactor): `.print-links` to `.out-links`; OutLinks.astro; id-photo uses it; HTML diff = class name only.
- R3.2: affiliate.ts maps + labels + AFF_COPY.top; unit tests (missing dests skipped, max 3, flag off gives none).
- R3.3: OutLinks on the 8 other tool pages; `trackOut`; controllers wired.
- R3.4: Guide.astro top line + block + GuideOutTracker.
- R3.5: usage.mjs maps + validate + sync test; usageSql / shapeUsage / admin-view.
- R3.6: check-dist (`scripts/lib/print-links-check.mjs` renamed `out-links-check.mjs`): (a) sponsored links forbidden on the explicit No-block denylist; (b) every sponsored link inside `.out-links`, preceded within it by `AFF_DISCLOSURE`; (c) target=_blank and label contains 광고; (d) a /guide/* page with a sponsored link has `AFF_COPY.top` before its first h2; (e) flag off: no `link.coupang.com` and no `rel="sponsored` anywhere; flag on: id-photo still has its 3. Pass/fail fixtures in tests/unit/postbuild.test.ts.
- R3.7: privacy (Decision 7).
- R3.8: HWP fixes (Decision 10).
- R3.9: docs: OPS-RUNBOOK §10 (where links show; adding a link = one AFF_LINKS entry; 끄기), REVENUE-MODEL §1 status line, COPY.md exception line covers the new lead lines.
- Flag: Coupang hrefs are public short links committed in affiliate.ts (REV2 precedent); fixtures use `https://example.com/...`.
- Flag: no dest goes onto a screen outside the table above without Arch.

## Failure modes
| Path | Realistic failure | Handling | User sees |
|---|---|---|---|
| Precache | Flag-on production build over 450 KB: Pages build fails, deploy blocked | R3.0: CI measures flag-on; hwp-to-pdf freed first | Nothing (old deploy stays); CI red first |
| Missing link | cp-mfp not created yet | Dest skipped; empty block not rendered; unit test | Fewer links, no broken UI |
| Disclosure | Guide block without top line | check-dist (d) + fixture | Build fails |
| Forbidden screen | OutLinks added to pdf-compress / 404 | check-dist (a) denylist | Build fails |
| Map drift | TS map and usage.mjs map diverge, valid clicks dropped | Sync unit test | CI red |
| Guide tracker | Script on every guide / when stats off | dist script-count check | Review blocks |
| Beacon | Stats off / sampled out / sendBeacon throws | existing no-op + try/catch | Link still opens |
| Stale page | Cached page sends an unknown pair | validate returns null | Nothing |
| Fonts | New label not excluded: tofu or core growth | stripComments rule + fontcover check | Build fails |
| Coupang | Product link dies | Search-type links (orchestrator); runbook 링크 바꾸기 | Coupang search page, not 404 |
No silent and untested path remains.

## Test map
- affiliate.ts: maps, skip missing, max 3, flag off gives none [GAP->unit]; TS maps == usage.mjs maps [GAP->unit].
- usage validate: each new tool pair ok; guide pair needs g; tool-only pair with g -> null; unknown pair -> null; REV2 id-photo outs still valid [GAP->unit; REV2 tests TESTED, keep].
- shapeUsage/admin: guide rows summed, ratio `-`, tool ratio vs own success [GAP->unit]; existing table order [regression].
- check-dist (a)-(e) [GAP->postbuild fixtures].
- e2e (5 browsers + axe) on a flag-on build: pdf-merge block appears only with a result; passport-photo guide shows top line + block; pdf-compress result and 404 have no sponsored link; click opens a popup (external host routed to a stub) [GAP->e2e]. Default build: no block anywhere [GAP->e2e site.spec].
- cloud usage e2e: guide click gives one beacon {e:out, t:id-photo, o:out, v:cp-backdrop, g:passport-photo, via:guide}; pdf-sign result click gives {t:pdf-sign, v:cp-stamp}; body has no URL [GAP->e2e cloud].
- HWP notice text, KS X 6101 line, both Hancom sentences on /licenses/ [GAP->pins updated].
- Offline regression: /hwp-to-pdf/ works from the runtime cache after one visit (hwp-viewer SW e2e pattern) [GAP->e2e].
- Regression: REV2 id-photo e2e, chain/share/save, check:quotes, meta-length, licenses [TESTED].

## Out of Scope (-> BUILD-LOG Known Gaps if it surfaces)
- Links in the embed widget (REV5: never; Coupang site registration), hubs, guide index, upload-size tools.
- Coupang dynamic banners, search widget, carousel (script/iframe; CSP).
- Photo-print service affiliate (no program yet; revisit with 링크프라이스).
- KIPRIS check and Hancom inquiry (owner).

## Acceptance
- R3.0 and R3.1 are separate commits with numbers/diff in REVIEW-REQUEST.
- vitest green; astro check 0; check:quotes green.
- Default build: check-dist OK, no sponsored link; core font bytes vs HEAD reported (+0 from links).
- Cloud build with `PUBLIC_AFF_COUPANG=1` (CI env): check-dist OK, precache at or under 450 KB, headroom reported.
- Flag-on HTML snippets pasted: pdf-merge block; passport-photo top line + block.
- e2e 5 projects + axe green; LHCI (guide + tool URLs) LCP at or under 2,000 ms, CLS unchanged.
- dist grep: guide script count without links == HEAD; no sponsored link on any denylisted page.

## Links the orchestrator must create (owner's Coupang Partners account; prefer search-type links)
| dest | keyword | placement | why |
|---|---|---|---|
| cp-mfp | 가정용 잉크젯 복합기 | pdf-merge, pdf-split, jpg-to-pdf results; guides pdf-merge, pdf-split, yearend-tax-pdf, jpg-to-pdf | 제출 서류를 인쇄·스캔 |
| cp-scanner | 휴대용 문서 스캐너 | jpg-to-pdf result + guide | 종이 서류를 PDF로 |
| cp-tripod | 스마트폰 삼각대 블루투스 리모컨 | every guide with tools[0] = id-photo | 혼자 증명사진 찍기 |
Until they exist the dest is simply absent from AFF_LINKS (one-line add later).

## Orchestrator addendum (2026-10-12): new Coupang links created in the owner's account
- cp-mfp (가정용 잉크젯 복합기): 삼성전자 컬러 잉크젯 복합기 SL-J1680 — https://link.coupang.com/a/hM4wFTvnPw
- cp-scanner (휴대용 문서 스캐너): 엡손 휴대용 무선스캐너 ES-60W — https://link.coupang.com/a/hM4zbm4al2
- cp-tripod (스마트폰 삼각대 블루투스 리모컨): 셀루미 155cm 롱레인지 블루투스 올인원 삼각대 — https://link.coupang.com/a/hM4xVunZkq
(Product links, not search links — the partners UI generated product links. Use generic labels, no prices.)
