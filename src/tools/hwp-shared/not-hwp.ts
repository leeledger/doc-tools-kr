// 본 제품은 한컴의 HWP 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.
// "Not a HWP file" help for the three HWP tools (REQ1014-B D2-D4). Loaded with import() only on the not-hwp path,
// so the initial JS of /hwp-viewer/, /hwp-to-pdf/ and /hwpx-to-hwp/ does not change. It reads the head and the
// tail of the picked file (64 KB each; nothing leaves the device), names what the file really is (PDF, 사진, 워드,
// 엑셀, 압축 파일, 글자만 있는 파일) and offers the next step where the site has one:
//   pdf   -> 「PDF 열기」 (a blob: link in a new tab) and 「PDF 쪽 보기·나누기」 (handed to /pdf-split/)
//   image -> 「사진 PDF 변환으로 열기」 (handed to /jpg-to-pdf/)
// The usage code is -A's notHwpCode() of the sniffed format (src/lib/file/sniff-format.ts).
import { notHwpCode, sniffFormat, type FileFamily } from '../../lib/file/sniff-format';
import { sniffImage, type ImageFormat } from '../../lib/image/sniff';
import { NEXT_LABELS, sendFailed, type NextTarget } from '../../lib/ui/next-steps';
import { track } from '../../lib/ui/usage';
import { HX_COPY } from '../hwpx-to-hwp/copy';
import { ERRORS } from './messages';

export type NotHwpTool = 'hwp-viewer' | 'hwp-to-pdf' | 'hwpx-to-hwp';
/**
 * What the help names; office-old is a CFB the worker said is not a HWP (old .doc/.xls/.ppt). FAIL1030 D: empty is a
 * file under 4 bytes, unread one whose bytes could not be read.
 */
export type Family = 'pdf' | 'docx' | 'xlsx' | 'pptx' | 'office-old' | 'zip' | 'image' | 'text' | 'empty' | 'unread' | 'other';
export type NotHwpAction = 'pdf' | 'image' | null;

export interface NotHwpHelp {
  code: string;
  text: string;
  action: NotHwpAction;
  /** The type the file is handed on with (/jpg-to-pdf/ reads the photo by it). */
  type: string;
}

/** Bytes read from each end of the file. */
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

const NAME: Record<'docx' | 'xlsx' | 'pptx' | 'office-old', string> = {
  docx: '워드 파일(.docx)',
  xlsx: '엑셀 파일(.xlsx)',
  pptx: '파워포인트 파일(.pptx)',
  'office-old': '워드·엑셀 같은 다른 프로그램의 파일',
};
const PICK_HWP = '한글 문서라면 .hwp 또는 .hwpx 파일을 골라 주세요.';
/** FAIL1030 D: unknown bytes are often a 보안 문서 (DRM); no signature is checked, so the line is a hedge. */
const SECURE_HWP = '한글 문서로 읽을 수 없는 파일입니다. 회사·기관에서 받은 보안 문서라면 보낸 곳에 PDF로 요청해 주세요.';
const SECURE_HWPX = '한글 문서로 읽을 수 없는 파일이에요. 회사·기관에서 받은 보안 문서라면 보낸 곳에 PDF로 요청해 주세요.';

/** /hwp-viewer/ and /hwp-to-pdf/: 합니다체 (docs/COPY.md). */
function textHwp(family: Family, tool: NotHwpTool): string {
  switch (family) {
    case 'pdf':
      return tool === 'hwp-to-pdf' ? '이미 PDF 파일입니다. 바꾸지 않아도 됩니다.' : 'PDF 파일입니다. PDF는 휴대폰·컴퓨터에서 바로 열 수 있습니다.';
    case 'docx':
    case 'xlsx':
    case 'pptx':
    case 'office-old':
      return `${NAME[family]}입니다. ${PICK_HWP}`;
    case 'zip':
      return '압축 파일(ZIP)입니다. 압축을 푼 뒤 안에 있는 .hwp 또는 .hwpx 파일을 골라 주세요.';
    case 'image':
      return '사진 파일입니다. 사진을 PDF로 만들려면 아래 버튼을 누르세요.';
    case 'text':
      return `글자만 있는 파일입니다. ${PICK_HWP}`;
    case 'empty':
      return '빈 파일입니다. 파일을 다시 내려받은 뒤 시도해 주세요.';
    case 'unread':
      return ERRORS.corrupt;
    case 'other':
      return SECURE_HWP;
  }
}

/** /hwpx-to-hwp/: 해요체 (its docs/COPY.md exception). */
function textHwpx(family: Family): string {
  switch (family) {
    case 'pdf':
      return 'PDF 파일이에요. HWP로 바꿀 필요 없이 바로 열 수 있어요.';
    case 'docx':
    case 'xlsx':
    case 'pptx':
    case 'office-old':
      return `${NAME[family]}이에요. 확장자가 .hwpx인 한글 파일을 골라 주세요.`;
    case 'zip':
      return '압축 파일(ZIP)이에요. 압축을 푼 뒤 안에 있는 .hwpx 파일을 골라 주세요.';
    case 'image':
      return '사진 파일이에요. 사진을 PDF로 만들려면 아래 버튼을 누르세요.';
    case 'text':
      return HX_COPY.notHwpx;
    case 'empty':
      return '빈 파일이에요. 파일을 다시 내려받은 뒤 시도해 주세요.';
    case 'unread':
      return '문서가 손상되었거나 끝까지 내려받아지지 않았어요. 파일을 다시 내려받은 뒤 시도해 주세요.';
    case 'other':
      return SECURE_HWPX;
  }
}

