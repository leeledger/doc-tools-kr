# Review Request — Sprint C, C2 round 3 (Richard's Must Fix + Arch fallback ruling)
Date: 2026-10-02
Ready for Review: YES. Status DONE.

## Files Changed
- `src/lib/bgremove/session.ts`: `disposeTimers()` (idle and hidden timers that never dispose during an engine start or run).
- `src/tools/remove-background/bg.ts`:
  - `process()` brackets each photo with `begin`/`done`; visibility changes feed the timers.
  - Fallback line `#bg-fallback`; consent extra line.
  - `checkModel` after the model is read.
- `src/tools/remove-background/{copy.ts,page.astro}`: `consentExtra`, `fallbackNote` (sizes from `runtimeBytes('wasm')`; 0 new glyphs).
- `src/lib/bgremove/assets.ts`: `MODEL_PIN`, `manifestMatches`, `checkModel`. `loadManifest` and `isCached` honour the pin.
- `scripts/copy-vendor.mjs`: `sha256Total` in bgremove.json.
- `src/lib/bgremove/infer-core.ts`: buffer-cache comment matches `bucket`.
- Tests:
  - `tests/unit/bgremove.test.ts`: fake-timer tests (idle at IDLE_MS − 1 ms, hidden during a run), pin tests, fallback copy.
  - `tests/e2e/remove-background.spec.ts`: the stand-in rewrites the pinned bytes and SHA in the served controller chunk.
