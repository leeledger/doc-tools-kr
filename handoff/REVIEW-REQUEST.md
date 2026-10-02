# Review Request — Sprint C, C1 r3 round 2 (Richard's C1 r3 feedback)
Date: 2026-10-02
Ready for Review: YES. Status: DONE. Arch's earlier acceptances still stand: m02/m11 IoU, budget, timing.

## Acceptance (Arch): no regression against 18e5827 on any photo, at 1600 and 2400 px
I looked through all four old | new sheets myself. Columns: photo | auto | 빨간 도장 | 서명, each as old and new.
- `C:\dev\doc-tools-kr\spikes\ink-owner\sheets\r3b-oldnew-cr2400.jpg`, `...-cr1600.jpg`: spikes/ink-real, 19 photos
- `...\sheets\r3b-oldnew-co2400.jpg`, `...-co1600.jpg`: spikes/ink-owner, 26 photos

| Photos | 자동 result vs 18e5827 |
|---|---|
| c03, c11 (seal walls) | Every seal is keyed again, as before |
| r07 (kraft in a dark frame) | Whole letter, no grain, black; it was the noise cloud. The old build also kept the frame |
| r02 (scroll) | The seal only, no band or smear; old gave the painting and its mount |
| r01 | Named 도장.png, no longer both |
| c02 | Better: the seal; old keyed it as black |
| c02b | Same class as old: the painting |
| r04 (seal and ink pad photo) | Messy in both builds |

In the explicit modes nothing that used to work fails now:
- 빨간 도장 still gives noink on pure 서명 photos. This is why the noink retry is now 자동 only; at +1 it found paper noise on c09.
- 서명 drops red ink.

Owner set, through the owner harness (run.mjs + metrics.py) on this build (serve.mjs on :4873, dist-noauto, chromium):
- 17 Pass / 7 Partial / 2 Fail (m07, m09). That is 24 Pass + Partial.
- Residue at most 0.2 % on every case except m07/m09. m02 is 0.114 % local; the rest are 0–0.003.
- IoU:

  | ID | IoU |
  |---|---|
  | m01 | 0.887 |
  | m05 | 0.901 |
  | m06 | 0.930 |
  | m10 | 0.937 (vs both inks) |
  | m02 | 0.802 |
  | m11 | 0.794 |

- 0 offsite requests, 0 non-GET requests, 0 console errors.
- Sheets: `sheets\r3b-real-chromium.jpg` and `sheets\r3b-sim-chromium.jpg`.

## Files Changed
### src/lib/ink/key.ts
**Must Fix 1: underline.** `removeLinesH` / `removeLines` first find candidate lines, then remove only ruled or printed ones:
- a family of 3 or more parallel lines (within 1°), or
- a single line that runs within 6 % of both page edges and is not joined to a larger strong-ink component.

The page box now carries its x/y origin (`PageBox`).

**Must Fix 2: regressions on photos that passed before.**

| Change | Function | Fixes |
|---|---|---|
| The paper colour for redness excludes ink within 2 px and anything redder than the median paper by more than 0.06. Before, seal rims turned the paper pink | `inkExclusion` → `coarsePaper` and `sceneInk` | c03, c11 |
| Ratio is 0 where the blurred darkness is under 0.1 | `ratioPlane` | kraft grain |
| Dark, already red-ish pixels of a red hue get +0.2, so dull maroon seals key | `ratioPlane` | c02 |
| 빨간 도장 range 0.2 → 0.4 | — | — |
| 서명 also keeps the 18e5827 absolute-redness fade, 0.15 → 0.3 | `absFactor`, also in `fillSolid` | r07 kraft |
| Ink is cleared in the desk plus a 2-cell band of the page edge | `PageMask.band` | r07 frame edge |

**Should Fix**
- The noink retry runs in 자동 only. Its result carries `strength`, which the worker passes on and the page shows (`photo.ts` onResult).
- `sceneInk`: 'both' now needs all of the following:
  - The dark ink is stroke-like: what a 2 % opening removes, at least half of the dark ink and at least `blackShare` (0.1) of the strong ink. A solid object such as r01's handle is excluded.
  - A red cluster is stamp-shaped.
  - The stroke meets the red and carries on past it (at least 65 % away from it).
- Red print is text only when its parts are small (average < 150 px), so a wall of seals is not mistaken for print.
- A red pixel for the decision also needs 0.06 of paper-relative redness. Classification uses the plain ratio, without the boost.

### Other files
- `src/lib/ink/worker-core.ts`, `src/tools/stamp-signature/photo.ts`: `strength` in the result; the 진하기 control follows it.
- `tests/fixtures/build-ink.py` + `tests/fixtures/ink/`: new fixtures. Existing images are byte-identical.

  | Fixture | Checks | IoU / note |
  |---|---|---|
  | gt14-tight | Underline spans 78 % | 0.923 (r3 build: 0.790) |
  | gt14-kraftFrame | Purple pen on kraft in a dark frame | 0.950 (18e5827: 0.028) |
  | gt15-sealWall | 768 px wall of pink-rimmed seals, guess red | IoU and ΔE info, baseline-guarded |

