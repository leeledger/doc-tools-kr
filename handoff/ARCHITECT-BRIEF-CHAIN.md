# Architect Brief — CHAIN 「결과로 이어서 하기」

Author: Arch. Date: 2026-10-11. Worktree `C:\dev\doc-tools\c2`, branch `c2-cloud` (= origin/main 3e63d08).
Source: `C:/dev/doc-tools-kr/reports/문서딱 기능 시장성 조사.md` § Conclusion ("한국 서류 제출 도우미": 사진→PDF, 암호, 용량 줄이기로 이어서 쓰게).

## Goal
A tool's single-file result can be opened in the next tool with one button — no download, no re-pick, nothing leaves the browser.

## Locked decisions
1. **New module, not a rewrite of sign-handoff.** `src/lib/ui/sign-handoff.ts` (sessionStorage data URL, PNG only, ~5 MB ceiling, base64 x1.33) cannot carry PDFs up to 100+ MB. Build `src/lib/ui/handoff.ts` on IndexedDB (Blob stored as-is). **Do not touch sign-handoff / stamp-signature / the pdf-sign PNG path in this step** (refactor and behavior change stay separate; migrating sign-handoff onto handoff.ts → Known Gap).
2. **Transport.** IDB database `docttak-handoff`, store `files`, record `{ key, to, from, name, type, blob, at }`. This tab's sessionStorage holds the marker `docttak:handoff` = JSON `{ to, key }`. `key` = 16 random bytes hex via `crypto.getRandomValues` (local only, never sent anywhere; it only stops two tabs from taking each other's file). Receivers check the marker **synchronously** so pages without a handoff never open IndexedDB (LCP, no cost for normal visits).
3. **Lifetime.** Receiver: read marker → remove marker → get record by key → delete record → check `to === this tool` and age at most 10 min → build `new File([blob], name, { type })`. Every put and every take also deletes records older than 10 min (sweep). One record per put; nothing else stored.
4. **Size cap.** Result over 200 MB → the group is not shown at all. The receiver's own limits/messages apply as if the user picked the file (the File goes through the existing pick path).
5. **Single-file results only.** ZIP / several files / several photos / pdf-split modes ranges·every·each / pdf-to-jpg → no buttons (out of scope). pdf-split `edit` and `extract` produce one PDF → buttons.
6. **Same tab** navigation with `location.assign('/<to>/')`, like sign-handoff.
7. **Flow table** (lives in `src/lib/ui/next-steps.ts` — NOT in `src/data/`, so its characters stay in the late font, see F1). Order = button order. Never offer the sender itself.

| From (result) | Buttons |
|---|---|
| jpg-to-pdf | pdf-compress, pdf-password, pdf-sign |
| pdf-merge | pdf-compress, pdf-password, pdf-sign |
| pdf-split (edit/extract) | pdf-compress, pdf-password, pdf-sign |
| hwp-to-pdf (PDF result) | pdf-compress, pdf-password, pdf-sign |
| pdf-compress | pdf-password, pdf-sign |
| pdf-sign | pdf-compress, pdf-password |
| pdf-password **unlock** result | pdf-compress, pdf-sign, pdf-split |
| pdf-password **lock** result | none (encrypted output; every next tool would ask the password again) |
| image-to-jpg (1 photo) | photo-compress, jpg-to-pdf |
| photo-compress (1 photo) | jpg-to-pdf |
| remove-background | jpg-to-pdf, photo-compress (alpha flattens to white in src/lib/image/raster.ts — e2e asserts white, not black) |
| id-photo (the main photo file, not a print sheet) | jpg-to-pdf |
| stamp-signature | unchanged (existing sign-handoff) |

Receivers: pdf-compress, pdf-password, pdf-sign, pdf-split, photo-compress, jpg-to-pdf.

8. **Copy (docs/COPY.md 쉬운 말; add a section 「이어서 하기 (CHAIN)」).**
   - Group label: `이 파일로 이어서 하기`
   - Buttons: target tool `name` from `src/data/tools.ts`, except pdf-password → `PDF 암호 걸기`.
   - Receiver notice (polite status + the tool notice area, like pdf-sign ARRIVED_NOTE): `방금 만든 파일을 가져왔습니다.` (the file then shows as if picked).
   - Store failed (sender, alert): `파일을 넘기지 못했습니다. 내려받은 뒤 {도구 이름}에서 골라 주세요.`
   - Take failed / expired / missing (receiver, alert): `파일을 가져오지 못했습니다. 파일을 다시 골라 주세요.`
   - Privacy page (`src/data/legal.ts`, where browser-only processing is described): one sentence — `이어서 하기를 누르면 파일이 이 브라우저 안에 잠깐 저장되고, 다음 도구가 열리면 바로 지워집니다.` (core font text; see F1).
