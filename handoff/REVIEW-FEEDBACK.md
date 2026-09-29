# Review Feedback — Polish P, round 2
Date: 2026-09-30
Ready for Builder: YES

## Verification (current working tree, run by Richard)
- check 0/0/0; vitest 309/309; build OK (UI fonts 169.4/180 KB, precache 17 URLs 405.4/450 KB incl. /offline/, sw.js 1.5 KB); check-dist OK.
- Chromium e2e pdf-merge + site + sw + polish: 84 passed, 2 skipped, 0 failed. Drag test on firefox + webkit: 2/2 passed.
- My own round-1 drag repro (5 PDFs, pdf.js delayed 4 s, drag held at the bottom edge 7 s, release): scrollY 2174 → 2174 over 1.5 s, 0 placeholders, 0 `.dragging` rows, all 5 rows inspected, and the drop committed (kr_law_form.pdf moved to last).

## Must Fix
None.

## Round-1 items — status
- Drag outliving a re-render — FIXED. `renderList()` is held while `dragging` (controller.ts:215-218) and catches up once on end; drag.ts ends on pointerup / pointercancel / lostpointercapture / hidden; no drag starts if capture fails.
- carry-assets caps — FIXED. `buf.length !== e.bytes` rejects (carry-assets.mjs:144), real bytes count against 60 MB (:145), Content-Length pre-check when not encoded, manifest refused over 1 MB.
- /404.html precache — FIXED by design change: /offline/ (noindex, not in sitemap) is precached and is the navigation fallback (sw.ts:76); /404.html no longer precached. Still do `curl -sI https://<preview>/offline/` on the first preview deploy (expect a plain 200).
- Kill switch reload — FIXED. No navigate/matchAll; caches deleted, then unregister.
- Beacon path — FIXED. scripts/lib/beacon-path.mjs `/^\/(?!\/)/` plus no backslash, used by astro.config and check-dist.
- Terms §9 — FIXED. 7 days; 30 days for 이용자에게 불리한 변경.
- pdf.js worker on retry — FIXED. `resetPdfJs` destroys the worker before nulling (inspect.ts:40-47, 55, 94).

## Arch decisions — verified
- Contact "준비 중" ships; check-dist.mjs:31-34 fails the build when the beacon or `ADS_ENABLED = true` is on without PUBLIC_CONTACT_EMAIL.
- UI font budget 180 KB (check-dist.mjs:78), reason logged.
- Legal dates 2026년 9월 30일 in src/data/legal.ts.

## Should Fix (informational, does not block)
- scripts/carry-assets.mjs:85 (confidence: 5) — a manifest served chunked without Content-Length is still fully buffered before the 1 MB check; only the 60 s timeout bounds it. Streaming with an early abort would close this. Low risk (the source is our own site). Log to BUILD-LOG if not fixed.
- src/lib/pdf/inspect.ts:94 (confidence: 4) — `resetPdfJs` in openPdf destroys the shared worker even if other documents are open on it at that moment. That only matters when the engine has already failed, so it is acceptable.

## Escalate to Architect
- Unchanged from round 1 and now a logged Known Gap: the owner sets the contact email and the privacy officer's name before ads or analytics go on (개인정보 보호법 제30조). The build now enforces this.

## Cleared
Every round-1 Must Fix and Should Fix item and the three Arch decisions are verified against the current tree, with gates green. Polish P is clear for the deploy gate.

---

# Review Feedback — Polish P
Date: 2026-09-30
Ready for Builder: NO (one Must Fix, then re-review of that item only)

Gates re-run by Richard: check 0/0/0; vitest 303/303; build OK (check-dist, gen-headers, carry disabled, gen-sw 17 URLs 404.9/450 KB, sw.js 1.5 KB); check:licenses OK (25); e2e chromium all specs 118 passed / 5 skipped; firefox + webkit on site, sw, polish specs 142 passed / 12 skipped, 0 flaky. dist has no inline executable script (only ld+json), so the CSP holds.
Manual pass (Chromium, light and dark): home, header menu open (desktop and Pixel 7), merge list on mobile, compress target mode + done panel on mobile (download link and headline in the first viewport, headline focused), engine panel (merge on pick, compress on run, with chunk/vendor requests aborted), /terms/. Nothing broken visually.

## Must Fix
- src/tools/pdf-merge/drag.ts:67-99 + src/tools/pdf-merge/controller.ts:215,471-472 (confidence: 9) — A drag that is in progress when `renderList()` runs (`list.replaceChildren(...)`, called from `inspectEntry` when a queued inspection finishes) detaches the dragged row and its handle. The handle's `pointerup`/`pointercancel` listeners never fire again, so `end()` never runs: the `requestAnimationFrame(autoScroll)` loop keeps going forever, the capture-phase keydown listener stays, and the placeholder is orphaned. Reproduced: 5 PDFs, pdf.js delayed 4 s, drag the first handle to the bottom edge, inspection finishes, mouse up → `scrollY 1473 → 1743 → 1923` with no pointer down; the page keeps scrolling down until Escape. This is the common path (reorder right after adding files; first inspect is ~4 s on slow 4G). Fix: (a) in startRowDrag listen for `lostpointercapture` on the handle and end(false) on it, and (b) in the controller, do not re-render while a drag is active — keep a `dragging` flag set by beginDrag/cleared in onEnd and run a deferred `renderList()` on end. Add an e2e: drag held while an inspection completes → after mouseup scrollY is stable and no `.drag-placeholder` remains.

