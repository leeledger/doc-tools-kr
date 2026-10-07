# Review Feedback — ADMIN-UI
Date: 2026-10-07
Ready for Builder: YES

## Must Fix
None.

## Should Fix
- scripts/lib/admin-view.mjs:40 (confidence: 5/10) — the rate delta is `Math.round(cur - prev)` on unrounded rates, while the card shows `pct(kpi.rate)` (rounded). The previous rate is never shown, so a reader cannot see a mismatch. Leave as is unless the previous rate is ever shown.

## Escalate to Architect
- Bob's four open points are code-level choices that fit the brief. Arch, confirm the wording: (1) "직전 N일보다" in place of the brief's "지난 7일보다", since it avoids reading as the current period and matches the visible label; (2) the grade is judged on the rounded %, so 94.5 shows "95% 좋음" and the word matches the number; (3) when the previous rate had no attempts it shows "새로 생김", and when the current rate has none it shows "변화 없음"; (4) "직전 N일 대비" is one note under the KPI grid. None of these blocks the step.
- The PUBLIC_USAGE_SAMPLE sentence only appears if the variable is also set as a Pages runtime variable. Today it is a build variable only. That is correct while the share is 1, but record it in the deploy runbook.

## Cleared
I checked these and they pass:
- **Function:** the HEADERS/CSP diff is limited to the import, Env and render-call lines. REALM, MIN_PASSWORD, the 404/301 order, period() and the constant-time compare are unchanged.
- **Escaping:** every value from the rows is escaped where it is output. This covers tool and phase labels, the raw code and its label in `<code>`, setting and guide tables, and notice text. Numbers go through count(), pct() or barPct() as integers, and the tabs come only from PERIODS.
- **SQL:** usagePrevSql takes only a dataset checked against DATASET_RE and days from COMPARE_PERIODS. Its window (2N, N] does not overlap the current window (N, now].
- **Previous-period failure:** if fetchPrevTotals fails, prev becomes null and the cards show "비교 없음". 90 days runs no previous-period query and shows the retention note.
- **fetchPrevTotals:** an unknown or prototype `kind` is ignored.
- **runSql:** the extraction behaves the same as the old inline run().
- **Delta math:** checked prev 0, both 0, rounding to -0 (shows "0%"), and null/undefined rates. Grading matches the brief: 95/80 boundaries, few under 20 attempts, none shows "-", and the glyph plus word means colour is never the only signal.
- **Weekly report:** the totals/tables fields of shapeUsage are untouched and pinned by the step-0 snapshot.
- **Assets:** no script and no external URL.
- **Accessibility basics:** lang="ko", one h1, aria-current on the tabs, th scope="col", aria-labelledby on each table, a focusable scroll region, sr-only sentences, and 44px targets.
