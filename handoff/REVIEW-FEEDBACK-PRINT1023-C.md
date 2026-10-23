# Review Feedback — PRINT1023 Step C
Date: 2026-10-24
Ready for Builder: YES

## Must Fix
- none.

## Should Fix
- none.

## Escalate to Architect
- src/data/guide-schema.ts:91 `if (data.requires === 'id-camera') return idCameraOn;` with self-id-photo.md:11 `requires: id-camera` — confirmed: PUBLIC_ID_CAMERA=0 drops the whole guide, including the new 「찍은 사진 종이로 뽑기」 section. The section stays correct (it never needs the camera), but with the kill switch used the print how-to has no guide home; only the Step B /id-photo/ tool note + FAQ remain. Brief P15 placed it here on purpose; noting it so Arch decides if that is acceptable. Not a code defect.

## Cleared
Reviewed git diff 26d5866..8c564cd (guide section, new 찍스 source, updated date, 3-print-sheet.svg). Numbers: 10.2 cm × 15.1 cm matches the 찍스 B0 raw dump verbatim (「4x6 (10.2cm x 15.1cm)」, handoff/sources/print1023/print-size-2026-10-23.txt line 14, fetched 2026-10-24 = retrieved); 3.5×4.5 cm / 가로 3.5 cm 세로 4.5 cm rest on the existing 정부24 and 외교부 quotes; 「한 장에 8장」 is framed as what the 모아찍기 download holds (matches P4 35×45 -> 8). 「찍스는 … 적어 두었어요」 reads as one service's listing, not a standard. Button names 「인화용 모아찍기 만들기」/「모아찍기 내려받기」 match wt/print1023-b src/data/print-sheet.ts:9-10; the link is /id-photo/; the no-sheet line holds (사람인/잡코리아 이력서 presets have no mm). Brand 문서딱, plain Korean, no 편의점/키오스크/업로드/서버/dpi. SVG: no digits, white card background (reads in dark mode like the other figures), 4×2 tiles on a 3:2 sheet with grey outlines, role=img + title, meaningful alt on the img.
