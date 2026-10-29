// /power-of-attorney/ page script: the generic form tool entry (../form-tool/entry) with this tool's id and controller.
import { startFormTool } from '../form-tool/entry';
import { trackOut } from '../../lib/ui/usage';
import { PA_PREFIX, PA_TODAY } from './config';

startFormTool({ tool: 'power-of-attorney', prefix: PA_PREFIX, today: PA_TODAY, load: () => import('./controller') });
// AFF1029 A10: presses of the result's affiliate group (link kind only).
trackOut(document.getElementById(`${PA_PREFIX}-result`), 'power-of-attorney');
