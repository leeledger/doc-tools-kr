# Architect Brief — SEO1031 구글 검색 클릭 늘리기 2차 (사진·HWPX·아이폰·누끼 안내)

Owner standing goal #1 traffic, 「오늘 밤새도록 일을 멈추지 말고 진행 시켜」. Same pattern, tests and limits as SEO1030
(handoff/ARCHITECT-BRIEF-SEO1030.md, REVIEW-FEEDBACK-SEO1030.md). Data: reports/gsc/검색어 2026-10-29.md (GSC 2026-09-29~10-27).
Branch seo1031, worktree C:/dev/doc-tools-kr/wt/seo1031 (off main 7c5b6b8).

## Goal
10 guide/hub pages that SEO1030 did not touch carry the words people actually search (국시원 사진 규정, 간호사 국가고시,
대한상공회의소 사진 용량, 컴활 사진 등록, 아이폰 사진 jpg로 저장, 누끼따기, hwpx hwp로 변환, 여권 사진 변경, 여권 영문성명 …)
in title (= H1), description, answer and FAQ, with no new unsourced fact.

## What the code already does (checked, no change)
- Same as SEO1030: H1 = title; HTML title = title plus the 문서딱 suffix, ≤ 40 code points; description 40-80; answer ≤ 120
  ends 다/요; FAQ ≤ 6; unsourcedFacts fails the build on any number not in a quote. JSON-LD Article/FAQPage/Breadcrumb untouched.
- /hwpx-to-hwp/ tool title 「HWPX HWP 변환 — 한글 없이 hwp로 바꾸기, 무료」 already holds the query words and earns 23.8% CTR at 5.7.
- korcham table already states 「파일 용량 | 안내 없음」 (the honest answer to 「대한상공회의소 사진 용량」).
- passport-reissue FAQ already says 여권사진 변경 = 재발급 사유, 방문 신청만 (2 외교부 quotes) — supports 「여권 사진 변경」.
- remove-background body/FAQ already covers 한글·워드·PPT 문서에 넣기 and 서명·도장 -> /stamp-signature/ (body L117, L124, L131).

## Decisions (locked)
- D1 Scope = 10: guides kuksiwon-photo, korcham-photo, heic-to-jpg, remove-background, hwpx-to-hwp, what-is-hwpx,
  gosi-photo, passport-reissue-photo, passport-english-name; hub upload-limits. Dropped: /hwpx-to-hwp/ tool (already fits and
  earns clicks — never retitle a page that earns clicks), passport-photo, /remove-background/ tool, all others.
- D1a kuksiwon-photo (the one page that earns clicks, 20/345): changed now because the owner listed it and 「국시원 사진
  규정」 (14) + 「간호사 국가고시 사진」 (7) show the miss. Risk control: every old title word stays except 「국가시험」, which stays
  in description and answer. Old title logged for one-line rollback; owner compares at O3.
- D2 Titles (= H1). Bob may adjust only to pass the length rule, keeping the starred words. All counted ≤ 40 with suffix.
  | slug | old title | new title |
  |---|---|---|
  | kuksiwon-photo | 국시원 원서 사진 규격 (간호사 등 국가시험) | 국시원 원서 사진 *규정*·규격 (*간호사 국가고시* 등) |
  | korcham-photo | 컴활 원서 사진 규격 (대한상공회의소 자격시험) | 컴활 사진 규격·*용량* (*대한상공회의소* 원서 *사진 등록*) |
  | heic-to-jpg | 아이폰 HEIC 사진 JPG로 바꾸는 법 | *아이폰 사진 JPG로 저장*하는 설정, HEIC 바꾸는 법 |
  | remove-background | 누끼 따기 쉽게 하는 법, 사진 배경 지우기 | *누끼따기* 쉽게 하는 법, 사진 배경 지우기 |
  | hwpx-to-hwp | HWPX 파일 HWP로 바꾸는 법 (한글 없이) | *HWPX HWP로 변환*하는 법 (한글 없이 무료) |
  | what-is-hwpx | HWPX가 뭔가요? 여는 법 | *HWPX 파일*이란? *여는 법*과 뷰어 (한글 없이) |
  | hub upload-limits | 서류 제출 용량 모음, 메일·전자소송·원서 사진 | *첨부파일 용량 제한* 모음 (메일·전자소송·원서 사진) |
  | gosi-photo | 공무원 시험 원서 사진 규격 (국가직) | 공무원 시험 *증명사진* 규격·*크기* (국가직 원서) |
  | passport-reissue-photo | 여권 재발급 사진 규격과 온라인 신청 | 여권 *사진 변경*·재발급 사진 규격 (온라인 신청) |
  | passport-english-name | 여권 영문 이름 정하는 법 | 여권 영문 이름(*영문성명*) 정하는 법과 *변경* |
  No year in any title.
