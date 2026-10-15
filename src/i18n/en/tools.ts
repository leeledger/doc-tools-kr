// The English tool registry (EN1): the tools with an English twin at /en/<slug>/ (same slug as the Korean page). Icons
// come from src/data/tools.ts; every FAQ number is read from the limits the tool uses (en-US format).
import { MB } from '../../lib/ui/device';
import { getTool, type FaqItem } from '../../data/tools';
import { LIMITS as MERGE_LIMITS, MAX_FILES } from '../../tools/pdf-merge/limits';
import { LIMITS as CMP_LIMITS } from '../../tools/pdf-compress/limits';
import { LIMITS as IMG_LIMITS } from '../../tools/image-to-jpg/limits';
import { num } from './format';

export interface ToolEn {
  slug: string;
  /** Short name (cards, menu, breadcrumbs). */
  name: string;
  /** Full document title, ending with TITLE_SUFFIX_EN. */
  title: string;
  /** Meta description, 70–155 characters. */
  description: string;
  h1: string;
  lead: string;
  /** Card copy on /en/. */
  summary: string;
  icon: string;
  /** Last real change of the English page (YYYY-MM-DD): the sitemap lastmod. */
  updated: string;
  faq: FaqItem[];
}

const mb = (bytes: number): string => `${num(bytes / MB)} MB`;
const UPDATED = '2026-10-13';

const NO_UPLOAD_PDF = {
  q: 'Are my files uploaded?',
  a: 'No. Your files are processed on your device, inside this page. They are not uploaded to a server, and nothing is kept after you close the page.',
};

