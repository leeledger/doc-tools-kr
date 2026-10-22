// /power-of-attorney/ page script: the generic form tool entry (../form-tool/entry) with this tool's id and controller.
import { startFormTool } from '../form-tool/entry';
import { PA_PREFIX, PA_TODAY } from './config';

startFormTool({ tool: 'power-of-attorney', prefix: PA_PREFIX, today: PA_TODAY, load: () => import('./controller') });
