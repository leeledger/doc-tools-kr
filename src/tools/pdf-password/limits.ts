// Device limits and the lock password rule for PDF 암호 해제·설정 (brief TOOLS4 T4). The FAQ reads these numbers.
// qpdf holds about three copies of the file while it works, so phones get a lower cap.
import { MB, type Device } from '../../lib/ui/device';

export const LIMITS: Record<Device, { maxFileBytes: number }> = {
  desktop: { maxFileBytes: 200 * MB },
  mobile: { maxFileBytes: 50 * MB },
};

/** Lock password length in characters (code points), any Unicode (Unverified c: a Korean password round-trips). */
export const PASSWORD_MIN = 4;
export const PASSWORD_MAX = 64;

const n = (x: number): string => x.toLocaleString('ko-KR');

/** Why a file of `size` bytes cannot be opened on `device`, or null. */
export function fileLimitMessage(size: number, device: Device): string | null {
  const max = LIMITS[device].maxFileBytes;
  if (size <= max) return null;
  const where = device === 'mobile' ? '휴대폰' : '이 기기';
  return `${where}에서는 ${n(max / MB)} MB까지의 PDF만 처리할 수 있습니다. 더 작은 파일을 고르거나 PC에서 이용해 주세요.`;
}

export const PASSWORD_MESSAGES = {
  empty: '비밀번호를 입력해 주세요.',
  length: `비밀번호는 ${PASSWORD_MIN}자 이상 ${PASSWORD_MAX}자 이하로 입력해 주세요.`,
  mismatch: '두 비밀번호가 같지 않습니다. 같은 비밀번호를 한 번 더 입력해 주세요.',
} as const;

/** The problem with a new lock password typed twice, or null when it can be used. */
export function lockPasswordError(password: string, again: string): keyof typeof PASSWORD_MESSAGES | null {
  if (!password) return 'empty';
  const length = [...password].length;
  if (length < PASSWORD_MIN || length > PASSWORD_MAX) return 'length';
  if (password !== again) return 'mismatch';
  return null;
}
