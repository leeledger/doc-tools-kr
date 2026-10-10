// 본 제품은 한컴의 HWP 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.
// In-tool lines of HWPX HWP 변환 (HWPX2HWP brief decisions 5, 9, 12): written as the brief gives them (해요체,
// docs/COPY.md exception). Page copy (steps, notes, FAQ) lives in the page and tools.ts.
import { josa } from '../../lib/ui/josa';

/** rhwp documents no loss kinds (rhwp.d.ts: contentLoss() is "content-loss 보고서(JSON)" only), so every loss is 기타. */
export const LOSS_OTHER = '기타';

export const HX_COPY = {
  checking: '파일을 확인하는 중',
  converting: 'HWP로 바꾸는 중',
  notHwpx: 'HWPX 파일이 아니에요. 확장자가 .hwpx인 한글 파일을 골라 주세요.',
  /** adm14.hwp · 49.0 KB */
  result: (name: string, size: string): string => `${name} · ${size}`,
  ready: (name: string): string => `${josa(`「${name}」`, '을/를')} 만들었어요. 「HWP 내려받기」를 누르세요.`,
  losses: (n: number): string => `HWP로 옮기지 못한 내용이 ${n.toLocaleString('ko-KR')}곳 있어요. 한글에서 꼭 확인한 뒤 내세요.`,
  lossItem: (label: string, n: number): string => `${label} ${n.toLocaleString('ko-KR')}곳`,
  downloaded: (name: string): string => `${josa(`「${name}」`, '을/를')} 내려받았어요. 「다운로드」 폴더를 확인하세요.`,
} as const;