- `handoff/REVIEW-FEEDBACK.md` (Richard's C2 section), `handoff/BUILD-LOG.md` (round 3 + Known Gap).

## Open Questions
- None.

---

# Review Request — Sprint C, C2 round 2 (Arch rulings)
Date: 2026-10-02
Ready for Review: YES. Status DONE; every Arch target is met (BUILD-LOG "C2 round 2", with the before/after table).

## Files Changed
- Session kept between photos:
  - `src/lib/bgremove/{infer-core.ts,infer.worker.ts,session.ts}`: init/run protocol; `startEngine`/`EngineHandle`; `keepEngine` (deviceMemory ≤ 4, or iOS with it unknown → restart per photo); `OPT_LEVEL 'basic'`; WebGPU `storageBufferCacheMode` pinned to `bucket`.
  - `src/tools/remove-background/bg.ts`: the engine is disposed on 2 min idle, 60 s hidden, pagehide or a crash; WASM is used for the rest of the visit after a WebGPU failure; the pixels are read once.
  - `model.ts`: opening/error → working.
- `src/lib/bgremove/fusion.ts`: streamed box filters through a 2r+1-row ring; output written in place (2 float planes instead of 8).
- Model:
  - `scripts/model/birefnet/export.py`: `simplify()` (onnxsim) step and `--resimplify`.
  - `requirements.lock` (+ onnxsim 0.4.36 and its deps) and `README.md`.
  - `vendor-assets/birefnet-lite-512/aa62cd87-714d0a62/` replaces `…-ce158794`.
  - New exportId in copy-vendor, parity, regress, fixtures, licences and SOURCES. Python masks rebuilt.
- Precache: `scripts/gen-sw.mjs` (`/terms/` and `/privacy/` not precached) and `src/sw/sw.ts` (`RUNTIME_PAGES` stored when visited).
- Not for ID photos:
  - `src/tools/remove-background/{copy.ts,page.astro}`: fit line, the limits line + the 외교부 link, no /id-photo/ hand-off, related tools.
  - `src/data/tools.ts`: FAQ.
- Regress and measuring:
  - `scripts/regress/bgremove.mjs` + harness: one session for all images; `--opt`, `--only`; session create reported.
  - `scripts/regress/bgremove-mem.py`: N photos; per-photo peak and time to the edge-colour step.
- Tests:
  - `tests/unit/bgremove.test.ts`: engine protocol, keep policy, precache pages, not-for-ID copy.
  - `tests/unit/polish.test.ts`: SW stores RUNTIME_PAGES and serves them offline.
  - `tests/unit/postbuild.test.ts`: terms/privacy not precached.
  - `tests/e2e/remove-background.spec.ts`: the not-for-ID line and source link; no /id-photo/ link.

## Numbers (this PC)
- Session create, WebGPU: 8.1 s → **1.7–1.9 s**. WASM: 7.0 s → 1.1–1.2 s.
- WebGPU, 2nd and later 12 MP photos, pick → edge-colour step: **1.33–1.75 s** (end to end 4.2–5.6 s).
- Peak memory, WebGPU, 10 × 12 MP: **flat at 2.24–2.42 GB**.
- Precache: **432.9 KB** with the flag on (429.3 off).
- Parity on the new parts: exit 0 (GT MAE 0.00484, IoU 0.9423, empty masks 3/49).
- Full browser regression (WebGPU, 69 images): OK, max diff 0.00062.
- UI glyphs: 0 new.
- CI: https://github.com/leeledger/doc-tools-kr/actions/runs/36984505822 is green on the first attempt.

## Open Questions (Arch)
- None blocking.
- For information: WASM on a desktop with the engine kept peaks at up to 2.47 GB on one photo (about 1.9 on the others). WASM is the fallback path only.

---

# Review Request — Sprint C, C2 사진 배경 지우기 (/remove-background/)
Date: 2026-10-02
Ready for Review: YES. Status DONE_WITH_CONCERNS: precache headroom and the per-photo engine start (BUILD-LOG "C2 build notes", decisions 7 and 9). The release flag stays off.

**Tree:** branch `c2` from main 18e5827. **Flag:** `PUBLIC_BG_REMOVE` (default `0`). With it off, check-dist proves that no file, link or line of the page ships. With it on, the whole tool ships.

## Files Changed
- Model and provenance:
  - `vendor-assets/birefnet-lite-512/aa62cd87-ce158794/`: our export, 4 parts of 23 MiB at most, plus `manifest.json`. The parts were re-cut from 24 MiB; same bytes, same `sha256Total`.
  - `scripts/model/birefnet/{export.py,parity.py,metrics.py,fix_wide_ops.py,tiny.py,requirements.lock,README.md}`.
  - parity.py runs on the committed parts. Its real set is 49 photos; l04 is off-topic (Arch ruling 1).
- Engine and assets:
  - `package.json`: `onnxruntime-web` 1.30.0 (exact) and `regress:bgremove`.
  - `scripts/copy-vendor.mjs`: ORT and model copied only with the flag on, every SHA-256 checked, `src/generated/bgremove.json` written.
- Library, `src/lib/bgremove/`:
  - `assets.ts`: consent sizes, parts, SHA-256, retry, Cache Storage, quota, old caches.
  - `session.ts`: backend choice, one worker per photo, fallback rule.
  - `infer-core.ts` + `infer.worker.ts`: the ORT session and run, then dispose and release.
  - `infer.ts`: Pillow-exact input resize, normalisation, area and validity checks, 8-bit mask resize.
  - `fusion.ts` + `fusion.worker.ts`: blur-fusion ×2.
  - `guard.ts`: crash marker.
- Page, `src/tools/remove-background/`:
  - `page.astro`: injected by `astro.config.mjs` only when the flag is on.
  - `entry.ts` (lazy), `bg.ts` (controller), `model.ts` (states), `copy.ts`, `limits.ts`, `bg.css`.
- Site data:
  - `src/data/tools.ts`: `BG_REMOVE_TOOL`, in TOOLS only with the flag.
  - `src/data/og.json`, `src/data/site.ts` (8-name description), `src/env.d.ts`, `vitest.config.ts`.
- Build and headers:
  - `scripts/gen-headers.mjs`: COEP on the page and on its 3 worker-script paths (decision 5).
  - `scripts/gen-sw.mjs` + `src/sw/sw.ts`: page not precached; model and runtime network-only in the SW.
  - `scripts/gen-brand.mjs`: share image only with the flag.
  - `scripts/check-dist.mjs`: both flag states, ORT and model rows, manifest SHA-256, no JSEP/all builds, lazy controller.
- Licences:
  - `scripts/{gen,check}-licenses.mjs` and `licenses.manifest.json`: `bgremove` entries.
  - `licenses/third-party/{onnxruntime,birefnet}/` and `SOURCES.md`.
- CI and test config:
  - `.github/workflows/ci.yml`: the checks job builds flag-on and runs `regress:bgremove --fixtures-only --backend wasm`; the chromium and mobile-safari jobs build `dist-bg/` and run the bg projects.
  - `playwright.config.ts`: `bg-chromium` and `bg-mobile-safari`; other projects ignore the spec.
  - `lighthouserc.json`: + `/remove-background/`.
- Tests:
  - `tests/unit/bgremove.test.ts`: new, 42 tests.
  - `tests/unit/postbuild.test.ts`: flag-aware build env and live list, 2 new tests, brand exemption.
  - `tests/unit/network-guard.test.ts`: allowlist entry.
  - `tests/e2e/remove-background.spec.ts`: new, 6 tests, one of them `@model`.
- Fixtures and regress:
  - `tests/fixtures/bgremove/` and `build-bgremove.py`, documented in `SOURCES.md`.
  - `scripts/regress/bgremove.mjs` + `bgremove-harness/`.
  - `scripts/regress/bgremove-mem.py`: Chrome private-memory peak.
- Docs: `docs/COPY.md` (해요체 exception), `.gitattributes`, `.gitignore`.

## Numbers
- Parity on the committed parts: exit 0.
  - GT: MAE 0.00484, IoU 0.9423.
  - Empty masks: 3/49 (g01, m02, t01); l04 is off-topic.
  - fp16 vs fp32: 3.1e-5; fp32 vs torch: max 9.7e-5.
- regress full (69 images, WebGPU): browser vs Python ≤ 0.00059. GT: MAE 0.00482, IoU 0.9423. Empty masks: 3/49.
- Root cause fixed on the way (BUILD-LOG decision 14):
  - A canvas resize gave diffs up to 0.0086 on 5 real photos.
  - The input resize is now a byte-exact port of Pillow BILINEAR, which brought those photos to ≤ 0.00009.
- Peak private memory, Chrome, 12 MP photo: WebGPU 2.26 GB, WASM 2.00 GB (C2.0 probe: 2.96 / 3.83 GB).
- Time per photo, end to end on this PC:
  - WebGPU: 17–19 s (session about 8 s + first run 3 s + 12 MP fusion and saving).
  - WASM: 13–17 s.
  - Fusion: 0.9–1.3 s at 4 MP.
- Precache: 448.8 / 450 KB with the flag on, 444.8 with it off. UI fonts: +0.6 KB.
- Initial JS of the page: 9.4 KB gzip; lazy controller 12.0 KB.
- Gates: check 0 errors; unit 781/781; both builds + check-dist; licences in both states; e2e bg-chromium + bg-mobile-safari 11 passed, 1 skipped; screenshots at 390 and 1280 px, light and dark.

- CI: https://github.com/leeledger/doc-tools-kr/actions/runs/36974710691 is green on attempt 2.
  - Attempt 1 failed on the /photo-compress/ LCP median (2,104 ms; bimodal runs) and on a webkit stamp-signature checkbox test. Neither is C2 code, and both passed on the re-run.
  - CI precache: 449.6 KB.

## Open Questions (Arch)
1. Decision 5: COEP on `/_astro/infer.worker*`, `/_astro/fusion.worker*` and `/vendor/onnxruntime-web/*` as well as on the page. Without it Chrome does not start the workers. OK?
2. Decision 7: ruling 6 (release after each image) makes every photo pay a new session.
   - Measured: WebGPU about 10 s create + 3.5 s first run; WASM about 7 s + 2.7 s on this PC.
   - Keep it, or keep the worker alive between photos on desktop?
3. Decision 9: precache 448.8 / 450 KB on this PC with the flag on (about 449.6 on CI). The next tool needs a precache decision.
4. Decision 16: the brand test exempts the brief's cache name `docttak-model-birefnet-`. Keep it, or rename the cache?
5. /photo-compress/ LCP sits on the 2,000 ms line on CI (bimodal runs). Not changed by C2 beyond the menu entry, but it will flake.

## Out of Scope (logged in BUILD-LOG Known Gaps)
- Brush erase/restore, batch, 1024 고화질, guided filter, cross-page hand-off to /id-photo/, WebGL fusion. Fusion is 1.1–1.3 s at 4 MP, under the 1.5 s budget.
- `scripts/qa/visual.mjs` has no /remove-background/ shots: it runs on the flag-off build. Screenshots for this step were taken with a scratch script.

---

# Review Request — G2 A3 round 2 (Arch rulings)
Date: 2026-10-02
Ready for Review: YES — status DONE (29 indexable /guide/ URLs accepted by Arch)

- `src/content/guides/yearend-tax-pdf.md`: the inferred "hand it in unchanged" lines are cut. The page now says to follow the company's instructions.
- `src/content/guides/ecfs-pdf-limit.md`: the total cap is written "100M" as the court writes it. A new total row sits in the hub, and each row cites its quote with `source`.
- `src/data/guide-facts.ts` (`Unit` 'M', `rowQuote`, `specProblems`), `src/data/hubs.ts` (`LIMIT` + `rowOf`), `src/data/guide-schema.ts` (`source` on spec rows; TOPICS + "사진 보내기"):
  - A spec row is now backed by one quote, and its hub limit comes from that quote.
  - Test: `tests/unit/guides-schema.test.ts`, "G2 A3 (Arch)".
- `src/content/guides/kakao-photo.md`: topic is now 사진 보내기.
- Open: body-text numbers are still matched against the whole guide's quotes, since there is no per-claim citation markup. Worth a brief if Arch wants it.

---

# Review Request — G2 Sprint A, A3 (file-limit cluster, remaining drafts)
Date: 2026-10-02
Ready for Review: YES

**Tree:** branch `g2-a3` from d277beb. **Status:** DONE_WITH_CONCERNS: 29 indexable /guide/ URLs (1 short of 30, logged with tried[]); local /photo-compress/ LCP 2,111 ms on an unchanged page (A2 has the same note; CI decides). Gates and the Step 0 table are in BUILD-LOG under "G2 A3 build notes".

## Files Changed
- `src/content/guides/ecfs-pdf-limit.md` (new): 전자소송 limits. All 8 quotes are `via: browser` (SPA FAQ). Spec rows: 문서 20MB, 동영상·음성 100MB (fit false).
- `src/content/guides/kakao-photo.md`, `src/content/guides/yearend-tax-pdf.md`: draft → published. Their quotes are curl-verbatim (check:quotes 130/130).
- `src/content/guides/{gov24-upload-limit,hometax-upload-limit,work24-resume-upload,epeople-upload-limit}.md` (new): drafts, each with tried[].
- `src/content/guides/{photo-kb,pdf-merge,pdf-compress}.md:13`: a 4th `related` entry (the inbound link for each new guide). Article text is unchanged (byte-equal against the d277beb build).
- `src/content/hubs/upload-limits.md:2-7,40`: title, description, answer, og and updated now name 전자소송.
- `src/data/tool-guide-order.ts`: /pdf-merge/ and /pdf-compress/ pin their own how-to guide. Without the pin, the A3 guides would push it off the list.
- `scripts/qa/visual.mjs:47-50`: adds shots for ecfs, kakao and yearend.
- Tests:
  - `tests/unit/guides-schema.test.ts`: covers the PDF-tool pin.
  - `tests/e2e/site.spec.ts:118-123`: the sitemap now holds the 3 new guides and leaves out the 4 drafts.

## Open Questions
- Please re-check 3 quotes live:
  - the ecfs "파일 하나의 크기는 20MB를 초과할 수 없고 …" (browser: 전자소송포털 > 고객센터 > 자주하는질문, 전자제출 "종이서류로 되어 있는 서증…")
  - Kakao helps_html/1073210382 (20MB 이상 고용량 이미지)
  - NTS cntntsId=7706 ("종이없는 연말정산")
- yearend-tax-pdf tells readers to hand in the 간소화 PDF unchanged, and points our merge/compress tools only at the other papers. This is advice, not an agency quote: NTS only says companies load the PDF into their program. Is that wording acceptable, or should those two sentences go?
- ecfs: the court writes the total cap as "100M". The copy says 100MB, and the fact check passes on the same page's "100 MB까지" (video). Is that OK?
- kakao-photo topic = PDF·메일 (no better TOPICS entry).

## Arch questions
- Shortfall 1. Sourced candidates for the 30th URL, all with an official quote today:
  - "홈택스 부속서류 PDF로 내기": the nts.go.kr 홈택스이용 Q&A says HWP/Word must be converted to PDF and images auto-convert. But its only stable URL is the NTS search page (`collection=call_hometaxQna`).
  - A Kakao "동영상 원본으로 보내기" page (cs.kakao.com, static). It has no 문서딱 tool fit, so I recommend against it.
- Or accept 29 until a new row is sourced?

## Out of Scope (logged in BUILD-LOG)
- Post-deploy Naver, Kakao and GSC actions are owner/PC tasks.
# Review Request — Sprint C, C1 integration (/stamp-signature/)
Date: 2026-10-02
Ready for Review: YES

**Tree:** branch `c1`, rebased onto main d277beb (A1 + A2); C1-core commits under it. Status DONE_WITH_CONCERNS: the real-photo gate waits for the owner's 6 photos (Arch allows the page to ship first; gate before 11-15). Full notes and the gate list: BUILD-LOG "Sprint C — C1 integration".

## Files Changed
- `src/pages/stamp-signature/index.astro` — page, two ARIA tabs, controls, previews, honest-limits box, 사용 방법 / 안전한 이유 / FAQ.
- `src/tools/stamp-signature/entry.ts` — tabs + lazy loading of `photo.ts` / `pad.ts`; engine panel on load failure.
- `src/tools/stamp-signature/photo.ts` — photo flow: sniff, limits, decode to the work copy, ink worker load/run, debounce 150 ms, area messages, size disabling, crash -> 다시 시도, export.
- `src/tools/stamp-signature/pad.ts` — signature pad (Pointer Events, DPR, midpoint quadratic smoothing, undo/clear, export via key.ts crop + size).
- `src/tools/stamp-signature/png.ts` — PNG encode with one retry at the next smaller size.
- `src/tools/stamp-signature/{copy,limits}.ts`, `stamp.css` — strings, limits, page CSS (inlined).
- `src/data/tools.ts` — the tool entry (title, description, FAQ: what the tool does only).
- `src/data/{og.json,site.ts,guides.ts,guide-schema.ts}`, `docs/COPY.md` — share image/page, shorter meta template, NEXT_GUIDES, topic `서명·도장`.
- `src/content/guides/stamp-image.md`, `src/content/guides/e-signature-law.md` — the two guides (published; check:quotes 121/121).
- `scripts/check-dist.mjs:83-96` — ink worker 6.1 KB and lazy-controls 13.5 KB budgets; controls must not load with the page.
- `lighthouserc.json`, `scripts/qa/visual.mjs` — new URLs and states.
- Tests: `tests/unit/stamp-signature.test.ts`, `tests/e2e/stamp-signature.spec.ts` (new); `tests/e2e/{site,polish,id-photo}.spec.ts`, `tests/unit/{postbuild,polish}.test.ts` (lists, og rule, statute-quote exemption).

## Open Questions
- e-signature-law: please read it against the red lines (no "an image is a 전자서명", no 인감, ends with the 받는 곳 line). It shows the statute text verbatim; `tests/unit/postbuild.test.ts` now exempts law.go.kr quotes from "no quote is rendered".
- Home og:description no longer lists the tools (7 names > 80 chars). Arch decision requested (BUILD-LOG decision 2).
- The photo controller is not precached (precache 445.1 / 450 KB). Arch decision requested (decision 3).
- Area-message wording moved to 합니다체 without 잡혔 (decision 5).

## Out of Scope (logged in BUILD-LOG)
- Real-photo gate (owner photos), Hancom 한글 section, text-to-도장 generator, /remove-background/ link (C2).

---

# Review Request — G2 Sprint A, A2 (spec cluster D: exam and ID photos)
Date: 2026-10-02
Ready for Review: YES

**Tree:** branch `g2-a2` from 659c04a (Arch's 3f738e4 brief commit sits under mine, untouched).
**Status:** DONE_WITH_CONCERNS. Every gate passes except local Lighthouse on /photo-compress/ (LCP 2,113 ms), which HEAD 659c04a reproduces on this PC at the same value; the CI run decides. The gate table and Step 0 table are in BUILD-LOG under "G2 A2 build notes".

## Files Changed
- `src/content/guides/{id-card-photo,history-exam-photo,korcham-photo,teps-photo,kuksiwon-photo,police-exam-photo}.md` (new): the 6 published guides. Every quote was fetched today and is verbatim (check:quotes 113/113).
- `src/content/guides/{toeic-photo,local-gosi-photo,mma-photo,teacher-exam-photo}.md` (new): drafts, each with tried[].
- `src/data/id-photo-presets.ts`: adds presets `history` (120×160), `korcham` (400×500), `teps` (126×165, 50 KB 이하) and `kuksiwon` (276×354, 3.5×4.5 cm, dpi 200), plus `A2_RETRIEVED`. `src/data/preset-ids.ts` follows.
- `src/data/guide-facts.ts:80-97`: `unitSpellings`. The fact check now reads ㎝/㎜ and capitalised units ("3Cm", "Pixel") right after a number.
- `src/data/guide-schema.ts`: the "in the future" check now compares against the KST calendar day (`KST_OFFSET_MS`).
- `src/content/hubs/photo-sizes.md`: description, answer and og updated for the new groups.
- `lighthouserc.json`, `scripts/qa/visual.mjs`: add /guide/teps-photo/.
- Tests:
  - `tests/unit/guides-schema.test.ts`: unit spellings; the A2 preset quotes state their pixels and limit; KST dates; quick-link order.
  - `tests/unit/idphoto-core.test.ts`, `tests/unit/ops.test.ts`: preset lists.
  - `tests/e2e/id-photo.spec.ts:228-241`: `?preset=<new>` is selected at load and saves the exact file.
  - `tests/e2e/hwp-to-pdf.spec.ts:433-446`: CI fix for a pre-existing race. The in-flight flag is now set on /terms/ before the test opens /hwp-to-pdf/ (BUILD-LOG "A2 CI").

## Open Questions
- Please re-check 3 quotes live. Suggested: TEPS 사진관련 (126*165 Pixel / 50KB), the 정부24 재발급 photo line (㎝), and the police 사진등록안내.
- police-exam-photo cites public.jinhakapply.com/PoliceV2. That is the 경찰청 원서접수 site, which gosi.police.go.kr frames. gosi.police.go.kr itself fails TLS verification, so check:quotes cannot fetch it.
- id-card-photo uses the generic /id-photo/ CTA and says that the passport-ratio default is not 정부24's file spec. This is the driver-license precedent; the source never says 여권용.
- /id-photo/ 관련 안내: title order now lists kuksiwon-photo and police-exam-photo instead of passport-photo and photo-kb. Arch decision (logged).

## Out of Scope (logged in BUILD-LOG)
- `check:licenses` with PUBLIC_ID_PHOTO_AUTOFRAME=1 set fails on HEAD too (CI runs it without the variable).
- Post-deploy Naver, Kakao and GSC actions are owner/PC tasks.

---

# Review Request — G2 A1 round 2 (Richard's A1 feedback)
Date: 2026-10-02
Ready for Review: YES — status DONE

- Must Fix 1 + root cause: new exact publish gate `npm run check:quotes` (`scripts/ops/source-watch.mjs --exact`; `pageTextExact`, `hasExactQuote` in `scripts/ops/lib/html.mjs`). It found 6 non-verbatim quotes (kosaf ×3, passport-photo ×1, qnet-photo ×2); all fixed from the live pages, retrieved 2026-10-02. 78/78 verbatim. Tests: `tests/unit/ops.test.ts` (live kosaf markup; the 3-space version fails exact).
- Must Fix 2 (Arch ruling): `src/data/hubs.ts` `quotedLimit()` prints each limit as the quote writes it (10MB, 5MB 이내, 25MB, 400kb 이하 …), build error if no quote holds the value; hub copy says so. Test: every limit is a substring of its own quotes.
- Should Fix, all done: photo-sizes FAQ (two unsourced rules), univ-docs-upload + upload-limits FAQ (no "varies by university" claim), kosaf source title (labelled ours: the real heading contains 업로드, banned by the plain-language test), admission-photo full preset label, kosaf-docs/univ-docs-upload category `서류`.
- Gates: check 0 errors; unit 682/682; both builds + check-dist OK (UI fonts unchanged); check:quotes 78/78; hubs e2e chromium + mobile-safari 12/12 on :4273.
- Correction to round 1: tool pages and home differ from HEAD in their guide links (intended); their CSS/JS/fonts are identical.

---

# Review Request — G2 Sprint A, A1 (seasonal, unblocked drafts, structure, hubs H1/H2)
Date: 2026-10-01
Ready for Review: YES

**Tree:** branch `g2-a1` from 3dc0796 (one commit). Nothing pushed.
**Status:** DONE_WITH_CONCERNS. Every gate passes for what A1 touches; the gate table is in BUILD-LOG "G2 A1 … Gates". Concern: local Lighthouse tool pages still sit on the 1,953/2,040 ms steps (A0 gap; A1 leaves their CSS/fonts/JS byte-identical, Base CSS hash = HEAD) — CI decides per the Arch ruling.

## Files Changed
- `src/data/guide-schema.ts` — `TOPICS` + required `topic`; `specRowSchema` (`preset` | literal px/kb/mb/mm, `format`, `fit`); `via: 'browser'` on URL sources; `guideProblems` runs `specProblems`.
- `src/data/guide-facts.ts` — `SpecRow`, `specRowFacts` (mm checks as cm or mm), `specProblems` (preset row = official, cited by this guide, no literals; literal row = every number in this guide's quotes).
- `src/data/hubs.ts` (new) — `hubRows(guides, kind)`: one row per spec row. A preset row shows px/cm **only when the preset's own quote states them** (Q-Net's 413×531 is our choice → shown as 안내 없음); limits via `presetLimit`. `HUB_KIND` = the link rule.
- `src/data/hub-schema.ts`, `src/content/hubs/{photo-sizes,upload-limits}.md` (new) — hub frontmatter: answer, FAQ, column words, captions (Korean copy stays in .md → no UI-font growth).
- `src/layouts/Hub.astro`, `src/pages/guide/{photo-sizes,upload-limits}/index.astro` (new) — tables, intro, FAQ, related, sources of every row's guide; JSON-LD Article + FAQPage + BreadcrumbList; build fails if the copy has a number the tables do not show or a spec guide lacks a row. `guide-end` AdSlot only.
- `src/content.config.ts` — `hubs` collection.
- `src/data/guides.ts` — `hubs()`, `hubBySlug()`, `topicGroups()`; NEXT_GUIDES `pdf-merge → univ-docs-upload`.
- `src/pages/guide/index.astro` — hubs first, topic jump links (`#topic-n`), groups in TOPICS order; page-local `<style>` (system font for topic names; app.css untouched). `scripts/gen-ui-font.mjs` strips `TOPICS = [...]` from the scan (UI font delta 0.0 KB).
- `src/layouts/Guide.astro` — `guide-mid` (before the 3rd H2 of the rendered body, via `Astro.slots.render`) and `guide-end` (after the FAQ). Off → byte-equal articles.
- `src/pages/{sitemap.xml.ts,llms.txt.ts,guide/rss.xml.ts,og/guide/[slug].png.ts}` — hubs included.
- `src/pages/index.astro` — home 6th guide: admission-photo (was id-photo-size).
- `src/data/quicklinks.ts` — /id-photo/ order: passport, id_card, toeic, history, gosi, qnet, korcham, admission first (skipping unshipped), then the rest, ≤ 8 (today unchanged).
- `src/data/tool-facts.ts` — `hwp.pdfMb.desktop`, `hwp.pdfPages.desktop` from LIMITS.
- `src/content/guides/hwp-to-pdf.md`, `admission-photo.md` (draft → published), `univ-docs-upload.md`, `kosaf-docs.md` (new) — every quote fetched today (BUILD-LOG "G2 A1 … Step 0").
- 14 existing guides — `topic:` added; spec rows on passport, gosi, qnet, resume (preset rows), driver-license (mm), email-attachment-limit (Gmail/Outlook MB); open-hwp-without-hangul related += hwp-to-pdf. Article HTML of all 14 byte-equal to the HEAD build.
- `scripts/lib/shingles.mjs` (new), `scripts/check-dist.mjs` — duplicate guard (5-char shingles, Jaccard ≥ 0.45 fails, max pair printed) and "no ad-slot on /guide/ while off".
- `scripts/ops/source-watch.mjs`, `scripts/ops/lib/guides.mjs` — `via: browser` → manual table, never fetched/changed/unreachable, no issue on its own.
- `src/styles/guide.css` — hub table (scrolls sideways inside its box on phones).
- `lighthouserc.json` (+ /guide/photo-sizes/, /guide/admission-photo/), `scripts/qa/visual.mjs` (+ /guide/, both hubs, admission-photo).
- Tests: `tests/unit/guides-schema.test.ts` (topics, spec fact check ±, hub values = preset/spec values, hub copy check, new tool facts, quick-link order; base fixture pinned to driver-license-photo because published[0] is now dated today), `tests/unit/ops.test.ts` (via: browser), `tests/unit/postbuild.test.ts` (hubs in RSS/sitemap/llms, hub FAQPage, link graph + orphans, no ad-slot, duplicates), `tests/e2e/hubs.spec.ts` (new), `tests/e2e/site.spec.ts` (hwp-to-pdf no longer a draft; hubs in sitemap), `tests/e2e/hwp-to-pdf.spec.ts` (관련 안내 now the 4 HWP guides).

## Open Questions
- Please re-check 3 quotes live (deploy gate 2). Suggested: kosaf "※ 규격: 300dpi로 흑백 스캔한 TIF 파일만 업로드 가능 ( 용량 400kb 이하)" (faq.do?searchType=a&searchStr=용량), jinhak "3개월 이내 촬영한 반명함판(3X4) 사진을 업로드해 주세요." (Customer/Faq?categoryid=7), Hancom 2413 "- [파일 > PDF로 저장하기] - [파일 > 인쇄 > Hancom PDF]".
- kosaf sources are FAQ **search** URLs (the FAQ has no per-item URL). They are stable GETs today; if 재단 reorders results the quote is still on page 1 because each search returns 1 item. source-watch will flag it if not.
- hwp-to-pdf quotes Hancom's 한컴오피스 2014 FAQ (the only official PDF-save answer found); the page says "2014 기준 … 버전에 따라 메뉴 이름이 조금 다를 수 있어요". OK, or Arch prefers dropping that section?
- `guide-end` sits after the FAQ inside the article, not literally "before the sources" (sources are in the aside after related). Zero output now; position matters only at ads switch-on.
- Spec rows are hub data only (no auto spec table on guides) — keeps the 11 bodies unchanged.

## Out of Scope (logged in BUILD-LOG)
- No new id-photo preset in A1 (no px/KB on 진학사/유웨이). A2 owns the preset rows.
- docs/OPS-RUNBOOK.md does not yet describe the manual "브라우저 출처" table (no browser source exists yet).

---

# Review Request — G2 Sprint A, A0 /hwp-viewer/ (round 2)

## Round 2 (Richard's 4 fixes + Arch LCP ruling) — the commit after be3d693
- `src/styles/global.css` (phone media block): `.hv .hv-sheet-head .btn { flex: 0 0 auto; }`. Covered by `tests/e2e/hwp-viewer.spec.ts` "phone width": 닫기 is narrower than 40 % of the sheet header.
- `src/content/guides/what-is-hwpx.md`: "내용은 같은 한글 문서예요." removed. `hwp-on-phone.md`: the KakaoTalk save-menu claim removed.
- `src/data/tools.ts`: `HWP_FAQ` builds the viewer FAQ numbers from `LIMITS` / `MB_DEC`. `tests/unit/hwp-viewer.test.ts` checks them.
- BUILD-LOG: the font-order theory is withdrawn (Lantern quantisation), and the Arch ruling is logged. `lighthouserc.json`: `numberOfRuns: 5` + `$comment`. `handoff/CLOUD-HANDOFF.md` §3 updated. The unproven "1,966 → 2,040" causal note is softened (BUILD-LOG V0, astro.config.mjs comment).
- Gates: check 0 errors; unit 670/670; build OK (UI fonts 184.8 KB, +0 glyphs); viewer e2e chromium + mobile-safari 42/42 (4 skipped).
- Lighthouse, 5 runs locally: /hwp-to-pdf/ median 1,956 ms; /hwp-viewer/ median 2,040 ms (1,951 / 2,040 ×4). CI decides per the ruling; it runs on push.

---

Date: 2026-10-01
Ready for Review: YES

**Tree:** branch cloud-handoff. Commits: V0 d109a7f (LCP), V1 241a438 (refactor, behaviour-free) and the V2 commit after them. Nothing is pushed.

**Status:** DONE_WITH_CONCERNS. Every gate passes except Lighthouse, which on this PC lands at about 1,953 or 2,040 ms per run on every tool page, untouched ones included.
- /hwp-viewer/ and /hwp-to-pdf/ medians are 1,951–1,959 ms in 3 of 3 targeted runs.
- In the full 14-URL run, /hwp-viewer/ got 2,040 ms, as did id-photo, pdf-compress and photo-compress. At f6b40a6, /pdf-merge/ failed 4 of 4.

The full numbers, decisions and sources are in BUILD-LOG, "A0 /hwp-viewer/ build notes".

## Files Changed
- **V0** (d109a7f) `src/pages/hwp-to-pdf/index.astro` — hwp.css is inlined (`?inline` + `<style is:inline>`). The page script is now boot.
- **V0** `src/tools/hwp-shared/boot.ts` (whole file) — imports the controller after first paint + idle, or at the first interaction. A file picked or dropped early is handed over; picker prefetch still works; a failed load shows the engine panel. Test: `tests/unit/hwp-boot.test.ts`.
- **V0** `astro.config.mjs:38-40` — boot.ts goes in the ui-shared chunk, so there is no extra request before paint.
- **V1** (241a438) `src/tools/hwp-to-pdf/*` → `src/tools/hwp-shared/*` (git mv). controller.ts became `session.ts`; `src/tools/hwp-to-pdf/controller.ts` is a thin wrapper. Each moved file got the HANCOM_NOTICE first line. Test: `tests/unit/hwp-notice.test.ts`.
- `src/tools/hwp-shared/session.ts` — the `OpenDocument` and `HwpHooks` types, `requestText`/`onText` with their own waiters (released in `releaseWaiters`), the hook calls (clearDocument, onParsed, open, onmessage), and `#hw-note` made optional.
- `src/tools/hwp-shared/viewer.ts` — the `zoomable` fixed page box, `onRendered`/`onCleared`, `pageElement()`, and destroy() no longer fires onCleared.
- `src/lib/hwp/hwp.worker.ts` — the `{type:'text', i}` request: render, `glyphText`, drop the SVG.
- `src/lib/hwp/svg-string.ts` — `glyphText` (entity decode, inner tags dropped).
- `src/tools/hwp-viewer/{app,ui,zoom,search,select,thumbs,copy}.ts` and `viewer.css` (all new) — the controller, the controls, the pure zoom/search/copy helpers, and the page list.
- `src/pages/hwp-viewer/index.astro` (new) — markup, legal lines, FAQ, QuickLinks and RelatedTools.
- `src/tools/hwp-shared/hwp.css` (last 2 lines) — keeps the picker and messages narrow in the wide viewer box.
- `src/data/tools.ts` — the `hwp-viewer` entry.
- `src/data/og.json` — the viewer image and page; the home og description shortened.
- `src/data/site.ts:21` — defaultDescription shortened (6 names; still 80–120 characters).
- `src/data/tool-facts.ts` — HWP facts.
- `src/data/guides.ts` — NEXT_GUIDES for hwp-viewer.
- `src/pages/hwp-to-pdf/index.astro` — RelatedTools adds hwp-viewer.
- `src/content/guides/open-hwp-without-hangul.md` (renamed from the hwp-viewer draft, published), `hwp-on-phone.md`, `what-is-hwpx.md` — the three new guides.
- `scripts/check-dist.mjs` (block before `count(rhwp_bg…)`) — viewer budgets.
- `lighthouserc.json`, `scripts/qa/visual.mjs` — the viewer page and states.
- `scripts/regress/hwp-viewer.mjs`, `package.json` — `regress:hwp-viewer`.
- `docs/COPY.md:8` — the 해요체 exception for the two brief-fixed lines.
- Tests:
  - `tests/e2e/hwp-viewer.spec.ts` (new, 23 tests);
  - `tests/unit/hwp-viewer.test.ts` (new: zoom, search, copy join, list window, glyphText, legal dist scan);
  - expectations extended in `tests/e2e/{site,polish,id-photo,hwp-to-pdf}.spec.ts` and `tests/unit/postbuild.test.ts`.

## Gates (all with PUBLIC_SITE_URL=https://docttak.com)
- check: 0 errors.
- unit: 669/669.
- Both builds pass check-dist. UI fonts 184.8 / 190 KB (A0 +0.0). Precache 419.1 / 450 KB. Export chunk 345.1 / 360 KB. Viewer initial JS +0.0 / 4 KB over the converter.
- licenses OK.
- e2e: 976 passed, 0 failed, 5 Firefox flaky in untouched specs, 172 skipped.
- regress:hwp full corpus: 120/120, all rules pass.
- **regress:hwp-viewer full corpus: 120/120; 2,280 of 2,280 pages drawn; page counts equal the converter's on every file.**
- qa:visual: 0 hard failures.
- source-watch: 47/47 quotes found verbatim.

## Open Questions
- **Lighthouse (above).** Superseded by the Arch ruling: median of 5 runs, CI is the source of truth.
- **Search text comes from the rendered SVG, not getPageTextLayout** (the layout misses text on 116 of 236 fixture pages). The cost is one worker render per page, limited to 100 pages and cancellable. Is that the right trade-off?
- **Copy is answered by the page** (select.ts) because browsers copy one glyph per line from rhwp's per-glyph `<text>`. Line and space heuristics: new baseline > 0.5 em; gap > 1.5 em.
- **hwp-on-phone has no Kakao or Samsung source** (tried[] in BUILD-LOG). The Kakao FAQ says so plainly.
- **Mini previews use `<svg><use>`** of the on-screen page drawing. The e2e pixel check passes on all 5 projects.
- The viewer spec runs with `reducedMotion: 'reduce'`. The site's smooth scroll raced Playwright's scroll-into-view on Firefox, and a click got lost.

## Out of Scope (logged in BUILD-LOG Known Gaps)
- The 404 map and ops `suggestTool` do not suggest /hwp-viewer/ yet.
- The hwp-to-pdf FAQ "HWP 뷰어로만" has no link to /hwp-viewer/ (the template does not render FAQ links).
- The `topic` schema field (A1).
- Owner real-device checks (iPhone Safari, KakaoTalk in-app).
- Post-deploy Kakao / Naver / GSC steps.
