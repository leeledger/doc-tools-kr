# Architect Brief — CHAIN-ADMIN (이어서 하기 사용 수 + X2 테스트 보강)

Base: branch c2-cloud == origin/main, HEAD 6655357. Two parts; Part B touches tests only. One commit per part is fine.

## Goal
The owner sees how often 이어서 하기 is pressed (sender → receiver pairs + per-tool totals) on /admin/ and in the weekly report, and the three X2 test gaps from Richard (REVIEW-FEEDBACK.md Should Fix) are closed.

## Verified facts (Arch, 2026-10-11)
- `next` rows are already written: blob1='next', blob2=sender tool, blob5='next', blob6=receiver tool (usage.mjs header l.15, ONLY map l.80, client src/lib/ui/next-steps.ts:130). Counted on click, before the store attempt (X1 SF4) = "button pressed", not "file arrived".
- `shapeUsage` skips `next` (usage.mjs:406-407, comment says Known Gap). No query reads blob6 for next.
- Weekly report: scripts/ops/lib/report.mjs:102 prints `renderTables(usage, 'md', 3)` = every entry of `shaped.tables`. A new table in `shaped.tables` appears in the report automatically. **Decision: same tables in both** (one source, no drift).
- /admin/ is rendered by functions/admin/[[path]].ts → scripts/lib/admin-view.mjs. No src/pages/admin, nothing in public/ → not in dist, not in precache (446.8/450 untouched). STYLE uses `system-ui ... "Malgun Gothic"`, no @font-face/preload → UI font subset and core glyph budget unaffected. Bob confirms with builds that check-dist core 605/38, precache 440.5 (cloud 446.8) are unchanged.

## Flow
```
click 이어서 하기 -track{e:next,t:A,o:next,v:B}-> /api/usage -validate-> AE row(blob1=next, blob2=A, blob6=B)
/admin/ or growth.mjs -fetchUsage-> usageSql(): events, fails, settings, guides, chains(NEW)
                      -shapeUsage-> shaped.chains {total, pairs, perTool} + tables[5], tables[6] (NEW, appended)
   admin-view: sections s-chain + s-chain-tools (after s-via)     report.mjs: renderTables (automatic)
```

## Build Order — Part A (admin + weekly report)
1. scripts/lib/usage.mjs `usageSql`: add key `chains`:
   `SELECT blob2 AS tool, blob6 AS dest, ${N} AS n FROM ${dataset} WHERE ${where} AND blob1 = 'next' GROUP BY blob2, blob6 ORDER BY n DESC LIMIT 500 FORMAT JSON`
   - Alias `dest`, NOT `to`/`target` (avoid reserved words; one bad alias takes the whole usage block down because fetchUsage uses Promise.all).
   - Same guards (DATASET_RE, PERIODS); no new input reaches SQL.
2. `fetchUsage`: run it in the same Promise.all, return `{ events, fails, settings, guides, chains }`. Update its JSDoc (l.241) and the "four queries" comment. `usagePrevSql` unchanged.
3. `shapeUsage({ ..., chains = [] })`:
   - Keep only rows with `TOOLS.includes(tool) && TOOLS.includes(dest)`; drop others silently (as other tables do). Sum duplicate pairs.
   - `shaped.chains = { total, pairs: [{ from, fromLabel, to, toLabel, n }], perTool: [{ tool, label, sent, received }] }`. pairs: n desc, ties by TOOLS index of from, then to. perTool: only tools with sent>0 or received>0, (sent+received) desc, ties TOOLS order.
   - APPEND (do not insert: tests destructure tables[0..4]) two tables:
     - `{ title: '이어서 하기 (보낸 도구 → 받은 도구)', head: ['보낸 도구', '받은 도구', '횟수'], rows }`
     - `{ title: '이어서 하기 도구별 합계', head: ['도구', '보냄', '받음'], rows }`
   - Keep the events-loop skip of `next` (source of truth = chains query). Replace the Known-Gap comment with "next is counted from the chains query".
   - admin-view `isEmpty` uses `tables.every(...)` → chain-only data makes the page non-empty. Keep.
