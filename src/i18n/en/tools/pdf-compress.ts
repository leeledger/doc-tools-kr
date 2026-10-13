// Compress PDF copy (EN1): the English catalog for initCompressTool, typed by the Korean catalog's Messages interface,
// plus the level names and descriptions the English page renders (the Korean ones live in level-copy.ts).
import { baseName, safeFileName } from '../../../lib/ui/format';
import type { Messages } from '../../../tools/pdf-compress/messages.ko';
import { deviceName, mbText, num } from '../format';
import { ENGINE_EN, NEXT_EN, nonPdfEn, pagesEn } from '../shared';

/** Every EN catalog carries this mark (scripts/lib/en-check.mjs): no Korean page's JS may contain it. */
export const EN_CATALOG_MARK = 'catalog-mark:en';

const pagesText = (n: number): string => `${num(n)} pages`;
const MEMORY = 'It is too much for this device and the page could freeze.';
const SLOW = 'This much can take a long time or freeze the page.';

export const EN = {
  mark: EN_CATALOG_MARK,
  errors: {
    'not-pdf': 'This is not a PDF file. Please pick a PDF file.',
    password: 'This file is protected with a password. Please type the password.',
    'wrong-password': 'The password is not correct.',
    corrupt: 'The file is damaged or did not finish downloading. Please get the original again.',
    oom: 'This is more than this device can handle at once. Try a smaller file or use a computer.',
    unknown: 'Something went wrong. Reload the page and try again.',
    verify: 'The result could not be checked, so your original is kept. Please try another level.',
  },
  limits: {
    fileBytes: (hardBytes, device) => `On ${deviceName(device)} you can compress files up to ${mbText(hardBytes)}. ${MEMORY}`,
    rasterPages: (hardPages, device) => `On ${deviceName(device)}, "Convert pages to images" works up to ${pagesText(hardPages)}. Every page becomes a large image. ${MEMORY}`,
    softRaster: (pages) => `Turning a file of more than ${pagesText(pages)} into images can take a long time or freeze the page. Compress anyway?`,
    softBytes: (bytes) => `The file is over ${mbText(bytes)}. ${SLOW} Compress anyway?`,
    softPages: (pages) => `The file has more than ${pagesText(pages)}. ${SLOW} Compress anyway?`,
  },
  engine: ENGINE_EN,
  next: NEXT_EN,
  pages: pagesEn,
  nonPdf: nonPdfEn,
  fileName: (name, raster) => safeFileName(baseName(name), raster ? '_images.pdf' : '_compressed.pdf'),
  target: {
    chip: (t) => `✓ ${t} or less`,
    miss: (t, size, rasterTried) =>
      `It could not get under ${t}. The smallest result is ${size}.${rasterTried ? '' : ' Turn on "Convert pages to images" or split the file before you send it.'}`,
    already: (t, size) => `It is already under ${t} (${size}). You can send the original as it is.`,
    progress: (rung, of) => `Fitting the target size… (step ${rung} of ${of})`,
  },
  targetRange: 'Enter a size from 0.5 to 100 MB.',
  phases: {
    normalize: 'Reading the file…',
    images: 'Shrinking images…',
    optimize: 'Finishing…',
    verify: 'Finishing up…',
  },
  preparing: 'Getting the tool ready (first time only).',
  blockPending: 'The tool did not load, so the file was not checked.',
  blockInspecting: 'Checking the file.',
  blockPassword: 'Type the password to compress this file.',
  againTarget: 'Try another size',
  againLevel: 'Try another level',
  thumbPending: 'Waiting',
  thumbLocked: 'Locked',
  thumbInspecting: 'Checking',
  thumbPdf: 'PDF',
  checking: (name) => `Checking ${name}.`,
  locked: (name) => `${name}: this file is protected with a password.`,
  ready: (name, pages) => `${name}, ${pages}. Choose a level or a target size, then press Compress PDF.`,
  pwEmpty: 'Please type the password.',
  unlocked: (name, pages) => `${name} is unlocked. ${pages}.`,
  rasterProgress: 'Turning pages into images…',
  rasterStatus: 'Turning pages into images.',
  targetStatus: 'Fitting the target size.',
  levelStatus: 'Compressing.',
  targetImages: (rung, done, total) => `${rung} · image ${done}/${total}`,
  reduced: (percent, pages) => `${percent}% smaller · ${pages}`,
  saveName: (name) => `File name: ${name}`,
  previewOriginal: 'Original',
  previewResult: 'Result',
  noteUnlocked: 'The compressed file has no password.',
  noteOwner: 'This copy does not have the editing limits of the original.',
  done: (headline, summary, extra) => `Compressing is done. ${headline}, ${summary}. ${extra}`.trim(),
  keptRaster: 'Turning the pages into images made the file bigger, so your original is kept. This method does not suit this file.',
  keptOptimized: 'This file is already optimized. It has no images to shrink, so your original is kept.',
  keptJpx: 'The images in this file use the JPEG 2000 format, which this tool cannot shrink yet.',
  keptBilevel: 'Black-and-white scans are already stored small.',
  cancelled: 'Compressing was cancelled. Your file and settings are unchanged.',
  reset: 'Back to the start.',
  backToRecommended: 'Back to the Recommended level.',
} satisfies Messages;

/** The three levels as the English page names them (values as LEVEL_COPY). */
export const LEVEL_COPY_EN = [
  { value: 'high', label: 'High quality (compress less)', desc: 'Print sharpness (about 200 ppi). Hard to tell apart from the original; good for documents you will print.' },
  { value: 'recommended', label: 'Recommended', desc: 'Sharp enough to read on screen and on paper (about 150 ppi). Good for documents you send or submit.' },
  { value: 'strong', label: 'Strong', desc: 'Screen sharpness (about 110 ppi). Readable on screen, but it can look blurry when you zoom in.' },
] as const;
