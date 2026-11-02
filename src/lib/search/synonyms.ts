// SEARCH1031 D7: the hand-made synonym map of the site search. Two tables:
// ALIASES fold equivalent spellings to one key before matching (query and index alike); CONCEPTS name the intent
// words of a task and the tools that do it. A slug missing from the built index (a flag-off tool) is skipped at
// runtime. Adding a word: docs/OPS-RUNBOOK.md 「사이트 찾기」; tests/unit/search-match.test.ts keeps the golden queries.

export interface Alias {
  /** The folded form. */
  key: string;
  variants: readonly string[];
  /**
   * Fold only at the start of a word (short or ambiguous Korean spellings: 사인 inside 디자인 must stay). Without it, a
   * variant is replaced wherever it appears (transliterations such as 피디에프 inside 피디에프합치기).
   */
  word?: boolean;
}

export const ALIASES: readonly Alias[] = [
  { key: 'pdf', variants: ['피디에프', '피디프', 'pdf파일'] },
  { key: 'jpg', variants: ['jpeg', '제이펙', '제이피지', '제이피이지'] },
  { key: 'png', variants: ['피엔지'] },
  { key: 'hwpx', variants: ['에이치더블유피엑스'] },
  { key: 'hwp', variants: ['아래아한글', '한글파일', '한컴', '한글'], word: true },
  { key: 'heic', variants: ['헤익', '아이폰사진'] },
  { key: 'qr', variants: ['큐알코드', 'qr코드', '큐알', '큐얼'] },
  { key: '누끼', variants: ['누끼따기'] },
  { key: '서명', variants: ['싸인', '사인', 'sign'], word: true },
  { key: '도장', variants: ['인감', '직인'], word: true },
  { key: '증명사진', variants: ['증사'], word: true },
  { key: '여권', variants: ['passport'] },
  { key: '영문', variants: ['영어', '로마자'], word: true },
  { key: '용량', variants: ['사이즈', '크기', '메가', 'mb', 'kb'], word: true },
  { key: '신분증', variants: ['주민등록증', '운전면허증'] },
];

// Flag-gated tools are named only in a build with their flag on (check-dist: a flag-off build never names them).
const BG_TOOL: string[] = __BG_REMOVE__ ? ['remove-background'] : [];
const ADDR_TOOL: string[] = __ADDR_EN__ ? ['english-address'] : [];

export interface Concept {
  id: string;
  /** Intent words (already in folded form, so 누끼 not 누끼따기). */
  terms: readonly string[];
  tools: readonly string[];
}

export const CONCEPTS: readonly Concept[] = [
  { id: 'merge', terms: ['합치기', '합치', '병합', '붙이기', '합본', '묶기', '하나로', '결합', '이어붙이기'], tools: ['pdf-merge'] },
  { id: 'shrink', terms: ['줄이기', '압축', '작게', '가볍게', '낮추기', '줄여', '축소'], tools: ['pdf-compress', 'photo-compress'] },
  { id: 'to-pdf', terms: ['pdf로', 'pdf변환', 'pdf만들기'], tools: ['jpg-to-pdf', 'hwp-to-pdf'] },
  { id: 'to-jpg', terms: ['jpg로', '이미지로', '사진으로'], tools: ['pdf-to-jpg', 'image-to-jpg'] },
  { id: 'open', terms: ['열기', '보기', '뷰어', '열람', '안열림'], tools: ['hwp-viewer'] },
  { id: 'split', terms: ['나누기', '분할', '자르기', '쪽', '페이지', '빼기', '삭제', '순서'], tools: ['pdf-split'] },
  { id: 'lock', terms: ['암호', '비밀번호', '잠금', '해제', '풀기'], tools: ['pdf-password'] },
  { id: 'sign', terms: ['서명', '도장', '날인'], tools: ['pdf-sign', 'stamp-signature', 'stamp-maker'] },
  { id: 'bg', terms: ['배경', '지우기', '없애기', '제거', '누끼', '투명'], tools: BG_TOOL },
  { id: 'idphoto', terms: ['증명사진', '여권사진', '반명함', '규격', '이력서사진'], tools: ['id-photo'] },
  { id: 'count', terms: ['글자수', '글자', '세기', '바이트', '자소서'], tools: ['char-count'] },
  { id: 'idcopy', terms: ['신분증', '사본', '가리기', '마스킹'], tools: ['id-copy'] },
  { id: 'edit', terms: ['글자넣기', '수정', '편집', '쓰기', '메모'], tools: ['pdf-edit'] },
  { id: 'name-en', terms: ['영문이름'], tools: ['english-name'] },
  { id: 'addr-en', terms: ['영문주소'], tools: ADDR_TOOL },
  { id: 'qr', terms: ['qr'], tools: ['qr-code'] },
  { id: 'card', terms: ['명함', '전자명함'], tools: ['business-card'] },
  { id: 'poa', terms: ['위임장'], tools: ['power-of-attorney'] },
  { id: 'loan', terms: ['차용증', '빌려', '빌린', '빌리', '빌림', '돈거래', '꿔준', '꾼돈'], tools: ['loan-note'] },
  { id: 'resign', terms: ['사직서', '퇴사'], tools: ['resignation-letter'] },
  { id: 'photo-format', terms: ['사진변환', 'heic'], tools: ['image-to-jpg'] },
  { id: 'hwpx-convert', terms: ['hwpx', '낮은버전'], tools: ['hwpx-to-hwp'] },
];

/** The empty-query and no-result list (D9), in this order; slugs missing from the index are skipped. */
export const POPULAR: readonly string[] = ['pdf-merge', 'pdf-compress', 'photo-compress', 'id-photo', 'hwp-viewer', 'jpg-to-pdf'];

/** Query words that never decide a match (D8). */
export const STOPWORDS: readonly string[] = ['파일', '하기', '방법', '법', '어떻게', '무료', '사이트', '온라인', '프로그램', '하는', '하고', '싶어요', '해주세요', '좀'];

/** Trailing particles stripped from a word of three or more letters (D8), longest first. */
export const PARTICLES: readonly string[] = ['으로', '을', '를', '이', '가', '은', '는', '로', '에'];
