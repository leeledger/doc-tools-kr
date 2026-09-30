// The lazy PDF entry (SPIKE-HWP-DIRECT §6.2, §6.10 budget ≤ 360 KB gzip): pdf-lib, fontkit and the writer stay
// out of the viewer chunk. Warmed on idle once a document is shown, or loaded by the first click.
export { exportPdf, type ExportStats } from '../../lib/hwp/pdf/export';
