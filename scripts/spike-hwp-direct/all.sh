#!/bin/sh
# SPIKE-HWP-DIRECT full run: print baseline (Chromium), then every approach in every browser, desktop, then scores.
set -x
R="node scripts/spike-hwp-direct/run.mjs"
$R --baseline --set all
for b in chromium firefox webkit; do $R --browsers $b --approaches C,H,A,B --set all --tag desktop --timeout 900; done
node scripts/spike-hwp-direct/score.mjs desktop