- `scripts/regress/ink.mjs`: the 서명 path passes the ratio to `keepMainInk`; ΔE is info for `deltaEGate: false` fixtures. `scripts/regress/ink-baseline.json` is rebaselined with all 150 checks green. Two baselines moved:

  | Fixture | Baseline (r3 → now) | 18e5827 | Cause |
  |---|---|---|---|
  | gt15-stampOnText | 0.8934 → 0.8821 | 0.8907 | The dark boost takes in a little text under the seal |
  | gt15-shadow | 0.8935 → 0.8922 | — | — |

- `scripts/check-dist.mjs`: comment only. The worker is 11.9 KB gzip, inside the 13 KB budget.
- `tests/unit/ink-key.test.ts`: tests for the tight underline, a lone edge-to-edge rule, the retry (once, 자동 only, strength reported), 'both' with a fixed colour gives 도장.png / 서명.png, paper colour under a wall of seals, and the zero ratio on kraft grain. The mode-filter table is updated.

## Gates
- check: 0 errors
- unit: 749/749
- regress:ink --fixtures-only: 150/150
- both builds + check-dist: OK
- stamp-signature e2e on chromium + mobile-safari: 15 passed, 1 skipped

## Open Questions
- In the Node pipeline, a 2400×1800 run takes 1.3–2.4 s (logged, not gated).
- r04 (ink pad and blue porcelain) gets 'both'. That is no worse than old, which gave a mess of cloth and seal; it is not a 도장 photo.

---

# Review Request — Sprint C, C1 round 3 (real-photo failures in /stamp-signature/)
Date: 2026-10-02
Ready for Review: YES. Status: DONE_WITH_CONCERNS. Two gt15-family IoU readings (m02 0.788, m11 0.794) are under the report's 0.85; they need Arch (see Open Questions).

**Tree:** branch `c1-r3` from main 18e5827. All six report priorities are in `src/lib/ink/key.ts`. Build notes and decisions are in BUILD-LOG under "C1 r3".

## Acceptance
The full 26-photo set was run through this build with the owner's harness (`run.mjs`, pointed at `tests/e2e/serve.mjs` on :4873 serving `dist-noauto`, chromium, modes 자동 / 빨간 도장 / 서명), then scored with `metrics.py`.

| | Pass | Partial | Fail |
|---|---|---|---|
| Live (report, before) | 8 | 7 | 11 |
| c1-r3, real 14 | 11 | 3 (o04, o06, o08) | 0 |
| c1-r3, simulated 12 | 6 | 4 (m02, m03, m04, m11) | 2 (m07, m09: documented limits) |
| **c1-r3, total 26** | **17** | **7** | **2** |

- **Residue in 자동:** at most 0.2 % on every simulated case except m07 and m09. m12 is 0.059 % local / 0.010 % full; m06 is 0.001 %; the rest are 0.
- **IoU, gt14/gt15 cases:**
  - Pass: m01 0.887, m05 0.902, m06 0.930, m10 0.937. m10 is scored against both inks, because the output now keeps both; scored against the stamp alone it is 0.697.
  - Below 0.85: m02 0.788 (was 0.564) and m11 0.794 (was 0.002).
- **Network and console:** 0 offsite requests, 0 non-GET requests, 0 console errors.
- **Contact sheets:**
  - `C:\dev\doc-tools-kr\spikes\ink-owner\sheets\r3-real-chromium.jpg`
  - `C:\dev\doc-tools-kr\spikes\ink-owner\sheets\r3-sim-chromium.jpg`
  - Raw results: `...\scratchpad\...\h\live\results.chromium.json` and `metrics.chromium.json`. Per-photo verdicts are in BUILD-LOG.

