# Architect Brief — DRAFT1031 초안 안내 공개 (공식 출처 찾기)

Owner goal #1 traffic, 「오늘 밤새도록 일을 멈추지 말고 진행 시켜」 / 「계속해」. Branch draft1031, worktree
C:/dev/doc-tools-kr/wt/photo1031 (off origin/seo1031 = PR #41, not merged; merge main later). Same page rules, tests
and limits as SEO1030/SEO1031 and the published photo guides police-exam-photo / jlpt-photo.
GSC (reports/gsc/검색어 2026-10-29.md): niche exam photo-spec pages earn the impressions -> photo drafts first.

## Goal
6 of the 15 drafts become published, fully sourced guides (4 exam-photo, 2 file-size), and the 9 that stay drafts
record what Arch tried on 2026-10-30.

## Sourcing spike (Arch, 2026-10-30) — results
Method: real Chrome (raw CDP, own tabs only, public pages, no login/forms/captcha; the stock cdp.cjs Playwright attach
timed out, so Arch used a raw-CDP script:
C:/Users/force/AppData/Local/Temp/claude/C--dev-doc-tools-kr/9d6bbb7a-d5e8-43a5-a67d-a6f70a5f50a0/scratchpad/cdp/rt.cjs
usage: node rt.cjs URL WAIT_MS [--links] [--max N] [--eval JS] [--then JS]), Google only to find official URLs (never
cited), official 공고 PDFs via curl + pdftotext (layout checked visually where the text order broke). Page/PDF text is
saved in handoff/sources/draft1031/ (one file per page, named SLUG-*.txt). Every quote below is verbatim from those files.

### PUBLISH (every number has an exact official quote)

**A. fire-exam-photo — 소방공무원 원서 사진** (via: pdf)
- URL https://www.gnfire.go.kr/common/nttFileDownload.do?fileKey=7382a8de34cc516f5f73657529246996
  title 「소방청 공고 제2026-1호 2026년 소방공무원 채용시험 시행계획 공고 (PDF)」. Hosted by 경상남도 소방본부 (official);
  소방청장 공고 dated 2026-01-05; PDF sha256 e5bb435364d27c11078588b9d689ffc5211f96625b6d7ba0a46312b1f0206dfb;
  text sources/draft1031/fire-exam-photo-1.txt. Downloads without a referrer.
- Quotes (keep ㎝, * and 前 exactly as in the PDF):
  1. 사진기준: 3.5㎝×4.5㎝(137*177 pixel), 사진 파일(JPG)
  2. 배경이 있는 사진, 스냅사진, 상반신 전체가 나온 사진, 얼굴이 잘려 나온 사진, 동물·식물 사진, 모자나 선글라스 등을 착용한 사진 등은 사용할 수 없음
     (two PDF lines joined by one space)
  3. 면접은 블라인드 시험으로 前 직장 등 신분을 특정할 수 있는 사진등록 시 불이익 발생할 수 있음
  4. 채용시험 단계마다 같은 사진을 사용하므로 원서접수 기간 종료 후 사진 교체 불가
  5. 원서접수 시 등록한 사진은 면접시험까지 사용함
  6. 원서접수는 인터넷 접수만 가능(우편, 팩스, 전자우편은 불가능)
  7. 접수기간 내에는 응시 내용 변경 가능, 최종제출 완료하거나 접수기간 종료 후에는 수정 불가
  8. (optional) 반명함판(3cm×4cm) 컬러사진 1~2매(병원마다 다름)  [신체검사 준비물]
  Fees sit in a broken table; do not quote them.
- CTA /id-photo/?preset=gosi (exact same spec: gosi preset = 3.5×4.5 cm, 137×177; 소방 원서 uses the same
  국가공무원 채용시스템 gongmuwon.gosi.kr). Body says the tool's 제출처 reads 「국가공무원 시험 (공무원 채용시스템)」 for
  that reason. Never state the gosi 350 KB limit as a 소방 rule (the 소방 공고 states no KB). sources add `- preset: gosi`.
  spec row: label 소방공무원 원서 사진, kind photo, px 137×177, mm 35×45, format JPG, source 1.

**B. military-civilian-photo — 군무원 원서 사진** (via: pdf)
- URL https://recruit.mnd.go.kr:470/noticeBoardList.do?nm=1 — the PDF itself returns HTML without the site referrer,
  so cite the 공지사항 list where the 공고 is pinned. title 「국방부 군무원 채용 공지 — 2026년도 국방부 주관 일반군무원
  채용시험 시행계획 공고 (첨부 PDF)」. 국방부공고 제2026-142호; PDF sha256
  ddcd4e662a84f5f7061567fdd5da1656d7f1c26d6bd1f1acd49f2ff0d82ee508; text sources/draft1031/military-civilian-photo-1.txt
  (pdftotext scrambles line 1 below; Arch checked the rendered page 11 image).
- Quotes:
  1. ※ 응시원서 접수 시 사진등록용 사진파일(JPG, PNG, GIF / 500kb 이하) 필요
  2. 응시원서 작성 → 응시수수료 결제 → 응시표 및 응시원서 출력
  3. 단, 모바일 환경 원서접수(결제)는 불가
  4. 응시수수료(5급 10,000원 / 6～7급 7,000원 / 8～9급 5,000원) — verify every character (～ may be U+FF5E or U+301C)
     with PyMuPDF text of page 11 (python -I; fitz is installed); drop it if not exact.
  5. 군무원채용관리 로그인은「I-PIN」인증 … — check spacing against PyMuPDF; quote the shortest clean fragment or drop.
- Size: the 공고 states NO cm/pixel size. Page says so plainly (table row 「크기 | 공고에 없음」). No preset.
  CTA /photo-compress/?target=500 label 「군무원 원서 사진 500KB 이하로 줄이기」; tools [photo-compress, id-photo].
  Scope every sentence to 「2026년도 국방부 주관」; one line: 육군·해군·공군 주관 시험은 각 군 공고를 확인.
  spec row: label 군무원 원서 사진 (국방부 주관), kind photo, kb 500, format JPG·PNG·GIF, source 1.

**C. kacta-exam-photo — 전산회계·전산세무 사진** (server-rendered EUC-KR; check:quotes can read it; no via)
- https://license.kacta.or.kr/web/notice/FAQ.aspx?dsp_mode=Show&sNo=60 「사진등록시 부적격 사진은?」 (title
  「한국세무사회 국가공인자격시험 — 자주하는 질문」):
  `* 반드시 본인의 [반명함판 증명사진]만 사용하시기 바랍니다.`; list items, one quote each:
  `- 6개월 이상 지난 현재 얼굴과 다른 사진`, `- 배경이 있는 일반 사진`, `- 화상캠으로 찍은 사진`, `- 스티커 사진`,
  `- 전신사진`, `- 얼굴만 나온 사진`, `- 전(前)면이 아닌 측면사진`, `- 신분증을 스캔한 신분증 사진`.
