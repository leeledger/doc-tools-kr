// HWP e2e files generated at test time (brief Step 5 "Generated at test time, not committed").
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DISTRIBUTION_BIT, PASSWORD_BIT, docxLikeZip, hwpFixture, padHwp, padHwpxBinData, patchHwpFlags } from '../helpers/hwp';
import { RUNTIME_DIR } from './paths';

export const HWP_RUNTIME_DIR = join(RUNTIME_DIR, 'hwp');
export const hwpRuntime = (name: string): string => join(HWP_RUNTIME_DIR, name);

export function makeHwpRuntimeFixtures(dir: string = HWP_RUNTIME_DIR): void {
  mkdirSync(dir, { recursive: true });
  const law05 = hwpFixture('law05.hwp');
  const files: Record<string, () => Uint8Array> = {
    'law05-password.hwp': () => patchHwpFlags(law05, PASSWORD_BIT),
    'law05-distribution.hwp': () => patchHwpFlags(law05, DISTRIBUTION_BIT),
    'law05-truncated.hwp': () => law05.slice(0, law05.length >> 1),
    'word-renamed.hwpx': () => docxLikeZip(),
    // Over the 10 MB mobile cap, under the 25 MB hard limit; the extra stream is not BinData.
    'law05-padded.hwp': () => padHwp(law05, 10_500_000),
    // 9 MB of stored BinData: over the 8 MB mobile image cap (file 9.1 MB, under the 10 MB byte cap).
    'adm14-images.hwpx': () => padHwpxBinData(hwpFixture('adm14.hwpx'), 9_000_000),
    // Over the 25 MB mobile hard limit: rejected before any read beyond the size.
    'big-26mb.hwp': () => new Uint8Array(26_000_000),
  };
  for (const [name, make] of Object.entries(files)) {
    const p = join(dir, name);
    if (!existsSync(p)) writeFileSync(p, make());
  }
  writeFileSync(join(dir, 'notes.txt'), '회의 메모: 한글 문서가 아닙니다.\n');
}
