// 사직서 만들기 page constants shared by the page, its entry and its controller (no DOM, no engine).
/** The element id prefix (src/components/FormTool.astro). */
export const RS_PREFIX = 'rs';
/** Date fields that start at today (RESIGN1027 R3: only 내는 날; 입사일 and 그만두는 날 start empty). */
export const RS_TODAY: readonly string[] = ['date'];
