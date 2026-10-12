/*! 본 제품은 한글과컴퓨터의 한글 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다. */
// HWP PDF 변환 controller (brief Step 5 "Flow"): the shared HWP document session (../hwp-shared/session.ts) on
// this page's markup. Imported by ../hwp-shared/boot.ts after the first paint or on the first interaction.
import type { BootStart } from '../hwp-shared/boot';
import { sweepIfDue } from '../../lib/ui/handoff-marker';
import { startHwpSession } from '../hwp-shared/session';

export function initHwpTool(start: BootStart = {}): void {
  startHwpSession(start, { tool: 'hwp-to-pdf' });
  sweepIfDue();
}
