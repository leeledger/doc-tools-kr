// /quotation/ page script: the generic form tool entry (../form-tool/entry) with this tool's id and controller. The
// 비고 presets, 「품목 줄 더하기」 and the 「만들 서류」 radio work before the controller loads; a picture handed over
// by /stamp-maker/ (「견적서에 찍기」) starts the controller at once, which reads it (./seal).
import { startFormTool } from '../form-tool/entry';
import { hasSignPng } from '../../lib/ui/sign-handoff';
import { trackOut } from '../../lib/ui/usage';
import { QT_PREFIX, QT_TODAY } from './config';

startFormTool({ tool: 'quotation', prefix: QT_PREFIX, today: QT_TODAY, load: () => import('./controller'), now: hasSignPng() });
// LP1028 L11: presses of the result's affiliate group (link kind only).
trackOut(document.getElementById(`${QT_PREFIX}-result`), 'quotation');
