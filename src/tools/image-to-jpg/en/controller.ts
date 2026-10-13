// The English /en/image-to-jpg/ controller (EN1): the shared controller bound to the English catalog, loaded by entry.ts
// on the first interaction. Named controller.ts like ko/controller.ts (check-dist finds the lazy chunk by the page's
// dynamic import).
import { EN } from '../../../i18n/en/tools/image-to-jpg';
import { initImageToJpg } from '../../../tools/image-to-jpg/controller.ts?en';

export const init = (pending?: File[]): ReturnType<typeof initImageToJpg> => initImageToJpg(EN, pending);
