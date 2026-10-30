// PDF 용량 줄이기 copy (EN0): every string the controller shows, moved verbatim from controller.ts and limits.ts. The
// page passes KO to initCompressTool; an English catalog satisfies the same Messages interface. Particles stay here.
// The level names and target chips the page renders stay in level-copy.ts (a CORE_PATH of the UI font).
import type { Phase } from '../../lib/pdf/compress/report';
import type { PdfErrorCode } from '../../lib/pdf/errors';
import { MB, type Device } from '../../lib/ui/device';
import { ENGINE_KO, type EngineMessages } from '../../lib/ui/engine-load';
import { formatPages } from '../../lib/ui/format';
import { josa } from '../../lib/ui/josa';
import { NEXT_KO, type NextMessages } from '../../lib/ui/next-steps';
import { nonPdfMessage } from '../../lib/ui/pdf-pick';
import { compressedFileName } from './format';
import type { LimitCopy } from './limits';
import { TARGET_COPY, TARGET_RANGE_MESSAGE } from './target';

export interface Messages {
  /** The catalog's language mark (scripts/lib/en-check.mjs CATALOG_MARK): check-dist finds a catalog in a page's JS by it. */
  mark: string;
  errors: Record<PdfErrorCode, string>;
  limits: LimitCopy;
  engine: EngineMessages;
  next: NextMessages;
  /** "12쪽". */
  pages: (n: number) => string;
  /** The alert for a file that is not a PDF. */
  nonPdf: (names: string[]) => string;
  /** The download name; `raster` for "이미지로 변환". */
  fileName: (name: string, raster: boolean) => string;
  /** 목표 용량: the hit chip, the miss warning, the already-under panel and the search progress. */
  target: {
    chip: (target: string) => string;
    miss: (target: string, size: string, rasterTried: boolean) => string;
    already: (target: string, size: string) => string;
    progress: (rung: number, of: number) => string;
  };
  targetRange: string;
  phases: Record<Phase, string>;
  preparing: string;
  blockPending: string;
  blockInspecting: string;
  blockPassword: string;
  againTarget: string;
  againLevel: string;
  thumbPending: string;
  thumbLocked: string;
  thumbInspecting: string;
  thumbPdf: string;
  checking: (name: string) => string;
  locked: (name: string) => string;
  ready: (name: string, pages: string) => string;
  pwEmpty: string;
  unlocked: (name: string, pages: string) => string;
  rasterProgress: string;
  rasterStatus: string;
  targetStatus: string;
  levelStatus: string;
  targetImages: (rung: string, done: number, total: number) => string;
  reduced: (percent: number, pages: string) => string;
  saveName: (name: string) => string;
  previewOriginal: string;
  previewResult: string;
  noteUnlocked: string;
  noteOwner: string;
  done: (headline: string, summary: string, extra: string) => string;
  keptRaster: string;
  keptOptimized: string;
  keptJpx: string;
  keptBilevel: string;
  cancelled: string;
  reset: string;
  backToRecommended: string;
}

const mbText = (bytes: number): string => `${Math.round(bytes / MB).toLocaleString('ko-KR')} MB`;
const pagesText = (n: number): string => `${n.toLocaleString('ko-KR')}쪽`;
const where = (device: Device): string => (device === 'mobile' ? '휴대폰에서는' : '이 기기에서는');
const MEMORY = '이 기기에서 처리하기에 너무 커서 화면이 멈출 수 있기 때문입니다.';
const SLOW = '처리할 양이 많아 오래 걸리거나 화면이 멈출 수 있습니다.';

