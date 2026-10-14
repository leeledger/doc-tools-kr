# Architect Brief — REQ1014-C (콘텐츠·딥링크·프리셋·이어서 하기·제휴 위치)

Branch: `req-1014` (base origin/main ee4950c). Parallel briefs: -A (analytics/admin), -B (tool failure UX). This brief does not touch admin code, id-photo controller/model, or OutLinks/affiliate.

## Goal
More search arrivals and more guide→tool deep links: 3 new sourced id-photo presets (경찰·한자·JLPT) wired to their guides, a sourced 카톡 → photo-compress deep link, 2 new passport guides + a stronger passport-photo-error, and the open 10/10 items (5 GSC-unindexed guides + /pdf-compress/ body, RSS noindex, AVIF wording).

## Flow
```
search -> /guide/<slug>/ --CTA / body link--> /<tool>/?preset=... | ?target=...
                |                                   |
                | (same-origin referrer)            +- deeplink.parse() valid  -> option preselected, arrive dl=1
                |                                   +- invalid/unknown param  -> tool defaults, dl=0 (never an error)
                +- tools with no DEEP_PARAM (stamp-signature, hwp-viewer, hwpx-to-hwp, pdf-merge, remove-background)
                   -> plain /<tool>/, dl=0 by design ("해당 없음", see Handoff to A)
id-photo select:  여권·신분증 | 비자(empty) | 시험·원서 [..kuksiwon, police, hanja, jlpt] | 이력서 | 기타
```

## Decisions (numbered, with reasons)

**D1 — Zero-deep-link guides.** Only 카톡 사진 용량 can carry a param. The other seven point at tools with no deep-link param. `DEEP_PARAM` in src/lib/ui/deeplink.ts covers only id-photo, photo-compress and pdf-compress, so dl=0 is correct and expected for them.

| Guide (slug) | CTA tool | Deep-linkable? | Action |
|---|---|---|---|
| stamp-image (도장·서명 이미지 만들기) | stamp-signature | no param | none; dl=0 expected |
| open-hwp-without-hangul | hwp-viewer | no param | none |
| remove-background (누끼 따기) | remove-background | no param | none |
| hwpx-to-hwp | hwpx-to-hwp | no param | none |
| hwp-on-phone | hwp-viewer | no param | none (gets the D9 body work) |
| pdf-merge (아이폰·갤럭시·PC) | pdf-merge | no param | none (D9 body work). The guide has no sourced MB target, so no `/pdf-compress/?target=` link |
| what-is-hwpx | hwp-viewer | no param | none |
| kakao-photo (카톡 사진 용량) | photo-compress | YES (?target=) | CTA + body link (line ~96) -> `/photo-compress/?target=2500` |

Why 2500 KB:
- The guide's own sourced facts are 「사진 1회 전송 시: 최대 전송량 300MB」 and 「최대 120개의 사진 및 동영상을 한 번에 묶어 보낼 수 있으며」.
- 300 MB / 120 = 2.5 MB per photo, so a full 120-photo bundle fits in one send.
- 2,500 KB x 1,000 B = 2,500,000 B. That is under 300 MB/120 whether MB means 10^6 or 2^20.
- It is also far under the 20 MB 「파일 말풍선」 line, so every photo stays in the bundle.
- It is in range (RANGES.targetKb 10-20,000) and is not the 500 default, so `serialize` keeps it.

Rules for the guide:
- The guide calls 2,500 KB a 계산값 and shows the sum (300 MB / 120장).
- CTA label: 「사진 한 장 2,500 KB(2.5 MB) 이하로 줄이기」.
- `updated` becomes 2026-10-14.

**D2 — New presets: police, hanja, jlpt.**
- All three sources were re-fetched today.
- The guides' quotes for them already pass check:quotes.
- Append them after `kuksiwon` in PRESETS (group 시험·원서), in the order `police`, `hanja`, `jlpt`.
- Use the same order in src/data/preset-ids.ts PRESET_IDS and in scripts/lib/usage.mjs PRESETS (before `custom`).

