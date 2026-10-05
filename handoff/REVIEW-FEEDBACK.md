# Review Feedback — C2-cloud rounds 2 and 3, c2-cloud 8b203f8..3077394 (f1a81f5, 167746a, 3077394)
Date: 2026-10-05
Ready for Builder: YES. **Clear.** No Must Fix items. Two copy items go to Arch and the owner (see Escalate). Neither blocks the push, but the push to main ships them live.

## Must Fix
None.

## Should Fix
- src/pages/index.astro:102 (confidence: 7/10). The cloud build keeps "주민등록번호가 담긴 서류, 계약서, **증명사진**도 다른 곳을 거치지 않습니다." BUILD-LOG round 2 says "those files never go through 배경 지우기". That is not so: the 배경 지우기 page offers 흰색·파란색 backgrounds, and an ID photo is the obvious photo to put through it. The section heading directly above ("배경 지우기를 빼면 …") qualifies the sentence, so check-dist passes it, and it is not false as read in context. Still, it is the one place where the claim names the exact kind of photo that does get sent. Fix: in the cloud variant, drop "증명사진" from the list, or add "(배경 지우기 제외)". This is a copy change, so put it to Arch with Escalate 1.
- Informational, no code change. /brand/og-home.png and og-default.png keep their URLs, and `/brand/*` is cached for `max-age=86400`. Kakao, Facebook and similar crawlers also keep their own copies. For a while after the push, shared links may still show the old "무료, 내 폰·PC 안에서만" image. The owner can refresh the main URLs in the Kakao and Facebook share debuggers after the deploy.

## Escalate to Architect
1. **Home search description (cloud build, exactly 120 characters).** This is what Google shows for the home page:
   `PDF 합치기·…·사진 배경 지우기 (누끼)·HWP PDF 변환·HWP·HWPX 파일 보기. 배경 지우기 외엔 기기 안에서만.`
   It reads badly:
   - "배경 지우기" appears twice in a row;
   - the sentence is clipped, with no subject or verb ending, unlike the 해요체 everywhere else;
   - "기기" is not the plain "내 폰·PC" from COPY.md;
   - "무료" is gone.

   The 120-character cap leaves 20 characters after the tool names. One honest option is to drop the claim from this one string in the cloud build: `… 파일 보기. 무료, 가입 없이.` The og and twitter descriptions already carry the full template. The owner should pick.
2. The 증명사진 sentence above (Should Fix 1).
3. Bob's open question: the ORT version in the `NOT_FILES` paths. I agree with failing loud. An ORT upgrade makes smoke-assets fail until someone lists the new names, and that is the safe direction. Arch should confirm.

## Verified (re-run by Richard, 2026-10-05, in C:\dev\doc-tools\c2)
- **Gates**
  - `npm run check`: 0 errors, 0 warnings, 1 old hint. The first run crashed out of memory with five extra dist copies in the tree; it was clean once they were removed.
  - `vitest run` with the cloud build as `dist`: 45 files, 848 passed.
- **Builds** (`PUBLIC_SITE_URL=https://docttak.com`), each with check-dist OK:
  - 8b203f8 off and BG;
  - HEAD off: 2,372 files, 431.0 KB precache;
  - HEAD BG: 2,390 files, 434.8 KB;
  - HEAD BG+cloud with 이종림 / robotncoding@kakao.com: 2,391 files, 436.2 / 450 KB.
- **Check 2, flag off is byte-identical.** I compared every file between baseline and HEAD, with the build id (8b203f8e6ae3 vs 307739415870) and chunk hashes normalised.
  - Off: only `deploy-manifest.json` differs.
  - BG on, cloud off (what production runs today): `deploy-manifest.json`, plus the `bg.*.js` chunk and its importer, which are renamed. The bg chunk grows by 5 bytes, which is the `hideError()` call in `finish()`.
  - No HTML, txt, xml, json or PNG differs.
- **Check 1, no unqualified claims in the cloud build.** I wrote my own scan, broader than CLAIM_RE: it adds 보내지 않 / 기기 안에서 / 거치지 않 / 오프라인 / 비행기 모드 / 인터넷 없이, plus English. I ran it over the 57 non-local html/txt/xml/json/webmanifest files.
  - All hits but three are qualified. The three are privacy "거부 방법" and the 배경 지우기 page "(보내지 않고 처리하기도 가능)", which describe the opt-out and are not claims.
  - The 404, offline, privacy, terms, guide hub and licenses pages and llms.txt are covered, and so are the meta, og and twitter text, JSON-LD and the manifest.
  - The og-home and og-default PNGs read "무료, 가입 없이" in the cloud build; I viewed og-home. og-remove-background differs as expected. The tool images are unchanged.
  - Exemptions re-checked:
    - The other tools' pages and `guide/<slug>/`: I read all 29 claim lines in src/content (guides and hubs). Each claim is about the tool named in that paragraph (id-photo, photo-compress, pdf-*, hwp-*, stamp).
    - No guide or hub mentions 배경 지우기 / remove-background / 누끼.
    - No layout, component or client UI string (src/lib/ui) carries a claim, so nothing site-wide hides inside an exempt file.
    - `guide/index.html` is not exempt and is scanned.
- **Check 3, quota notice.** `finish()` calls `hideError()` before `done`. It is a success-only path, so no real error is lost. The e2e drives the "engine already live" branch, which is the one that lingered, and Bob proved it red without the line. I did not re-run e2e.
- **Check 4, smoke-assets.** The ORT bundles in dist reference exactly `"module"`, `"worker_threads"`, `ort-wasm-simd-threaded.asyncify.wasm` (shipped as .part0/.part1 and handed over as `wasmBinary`, infer-core.ts:124), `ort-wasm-simd-threaded.wasm` (shipped, still checked), and the two `.mjs` files (shipped).
  - The skip set is the three non-files and nothing more. It matches on pathname, exactly.
  - The unit test proves that a fourth missing name still fails.
- **Check 5, copy.** The new lines are plain 해요체 or 합니다체, matching their neighbours. The brand is 문서딱 throughout. The only item is the 120-character description (Escalate 1).
- **Check 6, production path.**
  - Function: `functions/api/remove-bg.ts` is already live from 8b203f8. GET answers 405 and a cross-site POST answers `{"error":"origin"}` 403, both probed on docttak.com without sending a photo. Neither the Function nor the Worker changed in this diff.
  - `_routes.json` covers `/api/*` only.
  - CSP `connect-src 'self'` covers the same-origin POST.
  - SW passes `/api/*` and non-GET straight through (round 1, unchanged).
  - The BG binding takes effect with the next deployment, which is the push itself.
  - After the deploy, the owner should process one photo on docttak.com/remove-background/ and confirm it is answered by the Worker, not the 503 "engine" fallback. That proves the binding on the Production environment, which I cannot see from here.

## Cleared
I reviewed rounds 2 and 3: the site-wide claim variants, the check-dist claim scan and its scope, llms.txt, the og texts and images, the quota-notice fix, and the smoke-assets skip list. I re-ran check, unit and five builds, ran my own wider claim scan and a byte-for-byte comparison against 8b203f8. Nothing blocks. C2-cloud is clear to push. The two copy items in Escalate 1–2 are the owner's call, preferably before the push.

Note: the `dist` folder in this worktree now holds the BG+cloud build. Bob's earlier flag-off `dist` was overwritten. `dist-bg` and `dist-bgcloud` were not touched.
