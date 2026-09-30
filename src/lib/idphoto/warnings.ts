// The adjust-state checklist (brief Step 4 §2, §3.2). Pure. Warnings never block the save; blocks do
// (the frame leaves the photo, the photo is too small, an invalid custom size). The copy is guidance, not a
// verdict (UX-AUDIT-1 §11.9): 추정 for the head length, 확인 필요 for everything the tool cannot know.
import type { IdPreset } from '../../data/id-photo-presets';
import type { FaceMeasure } from '../face/types';
import type { BackgroundResult } from './background';
import { headLength, inside, type CropState } from './crop';
import { estimateHead } from './frame';

export const YAW_MAX = 10;
export const PITCH_MAX = 12;
export const ROLL_MAX = 5;
export const SMILE_MAX = 0.5;
export const JAW_MAX = 0.2;
export const BLINK_MAX = 0.5;

export type CheckId =
  | 'outside'
  | 'lowres'
  | 'custom'
  | 'yaw'
  | 'pitch'
  | 'roll'
  | 'expression'
  | 'eyes'
  | 'multi'
  | 'head'
  | 'background'
  | 'manual'
  | 'size'
  | 'bytes'
  | 'inside'
  | 'pose';

export interface CheckItem {
  id: CheckId;
  text: string;
}

export interface Checklist {
  blocks: CheckItem[];
  warns: CheckItem[];
  oks: CheckItem[];
}

export interface ChecklistInput {
  /** Null in manual mode (no face, skipped or failed auto-framing). */
  face: FaceMeasure | null;
  state: CropState;
  preset: IdPreset;
  /** Working bitmap size. */
  srcW: number;
  srcH: number;
  lowres: boolean;
  /** Null until measured (or when the preview is unavailable). */
  bg: BackgroundResult | null;
  /** Why the page is in manual mode: `noface` (the model found none) adds the note; other reasons do not. */
  manualReason?: 'noface' | 'skipped' | 'failed' | null;
  /** The custom-size field message, when the custom input is invalid. */
  customError?: string | null;
}

const n1 = (v: number): string => v.toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const n0 = (v: number): string => Math.round(v).toLocaleString('ko-KR');

export const COPY = {
  outside: '사진 바깥 부분이 들어갑니다. 빈 곳을 채우지 않으니 확대하거나 위치를 옮기고, 안 되면 머리 위와 어깨가 넉넉한 사진을 쓰세요.',
  lowres: (w: number, h: number) => `사진 해상도가 낮아 ${w}×${h} px로 만들 수 없습니다. 흐려지지 않게 키우지 않으니 더 큰 원본 사진을 선택해 주세요.`,
  yaw: (deg: number) => `얼굴이 옆으로 약 ${n0(deg)}° 돌아가 있습니다. 정면을 보고 다시 찍는 것이 좋습니다.`,
  pitch: '고개가 위나 아래로 기울어져 있습니다. 정면을 보고 다시 찍는 것이 좋습니다.',
  roll: (deg: number) => `머리가 약 ${n0(deg)}° 기울어져 있습니다. 사진 전체가 기울었다면 기울기를 조정하고, 아니면 다시 찍는 것이 좋습니다.`,
  expression: '입을 다문 무표정이어야 합니다. 치아가 보이거나 웃는 사진은 반려될 수 있습니다.',
  eyes: '눈을 감은 것으로 보입니다. 눈을 자연스럽게 뜬 사진을 쓰세요.',
  multi: '얼굴이 여러 개 보입니다. 가장 큰 얼굴에 맞췄으니 본인만 나온 사진인지 확인하세요.',
  headOfficial: (mm: number) => `추정 머리 길이가 ${n1(mm)} mm로 규격(32–36 mm) 밖입니다. 확대·축소로 턱 끝을 초록 띠 안에 맞추세요.`,
  headReferenceMm: (mm: number) => `추정 머리 길이가 ${n1(mm)} mm로 참고 범위(32–36 mm) 밖입니다. 확대·축소로 턱 끝을 초록 띠 안에 맞추세요.`,
  headReferencePct: (pct: number) => `추정 머리 길이가 사진 높이의 ${n0(pct)}%로 참고 범위(71–80%) 밖입니다. 확대·축소로 턱 끝을 초록 띠 안에 맞추세요.`,
  background: '배경이 흰색이 아닌 것 같습니다. 이 도구는 배경을 바꾸지 않으니 흰 배경에서 다시 찍어 주세요.',
  manual: '얼굴을 찾지 못해 직접 맞추기로 바꿨습니다. 안내선에 정수리와 턱을 맞추세요.',
  size: (w: number, h: number) => `${w}×${h} px로 저장합니다.`,
  bytes: (kb: string) => `${kb} 안으로 맞춥니다.`,
  inside: '사진 안쪽만 씁니다.',
  pose: '얼굴이 정면이고 표정·눈 상태에 문제가 보이지 않습니다.',
} as const;

