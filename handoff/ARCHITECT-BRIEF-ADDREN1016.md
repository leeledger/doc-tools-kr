# Architect Brief — ADDREN1016: 영문주소 변환기 (/english-address/)

Author: Arch. Date: 2026-10-16. Worktree C:/dev/doc-tools-kr/wt/addr-en-1016 (branch addr-en-1016 = origin/main 30cd5ea).
Basis: reports/growth/tool-scout-2026-10-16.md candidate #9. **Owner approved 2026-10-16**: build it, including a call
to an external public address API. TOOLS4/TOOLS5/TOOLS1015 shared rules apply (TOOLS1015 decisions 2, 3, 5, 6, 7) unless
overridden here. Arch logged the decisions in BUILD-LOG ("ADDREN1016 — brief").

## Goal
A visitor types a Korean address, picks the right match, and copies the official English road address plus the
values for overseas shopping form fields (Address line 1 / line 2 / City / State / ZIP). First tool that sends typed
text off the device: same-origin Pages Function `/api/addr-en` → 행정안전부 영문주소 검색 API. Flag-gated
(`PUBLIC_ADDR_EN`, default off). Default build is unchanged.

## Verified facts (fetched 2026-10-16; cite these, do not re-derive)
| # | Fact | Source / evidence |
|---|---|---|
| V1 | Endpoint `https://business.juso.go.kr/addrlink/addrEngApi.do`, POST or GET, xml/json. Request: `confmKey` (Y), `currentPage` (Y, 1), `countPerPage` (Y, 10), `keyword` (Y), `resultType` (N, xml). Response `results.common{totalCount,currentPage,countPerPage,errorCode,errorMessage}`, `results.juso[]{roadAddr (영문 도로명주소), jibunAddr (영문 지번주소), zipNo, admCd, rnMgtSn, bdKdcd, siNm (영문 시도명), sggNm (영문 시군구명), emdNm (N), liNm (N), rn (영문 도로명), udrtYn, buldMnnm, buldSlno, mtYn, lnbrMnnm, lnbrSlno, korAddr (도로명주소 한글)}` | business.juso.go.kr → 주소정보 API 연계 → 영문주소 검색 API (app route `/jst/jstRoadNmAddrEngApiSearch`; text read from chunk `jstRoadNmAddrEngApiSearch-86e3dfe4.js`) |
| V2 | Error codes (HTTP 200, `common.errorCode`): `0` 정상; `-999` 시스템에러; `E0001` 승인되지 않은 KEY (조치: "검색API 승인키 사용불가" → needs the **영문** key); `E0005` 검색어 없음; `E0006` 시도명만; `E0008` 한 글자; `E0009` 숫자만; `E0010` 80글자 초과; `E0011` 10자리 초과 숫자; `E0012` 특수문자+숫자만; `E0013` SQL 예약어·특수문자 `% = > < [ ]`; `E0014` 개발승인키 기간 만료; `E0015` 결과 9천건 초과 | same page |
| V3 | **CORS is open**: `access-control-allow-origin: *` (business.juso.go.kr and www.juso.go.kr). Bogus-key probe, GET and POST form body → `{"results":{"common":{…"errorCode":"E0001"…},"juso":null}}`, 0.09 s. The key is checked before the keyword, so keyword parsing in a POST body is **not yet verified** (A3). | live curl 2026-10-16 |
| V4 | 공공데이터포털 「행정안전부_실시간 영문주소정보 조회(검색API)」 (https://www.data.go.kr/data/15057413/openapi.do): 비용부과유무 **무료**; 이용허락범위 **제한 없음**; 심의유형 개발·운영 **자동승인**; 신청 가능 트래픽 "해당 기관의 정책에 따라 트래픽 수는 상이 할 수 있음" (no published cap); "신청 즉시 이용 가능", "1 시스템 1 승인키 부여", "검색어는 한글, 영문 모두가능" | data.go.kr |
| V5 | Key form (business.juso.go.kr `/jst/jstAddressApiApplicationWrite`): 신청기관 유형 (공공/민간), 업체(기관)명, 시스템명, 시스템 개요, URL(IP), 서비스망 (인터넷 망/행정망), 서비스 용도 (**운영** / **개발(본인인증없이 발급)**; dev period 7/30/90일), 신청인 성명·생년월일·전자우편·연락처, 활용 목적, 신청사유 | form chunk |
| V6 | 주소정보누리집 서비스 약관 (https://www.juso.go.kr/Terms, 시행 2026-08-20): 제5조 services include "주소정보 API 연계"; 제15조② no modification/sale/commercial use of site property "명시적으로 승인한 경우를 제외하고" (the issued key is that approval for API use); 제17조 free service, no liability. No attribution or caching clause. | Terms chunk |
| V7 | **Official English notation** (https://www.juso.go.kr/introduction/RoadAddress §「도로명주소 영문 표기방법」): "작은단위 -> 큰단위 순으로 표기"; 참고항목(법정동, 공동주택명) "주소의 간결화를 위해 표기하지 않을 수 있으나, 필요할 경우 맨 앞(상세주소 앞)에 괄호로 표기"; "특별시와 광역시의 경우는 행정구역단위(-si) 생략 가능"; 대로/로/길(번길) → `-daero, -ro, -gil(beon-gil)`; 상세주소 `705-dong 1104-ho, 56 Dalgubeol-daero 323beon-gil, Suseong-gu, Daegu` or `705-1104, …`; `3-cheung, 42 Toegye-ro 77beon-gil, Chuncheon-si, Gangwon-do`; 동·층·호 "로마자 표기를 원칙으로 하되, 널리 사용되는 표현인 경우 영어식 표기 … '층' -> 'F', '지하' -> 'B' 사용가능" | RoadAddress chunk |
| V8 | **UPU Korea (Rep.)** (https://www.upu.int/UPU/media/upu/PostalEntitiesFiles/addressingUnit/korEn.pdf, 03/2016): lines `building + door` (`101-dong 103-ho`, "preferred over the abbreviated one: 101-103") / `premises + street + sub-province` / `province + postcode` (`DAEGU 42007`) / `REP. OF KOREA`. Rural `6, Jong-ro, Changnyeong-eup, Changnyeong-gun` (eup/myeon on the street line). Province = -do/-si; sub-province = -gun/-si/-gu. Basement `B`. | PDF |
| V9 | Pages Functions have **no rate-limit binding** (ARCHITECT-BRIEF-C2-CLOUD F5). Zone WAF rule exists: `/api/` > 100 req / 10 s per IP+colo → 10 s block (docs/OPS-RUNBOOK.md §8). Workers Free 100k requests/day shared by all Functions (OPS-RUNBOOK §8). | repo |

## Locked decisions
1. **Proxy, not a direct browser call.** CORS would allow one (V3), but the same-origin Pages Function
   `functions/api/addr-en.ts` keeps the key secret, keeps CSP `connect-src 'self'`, validates input, rate-limits, and
   reduces the upstream answer to whitelisted fields. **Fallback B (not built):** if A3 shows juso rejects calls from
   Cloudflare, the alternative is a direct browser call (key in the page, CSP + `business.juso.go.kr`). That is a new
   owner decision; Arch escalates with the verbatim error.
2. **Flags.** Build flag `PUBLIC_ADDR_EN` (`"1"` on, default `"0"`); helper `scripts/lib/addren.mjs` mirroring
   `bgcloud.mjs` (`addrEnFlag`, `addrEnOn`, `API_PATH = '/api/addr-en'`, `privacyGate`). Runtime secret `JUSO_EN_KEY`
   (Pages secret). **Flag off = no page at all** (like `PUBLIC_BG_REMOVE`): no `/english-address/`; absent from tools
   list, menu, home, sitemap, llms.txt, RSS, OG list, manifest; the string `/api/addr-en` in no dist file. A "coming
   soon" notice page would be indexed thin content: rejected.
3. **Privacy gate.** `PUBLIC_ADDR_EN=1` requires `PUBLIC_PRIVACY_OFFICER` and a valid `PUBLIC_CONTACT_EMAIL`
   (astro.config and check-dist fail otherwise), as for the cloud path: an address is personal data (개인정보 보호법
   제30조, logged for C2-cloud).
4. **Function runtime gate.** 404 `{"error":"off"}` unless `env.PUBLIC_ADDR_EN === '1'` (Pages env vars reach Functions);
   503 `engine` if `JUSO_EN_KEY` is missing. Kill switch = remove the flag and redeploy.
5. **Transport.** Page → `POST /api/addr-en`, `Content-Type: application/json`, body `{"q":string,"page":1..5}`. Never
   GET, never in our URLs (keeps the address out of URLs, Referer, analytics paths, history). Function → upstream `POST
   https://business.juso.go.kr/addrlink/addrEngApi.do`, form body `confmKey, currentPage, countPerPage=10, keyword,
   resultType=json`. If A3 shows the POST keyword is ignored, switch the upstream call to GET (server to server) and log.
6. **No storage anywhere.** Function: no `console.*`; no KV, Cache API or Analytics write of query or results; response
   headers `Cache-Control: no-store, private`, `CDN-Cache-Control: no-store`, `X-Robots-Tag: noindex`,
   `X-Content-Type-Options: nosniff`. Page: query and results never in localStorage, sessionStorage, IndexedDB, URL,
   `history`, usage beacon or GA. The search input has **no `name` attribute** (a pre-JS Enter puts nothing in the URL).
   No `?q=` deep link, ever.
7. **Abuse and cost (Free plan).** (a) existing WAF rule (V9); (b) in-isolate per-IP limiter in the Function: 20
   requests / 60 s keyed by `cf-connecting-ip`, `Map` capped at 5,000 keys (drop oldest), memory only, best effort →
   429 `busy`; (c) page searches only on submit (button / Enter), button disabled while in flight, no type-ahead;
   (d) input limits (decision 8). Upstream timeout 5 s (`AbortSignal.timeout(5000)`) → 504 `timeout`. No retries.
8. **Input validation (Function is the authority; page mirrors it for instant messages).** Body ≤ 512 bytes (header when
   present, and measured); JSON object; `q` string, NFC, trimmed, inner whitespace collapsed, control chars removed;
   strip `% = < > [ ]` (V2 E0013) before the length check; 2 ≤ length ≤ 80 characters (E0008/E0010) → else 400
   `short`/`long`; `page` integer 1..5 else 400 `bad`. Same-origin check as `functions/api/usage.ts` (`Sec-Fetch-Site`,
   else `Origin`) → 403. POST only (405), `application/json` only (415), size → 413.
9. **Answer shape (whitelist).** `200 {"total":n,"page":p,"items":[{road,jibun,zip,si,sgg,emd,kor}]}` (`road`=roadAddr,
   `jibun`=jibunAddr, `zip`=zipNo, `si`=siNm, `sgg`=sggNm, `emd`=emdNm or "", `kor`=korAddr); strings ≤ 200 chars,
   ≤ 10 items, all other fields dropped. Errors are `{"error":code}` only, never the upstream message or the key.
   Mapping: `E0005,E0008` → 400 `short`; `E0006` → 400 `sido`; `E0009` → 400 `digits`; `E0010` → 400 `long`;
   `E0011,E0012,E0013` → 400 `chars`; `E0015` → 400 `broad`; `E0001,E0014` → 503 `engine`; `-999`, unknown code,
   non-JSON, HTTP ≠ 200, fetch throw → 502 `upstream`; timeout → 504 `timeout`.
10. **Split rules** (pure module `src/tools/english-address/split.ts`; header cites V7, V8):
    - `line1` = `road` minus the trailing `, {sgg}, {si}` (or `, {si}` when `sgg` is empty, e.g. 세종). This keeps the
      official building number + road (+ `, …-eup/-myeon`, which UPU puts on the street line). If the suffix does not
      match exactly: text before the first `, {sgg}`; if `sgg` is not found: `line1` = `road`, `fallback: true` (the UI
      shows the one-line copy first). Never romanise anything ourselves.
    - `line2` = the optional 상세주소 the user types, converted on the device by `detail.ts`: `N동` → `N-dong`, `N호` →
      `N-ho`, `N층` → `NF`, `지하 N층`/`지하N층` → `BNF`, `지하` + `N호` → `BN-ho`; Latin letters, digits, `-`, `,`, spaces
      kept; order as typed (V7, V8). Any other Hangul (apartment name, 가동 …) → `needsManual: true`: line 2 not copyable,
      message 「동·층·호 말고 다른 한글은 영문으로 직접 적어 주세요. 아파트 이름은 빼도 돼요.」 (V7: 참고항목 생략 가능).
    - `city` = `sgg`, or `si` when `sgg` is empty. `state` = `si`. `zip` = `zip`. `country` = `South Korea` (hint
      「나라: South Korea (Republic of Korea)」, copyable).
    - `full` = `[line2 + ", "] + road + " " + zip` (V7 small → large; V8 province + postcode).
    - Unit fixtures: the V7 examples (Seoul gu; Gyeonggi si + beon-gil; Daegu 705-dong 1104-ho; Chuncheon 3층), V8 rural
      eup, Sejong (empty sgg), a suffix mismatch, 지하, apartment name → needsManual. A3 adds ≥ 10 real responses.
11. **Slug / names / SEO.** Slug `english-address`. name = h1 = 「영문주소 변환기」. Title (38) 「영문주소 변환기 —
    도로명주소 영문 변환·해외직구 주소 칸 | 문서딱」. Description (76) 「주소를 찾아 영문 도로명주소로 바꾸고, 해외직구
    주소 칸(Address·City·State·ZIP)에 나눠 넣을 값을 알려 줘요. 무료.」. Keywords: 영문주소, 영문주소 변환, 영문 주소
    변환, 주소 영문 변환, 도로명주소 영문, 해외직구 영문주소. Naver puts its own 영문주소 box on top: our angle is the field
    split and one-tap copy on phones; intro and FAQ say that. Core-glyph rule (TOOLS1015 d2): check every core string
    with `uiCharSets`; rephrase on a miss; never grow the tripwire.
12. **UX (mobile-first, 360 px first).** One search box (`type="search"`, `enterkeyhint="search"`, `autocomplete="off"`,
    placeholder 「예: 세종대로 110, 반포동 18-1」) and a 「찾기」 button ≥ 44 px; under it the privacy line (decision 13).
    Results: stacked cards, each = Korean address (`kor`, to recognise it) + English road address + English 지번 (smaller)
    + 우편번호, a 「이 주소 쓰기」 button and a copy button for the English road address. Total > 10 → 「더 보기」 (next page,
    max 5) and 「건물 번호까지 적으면 더 빨리 찾아요」. After 「이 주소 쓰기」: optional input 「상세주소 (동·호)」 (example
    「101동 1203호」) and the card 「해외 직구 주소 칸에 나눠 넣기」 with rows Address line 1 / Address line 2 / City /
    State·Province / ZIP code / Country, each value + 「복사」 (aria-label names the field), plus 「한 줄로 복사」. Copy:
    `navigator.clipboard.writeText`, fallback select + `execCommand('copy')`, else select the text and show 「길게 눌러
    복사해 주세요」; polite live region 「복사했어요」. Focus moves to the split card heading after selection; results
    region `aria-live="polite"`. Noscript line (no jargon): 「이 도구는 지금 쓰는 앱에서 열리지 않아요. 크롬이나 사파리로
    열어 주세요.」.
13. **Page copy (honest, plain).** Privacy line next to the box: 「찾는 주소는 행정안전부 주소 검색으로 보내 영문 주소를
    받아 와요. 문서딱은 저장하지 않아요. 자세히」 (link `/privacy/#addr`). Source line under results: 「주소 자료:
    행정안전부 도로명주소 (주소정보누리집)」 linking https://www.juso.go.kr/. Never 「보내지 않아요」 on this page.
    Messages by code: short 「주소를 두 글자 이상 적어 주세요.」 · sido 「시·도 이름만으로는 찾을 수 없어요. 도로명이나
    동 이름까지 적어 주세요.」 · digits 「숫자만으로는 찾을 수 없어요. 도로명이나 건물 이름을 같이 적어 주세요.」 · long
    「80글자까지 적을 수 있어요.」 · chars 「기호를 빼고 다시 찾아 주세요.」 · broad 「찾은 주소가 너무 많아요. 건물 번호까지
    적어 주세요.」 · 0 results 「찾은 주소가 없어요. 도로명과 건물 번호(예: 세종대로 110)나 동 이름과 번지로 다시 찾아
    주세요.」 · busy 「잠깐 너무 많이 찾았어요. 몇 초 뒤에 다시 눌러 주세요.」 · engine, upstream, timeout, off, anything
    else 「지금은 주소를 찾을 수 없어요. 잠시 뒤에 다시 해 주세요.」 · offline (`navigator.onLine === false` or fetch
    TypeError) 「인터넷에 연결된 뒤에 다시 찾아 주세요.」. Never 업로드/서버/브라우저/네트워크/API in Korean copy (say
    「주소 검색 서비스」).
14. **/privacy/ (flag on only).** New section `id="addr"` 「영문주소 변환기에서 주소를 보내는 경우」, numbered through
    the existing `n()` scheme (after the 배경 지우기 section when both are on): 목적 (영문 주소를 찾기 위해서만) · 항목
    (찾기 칸에 적은 주소 글자; 상세주소(동·호)는 보내지 않고 기기 안에서 바꿔요) · 처리와 보관 (문서딱은 저장·기록하지
    않아요; 결과를 돌려준 뒤 남기지 않아요) · 처리하는 곳: 행정안전부 주소정보누리집 (주소 검색), Cloudflare, Inc. (전달)
    · 국외 이전 block for Cloudflare mirroring the 배경 지우기 block (항목 = 주소 글자; 시기 = 「찾기」를 누를 때) · 거부
    방법 (이 도구를 쓰지 않으면 보내지 않아요). Section 1 adds, when on, 「영문주소 변환기에서 찾는 주소는 {n}항」.
    Section 2 (files) unchanged and still true (no file bytes). Bump `PRIVACY_REVISED`.
15. **/terms/ (flag on only).** One bullet: the English address comes from 행정안전부 data as is; the 상세주소 conversion
    is a guide, so check the receiving form. The outbound flow is named only on /privacy/, /terms/, /english-address/
    (check-dist, like `EXCEPTION_PAGES`).
16. **CLAUDE.md** (A1 commit): in the privacy rule, after the usage-beacon sentence: "The third allowed POST is the
    영문주소 search to `/api/addr-en` (same origin, JSON `{q,page}`, typed address text only, never file data; behind
    `PUBLIC_ADDR_EN=1`; the Function forwards it to 행정안전부 addrEngApi with the secret `JUSO_EN_KEY`; no logging,
    storage or cache; only `english-address.cloud.spec.ts` allows it)." No-contact rule: the addr build also needs
    `PUBLIC_PRIVACY_OFFICER` + `PUBLIC_CONTACT_EMAIL`. Line 3: tool list += 영문주소 변환기; Pages Functions list +=
    `/api/addr-en`.
17. **Usage beacon (scripts/lib/usage.mjs).** TOOLS += `english-address`, TOOL_LABELS 「영문주소 변환기」. `start` (찾기
    pressed), `success` (≥ 1 result), `fail` codes `no-result` (new, 「찾은 주소 없음」), `query` (new, 「검색어를 고쳐야
    함」; covers short/sido/digits/long/chars/broad), `busy` (new, 「찾기 요청이 많음」), `engine`, `timeout`; `download` on
    any copy with setting `field` ∈ `line1,line2,city,state,zip,country,full,road` (SETTINGS + SETTING_LABELS +
    VALUE_LABELS). Never the text, result count, page number, zip or region.
18. **Chains.** RelatedTools `id-photo` (여권 사진), `pdf-merge` (서류 한 파일로). No FLOW (no file output). NEXT_GUIDES only
    after A4.
19. **Build placement.** Flag on in the existing cloud build (`dist-bgcloud`; already has officer, contact, usage, GA)
    and in the CI checks build that already builds `/remove-background/` (add officer/contact test values there if
    missing). Default build untouched.
20. **SW.** `/english-address/` in NOT_PRECACHED + RUNTIME_PAGES (scripts/gen-sw.mjs). 450 KB precache cap never raised;
    log KB for default and cloud builds.

## Flow
```
[page /english-address/]                 [Pages Function /api/addr-en]                    [juso addrEngApi]
 type q, press 찾기
   └─ page check fails → message, no request
 POST {q,page} same origin, JSON ──────> flag off → 404 off | no key → 503 engine
                                          method/origin/type/size → 405/403/415/413
                                          validate q,page → 400 short|long|bad
                                          per-IP limiter → 429 busy
                                          POST form (key,q,page,10,json) ── 5 s ──────> 200 {common, juso}
                                            timeout → 504 | throw / !200 / !json → 502 | errorCode → d9 map
                                          whitelist fields <──────────────────────────
 200 {total,page,items} <────────────────
   ├─ 0 items → 「찾은 주소가 없어요」 (fail no-result)
   └─ cards → 「이 주소 쓰기」 → split(road,si,sgg,zip) + detail(동·호, on device only)
             → 6 rows + 한 줄 복사 → clipboard (download field=…)
```

## Build order (separate commits; refactor and behaviour never mixed)
- **A1 — flag + pure logic + Function (no page).**
  - `scripts/lib/addren.mjs`, `src/env.d.ts`, astro.config define `__ADDR_EN__` + privacy gate.
  - `src/tools/english-address/split.ts`, `detail.ts`, `messages.ts` (code → Korean, d13).
  - `functions/api/addr-en.ts` (d4-d9), exporting pure helpers (`validateQuery`, `mapUpstream`, `createLimiter`) for tests.
  - CLAUDE.md (d16), usage.mjs (d17).
- **A2 — page + registration + privacy/terms.**
  - `src/pages/english-address/index.astro`, built only when on (copy how `/remove-background/` is left out when
    `PUBLIC_BG_REMOVE` is off). `src/tools/english-address/{controller,entry}.ts`: lazy controller; initial JS < 30 KB
    gzip; controller budget = measured gzip + 20 % in check-dist.
  - Registration = TOOLS1015 d3 list, every item gated on the flag: tools.ts (FAQ: 어떤 주소로 바꿔 주나요 / 해외직구
    칸에는 어떻게 넣나요 / 상세주소는 어떻게 쓰나요 / 적은 주소를 저장하나요 → 저장 안 함, 행정안전부 주소 검색으로
    보냄), og.json + gen-brand OG, JSON-LD (same builders as other tools), sitemap, llms.txt, menu/home (HOME_DESC_ORDER:
    after `char-count`), tool-facts, lighthouserc URL, qa:visual list, site/polish/growth e2e lists (flag-on build),
    postbuild OG list. bgcloud `LOCAL_SCOPE_RE` untouched (this page makes no "never leaves" claim).
  - /privacy/ (d14), /terms/ (d15), docs/COPY.md: the 「주소 검색 서비스」 wording and the honest-send line pattern.
  - check-dist: default build → no page, no `/api/addr-en`, no 「영문주소 변환기」 in any dist file; flag-on build → page
    present; `/api/addr-en` only in the english-address controller chunk; privacy has `id="addr"` with 「행정안전부」;
    terms has the bullet; the outbound phrase 「행정안전부 주소 검색으로 보내」 only on the 3 pages; CSP `connect-src`
    unchanged; flag on without officer/contact → fail.
- **A3 — live key probe (after O1-O3; may trail A2 by days; A2 may merge with the flag off).**
  - `scripts/probe-addr-en.mjs` (local only; reads `JUSO_EN_KEY` from env; never prints, logs or commits it): 12 fixed
    public building addresses (서울시청 세종대로 110, 정부세종청사, 대구 달구벌대로 2275-12 from V8, an -eup address, an
    underground address, 성남시 분당구, 제주 …) → `tests/fixtures/addr-en/live-*.json` (public buildings only, never
    personal addresses). Confirms: POST keyword works (else d5 GET switch); the key works from a Cloudflare preview
    (POST to the preview `/api/addr-en` with `Sec-Fetch-Site: same-origin`); the d10 suffix rule holds on all 12 (else
    fix split, add fixtures). Log codes, latency, the 12 splits.
- **A4 (optional, after live) — guide `english-address-shopping` 「해외 직구 영문 주소 쓰는 법」.** Sources V7, V8, V4.
  check:quotes must verify each verbatim quote; the juso page is a JS app, so if check:quotes cannot read it, quote
  only the UPU PDF verbatim and paraphrase juso with link + fetch date (log it). NEXT_GUIDES then.
- Flag (Bob must not guess): (a) the English form of underground buildings (`udrtYn=1`): use `roadAddr` as returned;
  (b) the order inside `sggNm` for 시+구 cities: as returned; (c) any rule not in V7/V8 → ask Arch.

## Out of scope (→ BUILD-LOG Known Gaps if it surfaces)
English twin /en/english-address/, /embed/ widget, `?q=` deep links (forbidden), saved/recent addresses, 영문 이름
변환기 (separate scout candidate), romanising free text, jibun-based split, maps/coordinates, the juso 팝업 API,
Fallback B (direct browser call).

## Failure modes
| Path | Realistic failure | Handling (test) | User sees |
|---|---|---|---|
| Upstream | juso slow / down (maintenance, 약관 제7조) | 5 s timeout → 504; throw → 502 (unit) | 「지금은 주소를 찾을 수 없어요…」 |
| Key | dev key expired E0014 / wrong key type E0001 | 503 `engine` (unit); `fail engine` spike in /admin/ | same clear message; owner sees the spike |
| Egress | juso refuses Cloudflare IPs or checks the registered URL | caught by A3 before flag-on; Arch escalates Fallback B | nothing in prod (flag off) |
| Quota | unpublished juso traffic cap (V4) | 502/503 mapping; limiter + submit-only keep volume low | clear message; admin spike |
| Abuse | scripted hammering | WAF 100/10 s + isolate 20/60 s → 429 (unit) | 「잠깐 너무 많이 찾았어요…」 |
| Workers cap | 100k/day shared with usage/remove-bg exceeded | page: any non-JSON/!ok → generic message (e2e); runbook: lower `PUBLIC_USAGE_SAMPLE` first | clear generic message |
| Input | emoji, control chars, 81+ chars, only `%%%` | strip + 400 `short/long/chars` (unit) | specific message |
| Split | unexpected `roadAddr` shape | `fallback:true`, one-line copy first, rows from fields (unit) | correct values, no silent wrong split |
| Detail | apartment name typed in Hangul | `needsManual`, line 2 not copyable (unit + e2e) | clear instruction |
| Clipboard | iOS / KakaoTalk in-app denies clipboard | execCommand fallback, then select + 「길게 눌러 복사해 주세요」 (e2e stub) | clear |
| Privacy drift | a later `console.log(q)` or storage write | unit greps the Function for `console.`; e2e checks storage empty; check-dist flag-off leak test | n/a |
| Flag drift | Function deployed, page flag off | 404 `off` (unit) | n/a |
No critical gap: every path has a test or handling and a visible message.

## Test map
- `tests/unit/addren-split.test.ts`: every d10 rule incl. Sejong, eup, suffix mismatch, 지하, needsManual, full, country [GAP → new].
- `tests/unit/addren-function.test.ts` (mocked `fetch`, fake timers): flag off 404; no key 503; 405/403/415/413; body
  > 512 B without content-length (measured); strip `%=<>[]`; 1 char → `short`; 81 → `long`; page 0/6/"x" → `bad`; each
  errorCode (d9); whitelist (extra upstream fields dropped, > 10 items cut, > 200-char field cut); non-JSON / HTTP 500 /
  throw → 502; timeout → 504; 21st request in 60 s → 429 and recovery; Map cap; upstream form carries key + keyword;
  the response never contains the key; headers no-store/noindex; Function source has no `console.` [GAP → new].
- `tests/unit/addren-flag.test.ts`: flag parsing, default off, privacy gate errors [GAP → new].
- usage.mjs unit: new tool, codes, `field` setting accepted; unknown rejected; Korean labels [TESTED → extend].
- `tests/e2e/english-address.cloud.spec.ts` (cloud-* 5 projects; `allowUpload` = `POST /api/addr-en` + `POST /api/usage`;
  `/api/addr-en` page.route'd with fixtures; no test reaches juso or Cloudflare): search → 3 cards → select → type
  「101동 1203호」 → rows exact (line2 `101-dong 1203-ho`); copy line1 → clipboard (chromium) + live region; 「더 보기」
  page 2; each error code → its message; offline (route abort) → offline message; apartment name → needsManual; request
  body exactly `{"q":…,"page":…}`; page URL never contains the query; local/sessionStorage empty; axe clean; 360 px no
  horizontal scroll [GAP → new]. playwright.config `CLOUD_SPEC` += `english-address\.cloud` [GAP → edit].
- No-upload regression: every other spec unchanged, no addr allowlist anywhere else [TESTED].
- check-dist default + flag-on assertions (A2 list) [GAP → new]; bgcloud claim checks unchanged [TESTED, regression].
- /privacy/ and /terms/ new parts only when on (dist assertions) [GAP → new].
- site/polish/growth lists on the flag-on build [TESTED → extend]; LHCI /english-address/ median of 5 on the flag-on
  build, thresholds unchanged [GAP → add]; qa:visual desktop / mobile / dark [GAP → add].
- Live smoke after O4 (manual, logged): 「세종대로 110」 → English road address + zip as A3 recorded; headers no-store;
  25 rapid POSTs → 429.

## Acceptance
- A1: `npm run check`, `npm test` green; default build + check-dist output set identical to main (no new page, no new
  string). Richard CLEAR.
- A2: flag-on cloud build: check-dist OK; initial JS < 30 KB gzip; budgets and precache KB logged (≤ 450); 0 new core
  glyphs; cloud spec green on 5 projects; full chromium suite green; LHCI median ≥ thresholds; licenses OK (no new deps
  expected; any new dep permissive). Richard CLEAR. Merge to main with the flag off is allowed.
- A3: probe log in BUILD-LOG, fixtures committed, preview smoke OK, Richard CLEAR on A3 changes.
- Production flag on (O4) only after A3; then live smoke logged.

## Owner-only steps
- **O1 승인키 신청** (https://business.juso.go.kr): 주소정보 API 연계 → API 목록 → **영문주소 · 검색 API** → 「OPEN API
  신청하기」. 신청기관 유형 민간기관 · 업체(기관)명: 상호 (사이티드) · 시스템명 문서딱 · 시스템 개요 「문서·사진 무료
  도구 사이트의 영문주소 변환기」 · URL(IP) `https://docttak.com` · 서비스망 인터넷 망 · 서비스 용도 **운영** (본인인증
  필요; a 개발 key expires after 7/30/90 days → E0014) · 신청인 정보 · 활용 목적 closest option · 신청사유 「해외 직구·
  서류용 영문 도로명주소 변환」. 자동승인 (V4): the key shows right after. A 국문 검색API key does NOT work (E0001 note).
- **O2 Cloudflare secret:** Workers & Pages → `doc-tools-kr` → Settings → Variables and Secrets → Production and Preview
  → Add → type **Secret**, name `JUSO_EN_KEY`, value = the key. Never paste the key into chat, git or a repo file. For
  A3 the owner runs `JUSO_EN_KEY=… node scripts/probe-addr-en.mjs` on the PC (or passes it as an env var only).
- **O3 Preview flag:** Preview env text `PUBLIC_ADDR_EN` = `1` → redeploy the branch preview (A3 Cloudflare probe).
- **O4 Production flag (after A3):** Production env text `PUBLIC_ADDR_EN` = `1` (officer + contact must be set; the build
  fails otherwise) → redeploy → Arch runs the live smoke. Off = delete the variable + redeploy.

## Risks carried
- juso publishes no traffic cap (V4); a cap or block shows as `engine`/`upstream` spikes in /admin/.
- juso acceptance of calls from Cloudflare (A3 decides; Fallback B needs the owner).
- Naver's own 영문주소 box sits at the top of Naver results: expect Google + long tail; demand peaks in November.