| id | label | outW x outH | mm | limit | dpi | status | fileTag | quote (verbatim; already in the guide) | note |
|---|---|---|---|---|---|---|---|---|---|
| police | 경찰공무원 채용 원서 | 354x472 (`printPx(30)` x `printPx(40)`) | 30x40 | none (limitRule null) | 300 | official | police | 최근 1년 이내에 촬영한 상반신 컬러사진(3cm X 4cm)을 업로드 해주세요. | 「사진등록안내는 3×4 cm만 정합니다. 픽셀 크기는 해상도 300으로 계산한 값입니다.」 |
| hanja | 한자능력검정시험 원서 (한국어문회) | 230x310 | 30x40 | limitBytes(100,'le') | dpiFor(230,30) | official | hanja | the full hanja.re.kr quote of hanja-exam-photo.md source 1 | none |
| jlpt | JLPT 원서 (온라인 접수) | 413x531 | 35x45 | limitBytes(1000,'le') | 300 | official | jlpt | the jlpt-photo.md source 1 quote (온라인접수 사진파일 등록 - 파일 형식: JPG 형식만 가능 여권사진규격(3.5 x 4.5cm) 비율 파일 용량: 1MB이하) | 「JLPT는 비율만 정하고 픽셀 크기는 정하지 않아 여권 온라인 규격(413×531)으로 맞춥니다.」 |

Preset rules:
- headBand is `reference` for all three. No source states a head rule.
- Add the constant `R1014_RETRIEVED = '2026-10-14'`.
- 1 MB becomes 1,000 KB x 1,000 B. That is under the limit whether MB is 10^6 or 2^20 (the Step 3 rule).
- police and hanja are 3:4. Add both to `REFERENCE_ASPECT_EXEMPT` and extend its comment.
  - Reason: TOOLS4 D6 stops a passport band on non-portrait shapes (square visa photos).
  - A 3:4 portrait from an official cm size is the same family as history, teps and half_card, which are already exempt.
  - hanja: 230/310 vs 30/40 differs by 1.1 %, inside the 1.5 % mm check.
  - jlpt is 35:45 and needs no exemption.
- Is police "official" when its pixels are computed? Yes.
  - Precedent: qnet is `official` with no source pixels, and its note explains.
  - The cm size is official, so the label has no 「계산값」.
  - The note says the pixels are computed.

Guides switch to the new deep links. Set `updated` to 2026-10-14 and rewrite any text that names the old preset:
- police-exam-photo:
  - CTA `/id-photo/?preset=police`.
  - Rewrite the section 「반명함판 크기로 맞추는 법」 and FAQ 4 (both name 반명함판/half_card).
  - In sources, replace `- preset: half_card` with `- preset: police`.
- hanja-exam-photo:
  - CTA `/id-photo/?preset=hanja`. Today it is 직접 입력, so dl=0.
  - Rewrite any 직접 입력 how-to text.
  - Add `- preset: hanja`.
- jlpt-photo:
  - CTA `/id-photo/?preset=jlpt`.
  - In sources, replace `- preset: passport_online` with `- preset: jlpt`.

**D3 — Presets skipped.**
- 청소년증: same output as `id_card`. mogef says 「사진 (3.5cm X 4.5cm) 1매」, a print size. youth-card-photo already deep-links `?preset=id_card`.
- 국제운전면허증: same output as `passport_online`/`driver_license`. safedriving says 「여권용 사진 1매(3.5*4.5cm, …)」. The guide already deep-links `?preset=passport_online`.
- A label-only twin would add a select row and split the usage counts with no new output.
- 미국 비자:
  - travel.state.gov returned HTTP 403 (5,804 B Cloudflare page, desktop Chrome UA, curl 2026-10-14), the same as the TOOLS4 table. check:quotes cannot verify it.
  - The owner also declined visa presets (TOOLS4 T1-b, 2026-10-06).

**D4 — Passport guides (2 new, 1 strengthened).** Sources: passport.go.kr menuPos 4, 7, 10, 12 and 32, fetched 2026-10-14 (table below).

