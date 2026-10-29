# Review Feedback — AFF1029 (제휴 링크 자리 넓히기)
Date: 2026-10-29
Ready for Builder: YES

## Must Fix
None.

## Should Fix
None that blocks. Two notes, no action required:
- src/data/affiliate.ts:66-67 (confidence: 8/10) — the cp-stamp label 「도장 (쿠팡, 광고, 새 창)」 now also applies on the existing LP-off fallbacks (/pdf-sign/, /stamp-signature/, /stamp-maker/), not only on /power-of-attorney/. That is acceptable: 인감도장 is a kind of 도장, so the generic name is honest, it follows the cp-hancom precedent and COPY.md "일반 이름만", and the FORM1020 D10 rule stays as it was. The admin label OUT_LABELS['cp-stamp'] 「인감도장(쿠팡 광고)」 is admin-only, so no D10 conflict. Decision upheld; no change needed.
- Open Question 2 (A11): I read the PRIVACY_LP line the same way you do. It is a dated record of what 2026-10-28 added, not a closed list of the current state. No escalation.

## Escalate to Architect
- None blocking. FYI only: the cp-stamp rename is a small deviation from the A3 label. I judged it sound and honest; Arch may note it in the BUILD-LOG decision line.

## Verified
- Hrefs: I checked all 13 new LP_LINKS hrefs against reports/linkprice/사이트 링크 2026-10-29.md by exact string comparison, each one against its own report line (gosi…jlpt → lp-kb-*, mycredit1 → lp-nice, allcredit, agoda, klook). All 13 match. kbbook 대표 is unused (A7). Every href appears once.
- Hidden until a result: #en-result, #ic-result, #ed-result and FormTool `${p}-result` all carry `hidden` in the HTML, and the groups sit inside them. On /id-photo/, #idp-lp and each [data-presets] child are hidden. setPhase hides #idp-lp when leaving done. The new A13 check-dist rule forces every Coupang anchor to sit inside a hidden div.
- One group per screen: resultBlock picks LinkPrice or Coupang. On /id-photo/ the controller shows only the child whose presets include p.id, sets #idp-lp hidden when no child shows, and sets #idp-cp hidden while #idp-lp is visible. LP off means no #idp-lp, so Coupang shows for every preset.
- Disclosure and names: the disclosure comes first through OutLinks/LP_COPY.ad, and every new label contains 「광고」 and 「새 창」. The credit lead says 「내 신용점수」 and does not mention 대출, 연체 or 무료.
- No guides or content pages: GUIDE_AFF is untouched, and GUIDE_LEAD is built from the GUIDE_AFF keys with the same values as before. The dist tests assert that guide/loan-note and guide/power-of-attorney carry nothing.
- CSP: public/_headers, src/data/legal.ts and CLAUDE.md are unchanged. Only plain <a> links were added; no script, iframe or image.
- Usage: TOOL_OUT, OUT_DESTS, OutDest and OUT_LABELS are consistent. trackOut runs on each new result container.
- I re-ran tests/unit/affiliate.test.ts and tests/unit/usage.test.ts: 216/216 pass.

## Cleared
I reviewed all files in the AFF1029 diff against brief A1–A13: verbatim hrefs, hidden-until-result, one group per screen, disclosure and 「광고」 naming, no guide placement, CSP untouched, usage wiring and tests. The work passes, and the cp-stamp deviation is sound and honest.
