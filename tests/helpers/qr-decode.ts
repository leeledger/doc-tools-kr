// Decodes RGBA pixels with jsQR (devDependency, never shipped) and returns the raw bytes as UTF-8 text, so a test
// compares the exact payload (a non-UTF-8 encoding would garble Hangul here). null when no QR is found.
import jsQR from 'jsqr';

export function decodeQrText(data: Uint8ClampedArray, width: number, height: number): string | null {
  const found = jsQR(data, width, height, { inversionAttempts: 'dontInvert' });
  return found ? new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(found.binaryData)) : null;
}