New guide `baby-passport-photo`:
- Front matter:
  - title 「아기 여권사진 규격, 신생아·유아 찍는 법」 (≤ 40 characters with the suffix)
  - query 「아기 여권사진」
  - category 사진, topic 여권·신분증, tools [id-photo]
  - CTA `/id-photo/?preset=passport_online` 「여권사진 규격 맞추기」
- Body:
  - Same rules as adults.
  - No toys or guardian in the frame.
  - Under 36 months, a slightly open mouth is fine.
  - Eyes open, looking straight ahead.
  - White background. A background removed with editing software is refused (menuPos=12 quote).
  - Size and head length.
  - Under 18 needs the consent of the 법정대리인.
  - A first passport cannot be applied for online (생애 최초 전자여권 신청자 = 신청 불가), so it means a visit.
  - Reissue for a minor can be done online on 정부24, with the 법정대리인 verifying identity.
  - Honest limits: 문서딱 does not remove a parent hand or change the background.
- FAQ 5. related [passport-photo, passport-photo-error, id-photo-size].

New guide `passport-reissue-photo`:
- Front matter:
  - title 「여권 재발급 사진 규격과 온라인 신청」
  - query 「여권 재발급 사진」
  - CTA `/id-photo/?preset=passport_online`
- Body:
  - What 재발급 means.
  - A photo change (여권사진 변경) is a 재발급 reason, and 정정·변경 reissues are in person only.
  - Online file spec: 500 KB, JPG, 413×531, accepted 395-431 × 507-550, taken within 6 months.
  - A file that does not match the spec can stop or reject the application.
  - The new passport is picked up in person.
  - Who cannot apply online.
- FAQ 5. related [passport-photo-error, passport-photo, id-photo-kb].

Strengthen `passport-photo-error` (`updated` 2026-10-14):
- Add a section 「정부24에 올릴 수 있는 사진 파일」 from menuPos=12 (500 KB, JPG, 413×531, accepted 395-431 × 507-550, 6개월), tied to error 707.
- Add a 제출 불가 line on backgrounds removed with editing software (menuPos=12).
- Add the menuPos=10 line 「여권용 사진 파일 규격에 맞지 않는 경우 신청이 진행되지 않거나 반려될 수 있음」.
- Add 1 FAQ: 「707인데 크기를 어떻게 맞추나요?」, answered with the pixel range.
- Set `related` to [passport-photo, passport-reissue-photo, id-photo-kb]. This drops intl-driving-license, which keeps its required inbound link from driver-license.

Inbound links:
- passport-photo `related` gains baby-passport-photo. If the schema caps related at 4, replace gosi-photo.
- passport-photo-error links to passport-reissue-photo (above).
- Do not change `updated` when only `related` changes (runbook rule).

DUP gate (check-dist):
- Both new guides must pass it with the gate unchanged.
- If one fails, fold that guide's unique facts into passport-photo-error or passport-photo instead, and report it.

**D5 — Chain id-photo → photo-compress: not built (pushback).**
- The id-photo encoder already guarantees the preset's KB limit, or refuses with `unreachable` (controller.ts:604). So `/photo-compress/?target=<same limit>` always ends in 「이미 충분히 작아서 그대로 두었어요」 (photo-compress/headline.ts:43). The button would be a dead click.
- Presets with no limit produce JPGs of at most 413×531. These are far under the 500 KB default, so the button would be a dead click there too.
- sendTo() opens only the bare tool path with no query (handoff.ts:227). A preselected target would need a handoff API change for zero user gain.
- FLOW['id-photo'] stays ['jpg-to-pdf'].
- Logged as a Known Gap with a trigger: revisit if the admin from -A shows id-photo → photo-compress sessions that skip the chain.

**D6 — Id-photo print/사진관 link: no move.**
- The block is already in the place asked for: right after the result, with the 「인화가 필요하면」 line.
  - #idp-print-links has the lead 「종이 사진이 필요하면 사진관에서 뽑을 수 있습니다.」.
  - It sits right after 내려받기, 이어서 하기, the file name and the #idp-print notice (IdPhotoTool.astro:161-180).