- sNo=18: `사진 등 개인정보 변경은 로그인 하신 후, 우측 상단에 있는 [나의수험정보] - [회원정보관리]으로 들어가 수정하시면 됩니다.`
  and `단, 사진변경은 개인회원으로 로그인 하신 경우에만 수정 가능합니다.`
- sNo=41: `또한 자격증은 등록 된 사진으로 제작이 되오니 반드시 신청 전에 사진을 변경 하여 사진 확인 후 신청하시기 바랍니다.`
- sNo=57 (원서접수 방법), sNo=55 (시험당일 준비물), sNo=43 (예전 사진이 보일 때) — optional supporting quotes; files saved.
- No cm/pixel/KB anywhere public -> page says 「크기·용량 안내 없음, 반명함판 증명사진」. CTA /id-photo/?preset=half_card
  label 「반명함판 사진 크기로 맞추기」 + `- preset: half_card` source (same pattern as admission-photo); body: 3×4 cm is
  문서딱의 일반 반명함판 크기, 한국세무사회가 정한 크기가 아님. spec row: label 전산세무회계 시험 사진 (반명함판), kind photo,
  no numbers. Title holds 전산회계 and 전산세무 (query 「전산회계 사진 규격」).

**D. local-gosi-photo — 지방직 공무원 원서 사진** (server-rendered; no via)
- https://local.gosi.go.kr/klid/regs/photoExample.do 「지방자치단체 인터넷원서접수센터 — 사진등록예시」:
  `원서작성 시 사진의 규격은 해상도100DPI 이상의 3.5cm x 4.5cm 사진입니다.`;
  `원서접수 기간이 마감되면 사진 및 접수정보의 수정이 불가능하오니, 사진등록 후 [마이페이지]에서 사진이 정상적으로 등록되어 있는지 확인하시기 바랍니다.`;
  `사진의 경우에는 규격보다 작은 사이즈의 사진이거나 DPI가 100DPI 미만인 사진을 등록한 경우로서 이때는 규격에 맞는 사진을 등록해 주시기 바랍니다.`;
  `사진의 경우 사진을 등록하실 때 [자동크기] 버튼을 이용해서 공백을 제외한 사진 부분만 나올 수 있도록 조정해서 등록해 주시기 바랍니다.`
