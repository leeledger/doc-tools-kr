// 증명사진 촬영 (IDCAM1022): the messages the scripts show (late font face; the page markup carries its own copy).
// Plain words only (docs/COPY.md): no 업로드/서버/브라우저/권한.
import type { Hint } from '../../lib/idphoto/live';

export const COPY = {
  starting: '카메라를 켜는 중이에요',
  live: '안내선에 정수리와 턱을 맞추고 「찍기」를 누르세요.',
  countdown: (n: number) => `${n}초 뒤에 찍어요`,
  captured: '찍었어요. 사진을 보고 「이 사진으로 규격 맞추기」를 누르세요.',
  black: '카메라 화면이 아직 나오지 않아요. 잠시 뒤에 다시 찍어 주세요.',
  stopped: '카메라가 꺼졌어요. 다시 찍으려면 「카메라 켜기」를 누르세요.',
  lowres: (w: number, h: number) =>
    `찍은 사진이 ${w}×${h}픽셀보다 작아 이 규격에 맞출 수 없어요. 뒤쪽 카메라로 바꾸거나 「휴대폰 카메라로 찍기」로 찍어 주세요.`,
  sending: '규격 맞추기 화면으로 넘기는 중이에요',
  sendFailed: '사진을 넘기지 못했어요. 「사진 저장」으로 저장한 뒤 여권·증명사진 규격 맞추기에서 골라 주세요.',
  fallbackFailed: '사진을 넘기지 못했어요. 여권·증명사진 규격 맞추기에서 그 사진을 골라 주세요.',
  engine: '카메라 기능을 불러오지 못했어요. 아래 「휴대폰 카메라로 찍기」를 눌러 주세요.',
} as const;

/** Live hints (D6, Step C): advice under the camera view, one at a time; 찍기 always works. Core-font glyphs only. */
export const HINTS = {
  background: '뒤 배경이 흰색으로 고르지 않아요. 뒤가 흰색인 곳에 서 주세요.',
  dark: '얼굴이 너무 어두워요. 밝은 곳에서 찍거나 불을 켜 주세요.',
  backlight: '뒤쪽이 너무 밝아요. 창문을 등지지 마세요.',
  level: '휴대폰이 기울어져 있어요. 똑바로 세워 주세요.',
} as const satisfies Record<Hint, string>;
