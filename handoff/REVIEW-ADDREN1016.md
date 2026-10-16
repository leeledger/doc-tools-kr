# Review Feedback — ADDREN1016 A1 + A2 (영문주소 변환기, /api/addr-en)
Date: 2026-10-16
Reviewer: Richard
Range: f3e423b..674a249 (branch addr-en-1016)
Ready for Builder: YES
Verdict: **CLEAR** (no Must Fix)

Verified myself: `npm run check` 0 errors / 0 warnings; vitest addren-* + usage + network-guard + bgcloud 7 files / 361 passed;
`check-dist` on the flag-off `dist` OK (2,518 files); on `dist-bgcloud` with the CI cloud env no ADDR error (the one failure,
`_headers` embed policy, comes from running check-dist after gen-headers on a finished dist, not from this step);
flag on without officer/contact gives both gate errors. grep of the flag-off dist for english-address / addr-en / 영문주소 /
행정안전부 주소: nothing.

## Must Fix
None.

## Should Fix
- functions/api/addr-en.ts:131-138 (confidence 8) — createLimiter only drops a key when that IP starts a new window or the
  Map passes 5,000 keys (seen.delete(key); while (seen.size >= maxKeys) ...). The IP of a visitor stays in isolate memory
  long after the 60 s window, which is longer than the policy implies. Fix: on each hit, drop the leading entries whose
  start is older than windowMs (the Map is already ordered by window start), so no IP is held more than 60 s. Add one
  unit case.
- src/pages/privacy/index.astro:44 (confidence 7) — the heading is GA_ON ? 「1. 이름·연락처는 받지 않아요」 : 「1. 받는
  개인정보가 없어요」. In a build with addr on and GA off (the CI checks build today), section 1 says no personal data is
  received, and section #addr then describes sending an address. Production has GA on, so the public page is fine. Fix:
  use the 이름·연락처 heading when GA_ON or addr is on (the bg cloud case has the same gap and could share the fix).
- src/tools/english-address/controller.ts:183-188 (confidence 7) — 「더 보기」 re-renders the whole list with
  results.replaceChildren(...). The focused button is destroyed, so keyboard and screen-reader users drop to body, and
  the card marked data-picked loses the mark. Fix: append the new cards to the existing ol (or move focus to the first
  new card) and keep the picked mark.
- src/tools/english-address/controller.ts:91-95 (confidence 6, verify) — the download event is tracked even when
  copyText returned manual, meaning nothing was copied. The /admin/ copy count is then inflated in exactly the in-app
  browsers the fallback exists for. Track only copied, or accept and log.
- src/sw/sw.ts:22 (trivial) — the comment points to FLAGGED_RUNTIME_PAGES, but the function is flaggedRuntimePages.

## Escalate to Architect
- Legal form of the 행정안전부 hop. /privacy/#addr lists 행정안전부 주소정보누리집 under 「처리하는 곳」, next to Cloudflare
  (전달). 행정안전부 answers the query in its own service, so legally this may be a 제3자 제공 (or simply a request by the
  user to a public service) rather than a 처리위탁. The policy also says nothing about the query logs kept by 행정안전부,
  or the IP held briefly for the limit. This is a legal wording decision, not code.
- Terms 9항 (7-day notice). The 6항 sentence (the 상세주소 conversion is a guide) is a liability-style addition and takes
  effect on the PRIVACY_ADDR day with no 7-day posting. The page-top 시행일 also stays TERMS_EFFECTIVE (this follows the
  TERMS_EMBED precedent). Arch should confirm that this is not a change against the user (30 days), or set the effective
  date to the O4 day + 7.
- PRIVACY_ADDR / PRIVACY_TERMS_UPDATED (2026-10-16) must be reset to the real O4 day before the production flag goes
  on. The comment says so; put it in the O4 checklist in CLOUD-HANDOFF so it is not missed.

## Answers to the request
- Q1, the sw.js reconstruction: sound. check-dist calls the same buildServiceWorker(dist, env), and env comes from the
  same publicEnv() that gen-sw uses later in postbuild. The path enters sw.js only through the __RUNTIME_EXTRA__ header,
  because sw.ts is transpiled with removeComments. A hard-coded /english-address/ in sw.ts would therefore be caught in
  a flag-off build. Limit: it checks the generator, not the written file, since gen-sw runs after check-dist. The output
  is deterministic from (dist, env), and carry-assets in between does not touch it, so this is acceptable. Keep it as
  built (brief d20); dropping the page from RUNTIME_PAGES would also be valid, but there is no reason to reopen d20.
