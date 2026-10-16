// The official sources /english-name/ follows (brief ROMANIZE1016, Sources S1-S5), all retrieved 2026-10-16. The source
// watch (scripts/ops/lib/guides.mjs parseToolSources) reads this file without a build, so every entry keeps the shape
// `{ id: '…', url: NAME, title: '…', quote: '…' }` with single-quoted strings (NAME = a URL const below); `via: 'browser'`
// marks a source a script cannot read (the 외교부 PDF opens in a viewer); it is listed for a manual check. A quote may join
// parts with " / " (each part must be verbatim on the page).

export interface ToolSource {
  readonly id: string;
  readonly url: string;
  readonly title: string;
  readonly quote: string;
  readonly via?: 'browser';
}

export const ROMANIZATION_URL = 'https://korean.go.kr/kornorms/regltn/regltnView.do?regltn_code=0004';
export const PASSPORT_BASIC_URL = 'https://www.passport.go.kr/home/kor/contents.do?menuPos=37';
export const PASSPORT_SYSTEM_URL = 'https://www.passport.go.kr/home/kor/contents.do?menuPos=36';
export const PASSPORT_SEARCH_URL = 'https://www.passport.go.kr/home/kor/contents.do?menuPos=38';
export const PASSPORT_CHANGE_URL = 'https://www.passport.go.kr/home/kor/contents.do?menuPos=39';
export const SOURCES_RETRIEVED = '2026-10-16';

export const TOOL_SOURCES: readonly ToolSource[] = [
  {
    id: 'kornorms-romanization',
    url: ROMANIZATION_URL,
    title: '국립국어원 「국어의 로마자 표기법」',
    quote: '‘ㄱ, ㄷ, ㅂ’은 모음 앞에서는 ‘g, d, b’로, 자음 앞이나 어말에서는 ‘k, t, p’로 적는다. / 단, ‘ㄹㄹ’은 ‘ll’로 적는다. / ‘ㅢ’는 ‘ㅣ’로 소리 나더라도 ui로 적는다. / 인명은 성과 이름의 순서로 띄어 쓴다. 이름은 붙여 쓰는 것을 원칙으로 하되 음절 사이에 붙임표(-)를 쓰는 것을 허용한다. / 이름에서 일어나는 음운 변화는 표기에 반영하지 않는다. / 성의 표기는 따로 정한다. / 인명, 회사명, 단체명 등은 그동안 써 온 표기를 쓸 수 있다.',
  },
  {
    id: 'passport-basic',
    url: PASSPORT_BASIC_URL,
    title: '외교부 여권안내 「로마자성명 표기의 기본방법」',
    quote: '가족관계등록부에 등록된 한글성명을 문화체육관광부장관이 정하여 고시하는 표기 방법에 따라 음절 단위로 음역에 맞게 로마자로 표기합니다. / 로마자성명 중 이름은 붙여 쓰는 것이 원칙이나 음절 사이에 붙임표를 첨가할 수 있으며, 희망할 경우 띄어 쓰는 것도 허용됩니다. / 여권의 로마자성명은 국외에서 신원 확인의 기준이 되므로 여권 최초 발급 시 신중히 표기하여야 하며',
  },
  {
    id: 'passport-system',
    url: PASSPORT_SYSTEM_URL,
    title: '외교부 여권안내 「로마자성명 표기 제도」',
    quote: '국제적으로 통용되는 로마자로 보여주는 수단일 뿐이며, 영어 이름이 아닙니다. / 여권 재발급시 로마자성명은 이전 여권과 동일하게 표기하는 것을 원칙으로 하고 있습니다.',
  },
  {
    id: 'passport-change',
    url: PASSPORT_CHANGE_URL,
    title: '외교부 여권안내 「로마자성명 표기의 변경 허용 요건」',
    quote: '강(GANG, 폭력단), 신 (SIN, 죄), 석 (SUCK, 빨다), 일 (ILL, 병든), 범 (BUM, 부랑자), 건 (GUN, 총), 길 (KILL, 죽이다), 노 (NO, 아니), 빈 (BIN, 쓰레기통), 덕 (DUCK, 녀석), 박 (BARK, 짖다) / 여권의 로마자 성 또는 이름의 스펠링이 A, I, O, U 등의 외자인 경우로서 항공권 예약 및 출입국 심사 등에 어려움이 있어 변경이 필요한 경우 변경 신청이 가능하며',
  },
  {
    id: 'mofa-list',
    url: PASSPORT_CHANGE_URL,
    title: '외교부 「로마자표기 성명의 정정 등이 제한되는 예시 목록」 (PDF, 2024.10.31 기준)',
    quote: '성(姓) 통계상 정정 또는 변경이 제한되는 로마자 표기 예시(24.10.31.) / 이름 통계상 정정 또는 변경이 제한되는 로마자 표기 예시(24.10.31.)',
    via: 'browser',
  },
];