- The 0 clicks in 7 days fit the preset mix.
  - 74 % of uses are passport_online: a file uploaded to 정부24, so no print is needed.
  - The sample is about 100 completions.
- rev6-cards (C:/dev/doc-tools/rev6, uncommitted) rewrites:
  - affiliate.ts
  - OutLinks.astro (guide cards; tool variant output unchanged)
  - out-links-check.mjs
  - usage.mjs
- Moving the block now would collide with rev6, and there is no evidence it would gain clicks.
- Re-decide after rev6 ships, with 28 days of data. -A should show out-link clicks per id-photo result screen (Handoff to A).

**D7 — RSS noindex.** public/_headers gets this block:
    /guide/rss.xml
      X-Robots-Tag: noindex
- noindex does not stop Naver or Google from fetching the feed.
- The block has no CSP and no detach, so embed-check must still pass.

**D8 — AVIF wording (/image-to-jpg/).**
- The tool accepts AVIF (convert.ts ACCEPTED_FORMATS), but no visible Korean text says so (live page checked 2026-10-14).
- Add AVIF to the Korean `summary` of image-to-jpg in src/data/tools.ts, e.g. 「아이폰 사진(HEIC)·PNG·WebP·AVIF를 JPG로 바꿉니다. …」.
- Add one FAQ: 「AVIF 사진도 JPG로 바꿀 수 있나요?」.
  - The answer must state the real failure path. Bob reads how an AVIF that cannot be decoded is reported (controller/convert) and words the answer to match.
- Title and description stay unchanged (meta-length rules, stable search snippets).
- English pages are out of scope.

**D9 — GSC 미색인 strengthening (10/10).**

For hwp-to-pdf, yearend-tax-pdf, ecfs-pdf-limit, pdf-merge and hwp-on-phone:
- Body ≥ 1,800 characters (today 1,142-1,682).
- At least 4 internal links in the body, to sibling guides and tools (today 2).
- At least 1 new verbatim official quote each: a new `sources` entry, retrieved 2026-10-14, checked by check:quotes. Bob fetches it, starting from the sources the guide already cites.
- Content unique to the query: device steps, error cases, a 「이럴 때는」 section. No padding and no copied paragraphs (DUP gate).
- `updated` set to 2026-10-14.

For /pdf-compress/ (src/data/tools.ts pdf-compress):
- Add 2 FAQ entries that link the sourced limit guides (ecfs-pdf-limit, gov24-upload-limit, hometax-upload-limit).
- Use their `/pdf-compress/?target=` deep links where the guide already has a sourced MB.
- No institution numbers on the tool page itself; they stay on the sourced guides.

Footer blog link: already done (FOOTER-BLOGS 2026-10-10, Base.astro `.foot-blog`). No work.

