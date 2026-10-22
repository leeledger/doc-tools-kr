// /loan-note/ page script: the generic form tool entry (../form-tool/entry) with this tool's id and controller.
import { startFormTool } from '../form-tool/entry';
import { LN_PREFIX, LN_TODAY } from './config';

startFormTool({ tool: 'loan-note', prefix: LN_PREFIX, today: LN_TODAY, load: () => import('./controller') });
