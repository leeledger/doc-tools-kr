# Architect Brief — ROMANIZE1016: 영문 이름 변환기 (/english-name/)

Author: Arch. Date: 2026-10-16. Worktree C:/dev/doc-tools-kr/wt/romanize-1016 (branch romanize-1016 = 30cd5ea).
Owner approval 2026-10-16: build #1 from reports/growth/tool-scout-2026-10-16.md. Every TOOLS1015 locked decision
(ARCHITECT-BRIEF-TOOLS1015.md 2-8: zero new core glyphs, registration list, live at deploy + NOT_PRECACHED /
RUNTIME_PAGES, budgets, usage whitelist, copy rules) applies unless overridden here. Bob copies "Log notes" (end) into
BUILD-LOG when R0 starts. Source evidence fetched by Arch today is in `handoff/sources/romanize1016/` (read it; do
not re-scrape what is there).

## Goal
A new live tool /english-name/ 「영문 이름 변환기」: type 성 and 이름, see the passport romanization in three shapes
(붙여 쓰기 / 붙임표 / 빈칸), the surname spellings and given-name syllable spellings from the 외교부 statistics list
with their share, copy any row, continue to 여권 사진. Pure client code, no new npm package, no network.

## Demand (scout report 2026-10-16, Naver keyword tool, monthly)
영문이름 변환기 66,000 (66 % mobile) · 영문이름 14,420 · 여권 영문이름 조회 5,640 · 영문 이름 표기 5,110 · 여권
영문이름 변환기 4,790 · 영문 이름 변환 4,210 · 한글 영문이름 변환기 2,030. Naver-only demand (Google trend 0-2); no
Naver widget on the SERP; 1st is 외교부 「추천 로마자 성명 검색」, 2nd a personal site.

