// 차용증 만들기 controller: the generic form tool controller (../form-tool/controller) with the 차용증 spec and copy.
import { LOAN_HWP, LOAN_NOTE } from '../../data/forms/loan-note';
import { initFormTool, type FormStart } from '../form-tool/controller';
import { LN_PREFIX, LN_TODAY } from './config';
import { LN_COPY, LN_PROBLEMS } from './copy';

export const init = (start: FormStart): void =>
  initFormTool({ spec: LOAN_NOTE, prefix: LN_PREFIX, copy: LN_COPY, hwp: LOAN_HWP, tool: 'loan-note', today: LN_TODAY, problems: LN_PROBLEMS }, start);
