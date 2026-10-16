// 영문주소 변환기: what the page says for each answer of /api/addr-en (ADDREN1016 decision 13) and which usage fail
// code it reports (decision 17). Plain words: 「주소 검색 서비스」, never 서버·API·네트워크.

/** Codes the page shows a message for: the Function's error codes plus `none` (0 results) and `offline`. */
export type MessageCode = 'short' | 'sido' | 'digits' | 'long' | 'chars' | 'broad' | 'none' | 'busy' | 'offline' | 'other';

export const MESSAGES: Record<MessageCode, string> = {
  short: '주소를 두 글자 이상 적어 주세요.',
  sido: '시·도 이름만으로는 찾을 수 없어요. 도로명이나 동 이름까지 적어 주세요.',
  digits: '숫자만으로는 찾을 수 없어요. 도로명이나 건물 이름을 같이 적어 주세요.',
  long: '80글자까지 적을 수 있어요.',
  chars: '기호를 빼고 다시 찾아 주세요.',
  broad: '찾은 주소가 너무 많아요. 건물 번호까지 적어 주세요.',
  none: '찾은 주소가 없어요. 도로명과 건물 번호(예: 세종대로 110)나 동 이름과 번지로 다시 찾아 주세요.',
  busy: '잠깐 너무 많이 찾았어요. 몇 초 뒤에 다시 눌러 주세요.',
  offline: '인터넷에 연결된 뒤에 다시 찾아 주세요.',
  other: '지금은 주소를 찾을 수 없어요. 잠시 뒤에 다시 해 주세요.',
};

/** 상세주소 with Hangul other than 동·층·호 (decision 10). */
export const MANUAL = '동·층·호 말고 다른 한글은 영문으로 직접 적어 주세요. 아파트 이름은 빼도 돼요.';

const KNOWN = new Set<string>(['short', 'sido', 'digits', 'long', 'chars', 'broad', 'none', 'busy', 'offline']);

/** The message code of an error code from the Function (anything unknown, engine, upstream, timeout, off -> other). */
export function messageCode(error: unknown): MessageCode {
  return typeof error === 'string' && KNOWN.has(error) ? (error as MessageCode) : 'other';
}

/** Usage fail code (decision 17): never the text, count, page, zip or region. null: nothing to report (offline). */
export function failCode(error: unknown): 'no-result' | 'query' | 'busy' | 'engine' | 'timeout' | null {
  if (error === 'none') return 'no-result';
  if (error === 'offline') return null;
  if (error === 'busy') return 'busy';
  if (error === 'timeout') return 'timeout';
  if (typeof error === 'string' && ['short', 'sido', 'digits', 'long', 'chars', 'broad'].includes(error)) return 'query';
  return 'engine';
}
