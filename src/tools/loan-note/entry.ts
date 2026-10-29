// /loan-note/ page script: the generic form tool entry (../form-tool/entry) with this tool's id and controller.
import { startFormTool } from '../form-tool/entry';
import { trackOut } from '../../lib/ui/usage';
import { LN_PREFIX, LN_TODAY } from './config';

startFormTool({ tool: 'loan-note', prefix: LN_PREFIX, today: LN_TODAY, load: () => import('./controller') });
// AFF1029 A10: presses of the result's affiliate group (link kind only).
trackOut(document.getElementById(`${LN_PREFIX}-result`), 'loan-note');
