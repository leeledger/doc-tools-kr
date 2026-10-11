# Review Feedback — Step CHAIN-ADMIN
Date: 2026-10-11
Ready for Builder: YES

## Must Fix
None.

## Should Fix
- tests/e2e/chain.spec.ts:398 (confidence: 7/10) — The comment "the controller's own callback was queued before this one" does not hold for the shipped build. dist/_astro/controller.DceYiJKz.js wraps the import in Vite's preload helper: `f(async()=>{let{showNextStepsLater:e}=await import(`./next-steps-lazy.C1MD-Bxo.js`);...},__vite__mapDeps([2,3,1])).then(...)`. So the held request is the modulepreload link, and the controller's own `import()` only runs after the preload promise settles. That can happen after the test's `import(url)` resolves. The two rAFs cover the gap, and your positive control (no reset, so the group is visible) shows it on chromium. Because the final assertions are negative, a slow runner turns into a vacuous pass, not a red flake. Fix: reword the comment to say what really happens (preload, then import, then `.then`; the rAFs are the margin and the positive control is the proof). No code change needed.

## Escalate to Architect
None.

## Cleared
Reviewed and passed:
- **chains SQL:** unchanged guards (DATASET_RE, PERIODS). No new input reaches SQL. Alias `dest`. Exact SQL is pinned. fetchUsage runs 5 queries in Promise.all.
- **shapeUsage:** the TOOLS whitelist applies to both ends (`TOOLS.includes(r.tool) && TOOLS.includes(r.dest)`), so labels come only from TOOL_LABELS. Pair and perTool sorts and ties are right (stable sort over perChain in TOOLS order). Tables are appended at [5] and [6]. `next` is still skipped in the events loop.
- **admin-view:** the `note` arg is escaped (`esc(note)`), cells go through shapedSection `esc`, the sections come after s-via, and isEmpty treats chain-only data as non-empty.
- **Weekly report:** the md snapshot gains the two tables with correct ordering.
- **Unit tests:** genuine. The empty-block string matches emptyBlock(), and the XSS fixtures hit both ends.
- **e2e:** pdf-merge reset, photo-compress 2→1, and pdf-password fast reset are all genuine. In the pdf-password test the route counter is asserted (0 after the lock flow, >0 after unlock) and SWs are blocked in config.
- **Flake risk:** low. CI runs one project per job (ci.yml:120-126) at default workers on a small runner, retries 1 (firefox 2). photo-compress skips without OffscreenCanvas. The new tests use the same waits as the neighbouring stable tests.