4. scripts/lib/admin-view.mjs `renderAdminPage`: destructure `[, , settings, guides, , chainPairs, chainTools]`; after `viaSection(...)` add `shapedSection('s-chain', chainPairs, [2])` and `shapedSection('s-chain-tools', chainTools, [1, 2])`. One note under the pairs section, existing muted style (e.g. `kpi-note`): 「이어서 하기 버튼을 누른 횟수예요. 파일이 다음 도구에서 열렸는지는 따로 세지 않아요.」 Optional `note` arg on `section()` or appended after it: Bob decides. Escaped like everything else.
5. functions/admin/[[path]].ts: no change expected (passes rows through). If touched: plain ESM imports only, **no JSON import attributes** (functions graph). noindex meta unchanged.
6. Usage whitelist (`BLOB_KEYS`, `ONLY`, `validate`, privacy text) NOT touched. Read-only change.

## Build Order — Part B (tests; tests/e2e/chain.spec.ts)
1. Reset hides the group, pdf-merge (cheapest; next to the l.247 test): reach done, assert slot visible with >=1 button, press the reset/다시 control, assert slot `hidden` and 0 buttons. Bob greps the real slot/reset ids.
2. photo-compress (extend l.387 or add one): two photos done → no group (hidden, 0 buttons); remove one row → group appears with the jpg-to-pdf button; one click still hands over as today. Existing photo fixtures.
3. pdf-password fast reset (controller.ts:409-414 guard `state === 'done' && blobUrl === shown`): e2e, not unit. `page.route` on the next-steps-lazy chunk (match by name pattern from dist, e.g. `/next-steps-lazy[^/]*\.js$/`; verify the real filename), hold the response; finish an unlock; click `#pp-reset`; release; wait for the chunk response; assert `#pp-next` hidden with 0 buttons.
   - Flag: the request must not be served by the service worker (first visit = no controlling SW; if the context is controlled, use `serviceWorkers: 'block'` for this test). Assert the route was hit (counter > 0) so it cannot pass vacuously.
   - If no separate chunk request exists, STOP and report. Do not restructure prod code for a test.

## Failure modes
| Path | Realistic failure | Handling | User sees |
|---|---|---|---|
| chains SQL | AE rejects the query (alias/syntax) | unit test pins exact SQL; usage block shows the existing notice 「도구 사용 통계를 불러오지 못했어요 (…)」 | clear notice, not silent (same risk as any existing query) |
| chains rows | unknown/renamed tool in blob2/blob6 | dropped by TOOLS whitelist; unit test | row missing (acceptable) |
| no next yet | empty rows | existing empty section text | clear |
| weekly report | grows by 2 tables | inline snapshot updated deliberately | n/a |
| XSS | labels only from TOOL_LABELS; shapedSection escapes | unit test with a hostile tool name proves it is dropped | none |
| e2e pdf-password | route never hit → vacuous pass | counter assertion | n/a |

No critical gap.

## Test map
- usageSql `chains` exact SQL; bad dataset/period still throws — [GAP] → add (usage.test.ts).
- fetchUsage runs 5 queries and returns chains — [GAP] → update the existing mock test (4→5 calls, deliberately).
- shapeUsage chains: pair sum, sort + ties, whitelist drop (unknown from, unknown dest), perTool sent/received, empty → empty tables — [GAP] → add.
- tables[0..4] unchanged; the `next` event still not in 도구별 (usage.test.ts:882) — [TESTED], must stay green.
- renderTables md inline snapshot (usage.test.ts:246) — [TESTED], update; FULL fixture gains a chains sample.
- admin-view: s-chain + s-chain-tools with escaped labels, right-aligned numbers, note text; chain-only data → not the empty block; noindex still present — [GAP] → add (admin-view.test.ts).
- e2e: pdf-merge reset hides group; photo-compress 2→none, remove 1→shows; pdf-password fast reset — [GAP] → add.
- Regression: chain.spec, usage, admin-view, visits, report/growth tests green.

## Out of Scope (→ BUILD-LOG Known Gaps if they surface)
- A "file arrived" metric for chains (needs a new event = privacy text change).
- Charts or previous-period comparison for next.
- Any site JS change; precache work.

## Acceptance
- vitest all green incl. new tests; astro check 0.
- Default build check-dist OK, core 605/38 and precache 440.5 unchanged; cloud build precache 446.8 unchanged.
- e2e chain.spec × chromium + mobile-chrome green (pdf-password route test ×3, not flaky); firefox/webkit once.
- Admin HTML (unit render, or wrangler pages dev if handy) shows both chain sections in 쉬운 한국어.
- REVIEW-REQUEST.md lists files + line ranges for Richard.
