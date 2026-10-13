// Merge PDF copy (EN1): the English catalog for initMergeTool, typed by the Korean catalog's Messages interface.
import { baseName, safeFileName } from '../../../lib/ui/format';
import type { Messages } from '../../../tools/pdf-merge/messages.ko';
import { count, deviceName, mbText, num } from '../format';
import { ENGINE_EN, NEXT_EN, nonPdfEn, pagesEn } from '../shared';

/** Every EN catalog carries this mark (scripts/lib/en-check.mjs): no Korean page's JS may contain it. */
export const EN_CATALOG_MARK = 'catalog-mark:en';

const SLOW = 'This much can take a long time or freeze the page.';

export const EN = {
  mark: EN_CATALOG_MARK,
  errors: {
    'not-pdf': 'This is not a PDF file. You can only merge PDF files.',
    password: 'This file is protected with a password.',
    'wrong-password': 'The password is not correct.',
    corrupt: 'The file is damaged or did not finish downloading. Please get the original again.',
    oom: 'This is more than this device can handle at once. Merge fewer files at a time.',
    unknown: 'Something went wrong. Reload the page and try again.',
    // Not sent by the merge worker (it maps a failed output check to corrupt); required by the type.
    verify: 'Something went wrong. Reload the page and try again.',
  },
  limits: {
    tooMany: (max, over) => `You can merge up to ${num(max)} files at once, so ${count(over, 'file')} ${over === 1 ? 'was' : 'were'} not added. Merge the rest separately.`,
    tooBig: (hardBytes, device) =>
      `Files over ${mbText(hardBytes)} in total cannot be merged at once on ${deviceName(device)}, so some files were not added. Merge them in smaller groups.`,
    softBytes: (softBytes) => `The files are over ${mbText(softBytes)} in total. ${SLOW} Merge anyway?`,
    softPages: (softPages) => `The files have more than ${num(softPages)} pages in total. ${SLOW} Merge anyway?`,
  },
  engine: ENGINE_EN,
  next: NEXT_EN,
  pages: pagesEn,
  nonPdf: nonPdfEn,
  fileName: (firstName) => safeFileName(baseName(firstName), '_merged.pdf'),
  preparing: 'Getting the tool ready (first time only).',
  blockOne: 'Add one more file to merge.',
  blockPending: 'The tool did not load, so the files were not checked.',
  blockInspecting: 'Checking the files.',
  blockError: 'Remove the files with problems from the list to merge.',
  blockLocked: 'Type the password of each locked file to merge.',
  runButton: (n) => `Merge ${num(n)} PDFs`,
  thumbLocked: 'Locked',
  thumbInspecting: 'Checking',
  thumbPending: 'Waiting',
  thumbPdf: 'PDF',
  stateLocked: 'Locked',
  stateError: 'Error',
  moveUp: (name) => `Move ${name} up`,
  moveDown: (name) => `Move ${name} down`,
  remove: (name) => `Remove ${name}`,
  ownerNote: 'The copy will not have the editing limits of the original',
  pwState: 'This file is protected with a password.',
  pwLabel: 'Password',
  pwToggle: 'Show password',
  pwOk: 'OK',
  pwOkLabel: (name) => `Confirm the password for ${name}`,
  pwEmpty: 'Please type the password.',
  moved: (name, total, pos) => `${name}: moved to position ${pos} of ${total}.`,
  removed: (name, left) => `${name} was removed from the list. ${num(left)} left.`,
  removedBad: (bad, left) => `Removed ${count(bad, 'file')} with problems from the list. ${num(left)} left.`,
  added: (added, total) => `Added ${count(added, 'file')}. ${num(total)} in total.`,
  unlocked: (name) => `${name} is unlocked.`,
  progress: (done, total) => `Merging… (${done}/${total})`,
  merging: 'Merging the files.',
  cancelled: 'Merging was cancelled. Your file list is unchanged.',
  saveName: (name) => `File name: ${name}`,
  noteUnlocked: 'The merged file has no password.',
  noteRenamed: (n) => `${count(n, 'form field')} with the same name ${n === 1 ? 'was' : 'were'} renamed, so you can fill in all of them.`,
  done: (summary, notes) => `Merging is done. ${summary}. ${notes}`.trim(),
  reset: 'Back to the start.',
} satisfies Messages;
