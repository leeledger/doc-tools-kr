# Architect Brief — REV2 (수익 계획 재정렬 + 인화 링크)

Source: `C:/dev/doc-tools-kr/reports/문서딱 수익화 전략 검증.md` (owner: "권하는 순서대로 진행시켜", 2026-10-12).
Base: c2 `c2-cloud` == origin/main, HEAD fcb9aab, CI green.

## Goal
수익 계획 문서가 검증 보고서의 결론(기본 성장 20~25%, 새 우선순위, 정책 메모, 지표 재평가)을 따르고, 증명사진 결과 화면에 스크립트 없는 「인화·사진관」 링크가 생겨 누른 횟수가 관리자 페이지와 주간 리포트에 나온다(제휴 링크는 대표가 주소를 넣기 전까지 보이지 않는다).

## Status of priority 1 (growth engine) — no build in REV2
Done: 증명사진 원스톱(규격 13종, 확인 목록, 자동 맞춤 플래그), 사진→PDF / PDF→JPG / PDF 암호 (TOOLS4), 이어서 하기 X1·X2 + 관리자 표시 (CHAIN, CHAIN-ADMIN). REV2 adds no growth feature; the doc says "측정 단계".
Later sprints (doc only, do NOT brief/build): 3순위 무료 임베드 위젯, 4순위 애드센스(안내 글 경로만).

## Locked decisions
1. **Where:** one static block in `#idp-done` of `src/pages/id-photo/index.astro`, directly after `#idp-print`. Shown on **every** id-photo result (not only print presets: `id_card` is the only `status:'print'` preset, which would make the signal useless). It lives inside `#idp-done`, so it appears only with a result. No JS show/hide.
2. **No new JS except one delegated click listener** in `src/tools/id-photo/controller.ts`: on click inside the block, `closest('a[data-out]')`; if found, `track({ e: 'out', t: 'id-photo', o: 'out', v: a.dataset.out })`. No preventDefault, no URL rewriting, no redirect hop. sendBeacon is safe because the links open a new tab.
3. **Links** (data in new `src/data/print-links.ts`, pure function `printLinks(env)` returning `{ dest, href, label, sponsored }[]`):
   - `photo-studio`: non-affiliate info link, **default ON in every build** (demand measurement starts now, in the October ID-photo peak, before the owner signs up anywhere). Label `가까운 사진관 찾기 (네이버 지도, 새 창)`, href `https://map.naver.com/p/search/%EC%82%AC%EC%A7%84%EA%B4%80`, `rel="noopener noreferrer" target="_blank"` (site convention for external links, cf. `#idp-verify-link`). Kill switch: `PUBLIC_PRINT_INFO=0` removes it.
   - `print-service`: affiliate, env `PUBLIC_AFF_PRINT_URL`. Label `사진 인화 주문하기 (광고, 새 창)`.
   - `coupang`: affiliate, env `PUBLIC_AFF_COUPANG_URL`. Label `사진 인화 용품 보기 (쿠팡, 광고, 새 창)`.
   - Affiliate links: `rel="sponsored noopener" target="_blank"` (no noreferrer: some programs check the referring site). Unset/empty env: that link is not in the HTML at all.
   - Env validation at build (build fails with a clear message naming the variable, never echoing the URL): parses with `new URL()`, protocol `https:`, length <= 500, no whitespace or `"<>`.
   - If every link is off, the block is not rendered.
