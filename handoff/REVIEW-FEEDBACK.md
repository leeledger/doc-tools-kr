# Review Feedback — ADMIN-CHART-AXIS
Date: 2026-10-08
Ready for Builder: YES

## Must Fix
None.

## Should Fix
None that blocks. Notes for the record:
- scripts/lib/admin-view.mjs:300 (confidence: 6/10) — label alignment depends on `line-height:16px` + `height:176px` + `margin:-8px 0` matching the SVG's `height:160px`. Verified the arithmetic: label i centre = -8 + 8 + i*(176-16)/(n-1) = i*160/(n-1), which equals the gridline positions (H - t/scale*H scaled to 160 px). Grid auto-placement puts .chart-unit in row 1 / col 1, .chart-y and the svg in row 2, .chart-x in row 3 / col 2, so the rows line up. All the coupled values sit in one CSS block and the labels are integers that will not wrap. Acceptable. If someone changes the SVG height later, they must change 176 to (height + 16). A one-line CSS comment, or a custom property such as `--plot-h`, would make that harder to miss. Optional.

## Escalate to Architect
None. Bob's two questions, answered at code level:
- Max 1 -> 0·1·2: keep it. [0,1] would leave a single interval and no midline. A 1-visit day sitting at half height correctly shows "very little". The 3-tick floor also keeps the label column from collapsing.
- 99/100 -> 0·50·100: fine. The ≤4-interval rule gives 1/2/5 steps, and 50 is the smallest step that covers 100 in ≤4 intervals (20 would need 5). It is coarse, but the table and desc give exact values.

## Cleared
Reviewed:
- niceTicks: traced 0, 1, 2, 4, 5, 7, 12, 16, 46, 99, 100, 1234 and NaN. The loop always ends for finite input, the output is integers from 0 and the top tick is ≥ max.
- Bar scaling to the top tick (12/15 -> 80).
- Gridlines for non-zero ticks only, drawn before the columns, with the base line after them.
- y/x labels are aria-hidden and the desc states the 0-to-top range, so screen readers get no duplicate labels.
- Tick text is numeric only via count(). All other strings still go through esc.
- No style attributes or JS added. _headers/CSP unchanged. The only caller (admin-view.mjs:232) uses the default desc.
- Tests cover the ticks, the invariants, bar heights and gridline order.
