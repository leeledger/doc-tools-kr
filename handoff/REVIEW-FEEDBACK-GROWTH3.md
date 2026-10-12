# Review Feedback — GROWTH3 (G0, G1a, G1b, G2, G3, G4, G5 file)
Date: 2026-10-13
Reviewed: fe7ab71..a98ac2d on origin/main 29826f0 (worktree agent-affc46c244b6f0a9d)
Ready for Builder: YES

## Must Fix
None.

## Should Fix
- src/content/guides/jlpt-photo.md:74 (confidence: 7) — "여권용 규격 파일이라 JLPT가 정한 픽셀 크기는 아니지만, 안내한 비율·형식·용량에는 들어맞아요." reads as if JLPT set a pixel size. The source (jlpt.or.kr information_01, quoted) gives only the ratio, JPG and 1MB. Fix: say JLPT gives no pixel size, e.g. "JLPT는 픽셀 크기를 정하지 않았고, 413×531픽셀 파일은 안내한 비율·형식·용량에 들어맞아요." Under 5 minutes; visible text, so keep `updated` as is (new guide, not yet published).
- scripts/ops/lib/indicators.mjs:20 (confidence: 4, appendix) — `pathOf` keeps the query string, so a Search Console page key like `https://docttak.com/id-photo/?preset=passport_online` would not count toward the cluster or tool rows. Canonical tags should fold these into /id-photo/, so it may never happen. Option: strip `?…`/`#…` in pathOf, or log to BUILD-LOG and check the first live report.

## Escalate to Architect
- passport-photo-error and error 704 (Bob's escalation 3) — the CTA sends people who hit 704 back to /id-photo/?preset=passport_online, whose JPG has no 찍은 날짜. The guide says so at line 80 and makes no promise, and the blog file warns the team too. Whether gov24 rejects a file with no date at all is unknown. An owner upload test before D2 would settle it. This is a product decision, not a code issue.
- gov24-pdf-save names tools [pdf-merge] but its CTA is /jpg-to-pdf/ (Bob's open question). From the code side this is acceptable: pdf-merge's 4 are pinned, so the page does not change, and the body links both tools. Whether the guide should count as a pdf-merge guide (affiliate/next-step logic that keys on tools[0]) is for Arch.
- Rule for tools with fewer than 4 own guides (escalation 2; hometax-pdf-password stays a draft for now, as already decided).

## Verified
- Quote meaning spot-check against live sources (fetched today with the bot UA). passport-photo-error vs gov24 FAQ JSON (701/704/706/707/679): every claim matches, including the parts not quoted (그림판 JPEG 다시 저장, "6개월 이내인데 속성이 잘못된 경우에만" 날짜 변경, 입 벌림, 머리카락·안경·그림자). gov24-pdf-save vs the 인쇄 버튼 and 전자증명서 FAQs: PDF port → 민원발급불가, 전자문서지갑 수령, 3 send methods, no print/no capture, 열람용 download and 온라인발급(본인출력) all match. The "PDF 저장 불가" framing does not go beyond the source. I also checked intl-driving-license (신청장소 incl. 김해공항, 협약 지자체, 여권 사본 가능, 대리인 위임장), youth-card-photo (용도, 복지로 재발급, 방문/등기수령) and jlpt-photo (우편접수 3.5×4.5 cm 1매, 추가접수 온라인만): every unquoted sentence is on the official page.
- Decision 4: each of the 6 has ≥3 url quotes (5–8) with non-size facts, 5 FAQs, spec rows where numbers exist, 3 related. They are not agency-swap clones: each has its own procedure facts. Preset facts (413×531, 500 KB; id_card label) match id-photo-presets.ts.
- Titles 26–36 chars including " | 문서딱"; descriptions 64–75 (hub 67). G1 snippet numbers (한능검 당일 10시, 경찰 배경 있는 사진, 이력서 10 MB/5 MB) are all backed by existing quotes in the same file.
- Internal links: each new guide is linked from ≥1 existing guide's related list; preset ids in CTAs and the blog file exist (passport_online, id_card, half_card, kuksiwon, history, custom).
- G0 pins + exact-list test with the OWN_COUNT guard are real tests: they fail if a new guide names an unfrozen tool.
- indicators.mjs: weighted position, CTR, distinct top-5 queries, guide/tool split, brand via the exported BRAND (stateless regex, no /g), previous = latest earlier report with indicators, null-gsc and page×query-error paths. toolSlugs works on the CRLF checkout (15 slugs). Stored JSON has numbers only (no GSC query text in the growth-data comment). Tests check the numbers they compute (I re-derived 10.8 and −0.4), the error path through fetchGrowth, the 250/1000 limits, the 25-row table and a dry run.
- Drafts (7) are draft: true with blockedBy + tried. The whitelist holds apart from opportunities.mjs (accepted by the orchestrator).

## Cleared
I reviewed G0 pins, the G1 snippet edits (G1b kept, as decided), the six new guides against their live official sources, the seven drafts, the G4 indicators code and tests, the G3 axe additions and the G5 blog file. Nothing blocks.
