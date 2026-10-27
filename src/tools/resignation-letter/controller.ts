// 사직서 만들기 controller: the generic form tool controller (../form-tool/controller) with the 사직서 spec and copy.
import { RESIGN_HWP, RESIGNATION_LETTER } from '../../data/forms/resignation-letter';
import { initFormTool, type FormStart } from '../form-tool/controller';
import { RS_PREFIX, RS_TODAY } from './config';
import { RS_COPY } from './copy';

export const init = (start: FormStart): void =>
  initFormTool({ spec: RESIGNATION_LETTER, prefix: RS_PREFIX, copy: RS_COPY, hwp: RESIGN_HWP, tool: 'resignation-letter', today: RS_TODAY }, start);
