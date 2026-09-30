// Copy of HWP PDF 변환 (brief Step 5 §3.2; SPIKE-HWP-DIRECT §6.8 plain language; docs/COPY.md: 합니다체,
// two-sentence errors, numbers with units, particles after a variable through josa()).
import type { HwpErrorCode } from '../../lib/hwp/errors';
import { MIB, MB_DEC } from '../../lib/hwp/limits';
import type { Reason } from '../../lib/hwp/route';
import type { Device } from '../../lib/ui/device';
import { josa, particle } from '../../lib/ui/josa';

export const HANCOM_NOTICE = '본 제품은 한컴의 HWP 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.';
export const TRADEMARK_NOTICE = '한글, 한컴, HWP, HWPX는 한글과컴퓨터의 등록상표이며, 본 서비스는 한글과컴퓨터와 무관합니다.';

/** `80 MB`, `10.5 MB`: the 1,000,000-byte MB of the limits, at most one decimal (so a file just over a cap
 * never reads as the cap itself). */
export function mbDec(bytes: number): string {
  const v = Math.ceil((bytes / MB_DEC) * 10) / 10;
  return `${v.toLocaleString('ko-KR', { maximumFractionDigits: 1 })} MB`;
}

/** A WASM memory figure: MiB, written as MB (docs/COPY.md: 1 MB = 1,048,576 bytes). */
export function mib(bytes: number): string {
  return `${Math.round(bytes / MIB).toLocaleString('ko-KR')} MB`;
}

export const ERRORS: Record<Exclude<HwpErrorCode, 'too-large' | 'engine'>, string> = {
  'not-hwp': '한글(HWP·HWPX) 문서가 아닙니다. 확장자가 .hwp 또는 .hwpx인 파일을 골라 주세요.',
  unsupported: '이 형식의 한글 문서는 열 수 없습니다. HWPML(.hml) 문서는 한글 프로그램에서 HWP나 HWPX로 저장한 뒤 다시 시도해 주세요.',
  password: '비밀번호가 걸린 문서는 열 수 없습니다. 한글 프로그램에서 암호를 해제한 뒤 다시 시도해 주세요.',
  distribution: '배포용 문서는 열 수 없습니다. 문서를 만든 곳에 일반 문서나 PDF를 요청해 주세요.',
  corrupt: '문서가 손상되었거나 끝까지 내려받아지지 않았습니다. 파일을 다시 내려받은 뒤 시도해 주세요.',
  oom: '이 기기에서 열기에는 문서가 너무 큽니다. 컴퓨터에서 열거나 Chrome·삼성 인터넷 등 다른 앱으로 열어 주세요.',
  timeout: '문서를 여는 데 너무 오래 걸려 멈췄습니다. 컴퓨터에서 열거나 Chrome·삼성 인터넷 등 다른 앱으로 열어 주세요.',
};

export function tooLargeMessage(device: Device, fileBytes: number, limit: number): string {
  const where = device === 'mobile' ? '휴대폰에서는' : '이 기기에서는';
  const next = device === 'mobile' ? ' 컴퓨터에서 열어 주세요.' : ' 문서를 나눈 뒤 다시 시도해 주세요.';
  return `${where} ${mbDec(limit)}까지 열 수 있습니다 (이 파일 ${mbDec(fileBytes)}).${next}`;
}

const CHECK = '미리보기로 확인한 뒤 내려받으세요.';

/** Viewer-first banner: what may differ, and an invitation to look at the preview. */
export function viewerFirstMessage(reasons: Reason[]): string {
  const shapes = reasons.some((r) => r.kind === 'textboxes');
  const long = reasons.some((r) => r.kind === 'long');
  if (shapes && long) return `글상자·도형이 많고 100쪽 이상인 문서라 위치와 쪽 나눔이 원본과 다를 수 있습니다. ${CHECK}`;
  if (shapes) return `글상자·도형이 많아 위치가 원본과 다를 수 있습니다. ${CHECK}`;
  return `100쪽 이상인 문서라 쪽 나눔이 원본과 다를 수 있습니다. ${CHECK}`;
}

/** Viewer-only banner: the first cap reason with the limit and this file's value. */
export function viewerOnlyMessage(device: Device, reasons: Reason[]): string {
  const r = reasons.find((x) => x.kind === 'bytes' || x.kind === 'pages' || x.kind === 'wasm' || x.kind === 'images');
  const only = 'PDF로 내려받을 수 없어 보기만 할 수 있습니다';
  let what = '';
  if (r && 'limit' in r) {
    if (r.kind === 'bytes') what = `${josa(mbDec(r.limit), '이/가')} 넘는 문서는 ${only} (이 문서 ${mbDec(r.value)})`;
    else if (r.kind === 'pages') what = `${r.limit.toLocaleString('ko-KR')}쪽이 넘는 문서는 ${only} (이 문서 ${r.value.toLocaleString('ko-KR')}쪽)`;
    else if (r.kind === 'wasm') what = `열 때 ${josa(mib(r.limit), '이/가')} 넘게 필요한 문서는 ${only} (이 문서 ${mib(r.value)})`;
    else what = `그림이 ${josa(mbDec(r.limit), '이/가')} 넘게 들어 있는 문서는 ${only} (이 문서 ${mbDec(r.value)})`;
  }
  const tail = device === 'mobile' ? ' 컴퓨터에서 열면 내려받을 수 있습니다.' : '';
  return `이 기기에서는 ${what}.${tail}`;
}

const pages = (n: number): string => `${n.toLocaleString('ko-KR')}쪽`;

export const COPY = {
  engine: (pct: number): string => `처음 한 번만 문서 여는 프로그램을 받는 중 · ${pct}%`,
  opening: '문서를 읽는 중',
  firstPage: (m: number): string => `1/${pages(m)} 보여 드리는 중`,
  exporting: (n: number, m: number): string => `PDF 만드는 중 ${n.toLocaleString('ko-KR')}/${pages(m)}`,
  ready: (m: number): string => `${pages(m)} 문서를 열었습니다.`,
  note: '원본 프로그램과 글꼴·줄바꿈이 조금 다를 수 있습니다.',
  equations: '수식이 들어 있어 수식 모양이 원본과 조금 다를 수 있습니다. 미리보기로 확인해 보세요.',
  /** 「law05.pdf」를 내려받았습니다 · 26쪽 · 312 KB */
  done: (name: string, n: number, size: string): string => `「${name}」${particle(name, '을/를')} 내려받았습니다 · ${pages(n)} · ${size}`,
  failedPages: (n: number): string => `${pages(n)}은 표시하지 못해 빈 쪽으로 넣었습니다.`,
  inflight: '이전 문서가 너무 커서 이 페이지가 멈췄습니다. 컴퓨터에서 열거나 더 작은 문서로 다시 시도해 주세요.',
  pageFailed: '이 쪽을 표시하지 못했습니다',
  canceled: 'PDF 만들기를 취소했습니다.',
} as const;