## Files Changed
- `src/lib/ink/key.ts`:
  - **INK constants:** ratio*, page*, desk*, line*, cluster/join*, minInkPx, faintSpeck*, bothShare.
  - **Mode filters:** `redRatio` / `ratioPlane` / `modeFactor` / `applyModeFilter` (371-440) use paper-relative redness per unit of paper luma, divided by darkness. Both are blurred before the ratio, because JPEG stores colour at half resolution. 진하기 widens each mode by 0.05 per step.
  - **Faint specks:** `dropFaintSpecks` (577) is a second despeckle that also removes faint specks under 4× the speck size. `areaCheck` (598) adds a 200-strong-pixel floor.
  - **Page finding:** `components` (654) and `findPage` (707-860). On a ~400 px copy, the page is flooded off luma and tint edges with a drift bound. Desk is non-page outside the hull that touches the frame and is dark, textured or tinted. Medians are used so that ink does not tint a region.
  - **Desk handling:** `convexHullRows`, `maskDesk` (paints the desk with the nearest paper colour) and `pageBox`.
  - **Coarse paper:** `coarsePaper` (976) gives a pre-key paper colour, with a shared ~600 px copy.
  - **Classification:** `sceneInk` / `classifyInk` (998-1096) return red, black or both. Frame-touching and line-like components are excluded. A red cluster can count as a 도장 by shape. Text-like ink gives way: black text loses to red, and small black pieces beside a 도장 lose to red.
  - **Lines:** `lineCands` / `removeLinesH` / `removeLines` (1098-1296). A Hough vote on thin ink only (±25°) is tracked column by column. A line must be thin, run on, and cover 75 % of the page. Crossings, and ink darker than the line, are kept.
  - **Keying:** `prepare` / `keyPath` / `keyInk` (1298-1380). Photo-level work is cached. Each path runs `… → fillSolid → removeLines → dropFaintSpecks → hysteresis → desk = 0`. 'both' unions the red and 서명 paths. On noink it retries once at 진하기 +1.
  - **Colour:** `renderInk` (1628) colours each joined part from its own ink.
  - **Crop:** `inkClusters` / `keepMainInk` / `padRect` / `cropRect` (1671-1815) crop to the main ink cluster and clear ink outside it. The rect is clamped to the photo.
  - **Output:** `processInk` (1938) names the 'both' output `도장·서명.png`.
- `src/lib/ink/worker-core.ts:14`: guess may be `'both'`.
- `src/tools/stamp-signature/copy.ts:10-11`: allpaper now reads "책상이나 배경까지 도장이나 서명으로 읽었습니다. 종이가 화면을 채우도록 가까이 다시 찍어 주세요." It uses no new glyphs.
- `scripts/regress/ink.mjs:214-221,250-253`: fixtures are scored as delivered (key, then main cluster). ΔE is info only for the two-ink fixture (`deltaEGate: false`).
- `scripts/regress/ink-baseline.json`: rebaselined after all brief gates held (129/129). Only gt15-shadow moved (0.9179 → 0.8935; see BUILD-LOG).
- `scripts/check-dist.mjs:83-87`: ink worker budget 6.1 → 13 KB gzip (measured 10.9 KB + 20 %, the file's rule).
- `tests/fixtures/build-ink.py` and `tests/fixtures/ink/`: 4 new fixtures:
  - gt14-desk
  - gt14-ruled
  - gt15-yellowRed (빨간 도장 mode)
  - gt15-overSign (GT = both inks, guess both)

  The existing fixture images are byte-identical.
- `tests/unit/ink-key.test.ts`: the mode-filter table is rewritten for the ratio. New: redness ratio, findPage (desk, no desk, a hard shadow is no desk), 서명 on a desk, ruled lines with a crossing stroke, cluster crop and clamp, faint speck, 200-px floor, and a 도장 over a 서명 (both, 도장·서명.png, no hole, own colours).
- `tests/unit/stamp-signature.test.ts:22`: the new allpaper wording.

## Gates (local)
- check: 0 errors.
- vitest: 745/745.
- regress:ink --fixtures-only: 129/129.
- Both builds (flag off → dist-noauto, flag on → dist): check-dist OK.
- stamp-signature e2e on chromium and mobile-safari: 15 passed, 1 skipped (existing skip).

## Open Questions
- **Arch: m02 and m11 IoU (0.788 and 0.794 < 0.85).** Both are visually clean with zero residue (see the sheet). The causes:
  - m11 is a small blurred stamp. The output is about 1.5 px fatter than the GT at a > 0.5. That comes from the pinned ramp (lo 0.1 / hi 0.6) against a GT whose solid coverage is 0.88; at a > 0.7 the IoU is 0.82.
  - m02 has blue and black form lines crossing the stamp. The 빨간 도장 path drops them, which leaves 1-2 px holes.

  Changing the pinned ramp is Arch's call; I did not touch it.
- **Arch: performance.** In Node, 2400×1800 pipeline is now about 1.5 s (was about 0.85 s): page finding, ratio plane, classification and lines add cost. A re-run on the same photo is about 0.6-1.0 s. The brief's 600 ms is logged, not gated.
- **Arch: ink worker budget 6.1 → 13 KB gzip.** The worker loads on first use only.
- **Richard:** look at `findPage` (desk rule false positives), the `inkClusters` join rules, and `sceneInk`'s text/stamp rules. These are heuristics tuned on 26 photos plus 18 fixtures.

## Out of Scope (logged in BUILD-LOG)
- o08: the faint 고슈인 seals are dropped in 자동 because the red seals break into many parts and read as text. 빨간 도장 mode gets them.
- o04: the black 직인 cannot be picked alone (same colour as the print).
- The ΔE of thin blue/black 서명 is still dark (report 9b).

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
