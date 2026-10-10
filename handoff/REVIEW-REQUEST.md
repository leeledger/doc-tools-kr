# Review Request — CHAIN X1 (core + receivers + jpg-to-pdf / pdf-compress senders), round 2
Date: 2026-10-11
Ready for Review: YES
Status: DONE

## Round 3 (Richard's Should Fix + the orchestrator's decision; REVIEW-FEEDBACK round 2)
- SF1 — src/tools/photo-compress/controller.ts (unsupported branch): when a photo is waiting, take it and drop it (dynamic import, `takeHandoff`); otherwise run the flag sweep.
- Lingering files (keeps F4):
  - src/lib/ui/handoff-marker.ts: `SWEEP_FLAG` ('docttak:handoff-sweep', value '1'), `siteStorage()`, `sweepDue()` (synchronous).
  - src/lib/ui/handoff.ts:
    - `sendTo` sets the flag after the put.
    - `sweepLingering()` deletes records older than 10 minutes and clears the flag when `count()` is 0. It never throws, and `takeHandoff` ends with it.
    - `HandoffStore` gains `count`.
  - The six receivers (four entry.ts, pdf-compress and photo-compress controllers): `else if (sweepDue())` → lazy `sweepLingering()`. With no marker and no flag, nothing loads.
- Privacy sentence (src/pages/privacy/index.astro:43) gains 「다음 도구가 열리지 않았다면, 10분이 지난 뒤 이어서 하기를 쓰는 도구를 다시 열 때 지워져요.」, all in core glyphs (core 605/38 unchanged). X2 must add the flag check to every new sender page, or "이어서 하기를 쓰는 도구" stops being true (logged).
- SF3 — handoff.ts:
  - `isBlobRefusal(err)`: DataCloneError, or the WebKit UnknownError "Error preparing Blob/File data…" (seen with a diagnostic) is the only case that retries with bytes. `run` rejects with the request's error.
  - `get` returns the raw bytes; `recordBytes()` uses them without an extra Blob (tag check, works across realms).
- SF4 — BUILD-LOG notes that `next` counts button presses, including failed stores.
- SF5 — tests/unit/handoff.test.ts: +8 tests (pure helpers, stored bytes → File, flag lifecycle). No fake-indexeddb (not a dependency); `idbStore` remains e2e-only.
- tests/e2e/chain.spec.ts: +2 tests.
  - A lingering fresh record survives a receiver visit with the flag; an old one is swept; the flag clears once the store is empty.
  - photo-compress in an unsupported browser drops a waiting photo.
- BUILD-LOG: the "at most 10 min" claims are corrected to the real behaviour.
- Verification:
  - vitest 1,377/1,377; astro check 0 errors; default build check-dist OK (precache 438.5 KB / 450, core font unchanged).
  - chain + polish + site × chromium / mobile-chrome / firefox / webkit: 527 passed, 17 skipped, 3 Firefox flaky. 1 Firefox site.spec goto timeout + worker crash; site.spec on Firefox re-run 73/73.

## Round 2 (orchestrator decisions on the three open items)
1. Kept: pdf-password opens a handed-over file in 암호 걸기. Tested in tests/e2e/chain.spec.ts (pdf-compress → pdf-password: `data-action="lock"`, state ask, lock, download parsed with the password).
2. Privacy, 해요체 + date + usage item:
   - src/pages/privacy/index.astro:43 — 「이어서 하기를 누르면 파일이 내 폰·컴퓨터 안에 잠시 저장되고, 다음 도구가 열리면 바로 지워져요.」
   - src/pages/privacy/index.astro:103 — the usage-statistics 「보내는 것」 list (shown only with usage statistics on) gains 「이어서 하기(보낸 도구·받을 도구 이름)」. The first wording 「…를 눌렀을 때…」 added 눌·렀 to the core font, so it was reworded to characters already in core.
   - src/pages/privacy/index.astro:117 — history line 「2026년 10월 11일: 이어서 하기(파일을 다음 도구로 넘기기) 내용을 더함」 in every build.
   - src/data/legal.ts — `PRIVACY_CHAIN = '2026년 10월 11일'`. `PRIVACY_REVISED = PRIVACY_CHAIN`, because the feature has no flag and is newer than every flagged section; the unused ANALYTICS_ON import was removed. `PRIVACY_TERMS_UPDATED = '2026-10-11'`: the sitemap lastmod for /privacy/ and /terms/ is one shared constant, as with GA before.
   - Tests updated: tests/unit/ga.test.ts (GA-on 시행일 and sitemap lastmod), tests/e2e/ga.cloud.spec.ts and tests/e2e/usage.spec.ts (시행일 = PRIVACY_CHAIN; usage item present), tests/e2e/polish.spec.ts (default build: sentence, history line, 시행일, no usage item).
   - docs/COPY.md updated to match.
3. Kept: handoff.ts is lazy-loaded.