9. **Usage statistics: yes, one event.** Add `next` to `EVENTS` in `scripts/lib/usage.mjs`, sent by the sender on click before navigating: `{ e: 'next', t: <from>, o: 'next', v: <to slug> }`. Change `ONLY` so o/v are allowed on `start` **and** `next`; for `next`, `o` must equal `'next'` and `v` must be in `TOOLS`. No new blob column (blob order unchanged). Update the whitelist header comment, validation tests, and check-dist if it pins EVENTS. Admin/growth display of `next`: only if they render events generically; otherwise Known Gap (no new admin UI).
10. **Markup.** Each sender page gets one empty static slot next to its download button: `<div id="<prefix>-next" class="next-steps" role="group" aria-labelledby="<prefix>-next-label" hidden></div>` — no text in the .astro (core font untouched). JS fills the label `<p id="<prefix>-next-label">` and `<button type="button">`s using the existing secondary button class (the one stamp-signature uses for its PDF 서명·도장 넣기 button; at least 44 px target). Shown on done; emptied + hidden on reset / new file / error.
11. **Click state.** Button gets `disabled` + `aria-busy="true"` while storing (large files on phones take a moment); re-enabled on failure.

## Flow
~~~
SENDER (result shown, 1 file, at most 200 MB)
  showNextSteps(slot, from, result)
     |
  [click target] --> track next(from,to)
     |               put IDB {key,to,from,name,type,blob,at}  (sweep older than 10 min)
     |        ok --> sessionStorage docttak:handoff={to,key} --> location.assign(/to/)
     |      fail --> alert "파일을 넘기지 못했습니다. ..." ; button re-enabled ; no navigation
     v
RECEIVER page load
  marker? (sync) -- no --> normal lazy page (IDB never opened)
     | yes
  marker.to differs from this tool --> remove marker, nothing else
     | marker.to is this tool
  start controller now (as hasSignPng does) ; remove marker
  take(key): get + delete record (sweep older than 10 min)
     +- ok, fresh, to matches --> File --> existing pick path (open/add/pickFile/addFiles) --> notice "방금 만든 파일을 가져왔습니다."
     +- missing/expired/mismatch/IDB error --> alert "파일을 가져오지 못했습니다. ..." ; empty tool
~~~

## Build order
### X1 — core + receivers + two senders (Richard reviews before X2)
1. `src/lib/ui/handoff.ts`: `pendingHandoff(slug)` (sync marker check), `takeHandoff(slug)`, `sendTo(to, from, blob, name, type, go?)`. Storage behind a small injectable interface (`{ put, get, delete, sweep }`) so unit tests use an in-memory fake; the real one is plain IndexedDB (no new dependency).
2. `src/lib/ui/next-steps.ts`: flow table + `showNextSteps(slot, from, result)` / `hideNextSteps(slot)`; builds DOM, wires click → `sendTo`, alert on failure via `lib/ui/announce`.
3. Receivers:
   - Lazy entries (`src/tools/{pdf-password,pdf-split,pdf-sign,jpg-to-pdf}/entry.ts`): if `pendingHandoff(slug)` → `start()` immediately, then `takeHandoff` → hand the File through the existing `load(pending)` / `api.open|add` path. pdf-sign: keep the `hasSignPng()` path as is; both may coexist.
   - Eager controllers (`pdf-compress/controller.ts` `initCompressTool` → `pickFile(f)`; `photo-compress/controller.ts` `initPhotoTool` → `addFiles([f])`): take at the end of init.
   - Notice + polite status on success; alert on failure.
4. Senders in X1: jpg-to-pdf, pdf-compress (slots in their .astro; show on done, hide on reset).
5. Usage `next` event (decision 9).
6. COPY.md section + privacy sentence.
7. Tests (see Test map). Run all gates.

### X2 — remaining senders
pdf-merge, pdf-split (edit/extract only), hwp-to-pdf (find the PDF Blob in `src/tools/hwp-shared/session.ts` / `download.ts`; raster fallback output counts too), pdf-sign, pdf-password (unlock only), image-to-jpg (1 photo), photo-compress (1 photo), remove-background, id-photo. Tests for each.