export function helpText(family: Family, tool: NotHwpTool): string {
  return tool === 'hwpx-to-hwp' ? textHwpx(family) : textHwp(family, tool);
}

/**
 * The family the help names. sniffFormat gives `hwp` for any CFB (bytes alone cannot see the HWP FileHeader stream
 * cheaply): only the worker's "not a HWP" makes it old Office. HWPX, HWP3 and HWPML the worker refused get the
 * line for an unreadable file.
 */
export function familyOf(sniffed: FileFamily, said: 'cfb' | 'zip' | null): Family {
  switch (sniffed) {
    case 'hwp':
      return said === 'cfb' ? 'office-old' : 'other';
    case 'pdf':
    case 'docx':
    case 'xlsx':
    case 'pptx':
    case 'office-old':
    case 'zip':
    case 'image':
    case 'text':
      return sniffed;
    default:
      return 'other';
  }
}

/** Reads the file's ends, sniffs them and gives the line, the next step and the usage code. Never throws. */
export async function notHwpHelp(file: File, tool: NotHwpTool, workerSaid: 'cfb' | 'zip' | null): Promise<NotHwpHelp> {
  let head: Uint8Array;
  let tail: Uint8Array | null;
  try {
    head = new Uint8Array(await file.slice(0, HELP_BYTES).arrayBuffer());
    tail = file.size > HELP_BYTES ? new Uint8Array(await file.slice(Math.max(HELP_BYTES, file.size - HELP_BYTES)).arrayBuffer()) : null;
  } catch {
    // The file is gone (Android revokes some picks): the 손상 line, so the visitor picks it again.
    return { code: notHwpCode('unread'), text: helpText('unread', tool), action: null, type: 'application/octet-stream' };
  }
  if (file.size < 4 || head.length < 4) return { code: notHwpCode('empty'), text: helpText('empty', tool), action: null, type: 'application/octet-stream' };
  // A small file is all in `head`: its central directory is there too.
  const sniffed = sniffFormat(head, tail ?? head);
  const family = familyOf(sniffed, workerSaid);
  const action: NotHwpAction = family === 'pdf' ? 'pdf' : family === 'image' ? 'image' : null;
  const type = family === 'pdf' ? 'application/pdf' : family === 'image' ? (IMAGE_TYPES[sniffImage(head).format] ?? 'image/jpeg') : file.type || 'application/octet-stream';
  return { code: notHwpCode(sniffed), text: helpText(family, tool), action, type };
}

export const BUTTONS = { openPdf: 'PDF 열기', splitPdf: 'PDF 쪽 보기·나누기', toJpgPdf: '사진 PDF 변환으로 열기' } as const;

/** Hands `file` to `to` (이어서 하기); counts it only once it was stored. false: nothing was opened. */
export async function handTo(to: NextTarget | 'hwp-viewer' | 'hwp-to-pdf', from: NotHwpTool, file: File, type: string, go: (path: string) => void = (p) => window.location.assign(p)): Promise<boolean> {
  try {
    const { sendTo } = await import('../../lib/ui/handoff');
    return await sendTo(to, from, file, file.name, type, (path) => {
      track({ e: 'next', t: from, o: 'next', v: to });
      go(path);
    });
  } catch {
    return false;
  }
}

/**
 * Fills `box` with the buttons of `help.action` (empty and hidden for none). `alert` shows the send-failed line.
 * Returns the cleanup: revokes the PDF link and empties the box (reset, a new pick, pagehide).
 */
export function showActions(box: HTMLElement, file: File, tool: NotHwpTool, help: NotHwpHelp, alert: (msg: string) => void): () => void {
  let url: string | null = null;
  const dispose = (): void => {
    if (url) URL.revokeObjectURL(url);
    url = null;
    box.replaceChildren();
    box.hidden = true;
    window.removeEventListener('pagehide', dispose);
  };
  box.replaceChildren();
  if (!help.action) {
    box.hidden = true;
    return dispose;
  }
  const button = (label: string, to: NextTarget, type: string): HTMLButtonElement => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn ghost';
    b.textContent = label;
    b.addEventListener('click', () => {
      if (b.disabled) return;
      b.disabled = true;
      void handTo(to, tool, file, type).then((ok) => {
        b.disabled = false;
        if (!ok) alert(sendFailed(NEXT_LABELS[to]));
      });
    });
    return b;
  };
  const items: HTMLElement[] = [];
  if (help.action === 'pdf') {
    // A renamed file carries the wrong type: the link always says PDF. Nothing leaves the device.
    url = URL.createObjectURL(new Blob([file], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.className = 'btn ghost';
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = BUTTONS.openPdf;
    items.push(a, button(BUTTONS.splitPdf, 'pdf-split', 'application/pdf'));
  } else {
    items.push(button(BUTTONS.toJpgPdf, 'jpg-to-pdf', help.type));
  }
  const row = document.createElement('span');
  row.className = 'row';
  row.append(...items);
  box.append(row);
  box.hidden = false;
  window.addEventListener('pagehide', dispose);
  return dispose;
}