- D3 Descriptions (40-80; Arch drafts counted, Bob re-counts and trims): lead with the answer for the searched words, plain
  language, never lead with no-upload.
  - kuksiwon: 국시원 사진 규정은 6개월 이내 상반신 컬러, 3.5×4.5 cm, 276×354픽셀 이상 JPG·PNG예요. 간호사 등 국가시험 기준이에요.
  - korcham: 컴활 등 대한상공회의소 원서 사진은 JPG·PNG·GIF를 1 대 1.25로 맞추면 400×500픽셀로 바뀌어요. 용량 안내는 따로 없어요.
  - heic: 아이폰 사진을 JPG로 저장하는 카메라 설정(높은 호환성)과 이미 찍은 HEIC 사진을 JPG로 바꾸는 법을 Apple 안내로 정리했어요.
  - remove-bg: 누끼따기를 쉽게 하는 법이에요. 사진 배경을 지워 투명 PNG로 저장하고 한글·워드 문서에 넣는 법, 잘 안 될 때 해결법을 정리했어요.
  - hwpx-to-hwp: HWPX를 HWP로 변환하는 법이에요. 한글 프로그램 없이 바로 바꾸는 법과 한글에서 HWP로 다른 이름으로 저장하는 법을 정리했어요.
  - what-is-hwpx: HWPX 파일은 한글 문서를 XML로 저장하는 개방형 형식이에요. HWP와 다른 점, 한글 없이 HWPX 파일 보기로 여는 법을 정리했어요.
  - upload-limits: 지메일·아웃룩 첨부파일 용량 제한, 전자소송 첨부파일, 원서·이력서 사진 파일 용량을 기관 안내에서 확인한 값만 모았어요.
  - gosi: 공무원 시험 원서 증명사진 규격은 137×177픽셀, JPG·PNG, 350 KB 미만이에요. 인사혁신처 안내로 정리했어요.
  - reissue: 여권 사진만 변경해도 재발급이고 방문 신청만 돼요. 온라인 재발급 사진은 JPG, 500 KB 이하, 413×531픽셀 권장이에요.
  - english-name: 여권 영문 이름(로마자성명)은 한글 이름을 음절마다 로마자로 적어요. 붙임표·빈칸, 성씨 표기, 영문 이름 변경 요건을 정리했어요.
  ogDescription and og images unchanged.
- D4 Answers: edit only where the main query word is missing — kuksiwon (add 「규정」), korcham (add 「용량 안내는 따로 없고」),
  heic (lead with 「아이폰 사진을 JPG로 저장하려면」), passport-reissue (add one clause: 사진만 바꾸는 것도 재발급, 방문 신청).
  Others keep their answer. ≤ 120, ends 다/요.
- D5 FAQ (≤ 6 per page; searcher wording; facts only from existing quotes):
  - kuksiwon: add 「간호사 국가고시 사진 규정은 무엇인가요?」 (same 국시원 rule: 6개월, 상반신 컬러, 3.5×4.5 cm, 276×354 이상, JPG·PNG).
  - korcham: rename 「컴활 사진은 몇 픽셀로 올려야 하나요?」 to 「컴활 사진 등록은 몇 픽셀로 하나요?」; add 「대한상공회의소 사진
    용량은 얼마까지 되나요?」 = 안내에 용량 기준이 따로 없고, 형식·1:1.25 비율만 맞추면 400×500으로 바뀐다 (quote date). Total 6.
  - heic: add 「아이폰 사진을 JPG로 저장하려면 어떻게 설정하나요?」 (Apple quote 설정 > 카메라 > 포맷 > 높은 호환성).
  - remove-bg: rename 「누끼 딴 사진을 문서에 넣으려면요?」 to 「누끼 딴 사진을 한글·워드 문서에 넣으려면요?」 (answer unchanged);
    add 「서명이나 도장도 누끼를 딸 수 있나요?」 -> /stamp-signature/ (body L117/L131 wording). 「한글 누끼」 decision: read as
    the Korean-language search for 누끼따기 and/or putting the cutout into a 한글 document; NEVER claim the 한컴 한글 program has a
    background-removal feature (no source).
  - hwpx-to-hwp: add 「한글 프로그램에서 HWPX를 HWP로 변환하려면요?」 using only the 다른 이름으로 저장 steps already in the body.
  - what-is-hwpx: add 「HWPX 뷰어가 따로 필요한가요?」 = 문서딱 HWP·HWPX 파일 보기로 설치 없이 열어요 (no claim about other vendors). Total 6.
  - gosi: rename 「공무원 시험 원서 사진 크기는 몇 픽셀인가요?」 to 「공무원 시험 증명사진 크기는 몇 픽셀인가요?」.
  - reissue: rename 「사진만 새로 바꾸고 싶은데 온라인으로 되나요?」 to 「여권 사진만 변경하고 싶은데 온라인으로 되나요?」.
  - english-name: rename 「이미 받은 여권의 영문 이름을 바꿀 수 있나요?」 to 「여권 영문이름 변경은 할 수 있나요?」 (answer unchanged).
  - upload-limits hub: no new FAQ unless the number sits in the hub sources; title/description only otherwise.
