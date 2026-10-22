// 증명사진 촬영 (IDCAM1022 D7): why the camera did not start, as a usage code and a plain message. Every message ends at
// the native camera fallback (「휴대폰 카메라로 찍기」) or a retry; none names the app, the browser or a setting screen.
// Pure: the error is whatever getUserMedia rejected with (a DOMException by name), or `null` when there is no API.

export type CameraFailCode = 'denied' | 'notfound' | 'busy' | 'nosupport' | 'other';

export const CAMERA_ERRORS: Readonly<Record<CameraFailCode, string>> = {
  denied:
    '카메라를 쓸 수 없어요. 카메라 사용을 허용하지 않았거나 휴대폰 설정에서 막혀 있어요. 설정에서 카메라를 허용하거나, 아래 「휴대폰 카메라로 찍기」를 눌러 주세요.',
  notfound: '이 기기에서 카메라를 찾지 못했어요. 아래 「휴대폰 카메라로 찍기」를 눌러 주세요.',
  busy: '다른 앱이 카메라를 쓰고 있어요. 그 앱을 닫고 다시 눌러 주세요.',
  nosupport: '여기서는 화면 안 촬영을 쓸 수 없어요. Chrome, Safari, 삼성 인터넷에서 열거나 아래 「휴대폰 카메라로 찍기」를 눌러 주세요.',
  other: '카메라를 켜지 못했어요. 다시 눌러 보거나 아래 「휴대폰 카메라로 찍기」를 눌러 주세요.',
};

const BY_NAME: Readonly<Record<string, CameraFailCode>> = {
  NotAllowedError: 'denied',
  PermissionDeniedError: 'denied',
  SecurityError: 'denied',
  NotFoundError: 'notfound',
  DevicesNotFoundError: 'notfound',
  OverconstrainedError: 'notfound',
  NotReadableError: 'busy',
  TrackStartError: 'busy',
};

/** The usage code of a getUserMedia rejection; `null` = the page has no getUserMedia at all. */
export function cameraFailCode(err: unknown): CameraFailCode {
  if (err === null) return 'nosupport';
  const name = (err as { name?: unknown } | undefined)?.name;
  return (typeof name === 'string' && BY_NAME[name]) || 'other';
}

/** The message shown for `err` (see cameraFailCode). */
export function cameraErrorMessage(err: unknown): string {
  return CAMERA_ERRORS[cameraFailCode(err)];
}
