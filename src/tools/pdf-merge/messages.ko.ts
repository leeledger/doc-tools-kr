// PDF 합치기 copy (EN0): every string the controller shows, moved verbatim from controller.ts and limits.ts. The page
// passes KO to initMergeTool; an English catalog satisfies the same Messages interface. Particles (josa) stay here.
import type { PdfErrorCode } from '../../lib/pdf/errors';
import { MB, type Device } from '../../lib/ui/device';
import { ENGINE_KO, type EngineMessages } from '../../lib/ui/engine-load';
import { formatPages } from '../../lib/ui/format';
import { josa } from '../../lib/ui/josa';
import { NEXT_KO, type NextMessages } from '../../lib/ui/next-steps';
import { nonPdfMessage } from '../../lib/ui/pdf-pick';
import { mergedFileName } from './format';
import type { LimitCopy } from './limits';

export interface Messages {
  /** The catalog's language mark (scripts/lib/en-check.mjs CATALOG_MARK): check-dist finds a catalog in a page's JS by it. */
  mark: string;
  errors: Record<PdfErrorCode, string>;
  limits: LimitCopy;
  engine: EngineMessages;
  next: NextMessages;
  /** "12쪽". */
  pages: (n: number) => string;
  /** The alert for files that are not PDFs. */
  nonPdf: (names: string[]) => string;
  /** The download name of `count` merged files, the first named `firstName`. */
  fileName: (firstName: string, count: number) => string;
  preparing: string;
  blockOne: string;
  blockPending: string;
  blockInspecting: string;
  blockError: string;
  blockLocked: string;
  runButton: (n: number) => string;
  thumbLocked: string;
  thumbInspecting: string;
  thumbPending: string;
  thumbPdf: string;
  stateLocked: string;
  stateError: string;
  moveUp: (name: string) => string;
  moveDown: (name: string) => string;
  remove: (name: string) => string;
  ownerNote: string;
  pwState: string;
  pwLabel: string;
  pwToggle: string;
  pwOk: string;
  pwOkLabel: (name: string) => string;
  pwEmpty: string;
  moved: (name: string, total: number, pos: number) => string;
  removed: (name: string, left: number) => string;
  removedBad: (bad: number, left: number) => string;
  added: (added: number, total: number) => string;
  unlocked: (name: string) => string;
  progress: (done: number, total: number) => string;
  merging: string;
  cancelled: string;
  saveName: (name: string) => string;
  noteUnlocked: string;
  noteRenamed: (n: number) => string;
  done: (summary: string, notes: string) => string;
  reset: string;
}

const mbText = (bytes: number): string => `${Math.round(bytes / MB).toLocaleString('ko-KR')} MB`;
const where = (device: Device): string => (device === 'mobile' ? '휴대폰' : '이 기기');

export const KO = {
  mark: 'catalog-mark:ko',
  errors: {
    'not-pdf': 'PDF 파일이 아닙니다. PDF 파일만 합칠 수 있습니다.',
    password: '이 파일은 비밀번호로 보호되어 있습니다.',
    'wrong-password': '비밀번호가 맞지 않습니다.',
    corrupt: '파일이 손상되었거나 다운로드가 완료되지 않았습니다. 원본을 다시 받아 주세요.',
    oom: '이 기기에서 한 번에 처리할 수 있는 양을 넘었습니다. 파일 수를 줄여 나눠서 합쳐 주세요.',
    unknown: '처리 중 문제가 생겼습니다. 새로고침 후 다시 시도해 주세요.',
    // Not sent by the merge worker (it maps a failed output check to corrupt); required by the type.
    verify: '처리 중 문제가 생겼습니다. 새로고침 후 다시 시도해 주세요.',
  },
  limits: {
    tooMany: (max, over) => `한 번에 최대 ${max}개 파일까지 합칠 수 있어 ${over}개 파일은 추가하지 않았습니다. 나머지는 나눠서 합쳐 주세요.`,
    tooBig: (hardBytes, device) =>
      `파일 합계가 ${josa(mbText(hardBytes), '을/를')} 넘으면 ${where(device)}에서 한 번에 합칠 수 없어 일부 파일을 추가하지 않았습니다. 파일을 나눠서 합쳐 주세요.`,
    softBytes: (softBytes) => `파일 합계가 ${josa(mbText(softBytes), '을/를')} 넘습니다. 처리할 양이 많아 오래 걸리거나 화면이 멈출 수 있습니다. 계속 합칠까요?`,
    softPages: (softPages) => `모두 ${softPages.toLocaleString('ko-KR')}쪽이 넘습니다. 처리할 양이 많아 오래 걸리거나 화면이 멈출 수 있습니다. 계속 합칠까요?`,
  },
  engine: ENGINE_KO,
  next: NEXT_KO,
  pages: formatPages,
  nonPdf: nonPdfMessage,
  fileName: mergedFileName,
  preparing: '처리 도구를 준비하는 중입니다(처음 한 번만).',
  blockOne: '파일을 하나 더 추가하면 합칠 수 있습니다.',
  blockPending: '처리 도구를 불러오지 못해 파일을 확인하지 못했습니다.',
  blockInspecting: '파일을 확인하는 중입니다.',
  blockError: '문제가 있는 파일을 목록에서 삭제하면 합칠 수 있습니다.',
  blockLocked: '비밀번호가 걸린 파일의 비밀번호를 입력하면 합칠 수 있습니다.',
  runButton: (n) => `PDF ${n}개 합치기`,
  thumbLocked: '잠김',
  thumbInspecting: '확인 중',
  thumbPending: '대기',
  thumbPdf: 'PDF',
  stateLocked: '잠김',
  stateError: '오류',
  moveUp: (name) => `${name} 위로 이동`,
  moveDown: (name) => `${name} 아래로 이동`,
  remove: (name) => `${name} 삭제`,
  ownerNote: '보안 설정(편집 제한)이 해제된 사본이 만들어집니다',
  pwState: '이 파일은 비밀번호로 보호되어 있습니다.',
  pwLabel: '비밀번호',
  pwToggle: '비밀번호 보기',
  pwOk: '확인',
  pwOkLabel: (name) => `${name} 비밀번호 확인`,
  pwEmpty: '비밀번호를 입력해 주세요.',
  moved: (name, total, pos) => `${name}: ${total}개 중 ${pos}번째로 옮겼습니다.`,
  removed: (name, left) => `${name} 파일을 목록에서 뺐습니다. ${left}개 남았습니다.`,
  removedBad: (bad, left) => `문제 파일 ${bad}개를 목록에서 뺐습니다. ${left}개 남았습니다.`,
  added: (added, total) => `파일 ${added}개를 추가했습니다. 모두 ${total}개입니다.`,
  unlocked: (name) => `${name}의 잠금을 풀었습니다.`,
  progress: (done, total) => `합치는 중… (${done}/${total})`,
  merging: '합치는 중입니다.',
  cancelled: '합치기를 취소했습니다. 파일 목록은 그대로 있습니다.',
  saveName: (name) => `저장될 이름: ${name}`,
  noteUnlocked: '합친 파일에는 비밀번호가 걸려 있지 않습니다.',
  noteRenamed: (n) => `같은 이름의 입력 칸 ${n}개의 이름을 바꿔 모두 입력할 수 있게 했습니다.`,
  done: (summary, notes) => `합치기를 마쳤습니다. ${summary}. ${notes}`.trim(),
  reset: '처음 상태로 돌아왔습니다.',
} satisfies Messages;
