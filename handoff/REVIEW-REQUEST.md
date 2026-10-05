# Review Request — C2-cloud round 3 (offline claim, smoke-assets ORT names)
Date: 2026-10-05
Ready for Review: YES. Status **DONE**. Committed on `c2-cloud`, not pushed. Round 2's request is in git history (167746a). Build notes: BUILD-LOG "C2-cloud round 3".

## Files Changed
- `src/pages/index.astro:108` — the cloud version of "한 번 쓴 도구는 인터넷을 끊어도 동작합니다" names 배경 지우기.
- `src/pages/offline/index.astro:13` — the cloud version of "한 번 사용한 도구는 인터넷 없이도 열립니다".
- `scripts/lib/bgcloud.mjs:45-51` — `CLAIM_RE` also matches "인터넷을 끊어도" and "인터넷 없이도".
- `scripts/smoke-assets.mjs:13-25,102` — `NOT_FILES`: three exact ORT 1.30.0 paths, each with the reason it is not a file. The queue skips them.
- `tests/unit/bgcloud.test.ts:408-413` — offline claims are flagged, the qualified version passes, and "인터넷 없이 열 수 없습니다" is not caught.
- `tests/unit/postbuild.test.ts` (smoke-assets describe) — `site(extra)`, plus a test that the three names are skipped and a fourth missing name fails.

## Verified
- check is clean. Unit: 848 passed. postbuild against the cloud build: 47/47.
- The three builds pass check-dist. Flag-off and BG-only text is unchanged.
- smoke-assets on a locally served dist-bg: FAIL with exactly the 3 names before the change, OK after.
- e2e: chromium site + polish 88 passed / 1 skipped; bg-chromium 6/6.

## Open Questions
- The ORT version is in the three paths on purpose, so an upgrade fails smoke until someone lists the new names. Is that what you want?