- https://local.gosi.go.kr/klid/info/infomethod.do?gubun=4 (사진 업로드 순서): `[ - ] 축소, [ + ] 확대, [자동크기] 버튼을 활용하여 사진 크기를 조절합니다.`,
  `사진이 안보일 경우 [사진 새로고침] 버튼을 클릭합니다.`
- Page copy never prints DPI/dpi (plain-words rule): say 「해상도 100 이상」. Quotes keep DPI (quotes are never rendered).
- CTA /id-photo/?preset=id_card label 「3.5×4.5 cm 원서 사진 맞추기」 (id_card = 3.5×4.5 cm at 해상도 300, ≥ 100) with
  `- preset: id_card`; body explains the tool lists it as 「주민등록증 (인화용 3.5×4.5 cm)」 because the size is the same.
  Never preset=gosi here (137 px over 3.5 cm is ~99, under 100). No KB/pixel claim of the center's own.
  Scope: 지방자치단체 인터넷원서접수센터; one line: 시도 공고가 따로 정하면 공고를 따름.
  spec row: label 지방직 공무원 원서 사진, kind photo, mm 35×45, source 1.

**E. kakao-file-limit — 카톡 파일(PDF·문서) 보내기 용량** (server-rendered; no via)
- https://cs.kakao.com/helps_html/1073209424 (kakao-photo cites it too): `• 파일 1회 전송 시: 최대 전송량 300MB`,
  `※ 26.7.0 이상 버전에서 톡클라우드 구독 시 최대 1GB까지 멀티미디어 파일을 전송할 수 있습니다.`,
  `• 용량을 초과할 경우 전송에 제한이 있으므로 전송할 파일의 용량을 확인 후 이용해 주시기 바랍니다.`
- https://cs.kakao.com/helps_html/1073209399 (PC): `개당 최대 300MB의 이미지/ 동영상/ 음성/ 압축 파일 등을 아래의 방법으로 전송할 수 있습니다.`,
  `■ 문서 • doc, docx, hwp, txt, rtf, xml, pdf, wks, wps, xps, md, odf, odt, ods, odp, csv, tsv, xls, xlsx, ppt, pptx, pages, key, numbers, show, ce`
- https://cs.kakao.com/helps_html/1073209427: `임시 저장 기간은 시스템의 부하와 성능을 고려하여 수시로 변경되기 때문에 정확한 안내가 어렵습니다.`
  and `보관이 필요한 멀티미디어(사진/ 동영상/ 파일 등)는 메시지 수신 시 가급적 바로 저장하여 안전하게 보관해 주세요.`