## Sources (fetched 2026-10-14)
| Use | URL | Quote (verbatim) | Retrieved |
|---|---|---|---|
| police preset | https://public.jinhakapply.com/PoliceV2/useinfo/useinfo02_2.aspx (EUC-KR) | 최근 1년 이내에 촬영한 상반신 컬러사진(3cm X 4cm)을 업로드 해주세요. | 2026-10-14 (curl + iconv) |
| hanja preset | https://www.hanja.re.kr/kccpt/guide/faq.do?id=91 | 원본 : 6개월 이내 촬영한 반명함판(3㎝x4㎝, 본인, 탈모, 무배경) - 픽셀 : 가로 230픽셀 x 세로 310픽셀 - 용량 : 100KB 이하 - 파일 : .JPG 또는 .PNG 확장자인 파일만 가능 | 2026-10-14 |
| jlpt preset | https://www.jlpt.or.kr/html/information_01.html | 사진파일 등록 - 파일 형식: JPG 형식만 가능 여권사진규격(3.5 x 4.5cm) 비율 파일 용량: 1MB이하 | 2026-10-14 |
| baby | https://www.passport.go.kr/home/kor/contents.do?menuPos=32 | 모든 기준은 성인과 동일함 | 2026-10-14 |
| baby | same | 장난감 등 사물이나 보호자가 노출되지 않아야 함 | 2026-10-14 |
| baby | same | 입을 다물고 촬영하기 어려운 신생아 및 유아(36개월 이하)의 경우, 입을 조금 벌리는 것은 가능함 | 2026-10-14 |
| baby | same | 눈은 자연스럽게 떠야 하며, 시선은 정면을 향해야 함 | 2026-10-14 |
| baby, reissue | same | 여권사진의 크기는 가로 3.5cm X 세로 4.5cm, 머리 길이는 정수리(머리카락을 제외한 머리 최상부)부터 턱까지 3.2~3.6cm 사이인 사진을 제출해야 함 | 2026-10-14 |
| baby, reissue | same | 배경은 균일하고 잉크 자국이 없는 흰색이며, 테두리가 없어야 함 | 2026-10-14 |
| baby (non-size fact) | https://www.passport.go.kr/home/kor/contents.do?menuPos=4 | 18세 미만인 사람의 여권 신청은 법정대리인의 동의가 필요합니다. (여권법 제9조 제4항) | 2026-10-14 |
| baby, reissue | same (also menuPos=7) | 여권용 사진 1매 (6개월 이내에 촬영한 사진) | 2026-10-14 |
| baby, reissue | https://www.passport.go.kr/home/kor/contents.do?menuPos=10 | 18세 미만 미성년자를 위한 온라인 신청 시에는 법정대리인이 본인 인증 후 대리 신청 필요 | 2026-10-14 |
| baby, reissue | same | 생애 최초 전자여권 신청자 (listed under 「신청 불가 대상」). This page has commented-out HTML blocks: quote visible text only. | 2026-10-14 |
| reissue, error | same | 여권용 사진 파일 규격에 맞지 않는 경우 신청이 진행되지 않거나 반려될 수 있음 | 2026-10-14 |
| reissue | same | 여권 수령시 본인이 직접 방문 필요 | 2026-10-14 |
| reissue | https://www.passport.go.kr/home/kor/contents.do?menuPos=7 | 재발급은 기존에 한번이라도 여권을 발급받은 적이 있는 사람이 새로운 여권을 발급받는 경우를 의미합니다. | 2026-10-14 |
| reissue | same | 여권 수록정보의 정정, 변경 (한글성명 변경, 주민등록번호 변경, 로마자성명 변경, 여권사진 변경) | 2026-10-14 |
| reissue | same | 여권 수록정보의 정정 및 변경, 여권 분실 및 훼손, 행정기관 착오에 의한 재발급은 방문 신청만 가능합니다. (온라인 신청 불가) | 2026-10-14 |
| reissue, error | https://www.passport.go.kr/home/kor/contents.do?menuPos=12 | 파일 크기 500KB 이하, 파일 형식 JPG/JPEG | 2026-10-14 |
| reissue, error | same | 가로 413 픽셀(pixel), 세로 531 픽셀 사이즈 권장(가로 395~431 픽셀, 세로 507~550 픽셀 이내만 업로드 가능) | 2026-10-14 |
| all 3 passport pages | same | 배경이 흰색이 아니거나, 배경색을 사진 편집 프로그램으로 제거하여 사진이 변형된 경우 (already verified in remove-background.md, retrieved 2026-10-10) | 2026-10-14 |
| kakao target | existing kakao-photo.md sources (300MB per send, 120 per bundle) | unchanged; 2,500 KB is a 계산값 | link only |
| skip: 미국 비자 | https://travel.state.gov/content/travel/en/us-visas/visa-information-resources/photos.html | HTTP 403, 5,804 B | 2026-10-14 |
| skip: 청소년증, 국제면허 | mogef sp_yth_f005.do (200), safedriving selectDiGuide10.do (200) | same spec as id_card / passport_online | 2026-10-14 |

Rules for quotes:
- Quotes are as the page reads, with whitespace runs folded to one space.
- Bob copies each one from the live page, and check:quotes decides.
- A failing quote is fixed to the page text, never dropped silently.
- If a sentence cannot be verified (script-rendered, or inside a comment), drop it from the guide too. No unsourced number.

