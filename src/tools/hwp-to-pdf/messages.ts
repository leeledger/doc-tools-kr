// Copy of HWP PDF 변환 (brief Step 5 §3.2; docs/COPY.md: 합니다체, two-sentence errors, numbers with units).
import type { HwpErrorCode } from '../../lib/hwp/errors';
import { MIB, MB_DEC } from '../../lib/hwp/limits';
import type { Reason } from '../../lib/hwp/route';
import type { Device } from '../../lib/ui/device';

export const HANCOM_NOTICE = '본 제품은 한컴의 HWP 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.';
export const TRADEMARK_NOTICE = '한글, 한컴, HWP, HWPX는 한글과컴퓨터의 등록상표이며, 본 서비스는 한글과컴퓨터와 무관합니다.';

/** `80 MB`, `10.5 MB`: the 1,000,000-byte MB of the limits, at most one decimal (so a file just over a cap
 * never reads as the cap itself). */
export function mbDec(bytes: number): string {
  const v = Math.ceil((bytes / MB_DEC) * 10) / 10;
  return `${v.toLocaleString('ko-KR', { maximumFractionDigits: 1 })} MB`;
}

export function mib(bytes: number): string {
  return `${Math.round(bytes / MIB).toLocaleString('ko-KR')} MiB`;
}

export const ERRORS: Record<Exclude<HwpErrorCode, 'too-large' | 'engine'>, string> = {
  'not-hwp': '한글(HWP·HWPX) 문서가 아닙니다. 확장자가 .hwp 또는 .hwpx인 파일을 골라 주세요.',
  unsupported: '이 형식의 한글 문서는 열 수 없습니다. HWPML(.hml) 문서는 한글 프로그램에서 HWP나 HWPX로 저장한 뒤 다시 시도해 주세요.',
  password: '비밀번호가 걸린 문서는 열 수 없습니다. 한글 프로그램에서 암호를 해제한 뒤 다시 시도해 주세요.',
  distribution: '배포용 문서는 열 수 없습니다. 문서를 만든 곳에 일반 문서나 PDF를 요청해 주세요.',
  corrupt: '문서가 손상되었거나 끝까지 내려받아지지 않았습니다. 파일을 다시 내려받은 뒤 시도해 주세요.',
  oom: '이 브라우저에서 처리하기에는 문서가 너무 무겁습니다. 컴퓨터에서 열거나 다른 브라우저로 다시 시도해 주세요.',
  timeout: '문서를 여는 데 너무 오래 걸려 중단했습니다. 컴퓨터에서 열거나 다른 브라우저로 다시 시도해 주세요.',
};

export function tooLargeMessage(device: Device, fileBytes: number, limit: number): string {
  const where = device === 'mobile' ? '휴대폰에서는' : '이 브라우저에서는';
  const next = device === 'mobile' ? ' 컴퓨터에서 열어 주세요.' : ' 문서를 나눈 뒤 다시 시도해 주세요.';
  return `${where} ${mbDec(limit)}까지 열 수 있습니다 (이 파일 ${mbDec(fileBytes)}).${next}`;
}

/** Viewer-first banner (orchestrator wording for 수식·도형; the 100쪽 line for long documents). */
export function viewerFirstMessage(reasons: Reason[]): string {
  const shapes = reasons.some((r) => r.kind === 'equations' || r.kind === 'textboxes');
  const long = reasons.some((r) => r.kind === 'long');
  if (shapes && long) return '이 문서는 수식·도형이 많아 변환 결과가 원본과 다를 수 있습니다 (100쪽 이상)';
  if (shapes) return '이 문서는 수식·도형이 많아 변환 결과가 원본과 다를 수 있습니다';
  return '이 문서는 100쪽이 넘어 변환 결과가 원본과 다를 수 있습니다';
}

/** Viewer-only banner: the first cap reason with the limit and this file's value. */
export function viewerOnlyMessage(device: Device, reasons: Reason[]): string {
  const r = reasons.find((x) => x.kind === 'bytes' || x.kind === 'pages' || x.kind === 'wasm' || x.kind === 'images');
  const where = device === 'mobile' ? '이 기기에서는' : '이 브라우저에서는';
  let what = '';
  if (r && 'limit' in r) {
    if (r.kind === 'bytes') what = `${mbDec(r.limit)}가 넘는 문서를 PDF로 저장할 수 없어 보기만 제공합니다 (이 문서 ${mbDec(r.value)})`;
    else if (r.kind === 'pages') what = `${r.limit.toLocaleString('ko-KR')}쪽이 넘는 문서를 PDF로 저장할 수 없어 보기만 제공합니다 (이 문서 ${r.value.toLocaleString('ko-KR')}쪽)`;
    else if (r.kind === 'wasm') what = `처리 메모리가 ${mib(r.limit)}를 넘는 문서를 PDF로 저장할 수 없어 보기만 제공합니다 (이 문서 ${mib(r.value)})`;
    else what = `그림이 ${mbDec(r.limit)}가 넘게 들어 있는 문서를 PDF로 저장할 수 없어 보기만 제공합니다 (이 문서 ${mbDec(r.value)})`;
  }
  const tail = device === 'mobile' ? ' 컴퓨터에서 열면 저장할 수 있습니다.' : '';
  return `${where} ${what}.${tail}`;
}

export const COPY = {
  engine: (pct: number): string => `변환 도구를 불러오는 중… ${pct}%`,
  opening: '문서를 여는 중',
  pages: (n: number, m: number): string => `${n}/${m}쪽 준비 중`,
  ready: (m: number): string => `${m}쪽 문서를 열었습니다.`,
  fonts: '글꼴을 불러오는 중',
  note: '원본 프로그램과 글꼴·줄바꿈이 조금 다를 수 있습니다.',
  afterPrint: 'PDF 파일이 저장되지 않았다면 인쇄 창에서 PDF로 저장을 골랐는지 확인해 주세요.',
  inflight: '이전 문서가 너무 커서 브라우저가 멈췄습니다. 컴퓨터에서 열거나 더 작은 문서로 다시 시도해 주세요.',
  pageFailed: '이 쪽을 표시하지 못했습니다',
  viewerOnlyPrint: '이 문서는 보기 전용입니다',
  canceled: '전체 변환을 취소했습니다.',
} as const;
