// Crown estimate constants (brief Step 4 "Calibration note"). The skull top under hair is not visible, so
//   crown = eye − (K · (chin − eye) + C · IPD₃D) / 2
// averages a chin-based and an IPD-based estimate (spike SPIKE-PHOTO.md §3.2, "avg, LOO-fitted").
// Provisional: fitted leave-one-out on 6 smiling heads (spike). Changed only by the calibration task, and
// only when the refit on neutral closed-mouth heads is not worse (BUILD-LOG Step 4, Calibration).
export const K = 0.88;
export const C = 1.68;
export const CALIBRATION = { dataset: 'spikes/photo results/gt-manual.json (p02, p06, p07, p08, p10, p11)', n: 6, date: '2026-09-29' } as const;

/** Where the eye line sits below the crown, as a fraction of the head (crown→chin), from the chin-based estimate: the guide's 눈 높이(참고), 0.468. */
export const EYE_FRAC = K / (1 + K);
