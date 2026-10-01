// 본 제품은 한컴의 HWP 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.
// Re-exports of the HWP limits and routing for the tool page (brief Step 5 §3).
export { GUARD_PAGES, GUARD_TEXTBOXES, LIMITS, MB_DEC, MIB, overHardLimit } from '../../lib/hwp/limits';
export { route, type Mode, type Reason, type RouteResult } from '../../lib/hwp/route';
