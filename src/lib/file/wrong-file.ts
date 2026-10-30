// A wrong file in a photo or PDF tool (FAIL1030 E). Loaded with import() only on the "not a photo" / "not a PDF" path,
// so the initial JS of the tool pages does not change. It reads the head and the tail of the picked file (64 KB each;
// nothing leaves the device), names what the file really is and offers the tool that can take it:
//   photo tool + PDF          -> a link to PDF JPG 변환
//   PDF tool   + photo        -> 「사진 PDF 변환으로 열기」 (the file handed to /jpg-to-pdf/, 이어서 하기)
//   either     + 한글 문서     -> a link to HWP PDF 변환
//   anything else             -> the tool's current line (text null)
// The usage code says which: not-image-pdf | -hwp | -doc | -other, not-pdf-img | -hwp | -other.
import { sniffFormat, type FileFamily } from './sniff-format';
import { sniffImage, type ImageFormat } from '../image/sniff';
import { NEXT_LABELS, sendFailed } from '../ui/next-steps';
import { track } from '../ui/usage';

/** What the tool opens. */
export type Expects = 'image' | 'pdf';
/** The tools that call this; a PDF tool hands a photo on as itself. */
export type WrongTool = 'stamp-signature' | 'id-photo' | 'pdf-sign' | 'pdf-to-jpg';
/** What the file is, as far as the help goes; doc is a Word/Excel/PowerPoint file (or an old one). */
export type WrongGroup = 'pdf' | 'image' | 'hwp' | 'doc' | 'other';

export type WrongAction = { kind: 'link'; href: string; label: string } | { kind: 'photo'; label: string; type: string } | null;

export interface WrongFileHelp {
  code: string;
  /** null: the tool keeps its own line. */
  text: string | null;
  action: WrongAction;
}

/** Bytes read from each end of the file (as the HWP tools' not-hwp help). */
export const HELP_BYTES = 65_536;

const IMAGE_TYPES: Partial<Record<ImageFormat, string>> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  avif: 'image/avif',
  heic: 'image/heic',
  tiff: 'image/tiff',
};

export const WRONG_TEXT = {
  pdfInImage: 'PDF 파일입니다. 이 도구는 사진만 엽니다. PDF 쪽을 사진으로 바꾸려면 PDF JPG 변환을 이용하세요.',
  imageInPdf: '사진 파일입니다. 먼저 PDF로 만들어 주세요.',
  hwpInPdf: '한글 문서입니다. HWP PDF 변환으로 PDF를 만든 뒤 다시 골라 주세요.',
  // A photo tool cannot take the PDF either, so "다시 골라 주세요" would lead to the PDF line next.
  hwpInImage: '한글 문서입니다. 이 도구는 사진만 엽니다. 한글 문서를 PDF로 바꾸려면 HWP PDF 변환을 이용하세요.',
} as const;

export const WRONG_LINKS = {
  pdfToJpg: { href: '/pdf-to-jpg/', label: 'PDF JPG 변환' },
  hwpToPdf: { href: '/hwp-to-pdf/', label: 'HWP PDF 변환' },
} as const;

/**
 * The group of a sniffed family. Any CFB sniffs as `hwp` (an old .doc/.xls is a CFB too): only a name ending in
 * .hwp makes it a 한글 문서, so an old Office file is never called one.
 */
export function wrongGroup(f: FileFamily, name: string): WrongGroup {
  switch (f) {
    case 'pdf':
    case 'image':
      return f;
    case 'hwp':
      return /\.hwp$/i.test(name) ? 'hwp' : 'doc';
    case 'hwpx':
    case 'hwp3':
    case 'hwpml':
      return 'hwp';
    case 'docx':
    case 'xlsx':
    case 'pptx':
    case 'office-old':
      return 'doc';
    default:
      return 'other';
  }
}

