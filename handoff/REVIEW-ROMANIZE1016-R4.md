# Review Feedback — ROMANIZE1016 R4 (guide 「여권 영문 이름 정하는 법」, a0935ef)
Date: 2026-10-16
Ready for Builder: NO (one Must Fix; deploy B waits for it)

Reviewed: `git diff f3e423b..a0935ef`. Sources compared word by word against handoff/sources/romanize1016/
(menuPos36/37/39, decree 3-2, gosi 2024-10, list 2024-10-31, kornorms). Re-run here: check:quotes --exact
281 verbatim (exit 0); vitest english-name-data + guides-schema 48 passed.

## Must Fix
- src/content/guides/passport-english-name.md:133 (confidence: 8): 「목록에 없는 성은 국어의 로마자 표기법대로 옮긴 표기를
  기준으로 생각하면 돼요.」 No source says this. The 고시 (mofa-gosi-2024-10.txt) says something else about unlisted
  names: 「목록에 없더라도 발음이 일치하는 표기는 변경 불가함.」 The guide's own table also shows the opposite. 김's
  표기법 spelling GIM has 0.42%, and 노 under 표기법 gives NO, which 외교부 lists as a negative spelling (menuPos=39). The
  sentence reads as an official rule, and a reader who follows it can choose MUN or GU while the family uses MOON or KOO.
  Fix: delete the sentence, or replace it with the 고시's own rule in plain words (「목록에 없는 성이나 이름도, 발음에
  맞는 표기라면 나중에 바꿀 수 없어요」). If you replace it, add that sentence as a quote to the existing 고시 PDF source
  entry (`via: browser`). The next paragraph already gives the right advice: check the family's passport first.

## Should Fix
- passport-english-name.md:143 (confidence: 7): case 3 drops the decree's condition. Decree 제3호 reads 「가족구성원이
  함께 출국하게 되어 … 일치시킬 필요가 있는 경우」. Line 135 states the condition, but the numbered list has no
  qualifier. Fix: 「**가족이 함께 출국해 성 표기를 맞출 때**」. The same applies to FAQ line 89 (「가족과 성 표기를 맞출
  때」 → 「가족이 함께 출국해 성 표기를 맞출 때」).
- passport-english-name.md:148 (confidence: 6): case 8 leaves out menuPos=39's condition that the new spelling must be
  the 음절 단위 음역 of the 가족관계등록부 이름 (「일치하지 않는 표기로는 변경이 불가합니다」). Optional half-sentence:
  「…1회에 한해, 한글 이름 소리에 맞는 표기로 바꿀 수 있어요.」
- scripts/check-dist.mjs:225-231 (informational, no change required): the rule checks that each number is in the set,
  not which spelling it belongs to. A 99.55% put on the wrong surname in prose would pass. The table is covered by the
  unit test (exact row = SURNAMES). The only prose figures are the FAQ's two numbers, and I checked them by hand: KIM
  99.55%, GIM 0.42%, both correct. A full-width 「％」 would also escape the regex. Acceptable as it is.

## Builder's questions
- Q1 (a citation for each case): not required. I checked all 11 against the decree text (passport-act-decree-3-2.txt)
  and menuPos=39. Cases 1-8 and the A/I/O/U example are covered by menuPos=39 quotes. Cases 9-11 are covered by the
  law.go.kr quote, and case 11's A/I/O/U example sits under 제11호 on menuPos=39. No case reads as unsupported once the
  Should Fix wording above is in. The 50% 또는 1만명 figure matches the 고시 (「50%이상 또는 1만 명 이상」).
- Q2 (the N% check): sound, with the scope limits above. Allowing a percentage from a quote is fine because the
  quotes themselves are checked verbatim by check:quotes, and only 50% qualifies today.
- Q3 (category and topic): 서류 / 여권·신분증 is right. It matches the id-card-copy precedent (서류 / 여권·신분증). The
  photo guides are 사진 because their subject is a photo; this one is not.

## Escalate to Architect
- None.

## Cleared
Everything else passes:
- the 20-row table against the PDF list and mofa.ts
- the SIN mark
- the verbatim quotes, all retrieved 2026-10-16
- the 고시 기준 date of 2024.10.31
- the menuPos=37/36/11 claims
- links both ways, and the orphan fix
- the TOOL_GUIDE_PINS and OWN_COUNT updates
- plain-language copy and the 문서딱 brand
- title and description, and the LHCI entry
