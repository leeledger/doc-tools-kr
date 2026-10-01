// HWP PDF 변환 controller (brief Step 5 "Flow"): the shared HWP document session (../hwp-shared/session.ts) on
// this page's markup. Imported by ../hwp-shared/boot.ts after the first paint or on the first interaction.
import type { BootStart } from '../hwp-shared/boot';
import { startHwpSession } from '../hwp-shared/session';

export function initHwpTool(start: BootStart = {}): void {
  startHwpSession(start);
}