export const TOOLS_EN: ToolEn[] = [
  {
    slug: 'pdf-merge',
    name: 'Merge PDF',
    title: 'Merge PDF Files Online Free, No Sign-up | Docttak',
    description: 'Merge PDF files into one in the order you want, on your phone or computer. Your files are never uploaded. Bookmarks and links still work. Free, no sign-up.',
    h1: 'Merge PDF files',
    lead: 'Combine several PDF files into one, in the order you want. Free, no sign-up.',
    summary: 'Combine several PDFs into one file and put them in the order you want.',
    icon: getTool('pdf-merge').icon,
    updated: UPDATED,
    faq: [
      {
        q: 'Is there a limit on file size or the number of files?',
        a: `You can merge up to ${num(MAX_FILES)} files at once. Files are processed on your device, so the total can be up to ${mb(MERGE_LIMITS.desktop.hardBytes)} on a computer and ${mb(MERGE_LIMITS.mobile.hardBytes)} on a phone. Above ${mb(MERGE_LIMITS.desktop.softBytes)} or ${num(MERGE_LIMITS.desktop.softPages)} pages on a computer, or ${mb(MERGE_LIMITS.mobile.softBytes)} on a phone, it can take a while, so we ask before merging.`,
      },
      {
        q: 'Can I merge password-protected PDFs?',
        a: 'Yes. Type the password you use to open the file. The password is used only while this page is open and is never saved. The merged file has no password.',
      },
      {
        q: 'Are form fields, bookmarks and links kept?',
        a: 'Yes. Fillable form fields stay fillable, and fields with the same name are renamed so they do not mix. Bookmarks and links inside the documents still point to the right page in the merged file.',
      },
      NO_UPLOAD_PDF,
      {
        q: 'Where is the merged file saved?',
        a: 'When you press Download, the file goes to the Downloads folder of your phone or computer. We keep no copy of your files.',
      },
    ],
  },
  {
    slug: 'pdf-compress',
    name: 'Compress PDF',
    title: 'Compress PDF to 1 MB or Any Size, Free | Docttak',
    description: 'Compress a PDF to fit an upload limit like 1 MB or 10 MB. Nothing is uploaded: it works on your device. Text stays sharp and searchable. Free, no sign-up.',
    h1: 'Compress PDF',
    lead: 'Make scanned PDFs and PDFs with photos smaller. Text stays as it is; only the images shrink. Free, no sign-up.',
    summary: 'Make a PDF small enough for an upload limit. Text stays sharp and searchable.',
    icon: getTool('pdf-compress').icon,
    updated: UPDATED,
    faq: [
      {
        q: 'How much smaller will my PDF get?',
        a: 'In our tests, scanned PDFs and PDFs with photos got 85–96% smaller at the Recommended level, and text-only documents 4–25% smaller. A file that is already small may not shrink; then we keep the original.',
      },
      {
        q: 'Will the text get blurry?',
        a: 'No. The High quality, Recommended and Strong levels keep text and lines as they are, so you can still select and search the text. Only "Convert pages to images" turns every page into an image.',
      },
      {
        q: 'Can I compress a password-protected PDF?',
        a: 'Yes. Type the password you use to open the file. The password is used only while this page is open and is never saved. The compressed file has no password.',
      },
      {
        q: 'Is there a file size limit?',
        a: `Files are processed on your device, so you can compress up to ${mb(CMP_LIMITS.desktop.hardBytes)} on a computer and ${mb(CMP_LIMITS.mobile.hardBytes)} on a phone. Above ${mb(CMP_LIMITS.desktop.softBytes)} or ${num(CMP_LIMITS.desktop.softPages)} pages on a computer, or ${mb(CMP_LIMITS.mobile.softBytes)} or ${num(CMP_LIMITS.mobile.softPages)} pages on a phone, it can take a while, so we ask first. "Convert pages to images" works up to ${num(CMP_LIMITS.desktop.rasterHardPages)} pages on a computer and ${num(CMP_LIMITS.mobile.rasterHardPages)} pages on a phone.`,
      },
      NO_UPLOAD_PDF,
      {
        q: 'Can I compress a digitally signed PDF?',
        a: 'Compressing saves a new file, so a digital signature is no longer valid. For signed documents such as certificates, send the original. If the file has a digital signature, the result screen tells you.',
      },
    ],
  },
  {
    slug: 'image-to-jpg',
    name: 'HEIC to JPG',
    title: 'HEIC to JPG Converter, also PNG and WebP, Free | Docttak',
    description: 'Convert iPhone HEIC photos, PNG and WebP to JPG. HEIC opens on iPhone and Mac Safari; Chrome and Edge on a PC often cannot. Free, no sign-up.',
    h1: 'Convert HEIC, PNG and WebP to JPG',
    lead: 'Convert iPhone photos (HEIC), PNG and WebP to JPG. Convert many at once, or save as PNG or WebP. Free, no sign-up.',
    summary: 'Convert PNG, WebP and iPhone photos (HEIC) to JPG, many at once. HEIC opens on iPhone and Mac Safari; Chrome and Edge on a PC often cannot open it yet.',
    icon: getTool('image-to-jpg').icon,
    updated: UPDATED,
    faq: [
      {
        q: 'My iPhone photo (HEIC) does not open.',
        a: 'HEIC photos open on iPhone and Mac Safari; Chrome and Edge on a PC often cannot open them yet. Then open this page on the iPhone and convert there, or on the iPhone go to Settings > Camera > Formats and choose "Most Compatible" so new photos are saved as JPG. Only the photos that do not open are marked; the others are converted.',
      },
      {
        q: 'What happens to transparent areas when I convert PNG to JPG?',
        a: 'JPG has no transparency, so transparent areas become white. To keep a transparent background, choose PNG or WebP as the format.',
      },
      {
        q: 'Is the photo location kept?',
        a: 'No. Photo details such as the date and location are removed. Sideways photos are saved upright.',
      },
      {
        q: 'Will the quality drop?',
        a: 'Quality is High by default. A JPG saved again at High mostly keeps its quality; only the photo details are removed. Normal and Small make the file smaller, with slightly lower quality.',
      },
      {
        q: 'How many photos can I convert at once?',
        a: `Up to ${num(IMG_LIMITS.desktop.maxImages)} photos on a computer and ${num(IMG_LIMITS.mobile.maxImages)} on a phone; many photos come in one ZIP file. One photo can be up to ${mb(IMG_LIMITS.desktop.maxFileBytes)} on a computer and ${mb(IMG_LIMITS.mobile.maxFileBytes)} on a phone, and all photos together up to ${mb(IMG_LIMITS.desktop.maxTotalBytes)} on a computer and ${mb(IMG_LIMITS.mobile.maxTotalBytes)} on a phone.`,
      },
      {
        q: 'Are my photos uploaded?',
        a: 'No. Your photos are converted on your device, inside this page. They are not uploaded to a server, and nothing is kept after you close the page.',
      },
    ],
  },
];

export function getToolEn(slug: string): ToolEn {
  const t = TOOLS_EN.find((x) => x.slug === slug);
  if (!t) throw new Error(`unknown English tool: ${slug}`);
  return t;
}

/** The English home title and H1. */
export const HOME_TITLE_EN = 'Free PDF and Photo Tools, No Sign-up | Docttak';
export const HOME_DESCRIPTION_EN =
  'Merge PDF files, compress a PDF to fit an upload limit, and convert HEIC to JPG. Your files stay on your device and are never uploaded. Free, no sign-up.';

/** The English pages with a Korean twin (same path without /en/): the home page, the tools, privacy and terms. */
const TWINS = ['/', ...TOOLS_EN.map((t) => `/${t.slug}/`), '/privacy/', '/terms/'];

/** The English twin of a Korean page path ("/pdf-merge/" -> "/en/pdf-merge/"), or null. */
export function enTwin(path: string): string | null {
  return TWINS.includes(path) ? `/en${path}` : null;
}

/** The Korean twin of an English page path ("/en/pdf-merge/" -> "/pdf-merge/"), or null. */
export function koTwin(path: string): string | null {
  const p = path.startsWith('/en/') ? path.slice(3) : null;
  return p && TWINS.includes(p) ? p : null;
}
