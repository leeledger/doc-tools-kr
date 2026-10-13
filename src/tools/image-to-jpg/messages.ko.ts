// 사진 JPG 변환 copy (EN0): every string the controller shows, moved verbatim from controller.ts and limits.ts. The
// Korean controller chunk (ko/controller.ts) passes KO to initImageToJpg; an English catalog satisfies the same Messages
// interface. The engine panel copy is passed to entry.ts by the page (it shows before this chunk loads).
import { ERRORS } from '../../lib/image/messages';
import { MB, type Device } from '../../lib/ui/device';
import { josa } from '../../lib/ui/josa';
import { NEXT_KO, type NextMessages } from '../../lib/ui/next-steps';
import { noteText, type RowNote } from './convert';
import type { LimitCopy } from './limits';

export interface Messages {
  /** The catalog's language mark (scripts/lib/en-check.mjs CATALOG_MARK): check-dist finds a catalog in a page's JS by it. */
  mark: string;
  /** Row and alert messages shared with the other photo tools (lib/image/messages.ts). */
  errors: Record<'heic' | 'not-image' | 'empty' | 'corrupt' | 'truncated' | 'oom' | 'unknown' | 'zip', string>;
  limits: LimitCopy;
  next: NextMessages;
  /** A row note (drawn smaller, transparency, first frame). */
  note: (n: RowNote) => string;
  canvas: string;
  encoder: string;
  /** A picture format this tool does not take ("TIFF"). */
  notFormat: (label: string) => string;
  runButton: (n: number) => string;
  runIdle: string;
  hintChecking: string;
  hintSkip: string;
  thumbChecking: string;
  thumbPhoto: string;
  stateError: string;
  download: string;
  downloadLabel: (name: string) => string;
  remove: (name: string) => string;
  removed: (name: string, left: number) => string;
  added: (added: number, total: number) => string;
  progress: (done: number, total: number) => string;
  converting: string;
  allFailed: string;
  cancelled: string;
  saveName: (name: string) => string;
  /** `label`: JPG, PNG or WebP. */
  headlineMany: (label: string, count: number) => string;
  headlineOne: (label: string) => string;
  failedCount: (n: number) => string;
  done: (headline: string, summary: string) => string;
  reset: string;
}

const mbText = (bytes: number): string => `${Math.round(bytes / MB).toLocaleString('ko-KR')} MB`;
const where = (device: Device): string => (device === 'mobile' ? '휴대폰' : '이 기기');

export const KO = {
  mark: 'catalog-mark:ko',
  errors: ERRORS,
  limits: {
    tooMany: (maxImages, left) =>
      `한 번에 최대 ${maxImages.toLocaleString('ko-KR')}장까지 바꿀 수 있어 ${left.toLocaleString('ko-KR')}장은 추가하지 않았습니다. 나머지는 나눠서 바꿔 주세요.`,
    fileTooBig: (maxFileBytes, device, left) =>
      `사진 한 장은 ${where(device)}에서 ${mbText(maxFileBytes)}까지 넣을 수 있어 ${left.toLocaleString('ko-KR')}장은 추가하지 않았습니다.`,
    totalTooBig: (maxTotalBytes, device, left) =>
      `사진 합계가 ${josa(mbText(maxTotalBytes), '을/를')} 넘으면 ${where(device)}에서 한 번에 바꿀 수 없어 ${left.toLocaleString('ko-KR')}장은 추가하지 않았습니다. 나눠서 바꿔 주세요.`,
  },
  next: NEXT_KO,
  note: noteText,
  canvas: '이 기기에서 사진을 그리지 못했습니다. 다른 앱이나 PC에서 다시 해 주세요.',
  encoder: '이 형식으로 저장하지 못했습니다. 다른 저장 형식을 골라 다시 해 주세요.',
  notFormat: (label) => `${label} 형식은 아직 바꿀 수 없습니다.`,
  runButton: (n) => `사진 ${n.toLocaleString('ko-KR')}장 변환하기`,
  runIdle: '변환하기',
  hintChecking: '사진을 확인하는 중입니다.',
  hintSkip: '문제가 있는 사진은 빼고 바꿉니다.',
  thumbChecking: '확인 중',
  thumbPhoto: '사진',
  stateError: '오류',
  download: '내려받기',
  downloadLabel: (name) => `${name} 내려받기`,
  remove: (name) => `${name} 삭제`,
  removed: (name, left) => `${name} 사진을 목록에서 뺐습니다. ${left}장 남았습니다.`,
  added: (added, total) => `사진 ${added}장을 추가했습니다. 모두 ${total}장입니다.`,
  progress: (done, total) => `바꾸는 중… (${done}/${total})`,
  converting: '사진을 바꾸는 중입니다.',
  allFailed: '사진을 바꾸지 못했습니다. 목록에서 이유를 확인해 주세요.',
  cancelled: '변환을 멈췄습니다. 사진 목록은 그대로 있습니다.',
  saveName: (name) => `저장될 이름: ${name}`,
  headlineMany: (label, count) => `${label} 사진 ${count.toLocaleString('ko-KR')}장이 ZIP 파일로 준비되었습니다`,
  headlineOne: (label) => `${label} 사진이 준비되었습니다`,
  failedCount: (n) => `바꾸지 못한 사진 ${n.toLocaleString('ko-KR')}장`,
  done: (headline, summary) => `${headline}. ${summary}.`,
  reset: '처음 상태로 돌아왔습니다.',
} satisfies Messages;
