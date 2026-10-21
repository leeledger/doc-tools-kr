# Review Request — CONTENT1021 Step B1
Date: 2026-10-21
Ready for Review: YES

## Files Changed
- scripts/lib/guide-length.mjs:18-23 — the 18 B1 slugs (17 guides + upload-limits hub) leave LENGTH_PENDING; only B2 guides and Step C tool paths remain.
- src/content/guides/gosi-photo.md — 인사혁신처 FAQ: 권장 사진, 쓸 수 없는 사진, 접수 취소기간까지 수정, 접수기간 안에 할 일, 응시수수료, 신분증 4종; 2 SVGs.
- src/content/guides/police-exam-photo.md — 경찰청 원서접수: 사진 등록 3단계, 원서·결제 순서, 응시수수료, 응시지구·의무복무, 접수기간 내 수정, 접수확인증 vs 응시표; 2 SVGs.
- src/content/guides/kuksiwon-photo.md — 국시원: 부적합 메시지, 최소 크기, 인터넷 접수 원칙, 사진 변경 두 경로(7일 전 / 정정 신청 약 3일); 2 SVGs.
- src/content/guides/qnet-photo.md — Q-Net 길라잡이: 사진 준비·등록 STEP, 여백·치우침, 원서접수 흐름, 자격증 발급 사진; 2 SVGs.
- src/content/guides/korcham-photo.md — 상공회의소: 1:1.25 비율, 상시시험 8단계, 합격자 첫 사진 승인 + 신분증 사본, 스캔 팁; 2 SVGs.
- src/content/guides/history-exam-photo.md — 한능검: 사진첨부 경로 두 가지, 안 보일 때(엣지/크롬), 시험 날 10:00/10:10, 준비물·응시료; 2 SVGs.
- src/content/guides/hanja-exam-photo.md — 한국어문회: 회원정보 사진(접수 후 변경은 다음 시험부터), 접수 순서, 신분증·모바일 불인정, PC 최적화; 2 SVGs.
- src/content/guides/jlpt-photo.md — JLPT: 온라인 순서·시험장 선착순, 사진 변경 기간, 규정 신분증(초등·외국인 포함), 배려 신청·취소; 2 SVGs.
- src/content/guides/teps-photo.md — TEPS: 스캔 여백·누운 사진, 접수/성적표 사진 변경, 시험장 수정 요구 1주일, 신분증·신분확인증명서; 2 SVGs.
- src/content/guides/admission-photo.md — 진학사·유웨이: 사진 등록 순서, 공통원서 흐름, 윈도·6시간, 예전 사진이 보일 때, 결제 후 취소 불가, 출력물 빨간 글씨; 2 SVGs.
- src/content/guides/resume-photo.md — 사람인(권장값·자동 회전·고객센터 대신 등록·내려받기)과 잡코리아(최대값·경로·10개), 회사 양식(반명함판 계산값 preset); 2 SVGs.
- src/content/guides/id-card-photo.md — 정부24: 신규 vs 재발급 표(14일, 수수료), 본인 신청, 발급신청확인서(공무원 시험·TEPS), 분실 순서; 2 SVGs.
- src/content/guides/driver-license-photo.md — 도로교통공단: 면허증 사진 표준 규격, 파일 범위, 사진 미리 등록, 건강검진 대체, 수수료·신체검사비, 나이별 주기, 연기; 2 SVGs.
- src/content/guides/youth-card-photo.md — 성평등가족부: 신청→접수→제작→교부, 대리인, 쓰임 + 청소년증을 받는 시험(TEPS·JLPT·한자), 14세 미만, 주민등록증과의 관계; old 「어디에 쓰나요」 section folded into the new one; 2 SVGs.
- src/content/guides/intl-driving-license.md — 수수료 9,000원, 본인/대리인 준비물, 여권용 사진만, 서명·영문 이름, 해외 운전 주의, 허가 범위 A/B; old one-line 대리인 sentence removed (now a full paragraph); 2 SVGs.
- src/content/guides/id-card-copy.md — 또렷하게 찍는 법, 사본 vs 등본·초본, PC·스캔, JPG/PDF, 다른 신분증, 보낸 뒤 정리, 금감원 명의도용 사례; 2 SVGs.
- src/content/guides/baby-passport-photo.md — 외교부 18세 미만: 창구 준비물(동의서·인감·2촌 친족), 8세 미만 수수료, 부모가 외국에 있을 때, 규격 맞추기·찍는 때·고르는 법·옷; 2 SVGs.
- src/content/hubs/upload-limits.md — hub sources (지메일, 전자소송 ×3 reused browser quotes, 장학재단); KB/MB, 파일 하나 vs 합계, 종류별 대처, 원서 사진 한도 비교, 파일이 큰 이유, 메일 vs 누리집, 스캔 설정, 한도에 딱 맞추지 않기; 2 SVGs.
- public/img/guide/<slug>/{1,2}-*.svg — 36 new SVGs (18 dirs).
- handoff/sources/content1021/<slug>-<n>.txt — 48 new excerpt files (URL, fetch date, verbatim lines).
- tests/unit/guides-schema.test.ts:53-57 — the 「print preset」 test pins `updated: '2026-10-06'` on its fixture (driver-license-photo's real `updated` moved past the test's fixed `now`); assertions unchanged.
- handoff/BUILD-LOG.md — Step B1 entry appended.

