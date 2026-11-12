// 견적서·거래명세서 만들기 page constants shared by the page, its entry and its controller (no DOM, no engine).
/** The element id prefix (src/components/FormTool.astro). */
export const QT_PREFIX = 'qt';
/** Date fields that start at today (Q7: 작성일). */
export const QT_TODAY: readonly string[] = ['date'];
/** Q8: item rows shown at first (the rest behind 「품목 줄 더하기」). */
export const QT_ROWS_SHOWN = 3;