- CTA /pdf-compress/ (a target only if the label number is quoted; plain 「PDF 용량 줄이기」 is fine); tools
  [pdf-compress, photo-compress]; related include kakao-photo. spec row: label 카카오톡 파일 보내기, kind upload, mb 300, source 1.

**F. naver-daum-mail-limit — 네이버·다음 메일 첨부 용량** (server-rendered per curl; Naver falls back to via: browser
only if check:quotes cannot find a quote)
- Naver 메일 고객센터 https://help.naver.com/service/30029/contents/21295 「첨부 가능한 파일 용량 안내」:
  `1개에 10MB가 넘지 않는 파일을 일반 파일로 분류하며, 다운로드 기간이나 횟수에 제한이 없습니다.`,
  `- 하나의 파일당 최대 2GB까지 첨부 가능`, `- 메일 한 통 당 총 10개의 대용량 파일 첨부 가능`,
  `- 대용량 파일을 첨부한 메일은 1일 10회 발송 가능`, `- 파일을 첨부한 시점을 기준으로 30일간, 100회 다운로드 가능`;
  .../21233: `네이버 메일의 경우 그 크기의 한계가 메일 한 개당 40MB입니다.`;
  .../21294: `파일 첨부는 1회 최대 10MB까지 갯수 제한 없이 첨부할 수 있습니다.`
- Daum 메일 고객센터 https://cs.daum.net/faq/service/43/category/4592/detail/35985 (메일보내기):
  `메일 사이즈는 첨부파일을 포함하여 30MB까지 허용되며, 그 이상을 초과하면 정상적으로 발송되지 않을 수 있습니다.`,
  `파일 첨부는 최대 25MB까지 일반 첨부가 가능합니다. (25MB 넘으면 자동으로 대용량 첨부로 전환됩니다.)`;
  .../category/15550/detail/38504: `대용량 첨부는 한 파일당 4GB의 용량제한이 있으나 첨수 개수에는 제한이 없습니다.` (sic);
  .../category/18758/detail/35912: `대용량 첨부 파일은 30일 동안 보관되고 100회까지 다운로드하실 수 있습니다.`
- Never use Naver 21233 「테스트한 바로는 대략 30MB」 (a test, not a rule). CTA /pdf-compress/?target=10 (10 MB is quoted:
  Naver 일반 첨부); tools [pdf-compress, photo-compress]; related include email-attachment-limit.
  spec rows (upload): 네이버 메일 일반 첨부 mb 10 (source = 21295 quote); 다음 메일 일반 첨부 mb 25.

### STAY DRAFT (append to tried[], date '2026-10-30'; text below is the `result`)
- toeic-photo — url https://m.toeic.co.kr/customer/csFaq.php : 「Chrome, FAQ 사진 items: the size rule (3X4 cm, jpg 6MB 이하,
  머리 3.2~3.6cm) is stated only under [TOEIC SW] (Speaking·Writing); no [TOEIC] item states a size or KB. The YBM photo
  uploader (session-encrypted URL) was not opened.」 Known Gap: candidate guide 「토익스피킹 사진 규격」 from the [TOEIC SW] FAQ.
- hsk-photo — url https://www.hsk.or.kr/?c1=400&c2=003 : 「Chrome: FAQ, 인터넷접수 (c1=100&c2=002&c3=002&c4=001) and
  응시자 가이드 (c1=100&c2=002&c3=003&c4=001) contain no 사진 text.」
- mma-photo — url https://www.mma.go.kr/board/boardView.do?gesipan_id=284&gsgeul_no=1497726&mc=mma0001958 : 「사이버홍보관
  통합지원서 작성하기: the official 16-step walkthrough has no photo step.」 blockedBy -> the premise (a photo upload) is
  not shown by any official page.