## Per-page chars (prod-like dist)
gosi 2,569 · police 2,545 · kuksiwon 2,580 · qnet 2,542 · korcham 2,534 · history 2,529 · hanja 2,537 · jlpt 2,549 · teps 2,549 · admission 2,543 · resume 2,536 · id-card-photo 2,555 · driver-license 2,555 · youth-card 2,521 · intl-driving 2,516 · id-card-copy 2,529 · baby-passport 2,537 · upload-limits 2,518.

## Gates
check 0/0 · vitest 2,085/2,085 · prod-like build + check-dist OK (62 WARN = B2/C pending only; UI fonts preloaded 92.1/92.66 KB; precache 431.1/450 KB) · check:quotes --exact 491 verbatim · check:licenses OK · e2e chromium hubs+growth+polish+site+id-copy 192 passed / 1 skipped.

## Open Questions
- Hub upload-limits reuses three 전자소송포털 quotes with their original `retrieved: '2026-10-02'` + `via: browser` (script-shell page; no new number — 20MB/100M were already hub table facts). OK, or do you want them re-read in a browser today?
- Margins over 2,500 are 16–81 chars on every B1 page. Acceptable as-is (bar met honestly), or should B2 aim higher?
- The 36 SVGs were written through a scratch helper (not committed); the committed artefacts are the plain SVG files. Commit the helper too?
- Please read for invented claims: I removed every unsourced statement I found (e.g. passport 10-year validity, tool rotate, Q-Net photo reuse); a second pair of eyes on the practical-advice sentences (사진 찍는 법 bullets) is welcome.

## Out of Scope (logged in BUILD-LOG)
- id-photo.spec.ts needs the auto-frame e2e build; not run against the prod-like dist (no tool code changed).
- qa:visual, LHCI, 5-project matrix not run this step.

## Round 2 (2026-10-21) — Richard's feedback
- Must Fix 1 kuksiwon-photo.md: 졸업예정자 sentence cut.
- Must Fix 2 driver-license-photo.md: 「10년 주기」 verbatim safedriving quote added (front matter + handoff/sources/content1021/driver-license-photo-2.txt); sentence states the 2011.12.9 condition.
- Must Fix 3 admission-photo.md: Chrome/Edge menu sentence cut.
- Should Fix: history timetable quote/excerpt extended to 10:20~10:30 답안지 및 문제지 배부; asides rephrased in youth-card, id-card-photo, history, hanja, qnet, police; police 「어디에 물어볼까」 sourced from useinfo02_2 footer.
- New sourced content where cuts dropped a page under 2,500: admission (진학사 April data deletion), history (성적·인증서 출력, 종이 통지 없음), youth-card (발급권자).
- Chars: kuksiwon 2,542 · driver-license 2,579 · admission 2,630 · history 2,560 · youth-card 2,522 · id-card-photo 2,548 · hanja 2,508 · qnet 2,541 · police 2,541.
- Gates: check 0/0 · vitest 2,085/2,085 · build + check-dist OK · check:quotes --exact 497.
- Not done in B1: sibling-boilerplate trimming (no margin); ECFS browser re-read deferred to before Step D (per your note).
