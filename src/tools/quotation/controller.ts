// 견적서·거래명세서 만들기 controller: the generic form tool controller (../form-tool/controller) with this page's copy
// and its own parts as hooks: the 「만들 서류」 radio (which spec to build; both share one field list), the item rows and
// totals box (./items) and the seal picture (./seal).
import { QUOTE_HWP, QUOTATION, TRANSACTION_STATEMENT } from '../../data/forms/quotation';
import { announce } from '../../lib/ui/announce';
import { initFormTool, type FormStart } from '../form-tool/controller';
import { QT_PREFIX, QT_TODAY } from './config';
import { ITEMS_COPY, QT_COPY, QT_PROBLEMS } from './copy';
import { initItems } from './items';
import { initSeal } from './seal';

const SPECS = [QUOTATION, TRANSACTION_STATEMENT];

export function init(start: FormStart): void {
  const root = document.getElementById(`${QT_PREFIX}-tool`);
  const form = document.getElementById(`${QT_PREFIX}-form`) as HTMLFormElement | null;
  if (!root || !form) return;
  const radios = Array.from(form.querySelectorAll<HTMLInputElement>('input[data-spec]'));
  initFormTool(
    {
      spec: QUOTATION,
      prefix: QT_PREFIX,
      copy: QT_COPY,
      problems: QT_PROBLEMS,
      hwp: QUOTE_HWP,
      tool: 'quotation',
      today: QT_TODAY,
      hooks: ({ read }) => {
        const items = initItems(QT_PREFIX, form, QUOTATION, read, ITEMS_COPY);
        const seal = initSeal(QT_PREFIX, form, (msg) => announce('status', msg, root));
        return {
          spec: () => SPECS.find((s) => s.id === radios.find((r) => r.checked)?.value) ?? QUOTATION,
          input: items.input,
          check: items.check,
          reset: () => {
            for (const r of radios) r.checked = r.defaultChecked;
            // The entry renames the 만들기 button and the result title on this change.
            radios[0]?.dispatchEvent(new Event('change', { bubbles: true }));
            items.reset?.();
            seal.reset();
          },
          seal: seal.current,
        };
      },
    },
    start,
  );
}