- D6 Optional probe (skip on failure, log verbatim): license.korcham.net 사진 등록 안내/FAQ for a file-size rule. If a verbatim
  size is found (retrieved 2026-10-30): add source, replace 「안내 없음」 and the D5 FAQ answer with it. If not: keep 「안내 없음」.
  Existing quotes stay byte-exact; bump a retrieved date only if re-read.
- D7 updated = 2026-10-30 on every edited guide/hub.
- D8 No pins/related change (SEO1030 links stand; avoid churn). Respect one-line link-paragraph rules.
- D9 Regression guard: new describe block 「SEO1031 D9」 in tests/unit/guides-schema.test.ts (next to the SEO1030 D9 block, ~L607):
  slug -> required title substrings: kuksiwon [규정, 국가고시, 국시원]; korcham [용량, 대한상공회의소, 컴활]; heic-to-jpg
  [JPG로 저장, HEIC]; remove-background [누끼따기, 배경 지우기]; hwpx-to-hwp [HWP로 변환]; what-is-hwpx [HWPX 파일, 여는 법];
  upload-limits hub [첨부파일 용량]; gosi [증명사진, 공무원]; passport-reissue [사진 변경, 재발급]; passport-english-name
  [영문성명, 영문 이름]. FAQ: kuksiwon a q with 「간호사」; korcham a q with 「용량」; heic a q with 「저장」; remove-background a q
  with 「한글」. Negative: no remove-background frontmatter/body string contains 「한글에서 배경」 or 「한글 프로그램에서 누끼」.
- D10 Run node scripts/gen-guide-titles.mjs. Old literals: src/data/tools.ts:816 link text (여권 영문 이름 정하는 법 -> new
  title), tests/e2e/english-name.spec.ts:248 h1 (and the L246 test name), src/pages/guide/upload-limits/index.astro:2 comment
  (optional). usage.test / admin snapshot only if they fail; diff, never update blindly.

## Flow
    GSC query --> SERP title(=H1) + description --click--> guide
                    |- answer (query noun + number, source + date)
                    |- CTA tool (id-photo preset / image-to-jpg / remove-background / hwpx-to-hwp / hwp-viewer / english-name)
                    +- FAQ (FAQPage JSON-LD, searcher wording) -> related

## Build Order
1. D6 probe; log result. 2. D2-D5, D7 frontmatter per page. 3. D10 regen + literals. 4. D9 test. 5. Gates.
- Flag: no change to /hwpx-to-hwp/ tool, og images, layouts, JSON-LD code, pins or any threshold.
- Flag: 규정 copy states rules exactly as the official quote; never stricter. No 업로드/서버/브라우저/네트워크/EXIF/dpi.
- Flag: brand 문서딱 only. 「뷰어」 is allowed (search word, plain).

## Failure modes
| Path | Realistic failure | Handling | User sees |
|---|---|---|---|
| New title | over 40 with suffix | zod schema, build fails | n/a |
| Description | over 80 after edit | schema fails; Bob trims | n/a |
| New number | not in a quote | unsourcedFacts, build fails | n/a |
| korcham 용량 | probe 403 / script shell | keep 「안내 없음」, log verbatim | honest: no rule stated |
| 한글 누끼 | copy implies 한컴 has bg removal | D9 negative assertion + review | nothing false |
| kuksiwon retitle | loses rank for old words | old words kept (D1a), rollback logged, O3 | owner GSC check |
| Retitle | generated titles / e2e literal | visits.test / english-name e2e fail -> update after diff | n/a |
| FAQ add | over 6 FAQ | schema test fails | n/a |
No critical gap; ranking itself only measurable in GSC (O3).

## Test map
- Lengths / FAQ count: [TESTED] schema + guides-schema.test.
- New facts: [TESTED] unsourcedFacts.
- Query words in titles/FAQ, 한컴 non-claim: [GAP] -> D9.
- Generated titles: [TESTED] visits.test. English-name h1: [TESTED] e2e english-name (update literal).
- Guide length floor, links, copy rules, affiliate 0 on guides, CSP, no-upload: [TESTED] check-dist + e2e (run them).

## Out of Scope
- Tool pages, passport-photo, kuksiwon body rewrite, new guides, /en/, pins/related, layouts. Blog team topics (site pages only).

## Acceptance
- npm run check 0/0; vitest full green (known char-count timing flake only, re-run alone green); check-dist OK on default and
  production-flag builds; precache ≤ 450 KB; no threshold changed; e2e chromium: guides, hubs, site, english-name,
  remove-background, image-to-jpg, hwpx-to-hwp, id-photo, affiliate, embed.
- Each D2 title, D3 description, D5 FAQ present in dist HTML (HTML title, meta description, H1, FAQPage JSON-LD).
- BUILD-LOG: probe result, old -> new title table per slug (for the 28-day comparison).

## Owner-only
- O1 Search Console URL 검사 -> 색인 생성 요청 for the 10 URLs. O2 resubmit sitemap. O3 ~2026-11-27 export 28-day report to reports/gsc/.