/** The line, the next step and the usage code for a file of `group` in a tool that opens `expects`. Pure. */
export function wrongFileHelp(group: WrongGroup, expects: Expects, imageType = 'image/jpeg'): WrongFileHelp {
  if (expects === 'image') {
    switch (group) {
      case 'pdf':
        return { code: 'not-image-pdf', text: WRONG_TEXT.pdfInImage, action: { kind: 'link', ...WRONG_LINKS.pdfToJpg } };
      case 'hwp':
        return { code: 'not-image-hwp', text: WRONG_TEXT.hwpInImage, action: { kind: 'link', ...WRONG_LINKS.hwpToPdf } };
      case 'doc':
        return { code: 'not-image-doc', text: null, action: null };
      default:
        return { code: 'not-image-other', text: null, action: null };
    }
  }
  switch (group) {
    case 'image':
      return { code: 'not-pdf-img', text: WRONG_TEXT.imageInPdf, action: { kind: 'photo', label: '사진 PDF 변환으로 열기', type: imageType } };
    case 'hwp':
      return { code: 'not-pdf-hwp', text: WRONG_TEXT.hwpInPdf, action: { kind: 'link', ...WRONG_LINKS.hwpToPdf } };
    default:
      return { code: 'not-pdf-other', text: null, action: null };
  }
}

/** Reads the file's ends, sniffs them and gives the help. Never throws: an unreadable file is `other`. */
export async function wrongFile(file: File, expects: Expects): Promise<WrongFileHelp> {
  let head: Uint8Array;
  let tail: Uint8Array | null;
  try {
    head = new Uint8Array(await file.slice(0, HELP_BYTES).arrayBuffer());
    tail = file.size > HELP_BYTES ? new Uint8Array(await file.slice(Math.max(HELP_BYTES, file.size - HELP_BYTES)).arrayBuffer()) : null;
  } catch {
    return wrongFileHelp('other', expects);
  }
  // A small file is all in `head`: its ZIP central directory is there too.
  const group = wrongGroup(sniffFormat(head, tail ?? head), file.name);
  return wrongFileHelp(group, expects, group === 'image' ? (IMAGE_TYPES[sniffImage(head).format] ?? 'image/jpeg') : undefined);
}

/**
 * Puts the next step of `help` inside `box`, the tool's error line, after its text: whatever empties or replaces the
 * line (a new pick, reset, the next alert) removes it too. In the embed widget a link opens a new tab (its link rule).
 * `alert` shows the send-failed line of a photo hand-off.
 */
export function showWrongFile(box: HTMLElement, file: File, from: WrongTool, help: WrongFileHelp, alert: (msg: string) => void = () => undefined): void {
  const action = help.action;
  if (!action) return;
  const row = document.createElement('span');
  row.className = 'row';
  if (action.kind === 'link') {
    const a = document.createElement('a');
    a.className = 'btn ghost';
    a.href = action.href;
    a.textContent = action.label;
    if (window.location.pathname.startsWith('/embed/')) {
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = `${action.label} (새 창)`;
    }
    row.append(a);
  } else {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn ghost';
    b.textContent = action.label;
    b.addEventListener('click', () => {
      if (b.disabled) return;
      b.disabled = true;
      void handTo(from, file, action.type).then((ok) => {
        b.disabled = false;
        if (!ok) alert(sendFailed(NEXT_LABELS['jpg-to-pdf']));
      });
    });
    row.append(b);
  }
  box.append(row);
}

/** Hands the photo to 사진 PDF 변환 (이어서 하기); counts it only once it was stored. false: nothing was opened. */
async function handTo(from: WrongTool, file: File, type: string): Promise<boolean> {
  try {
    const { sendTo } = await import('../ui/handoff');
    return await sendTo('jpg-to-pdf', from, file, file.name, type, (path) => {
      track({ e: 'next', t: from, o: 'next', v: 'jpg-to-pdf' });
      window.location.assign(path);
    });
  } catch {
    return false;
  }
}
