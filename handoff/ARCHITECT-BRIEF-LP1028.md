# Architect Brief — LP1028 (링크프라이스 제휴 글자 링크, 결과 화면)

## Goal
With LinkPrice on (default; kill switch `PUBLIC_AFF_LINKPRICE=0`), six result screens show one small, disclosed, zero-JS LinkPrice text-link group that matches the next step of the user; every press is counted; Coupang stays off.

## Decisions (Arch, 2026-10-28; owner rule: revenue first, never at the cost of usability/traffic)
- L1 Placement (one group per result screen, below the result and downloads, hidden until a result exists, never on the empty tool screen):
  | Tool | When shown | Lead | Links (dest) |
  |---|---|---|---|
  | /pdf-sign/ | result (existing OutLinks slot in #sg-result) | signgate | lp-signgate |
  | /stamp-signature/ | result (existing slot in #ss-work) | signgate | lp-signgate |
  | /stamp-maker/ | after a style is picked (existing #sm-aff) | signgate | lp-signgate |
  | /id-photo/ | result AND preset `passport_online` only (new #idp-lp, toggled beside englishNote, controller ~L717) | esim | lp-dosirak, lp-usimsa |
  | /char-count/ | textarea non-empty (new #cc-lp after #cc-note, before #cc-chain) | careerCc | lp-soomgo |
  | /resignation-letter/ | result (FormTool `aff` prop, last child of #rs-result, after the preview) | careerRs | lp-soomgo |
- L2 Not placed: /id-photo-camera/ (no result screen; /id-photo/ crops and saves), /embed/*, /en/*, home, hubs, guides, 404, legal pages, loan-note, power-of-attorney, business-card, qr-code, all other tools.
- L3 Guides: no LinkPrice on /guide/* this sprint. The AdSense re-review (mid-Nov) is the bigger revenue line; guides carry the AdSense tag and were judged low-value; affiliate links there are a known negative signal. Revisit after the AdSense decision (Known Gap).
- L4 Unused: 바로빌 (no tool where 세금계산서/사업자 work is the next step; PC-only commission) and the 도시락eSIM Japan deep link (a passport photo does not imply Japan). BUILD-LOG only, not in code.
- L5 Hrefs verbatim, never altered, no params (LinkPrice forbids 링크 임의 가공): LP_LINKS holds the exact strings at the bottom; a unit test pins them as literals; check-dist compares the entity-decoded href byte-for-byte.
- L6 Disclosure LP_COPY.ad (first line of every group, before the links; the LinkPrice sentence adapted for a web page, 해요체 per the COPY.md REV2 exception):
  「광고: 아래 링크는 제휴마케팅 광고예요. 이 링크로 가입하거나 사면 문서딱이 수수료를 받아요.」
  It must not contain any Coupang needle of check-dist rule (f).
- L7 Copy (facts only, no prices, no 「공식」 or superlatives; merchant pages fetched 2026-10-28):
  - signgate: 「서명·도장 그림은 인증서가 아니에요. 인증서로 서명하라는 곳에는 공동인증서가 필요해요.」
  - esim: 「해외에 나간다면 휴대폰 데이터도 미리 준비하세요. eSIM은 지원하는 휴대폰에서만 쓸 수 있으니 사기 전에 확인하세요.」 (도시락 page: 구매 전 반드시 지원 단말기 여부를 확인)
  - careerCc: 「자소서를 다른 사람에게 봐 달라고 하고 싶다면」
  - careerRs: 「다음 직장을 준비한다면 이력서·자소서도 함께 봐 달라고 할 수 있어요.」
  - labels: 「한국정보인증 공동인증서 (광고, 새 창)」, 「도시락eSIM (광고, 새 창)」, 「유심사 eSIM (광고, 새 창)」, 「숨고 이력서·자소서 컨설팅 (광고, 새 창)」
- L8 Link attrs: rel="sponsored noopener" (no noreferrer: LinkPrice checks the registered site; our Referrer-Policy strict-origin-when-cross-origin sends the origin only), target="_blank", data-out = dest. No image, script, iframe, pixel, prefetch.
- L9 Flag: `export const LP_ENABLED = true;` (like AFF_ENABLED) plus env kill switch PUBLIC_AFF_LINKPRICE: off only for "0" after trim; anything else, unset included, = on. Launch needs no owner action. Coupang: AFF_ENABLED = false unchanged.
- L10 One group per screen: resultBlock(tool, env) = the LinkPrice block if any, else the Coupang block (null today). Unit-tested.
- L11 Counting: dests lp-signgate, lp-dosirak, lp-usimsa, lp-soomgo join OutDest (src/lib/ui/usage.ts), TOOL_OUT, OUT_DESTS, OUT_LABELS (「공동인증서(한국정보인증)」, 「도시락eSIM」, 「유심사」, 「숨고 이력서 컨설팅」) in scripts/lib/usage.mjs. trackOut on #idp-lp, #cc-lp, #rs-result (pdf-sign/stamp roots already cover their slot). GUIDE_OUT unchanged.
- L12 Privacy (usage builds only; the links themselves send nothing): new PRIVACY_LP = 「2026년 10월 28일」 (re-confirm at deploy gate); PRIVACY_REVISED and PRIVACY_TERMS_UPDATED (2026-10-28) put it first when __USAGE_STATS__ and LinkPrice is on. 「보내는 것」 with LP on: 「도구 결과 화면의 제휴 링크와 증명사진 결과 화면의 사진관 찾기 링크를 눌렀는지(링크 종류와 화면 이름만)」 (AFF_ENABLED wording kept for Coupang-on). History line: 「(PRIVACY_LP): 도구 결과 화면에 제휴 링크(공동인증서, eSIM, 이력서 컨설팅)를 더하고 익명 사용 통계에 그 링크 누름을 더함」. The PRIVACY_AFF_OFF line stays (history). Terms: no change (Coupang had none; plain navigation).
- L13 Fonts: copy renders in the system font (.out-links). Extend stripComments (scripts/lib/ui-font-chars.mjs) to drop `LP_COPY = {...}` and `LP_LINKS ... = [...]`. No new glyph in core/late UI font.
- L14 Budgets unchanged: precache <= 450 KB (only /id-photo/ is precached of the six; measure before/after in cloud+usage config, report headroom); initial JS budgets and Lighthouse thresholds unchanged. Groups reveal only after user input: no load CLS, no LCP change.

## Build Order
1. src/data/affiliate.ts: LinkPrice section: LP_ENABLED, lpOn(v), LP_COPY (one-line literals: ad, signgate, esim, careerCc, careerRs), LpDest, LP_LINKS (exact hrefs), TOOL_LP (L1 map), lpBlock(tool, on), resultBlock(tool, env). Extend AffBlock with `ad: string`; affBlock sets ad = AFF_DISCLOSURE. Update header comment.
2. src/components/OutLinks.astro: render block.ad instead of the constant. Nothing else.
3. Pages: pdf-sign, stamp-signature, stamp-maker use resultBlock. IdPhotoTool: new wrapper div#idp-lp (hidden) holding OutLinks after #idp-print-links, never in embed; controller sets hidden = (p.id !== passport_online) on every render and hides on 다시/새 사진; trackOut(#idp-lp). char-count: div#cc-lp (hidden) after #cc-note; controller toggles on text.value.trim().length > 0 (input, 지우기, 되돌리기); trackOut. FormTool: optional prop aff (AffBlock or null) rendered last inside the result div; resignation-letter passes resultBlock for resignation-letter; its entry adds trackOut(#rs-result). loan-note / power-of-attorney pass nothing.
4. Usage: OutDest + TOOL_OUT/OUT_DESTS/OUT_LABELS (L11). tests/unit/affiliate.test.ts: TOOL_OUT == photo-studio + TOOL_AFF + TOOL_LP per tool.
5. Privacy (L12): src/data/legal.ts, src/pages/privacy/index.astro.
6. Fonts (L13).
7. check-dist (scripts/lib/out-links-check.mjs pure functions + scripts/check-dist.mjs wiring; fixtures in tests/unit/postbuild.test.ts, one pass + one fail per rule):
   - (b2) a sponsored link is preceded inside its .out-links by the disclosure of its network: click.linkprice.com -> LP_COPY.ad; link.coupang.com -> AFF_COPY.ad + COUPANG_DISCLOSURE; any other sponsored host fails.
   - (e2) the rule "a sponsored link while PUBLIC_AFF_COUPANG is off" now means a non-LinkPrice sponsored link.
   - (g) every click.linkprice.com href (entity-decoded) is exactly one LP_LINKS href; rel sponsored, label has 광고, target _blank, data-out = the dest of that href.
   - (h) LP on: each L1 page has exactly its expected LP links (pdf-sign, stamp-signature, stamp-maker: 1; id-photo: 2; char-count: 1; resignation-letter: 1); no other page (incl. en/, embed/, guide/, home) has any; every LP link sits inside a div ancestor carrying the hidden attribute in the HTML.
   - (i) LP off (PUBLIC_AFF_LINKPRICE=0): no dist text file (AFF_TEXT_RE) contains click.linkprice.com or LP_COPY.ad. LP on: no .js/.json/.xml/.txt file contains click.linkprice.com (HTML only).
   - (j) never a linkprice script/iframe/img/link/source/object/embed.
   - (f) Coupang-off rule unchanged (0 Coupang links, 0 Coupang disclosure lines): regression must stay green with LP on.
8. e2e: /id-photo/ passport_online result shows #idp-lp with 2 links, switching to id_card hides it, empty screen hidden; /char-count/ hidden until typing, shown after, hidden after 지우기; /resignation-letter/ shown in result; /stamp-maker/ after a style pick; /pdf-sign/ in result. Assert attributes only, never follow links. No-upload fixture stays green (no new request on load or reveal).
9. Docs: docs/COPY.md exception paragraph gains the LP1028 strings; docs/OPS-RUNBOOK.md section 10 gains a 링크프라이스 subsection (자리 표, 끄기 = PUBLIC_AFF_LINKPRICE=0 + 재배포, 링크 바꾸기 = LP_LINKS 한 줄, owner items); BUILD-LOG entry.
- Flag: do not touch AFF_ENABLED, Coupang hrefs, GUIDE_AFF/GUIDE_OUT, CSP, public/_headers.
- Flag: never round-trip LP hrefs through URL/encodeURI or reformat them.

## Flow
```
page load -> group in HTML, wrapper hidden (no request; stays hidden without JS)
   | user makes a result (sign / save / pick style / passport result / types / builds 사직서)
   v
controller unhides wrapper -> user clicks a[rel=sponsored][target=_blank]
   |- usage on: trackOut -> sendBeacon /api/usage {e:out,t,o:out,v:dest} (validated vs TOOL_OUT)
   +- browser GET click.linkprice.com/click.php?... (new tab, origin referrer) -> merchant
```

## Failure modes
| Path | Realistic failure | Handling | User sees |
|---|---|---|---|
| href edited/normalized | commission lost silently | literal unit test; check-dist (g) | nothing; CI red |
| group visible on empty screen | ad before use | wrapper hidden in HTML; check-dist (h); e2e | blocked |
| id-photo preset switch after passport | eSIM lingers on 이력서 result | toggle on every render; e2e switch | correct block |
| out dest not in TOOL_OUT | beacon rejected, clicks uncounted | equality unit test; validator test with lp dests | nothing; test red |
| disclosure missing/after links | 공정위/LinkPrice violation | OutLinks order; check-dist (b2) | blocked |
| merchant program ends / link dead | lands on LinkPrice error page | runbook monthly check; kill switch | LP page in new tab, tool tab intact |
| precache > 450 KB | Pages build fails | measured in Acceptance | old deploy stays |
| glyphs leak into UI font | font budget fails | stripComments extension | blocked |
| 실명인증 not done | no payout | owner-only O1 | nothing |

## Test map
- lpBlock per tool / off / unknown tool; resultBlock precedence: [GAP] -> unit affiliate.test.ts
- LP_LINKS exact literals: [GAP] -> unit
- TOOL_OUT equality incl. lp: [TESTED] (extend)
- usage validator accepts lp dest on mapped tool, rejects elsewhere: [GAP] -> unit
- check-dist (b2)(e2)(g)(h)(i)(j): [GAP] -> postbuild fixtures
- Coupang-off rule (f): [TESTED] regression
- Visibility on 6 screens + empty + preset switch + clear: [GAP] -> e2e
- Privacy line variants (usage on/off x LP on/off): [GAP] -> unit/dist check
- Font strip of LP_COPY/LP_LINKS: [GAP] -> unit
- No new request on load/reveal: [TESTED] no-upload fixture (regression)

## Out of Scope
- Guides, home, /en/, embed; 바로빌; 도시락 Japan link; Coupang re-enable; banners/images; AdSense units.

## Acceptance
- npm run check, npm test, npm run check:licenses green; production-config build (PUBLIC_SITE_URL=https://docttak.com, usage on, cloud on) check-dist OK with LP on and with PUBLIC_AFF_LINKPRICE=0; precache <= 450 KB with before/after numbers; npx playwright test --project=chromium green.
- dist: exactly 6 pages carry LP links (counts per L1), all inside hidden wrappers, disclosure first; 0 Coupang links/disclosures; 0 linkprice strings outside HTML.

## LP_LINKS (verbatim)
- lp-signgate: https://click.linkprice.com/click.php?m=signgate&a=A100709304&l=0000
- lp-dosirak: https://click.linkprice.com/click.php?m=dosirak1&a=A100709304&l=0000
- lp-usimsa: https://click.linkprice.com/click.php?m=usimsa&a=A100709304&l=0000
- lp-soomgo: https://click.linkprice.com/click.php?m=soomgo&a=A100709304&l=9999&l_cd1=3&l_cd2=0&tu=https%3A%2F%2Fsoomgo.com%2Fhire%2F%25EC%259D%25B4%25EB%25A0%25A5%25EC%2584%259C-%25EC%259E%2590%25EC%2586%258C%25EC%2584%259C-%25EC%25BB%25A8%25EC%2584%25A4%25ED%258C%2585

## Owner-only
- O1 LinkPrice 실명인증, 정산 계좌, 세금 정보 (no payout without them).
- O2 LinkPrice console: confirm signgate, dosirak1, usimsa, soomgo are approved for docttak.com; after deploy, one test click each and check the 실시간 리포트.
- O3 If a merchant asks for proof, capture a result screen with the disclosure and link visible.
