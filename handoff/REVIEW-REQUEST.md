# Review Request — C2-cloud round 2 (site-wide claims with the cloud flag on; Richard's Should Fix)
Date: 2026-10-05
Ready for Review: YES. Status **DONE**. Committed on `c2-cloud`, not pushed.
Worktree `C:\dev\doc-tools\c2`. Build notes: BUILD-LOG "C2-cloud round 2". Owner decisions of 2026-10-05 are logged there.

## Files Changed
- `src/data/og.json:5,14,17,26,30` — adds `cloudLine` for the home and default images, and `cloud.description` for `/`, `/privacy/` and `*` (the `*` entry covers 404 and offline). They follow the template "배경 지우기를 빼면 …".
- `src/data/site.ts:20-30` — `defaultDescription(tools, cloud = __BG_CLOUD__)`. Long form "배경 지우기를 빼면 파일은 밖으로 안 나가요. 무료."; when that would pass 120 characters, short form "배경 지우기 외엔 기기 안에서만.".
- `src/pages/index.astro:41,100,106,118-120` — cloud versions of the eyebrow, section title and FAQ answer. The bullet no longer says "아래 설명"; it explains itself.
- `src/pages/llms.txt.ts:8-12,20` — the cloud version of the claim.
- `src/tools/remove-background/bg.ts:421-423` — `finish()` hides any leftover notice before `done`. This fixes the quota line staying next to a device result when the engine was ready. `:623-624` is a comment only.
- `scripts/lib/bgcloud.mjs:44-85` — `CLAIM_RE`, `QUALIFIER_RE`, `claimText`, `unqualifiedClaims`, `LOCAL_SCOPE_RE`, `CLAIM_FILE_RE`.
- `scripts/check-dist.mjs:9,191-203` — cloud on: no unqualified claim in any html/txt/xml/json/webmanifest file outside the local scope. Cloud off: no cloud wording in any such file.
- `tests/unit/bgcloud.test.ts:14-17,398-442` — 5 tests: the detector, page text, scope, og.json texts and defaultDescription.
- `tests/unit/postbuild.test.ts:24,412-436` — a built-output test for both flag states, plus extra expectations in the cross-state check-dist test.
- `tests/e2e/remove-background.cloud.spec.ts:6,220-277` — a `stubModel` helper and the regression test "503 quota with the engine ready", which runs on cloud-chromium only.
- `tests/e2e/upload-guard.ts:1-2` — the header now points to the right unit test.
- `CLAUDE.md:14` — the cloud build shows the officer and contact on /privacy/ as the law requires, and site-wide claims name the exception.
- `docs/COPY.md:38,41-42` — the template and where it is used.

## Verified
- check: 0 errors, 0 warnings.
- Unit: 847 passed. postbuild also run with dist-bgcloud and with dist-bg swapped in as dist: 46/46 each.
- Three builds pass check-dist: off has 2,372 files; BG has 2,390; cloud has 2,391 (precache 436.1 / 450 KB, controller 13.8 / 14 KB, cloud client 1.3 / 3 KB).
- The flag-off and BG-only builds are byte-identical to 8b203f8 baselines. The only differences are deploy-manifest.json and, in the BG-only build, the remove-background entry chunk hash, which comes from the bg.ts fix.
- dist-bgcloud claim scan: 0 unqualified claims (it found 30 before this round).
- e2e:
  - chromium site + polish: 88 passed, 1 skipped.
  - bg-chromium: 6/6.
  - cloud-* in all five browsers: 46 passed, 4 skipped, no retries.
- The new quota e2e fails without the fix (`#bg-error` visible) and passes with it.

## Open Questions
- Scope rule (BUILD-LOG decision 1). The other tools' pages and the guide pages are skipped. Everywhere else, a claim needs the exception within 150 characters before it or 80 after. Is the window too loose? The hero lead relies on its footnote, which comes right after it.
- The home search description in the cloud build uses the short form "…HWP·HWPX 파일 보기. 배경 지우기 외엔 기기 안에서만." because of the 120-character cap. Is the wording acceptable?
- The `stubModel` copy in the cloud spec duplicates the device spec's helper. Moving it into a shared file was blocked (see Known Gaps).

## Out of Scope (logged in BUILD-LOG)
- "한 번 쓴 도구는 인터넷을 끊어도 동작합니다" (home) and "한 번 사용한 도구는 인터넷 없이도 열립니다" (offline). In the cloud build, 배경 지우기 needs the internet by default.
- Deduplicating the two `stubModel` helpers.
