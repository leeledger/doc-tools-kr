// What PDF 암호 해제·설정 does with an opened file (brief TOOLS4 T4 flow and decision 13). Pure.
import { baseName, safeFileName } from '../../lib/ui/format';

export type Action = 'lock' | 'unlock';

/**
 * How the file opened in pdf.js: `user` = it asks for a password to open; `owner` = it opens without one but is
 * encrypted (its maker set use limits); `none` = not encrypted.
 */
export type FileKind = 'user' | 'owner' | 'none';

export const STOP_MESSAGES = {
  'not-encrypted': '이 파일은 열 때 비밀번호가 필요 없습니다. 암호를 풀지 않아도 됩니다.',
  'already-encrypted': '이미 암호가 걸린 파일입니다. 먼저 암호를 풀어 주세요.',
  restricted: '이 파일에는 만든 곳에서 건 사용 제한이 있어 새 비밀번호를 걸 수 없습니다.',
} as const;

/** Result notes (brief decision 14: the signature warning comes before the download). */
export const SIGNATURE_NOTE = '전자서명이 들어 있는 문서입니다. 암호를 풀거나 걸어 새로 저장하면 전자서명이 더 이상 유효하지 않습니다. 발급받은 증명서는 원본을 제출하세요.';
export const KEEP_NOTE = '이 비밀번호를 잊으면 문서딱으로도 열 수 없습니다. 비밀번호를 따로 적어 두세요.';

export type Decision =
  | { step: 'ask' }
  | { step: 'stop'; code: 'not-encrypted' | 'already-encrypted'; message: string; offerUnlock: boolean };

/**
 * unlock: only a file that needs a password to open is unlocked; anything else stops, even with owner-only limits
 * (no restriction removal). lock: only a file without any encryption is locked; a password-protected one is sent to
 * 암호 풀기 first; an owner-limited one stops (re-encrypting it would drop its limits).
 */
export function decide(action: Action, kind: FileKind): Decision {
  if (action === 'unlock') {
    return kind === 'user' ? { step: 'ask' } : { step: 'stop', code: 'not-encrypted', message: STOP_MESSAGES['not-encrypted'], offerUnlock: false };
  }
  if (kind === 'none') return { step: 'ask' };
  if (kind === 'user') return { step: 'stop', code: 'already-encrypted', message: STOP_MESSAGES['already-encrypted'], offerUnlock: true };
  return { step: 'stop', code: 'already-encrypted', message: STOP_MESSAGES.restricted, offerUnlock: false };
}

/** `{base}_암호.pdf` / `{base}_암호해제.pdf` (Korean tags like 합침 / 압축; brief decision 16). */
export const outputName = (fileName: string, action: Action): string => safeFileName(baseName(fileName), action === 'lock' ? '_암호.pdf' : '_암호해제.pdf');
