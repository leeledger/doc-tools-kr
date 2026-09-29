// Error-beacon path check (Polish P.18): a same-origin absolute path only — one leading "/", never "//"
// (a protocol-relative URL would leave the origin).
export const SAME_ORIGIN_PATH = /^\/(?!\/)/;

/** The path when it is a same-origin absolute path, otherwise '' (the beacon stays off). */
export function beaconPath(value) {
  const v = typeof value === 'string' ? value.trim() : '';
  return SAME_ORIGIN_PATH.test(v) && !v.includes('\\') ? v : '';
}