## Exact file list
- src/data/id-photo-presets.ts: 3 presets, R1014_RETRIEVED, exempt list + comment, header comment line.
- src/data/preset-ids.ts: PRESET_IDS.
- scripts/lib/usage.mjs: the PRESETS line only. Also any preset label map, if one exists: grep `half_card` in scripts/ and functions/.
- src/content/guides/:
  - police-exam-photo.md, hanja-exam-photo.md, jlpt-photo.md, kakao-photo.md
  - passport-photo-error.md, passport-photo.md (related only)
  - baby-passport-photo.md (new), passport-reissue-photo.md (new)
  - hwp-to-pdf.md, yearend-tax-pdf.md, ecfs-pdf-limit.md, pdf-merge.md, hwp-on-phone.md
- src/data/tools.ts: image-to-jpg summary + 1 FAQ; pdf-compress + 2 FAQ.
- public/_headers: the RSS block.
- Generated files (guide-titles, og, sitemap, llms.txt, indexnow): regenerate through the build or its scripts, never by hand.
- Tests:
  - tests/unit/idphoto-core.test.ts, deeplink.test.ts, usage.test.ts, guides-schema.test.ts
  - postbuild.test.ts (headers assertion)
  - tests/e2e/growth.spec.ts (deep-link cases)
- handoff/BUILD-LOG.md: log D1-D9 and the Known Gaps (D5 trigger, D6 re-decide).
- Do NOT touch:
  - src/tools/** and src/components/IdPhotoTool.astro
  - OutLinks.astro, affiliate.ts, print-links.ts
  - src/lib/ui/next-steps.ts and handoff.ts
  - admin/functions code (-A), tool failure UX (-B)

## Build order
1. C1 presets (id-photo-presets, preset-ids, usage PRESETS, unit tests).
2. C2 guide deep links (police, hanja, jlpt, kakao).
3. C3 passport (baby, reissue, error strengthening, passport-photo related).
4. C4 10/10 (_headers, tools.ts AVIF + pdf-compress FAQ, the 5 guides).
5. Build, then every gate below.

## Failure modes
| Path | Realistic failure | Handling | User sees |
|---|---|---|---|
| ?preset=police/hanja/jlpt | PRESET_IDS / PRESETS / usage PRESETS drift | equality unit tests (deeplink.test:54, usage.test) | build red, never ships |
| usage event with a new preset | /api/usage validates against the old list and drops the event | usage.mjs PRESETS in the same commit; usage.test accepts the new ids (T3) | silent data loss if missed, so the test is required |
| ?target=2500 | out of range or equal to default, so the param is dropped | guide-schema parseHref rejects an invalid CTA at build | build red |
| new or changed quotes | page text changed, quote mismatch | check:quotes exit 1 | gate red |
| new guides vs DUP gate | too close to passport-photo(-error) | check-dist DUP fails | fold into the existing guide (D4) |
| rev6 merge | affiliate.test needs every guide slug in GUIDE_GROUP_OF | whoever merges second adds baby-passport-photo and passport-reissue-photo as 'passport' | CI red until mapped, never silent |
| RSS header | block not applied by Cloudflare | live `curl -I` in smoke | nothing visible |
| police / hanja reference band | passport proportions on a 3:4 photo | same as history/teps today; reference band is a guide line, not a rule | guide line only |

## Test map
- [GAP, add] idphoto-core:
  - validatePreset returns [] for police, hanja and jlpt.
  - police is 354×472 with mm 30×40.
  - hanja limitBytes is 100,000.
  - jlpt limitBytes is 1,000,000.
- [TESTED] PRESET_IDS equals the PRESETS ids (deeplink.test:54). Update the id list in idphoto-core.test:77.
- [GAP, add] usage.test: a `preset` setting with police, hanja or jlpt validates; an unknown id does not.
- [GAP, add] deeplink.test:
  - parse('id-photo', '?preset=hanja') gives { preset: 'hanja' }.
  - serialize('photo-compress', { target: 2500 }) gives '?target=2500'.
- [GAP, add] guides-schema:
  - kakao-photo CTA is `/photo-compress/?target=2500`.
  - police, hanja and jlpt guides use their own preset.
- [GAP, add] guides-schema / postbuild:
  - baby-passport-photo and passport-reissue-photo are published.
  - Each has ≥ 3 quotes including a non-size fact, FAQ 5, related 3.
  - Inbound links exist: passport-photo to baby, passport-photo-error to reissue.
- [GAP, add] postbuild: dist/_headers has `/guide/rss.xml` with `X-Robots-Tag: noindex`, and the RSS still parses.
- [GAP, add] e2e growth.spec:
  - `/id-photo/?preset=police` and `?preset=hanja` open with that option selected.
  - `/photo-compress/?target=2500` shows 2,500 KB chosen.
- [TESTED] quicklinks test (≤ 8 links, PRESETS order): re-run; expect no change.
- [GAP, add] unit: image-to-jpg summary contains AVIF, and the plain-language test still passes.
- Regression:
  - id-photo e2e: select groups render; 시험·원서 gains 3 options.
  - growth, site and polish e2e on chromium + mobile-chrome.
  - check-dist on default, cloud flag-on and autoframe.

## Gates (CLAUDE.md, CLOUD-HANDOFF section 3)
- Build: `PUBLIC_SITE_URL=https://docttak.com npm run build`.
- `npm run check`: 0 errors.
- `npm test`.
- check-dist OK on default, cloud flag-on and autoframe. Precache ≤ 450 KB; report the delta.
- `npm run check:licenses`.
- `npm run check:quotes`: exit 0. Report the count; it was 214 before.
- e2e with the no-upload fixture, axe included: id-photo, photo-compress, growth, site and polish on 5 projects.
- Lighthouse, median of 5 runs, thresholds unchanged: /id-photo/, /photo-compress/, /image-to-jpg/, /pdf-compress/ and 2 changed guides.
- qa:visual on the 2 new guides.
- `npm run regress:idphoto -- --fixtures-only`.
- Richard writes "clear", then deploy.
- Live smoke:
  - `curl -I https://docttak.com/guide/rss.xml` shows X-Robots-Tag.
  - The 3 preset deep links and ?target=2500 open at a phone viewport.
- PC session after deploy (chrome-cdp, full URL typed): Naver crawl request and GSC 색인 생성 요청 for the 2 new guides and the 5 strengthened ones.

## Out of scope
- id-photo → photo-compress chain (D5).
- Moving the print/affiliate block (D6).
- Visa presets.
- 청소년증 / 국제면허 alias presets.
- EN pages.
- Admin 「해당 없음」 rendering (A).
- The stamp-signature → pdf-sign 0 in admin (A).
- Tool-page titles and descriptions.
- Any edit under src/tools/, IdPhotoTool.astro, OutLinks.astro or affiliate.ts.

## Handoff to A (analytics/admin)
1. Guide→tool arrivals table: when the tool has no deep-link param, show 「해당 없음」 instead of 「0%」 in the deep-link column.
   - Today every tool except id-photo, photo-compress and pdf-compress has no param.
   - For those tools, 0 % does not mean a missing link; there is nothing to pass.
   - Take the list from DEEP_PARAM / isDeepSlug in src/lib/ui/deeplink.ts, or keep a copy in scripts/lib with a unit test that holds them equal. Do not hand-write the list.
2. New preset ids police, hanja and jlpt arrive in `preset` settings after C1. If the admin has a preset label map, add 경찰 채용 원서 / 한자능력검정 / JLPT.
3. For D6: show out-link clicks per id-photo result screen ("done" count), split by preset (print kind vs online). The print-block position is re-decided from this after rev6 ships.
4. For the D5 trigger: if you can count sessions that finish id-photo and then start photo-compress without a `next` event, report the number. Only that would justify the chain.

## Merge notes
- rev6-cards (uncommitted, C:/dev/doc-tools/rev6) also edits other hunks of scripts/lib/usage.mjs.
- rev6 requires every guide slug in GUIDE_GROUP_OF (affiliate.test).
- This brief adds 2 guide slugs and changes one PRESETS line. Whoever lands second maps both new slugs to 'passport' and rebases the one-line PRESETS hunk.