- teacher-exam-photo — url https://www.edurecruit.go.kr/ : 「Chrome: redirects to /nxui/index.html, a Nexacro app with no
  readable text; the photo rule stays in each 시도교육청 공고.」
- gov24-upload-limit — url https://www.gov.kr/ : 「Web search (discovery only): no official page states a size; only
  third-party claims (지식iN, news, AI summary).」
- epeople-upload-limit — url https://www.epeople.go.kr/ : same wording; note 110.go.kr 제도개선 사례 mentions 50MB as a
  past improvement, not a current rule — not used.
- hometax-upload-limit — url https://www.hometax.go.kr/ : 「Web search: only third-party claims (삼쩜삼 5MB, 비즈넵 50MB);
  no 국세청 page.」
- work24-resume-upload — url https://www.work24.go.kr/ : 「Web search: the only official 5MB is the 1:1 문의 form, not the
  resume attachment.」
- hometax-pdf-password: unchanged (pin-rule block, not a source block) -> Known Gap.

## Build Order
1. Refactor step (own commit): urlSource `via: z.enum(['browser', 'pdf']).optional()` in src/data/guide-schema.ts and the
   GuideSource type in src/data/guide-facts.ts; scripts/ops/source-watch.mjs: any `via` -> manual (not only 'browser'),
   manual table title 「수동 확인 (브라우저·PDF 출처)」 and the row shows ` (PDF)` after the URL for via pdf. Unit test: a 'pdf'
   entry goes to manual, is never fetched, never counted changed/unreachable; the 'browser' path unchanged.
2. Per guide A–F (behaviour commit): replace the draft frontmatter with published frontmatter (published and updated
   '2026-10-30'; category 사진 for A–D, the same category kakao-photo/email-attachment-limit use for E–F; topic as the
   nearest published guide), body ≥ 2,500 counted chars (GUIDE_MIN_CHARS), ≥ 2 own SVG figures under
   public/img/guide/SLUG/ (N-name.svg, ≤ 30 KB, role="img" + title, alt ≥ 10, unique hash), 3–6 FAQ, og {title ≤ 14,
   line ≤ 34}, answer ≤ 120 ending 요/다, description 40–80, title (= H1) ≤ 40 with the suffix, holding the query words.
   Suggested titles (trim to fit; keep the words marked *):
   A 「*소방공무원 *원서 *사진 규격, 137×177 JPG」  B 「*군무원 *원서 *사진 규격, 500KB 이하」
   C 「*전산회계·*전산세무 *사진 규격, 반명함판」  D 「*지방직 공무원 *원서 *사진 규격, 3.5×4.5 cm」
   E 「*카톡 *파일 *용량, PDF·한글 문서 보내기」  F 「*네이버·다음 *메일 *첨부 *용량」. No year in titles; 「2026년 공고
   기준」 in A/B body and answer.
3. Every number in title/description/answer/FAQ/body/spec must sit in a quote (unsourcedFacts gate). Quotes ≤ 300 chars,
   verbatim. PDF ones `via: pdf`.
