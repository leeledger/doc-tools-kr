# Review Feedback — Step REV3
Date: 2026-10-13
Ready for Builder: YES

## Must Fix
None.

## Should Fix
- src/data/tools.ts:703 (confidence: 8/10) — The hwp FAQ answer still reads `아닙니다. 문서딱은 한글과컴퓨터와 무관합니다. 본 제품은 ...`. It is rendered on the HWP page and in its FAQ JSON-LD, right next to the new TRADEMARK_NOTICE (`(주)한컴(옛 한글과컴퓨터)` / `제휴·후원·승인 관계가 없습니다`). This is not a legal error: non-affiliation is stated and the wording has no 등록상표. But the same page now names the company two ways and words non-affiliation two ways. The brief only named TRADEMARK_NOTICE, so this is outside its letter. Recommendation: with Arch's OK, align it to `아닙니다. 문서딱은 한컴(옛 한글과컴퓨터)과 제휴·후원·승인 관계가 없습니다. ...` (watch the core font: only existing syllables), or log it to BUILD-LOG.
- handoff/REVIEW-REQUEST.md Open Question 4 — The brief makes separate R3.0 and R3.1 commits an acceptance item. Bob listed the file split, but nothing is committed. Whoever commits must follow that split. Do not fold it all into one commit.

## Escalate to Architect
- id-photo block position (Bob's Q5): it stays after 이어서 하기 (REV2 position). The 9 new screens put theirs before 이어서 하기 (Decision 4). The R3.1 no-change rule justified leaving it there in this step. Whether to move it now is a placement/UX call, not a code call.
- hwp-viewer placement: the block sits inside `#hw-result` after `#hw-done` and before the toolbar `#hv-bar` (src/pages/hwp-viewer/index.astro:77). So it shows above the document as soon as a file is open, not only after a PDF save. Decision 4 allows this ("the area that appears once a file is open"). Please confirm that an ad above the viewer canvas is acceptable.

## Cleared
Reviewed against ARCHITECT-BRIEF-REV3 and the addendum:
- affiliate.ts maps, affBlock and OutLinks: disclosure first, `rel="sponsored noopener"`, `target="_blank"`, 「광고」 in every label, text only.
- Guide.astro: top line directly under the H1 and outside head/og/JSON-LD; labelled aside section first; tracker only with a block and stats on.
- guide-out.ts: no preventDefault, try/catch, sampling and cap.
- trackOut and its wiring in the 9 controllers and boot.ts.
- usage.mjs: TOOL_OUT/GUIDE_OUT validate with hasOwn guards; outs SQL still uses whitelisted dataset/period interpolation only; shapeUsage tool and guide rows.
- out-links-check.mjs: allowlist (a), innermost block (b), case-insensitive rel (c), top line before the first h2 and not in head (d), flag-off/embed rules (e). Fixtures cover every No-block page. Hub pages have no tools list, so they cannot resolve to a placement.
- Privacy sentence: accurate. It says link kind plus screen name; g is the guide slug.
- HWP notices: no 등록상표; non-affiliation stated; HANCOM_NOTICE_PDF on /licenses/.
- /hwp-to-pdf/: in NOT_PRECACHED and RUNTIME_PAGES in sync, with the sw.spec offline test.
Results: affiliate/usage/guide-out/admin-view/hwp-notice/hwp-tool unit tests ran green here (219/219). Bob's reported precache headroom (37.5 KB), LCP (at most 1,816 ms, never the top line) and axe results are consistent with the code.
