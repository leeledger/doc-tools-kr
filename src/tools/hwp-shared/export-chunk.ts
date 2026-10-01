// 본 제품은 한컴의 HWP 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.
// The lazy PDF entry (SPIKE-HWP-DIRECT §6.2, §6.10 budget ≤ 360 KB gzip): pdf-lib, fontkit and the writer stay
// out of the viewer chunk. Warmed on idle once a document is shown, or loaded by the first click.
export { exportPdf, type ExportStats } from '../../lib/hwp/pdf/export';