## Should Fix
- scripts/carry-assets.mjs:115-117 (confidence: 8) — Caps are enforced on the manifest's declared `e.bytes` only: `const buf = Buffer.from(await res.arrayBuffer()); if (sha256(buf) !== e.sha256) ...` never compares `buf.length` with `e.bytes`, and the SHA comes from the same (untrusted) manifest, so a lying manifest bypasses the 60 MB / 25 MiB caps (a >25 MiB file fails the CF deploy). Fix: reject when `buf.length !== e.bytes`; ideally check `content-length` before reading. Same file :80 — `await res.json()` on the live manifest has no size cap; read text, reject over ~2 MB. Low real-world risk (source is our own site), 5-minute fix.
- src/sw/sw.ts:125 + scripts/gen-sw.mjs pages() (confidence: 6, verify this) — `/404.html` is precached with `cache.addAll`. Cloudflare Pages normally 308-redirects `*.html` to the extensionless path. If it does here, the stored response has `redirected === true` and Chrome rejects it as a navigation response (the offline fallback becomes a network error); if CF answers that path with status 404, `addAll` rejects and the SW never installs anywhere. The local serve.mjs serves it 200, so e2e cannot see this. Verify on the first preview deploy (`curl -sI https://<preview>/404.html`); if it redirects, precache `/404` or re-wrap the response (`new Response(res.body, res)`) before put. Consider adding the check to smoke:assets.
- scripts/gen-sw.mjs KILL_SWITCH (confidence: 7) — `for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate(c.url);` reloads every controlled tab, including one mid-merge/compress, losing the user's work. The emergency path is legitimate, but it breaks the "never mid-task" rule. Recommend: do not navigate; unregister + delete caches is enough (pages keep working from the network), or leave the reload to the page when not busy.
- astro.config.mjs:8 (confidence: 8) — `env.PUBLIC_ERROR_BEACON_PATH?.startsWith('/')` accepts `//host/x` (protocol-relative, cross-origin). CSP connect-src 'self' would block it, but the config promise is "same origin". Use `/^\/(?!\/)/`.
- src/pages/terms/index.astro §9 (confidence: 7) — "시행 7일 전부터 게시" for every change. Korean practice (공정위 표준약관) is 7 days generally and 30 days for changes unfavourable to users. Add the 30-day clause. §7 is sound: the 고의·중대한 과실 carve-out keeps it valid under 약관규제법 제7조 1호; §10 does not fix exclusive jurisdiction at the operator's seat (good under 제14조).
- src/lib/pdf/inspect.ts:81-85 (confidence: 5) — on an engine failure `pdfjsPromise = null` but the cached `PDFWorker` is not destroyed; a retry creates a second worker. Minor leak; `worker.destroy()` before nulling.

## Escalate to Architect
- Launch with "문의: 준비 중" and 개인정보 보호책임자 "사이티드 대표" (no name/department, no contact). 개인정보 보호법 제30조 and 시행령 제31조 require the 보호책임자's name or department and a contact in the 처리방침 once any personal data is processed (Cloudflare access logs are mentioned on the same page). The code works as specified; whether production may ship without PUBLIC_CONTACT_EMAIL set is a legal/product decision. Recommend making PUBLIC_CONTACT_EMAIL mandatory for a CF_PAGES production build.
- The UI font budget has 0.6 KB headroom (169.4/170 KB). The next copy change with new Hangul syllables will fail the build. Decide now: raise the budget or subset by a fixed syllable list.
- Legal dates in src/data/legal.ts are placeholders (build date) until the deploy gate — as Bob noted.

## Deviations (all 9 reviewed)
1-4, 6-9 accepted as reasoned. 5 (`tabindex="0"` on `<a href download>`) is harmless in Chrome/Firefox and fixes Safari's default Tab order. Accepted. Deviation 8 (WebKit "Load failed", Firefox "NetworkError…") only matches when `name === 'TypeError'`. No file-parsing path in the three tools raises a TypeError with that wording, so there is no false engine mapping. Accepted.

## Cleared
The service worker (GET-only same-origin allowlist, no body reads, no skipWaiting without the bar, busy guard, first-install claim only, one previous generation kept), the carry-forward (path allowlist, SHA check, generation window, fail-open, never overwrites fresh files), smoke:assets, and engine-vs-file mapping in all three tools (verified live: panel shown, rows 대기, no file error). Also cleared: the target search (every rung goes through compressPdf with page-count/text/SSIM checks, floors 96 ppi / q45 / SSIM 0.80, raster never on the ladder, result re-verified in finish()), the CSP and HSTS (custom host only, no preload), the menu disclosure (aria-expanded, Escape returns focus), and the legal pages. All pass apart from the items above.
