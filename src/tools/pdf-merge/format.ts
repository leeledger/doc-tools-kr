import { baseName, safeFileName } from '../../lib/ui/format';

/** `{first base name}_외{n-1}건_합침.pdf`, sanitized for every OS and at most 80 characters. */
export function mergedFileName(firstName: string, count: number): string {
  return safeFileName(baseName(firstName), `_외${Math.max(count - 1, 0)}건_합침.pdf`);
}
