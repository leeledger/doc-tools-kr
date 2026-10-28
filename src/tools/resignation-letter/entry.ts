// /resignation-letter/ page script: the generic form tool entry (../form-tool/entry) with this tool's id and controller.
// The 그만두는 이유 presets are filled by the generic entry too (RESIGN1027 R5), before or after the controller loads.
import { startFormTool } from '../form-tool/entry';
import { trackOut } from '../../lib/ui/usage';
import { RS_PREFIX, RS_TODAY } from './config';

startFormTool({ tool: 'resignation-letter', prefix: RS_PREFIX, today: RS_TODAY, load: () => import('./controller') });
// LP1028 L11: presses of the result's affiliate group (link kind only).
trackOut(document.getElementById(`${RS_PREFIX}-result`), 'resignation-letter');