- Q2, timeout folded into upstream: fine. The Function still answers 504 timeout, so a later split touches only
  messages.ts failCode. FAIL_LABELS.upstream 「…·시간 초과」 says so honestly.
- Q3, the 8-spawn postbuild test at 111 s of 120 s: not this step. Log it as a Known Gap (flaky on Windows under the
  full suite) for a later step: split it, or share one check-dist run.

## Cleared
- Function security and privacy: flag gate, then key gate, POST only, same origin (Sec-Fetch-Site, else Origin),
  Content-Length, JSON type, body capped at 512 B while reading, validate (NFC, controls and the symbols % = < > [ ]
  stripped, 2-80 code points, page 1..5), per-IP 20/60 s, then the upstream POST form with a 5 s AbortSignal.timeout
  (it also covers the body read). Error codes are whitelisted ({error} only, never the upstream message). Items are
  whitelisted (at most 10, at most 200 chars). Every answer carries no-store, CDN no-store, noindex and nosniff. There is
  no ACAO header, so a cross-origin read is blocked. The key appears only in the upstream form body. There is no console
  call and no storage. check-dist fails if JUSO_EN_KEY (its name or its value) or juso.go.kr/addrlink appears in any
  dist file.
- Flag-off guarantee: no route (injectRoute only when on), no tools/menu/home/sitemap/llms/OG entry, and no
  /api/addr-en, 「영문주소 변환기」 or outbound phrase in any text file. sw.js does not name the page. Late-font +8 glyphs
  accepted as decided; the core faces are byte-identical. The Function answers 404 off in production until O4.
- Legal gate: astro.config and check-dist fail without the officer and a valid contact. /privacy/ numbering through n()
  is correct with and without cloud. The officer section shows when cloud or addr is on. The #addr section, section 1
  pointer, change log and terms 2항/6항 are present only when on. The outbound phrase is on exactly 3 pages (check-dist).
- CLAUDE.md: the d16 sentence, the gate clause, the tool list and the Functions list are accurate and minimal.
- usage.mjs: only DOWNLOAD_SETTING english-address = field plus ADDR_FIELDS, SETTINGS.field and the labels. No general
  o/v widening: validate lines 263-264 still reject field on other events and tools. The client sends o/v only for that
  pair. Fail codes no-result/query/busy/engine/upstream/unknown each have a label.
- e2e english-address.cloud.spec: allowUpload scoped to that spec. The request body is exactly {q,page}. The URL and
  storage stay empty. Every error code has its message and its fail beacon. Also covered: offline, non-JSON, length
  pre-check (no request), needsManual, Sejong, fallback, clipboard denied, axe at 360 px, no late face before
  interaction. network-guard pins the one fetch and its single importer.
- CI: the checks build gets ADDR plus officer/contact; the cloud build gets ADDR; the default e2e builds stay off.
- Copy: brand 문서딱. No 업로드/서버/브라우저/네트워크/API in the Korean copy, and no 「보내지 않아요」 claim on the tool page.
  The glyph rephrasings and the link text are logged in docs/COPY.md.

## Rebase onto main 222cfb2 (semantic check)
No semantic conflict. Main adds the passport-english-name guide check in check-dist (a separate block), a lighthouserc
URL (adjacent line: textual conflict only, keep both) and the english-name FAQ link in tools.ts (a different tool). The
new guide does not mention 영문주소, english-address or the outbound phrase, so the flag-off check stays green. After the
rebase, rerun check-dist on default + cloud and log precache: the cloud build is at 440.8 / 450 KB.

---

# Round 2 — re-review (ae24c24..HEAD, new work in 92da353)
Date: 2026-10-16
Ready for Builder: YES
Verdict: **CLEAR** (no Must Fix)

Rebase: git diff 674a249 6e24198 (outside handoff/) holds only the main 222cfb2 changes (guide passport-english-name,
check-dist guide block, lighthouserc, tools.ts english-name link). No ADDR code was changed by the rebase.
Verified: npm run check 0 errors / 0 warnings; vitest addren-* + usage + network-guard 303 passed.