## Flags (do not guess)
- **F1 font.** Core preload margin is ~1.8 KB. All new UI strings live in `src/lib/**` (late face, never preloaded). The only core text added is the privacy sentence; nothing in .astro slots. Do NOT add `next-steps.ts` to `CORE_PATHS`. If check-dist reports new core characters from the privacy sentence, reword it with characters already in core and tell Arch; do not raise budgets. Late faces stay at most 8 KB each.
- **F2 beacon before navigation.** `track()` must reach `sendBeacon` before `location.assign` (check whether usage.ts queues; flush if so). Stats-off builds ship no tracker — the handoff must work identically.
- **F3 Blob in IDB on WebKit.** Store the Blob. If WebKit e2e shows a DataCloneError or empty blob, fall back to an ArrayBuffer for that case and log it in BUILD-LOG; do not change the cap.
- **F4** The receiver must not open IndexedDB when there is no marker (unit test: fake store untouched).
- **F5** No new network request of any kind; the e2e no-upload guard must pass on every new flow.
- **F6** Do not change any tool's existing limits, copy, or result layout beyond adding the slot.
- **F7** precache at most 450 KB and existing JS budgets unchanged; if a budget moves, report numbers to Arch.

## Failure modes
| Path | Realistic failure | Handling | User sees |
|---|---|---|---|
| put | IDB quota / private mode / blocked storage | catch → alert, no navigation, button re-enabled; unit + e2e (stub `indexedDB.open` to throw) | clear alert |
| put | Safari Blob clone error | F3 fallback; e2e webkit | works or clear alert |
| put → assign | tab closed between put and navigate | record lingers until next put/take sweep (10 min TTL); disclosed on privacy page | nothing (accepted, logged) |
| take | record missing (other tab swept, site data cleared) | alert; empty tool; unit + e2e | clear alert |
| take | expired (over 10 min, e.g. back/bfcache later) | delete, alert; unit | clear alert |
| take | marker for another tool | remove marker, ignore; unit | nothing (correct) |
| take | file rejected by receiver limits | existing pick-path error | existing clear error |
| two tabs | both hand off at once | per-handoff random key; unit | correct file each |
| reload receiver | marker already removed | normal empty page | nothing (correct) |
| stats | beacon dropped on navigation | F2; stats are best-effort | nothing |

No critical gap remains.

## Test map
| New branch / flow | Status |
|---|---|
| handoff.ts put/take/sweep/TTL/key mismatch/to mismatch/no-marker-no-IDB/store throws | [GAP] → unit `tests/unit/handoff.test.ts` (in-memory fake) |
| next-steps table: no self, lock→none, multi-file→none, over 200 MB→none, labels | [GAP] → unit `tests/unit/next-steps.test.ts` |
| usage `next` accepted with o=next, v in TOOLS; rejected with other o, unknown v, o/v on other events | [GAP] → extend usage unit tests |
| jpg-to-pdf → pdf-compress: file arrives, notice shown, IDB store empty afterwards, no upload | [GAP] → e2e `tests/e2e/chain.spec.ts` (5 browsers) |
| pdf-compress → pdf-password | [GAP] → e2e |
| store failure → alert, URL unchanged | [GAP] → e2e (addInitScript stub) |
| receiver with stale/missing record → alert | [GAP] → e2e (set marker manually) |
| X2: image-to-jpg → photo-compress; id-photo → jpg-to-pdf; remove-background → jpg-to-pdf (white bg); pdf-split extract → pdf-sign; pdf-password unlock → pdf-compress, lock → no buttons; multi-photo → no buttons; hwp-to-pdf → pdf-compress | [GAP] → e2e |
| axe on a result screen with the group visible (two pages) | [GAP] → e2e axe |
| Existing pick/drop on all receivers; stamp-signature → pdf-sign PNG handoff | [TESTED] existing e2e — must stay green (regression) |

## Out of scope (→ BUILD-LOG Known Gaps if it surfaces)
- Multi-file / ZIP handoff; pdf-to-jpg and hwpx-to-hwp as senders; hwp-viewer.
- Migrating sign-handoff onto handoff.ts.
- New admin UI for `next`; guide-page copy about chaining; home-page changes.
- Carrying settings (e.g. compress level) between tools.

## Acceptance
- Gates green: check, unit, check-dist (core font unchanged except privacy-sentence chars already in core; precache at most 450 KB), licenses, e2e 5 browsers incl. no-upload guard, axe, Lighthouse (median of 5, thresholds unchanged), qa:visual.
- Every flow in the table works end-to-end in e2e (X1 flows after X1, all after X2); after arrival the IDB `files` store is empty.
- Stats-off build: no tracker code, handoff works.
- Regression: stamp-signature → pdf-sign and every receiver's pick/drop paths unchanged.
- BUILD-LOG: X1/X2 build notes + Known Gaps.
