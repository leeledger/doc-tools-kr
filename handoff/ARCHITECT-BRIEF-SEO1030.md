# Architect Brief — SEO1030 구글 검색 클릭 늘리기 (사진 규격 안내)

Owner 2026-10-29 「문서딱 자체 사이트 유입이 많아야」. Data: reports/gsc/검색어 2026-10-29.md (GSC 2026-09-29~10-27, 28 days).
Branch seo1030, worktree C:\dev\doc-tools-kr\wt\seo1030.

## Goal
The 9 photo-spec pages that hold most impressions at position 7-15 with ~0% CTR show the exact words people search
(규정·규격·크기·사이즈·몇 장·2026·적성검사·크기 조정) in title, description, H1, answer and FAQ, and link to each other and to
the matching /id-photo/?preset= tool more strongly.

## What the code already does (checked, no change)
- H1 = `title`; `<title>` = `title | 문서딱` (≤ 40 code points, schema). Meta description = `description` (40-80).
- JSON-LD on every guide/hub: Article (dateModified = updated), FAQPage (from `faq`), BreadcrumbList. Nothing missing.
  Note: Google shows FAQ rich results only for gov/health sites since 2023, so FAQ value = on-page long-tail match, not a SERP widget.
- Every number in title/description/answer/FAQ/body must be backed by a source quote (`unsourcedFacts`, build fails). Good guard.
- /guide/id-photo-size/ is already a 301 to /guide/photo-sizes/ (public/_redirects). No action; GSC will fold it.
- Every target already has a preset CTA (driver_license, id_card, half_card, saramin, history, id_card, passport_online).

## Decisions (locked)
- D1 Scope = these 9: driver-license-photo, id-card-photo, admission-photo, resume-photo, kakao-photo, history-exam-photo,
  youth-card-photo, intl-driving-license, hub photo-sizes. kuksiwon-photo (best performer, 5.8%) is NOT touched: never
  retitle the page that already earns clicks (Known Gap: 「국시원 사진 규정」 14 impr, revisit after SEO1030 is measured).
- D2 Titles (= H1). Target wording below; Bob may adjust only to pass the length rule, keeping the starred words:
  | slug | new title | query field |
  |---|---|---|
  | driver-license-photo | 운전면허 사진 *규격·규정 2026* (갱신 *몇 장*) | 운전면허 사진 규정 |
  | id-card-photo | 주민등록증 사진 *규격·크기* (신규·재발급) | 주민등록증 사진 규격 |
  | admission-photo | *대학 원서 사진 규정*·규격, 진학사·유웨이 (D6b may make it 대학·대학원) | 대학 원서 사진 규정 |
  | resume-photo | *사람인·잡코리아 사진 크기 조정*, 이력서 사진 규격 | 잡코리아 사진크기조정 |
  | kakao-photo | 카톡 사진 *용량 제한*, 한 번에 보낼 수 있는 양 | 카톡 사진 용량 |
  | history-exam-photo | *한능검 사진 규격·크기* (한국사능력검정시험 원서) | 한능검 사진 규격 |
  | youth-card-photo | 청소년증 사진 *규격·크기*와 발급 신청 방법 | 청소년증 사진 규격 |
  | intl-driving-license | 국제운전면허증 사진 규격 (*여권용* 3.5×4.5 cm) | 국제운전면허증 사진 |
  | hub photo-sizes | 증명사진 *크기·사이즈* 규격 모음 (기관별 한눈에) | n/a |
  No year in any other title (title year must equal the updated year; only the driver page has 「2026」 demand).