## Round-1 should-fix items
1. Limiter (functions/api/addr-en.ts): every call first drops the leading entries whose window has expired. The Map is
   ordered by window start, because a renewed window is deleted and set again. The loop stops at the first live entry.
   Correct, and covered by a unit case. Fixed.
2. /privacy/ section 1 heading uses 이름·연락처 when GA is on or something is sent. The meta and og descriptions follow
   (description about 64 chars; Base.astro ogDescription prop exists at line 29/53). check-dist guards both. Fixed.
3. 더 보기 now appends to the existing list, keeps the picked mark and the split card, and moves focus to the first new
   card (tabIndex -1 plus a CSS focus ring). Keyboard e2e added. Fixed.
4. A download is counted only when the copy reaches the clipboard. e2e checks that the manual fallback sends no beacon.
   Fixed.
5. sw.ts comment fixed.

The legal copy follows the acting-Arch decision: 처리 위탁, address text only, the link to juso /Privacy for the
records 행정안전부 keeps, and the IP sentence. The O4 checklist in CLOUD-HANDOFF sets PRIVACY_ADDR and
PRIVACY_TERMS_UPDATED to the real flag-on day before the flag goes on.

## Builder questions
- Q1, 「1분 정도만 잠시 기억해 두고」: not exact. Pruning runs only when the next request reaches the same isolate. An
  entry in an isolate that gets no more traffic stays in memory until that isolate is recycled, and Cloudflare publishes
  no time for that. It is volatile memory, never written anywhere, so the substance (not stored or recorded) is true;
  only the time promise is too strong. **Should Fix** (src/pages/privacy/index.astro, 처리와 보관 line; confidence 8):
  say what the IP is used for, not how long memory holds it. For example: 「너무 많은 요청을 막으려고 접속한 IP 주소로
  1분 동안의 요청 수만 세고, 기록하거나 저장하지 않아요.」 If the wording changes, update the e2e privacy assertion
  too. Fix it before O4 (the section ships only with the flag on), so it does not block the merge with the flag off.
- Q2, the meta change on a cloud-only production build: fine, and better than before. Live check (curl
  https://docttak.com/privacy/ on 2026-10-16): **production is a cloud build.** It has section 3 「배경 지우기에서 사진을
  보내는 경우」, GA in section 5 and the officer in section 8. Production also already shows 「1. 이름·연락처는 받지
  않아요」 (GA on). It now says description 「…회원가입이 없고 개인정보를 받지 않아요. 고른 파일을 어떻게 다루는지 알려
  드려요.」 and the same in og:description. That contradicts sections 3 and 5 (a photo is sent; GA cookies). After the
  merge it will say 「회원가입이 없고 이름·연락처를 받지 않아요. 보내는 것과 다루는 방법을 알려 드려요.」, which is accurate
  for production.

## What the flag-off merge changes in production (cloud + GA + usage, PUBLIC_ADDR_EN unset)
- /privacy/ meta description and og:description: the corrected wording above (intended). The section 1 heading is
  unchanged (GA on already). No #addr section. 시행일 and sitemap lastmod are unchanged (PRIVACY_REVISED and
  PRIVACY_TERMS_UPDATED move only with the flag).
- The late UI font faces gain +8 glyphs, so CSS, HTML, deploy-manifest and sw.js hashes change (accepted in round 1).
  sw.js does not name /english-address/.
- functions/api/addr-en.ts is deployed but answers 404 off before reading anything.
- Nothing else: no route, no tool entry, no JS chunk, no visible copy outside /privacy/ meta.

## Should Fix (new, non-blocking)
- Q1 wording above (before O4).
- scripts/check-dist.mjs, privacy block (confidence 5, not a production case): a build with GA on and nothing sent still
  gets the description 「개인정보를 받지 않아요」 while section 1 says 이름·연락처. Production is not this combination. Consider
  using the 이름·연락처 description whenever GA is on, too. Optional.

## Cleared
Round-2 fixes 1-5, the legal copy rework, the flag-dependent privacy heading and descriptions, and the clean rebase onto
222cfb2 were reviewed and pass. The production delta of the flag-off merge is limited to the intended /privacy/
description fix and the accepted font/hash changes.
