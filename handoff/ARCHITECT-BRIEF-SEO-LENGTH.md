# Architect Brief — SEO-LENGTH (제목 ≤40자, 설명 40–80자, 전 페이지)

Date: 2026-10-08. Owner request: Naver Search Advisor flags home title >40, description >80, og:title >40.
**Start only after TOOLS5 U2 (/pdf-split/) is committed.** Re-measure pdf-split from the committed text; the values below were read from the uncommitted U2 tree.

## Goal
Every built HTML page has a title of at most 40 characters (including " | 문서딱") and a meta description of 40–80 characters, og/twitter consistent, enforced by unit tests on data and by check-dist on built HTML. Plus one admin copy change.

## Locked decisions
- **Counting:** `[...str].length` on the decoded text. Every code point counts once: spaces, "·", "—", "|", "×", digits, Latin. No special cases. HTML is entity-decoded before counting (amp, lt, gt, quot, #39, decimal and hex numeric refs).
- **Title:** at most 40 incl. the suffix " | 문서딱" (6 chars, so the body is at most 34).
- **Description:** 40–80. Lower bound 40: below that the snippet is thin and Google rewrites it; every page meets it without padding.
- **og:title = twitter:title = title** (already true in Base.astro; now asserted). **og:description = twitter:description**, at most 80, no lower bound (og.json share texts stay as they are, all 36–64 today).
- **Change only titles that exceed 40.** Titles already within 40 stay byte-identical (ranking churn). Every changed title keeps the page main keyword phrase verbatim at the front.
- **Descriptions:** start with the page main keyword phrase (as today), then what it does. Shorten only: no new facts, no new numbers, no "files never leave" claims (bgcloud/qualifier tests still apply).
- **Visible H1/lead:** unchanged except guide id-photo-kb (its title is the H1; the change only removes characters, so no new glyphs). Run the UI-font check as usual.

## Flow
```
tools.ts / site.ts / content/*.md / page props
   |  unit: meta-length.test.ts + data tests  -> fail fast in vitest
   v
astro build -> dist/**/*.html
   |  check-dist: every page in pageHtml (incl. noindex 404/offline)
   |    <head> only -> title, meta description, og:*, twitter:* -> decode -> count
   v  any breach -> errors.push("<path>: title 43 > 40: ...") -> build fails
```

## Build Order
1. **Shared rule**: new `scripts/lib/meta-length.mjs` (plain JS, no deps):
   - `export const TITLE_MAX = 40, DESC_MIN = 40, DESC_MAX = 80, OG_DESC_MAX = 80;`
   - `export const metaLen = (s) => [...s].length;`
   - `decodeEntities(s)`; `headMeta(html)` returns { title, description, ogTitle, ogDescription, twTitle, twDescription } parsed **from the head element only** (an inline SVG title in the body must not be picked up); missing gives undefined.
   - `metaProblems(path, html)` returns string[]: missing title/description; title over 40; description under 40 or over 80; og:title differs from title; twitter:title differs from title; og:description differs from twitter:description; og:description over 80. Messages include the count and the text.
2. **check-dist** (`scripts/check-dist.mjs`): loop every page in pageHtml and push metaProblems(p, html) into errors (verification files are already excluded). Print one summary line: longest title and longest description with their pages.
3. **src/data/site.ts**
   - TITLE_SUFFIX becomes " | " + SITE.name, i.e. " | 문서딱" (was the stale "가입 없이 무료로 | 문서딱", which no title uses). Export TITLE_MAX, DESC_MIN, DESC_MAX (same values as meta-length.mjs; a unit test asserts equality; do not import scripts/ from src/).
   - defaultDescription: DESC_MAX 120 to 80. Keep the algorithm (long, short, then ranked by HOME_DESC_ORDER + " 등 N가지 도구. 가입 없이 무료."). Live result today (12 tools): `여권·증명사진 규격 맞추기·PDF 합치기·사진 용량 줄이기·PDF 용량 줄이기·사진 PDF 변환 등 12가지 도구. 가입 없이 무료.` (74). With 배경 지우기 on: same with 13. Live-only property unchanged. Assert 40–80 for real tool sets (synthetic 2-tool fixtures in polish.test may stay short; the function itself is not a page).
4. **Home title**: src/data/tools.ts HOME_TITLE = `PDF 합치기·용량 줄이기, 사진 용량·증명사진 규격 무료 | 문서딱` (38). Drops "한글 PDF 변환"; the HWP pages carry it.
5. **Tool titles/descriptions**: src/data/tools.ts, exactly per the list below. Fix the description doc comment (~line 92) to "40–80 characters".
6. **Guide/hub schema**: src/data/guide-schema.ts (published and draft) and src/data/hub-schema.ts: title + " | 문서딱" at most 40 code points (bare 4–34; message "title with suffix over 40"); description len(40, 80). Leave ogDescription (10–80), og.title, og.line, faq as they are.
7. **Guide content**: shorten every guide/hub description over 80 (today: all published guides except pdf-password, and both hubs). Mechanical rule:
   - keep the opening keyword phrase verbatim (the guide query phrase: "여권사진 규격", "주민등록증 ... 사진 규격", "증명사진 용량", ...);
   - keep numbers only if already in that description; drop trailing sentences first ("파일은 무료로 맞출 수 있어요.", "폰에서도 무료예요."), then the least-searched items of a list;
   - no new facts, numbers or source names;
   - G2 near-duplicate check must still pass (it reads article text, not meta; verify anyway).
   - Title: only id-photo-kb is over (42) and becomes `증명사진 용량 줄이기 (200·350·500KB 맞추기)` (37 with suffix; keeps all three numbers).
   Examples (Bob does the rest the same way):
   - passport-photo (71): `여권사진 규격(3.5×4.5 cm, 온라인 413×531픽셀·500 KB 이하)과 귀·눈썹·옷 기준을 외교부 안내로 정리했어요.`
   - id-card-photo (71): `주민등록증 신규·재발급 사진 규격을 정부24 안내로 정리했어요. 6개월 이내에 찍은 3.5×4.5 cm 상반신 사진 1장이에요.`
   - hwp-to-pdf guide (78): `한글 파일(HWP·HWPX)을 PDF로 바꾸는 법이에요. 한글 프로그램 없이 바꾸는 법과 그림이 엑스박스로 나올 때 고치는 법을 정리했어요.`
   - id-photo-kb (79): `증명사진 용량을 Q-Net 200 KB 이하, 공무원 시험 350 KB 미만, 여권 500 KB 이하처럼 제출처 한도에 맞춰 줄이는 법이에요.`
   - hub photo-sizes (71): `여권·주민등록증·운전면허, 공무원·국시원 원서, 큐넷·한국사 시험, 이력서 사진 규격을 기관 안내에서 확인해 한 표에 모았어요.`
   - hub upload-limits (63): `지메일·아웃룩 첨부 한도, 전자소송 첨부파일, 원서·이력서 사진 파일 용량을 기관 안내에서 확인한 값만 모았어요.`
8. **Other pages** (description props in the .astro files):
   - /guide/ index.astro (57): `여권사진·증명사진 규격, 사진과 PDF 용량 줄이기, 메일 첨부 한도를 기관 안내로 확인해 정리했어요.` (title unchanged; JSON-LD reuses the same constants)
   - /privacy/ (64): `{SITE.name} 개인정보 처리방침입니다. 회원가입이 없고 개인정보를 받지 않아요. 고른 파일을 어떻게 다루는지 알려 드려요.` (meta only; the policy body is not touched)
   - /terms/ (57): `{SITE.name} 이용약관입니다. 서비스 내용, 이용자의 책임, 결과물의 제출처 수용, 책임의 제한을 안내합니다.`
   - /licenses/ (60): `{josa(SITE.name, 이/가)} 내 폰·컴퓨터 안에서 파일을 처리하는 데 쓰는 오픈소스와 글꼴의 목록, 버전, 라이선스 전문입니다.` (keep the existing josa call)
   - 404 and offline already comply (noindex); check-dist covers them; edit only if it fails.
9. **Admin notice**: scripts/lib/admin-view.mjs VISITS_NOTE = exactly
   `방문 수는 2026년 10월 7일부터 집계했어요. 봇은 대부분 빠지지만 같은 사람의 재방문도 각각 세므로, 실제 사람 수보다 조금 많을 수 있어요.`
   tests/unit/visits.test.ts: ~line 404 expects the new sentence; the "no 방문자 / 사람 수" check (~416–417) runs on the HTML **with that exact note removed** (the owner sentence is the one allowed use of "사람 수"); "방문자" stays forbidden everywhere. Update any admin snapshot/e2e holding the old note.
10. **Docs**: docs/COPY.md (~lines 73, 78): replace "설명은 80–120자" and the TITLE_SUFFIX format line with: "제목은 끝의 | 문서딱 포함 40자 이하, 설명은 40–80자(공백·가운뎃점도 한 글자로 셈). 주 검색어를 맨 앞에. 단위 테스트와 check-dist가 확인합니다." Remove "80–120" wherever it appears in docs, code comments and test names.

### Tool list (title: only changed ones are written out; keep = byte-identical)
- home: title `PDF 합치기·용량 줄이기, 사진 용량·증명사진 규격 무료 | 문서딱` (38); description = defaultDescription() (74)
- pdf-merge: title keep (30); desc (68) `PDF 합치기를 폰·컴퓨터에서 바로. 여러 PDF를 원하는 순서로 한 파일로 묶고 책갈피·링크도 그대로. 가입 없이 무료.`
- pdf-compress: title keep (31); desc (70) `PDF 용량 줄이기를 폰·컴퓨터에서 바로. 스캔·사진이 든 PDF를 선명하게 줄이고 글자는 검색되는 그대로. 가입 없이 무료.`
- jpg-to-pdf: title `사진 PDF 변환 — JPG·PNG·아이폰 사진 PDF로 무료 | 문서딱` (40); desc (74) `사진 PDF 변환을 폰·컴퓨터에서 바로. JPG·PNG·아이폰 사진 여러 장을 원하는 순서로 PDF 하나로 묶어요. 가입 없이 무료.`
- pdf-to-jpg: title keep (33); desc (76) `PDF JPG 변환을 폰·컴퓨터에서 바로. PDF의 쪽마다 JPG 사진으로 저장하고, 여러 쪽은 ZIP 하나로 받아요. 가입 없이 무료.`
- pdf-password: title keep (34); desc (72) `PDF 암호 해제와 암호 설정을 무료로. 아는 비밀번호로 PDF 암호를 풀고, 내 PDF에는 비밀번호를 걸어요. 가입 없이 바로.`
- pdf-split: title `PDF 분할·쪽 삭제·회전 — 나누기·순서 바꾸기 무료 | 문서딱` (36); desc (70) `PDF 분할과 쪽 삭제·회전을 무료로. 원하는 쪽으로 나누고, 필요 없는 쪽은 빼고, 순서도 바꿔요. 쪽 그림을 보며 골라요.`
- photo-compress: title keep (39); desc (73) `사진 용량 줄이기를 폰·컴퓨터에서 바로. 100KB·200KB·500KB 등 원하는 용량에 맞추고 촬영 위치 정보는 지워요. 무료.`
- image-to-jpg: title `HEIC·PNG JPG 변환 — 아이폰 사진·WebP도 무료 | 문서딱` (39); desc (79) `HEIC·PNG JPG 변환을 무료로. 아이폰 HEIC 사진·PNG·WebP를 JPG로 바꾸고 여러 장은 ZIP으로 받아요. 가입 없이 바로.`
- id-photo: title keep (29); desc (73) `여권사진 규격(413×531 픽셀, 500KB 이하)과 시험·이력서 증명사진 사이즈에 맞춰 자르고 용량을 맞춰요. 보정 없이 무료.`
- stamp-signature: title keep (36); desc (73) `도장 이미지 만들기와 전자서명 만들기를 무료로. 도장·서명 사진의 배경을 지워 투명한 PNG로 저장해요. 서명은 직접 그려도 돼요.`
- hwp-to-pdf: title keep (34); desc (79) `한글 프로그램 없이 hwp pdf 변환. 한글파일 PDF로 변환해 바로 받고, HWP·HWPX 문서를 열어 볼 수도 있어요. 가입 없이 무료.`
- hwp-viewer: title `HWP 뷰어 — 한글 파일(hwp·hwpx) 설치 없이 열기 | 문서딱` (39); desc (71) `hwp 뷰어를 설치 없이 바로. 한글 파일(HWP·HWPX)을 폰·컴퓨터에서 열어 쪽을 넘겨 보고 글자를 찾아 복사해요. 무료.`
- remove-background: title keep (33); desc (66) `사진 배경 지우기와 누끼 따기를 무료로. 배경을 지워 투명한 PNG나 흰색·파란색 배경으로 저장해요. 가입 없이 바로.`

Flags:
- remove-background: the C2-cloud comment says the description changes with the cloud path on. If a cloud-on variant exists, shorten it by the same rule and keep its owner-approved disclosure wording; if the disclosure cannot fit in 80, **stop and escalate** (never drop it).
- pdf-split: if U2 committed different text, apply the rule to the committed text; keep "PDF 분할" first.
- Every keyword assertion in existing tests must still hold (hwp pdf 변환, 한글파일 PDF로 변환, 배경 지우기, 누끼 따기, PDF 암호 해제, 사진 PDF 변환, PDF JPG 변환, polish.test KEYWORDS regexes). The list satisfies them; if one does not, fix the copy, not the assertion.
- Lengths above were counted with [...s].length; the tests re-count, not the eye.

## Failure modes
- Future copy over the limit (e.g. an 85-char description): unit test on data + check-dist on HTML fail the build; developer sees page, count and text. Not silent.
- Entity encoding inflates counts (&amp;, &#39;): decodeEntities before counting; unit fixture.
- Inline SVG title in the body picked up as the page title: head-only parse; unit fixture with a body SVG title.
- Home with the 배경 지우기 flag on (13 names): ranked truncation keeps 40–80; unit test over both tool sets.
- A page without a description prop: Base falls back to defaultDescription (40–80 by construction); check-dist covers it.
- Ranking shift on the changed titles (home, jpg-to-pdf, pdf-split, image-to-jpg, hwp-viewer, guide id-photo-kb): main keyword kept verbatim at the front; titles already within 40 untouched. Owner accepted.
- Admin negative test on "사람 수" fails on the owner sentence: strip the exact note before the negative check.
No critical gaps (every new path has a test and fails loudly).

## Test map
- [GAP, add] tests/unit/meta-length.test.ts: metaLen counts "·", space, "—", "×" as 1; decodeEntities; headMeta ignores a body SVG title; metaProblems boundaries: title 40 ok / 41 error; description 39 error / 40 ok / 80 ok / 81 error; og:title or twitter:title mismatch error; og/twitter description mismatch error; og:description 81 error; missing description error. site.ts constants equal meta-length.mjs constants.
- [GAP, add] data test: every TOOLS entry and HOME_TITLE title within 40, every TOOLS description 40–80; every published guide and hub (schema parse of src/content) title+suffix within 40 and description 40–80 (guides-schema.test.ts).
- [update] polish.test.ts ~513 (60 to 40; ends with TITLE_SUFFIX " | 문서딱"), ~445–497 (80–120 to 40–80 for real tool sets), bgcloud.test.ts ~435, bgremove.test.ts ~796–808, hwp-tool.test.ts ~202, image-to-jpg.test.ts ~312, jpg-to-pdf.test.ts ~113–120, pdf-password.test.ts ~195, pdf-to-jpg.test.ts ~190–197, pdf-split.test.ts (U2 title/description), hwp-viewer.test.ts ~99. Exact-title assertions take the new strings.
- [update] e2e: site.spec.ts ~86 title regex to a 40 limit; hwp-viewer.spec.ts ~506 new title; growth.spec.ts ~86 (share title, unaffected; verify); id-photo/photo-compress title assertions unchanged.
- [update] visits.test.ts ~404 and ~416–417; admin-view.test.ts if it holds the old note.
- [TESTED by build] npm run build: check-dist with 0 meta errors on every page; postbuild.test.ts gets a fixture case if it exercises check-dist.
- Regression: full npm test, npm run build (check-dist, UI font check), e2e site/growth/hwp-viewer/jpg-to-pdf/pdf-split/image-to-jpg specs.

## Out of Scope
- og.json share texts and og images (already within 80; unchanged).
- New pages, new keywords, H1/lead rewrites, guide body text.
- Naver re-crawl request / IndexNow ping (owner after deploy; runbook covers it).

## Acceptance
- check-dist: 0 meta errors; summary line shows longest title within 40 and longest description within 80.
- dist/index.html: title `PDF 합치기·용량 줄이기, 사진 용량·증명사진 규격 무료 | 문서딱`, description within 80, og:title and twitter:title identical to it.
- All unit + e2e tests pass; grep for "80–120" in src, tests, docs, scripts is empty.
- /admin/ shows the owner exact sentence.