- D3 Descriptions (40-80, plain language, docs/COPY.md): lead with the answer numbers for the searched words, end with what
  the tool does in plain words (e.g. 「…로 바로 맞춰요」). Never lead with "files never leave". Examples (trim to ≤ 80):
  - driver: 운전면허 사진 규정은 6개월 이내 3.5×4.5 cm 여권용 컬러예요. 1종 적성검사 2장, 2종 갱신 1장이고 파일은 413×531픽셀로 맞춰요.
  - resume: 사람인 100×140픽셀, 잡코리아 150×210픽셀 이하로 이력서 사진 크기를 바로 맞춰요. 용량 기준도 함께 정리했어요.
  - photo-sizes: 여권·주민등록증·운전면허 3.5×4.5 cm, 반명함판 3×4 cm 등 증명사진 크기를 기관별로 한 표에 모았어요.
  ogDescription may stay. og (share image) unchanged.
- D4 Answer box (one sentence ≤ 120, ends 다/요): must contain the main query noun + number. driver answer already fine;
  edit others only where the query word (규정/크기) is missing.
- D5 FAQ (max 6 per page). Questions in the searcher's wording. Required:
  - driver: rename 「사진은 몇 장 필요한가요?」 to 「운전면허 갱신 사진은 몇 장 필요한가요?」; add 「운전면허 적성검사 사진은 갱신 사진과 같나요?」
    (same 3.5×4.5, 1종 2장) and 「운전면허 사진 규정상 안 되는 사진은?」 (흰 배경, 무표정·치아, 수정·합성, 인화지). Total 6; all facts already quoted.
  - id-card: add 「주민등록증 재발급 사진 규격도 같나요?」 (both gov.kr quotes) and, only if D6a succeeds, 「주민등록증 카드 크기는요?」.
  - resume: add 「잡코리아 사진 크기 조정은 어떻게 하나요?」 (preset jobkorea, 150×210).
  - photo-sizes hub: add 「증명사진과 반명함판 크기는 어떻게 다른가요?」 (row facts).
  - youth: add 「청소년증 사진 규정은?」 from existing quotes. history / kakao / admission / intl: one FAQ each only if D6 gives a quote.
- D6 New facts = live probe, verbatim quote, retrieved 2026-10-29; no quote means no claim: log the verbatim failure in
  BUILD-LOG and Known Gaps. Probes (each optional, skip on failure):
  a) 주민등록증 card size (law.go.kr 주민등록법 시행규칙 별지 서식, or 행정안전부) for query 「주민등록증 크기」.
  b) 대학원 원서 사진 on jinhakapply / uwayapply FAQ. Found: title 「대학·대학원 원서 사진 규정, 진학사·유웨이」 + 1 FAQ. Not found: no 대학원 word anywhere.
  c) historyexam.go.kr FAQ on 셀카/휴대폰 사진 or 6개월 (queries 한능검 셀카, 한능검 사진 6개월).
  d) cs.kakao.com 1073209424 (or the file-sending help page) file limit for 「카톡 파일 전송 용량」.
  Existing quotes stay byte-exact; bump a source's retrieved date only if you re-read it.
- D7 updated: '2026-10-29' on every edited guide/hub. sitemap lastmod follows.
- D8 Internal links:
  - TOOL_GUIDE_PINS['id-photo'] to ['passport-photo', 'driver-license-photo', 'kuksiwon-photo', 'id-card-photo'] (demand
    517/345/210 impr; passport-photo stays first as the generic page). Update the exact-list unit test. Precache stays in budget.
  - kakao-photo and intl-driving-license bodies gain one sentence linking /guide/photo-sizes/ (the other 6 already have it).
  - related: driver [id-card-photo, intl-driving-license, youth-card-photo, passport-photo]; admission [univ-docs-upload,
    resume-photo, history-exam-photo, kosaf-docs]; hub photo-sizes adds driver-license-photo. Others unchanged.
  - Respect the one-line link-paragraph rules (tests/unit/guides-schema.test.ts ~L530-545).
- D9 Regression guard (new it() in tests/unit/guides-schema.test.ts): slug to required title substrings (규정: driver,
  admission; 크기: id-card, resume, history, youth, photo-sizes; 몇 장: driver; 용량: kakao; 여권용: intl); driver FAQ has a q with
  「몇 장」 and one with 「적성검사」; all 8 guide bodies link /guide/photo-sizes/.
