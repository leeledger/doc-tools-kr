# Architect Brief — AFF1029 (제휴 링크 자리 넓히기)

## Goal
Seven more result screens (or result variants) carry one disclosed, zero-JS affiliate text-link group using only already-approved links: /id-photo/ exam and job presets, /loan-note/, /power-of-attorney/, /english-name/, /id-copy/, /pdf-edit/; the LP1028 Coupang hidden-wrapper Should Fix is closed.

Owner: 2026-10-29 「다른 수익화를 위한 방법을 최대한 많이 도입해」; 2026-10-28 「최대한 수익에 도움이 되는것은 무조껀 해」, 「광고는 … 어느정도만 맞더라도」. Rules kept from LP1028 (L5-L10, L13-L14): result screen only, hidden in HTML until a result, one visible group per screen, disclosure first, 「광고」 in every name, rel="sponsored noopener", target _blank, data-out, no script/iframe/img, CSP and public/_headers untouched, no guides/content/home/en/embed (AFF_GUIDES=false until the AdSense re-review mid-Nov).

## Decisions (Arch, 2026-10-29)
- A1 /id-photo/ per-preset group (replaces the one-preset rule of LP1028 L1):
  | Preset(s) | Group shown on result | Why |
  |---|---|---|
  | passport_online | LinkPrice eSIM (lp-dosirak, lp-usimsa), unchanged | travel |
  | gosi, qnet, history, korcham, teps, kuksiwon, police, hanja, jlpt | LinkPrice 교보문고 수험서 search for that preset (1 link) | exam-takers buy books next; these photos mostly go with an online 원서, so a photo printer is a rare buy; books at 3.5% beat a printer click that rarely converts |
  | saramin, jobkorea | LinkPrice 숨고 이력서·자소서 (lp-soomgo, existing link) | job seekers |
  | id_card, driver_license, half_card, custom | Coupang printer/paper/backdrop, unchanged | printed photos |
  The non-affiliate 「가까운 사진관 찾기」 link (#idp-print-links, photo-studio) stays for every preset. Coupang #idp-cp is hidden whenever a LinkPrice preset group is visible. LP off (PUBLIC_AFF_LINKPRICE=0): no LinkPrice markup, Coupang for every preset (today's LP-off behavior).
- A2 /loan-note/ → LinkPrice 신용정보 (lp-nice, lp-allcredit). Lead (facts only; both sites show 「내 신용 점수」 to the logged-in person, fetched 2026-10-29): 「돈을 빌리는 쪽이라면 내 신용점수를 미리 확인해 볼 수 있어요.」 It says 「내」 so no lender thinks they can look up the other person. No claim about loans, 연체 or free. LP off → Coupang cp-stamp fallback (TOOL_AFF loan-note) via resultBlock.
- A3 /power-of-attorney/ → Coupang cp-stamp, lead AFF_COPY['stamp-signature'] 「실물 도장이 필요할 때」.
- A4 /english-name/ → LinkPrice travel (lp-agoda, lp-klook), last child of #en-result. Lead: 「항공권·숙소를 예약할 때는 여권과 똑같은 영문 이름을 쓰세요.」 Not eSIM: the passport photo result already has eSIM; agoda/klook diversify and carry larger orders.
- A5 /english-address/ → nothing. Its main use is 해외직구; no approved merchant fits (agoda/klook/eSIM would be a misfit). Known Gap + owner item O4.
- A6 Extra Coupang result screens (approved AFF_LINKS only, lead AFF_COPY.pdf 「종이로 내야 하면」): /id-copy/ (#ic-result) → cp-mfp; /pdf-edit/ (#ed-result) → cp-mfp. Not placed: pdf-compress, pdf-to-jpg, pdf-password, photo-compress, image-to-jpg, qr-code, business-card, id-photo-camera (no honest fit; no invented products).
- A7 Unused approved links: yes24, kbbook 대표, udemy (no screen where they are the honest next step). BUILD-LOG only, not in code.
- A8 Hrefs verbatim from reports/linkprice/사이트 링크 2026-10-29.md (copy-paste, never rebuilt, decoded or re-encoded). New LP_LINKS (dest → label):
  - lp-kb-gosi 「교보문고 검색: 공무원 수험서 (광고, 새 창)」
  - lp-kb-qnet 「교보문고 검색: 기사 자격증 필기 (광고, 새 창)」
  - lp-kb-history 「교보문고 검색: 한국사능력검정시험 (광고, 새 창)」
  - lp-kb-korcham 「교보문고 검색: 컴퓨터활용능력 (광고, 새 창)」
  - lp-kb-teps 「교보문고 검색: TEPS (광고, 새 창)」
  - lp-kb-kuksiwon 「교보문고 검색: 국가고시 문제집 (광고, 새 창)」
  - lp-kb-police 「교보문고 검색: 경찰공무원 (광고, 새 창)」
  - lp-kb-hanja 「교보문고 검색: 한자능력검정시험 (광고, 새 창)」
  - lp-kb-jlpt 「교보문고 검색: JLPT (광고, 새 창)」
  - lp-nice 「NICE지키미 신용정보 조회 (광고, 새 창)」 (mycredit1 대표 링크)
  - lp-allcredit 「올크레딧 신용정보 조회 (광고, 새 창)」 (allcredit 대표 링크)
  - lp-agoda 「아고다 숙소 예약 (광고, 새 창)」
  - lp-klook 「클룩 투어·입장권 (광고, 새 창)」
  Each href is in exactly one LP_LINKS entry (check-dist (g) maps href to dest).
- A9 New LP_COPY leads (one-line literals): exam 「시험을 준비한다면 교보문고에서 수험서를 찾아볼 수 있어요.」; careerIdp 「이력서 사진을 만들었다면 이력서·자소서도 다른 사람에게 봐 달라고 할 수 있어요.」; credit (A2); travel (A4). Disclosure stays LP_COPY.ad.
- A10 Usage: the 13 new dests join OutDest (src/lib/ui/usage.ts), OUT_DESTS, OUT_LABELS (교보문고 수험서(공무원), (기사 필기), (한국사), (컴활), (TEPS), (국가고시), (경찰), (한자), (JLPT); NICE지키미; 올크레딧; 아고다; 클룩). TOOL_OUT: id-photo += the 9 kb dests + lp-soomgo; loan-note [cp-stamp, lp-nice, lp-allcredit]; power-of-attorney [cp-stamp]; english-name [lp-agoda, lp-klook]; id-copy [cp-mfp]; pdf-edit [cp-mfp]. GUIDE_OUT unchanged. trackOut on the loan-note and power-of-attorney FormTool result div (PREFIX-result, as resignation-letter), #en-result, #ic-result, #ed-result (#idp-lp already tracked).
- A11 Privacy: no change. The kinds collected are unchanged (link kind + screen name); 「보내는 것」 already says 「도구 결과 화면의 제휴 링크…」 generically; the PRIVACY_LP history line records the LP1028 change and stays true. Terms unchanged. Bob: confirm by grep that no privacy string lists the screens or link kinds as a closed set for the current state; if one does, escalate, do not edit.
- A12 Fonts/budgets: all new visible text lives in LP_COPY / LP_LINKS / AFF_COPY (stripped, system font). Core/late glyph counts and preload KB unchanged; precache <= 450 KB (report before/after; /id-photo/ grows by about 12 links).
- A13 LP1028 Should Fix folded in: check-dist requires every link.coupang.com anchor to sit inside a div carrying the hidden attribute (hiddenSpans), one pass + one fail fixture.

## Build Order
1. src/data/affiliate.ts
   - LpDest += 13 dests; LP_LINKS += 13 entries (A8, verbatim); LP_COPY += exam, careerIdp, credit, travel.
   - TOOL_LP: remove the id-photo entry (id-photo is per-preset now); add loan-note {credit: lp-nice, lp-allcredit} and english-name {travel: lp-agoda, lp-klook}.
   - New ID_PHOTO_LP: readonly array of { presets, lead, dests } in A1 order (passport_online esim; one entry per exam preset; [saramin, jobkorea] careerIdp). New idPhotoLpBlocks(on, pool = LP_LINKS) returning { presets, block }[] (empty when off; entries without links dropped). Take the preset id type from src/data/preset-ids.ts (do not duplicate the list).
   - TOOL_AFF += loan-note [cp-stamp], power-of-attorney [cp-stamp], id-copy [cp-mfp], pdf-edit [cp-mfp]; TOOL_LEAD += loan-note and power-of-attorney 'stamp-signature', id-copy and pdf-edit 'pdf'. GUIDE_AFF untouched. GUIDE_LEAD spreads TOOL_LEAD: if a unit test compares GUIDE_LEAD keys to GUIDE_AFF keys, build GUIDE_LEAD from the GUIDE_AFF keys instead of adding guide entries (guide output must stay identical; AFF_GUIDES=false nulls it anyway).
   - Header comment: AFF1029.
2. src/components/IdPhotoTool.astro: replace the single lp block with div#idp-lp hidden (rendered only when idPhotoLpBlocks is non-empty, never in embed) holding one div[data-presets="space-separated ids"][hidden] with OutLinks per entry.
3. src/tools/id-photo/controller.ts (~L729): for each [data-presets] child of #idp-lp: hidden = !presets.includes(p.id); #idp-lp hidden = no child visible; cpLinks hidden = #idp-lp exists and is visible. Keep the existing hide-on-leaving-done logic. Nothing else in the controller.
4. Pages: loan-note and power-of-attorney pass aff = resultBlock(tool, PUBLIC_AFF_LINKPRICE, PUBLIC_AFF_COUPANG) to FormTool (as resignation-letter); english-name: OutLinks(resultBlock('english-name', ...)) as the last child of #en-result; id-copy: inside #ic-result after the downloads; pdf-edit: inside #ed-result after the downloads. trackOut in each entry (A10).
5. scripts/lib/usage.mjs + src/lib/ui/usage.ts (A10). tests/unit/affiliate.test.ts: TOOL_OUT == photo-studio + TOOL_AFF + TOOL_LP + ID_PHOTO_LP dests per tool; the 13 new LP_LINKS pinned as literals (byte-exact copies of the report lines); idPhotoLpBlocks per preset (gosi → lp-kb-gosi only, saramin and jobkorea → lp-soomgo, id_card → none, off → []); every ID_PHOTO_LP preset id is in PRESET_IDS and appears once; resultBlock('loan-note') LP on → credit, LP off → cp-stamp; usage validator accepts lp-kb-gosi on id-photo and rejects it on loan-note.
6. scripts/lib/out-links-check.mjs (+ tests/unit/postbuild.test.ts fixtures, one pass + one fail per changed rule):
   - LP_PAGES: /id-photo/ 2 → 12; add /loan-note/ 2, /english-name/ 2.
   - COUPANG_PAGES: add /power-of-attorney/ 1, /id-copy/ 1, /pdf-edit/ 1. COUPANG_LP_OFF_PAGES: add /loan-note/ 1.
   - A13 hidden-wrapper rule for Coupang anchors.
   - (g)(i)(j) unchanged; they cover the new hrefs.
7. e2e (attributes only, never follow links; no-upload fixture stays green): /id-photo/ result with gosi shows only lp-kb-gosi and hides #idp-cp; switch to saramin → soomgo only; id_card → Coupang, #idp-lp hidden; passport_online → eSIM (adapt the existing test); /loan-note/ result shows the credit group, hidden before; /power-of-attorney/, /id-copy/, /pdf-edit/ shown in the result, hidden before; /english-name/ shown after 영문 이름 보기, hidden before. Flag-off CI job (PUBLIC_AFF_LINKPRICE=0): /loan-note/ shows cp-stamp.
8. Docs: docs/COPY.md exception paragraph gets the AFF1029 strings; docs/OPS-RUNBOOK.md §10 자리 표 rows + owner items O2/O4; BUILD-LOG build entry.
- Flag: never pass an LP href through URL, encodeURI or decodeURIComponent; copy the strings from the report file.
- Flag: do not touch AFF_ENABLED, AFF_GUIDES, existing hrefs, GUIDE_AFF/GUIDE_OUT, CSP, public/_headers, src/data/legal.ts, CLAUDE.md.
- Flag: if a result wrapper is not hidden in the HTML (step 4), put the group in its own div hidden, shown with the result; do not change the result's own behavior.

## Flow
~~~
/id-photo/ result(p) -+- p in ID_PHOTO_LP? yes -> #idp-lp shown, only child[data-presets has p] shown, #idp-cp hidden
                      +- no -----------------> #idp-lp hidden, #idp-cp shown (Coupang)      [LP off: no #idp-lp]
other screens: group in HTML inside the hidden result div -> user makes a result -> div unhidden
click a[rel=sponsored] -> (usage on) trackOut beacon {e:out,t,v: dest in TOOL_OUT[t]} -> new tab click.linkprice.com / link.coupang.com
~~~

## Failure modes
| Path | Realistic failure | Handling | User sees |
|---|---|---|---|
| kb deep link mangled (double %25 encoding) | wrong search, no commission | literal unit test vs report; check-dist (g) | nothing; CI red |
| preset switch exam → id_card | 교보 link stays on a 신분증 result | toggle on every render; e2e switch | correct group |
| #idp-lp and #idp-cp both visible | breaks one-group rule | controller rule; e2e asserts cp hidden for exam | blocked |
| new dest missing in TOOL_OUT | beacon rejected, clicks uncounted | equality unit test | nothing; test red |
| credit lead read as checking the borrower | misleading ad | 「내 신용점수」 wording locked (A2) | clear copy |
| Coupang group on an empty screen | ad before use | A13 check-dist rule | blocked |
| result wrapper not hidden in HTML | group before a result | check-dist (h)/A13 fail the build | blocked |
| merchant not approved / program ends | LinkPrice error page in new tab | O2 test click; kill switch | tool tab intact |
| precache > 450 KB | Pages build fails | measured in Acceptance | old deploy stays |

## Test map
- idPhotoLpBlocks per preset / off: [GAP] → unit
- 13 new LP_LINKS literals: [GAP] → unit
- resultBlock loan-note LP on/off: [GAP] → unit
- TOOL_OUT equality incl. ID_PHOTO_LP: [TESTED] (extend)
- usage validator new dests on/off their tool: [GAP] → unit
- check-dist new counts + A13: [GAP] → postbuild fixtures
- LP1028 placements, Coupang rules, passport eSIM: [TESTED] regression
- id-photo preset switching; 5 new screens visible/hidden: [GAP] → e2e
- glyph counts unchanged: [TESTED] build budget
- no new request on load/reveal: [TESTED] no-upload fixture

## Out of Scope
- Guides/content pages, home, /en/, /embed/; english-address; yes24, udemy, kbbook 대표; banners/images; AdSense units; privacy/terms edits; new merchants.

## Acceptance
- npm run check, npm test, npm run check:licenses (root checkout if the junction trips it, as in LP1028) green; production-config build (PUBLIC_SITE_URL=https://docttak.com, usage on, cloud on) check-dist OK with LP on and with PUBLIC_AFF_LINKPRICE=0; glyphs/preload unchanged; precache <= 450 KB with before/after; npx playwright test --project=chromium green.
- dist: LinkPrice on 8 pages (id-photo 12, loan-note 2, english-name 2, the other five LP1028 pages unchanged); Coupang adds power-of-attorney, id-copy, pdf-edit (1 each); every affiliate link inside a hidden div; disclosure first; 0 affiliate links on guides, home, /en/, /embed/, /english-address/.

## Owner-only
- O2 LinkPrice console: confirm kbbook, mycredit1, allcredit, agoda, klook are approved for site A100709304; after deploy one test click each (실시간 리포트).
- O4 Optional: if LinkPrice has a 해외직구/배송대행 merchant, apply for it, for /english-address/.