export const KO = {
  mark: 'catalog-mark:ko',
  errors: {
    'not-pdf': 'PDF 파일이 아닙니다. PDF 파일을 골라 주세요.',
    password: '이 파일은 비밀번호로 보호되어 있습니다. 비밀번호를 입력해 주세요.',
    'wrong-password': '비밀번호가 맞지 않습니다.',
    corrupt: '파일이 손상되었거나 다운로드가 완료되지 않았습니다. 원본을 다시 받아 주세요.',
    oom: '이 기기에서 한 번에 처리할 수 있는 양을 넘었습니다. 더 작은 파일로 시도하거나 PC에서 이용해 주세요.',
    unknown: '처리 중 문제가 생겼습니다. 새로고침 후 다시 시도해 주세요.',
    verify: '결과 파일을 검증하지 못해 원본을 그대로 둡니다. 다른 단계로 다시 시도해 주세요.',
  },
  limits: {
    // FAIL1030 B: over PDF 나누기's limit too, a phone is pointed to a computer.
    fileBytes: (hardBytes, device) => `${where(device)} ${mbText(hardBytes)}까지 줄일 수 있습니다. ${MEMORY}${device === 'mobile' ? ' 컴퓨터에서 해 보세요.' : ''}`,
    rasterPages: (hardPages, device) => `이미지로 변환은 ${where(device)} ${pagesText(hardPages)}까지 할 수 있습니다. 쪽마다 큰 이미지를 만들어 ${MEMORY}`,
    softRaster: (pages) => `${josa(pagesText(pages), '이/가')} 넘는 파일을 이미지로 바꾸면 ${SLOW} 계속 줄일까요?`,
    softBytes: (bytes) => `${josa(mbText(bytes), '이/가')} 넘는 파일은 ${SLOW} 계속 줄일까요?`,
    softPages: (pages) => `${josa(pagesText(pages), '이/가')} 넘는 파일은 ${SLOW} 계속 줄일까요?`,
    split: {
      fileBytes: (hardBytes, device) => `${where(device)} ${mbText(hardBytes)}까지 줄일 수 있습니다. 쪽을 나눠 작은 파일 몇 개로 만든 뒤 하나씩 줄여 보세요.`,
      button: 'PDF 나누기로 열기',
    },
  },
  engine: ENGINE_KO,
  next: NEXT_KO,
  pages: formatPages,
  nonPdf: nonPdfMessage,
  fileName: compressedFileName,
  target: TARGET_COPY,
  targetRange: TARGET_RANGE_MESSAGE,
  phases: {
    normalize: '파일 분석 중…',
    images: '이미지 줄이는 중…',
    optimize: '마무리 중…',
    verify: '마무리하는 중…',
  },
  preparing: '처리 도구를 준비하는 중입니다(처음 한 번만).',
  blockPending: '처리 도구를 불러오지 못해 파일을 확인하지 못했습니다.',
  blockInspecting: '파일을 확인하는 중입니다.',
  blockPassword: '비밀번호를 입력하면 줄일 수 있습니다.',
  againTarget: '다른 용량으로 다시 줄이기',
  againLevel: '다른 단계로 다시 줄이기',
  thumbPending: '대기',
  thumbLocked: '잠김',
  thumbInspecting: '확인 중',
  thumbPdf: 'PDF',
  checking: (name) => `${name} 파일을 확인하는 중입니다.`,
  locked: (name) => `${name}: 이 파일은 비밀번호로 보호되어 있습니다.`,
  ready: (name, pages) => `${name}, ${pages}. 압축 단계나 목표 용량을 고른 뒤 PDF 용량 줄이기를 누르세요.`,
  pwEmpty: '비밀번호를 입력해 주세요.',
  unlocked: (name, pages) => `${name}의 잠금을 풀었습니다. ${pages}.`,
  rasterProgress: '쪽을 이미지로 바꾸는 중…',
  rasterStatus: '쪽을 이미지로 바꾸는 중입니다.',
  targetStatus: '목표 용량에 맞추는 중입니다.',
  levelStatus: '용량을 줄이는 중입니다.',
  targetImages: (rung, done, total) => `${rung} · 이미지 ${done}/${total}`,
  reduced: (percent, pages) => `${percent}% 줄었습니다 · ${pages}`,
  saveName: (name) => `저장될 이름: ${name}`,
  previewOriginal: '원본',
  previewResult: '결과',
  noteUnlocked: '줄인 파일에는 비밀번호가 걸려 있지 않습니다.',
  noteOwner: '보안 설정(편집 제한)을 해제한 사본입니다.',
  done: (headline, summary, extra) => `용량을 줄였습니다. ${headline}, ${summary}. ${extra}`.trim(),
  keptRaster: '이미지로 바꾸면 오히려 커져서 원본을 그대로 둡니다. 이 파일에는 이 방법이 맞지 않습니다.',
  keptOptimized: '이미 최적화된 파일입니다. 줄일 수 있는 이미지가 없어 원본을 그대로 둡니다.',
  keptJpx: '이 파일의 이미지는 JPEG2000 형식이라 아직 줄이지 못합니다.',
  keptBilevel: '흑백 스캔 이미지는 이미 작게 저장되어 있습니다.',
  cancelled: '줄이기를 취소했습니다. 파일과 설정은 그대로 있습니다.',
  reset: '처음 상태로 돌아왔습니다.',
  backToRecommended: '권장 단계로 돌아왔습니다.',
} satisfies Messages;