## Sources (all fetched 2026-10-16; verbatim text in handoff/sources/romanize1016/)
| Id | Source | What it gives us |
|---|---|---|
| S1 | 국립국어원 「국어의 로마자 표기법」 https://korean.go.kr/kornorms/regltn/regltnView.do?regltn_code=0004 (현행 [시행 2014. 12. 5.] 문화체육관광부 고시 제2014-42호) → kornorms-romanization.txt | 제2장 letter tables; [붙임 1] 「‘ㄱ, ㄷ, ㅂ’은 모음 앞에서는 ‘g, d, b’로, 자음 앞이나 어말에서는 ‘k, t, p’로 적는다.」; [붙임 2] 「단, ‘ㄹㄹ’은 ‘ll’로 적는다.」; ㅢ 「‘ㅢ’는 ‘ㅣ’로 소리 나더라도 ui로 적는다.」; 제3장 제4항 「인명은 성과 이름의 순서로 띄어 쓴다. 이름은 붙여 쓰는 것을 원칙으로 하되 음절 사이에 붙임표(-)를 쓰는 것을 허용한다.」 + 「1. 이름에서 일어나는 음운 변화는 표기에 반영하지 않는다.」 (한복남 Han Boknam (Han Bok-nam), 홍빛나 Hong Bitna (Hong Bit-na)) + 「2. 성의 표기는 따로 정한다.」; 제7항 「인명, 회사명, 단체명 등은 그동안 써 온 표기를 쓸 수 있다.」 |
| S2 | 외교부 여권안내 「로마자성명 표기의 기본방법」 https://www.passport.go.kr/home/kor/contents.do?menuPos=37 → passport-menuPos37.txt | 「가족관계등록부에 등록된 한글성명을 문화체육관광부장관이 정하여 고시하는 표기 방법에 따라 음절 단위로 음역에 맞게 로마자로 표기합니다.(여권법 시행규칙 제2조의2제1항)」; HONG GILDONG, KIM BITNA; 「로마자성명 중 이름은 붙여 쓰는 것이 원칙이나 음절 사이에 붙임표를 첨가할 수 있으며, 희망할 경우 띄어 쓰는 것도 허용 됩니다.」 + VISA caution; 「여권의 로마자성명은 국외에서 신원 확인의 기준이 되므로 여권 최초 발급 시 신중히 표기 하여야 하며」 |
| S3 | 외교부 「로마자성명 표기 제도」 menuPos=36 → passport-menuPos36.txt | 「여권 로마자성명 표기는 여권 명의인 한글성명의 발음 을 국제적으로 통용되는 로마자로 보여주는 수단 일 뿐이며, 영어 이름이 아닙니다.」; 「여권 재발급시 로마자성명은 이전 여권과 동일하게 표기하는 것을 원칙으로 하고 있습니다.」 |
| S4 | 외교부 「로마자성명 표기의 변경 허용 요건」 menuPos=39 → passport-menuPos39.txt | 11 change reasons (여권법 시행령 제3조의2 제2항), the 50 % / 1만 명 rule, family surname matching (「「 성 」 만 일치가 가능하고 「 이름 」 은 변경 불가」), negative-meaning examples 「강(GANG, 폭력단), 신 (SIN, 죄), 석 (SUCK, 빨다), 일 (ILL, 병든), 범 (BUM, 부랑자), 건 (GUN, 총), 길 (KILL, 죽이다), 노 (NO, 아니), 빈 (BIN, 쓰레기통), 덕 (DUCK, 녀석), 박 (BARK, 짖다)」, single-letter names 「김/아 : KIM A → KIM AH 변경 가능」 |
| S5 | 외교부 PDF 「로마자표기 성명의 정정 등이 제한되는 예시 목록」 (linked from menuPos=39; streamdocs viewer, not fetchable by script; downloaded via the owner's Chrome, sha256 1ea46bbb…a8d0) → mofa-list-2024-10-31.txt | **Official statistics, 2024.10.31 기준: 20 surnames (강 권 김 박 배 백 서 송 신 오 유 윤 이 임 장 전 정 조 최 한) and 100 given-name syllables, each with spellings, 사용자 수 and 비율**, plus 「*SIN은 부정적 의미로 변경 가능」-style marks |
| S6 | 외교부고시 제2024-10호 「…로마자 성명의 정정 또는 변경이 되지 않는 기준에 관한 고시」 PDF (same page, sha256 bacbaa01…5196) → mofa-gosi-2024-10.txt | the list is 「2024.10.31.기준 유효여권에 표기된 … 대표적인한글 성(姓)20개 및 한글 이름 음절 100개의 사용자 수 및 비율을 추출한 것으로 예시적인 목록이며,모든 성 및 이름을 포함하지는 않음」 |
| S7 | 여권법 시행령 제3조의2 (law.go.kr lsInfoR.do?lsiSeq=283271&chrClsCd=010202&urlMode=lsInfoP&efYd=20260301&ancYnChk=0, [시행 2026. 3. 1.]) → passport-act-decree-3-2.txt | statutory text of the change reasons |
| S8 | 외교부 「추천 로마자 성명 검색」 menuPos=38 (romanizeAutomatic), queried through the owner's Chrome → mofa-search-oracle.txt | 28 real outputs used as a **test oracle only**, never quoted on our pages |
| S9 | menuPos=11 (온라인 재발급) | 「로마자성명(배우자의 로마자 성 포함) 변경 희망자」 cannot apply online |

**Surname finding (the scout's open question): an official list exists (S5/S6).** 국립국어원 has no adopted surname
rule (S1 「성의 표기는 따로 정한다」). No other source is used. Anything outside the 20 surnames gets the 표기법
result only. Never a number that is not in S5.

## Locked decisions

**D1 Slug and copy (core; every string below measured with `uiCharSets('src').core` on this base: all OK).**
- Slug `english-name` (ASCII, keyword-shaped; renaming later = `public/_redirects` line).
- name = h1: 「영문 이름 변환기」.
- title (36): 「영문 이름 변환기 — 여권 영문 이름 로마자 표기 무료 | 문서딱」
- description (79): 「한글 이름을 여권 영문 이름으로 바꿔요. 로마자 표기법과 많이 쓰는 성씨 표기, 붙임표 넣은 이름까지 한 번에
  보여 드려요. 가입 없이 무료.」
- summary (57): 「한글 이름을 쓰면 국어의 로마자 표기법에 맞는 여권 영문 이름과 많이 쓰는 성씨 표기를 보여 드립니다.」
- keywords: 영문이름 변환기, 영문 이름 변환, 여권 영문 이름, 로마자 변환, 한글 이름 영어로, 성씨 영문 표기.
- FAQ (6; 1-5 measured OK, Bob may tune within D9 and re-measure):
  1. 여권 영문 이름은 어떻게 정하나요? → 「여권의 영문 이름은 나라에 등록된 한글 이름을 음절마다 국어의 로마자 표기법에
     맞춰 적습니다. 이름은 붙여 쓰는 것이 기본이고, 음절 사이에 붙임표(-)를 넣거나 빈칸을 두는 것도 됩니다. 여기서 성과
     이름을 쓰면 세 가지 모양을 한 번에 보여 드립니다.」
  2. 성씨는 어떤 영문 표기를 쓰나요? → 「국어의 로마자 표기법은 성의 표기를 따로 정한다고만 적고 있습니다. 그래서 이 도구는
     외교부가 공개한 여권 통계 예시(2024년 10월 31일 기준)에 있는 성 20개는 많이 쓰는 표기와 비율을 함께 보여 드리고,
     나머지 성은 표기법대로 옮긴 결과를 보여 드립니다. 부모님이나 형제와 같은 성 표기를 쓰고 싶다면 그 여권의 표기를 직접
     넣을 수 있습니다.」
  3. 이름 음절 사이에 붙임표(-)를 넣어도 되나요? → 「네. 외교부 안내에 따르면 이름은 붙여 쓰는 것이 기본이지만 음절 사이에
     붙임표를 넣을 수 있고, 원하면 빈칸을 두어도 됩니다. 다만 한 번 정한 모양은 나중에 바꾸기 어려울 수 있으니 처음에 잘
     정해 두세요.」
  4. 이미 받은 여권의 영문 이름을 바꿀 수 있나요? → 「정해진 경우에만 됩니다. 외교부는 여권을 다시 받을 때도 영문 이름을
     전과 같게 적는 것이 기본이라고 안내합니다. 개명, 해외 유학·취업, 처음 받은 여권을 아직 쓰지 않은 경우처럼 법령이 정한
     이유가 있을 때만 바꿀 수 있습니다.」 + link 외교부 menuPos=39 (and the guide after R4).
  5. 쓴 이름이 어디로 보내지나요? → 「어디로도 보내지 않습니다. 영문 이름은 이 기기 안에서 바로 만들고, 쓴 이름은 저장하지
     않습니다.」
  6. 여권 사진도 필요하다면? → one sentence + link /id-photo/?preset=passport_online (Bob measures).
- 사용 방법 (3, OK): 성과 이름 쓰기 · 표기 고르기 · 복사해 여권 신청서에 쓰기.
- 알아 두면 좋아요 (1 block, OK): 「여권 영문 이름은 한 번 정하면 거의 바꿀 수 없습니다. 지금 쓰는 여권이나 부모님 여권의 성
  표기와 맞추고, 마지막 확인은 외교부 여권 안내에서 하세요.」 + 가입·설치 없이 무료.
- **Core glyphs missing on this base — never in page / tools.ts / og copy:** 띄 줘 줍 존 족 김 박 윤 황 홍 뜻 철 렵 칙 꾼
  쉽 좁 (plus the TOOLS1015 and STAMP1015 lists). So: no 「띄어 쓰기」 in core (say 「빈칸 넣기」 / 「빈칸」), no
  「보여 줘요 / 줍니다」 (「보여 드려요 / 드립니다」), no 「기존」 (「지금 쓰는」), no 「가족」 (「부모님이나 형제」), no
  surname examples 김·박·윤·황·홍 in core (examples live in the controller = late copy; the input placeholder is set
  by the controller). Tripwire 94,884 B untouched; Bob lists new core characters per commit (must be none).
- Owner's note, verbatim, as **late** copy in the result panel (it uses 렵·존·족): 「여권 영문 이름은 한 번 정하면 바꾸기
  어려워요. 기존 여권·가족 표기와 맞추고, 최종 확인은 외교부 안내를 따르세요.」 with links 외교부 기본방법 (menuPos=37),
  변경 허용 요건 (menuPos=39), 추천 로마자 성명 검색 (menuPos=38), new tab, rel="noopener".

**D2 Romanization engine (pure `src/tools/english-name/romanize.ts`, hand-rolled; no DOM).**
- **es-hangul is not used (measured 2026-10-16, es-hangul 2.4.0, MIT, `romanize` tree-shaken 5,074 B gzip).** It applies
  sound changes across the string, which S1 제3장 제4항 1 forbids for names: 김복남 → gimbongnam (Boknam), 정연 →
  jeongnyeon (Jeongyeon), 신윤복 → sinnyunbok, 윤석렬 → yunseongnyeol (외교부 S8: YUN SEOKRYEOL), 박한별 → bakanbyeol
  (S8: HANBYEOL). Per-syllable calls lose liaison (석우 → seoku; S8: SEOGU) and ㄹㄹ (설리 → seolri; S8: SEOLLI), and drop
  final ㅎ (좋 → jo). The correct rules are one cited table (about 80 lines); no dependency.
- Decompose U+AC00–D7A3 arithmetically. Initials: ㄱ g · ㄲ kk · ㄴ n · ㄷ d · ㄸ tt · ㄹ r · ㅁ m · ㅂ b · ㅃ pp · ㅅ s ·
  ㅆ ss · ㅇ (none) · ㅈ j · ㅉ jj · ㅊ ch · ㅋ k · ㅌ t · ㅍ p · ㅎ h. Vowels: S1 제2장 제1항 exactly (ㅢ → ui always).
- Final in **standalone** position (end of a part, before a consonant, or in hyphen/space shapes): ㄱ ㄲ ㅋ ㄳ ㄺ → k ·
  ㄴ ㄵ ㄶ → n · ㄷ ㅅ ㅆ ㅈ ㅊ ㅌ ㅎ → t · ㄹ ㄼ ㄽ ㄾ ㅀ → l · ㅁ ㄻ → m · ㅂ ㅍ ㅄ ㄿ → p · ㅇ → ng (S1 [붙임 1],
  examples 빛나 Bitna, 월곶 Wolgot, 한밭 Hanbat; Bob fetches 표준 발음법 제9-11항 verbatim into the log as the
  representative-sound source: Unverified (b)).
- **Joined shape, inside one part (surname or given name, never across them):** if the next syllable starts with ㅇ, the
  final moves to it (liaison; S1 [붙임 1]/[붙임 2] 「모음 앞에서는」; S8 석우 SEOGU): single finals use their initial
  value (ㄱ g, ㄷ d, ㅂ b, ㄹ r, ㅅ s, ㅈ j, ㅊ ch, ㅌ t, ㅍ p, ㅋ k, ㄲ kk, ㅆ ss, ㄴ n, ㅁ m; ㅎ → h, no ㅎ-drop since
  that is a sound change); double finals keep the first part as the final and move the second (ㄳ k+s, ㄵ n+j, ㄶ n+h,
  ㄺ l+g, ㄻ l+m, ㄼ l+b, ㄽ l+s, ㄾ l+t, ㄿ l+p, ㅀ l+h, ㅄ p+s); ㅇ stays ng. **ㄹ final + ㄹ initial → ll** (S1 [붙임 2];
  S8 설리 SEOLLI). Everything else: standalone final + next initial, **no** nasalization, ㄴ/ㄹ insertion,
  palatalization, aspiration or tensing (S1 제3장 제4항 1; S8 복남 BOKNAM, 종로 JONGRO, 석렬 SEOKRYEOL, 선영
  SEONYEONG).
- Hyphen shape: each given-name syllable standalone, joined with 「-」 (S1: Bok-nam, Bit-na; 석우 → SEOK-U). Space shape:
  each syllable standalone, joined with one space (S2 「띄어 쓰는 것도 허용」). The surname is always one joined word
  (남궁 → NAMGUNG, S8) and is never hyphenated or spaced (Known Gap).
- Case: [여권처럼 모두 대문자 (default) | 첫 글자만 대문자]. Title case = first letter of the surname and of the given
  name upper (Hong Gildong, Hong Gil-dong: S1 style, lower after the hyphen); space shape capitalises each word.
- Input: 성 1-2 and 이름 1-10 precomposed Hangul syllables after NFC, trim and removing inner whitespace; lone jamo,
  Latin, digits, 한자, emoji → late inline error 「한글 이름만 바꿀 수 있어요. 받침까지 다 쓴 글자로 넣어 주세요.」;
  results hidden until valid. maxlength 2 / 10.
- **Deviation logged, not mimicked:** the 외교부 search tool (S8) shows some non-표기법 spellings (의 → EUI, 옥 → OCK, 신
  → SHIN, 정 → JEONG only, 오 → OH). Our 「표기법」 rows follow S1 strictly; their alternatives appear only where S5 lists
  them (OCK, SHIN, OH, JEONG are in S5; EUI is not, so it never appears).

**D3 Surname and syllable spellings (data `src/tools/english-name/mofa.ts`, from S5 only).**
- Shape: `SURNAMES` (20) and `GIVEN` (100): `{ [hangul]: { total, spellings: { s, count, pct, negative? }[] } }` in PDF
  order + `MOFA_LIST = { title, pageUrl (menuPos=39), asOf: '2024-10-31', retrieved: '2026-10-16', sha256 }`. Bob
  transcribes from mofa-list-2024-10-31.txt by script, then a unit test proves the transcription (Test map).
  `negative` exactly where S5 marks it: surname 신 SIN; given 신 SIN, 건 GUN, 근 GUN, 구 GOO, 국 KOOK, 덕 DUCK, 범 BUM,
  석 SUCK, 일 ILL.
- **Surname choices** (radiogroup): if the surname is in `SURNAMES`: its listed spellings, highest count first, each
  with 「N%」 (late caption 「외교부 여권 통계 예시(2024년 10월 31일 기준)에서 이 성을 가진 사람 중 이 표기를 쓰는 비율」),
  default = highest count (S1 제7항 「그동안 써 온 표기를 쓸 수 있다」; nobody wants GIM at 0.42 %); plus 「표기법대로」
  (the D2 result) when it is not already listed (강 → GANG, 이 → I; 최 → CHOE is listed, so no extra). Not in
  `SURNAMES` → 「표기법대로」 only (default) + late line 「이 성은 외교부 통계 예시에 없어요.」. Always a last choice
  「직접 쓰기」 with a text field (A–Z, space, hyphen, 1-30; uppercased) for a parent's or sibling's spelling (S4 제3호
  allows matching a family member's surname). Rhee and the like come only from 직접 쓰기, never invented.
- **Given-name syllable choices:** for each syllable in `GIVEN`, a small radio row: 「표기법」 (D2 standalone form,
  default) + its listed spellings with 「N%」. Syllables not in `GIVEN` show no row. Default for the given name stays the
  표기법 (S2: 시행규칙 rule; S8 behaves the same).
- Composing a picked variant: a chosen variant is used verbatim; liaison (D2) applies only between two syllables that
  both use the 표기법 spelling, otherwise the 표기법 syllable takes its standalone form (unit-tested).
- **Warnings (late copy, under the rows; sources S4/S5 only):** (1) negative spelling: the surname spelling, the whole
  joined given name, or any hyphen/space segment equals one of GANG SIN SUCK ILL BUM GUN KILL NO BIN DUCK BARK (S4) or
  GOO KOOK (S5 marks) → 「영어로 읽으면 좋지 않은 뜻이 될 수 있는 철자예요(외교부 예시). 다른 표기를 고를 수 있어요.」
  (2) single letter: the surname spelling or the whole given name is one of A I O U → 「한 글자 영문 이름은 항공권 예약이나
  출입국 때 불편할 수 있다고 외교부가 안내해요.」 (S4 KIM A → KIM AH). No other warnings (no unsourced
  "reads oddly in English" heuristics).

**D4 UX (one page; no lazy split if D7 allows).**
- Form: 「성」 input (maxlength 2) and 「이름」 input (maxlength 10) side by side at 360 px and up, `autocomplete="off"`,
  `autocapitalize="off"`, `spellcheck="false"`, `enterkeyhint="done"`, no `name` attributes, no form `action`, submit
  prevented (the name never reaches a URL). Live update on `input` and `compositionend` (debounce 150 ms) + a 「영문 이름
  보기」 button that focuses the result. Placeholders set by the controller (late): 「예: 홍」 / 「예: 길동」.
- Result card (`aria-live="polite"`, announces only the first row, at most once per second): three rows 붙여 쓰기 ·
  붙임표 넣기 · 빈칸 넣기, each large text + 「복사」 button (aria-label 「{row} 복사」); status 「복사했어요」; refused
  clipboard → select the text + 「길게 눌러 복사해 주세요」 (late). Case toggle above the rows. Surname radiogroup and
  syllable rows below (roving tabindex, arrow keys, as stamp-maker's grid). Owner note (D1) + 외교부 links at the end.
- Paste of a full name into 성 (3+ syllables, caught on `paste` before maxlength cuts it): put syllable 1 in 성 and the
  rest in 이름 + late hint 「성과 이름을 나눠 넣었어요. 성이 두 글자면 고쳐 주세요.」.
- Static under the tool (core, Bob measures): source line 「표기 기준: 국어의 로마자 표기법(국립국어원), 외교부 여권안내
  로마자성명 표기 기본방법·통계 예시(2024년 10월 31일 기준). 2026년 10월 16일 확인」 with the two links.
- Chain block 「여권을 만든다면」: button 「여권 사진 규격 맞추기」 → /id-photo/?preset=passport_online (usage `next`
  once per page view, o=next v=id-photo as char-count); links to guides passport-photo, passport-reissue-photo,
  baby-passport-photo, intl-driving-license. No file handoff, no FLOW entry.
- Storage: none (no local/session storage, no IndexedDB, no URL state, no `beforeunload`). The name is never in a URL,
  title, file name or beacon.

**D5 Relation to existing pages (inbound in R3, `updated` bumped).**
- One-sentence body link to /english-name/ in guides intl-driving-license (its 영문 이름 FAQ), passport-photo,
  passport-reissue-photo, baby-passport-photo. /id-photo/ result for preset passport_online gets one late line
  「여권 영문 이름도 정해야 한다면 영문 이름 변환기」 (link, no beacon).
- RelatedTools: english-name → id-photo, id-copy, char-count; id-photo gains english-name (last).
- tools.ts entry inserted **immediately after `id-copy`**. HOME_DESC_ORDER: `english-name` right after `id-photo`
  (66k/month, Naver). NEXT_GUIDES: passport-photo, passport-reissue-photo, intl-driving-license (+ passport-english-name
  after R4). Icon: Latin "A" beside 「가」, outline style of the set.

**D6 Usage (scripts/lib/usage.mjs single source).** TOOLS += `english-name`; TOOL_LABELS 「영문 이름 변환기」.
`start` once per page view at the first valid result (no o/v). `download` on 복사: o=`form`, v ∈ joined | hyphen |
space (SETTINGS `form`, SETTING_LABELS 「이름 모양」, VALUE_LABELS 붙여 쓰기 / 붙임표 / 빈칸). `next` on the id-photo
button. No `fail` (pure code; bad input is not a failure). **Never** the name, syllables, lengths, surname choice, list
membership, case or warnings. If /privacy/ lists setting keys, add 「이름 모양」.

**D7 Budgets.** If `entry + controller + mofa` ≤ 10 KB gzip they ship in the initial JS (no lazy split, like
char-count); budget line `english-name initial JS` = measured + 20 % and < 30 KB. Else lazy on first focus/pointer like
stamp-maker. Page live at deploy, NOT_PRECACHED + RUNTIME_PAGES; precache logged (default, cloud flag-on, autoframe;
450 never raised). LHCI /english-name/ median of 5, thresholds unchanged.

**D8 Registration** = TOOLS1015 decision 3 list: tools.ts (after id-copy), page src/pages/english-name/index.astro,
og.json + gen-brand OG image, JSON-LD (WebApplication + FAQPage), sitemap / llms.txt, tool-facts, NEXT_GUIDES +
tool-guide-order, lighthouserc, qa:visual, site / polish / growth e2e lists, postbuild OG list, CLAUDE.md line 3
(「영문 이름 변환기」), docs/COPY.md line (D9), bgcloud LOCAL_SCOPE_RE, HOME_DESC_ORDER, gen-sw NOT_PRECACHED +
RUNTIME_PAGES, `updated` = ship date. **source-watch:** export the tool's cited sources (S1, S2, S4 HTML quotes; S5 as
`via: 'browser'`) from `src/tools/english-name/sources.ts` and add them to the watch-list builder like the id-photo
presets, so check:quotes --exact covers the tool page too.

**D9 Copy rules.** 문서딱 only; no 업로드/서버/브라우저/네트워크/메모리 (postbuild JARGON); lead with what the tool does;
「보내지 않습니다」 only in FAQ 5 and the small line beside the inputs (「쓴 이름은 이 기기 밖으로 보내지 않습니다.」 +
privacy link). Never 「공식」 / 「외교부 인증」 / 「정확한 여권 이름」 about our output; say 「표기법에 맞는」 and 「외교부
통계 예시」 and send the final check to 외교부. Never 「영어 이름」 for the result (S3: 「영어 이름이 아닙니다」); say
「영문 이름」 / 「로마자 이름」 (the keyword 「한글 이름 영어로」 stays in keywords only). No fear words. COPY.md gains an
영문 이름 변환기 line: 「영문 이름」, 「붙여 쓰기 · 붙임표 넣기 · 빈칸 넣기」 (never 「띄어 쓰기」 in core: missing glyph),
「외교부 통계 예시(2024년 10월 31일 기준)」 with N%, final check sent to 외교부; tool states 해요체, 사용 방법·FAQ 합니다체.

**D10 Guide (R4) 「여권 영문 이름 정하는 법」** — slug `passport-english-name`, query 「여권 영문 이름」, tools:
[english-name], cta /english-name/, related: intl-driving-license, passport-photo, passport-reissue-photo. Sections:
기본 방법 (S2 quotes: 음절 단위, 붙임표, 빈칸 허용 + VISA caution), 성 표기 (the 20-surname table from S5 with 사용자
수 and 비율, as of 2024.10.31; S6 quote that it is an 예시적인 목록), 바꿀 수 있는 경우 (S4/S7: the 11 reasons in plain
words; 성만 가족과 맞추기; 배우자 성 「spouse of」), 처음 받을 때 신중히 (S2/S3 quotes), 온라인 재발급 불가 (S9).
Frontmatter sources with `retrieved: '2026-10-16'`; S5/S6 PDF entries `via: 'browser'`. Ships only if check:quotes
--exact passes and the dup gate passes against passport-reissue-photo and intl-driving-license; else deferred and
logged. Guide body is system font; title / answer / buttons are core (measure).

## Flow
~~~
/english-name/ (static HTML: form, empty result card, static help, FAQ, sources, chain block)
  entry.ts (initial, D7) -> controller: placeholders (late), listeners
  input 성/이름 (input | compositionend, 150 ms) -> normalize (NFC, trim, strip spaces)
      paste 3+ syllables into 성 -> split 1 | rest + hint
      invalid -> inline error, result hidden
      valid   -> surname options: in SURNAMES ? listed (top = default) [+ 표기법대로] : 표기법대로   [+ 직접 쓰기]
              -> given syllables: each in GIVEN ? row (표기법 default + listed) : none
              -> compose(parts, picks) -> joined | hyphen | space -> case
              -> warnings (negative S4/S5, single letter S4) -> render rows + owner note
              -> usage start (once per page view)
  복사 -> clipboard.writeText --ok--> 「복사했어요」, usage download o=form
                              --refused--> select text + hint
  여권 사진 규격 맞추기 -> usage next -> /id-photo/?preset=passport_online
~~~

## Failure modes
| Path | Realistic failure | Handling | User sees |
|---|---|---|---|
| Rules | A sound change slips in (es-hangul-style) | D2 table + S1 examples + 28 S8 oracle rows in unit tests | — |
| Rules | Liaison wrong for a rare final (ㅎ, double) | D2 defines each; unit test per final × (next ㅇ, next consonant, end) | — |
| Data | Transcription error in 120 entries | unit: abs(count/total×100 − pct) ≤ 0.01, sum of counts ≤ total, 20 + 100 keys, negative set exact | — |
| Data | 외교부 republishes the list (new 기준일) | asOf shown in copy; S5 in source-watch as via browser (manual row every week); S4 HTML quotes in --exact | date visible; weekly issue |
| Trust | User treats our output as the final answer | owner note + 외교부 links on every result; FAQ 4; D9 bans 「공식」 | clear |
| Trust | A number not from S5 | postbuild: every 「N%」 on /english-name/ and the guide exists in mofa.ts | build fails |
| Input | 한자 / jamo / Latin / emoji / IME mid-composition | NFC + range check, error; update on compositionend | clear |
| Input | Full name pasted into 성 | D4 split + hint (e2e) | clear |
| Input | Two-syllable surname typed in one box | two inputs, 성 maxlength 2; hint says to fix a 2-syllable 성 | clear |
| Clipboard | Refused / missing (in-app views) | select text + hint (e2e with permission denied) | clear |
| Privacy | Name in URL / beacon / storage / title | no submit, no name attributes, usage whitelist (unit), e2e asserts URL, storage, request bodies | — |
| Budget | Data grows the initial JS | D7 budget line in check-dist | build fails |
| Font | Core glyph breach from examples | examples late; per-commit glyph list | build log |

No critical gap: every new path has handling plus a test, or fails the build.

## Unverified claims (Bob probes, logs verbatim; nothing assumed)
- (a) 고시 number: S1 shows 제2014-42호 as the latest; S4 cites 「국어의 로마자 표기법(문화체육관광부고시 제2024-27호)」.
  Probe korean.go.kr for 2024-27 and log; our copy cites no 고시 number either way.
- (b) 표준 발음법 제9-11항 (받침 대표음, 겹받침) verbatim from korean.go.kr kornorms; log URL + quote.
- (c) The source-watch User-Agent gets HTTP 200 from passport.go.kr menuPos=11/36/37/39 and the law.go.kr URL (Arch got
  200 with a browser UA).
- (d) navigator.clipboard.writeText on all 5 Playwright projects; the fallback path is e2e-tested where refused.
- (e) Naver reads the static title, description and FAQ without JS (view-source after deploy).

## Test map ([GAP → new] unless marked)
Unit (vitest):
- romanize.ts: every initial, vowel and all 27 finals standalone; liaison for every single and double final before ㅇ;
  ㄹㄹ → ll; ㄹ + ㅇ → r. No-assimilation set: 복남 BOKNAM, 빛나 BITNA, 종로 JONGRO, 석렬 SEOKRYEOL, 선영 SEONYEONG, 정연
  JEONGYEON, 윤복 YUNBOK, 한별 HANBYEOL, 국민 GUKMIN, 신라 SINRA, 백마 BAEKMA, 같이 GATI. Liaison set: 석우 SEOGU, 덕인
  DEOGIN, 갑을 GABEUL, 설아 SEORA, 낳은 NAHEUN. 의/희: 의 UI, 희 HUI, 영희 YEONGHUI, 의성 UISEONG. 쌍자음: 꺽정
  KKEOKJEONG, 똘똘 TTOLTTOL, 쌍 SSANG, 빠 PPA, 짜 JJA. Shapes: 복남 BOK-NAM / BOK NAM, 석우 SEOK-U, 설리 SEOLLI / SEOL-RI.
  Surnames: 남궁 NAMGUNG, 선우 SEONU, 황보 HWANGBO; 표기법 김 GIM, 이 I, 박 BAK, 최 CHOE, 노 NO, 강 GANG. Case toggle. All
  11,172 syllables → /^[a-z]+$/ standalone. Validation: jamo, Latin, 한자, emoji rejected; NFD input accepted after NFC.
- Oracle: all rows of mofa-search-oracle.txt; our 표기법 given name equals theirs except the logged deviations (의 →
  EUI, 옥 → OCK); when the surname is in SURNAMES our options contain their surname spellings that S5 lists (logged
  exceptions not in S5: 배 PAE; 남궁's 「NAM GUNGMINSU」 split ignored).
- mofa.ts: transcription checks (Failure modes); negative set exact; every spelling /^[A-Z]+$/.
- options.ts: surname choices (listed / not listed / 표기법 already listed / 직접 쓰기 validation), default = top count;
  variant + liaison rule; warnings exact-match only (강 표기법 GANG warns, 노 NO warns, 신 SIN warns, 길 GIL does not,
  GUNWOO joined does not, GUN-WOO segment does); single letter (아 → A, surname 이 표기법 I, 오 O).
- usage.mjs: english-name, form values, labels; never-name [TESTED → extend].
- postbuild / check-dist: sitemap, llms.txt, OG list, JARGON, meta lengths, budgets, glyph tripwire, forbidden 「공식」
  and 「영어 이름」 on /english-name/, every 「N%」 traceable to mofa.ts [TESTED → extend].
E2E (5 projects, no-upload guard on every test):
- english-name.spec.ts: 홍 + 길동 → HONG GILDONG / HONG GIL-DONG / HONG GIL DONG; 김 + 복남 → KIM BOKNAM default, GIM
  0.42% present, pick GIM → rows update; 정 → JUNG default with JEONG, CHUNG, JOUNG, CHEONG listed; 남궁 + 민수 → NAMGUNG
  MINSU; 강 + 하늘 → KANG HANEUL default, 표기법대로 GANG shows the warning; 직접 쓰기 「rhee」 → RHEE in all rows; 이 +
  영희 → syllable rows for 영 (YOUNG 79.67% …) and 희 (HEE …), pick YOUNG → LEE YOUNGHUI; case toggle → Hong Gildong /
  Hong Gil-dong; 「ㄱㄴ」 → error, rows hidden; paste 「홍길동」 into 성 → split + hint; copy → clipboard text equals the
  row; radiogroups by arrow keys; URL, localStorage, sessionStorage unchanged after typing; no request carries the name;
  여권 사진 button → /id-photo/?preset=passport_online with the preset selected [deep link TESTED].
- usage.spec.ts (cloud): start / download (o=form) / next bodies; never 「홍」, 「길동」 or 「GILDONG」.
- site / polish / growth lists, related, axe (form, error, radiogroups, notes) [TESTED → extend]; guide inbound links
  [TESTED → extend]; id-photo passport_online late line (e2e). LHCI /english-name/ (+ guide in R4). qa:visual light /
  dark / 360 px.

## Build order (commits; each green before the next)
- **R0** data + sources: src/tools/english-name/{mofa,sources}.ts (transcribed by a throwaway script from
  handoff/sources), mofa unit tests, source-watch wiring, check:quotes --exact green. No page.
- **R1** romanize.ts + options.ts (choices, compose, warnings) + unit tests incl. oracle. No page.
- **R2** page + controller + entry + CSS + full registration (D8) + check-dist block (D7) + e2e + axe + glyph log.
- **R3** usage (D6) + chain block + inbound links (D5) + cloud usage spec. → **Deploy A** after Richard "clear". Live
  smoke: phone + PC, 홍길동 / 김복남 / 남궁민수 / 강하늘, copy into a 메모 app, 여권 사진 button, beacon and GA requests
  name-free. After A (PC session): IndexNow ping, Naver 웹마스터 수집 요청 for /english-name/.
- **R4** guide passport-english-name (D10) if its gates pass. → **Deploy B**.

## Gates (per deploy; CLOUD-HANDOFF §3)
astro check 0 · vitest all · check:licenses OK (no new package) · check:quotes --exact (tool sources from R0; guide R4) ·
check-dist OK on default, cloud flag-on, autoframe and bg builds (precache KB logged; 450 never raised) · 0 new core
glyphs (list + tripwire margin logged) · new + regression e2e on 5 projects with the no-upload guard · lhci median of 5 ·
Richard "clear" · live smoke.

## Out of Scope (BUILD-LOG Known Gaps)
- English twin (/en/ Korean name romanization: real English demand, separate brief); name-first order (Gildong Hong);
  hyphenated or spaced surnames and 「spouse of」 composition; 한자 name input (needs reading data); McCune-Reischauer
  or North Korean variants; 영문 주소 변환기 (scout candidate, separate brief); ?name= deep links (names in URLs,
  never); /embed/ widget; surname data beyond the 20 in S5; any "reads oddly in English" heuristic.

## Acceptance
- /english-name/ live in menu (after 신분증 사본 만들기), home, sitemap, llms.txt, OG, JSON-LD; the e2e cases above pass on
  5 projects; every number on the page comes from mofa.ts with 「2024년 10월 31일 기준」; owner note and 외교부 links on
  every result; usage carries only start / form / next; 0 new core glyphs; budgets and precache ≤ 450 KB; LHCI
  thresholds; COPY.md and CLAUDE.md updated; Richard "clear"; live smoke done. Deploy B: guide live, check:quotes --exact
  green.

## Owner decisions (build proceeds on the defaults)
- **O1 slug** /english-name/ (default). **O2 push:** standing go-ahead per deploy when Richard is clear and CI is green.
- **O3 real devices (owner-only):** iPhone Safari + KakaoTalk in-app: type a name, copy a row, paste into 메모.
- Arch-decided (no owner call): hand-rolled engine (es-hangul rejected with measured outputs); surname and syllable
  spellings only from the 외교부 PDF list (2024.10.31); default surname = most used in that list, default given name =
  표기법; two inputs like 외교부; owner note as late copy verbatim, core-safe paraphrase in static help.

## Log notes (copy into BUILD-LOG "ROMANIZE1016 — brief" when R0 starts)
- 2026-10-16 Arch: ROMANIZE1016 brief (owner approved scout #1). New tool /english-name/ 「영문 이름 변환기」.
- Sources fetched 2026-10-16 (evidence in handoff/sources/romanize1016/): 국립국어원 국어의 로마자 표기법 (제2014-42호;
  제3장 제4항: 이름 붙여 쓰기 원칙, 붙임표 허용, 이름의 음운 변화 미반영, 성의 표기는 따로 정함); 외교부 여권안내
  menuPos 11/36/37/38/39; 여권법 시행령 제3조의2 ([시행 2026. 3. 1.]); 외교부 PDF 「로마자표기 성명의 정정 등이 제한되는
  예시 목록」 (2024.10.31 기준, 성 20 + 이름 음절 100, sha256 1ea46bbb…a8d0) and 외교부고시 제2024-10호 PDF (sha256
  bacbaa01…5196), both downloaded through the owner's Chrome (streamdocs viewer; not script-fetchable, so source-watch
  marks them via browser; the downloaded copies were removed from the owner's Downloads). The scout's open question is
  closed: the official surname list is S5.
- es-hangul 2.4.0 (MIT, romanize 5,074 B gzip) rejected: applies sound changes across the string (김복남 → gimbongnam,
  윤석렬 → yunseongnyeol); per-syllable loses liaison and ㄹㄹ. Hand-rolled engine per S1, checked against 28 outputs of
  외교부 「추천 로마자 성명 검색」 (oracle; their EUI / OCK quirks not mimicked).
- Core glyphs missing (never in core copy): 띄 줘 줍 존 족 김 박 윤 황 홍 뜻 철 렵 칙 꾼 쉽 좁.
- Open: O1-O3.
