// One-time dev script (brief Step 5 §1, "Fallback face"): cuts "Anolim HWP Fallback" from Noto Sans CJK KR
// Regular 2.004 (SIL OFL 1.1, Adobe/Google) for the four code points none of the bundled HWP faces map:
// U+329E (circled ideograph seal), U+318D (araea), U+119E (jungseong araea), U+2027 (hyphenation point).
// Probe (harfbuzzjs cmap, 2026-09-30): Noto Serif KR / Noto Sans KR 400 lack U+119E and U+2027; Nanum Myeongjo /
// Nanum Gothic and Pretendard also lack U+329E; Noto Sans Symbols 2 has none of the four; Noto Sans CJK KR has all.
// GSUB is kept (layout closure on), so the jamo glyph variants come along.
// The source's LICENSE declares no Reserved Font Name, and no name record carries one; the family is still
// set in CSS only ("Anolim HWP Fallback"), the name table is left as is.
// Usage: node scripts/gen-hwp-fallback.mjs <path to NotoSansCJKkr-Regular.otf>
// Source: https://github.com/notofonts/noto-cjk/raw/main/Sans/OTF/Korean/NotoSansCJKkr-Regular.otf
// Output: scripts/fonts/anolim-hwp-fallback.woff2 (committed; gen-hwp-fonts.mjs copies it into public/).
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import subsetFont from 'subset-font';

export const FALLBACK_CODEPOINTS = [0x329e, 0x318d, 0x119e, 0x2027];

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = process.argv[2];
if (!src) throw new Error('usage: node scripts/gen-hwp-fallback.mjs <NotoSansCJKkr-Regular.otf>');
const font = readFileSync(src);
const sha = createHash('sha256').update(font).digest('hex');
console.log(`gen-hwp-fallback: source SHA-256 ${sha}`);
const out = await subsetFont(font, String.fromCodePoint(...FALLBACK_CODEPOINTS), { targetFormat: 'woff2' });
const file = join(root, 'scripts', 'fonts', 'anolim-hwp-fallback.woff2');
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, out);
console.log(`gen-hwp-fallback: ${file} ${(out.length / 1024).toFixed(1)} KiB`);
