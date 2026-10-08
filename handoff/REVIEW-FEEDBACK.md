# Review Feedback — GA4
Date: 2026-10-08
Ready for Builder: YES

## Must Fix
None.

## Should Fix
- src/pages/privacy/index.astro:84 (confidence: 7/10) — 국외 이전 "이전 항목: 위 '모으는 정보'와 같아요" omits the IP address. Line 80 itself says the region is "IP로 추정하며 IP 주소 자체는 ... 저장되지 않아요": the IP is still transmitted to Google LLC (US) with every hit; only storage is excluded. 제28조의8 asks for the items transferred, not the items stored. — Fix: `이전 항목: 위 '모으는 정보'와 IP 주소(지역 추정에만 쓰고 저장하지 않아요)`. Check the new glyphs against the core subset (GA-on only; GA-off unaffected).
- handoff/ARCHITECT-BRIEF-GA4.md owner step 2 / docs/COPY.md:94 (confidence: 5/10, verify this) — the policy promises "Google 애널리틱스에 2개월 보관 후 삭제". Current GA4 admin "데이터 보관" shows two settings, 이벤트 데이터 보관 and 사용자 데이터 보관; the owner step names only the first. — Fix: owner step and COPY.md bullet set both to 2개월 (if the property shows both). Aggregated standard reports are kept by Google regardless; they carry no identifiers, so the sentence stands.
- tests/e2e/ga.cloud.spec.ts (informational, confidence: 6/10) — the file-name assertion runs against GTAG_STUB, not real gtag.js, so it proves our loader/dataLayer never carry the name, not what real enhanced measurement would send (file_download link_text/link_url, form_interaction). This rests on owner step 4 (파일 다운로드·양식 상호작용 OFF). Keep owner step 5 explicit: after deploy, check Realtime shows only page_view/session events; log as a Known Gap line, no code change.

## Rulings on Bob's concerns
1. Upload-guard `ga` allowance — ACCEPTED. Scoped to cloud-* projects only (playwright.config.ts:84, option default false in no-upload.ts:43); only bodiless https GET to `www.googletagmanager.com/gtag/js` or `*.google-analytics.com` / `*.analytics.google.com` (leading-dot suffix match, no look-alikes); `*.google.com`, gtm.js, POST/body still fail; CSP must be exactly `'self'` + GA_CONNECT_SRC (SELF_AND_GA built from the same constant gen-headers uses). The privacy invariant (no file data off the device) is preserved: the hits that pass carry no body and the spec asserts the file name is absent from every Google URL. Both hosts are stubbed by route, no CI test reaches Google. Apply the CLAUDE.md addition Bob proposed.
2. GA-off font delta (+6 core glyphs, +312 B / +204 B per weight, +516 B preload) — ACCEPTED. Same precedent as the cloud and usage sections; HTML differs only in hashed names; check-dist/precache budgets pass (default precache 421.0 KB). The brief's "identical to U1 HEAD" is met in behaviour (no tag, no ga.js, CSP and policy unchanged, no googletagmanager anywhere in dist). Note it in BUILD-LOG as the accepted deviation.
3. Google contact link — ACCEPTED: the general_privacy_form is what policies.google.com/privacy links as the privacy contact and satisfies "연락처" under 제28조의8. Optional, not required: also name `googlekrsupport@google.com`.
4. Section 1 heading — see Escalate.

## Escalate to Architect
- privacy/index.astro:39 heading "1. 받는 개인정보가 없어요" — with GA on, the same page discloses a 국외 이전 of 개인정보 under 제28조의8 (cookie IDs, IP). The heading then contradicts the body. Proposed: GA_ON-conditional heading `1. 이름·연락처는 받지 않아요` (all glyphs already in the section, so no font change; GA-off build stays byte-identical). This is policy copy, so Arch decides; I recommend it lands before the deploy gate.

## Cleared
GA-off path (no tag, no dist/ga.js, CSP untouched, dist-wide googletagmanager refusal), GA-on path (ID validated at gen-ga and check-dist, loaderSource exact-match, /ga.js defer in head before every body module script so loc is captured before quicklinks' replaceState, gtag.js on load+idle, page_view only, both signal flags false, cookie 395 d, CSP widened only by the brief's hosts and only when on, /ga.js no-cache and never precached, SW route() default for /ga.js and Google, /admin/ untouched, ops health first-party), privacy numbering for all flag combinations, legal dates, and tests were reviewed and pass.
