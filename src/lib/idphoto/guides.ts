// The guide geometry of a preset (IDCAM1022 Step A): crown line, eye line, chin band, face oval, centre line and
// their labels. Pure: positions are in output pixels by default; a caller drawing at another size (the /id-photo/
// overlay canvas) passes that size so every position is computed in its own pixels, exactly as before.
import type { IdPreset } from '../../data/id-photo-presets';
import { EYE_FRAC } from './calibration';
import { CROWN_FRAC, HEAD_FRAC } from './frame';

export const LABELS = {
  crown: '정수리(머리카락 제외)',
  /** A head rule measured from the top of the hair (headBand.measure 'hair'). */
  hair: '머리 맨 위(머리카락 포함)',
  chinOfficial: '턱 끝 위치 (규격 32–36 mm)',
  chinReference: '턱 끝 위치 (참고 범위)',
  eye: '눈 높이(참고)',
} as const;

export interface Guides {
  /** Crown (or top of hair) line, y. */
  crownY: number;
  /** Eye line (참고), y. */
  eyeY: number;
  /** Target head length (crown to chin). */
  head: number;
  /** Chin band: where the chin may sit, y range. */
  bandTop: number;
  bandBottom: number;
  /** Vertical centre line, x. */
  centerX: number;
  /** Face oval from the crown to the target chin, centred. */
  oval: { cx: number; cy: number; rx: number; ry: number };
  /** Whether the band is the source's own rule (headBand.kind 'official') or the reference ratio. */
  official: boolean;
  labels: { crown: string; eye: string; chin: string };
}

/** The guides of `preset` in a `size` frame of the preset's aspect (default: the output pixels). */
export function guides(preset: IdPreset, size: { w: number; h: number } = { w: preset.outW, h: preset.outH }): Guides {
  const { w, h } = size;
  const crownY = CROWN_FRAC * h;
  const head = HEAD_FRAC * h;
  const official = preset.headBand.kind === 'official';
  return {
    crownY,
    eyeY: crownY + EYE_FRAC * head,
    head,
    bandTop: crownY + preset.headBand.minFrac * h,
    bandBottom: crownY + preset.headBand.maxFrac * h,
    centerX: w / 2,
    oval: { cx: w / 2, cy: crownY + head / 2, rx: head * 0.34, ry: head / 2 },
    official,
    labels: {
      crown: preset.headBand.measure === 'hair' ? LABELS.hair : LABELS.crown,
      eye: LABELS.eye,
      chin: official ? LABELS.chinOfficial : LABELS.chinReference,
    },
  };
}