Round 2 verification:
- vitest 1,369/1,369; astro check 0 errors.
- Default build check-dist OK. Core font 605 / late 38, unchanged from HEAD. Precache 437.6 KB / 450.
- polish + chain + site e2e on chromium + mobile-chrome: 265 passed, 5 skipped, 0 failed.
- Cloud build check-dist OK. usage.spec / ga.cloud.spec privacy + CHAIN tests on cloud-chromium + cloud-mobile-chrome: 6 passed.

## Round 1

Brief: `handoff/ARCHITECT-BRIEF-CHAIN.md` § X1. X2 senders not started.

## Files Changed
- src/lib/ui/handoff-marker.ts:1-53 (new) — the synchronous part: `HANDOFF_KEY`, read/remove the marker, `pendingHandoff(slug)` (a marker for another tool or a malformed one is removed). Receivers import only this, so a normal visit loads no IndexedDB code (F4; an e2e test checks that no handoff chunk is requested).
- src/lib/ui/handoff.ts:1-214 (new) — `HandoffStore {put,get,delete,sweep}` and the real `idbStore` (db `docttak-handoff`, store `files`, keyPath `key`, opened and closed on each call); `takeHandoff` (remove marker → get → read bytes → delete → sweep → File); `sendTo` (sweep → put → marker → `go('/<to>/')`; if the marker can't be set, the record is deleted); `receiveHandoff` (take → the tool's pick path → notice `방금 만든 파일을 가져왔습니다.` + polite status. No notice when the tool's alert is showing or deliver returns false. Failure → alert, or the page's `fail` callback). F3 fallback in `idbStore.put/get`: store an ArrayBuffer when putting the Blob fails.
- src/lib/ui/next-steps.ts:1-132 (new) — flow table in the brief's order (the remove-background row exists only under `__BG_REMOVE__`, because check-dist forbids that name in flag-off JS); labels = tools.ts names, except pdf-password → `PDF 암호 걸기`; 200 MB cap; single file only; `showNextSteps`/`hideNextSteps`. Click → disable all buttons + `aria-busy` → `track(next)` → dynamic `import('./handoff')` → `sendTo`. Failure → alert, buttons enabled again.
- src/tools/{pdf-password,pdf-split,pdf-sign,jpg-to-pdf}/entry.ts:7,49-70 — if `pendingHandoff` → call `load()` right away, dynamic-import handoff, deliver through `api.open([f])` / `api.add([f])`. If the import fails → engine panel. pdf-sign keeps `hasSignPng()` next to it.
- src/tools/{pdf-password,pdf-split,pdf-sign}/controller.ts:init signature + last line — `open` now returns `openFiles(files)` (a Promise) so the notice appears after the open finishes. Behaviour unchanged.
- src/tools/pdf-password/entry.ts:56-61 — **departure 1**: a handed-over file selects 암호 걸기 before opening (see Open Questions).
- src/tools/pdf-compress/controller.ts:16-17,93,269,694,877-882 — slot reference; hide in every state except done; show after `setState('done')` with `{ blob, name: download.download }`; receive at the end of init through `pickFile(f)`.
- src/tools/jpg-to-pdf/controller.ts:15,122,179,513 — same sender wiring (slot `jp-next`).
- src/tools/photo-compress/controller.ts:15,839-852 — receiver through `addFiles([f])`. Failures go to its notice + polite status, because its only alert region sits inside the hidden ZIP bar. Skipped when the tool is unsupported.
- src/pages/jpg-to-pdf/index.astro:86, src/pages/pdf-compress/index.astro:134 — empty slot `<div id="…-next" class="next-steps" role="group" aria-labelledby="…-next-label" hidden>` after the download row.
- src/styles/app.css:255-256 — `.next-steps` margin; label weight 800 (check-dist rejects the retired 700 face).
- scripts/lib/usage.mjs:9,14-15,43,79-82,134,165,170-172,406-407 — `next` added to EVENTS and the header comment; `ONLY` now lists event types (o/v allowed on start and next); `NEXT_KEY`. next requires o=next and v in TOOLS; o=next is refused on other events. shapeUsage skips next rows (otherwise NaN).
- src/lib/ui/usage.ts:32-33,71 — `UsageEvent` gains `{ e:'next', t, o:'next', v: UsageTool }`; buildPayload copies o/v for both start and next.
- src/pages/privacy/index.astro:43 — the privacy sentence (**departure 2**, reworded).
- docs/COPY.md:99-106 — new section 「이어서 하기 (CHAIN)」.
- tests/unit/handoff.test.ts (new, 17), tests/unit/next-steps.test.ts (new, 7), tests/unit/usage.test.ts:6,857-886 (3 new) — see Verification.
- tests/e2e/chain.spec.ts (new, 6 tests):
  - jpg-to-pdf → pdf-compress: the file arrives, notice and status shown, store empty, and it compresses.
  - pdf-compress → pdf-password: opens in 암호 걸기, locks, and the download is parsed with the password.
  - Store failure (IDBFactory.open stubbed): alert, URL unchanged, button enabled again.
  - Missing record: pdf-sign shows the alert; photo-compress shows the notice.
  - Stale record: pdf-split alert, store emptied.
  - A marker for another tool is removed, and a normal visit requests no handoff chunk.
  - axe on both result screens with the group visible.
