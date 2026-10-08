# Review Request — ADMIN-CHART-AXIS
Date: 2026-10-08
Ready for Review: YES. Status **DONE** locally (not committed, not pushed). Brief: orchestrator, owner request 2026-10-08 ("the trend chart has no vertical scale").

## Files Changed
- scripts/lib/admin-chart.mjs:6-8 — header note on the y-axis approach.
- scripts/lib/admin-chart.mjs:16-35 — `niceTicks(max)`: 1/2/5×10^n integer step, ≤4 intervals, ≥2 intervals (3–5 ticks), top ≥ max; max ≤ 0/NaN → [0,1,2].
- scripts/lib/admin-chart.mjs:64-66, 72 — ticks/scale; desc mentions the scale; columns scaled to the top tick.
- scripts/lib/admin-chart.mjs:77-82, 86-91 — gridlines per non-zero tick (before columns), HTML tick labels top-down, "(회)" unit label replaces the "최대 N회" caption.
- scripts/lib/admin-view.mjs:297-305 — `.chart` 2-column grid, `.chart-unit`, `.chart-y` (flex space-between, 176 px with -8 px margins so label centres hit the gridlines), SVG overflow visible, solid gridlines, `.chart-max` removed, `.chart-x` in the plot column.
- tests/unit/visits.test.ts:28, 301, 309-341 — niceTicks cases (0, 1, 7, 16, 46, 99, 100, 1234, NaN + invariants); bar heights use the top tick; gridline positions/order; desc updated.
- tests/unit/__snapshots__/admin-full-7.html — CSS lines only.

## Open Questions
- Max 1 gives 0/1/2 (3 ticks, integers only) — half the plot empty for a 1-visit day; acceptable, or prefer [0,1]?
- 99 and 100 give 0/50/100 (3 ticks); coarse but within 3–5.
- Label alignment relies on line-height 16px and the 160 px SVG height staying in sync (both in the same CSS block).

## Verification
- Unit 1153/1153; astro check 0 errors; `wrangler pages functions build functions` OK (no new imports).
- qa:admin --shots: C:/Users/force/AppData/Local/Temp/claude/C--dev-doc-tools-kr/c205501f-e2a7-4258-9052-12a611236632/scratchpad/admin-axis-shots/after/ — 360 px scrollWidth 360 in all scenarios, light and dark.

## Out of Scope (logged in BUILD-LOG)
- None.
