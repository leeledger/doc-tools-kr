// QR colors and the center logo (QR1031). Pure: no DOM.
// Colors (D2, D3): only #rrggbb enters an SVG or an attribute; anything else is the default. A pair is blocked when the
// QR color is not darker than the background (light-on-dark is not read by every phone: a product rule) or when the
// W3C WCAG contrast ratio is below 3:1 (WCAG 2.2 SC 1.4.11 Non-text Contrast, the minimum for graphical objects; the
// ratio is never rounded: 2.999:1 fails). Relative luminance and contrast ratio as WCAG 2.2 defines them
// (handoff/sources/qr1031/w3c-wcag22-contrast.txt, fetched 2026-10-31).
// 3:1 alone fails jsQR (D3 → BUILD-LOG QR1031): a gray at 3.03:1 on white is read at 2 px per module and lost from 4 px
// up. jsQR (a ZXing port; ZXing's HybridBinarizer does the same) gives an even 8×8 block the threshold "half its
// lightest value", so a QR color whose 8-bit luma (BT.709 weights on the sRGB values, what it compares) is over half
// the background's turns white inside big modules: measured cliff 0.496-0.499 over 3,000 random pairs. A ratio-only
// rule would need about 4.9:1 (gray on magenta) and block red on white (4.0:1, luma share 0.21, reads fine), so the
// raise is a second rule: the QR color's luma at most SCAN_LUMA_SHARE of the background's, 0.45 leaving room for
// print and camera.
// Logo (D6): level H from version LOGO_MIN_VERSION (the plate itself: logo-render.ts, in the lazy logo chunk).

/** WCAG 2.2 SC 1.4.11: graphical objects need at least 3:1 against adjacent colors. */
export const MIN_CONTRAST = 3;
/** The QR color's 8-bit luma may be at most this share of the background's (jsQR/ZXing threshold 0.5, minus room). */
export const SCAN_LUMA_SHARE = 0.45;
export const DEFAULT_FG = '#000000';
export const DEFAULT_BG = '#ffffff';
/** With a logo the QR starts at this version (37 modules: a 7-module plate). */
export const LOGO_MIN_VERSION = 5;

export type ColorCheck = 'ok' | 'low' | 'inverted';

const HEX = /^#[0-9a-f]{6}$/i;

/** `value` as lowercase #rrggbb, or `fallback` when it is not exactly that form. */
export const parseHex = (value: string | null | undefined, fallback: string): string => (value && HEX.test(value) ? value.toLowerCase() : fallback);

const channel = (v: number): number => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

/** The 8-bit R, G and B of a #rrggbb color (anything else: the default QR color). */
export function rgb(hex: string): [number, number, number] {
  const n = parseInt(parseHex(hex, DEFAULT_FG).slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** 0.2126 R + 0.7152 G + 0.0722 B of the channels mapped by `f` (the BT.709 weights WCAG uses). */
const weigh = (hex: string, f: (v: number) => number): number => {
  const [r, g, b] = rgb(hex);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

/** WCAG relative luminance of a #rrggbb color (0 black … 1 white). */
export const luminance = (hex: string): number => weigh(hex, channel);

/** WCAG contrast ratio (L1 + 0.05) / (L2 + 0.05), L1 the lighter. 1 … 21. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** 8-bit luma with BT.709 weights on the gamma-encoded sRGB values (what jsQR's binarizer compares). */
export const scanLuma = (hex: string): number => weigh(hex, (v) => v);

/**
 * `inverted` when the QR color is not darker than the background; `low` under MIN_CONTRAST or when its luma is over
 * SCAN_LUMA_SHARE of the background's; else `ok`.
 */
export function checkColors(fg: string, bg: string): ColorCheck {
  if (luminance(fg) >= luminance(bg)) return 'inverted';
  return contrastRatio(fg, bg) < MIN_CONTRAST || scanLuma(fg) > SCAN_LUMA_SHARE * scanLuma(bg) ? 'low' : 'ok';
}