4. **Disclosure** (공정위 「추천·보증 심사지침」 2024-12-01: 첫 부분, 링크 앞): affiliate links sit in their own group **after** the info link; the group starts with the disclosure paragraph, then the links; each affiliate label also says 「광고」. Generic text (when >= 1 affiliate link): `광고: 아래 링크로 주문하면 문서딱이 수수료를 받을 수 있어요.` When `coupang` is on, append Coupang's required sentence verbatim from one constant `COUPANG_DISCLOSURE = '이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.'`. **Unverified wording**: the owner confirms it in the Coupang Partners console at signup (runbook step); plain-Korean rule yields to the program's mandated text here. The info link is never under the disclosure. Text links only: no banners, images, floating or sticky elements (Coupang bans floating banners since 2025-01).
5. **Lead line** before the info link: one plain-Korean line in the spirit of `종이 사진이 필요하면`, per docs/COPY.md.
6. **Fonts:** core preload headroom is ~1.8 KB and the Coupang sentence alone brings new syllables. Lock: the whole block renders in the **system font**: a class whose CSS rule sets the `-apple-system` stack (fontcover reads the exemption from the shipped CSS, `scripts/lib/fontcover.mjs` L23-35), and the strings in `src/data/print-links.ts` are excluded from the core char set by a named-constant rule in `stripComments` (precedent `TOPICS`, `scripts/lib/ui-font-chars.mjs`). check-dist font coverage passes without any weaker check. The block must add 0 bytes to the core faces; privacy text (Decision 9) may add a little: measure and report.
7. **Usage event** (`scripts/lib/usage.mjs`, the single whitelist): `EVENTS` += `out`; `OUT_KEY = 'out'`; `OUT_DESTS = ['photo-studio', 'print-service', 'coupang']`; `validate`: an `out` event requires `t === 'id-photo'`, `o === OUT_KEY`, `v` in `OUT_DESTS`, else null. Same blob layout (o -> blob5, v -> blob6). Client `UsageEvent` union gets `{ e: 'out'; t: 'id-photo'; o: 'out'; v: OutDest }`; `buildPayload` copies o/v for `out` the same way as for `next`. Never the href, never query params.
8. **Admin + weekly report:** sixth query `outs` in `usageSql` (`blob1 = 'out'`, `blob6 AS dest`, same guards) in the same `Promise.all`; `shapeUsage` -> `shaped.outs = { total, rows }` (dest whitelist, n desc, ties by OUT_DESTS order) and one table appended after the chain tables: 링크 / 누른 횟수 / 증명사진 저장 성공 대비(%) (denominator: id-photo `success` in the same period; `-` when 0). The events loop skips `out` like it skips `next` (comment says why). Admin section `s-out` after `s-chain-tools` with note `링크를 누른 횟수예요. 실제로 주문했는지는 알 수 없어요.` Dest labels: 사진관 찾기(네이버 지도) / 인화 주문(광고) / 쿠팡(광고). /admin/ uses system fonts: no font or precache impact. The weekly report gets the table through renderTables (precedent CHAIN-ADMIN).
9. **Privacy: needed**, because /privacy/ L103 enumerates what the beacon sends. Add `증명사진 결과 화면의 사진관·인화 링크를 눌렀는지(링크 종류만)` to that list; new `PRIVACY_OUT = '2026년 10월 12일'` (usage-stats builds only, like PRIVACY_USAGE); revision-history line; `PRIVACY_REVISED` = newest section in the build; `PRIVACY_TERMS_UPDATED` per its existing rule. Nothing else on /privacy/ changes.
10. **No CSP change, no `_headers` change, no new script, no new Function, CLAUDE.md untouched.** Live smoke "외부 요청 0" still holds (links are not requests).
11. **M-3 checklist text** (`scripts/ops/monetize.mjs` `checklist()`): replace "CSP: 광고 출처만 허용..." with `CSP: 광고용 CSP는 /guide/* 경로에만(_headers 경로별; 정적 배포라 nonce 대신 해시 기반 strict CSP 또는 Functions 검토). 도구·결과·404 화면은 지금 CSP 그대로`; replace "광고는 안내·결과 영역의 예약 슬롯..." with `광고는 안내 글(/guide/) 페이지에만. 도구 화면·결과 화면·404에는 넣지 않는다(구글 게시자 정책)`; add `- [ ] 안내 글 50편 안팎, 기관 이름만 바꾼 글 없음(구글 스팸 정책)`; add `14세 미만 맞춤광고 끄기` to the 개인정보처리방침 v2 line. `R1` numbers in report.mjs unchanged. Update tests pinning these strings.

