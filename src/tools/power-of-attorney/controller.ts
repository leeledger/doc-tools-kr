// 위임장 만들기 controller: the generic form tool controller (../form-tool/controller) with the 위임장 spec and copy.
import { FORM_HWP, POWER_OF_ATTORNEY } from '../../data/forms/power-of-attorney';
import { initFormTool, type FormStart } from '../form-tool/controller';
import { PA_PREFIX, PA_TODAY } from './config';
import { PA_COPY } from './copy';

export const init = (start: FormStart): void =>
  initFormTool({ spec: POWER_OF_ATTORNEY, prefix: PA_PREFIX, copy: PA_COPY, hwp: FORM_HWP, tool: 'power-of-attorney', today: PA_TODAY }, start);
