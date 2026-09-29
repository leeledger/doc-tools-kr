export const MB = 1024 * 1024;

export type Device = 'desktop' | 'mobile';

/** Mobile = coarse pointer and a screen narrower than 1024 px. */
export function detectDevice(): Device {
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const narrow = typeof screen !== 'undefined' && screen.width < 1024;
  return coarse && narrow ? 'mobile' : 'desktop';
}