4. related (2–4 published): A gosi-photo, police-exam-photo, photo-kb; B gosi-photo, photo-kb, police-exam-photo;
   C korcham-photo or history-exam-photo, admission-photo, photo-kb (use real slugs); D gosi-photo, police-exam-photo,
   id-card-photo; E kakao-photo, email-attachment-limit, pdf-compress; F email-attachment-limit, kakao-file-limit,
   pdf-compress. One inbound body link to each new guide from one related published guide where it reads naturally
   (bump that guide's `updated`). TOOL_GUIDE_PINS unchanged; no tool page edits.
5. node scripts/gen-guide-titles.mjs; lists that skip drafts (NEXT_GUIDES, chain lists) pick them up — diff, never
   blindly update snapshots.
6. Stay-drafts: append the tried rows above; change blockedBy only for mma-photo.
7. Tests: tests/unit/guides-schema.test.ts describe 「DRAFT1031」: the 6 slugs are published; title words (A 소방공무원 원서
   사진; B 군무원 사진; C 전산회계 전산세무 사진; D 지방직 사진; E 카톡 파일 용량; F 네이버 메일 첨부 용량); CTA hrefs as
   above; D renders no 「dpi」 (plain words already); A never states 350 (no 350 KB claim); C body/answer hold no cm/px
   number outside the half_card explanation. source-watch test for via 'pdf'.
- Flag: a quote that check:quotes (fetchable) or the saved txt / PyMuPDF text (PDF) cannot match exactly is dropped with
  its sentence; if the core number goes, the guide stays a draft — log it, never paraphrase into a quote.
- Flag: 소방 page writes 「137×177픽셀」; the fact check reads the numbers from 「137*177 pixel」.
- Flag: plain words on Korean pages — no 업로드/서버/브라우저/네트워크/EXIF/dpi/px (「픽셀(px)」 once max); brand 문서딱;
  no 「files never leave」 lead.
- Flag: precache ≤ 450 KB, never raised; guide HTML ≤ 30 KB gzip; no threshold lowered.

## Flow
    GSC query -> Google SERP (title = H1, description) -> /guide/SLUG/ (answer + source date)
      -> CTA -> /id-photo/?preset=gosi|half_card|id_card , /photo-compress/?target=500 , /pdf-compress/?target=10
    hubs: spec rows -> /guide/photo-sizes/ (A B C D), /guide/upload-limits/ (E F)
    source-watch weekly: fetchable quote -> exact check ; via browser|pdf -> 수동 확인 table

## Failure modes
| Path | Realistic failure | Handling | User sees |
|---|---|---|---|
| PDF quote (A, B) | the 2027 공고 changes the spec | via pdf -> weekly 수동 확인 row; season refresh (A 2027-01, B 2027-04) | 「2026년 공고 기준」 on the page, so not silent |
| gnfire fileKey | link dies | manual row shows the URL; re-point to the new 공고 | a dead source link only |
| mnd list | 공고 unpinned | manual row | list page without the 공고 |
| kacta sNo | FAQ renumbered | check:quotes exact fails the gate / weekly issue | none until fixed |
| Naver help | text not in fetched HTML | via browser -> manual row | none |
| preset label | user expects 소방/지방직 in the tool list | body explains why gosi / id_card is the same size | clear |
| tool pages | a new guide changes a precached tool page | pins frozen at 4 + exact-list unit test | none |

## Test map
- via 'pdf' schema + watch manual path: [GAP] -> step 1 unit tests.
- 6 pages: length, figures, dup blocks, plain words, affiliate 0, CSP, unsourcedFacts: [TESTED] check-dist + schema.
- Title words / CTAs / no-350 / no-dpi per slug: [GAP] -> DRAFT1031 describe block.
- Stay-drafts not rendered or linked: [TESTED] isVisibleGuide + check-dist expected guides.
- Hub rows: [TESTED] hubs fact check (throws on an unsourced value).
- Tool pages unchanged: [TESTED] tool-guide-order exact lists + precache check.

## Out of Scope (-> BUILD-LOG Known Gaps)
- New id-photo presets (A reuses gosi; B/C/D have no exact pixel spec). Tool page edits.
- 「토익스피킹 사진 규격」 guide; hometax-pdf-password pin rule; gov24/epeople/hometax/work24 limits (no official source).

## Acceptance
- npm run check 0/0; vitest full green; npm run check:quotes exact OK (PDF/browser rows listed as manual); default and
  production-flag builds check-dist OK; precache ≤ 450 KB; e2e chromium guides, hubs, site green; no threshold lowered.
- dist: 6 new /guide/SLUG/ pages (H1 = title, FAQPage JSON-LD, sitemap, RSS, llms.txt), hub rows on photo-sizes (A–D)
  and upload-limits (E, F); 9 drafts still absent.
- BUILD-LOG DRAFT1031 (build) entry: per guide published + title, stay-draft reasons, any dropped quote.
