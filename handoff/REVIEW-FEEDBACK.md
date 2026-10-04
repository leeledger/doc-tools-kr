# Review Feedback — C2-cloud build (배경 지우기 via Cloudflare), c2-cloud @ 9361850 + uncommitted tree
Date: 2026-10-03
Ready for Builder: YES. No Must Fix items. Two copy items go to Arch before the flag goes on in production (see Escalate).

## Must Fix
None.

## Should Fix
- tests/e2e/upload-guard.ts:1 (confidence: 9/10). The header says "tests/unit/upload-guard covers it", but the tests are in `tests/unit/bgcloud.test.ts` ("no-upload allowlist"). Fix the pointer.
- src/tools/remove-background/bg.ts `cloudFail` quota branch (confidence: 6/10, verify). `showError(CLOUD.quota, false)` stays on screen while `onDevice` goes on to consent, or straight to `working` when the engine is cached. Check that the quota notice is cleared, or still makes sense, once the device result shows (`done`). The e2e covers only the consent branch.
- scripts/lib/bgcloud.mjs `EXCEPTION_RE` scope (confidence: 7/10, informational). It catches only the approved phrasings, and only in HTML pages. A paraphrase such as "사진을 잠깐 보내…" or "Cloudflare로 보내…" without "(미국 회사)", or anything in .txt/.json, would get through the flag-off check. The flag-off guarantee really comes from `__BG_CLOUD__` dead-code removal plus the `/api/remove-bg` grep, and I verified that on a real build (below). So this is acceptable as is. Please widen the check when llms.txt lands (see Escalate 2).

## Escalate to Architect
1. **Site-wide "nothing leaves" claims stay on with the cloud flag on.** The cloud build (verified in dist) still says:
   - home `<meta name="description">` / og: "… ·사진 배경 지우기 (누끼)·… 파일은 밖으로 안 나가요. 무료." This names 배경 지우기 and then says nothing leaves, with no footnote. It is the search snippet.
   - 404 and offline pages: "파일은 내 폰·PC 밖으로 안 나가요".
   - home eyebrow and section title (Bob's Open Question 4).

   §7.2 did not list these, and changing them is a copy decision. They do not block merging with the flag off. Before PUBLIC_BG_CLOUD=1 goes to production, Arch and the owner should decide the cloud variant (og.json `"/"` `cloud.description`, as was done for `/remove-background/`).
2. **Merge interaction with the Growth work in the main checkout.** That work is uncommitted on `main` in C:\dev\doc-tools-kr and adds `src/pages/llms.txt.ts`, which says "파일은 내 폰·컴퓨터 안에서만 처리되고 밖으로 보내지 않아요" and lists LIVE_TOOLS. With cloud on and BG on, that becomes false for 배경 지우기, and check-dist's exception scan ignores .txt. These files are modified both there and here: astro.config.mjs, scripts/check-dist.mjs, scripts/gen-brand.mjs, src/data/{legal.ts,og.json,tools.ts}, src/pages/index.astro, src/pages/sitemap.xml.ts, docs/COPY.md, tests/unit/postbuild.test.ts, handoff/BUILD-LOG.md. Whichever lands second needs a hand merge. Re-run both flag-state builds after it.
3. **"약 110 MB" vs the approved "약 100 MB"** (§7.1 거부 item, §7.3 notice). Bob uses the build's real size (BUILD-LOG decision, line ~1829). That is more accurate, but it is not the literal approved text. The owner should acknowledge it. The extra `이용 목적: 사진의 배경 지우기` line (Open Question 2) is needed by statute and sits inside the 국외 이전 list. I see no issue with it; the owner should confirm it.

## Verified (re-run by Richard, 2026-10-03, in C:\dev\doc-tools\c2)
- `npm run check`: 0 errors, 0 warnings. `vitest run`: 45 files, 841 passed.
- Build `PUBLIC_BG_REMOVE=1` (cloud off): check-dist OK.
  - Grepped dist for `remove-bg`, `docttak-bg-mode`, `bg-send`, `Cloudflare(미국`, `보내지 않고 기기에서`. Hits are only the old site copy (privacy hosting section, the other tools' "보내지 않고", a comment in `_redirects`).
  - No cloud chunk, no cloud copy.
- Build cloud on without the officer and email: stops with both gate messages.
- Build cloud on with 이종림 / robotncoding@kakao.com: check-dist OK, cloud client 1.3 / 3 KB, precache 435.8 / 450 KB.
- Privacy page text extracted from dist: matches §7.1 item by item. The U1 caveat is used in place of "Cloudflare 즉시 삭제". The officer section and change log are present, and the section numbering is right.
- The home footnote and bullet, the terms sentence, the notice with the `/privacy/#bg` link, and the FAQ match §7.2/§7.3.
- Privacy path in code:
  - `makeCopy`: capSize ≤ 1024 on a canvas. It refuses APP1/EXIF/XMP/GPS, empty or > 2 MB output, and sends exactly the checked bytes.
  - `requestCutout`: one fetch, `credentials:'omit'`, `no-store`, `redirect:'error'`, 30 s timeout, no retry loop.
  - POSTs happen only from the `bg-send` and `bg-retry` click handlers. A pick goes to `ready` and only prefetches the module. Quota falls to `onDevice` with no second request.
  - `release()` aborts in-flight sends, and every await in `sendCloud` is followed by a `my !== run` guard.
  - The e2e checks the body is a ≤ 1024 px JPEG with no APP1, including the GPS/orientation-6 fixture, and that it is sent exactly once per press.
- Allowlist: an exact method + same origin + exact pathname, with no query or fragment. The default is `[]` and only the cloud spec sets it. The unit cases (a), (b) and (c) cover the query, trailing slash, other path, PUT and other origin. The CSP check is skipped only for the allowed response.
- SW: `route()` returns `default` for non-GET and for `/api/*` before anything else (src/sw/sw.ts:45-48). This is unit-tested.
- Function: 405 / 403 (Sec-Fetch-Site) / 413 / 415 run before the binding. It answers 503 without `BG` and 502 when the binding throws, with no request data in answers and no-store headers.
  - `public/_routes.json` limits Functions to `/api/*`, so production static traffic does not count against Workers.
- **Worker: no redeploy needed.** `git diff HEAD -- workers/` is empty, and the last change to `workers/bg` is 575d98b, the spike-2 commit whose deploy is logged (version 7fc58a4c). Before production, the owner can confirm with `wrangler versions view` that 7fc58a4c was deployed from 575d98b.
- Merge base: `git ls-remote origin refs/heads/main` = 18e5827, an ancestor of c2-cloud HEAD (13 commits ahead). c2-cloud would fast-forward over origin/main as of today. The real merge risk is the uncommitted Growth work (Escalate 2).

## Cleared
I reviewed the Function, the flag and privacy gate, check-dist, the cloud client and mode store, the bg.ts and model.ts state flow, the legal and page copy, the upload guard, the SW and the tests, and re-ran check, unit and both flag-state builds. Nothing blocks. C2-cloud is clear for commit and a flag-off merge. Turning the flag on in production waits on Escalate 1–3.
