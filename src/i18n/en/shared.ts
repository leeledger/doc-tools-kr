// English copy shared by the EN tool catalogs (EN1): the engine-load panel and the next-step labels (the group is not
// rendered on English pages until EN2; the labels are typed now so the catalogs are complete).
import type { EngineMessages } from '../../lib/ui/engine-load';
import type { NextMessages } from '../../lib/ui/next-steps';

const body = (when: string): string => `Your file is fine. ${when} reload the page. After reloading, pick the file again.`;

export const ENGINE_EN: EngineMessages = {
  offline: { title: 'The internet connection dropped, so the tool could not load.', body: body('Check your connection, then') },
  deployed: { title: 'The site was just updated to a new version.', body: body('Please') },
  generic: { title: 'The tool could not load.', body: body('Wait a moment, then') },
  reload: 'Reload',
};

export const NEXT_EN: NextMessages = {
  group: 'Continue with this file',
  labels: {
    'pdf-compress': 'Compress PDF',
    'pdf-password': 'Add a PDF password',
    'pdf-sign': 'Sign PDF',
    'pdf-split': 'Split PDF',
    'photo-compress': 'Compress image',
    'jpg-to-pdf': 'JPG to PDF',
    'pdf-edit': 'Edit PDF',
  },
  sendFailed: (label) => `The file could not be passed on. Download it, then pick it in ${label}.`,
};

/** One alert for files that are not PDFs (both PDF tools, as nonPdfMessage on Korean pages). */
export function nonPdfEn(names: string[]): string {
  if (names.length === 1) return `${names[0]} is not a PDF file, so it was not added. You can only add PDF files.`;
  const shown = names.slice(0, 3).join(', ');
  const more = names.length > 3 ? ` and ${names.length - 3} more` : '';
  return `${names.length} files are not PDFs, so they were not added: ${shown}${more}`;
}

/** "12 pages". */
export const pagesEn = (n: number): string => `${n.toLocaleString('en-US')} ${n === 1 ? 'page' : 'pages'}`;
