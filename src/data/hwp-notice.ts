// 한글(HWP) 문서 관련 고지 (brief handoff/ARCHITECT-BRIEF-REV3.md Decision 10; report 「HWP 뷰어 한컴 저작권 검토」 L39-42),
// rendered into the static HTML of the HWP pages and /licenses/. Kept under src/data (core font scope) so their
// characters are in the preloaded UI font; src/tools/hwp-shared/messages.ts re-exports them.

/** The licence notice in the wording the HWP licence gives for products: /licenses/ and the legal source comments. */
export const HANCOM_NOTICE_PDF = '본 제품은 한글과컴퓨터의 한글 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.';
export const TRADEMARK_NOTICE = '한글, 한컴, HWP, HWPX는 (주)한컴(옛 한글과컴퓨터)의 상표입니다. 문서딱은 한컴과 제휴·후원·승인 관계가 없습니다.';
/** The HWPX line of the /hwp-viewer/ and /hwpx-to-hwp/ help. */
export const HWPX_STANDARD = 'HWPX는 국가표준 KS X 6101(OWPML)을 따르는 한글 문서 형식입니다.';
