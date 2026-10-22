// The forms the HWP worker can build (FORM1020 D4): looked up by id inside the worker, never sent as code.
import type { FormSpec } from '../../lib/form/spec';
import { LOAN_NOTE } from './loan-note';
import { POWER_OF_ATTORNEY } from './power-of-attorney';

export const FORM_SPECS: Readonly<Record<string, FormSpec>> = { [POWER_OF_ATTORNEY.id]: POWER_OF_ATTORNEY, [LOAN_NOTE.id]: LOAN_NOTE };

export const getFormSpec = (id: string): FormSpec | undefined => (Object.prototype.hasOwnProperty.call(FORM_SPECS, id) ? FORM_SPECS[id] : undefined);
