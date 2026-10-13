// HEIC to JPG copy (EN1): the English catalog for initImageToJpg, typed by the Korean catalog's Messages interface. The
// English controller chunk (src/tools/image-to-jpg/en/controller.ts) passes it; the page passes ENGINE_EN to entry.ts.
import type { Messages } from '../../../tools/image-to-jpg/messages.ko';
import { count, deviceName, mbText, num } from '../format';
import { NEXT_EN } from '../shared';

/** Every EN catalog carries this mark (scripts/lib/en-check.mjs): no Korean page's JS may contain it. */
export const EN_CATALOG_MARK = 'catalog-mark:en';

const photos = (n: number): string => count(n, 'photo');
const DAMAGED = 'The photo cannot be opened. The file may be damaged; save the original again and pick it.';

export const EN = {
  mark: EN_CATALOG_MARK,
  errors: {
    heic: 'This browser cannot open iPhone photos (HEIC). On the iPhone, go to Settings > Camera > Formats and choose "Most Compatible", or export the photo as JPG and pick it again.',
    'not-image': 'This is not a photo. Please pick a JPG, PNG or WebP file.',
    empty: 'The file is empty. Save the original again and pick it.',
    corrupt: DAMAGED,
    truncated: `The file is cut off. ${DAMAGED}`,
    oom: 'This is more than this device can handle at once. Try smaller photos or use a computer.',
    unknown: 'Something went wrong. Reload the page and try again.',
    zip: 'The ZIP file could not be made. Please download the photos one by one.',
  },
  limits: {
    tooMany: (maxImages, left) => `You can convert up to ${photos(maxImages)} at once, so ${photos(left)} ${left === 1 ? 'was' : 'were'} not added. Convert the rest separately.`,
    fileTooBig: (maxFileBytes, device, left) =>
      `On ${deviceName(device)} one photo can be up to ${mbText(maxFileBytes)}, so ${photos(left)} ${left === 1 ? 'was' : 'were'} not added.`,
    totalTooBig: (maxTotalBytes, device, left) =>
      `Photos over ${mbText(maxTotalBytes)} in total cannot be converted at once on ${deviceName(device)}, so ${photos(left)} ${left === 1 ? 'was' : 'were'} not added. Convert them in smaller groups.`,
  },
  next: NEXT_EN,
  note: (n) => {
    if (n.kind === 'scaled') return `Saved smaller, at ${num(n.width)}×${num(n.height)} pixels.`;
    if (n.kind === 'transparent') return 'Transparent areas become white.';
    return 'Only the first frame of the moving image was saved.';
  },
  canvas: 'This device could not draw the photo. Please try another browser or a computer.',
  encoder: 'The photo could not be saved in this format. Choose another format and try again.',
  notFormat: (label) => `${label} photos cannot be converted yet.`,
  runButton: (n) => `Convert ${photos(n)}`,
  runIdle: 'Convert',
  hintChecking: 'Checking the photos.',
  hintSkip: 'Photos with problems are skipped.',
  thumbChecking: 'Checking',
  thumbPhoto: 'Photo',
  stateError: 'Error',
  download: 'Download',
  downloadLabel: (name) => `Download ${name}`,
  remove: (name) => `Remove ${name}`,
  removed: (name, left) => `${name} was removed from the list. ${num(left)} left.`,
  added: (added, total) => `Added ${photos(added)}. ${num(total)} in total.`,
  progress: (done, total) => `Converting… (${done}/${total})`,
  converting: 'Converting the photos.',
  allFailed: 'The photos could not be converted. See the list for the reasons.',
  cancelled: 'Converting was stopped. Your photo list is unchanged.',
  saveName: (name) => `File name: ${name}`,
  headlineMany: (label, n) => `${num(n)} ${label} photos are ready in one ZIP file`,
  headlineOne: (label) => `Your ${label} photo is ready`,
  failedCount: (n) => `${photos(n)} not converted`,
  done: (headline, summary) => `${headline}. ${summary}.`,
  reset: 'Back to the start.',
} satisfies Messages;
