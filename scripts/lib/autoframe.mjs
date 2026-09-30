// Face auto-framing kill switch (brief Step 4, "Licenses"): PUBLIC_ID_PHOTO_AUTOFRAME. With "0" the
// landmarker import is dead code, copy-vendor skips MediaPipe and /licenses/ drops its entries, so dist/
// holds no MediaPipe byte and /id-photo/ runs manual-only.
//
// DEFAULT is "0" while the Step 4 license Flag is open (BUILD-LOG "Step 4 build notes", 0.2: the pinned
// Eigen builds do not define EIGEN_MPL2_ONLY, and fft2d's notice is outside the §0 allowlist). Arch lifts
// it by setting DEFAULT to "1" here, or PUBLIC_ID_PHOTO_AUTOFRAME=1 in the Cloudflare build environment.
export const DEFAULT = '0';

/** True only for "1" (after trimming); an unset value takes DEFAULT. */
export function autoframeOn(value) {
  const v = typeof value === 'string' && value.trim() !== '' ? value.trim() : DEFAULT;
  return v === '1';
}
