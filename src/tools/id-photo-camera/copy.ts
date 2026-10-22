// 증명사진 촬영 (IDCAM1022): the messages the scripts show (late font face; the page markup carries its own copy).
// Plain words only (docs/COPY.md): no 업로드/서버/브라우저/권한.
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