- tests/e2e/usage.spec.ts:263-280 — cloud projects: the click sends exactly one `next` (t=pdf-compress, o=next, v=pdf-sign) that passes validation and has no file name; the file arrives on /pdf-sign/.
- tests/unit/postbuild.test.ts:748-750 — the brand test now allows the brief's internal keys `docttak-handoff` / `docttak:handoff` (same precedent as `docttak:sign-png`).

## Verification
- vitest 64 files, 1,369 passed. astro check 0 errors. check:licenses OK.
- Default build: check-dist OK. Cloud build (BG + cloud + usage + GA test env, as in CI): check-dist OK.
- Core UI font unchanged: 605 core / 38 late, same as HEAD 3e63d08 (both built side by side); preloaded 90.8 KB.
- Budgets (limits unchanged), HEAD → X1:
  - Precache 433.8 → 437.6 KB / 450 (+2 URLs: the handoff chunks).
  - Initial JS gzip: jpg-to-pdf 8.3 → 8.8, pdf-compress 15.3 → 16.9, pdf-password 8.3 → 8.8, pdf-sign 9.0 → 9.4, pdf-split 8.4 → 8.8, photo-compress 20.4 → 20.8.
  - jpg-to-pdf lazy controller 11.0 → 12.1 / 13.1.
  - Cloud build precache 443.9 / 450 (no HEAD cloud number taken).
- e2e, default dist, 5 projects, specs chain + pdf-compress + photo-compress + pdf-password + pdf-split + pdf-sign + jpg-to-pdf + stamp-signature: 385 passed, 0 failed, 81 skipped (OffscreenCanvas skips on WebKit for Windows). 4 Firefox flaky, passed on retry: pdf-split:224, photo-compress:119, stamp-signature:229, pdf-sign:333. None of them touch the handoff path.
- chain.spec alone, retries 0: 28 passed, 2 skipped (the jpg-to-pdf sender on Windows WebKit). Stamp-signature → pdf-sign PNG handoff is green.
- usage.spec CHAIN + privacy tests on all 5 cloud projects: 10 passed.
- Not run here: Lighthouse and qa:visual (left for the gate).

## Root causes found while testing (fixed, with regression tests)
- **Firefox**: the arrived PDF was reported as damaged. Firefox keeps a large stored Blob in a file that is deleted together with the record, so a File built from it after `delete` can't be read. `takeHandoff` now reads the bytes before deleting. The unit test uses a Blob that dies on delete and fails without the fix. Cost: one in-memory copy of the file (up to 200 MB) during the take.
- **WebKit (F3)**: Playwright WebKit refuses a Blob in IndexedDB (transaction error null); an ArrayBuffer works. `idbStore.put` retries with the bytes and `get` turns them back into a Blob. chain.spec is green on webkit + mobile-safari.

## Open Questions (round 1; items 1-3 decided in round 2, see top)
1. **Departure 1: pdf-password opens in 암호 걸기.** The button says 「PDF 암호 걸기」, but the tool defaults to 암호 풀기, so a plain PDF arrived at 「암호를 풀지 않아도 됩니다」 with no switch button. The entry now checks the 암호 걸기 radio before opening. In X2 the pdf-password-unlock sender doesn't target pdf-password, so this only affects what this button promises. Keep it, or revert and change the label?
2. **Departure 2: privacy wording.** The brief's text `이 브라우저 안에 잠깐` broke two rules:
   - 깐 was not in the core font (F1), so 잠깐 → 잠시.
   - The Polish Q plain-language test bans 브라우저 in pages, so → `내 폰·컴퓨터 안에` (the same words that paragraph already uses).

   Now: 「이어서 하기를 누르면 파일이 내 폰·컴퓨터 안에 잠시 저장되고, 다음 도구가 열리면 바로 지워집니다.」 The page is 해요체; this sentence stays 합니다체 as the brief wrote it. Change to 「…지워져요.」? Also not done: should the privacy date and change history move, and should the usage-statistics section list 「이어서 하기」 among the events sent?
3. **Departure 3: dynamic import.** handoff.ts (the IndexedDB code) loads only when a marker is present or a next button is clicked. This keeps it out of every tool page's initial JS; the first version added +1.4 KB gzip to each receiver page. If the chunk fails to load on click, the store-failure alert shows; on a receiver page, the engine panel shows.
4. While storing, the clicked button is disabled even though it has focus, and browsers may drop focus to body. On failure the button comes back with the alert. Is that fine?
5. Notice text: when the tool sets its own notice for the file (e.g. too large), the arrival line goes first: 「방금 만든 파일을 가져왔습니다. <tool notice>」. When the tool raises an alert, there is no arrival notice.

## Out of Scope (logged in BUILD-LOG)
- The admin page and weekly report don't show `next` (they don't render events generically; those rows are skipped).
- Migrating sign-handoff onto handoff.ts.
- [Corrected in round 3] A record left by a tab closed between put and navigate had no time bound; round 3 adds the site-flag sweep and the privacy clause.
- [Fixed in round 3] photo-compress in a browser without OffscreenCanvas now takes and drops a waiting photo.
