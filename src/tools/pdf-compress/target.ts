// 목표 용량 input and copy (brief Polish P.13). Pure.
import { TARGET_MB_BYTES } from '../../lib/pdf/compress/levels';

export const TARGET_MB = { min: 0.5, max: 100 } as const;
export const TARGET_RANGE_MESSAGE = '0.5~100 MB 사이로 입력해 주세요.';

/** MB from 0.5 to 100 in steps of 0.1 ("12", "12.5", "0.5"; a comma decimal is accepted), else null. */
export function parseTargetMb(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (!/^\d+(\.\d)?$/.test(t)) return null;
  const v = Number(t);
  return v >= TARGET_MB.min && v <= TARGET_MB.max ? v : null;
}

export const targetBytes = (mb: number): number => Math.round(mb * TARGET_MB_BYTES);

/** "10 MB", "0.5 MB", "12.5 MB". */
export const targetLabel = (mb: number): string => `${mb.toLocaleString('ko-KR', { maximumFractionDigits: 1 })} MB`;

export const TARGET_COPY = {
  chip: (t: string) => `✓ ${t} 이하`,
  miss: (t: string, size: string, rasterTried: boolean) =>
    `${t} 이하로는 줄이지 못했습니다. 가장 작게 줄인 결과는 ${size}입니다.${rasterTried ? '' : ' 이미지로 변환을 켜거나 파일을 나눠 제출해 보세요.'}`,
  already: (t: string, size: string) => `이미 ${t} 이하입니다(${size}). 원본을 그대로 제출하면 됩니다.`,
  progress: (rung: number, of: number) => `목표 용량에 맞추는 중… (${rung}/${of}단계)`,
};