/** "500 KB 이하" / "350 KB 미만" / "10 MB 이하" for the byte limit line. */
export function limitLabel(p: IdPreset): string | null {
  if (p.limitBytes === undefined || p.limitRule === null) return null;
  const kb = p.limitRule === 'lt' ? (p.limitBytes + 1) / 1000 : p.limitBytes / 1000;
  const txt = kb >= 1000 && kb % 1000 === 0 ? `${n0(kb / 1000)} MB` : `${n0(kb)} KB`;
  return `${txt} ${p.limitRule === 'lt' ? '미만' : '이하'}`;
}

/** The estimated head readout: mm for print presets, % of the height otherwise. */
export function headReading(face: FaceMeasure, state: CropState, preset: IdPreset): { frac: number; mm: number | null; inBand: boolean } {
  const head = estimateHead(face);
  const out = { w: preset.outW, h: preset.outH };
  const { frac, mm } = headLength(head.crown, head.chin, state, out, preset.mm?.h);
  const inBand = frac >= preset.headBand.minFrac - 1e-9 && frac <= preset.headBand.maxFrac + 1e-9;
  return { frac, mm, inBand };
}

export function checklist(i: ChecklistInput): Checklist {
  const blocks: CheckItem[] = [];
  const warns: CheckItem[] = [];
  const oks: CheckItem[] = [];
  const out = { w: i.preset.outW, h: i.preset.outH };
  if (i.customError) blocks.push({ id: 'custom', text: i.customError });
  if (i.lowres) blocks.push({ id: 'lowres', text: COPY.lowres(out.w, out.h) });
  else if (!inside(i.state, out, i.srcW, i.srcH)) blocks.push({ id: 'outside', text: COPY.outside });

  const f = i.face;
  if (f) {
    let poseOk = true;
    if (f.pose && Math.abs(f.pose.yaw) > YAW_MAX) {
      warns.push({ id: 'yaw', text: COPY.yaw(Math.abs(f.pose.yaw)) });
      poseOk = false;
    }
    if (f.pose && Math.abs(f.pose.pitch) > PITCH_MAX) {
      warns.push({ id: 'pitch', text: COPY.pitch });
      poseOk = false;
    }
    const residual = f.roll - i.state.rotDeg;
    if (Math.abs(residual) > ROLL_MAX) {
      warns.push({ id: 'roll', text: COPY.roll(Math.abs(residual)) });
      poseOk = false;
    }
    const b = f.blend;
    const smile = ((b.mouthSmileLeft ?? 0) + (b.mouthSmileRight ?? 0)) / 2;
    if (smile > SMILE_MAX || (b.jawOpen ?? 0) > JAW_MAX) {
      warns.push({ id: 'expression', text: COPY.expression });
      poseOk = false;
    }
    const blink = ((b.eyeBlinkLeft ?? 0) + (b.eyeBlinkRight ?? 0)) / 2;
    if (blink > BLINK_MAX) {
      warns.push({ id: 'eyes', text: COPY.eyes });
      poseOk = false;
    }
    if (f.faces > 1) warns.push({ id: 'multi', text: COPY.multi });
    const head = headReading(f, i.state, i.preset);
    if (!head.inBand) {
      const text =
        head.mm !== null
          ? i.preset.headBand.kind === 'official'
            ? COPY.headOfficial(head.mm)
            : COPY.headReferenceMm(head.mm)
          : COPY.headReferencePct(head.frac * 100);
      warns.push({ id: 'head', text });
    }
    if (poseOk) oks.push({ id: 'pose', text: COPY.pose });
  } else if (i.manualReason === 'noface') {
    warns.push({ id: 'manual', text: COPY.manual });
  }
  if (i.bg && !i.bg.ok) warns.push({ id: 'background', text: COPY.background });

  oks.unshift({ id: 'size', text: COPY.size(out.w, out.h) });
  const lim = limitLabel(i.preset);
  if (lim) oks.push({ id: 'bytes', text: COPY.bytes(lim) });
  if (!blocks.some((x) => x.id === 'outside' || x.id === 'lowres')) oks.push({ id: 'inside', text: COPY.inside });
  return { blocks, warns, oks };
}
