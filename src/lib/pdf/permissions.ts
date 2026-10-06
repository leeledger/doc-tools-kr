// PDF use limits as pdf.js reports them (`getPermissions()`: a Set of allowed PermissionFlag values, or null when the
// file is not encrypted). Shared by PDF JPG 변환 (T3 notice) and PDF 암호 해제·설정 (T4 round 2). Pure.

/** pdf.js PermissionFlag values for printing, changing and copying. */
export const PRINT = 0x04;
export const MODIFY = 0x08;
export const COPY = 0x10;

/** True when printing, changing or copying is not allowed. Null (no encryption) is never restricted. */
export function isRestricted(perms: Iterable<number> | null): boolean {
  if (!perms) return false;
  const allowed = new Set(perms);
  return ![PRINT, MODIFY, COPY].every((f) => allowed.has(f));
}
