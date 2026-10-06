// qpdf arguments and error mapping for PDF 암호 해제·설정 (brief TOOLS4 T4, decision 15). Pure.
// Lock = AES-256 with an open (user) password the person typed and a random owner password nobody keeps, every
// permission allowed: we add an open password only. Unlock = qpdf --decrypt with the password the person typed; there
// is no guessing and no path that removes owner restrictions. The password is only ever an argument to qpdf; qpdf's
// log lines are mapped to a code here and never leave this module (they can echo the password).
import type { QpdfResult } from './qpdf/qpdf-run';

/** Hex characters of the random owner password (16 random bytes). */
export const OWNER_HEX_LENGTH = 32;

/** 32 random hex characters from crypto.getRandomValues (worker and page both have it). */
export function randomOwnerPassword(fill: (a: Uint8Array<ArrayBuffer>) => Uint8Array = (a) => crypto.getRandomValues(a)): string {
  const bytes = fill(new Uint8Array(OWNER_HEX_LENGTH / 2));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** qpdf: AES-256 encryption with named options, so a password that starts with "-" is still just a value. */
export function lockArgs(userPassword: string, ownerPassword: string): string[] {
  return ['--encrypt', `--user-password=${userPassword}`, `--owner-password=${ownerPassword}`, '--bits=256', '--', 'in.pdf', 'out.pdf'];
}

/** qpdf: remove the encryption, opening the file with the typed password. */
export function unlockArgs(password: string): string[] {
  return ['--decrypt', `--password=${password}`, 'in.pdf', 'out.pdf'];
}

/** qpdf exit code 0 (ok) or 3 (ok with warnings), with an output file. */
export const qpdfDone = (r: QpdfResult): r is QpdfResult & { out: Uint8Array } => r.out !== null && r.out.length > 0 && (r.code === 0 || r.code === 3);

export type PasswordFailure = 'wrong-password' | 'password' | 'corrupt';

/** Maps a failed qpdf run to a code (style of compress/engine.ts qpdfFailure). The log text never leaves here. */
export function passwordFailure(r: QpdfResult, passwordGiven: boolean): PasswordFailure {
  if (r.logs.some((l) => /invalid password/i.test(l))) return passwordGiven ? 'wrong-password' : 'password';
  return 'corrupt';
}