- D10 Run node scripts/gen-guide-titles.mjs. Old literal titles: src/data/tools.ts:1275 (resume link text),
  tests/e2e/hubs.spec.ts:45 (admission). tests/unit/usage.test.ts:370 and the admin snapshot change only if they fail; diff
  any snapshot change, never update blindly.

## Flow
    GSC query --> SERP: <title> (= H1) + meta description --click--> guide
                                                                      |- answer box (query noun + number, source + date)
                                                                      |- CTA /id-photo/?preset=X --> tool
                                                                      |- body --> /guide/photo-sizes/ hub --> every row guide + tool link
                                                                      |- FAQ (FAQPage JSON-LD, searcher wording)
                                                                      '- 관련 안내 (related)
    /id-photo/ 관련 안내 (TOOL_GUIDE_PINS) --> passport, driver-license, kuksiwon, id-card

## Build Order
1. D6 probes first (they decide the admission title and the optional FAQs). Log each result.
2. Frontmatter edits D2-D5, D7 per page; body sentences D8.
3. TOOL_GUIDE_PINS + its test; related arrays; hub related.
4. D10 regeneration and literal updates; D9 test.
5. Gates (Acceptance).
- Flag: do not touch kuksiwon-photo, og images, Guide/Hub layouts, JSON-LD code, or any threshold.
- Flag: 「규정」 copy states the rules as the official page states them; never paraphrase a rule into a stricter one.
- Flag: plain language; no new jargon (픽셀 is already in use there, keep).

## Failure modes
| Path | Realistic failure | Handling | User sees |
|---|---|---|---|
| New title | over 40 with suffix | zod schema, build fails | n/a (CI) |
| New number in copy | not in any quote | unsourcedFacts, build fails | n/a |
| Probe | 403 / script shell / no text | skip the claim, log verbatim error | nothing invented |
| Retitle | stale generated titles map | visits.test fails | n/a |
| Retitle | e2e / snapshot literal | fails, update literal after diff | n/a |
| Pins swap | /id-photo/ precache bytes | check-dist precache budget 450 KB | n/a |
| Copy | banned word / brand | check-dist COPY rules | n/a |
| SEO | new title loses rank for old wording (운전면허 사진 규격) | old core words kept in every title (D2); measure 28 d | owner GSC check O3 |
No critical gap: the only unmeasured outcome is ranking itself, which only GSC can show (O3).

## Test map
- Title/description/answer/FAQ lengths: [TESTED] schema (build + guides-schema.test).
- Facts in new copy: [TESTED] unsourcedFacts in build.
- Query words in titles, driver FAQ wording, hub links: [GAP] -> D9 new test.
- TOOL_GUIDE_PINS list: [TESTED] exact-list unit test (update).
- Generated titles: [TESTED] visits.test.
- Guide length floor, figures, links: [TESTED] check-dist.
- Regression (affiliate 0 on guides, CSP, no-upload): [TESTED] check-dist + e2e (run them).

## Out of Scope
- kuksiwon-photo, passport-photo (pos 27) and all other guides; new guides; new tool; /en/.
- Layout/template changes (none found holding CTR back). IndexNow/sitemap mechanics.

## Acceptance
- npm run check 0/0; vitest full (only the known char-count timing flake allowed; re-run alone green); check-dist OK on
  default and production-flag builds; precache within 450 KB; no threshold changed; e2e chromium: hubs, site, guides,
  id-photo, affiliate, embed.
- Each D2 title, D3 description, D5 FAQ present in dist HTML (<title>, meta description, H1, FAQPage JSON-LD).
- BUILD-LOG: probe results, final titles, old -> new title table per slug (for the 28-day comparison).

## Owner-only
- O1 After deploy: Search Console URL 검사 -> 색인 생성 요청 for the 9 URLs.
- O2 Search Console Sitemaps: resubmit https://docttak.com/sitemap.xml.
- O3 About 2026-11-27: export the same 28-day page/query report to reports/gsc/ for the before/after comparison.