## Flow
```
id-photo save OK -> #idp-done visible
  .print-links (static HTML, system font)
     [lead line]
     a[data-out=photo-studio]           (unless PUBLIC_PRINT_INFO=0)
     -- only if some PUBLIC_AFF_* set --
     p.disclosure (generic [+ COUPANG_DISCLOSURE])
     a[data-out=print-service] sponsored (if PUBLIC_AFF_PRINT_URL)
     a[data-out=coupang]       sponsored (if PUBLIC_AFF_COUPANG_URL)

click a[data-out] --> browser opens new tab (unchanged default)
                  +-> track({e:'out', t:'id-photo', o:'out', v:dest})   no-op if stats off / not sampled
                        -> sendBeacon /api/usage -> validate() -> Analytics Engine blob1='out', blob6=dest
admin + weekly: usageSql().outs -> shaped.outs -> table + s-out section
```

## Build Order
A. `docs/REVENUE-MODEL.md` rewrite (plain Korean, same 해라체 as now, title date 2026-10-12):
   0. 원칙: keep 무료 / 파일 안 나감 / 자동 운영; "수익은 트래픽에서" -> "수익은 트래픽과 결과물(인화·출력)에서"; add "외부 스크립트가 필요한 수익원은 안내 글 경로에만".
   1. 수익원과 순서: table from the report L61-69, labelled: 1 성장 엔진 (진행 중; status list above) / 2 R2 정적 제휴 링크 (지금; REV2 구현, 대표 가입 대기) / 3 W 무료 임베드 위젯 (1~3개월, 별도 스프린트) / 4 R1 애드센스 (안내 글만; 조건: 실제 방문 하루 100회 2주 연속 + 안내 글 50편 안팎 + 개인정보처리방침 v2; 경로별 CSP) / 5 R3 증명사진 유료 옵션 (인화 배송·검수; 인화 링크 수요 확인 뒤; 사업자 등록이 필요한 대표 결정) / 6 스폰서 한 줄 (월 5만 PV 이후) / R4 사이티드 (상시) / 뺌: 광고 제거 구독. One line on why R2 moved up (돈보다 측정).
   2. 숫자: keep the 10-10 실측 paragraph; scenario table (report L27-31) with **25% = 기본, 40% = 낙관, 15% = 보수**; 월 10만 원 기본 2027-11 ~ 2028 초; "광고를 안내 글에만 넣으면 필요한 전체 PV는 3만~6만보다 커진다"; 계절 메모 (증명사진 2월 말~3월 초·10월, 여권 8월 말·12~1월); 2027 상반기 광고 기대치 월 수천~1만 원대.
   3. 정책 메모: 애드센스 금지 화면 (도구·결과·404·업로드 버튼만 있는 화면), /guide/* 경로별 CSP, nonce 불가 -> 해시 strict CSP 또는 Functions (무료 한도 확인), A-4·라이브 스모크 검사 범위 조정 필요, 개인정보처리방침 v2·첫 방문 고지·14세 미만; 제휴: 공정위 2024-12-01 첫 부분 표시, 쿠팡 떠다니는 배너 금지·지정 문구, 텍스트 링크만; 세금: 애드센스 사업소득 5월 신고, 쿠팡 3.3% 원천징수·최소 지급 2만 원; A-7 템플릿 대량 글 = 스팸 위험. Cite the report file once; no new external claims beyond the report.
   4. 재평가: **delete** the "2026-11-10 하루 100회 미만이면 재검토" rule. Indicator table = report L81-88 + a 데이터 출처 column (서치콘솔 / 서치어드바이저 / 관리자 페이지·Cloudflare 통계 / 익명 사용 통계) + a 7th row `인화·사진관 링크 누름 (증명사진 저장 성공 대비)` for R3 (제안값: 계속 3% 이상 / 조정 1~3% / 재검토 1% 미만). Dates: **2026-11-10** 1차, **2026-12-15 전후** 2차 (10월 성수기 효과 거르기; 11-10이 "계속"이어도 12월 확인 전에는 낙관하지 않는다). "기준치는 제안값이며 첫 측정 뒤 조정한다". R3 검토 신호: 링크 누름이 저장 성공 대비 3% 이상 4주 + 월 30회 이상 -> 대표에게 R3 판단 요청. Note that 이어서 하기 is counted as button presses (CHAIN_NOTE).
   5. 현황: update counts (도구 15개; 안내 글 = actual count in `src/content/guides`); 측정 list as it is now (익명 사용 통계, GA4, Web Analytics) consistent with CLAUDE.md (do not edit CLAUDE.md).
   6. 자동화: keep the §3 table; M-3 row matches Decision 11.
   7. 일정: 지금 R2 (REV2) -> 11-10 지표 1차 -> 12월 중순 2차 -> 1~3개월 W 위젯 -> 조건 충족 시 R1 (안내 글만) -> 수요 신호 시 R3 판단.
   8. 대표만 할 일: add 쿠팡 파트너스·인화 업체 가입과 링크 주소 넣기 (OPS-RUNBOOK §10), 쿠팡 지정 문구 확인, R3 사업자 등록 결정, 11-10·12월 중순 지표 확인.
B. `src/data/print-links.ts` (Decisions 3-4) + unit tests.
C. `src/pages/id-photo/index.astro` block + one CSS class (Decision 6); reuse existing list/notice styles; smallest CSS add.
D. `scripts/lib/ui-font-chars.mjs` exclusion rule + its test.
E. `scripts/lib/usage.mjs`, `src/lib/ui/usage.ts`, `src/tools/id-photo/controller.ts` (Decisions 2, 7).
F. `usageSql` / `fetchUsage` / `shapeUsage` + `scripts/lib/admin-view.mjs` (Decision 8).
G. Privacy (Decision 9).
H. check-dist rules: (a) any `rel="sponsored` outside `id-photo/index.html` -> error; (b) in id-photo every sponsored link is preceded inside `.print-links` by the generic disclosure, and a `coupang` link requires `COUPANG_DISCLOSURE`; (c) sponsored links have `target="_blank"` and a label containing 「광고」. Fixture cases in `tests/unit/postbuild.test.ts`. If an existing external-link rule rejects `sponsored noopener`, extend it only for `a[data-out][rel^="sponsored"]`.
I. `scripts/ops/monetize.mjs` checklist (Decision 11).
J. `docs/OPS-RUNBOOK.md` §10 「인화 링크와 제휴 링크 켜기 (대표만)」: 쿠팡 파트너스 가입 -> 사이트 docttak.com 등록 -> 링크 만들기 (단축 링크 주소 복사) -> 지정 고지 문구가 `COUPANG_DISCLOSURE`와 같은지 확인 (다르면 알려 주기) -> Cloudflare Pages 환경 변수 `PUBLIC_AFF_COUPANG_URL` (same place and steps as `PUBLIC_USAGE_STATS` in §8) -> 다시 배포 -> 증명사진 저장 후 광고 문구와 링크 확인. Same for `PUBLIC_AFF_PRINT_URL` (인화 업체 제휴 프로그램이 있을 때). 끄기: 변수 지우고 재배포. 정보 링크 끄기: `PUBLIC_PRINT_INFO=0`. 수익 메모 (3.3%, 2만 원). Do not state Coupang approval thresholds (unverified).
K. BUILD-LOG entry + REVIEW-REQUEST with line ranges.
- Flag: real affiliate URLs are never committed (tests and fixtures use `https://example.com/...`).
- Flag: probe the Naver Map href once (`curl -sI`) and paste the status line in REVIEW-REQUEST; if it is not 200 (or a redirect to 200), stop and tell Arch before choosing another URL.
- Flag: raise no budget (precache 450, core font, per-chunk). If a gate fails, stop and report.

## Failure modes
| Path | Realistic failure | Handling | User sees |
|---|---|---|---|
| Affiliate env | Owner pastes a URL with spaces / http / quotes | Build fails naming the variable, URL not echoed | Failed deploy in Pages/CI log; no broken link ships |
| Affiliate env | Coupang's mandated wording differs from ours | Runbook comparison step; constant pinned by check-dist | One-line fix |
| Disclosure | A refactor drops it or moves it after the links | check-dist H(b) + postbuild fixtures | Build fails |
| Click beacon | Stats off / not sampled / sendBeacon throws | `track` no-op / existing try-catch | Link still opens; count lower by design |
| Click beacon | Unknown dest from a stale cached page | Server `validate` -> null (existing reject path) | Nothing |
| Admin | No `out` rows yet; 0 successes | Empty state like other tables; ratio `-` | Clear empty state |
| Fonts | Block text not covered by core subset | System-font class + exclusion; fontcover check | Build fails if mis-wired, never tofu |
| Precache | Block + listener push cloud precache over 450 KB | Gate fails -> stop and report (headroom 3.2 KB; expected add < 1 KB) | Build fails |
| External site | Naver Map URL scheme changes | Plain link; kill switch `PUBLIC_PRINT_INFO=0` | Map site page; nothing breaks here |
No silent and untested path remains.

## Test map
- print-links.ts: no env -> only photo-studio [GAP->unit]; `PUBLIC_PRINT_INFO=0` -> none, block not rendered [GAP->unit]; each affiliate on -> sponsored rel + 광고 label [GAP->unit]; coupang on -> COUPANG_DISCLOSURE present [GAP->unit]; invalid URLs (http, space, quote, >500, unparsable) -> throws [GAP->unit].
- usage.mjs validate: out valid for 3 dests; wrong t, missing o/v, unknown dest, out carrying g/dl -> null [GAP->unit]; existing events unchanged [TESTED, keep green].
- buildPayload(out) carries only e,t,o,v,via,d,b,w [GAP->unit].
- usageSql/shapeUsage: outs SQL, whitelist drop, sort + ties, ratio, zero-success `-`, events loop skips out [GAP->unit]; existing tables keep their order [regression, unit].
- admin-view: s-out section, note escaped [GAP->unit].
- check-dist H(a)(b)(c) pass/fail fixtures [GAP->postbuild unit].
- e2e `tests/e2e/id-photo.spec.ts` (5 browsers, axe on the result state): info link with exact href/rel/target; no sponsored link in the default build; click opens a popup (route the external host to a stub; no real network; no-upload fixture still passes) [GAP->e2e].
- e2e cloud usage spec: click info link -> exactly one beacon `{e:'out',t:'id-photo',o:'out',v:'photo-studio'}`, body contains no URL [GAP->e2e cloud].
- Privacy: stats build contains the new sentence and PRIVACY_OUT; non-stats build does not [GAP->unit/postbuild].
- monetize checklist strings [TESTED -> update].
- Regression: id-photo save / download / 이어서 하기 / share e2e [TESTED, stay green]; check:quotes, meta-length, licenses unchanged.

## Out of Scope (-> BUILD-LOG Known Gaps if it surfaces)
- Affiliate/info links on guide pages (guides have no usage tracker; revisit after first data).
- Embed widget (W), AdSense (R1), R3 paid option, sponsor slot: later sprints.
- R1 numeric thresholds in `scripts/ops/lib/report.mjs`.
- Any CSP, `_headers` or CLAUDE.md change.

## Acceptance
- REVENUE-MODEL.md has sections 0-8 as above; the "2026-11-10 하루 100회 미만" rule is gone; 25% is 기본; R3 = 증명사진 유료 옵션; 광고 제거 구독 is listed as 뺌.
- vitest all green; astro check 0 errors.
- Default build check-dist OK; core font bytes vs HEAD reported (block adds 0; privacy delta reported).
- Cloud build (CI env) check-dist OK, precache <= 450 KB (before/after; HEAD 446.8).
- Local cloud build with `PUBLIC_AFF_COUPANG_URL=https://example.com/aff PUBLIC_AFF_PRINT_URL=https://example.com/print`: check-dist OK, precache reported, disclosures before the links (paste the HTML snippet).
- e2e id-photo + cloud usage + polish + site, 5 projects, axe green.
- dist grep: no `rel="sponsored` outside id-photo; `<script` count unchanged vs HEAD.
