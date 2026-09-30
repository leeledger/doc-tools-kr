#!/bin/sh
# SPIKE-HWP-DIRECT second pass: Chromium C/H again with the final writer (the first Chromium pass predates the
# SVG-picture and tspan support), the Chromium B files a harness reload killed, WebKit B on the 10 fixtures only
# (B fails the size rule in every browser; the full WebKit B pass would take ~1.5 h), then mobile emulation.
set -x
R="node scripts/spike-hwp-direct/run.mjs"
$R --browsers chromium --approaches C,H --set all --tag desktop --timeout 900 --force
$R --browsers chromium --approaches B --set all --tag desktop --timeout 900
$R --browsers webkit --approaches B --set fixtures --tag desktop --timeout 900
$R --baseline --mobile --browsers chromium --set all --only "^(law10|law09|adm28|kr17|kr18|adm04|adm16|kr01)$" --tag mobile-print --timeout 900
$R --mobile --browsers chromium,webkit --approaches C,B --set all --only "^(law10|law09|adm28|kr17|kr18|adm04|adm16|kr01)$" --tag mobile --timeout 900
# (second half, as run: the mobile B pass was cut short after adm04 took 712 s / +2.5 GB on the Pixel 7 profile)
# $R --mobile --browsers chromium --approaches B --set all --only "^(law10|kr17)$" --tag mobile --timeout 900
# $R --mobile --browsers webkit --approaches C --set all --only "^(law10|law09|adm28|kr17|kr18|adm04|adm16|kr01)$" --tag mobile --timeout 900
# $R --mobile --browsers webkit --approaches B --set all --only "^(law10)$" --tag mobile --timeout 900
