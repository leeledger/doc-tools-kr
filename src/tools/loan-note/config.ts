// 차용증 만들기 page constants shared by the page, its entry and its controller (no DOM, no engine).
/** The element id prefix (src/components/FormTool.astro). */
export const LN_PREFIX = 'ln';
/** Date fields that start at today (L-D5: 쓴 날 and 빌린 날). */
export const LN_TODAY: readonly string[] = ['date', 'loanDate'];
