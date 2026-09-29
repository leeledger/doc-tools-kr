// What one compressed photo reports to the page (brief Step 3 §2). Numbers and flags only; no file names.

export type PhotoEncoder = 'mozjpeg' | 'canvas' | 'webp' | 'stripped' | 'original';
export type PhotoPhase = 'decode' | 'search' | 'final';

export interface PhotoReport {
  inBytes: number;
  outBytes: number;
  /** Oriented size of the input (from the header when the mobile cap resized on decode). */
  inW: number;
  inH: number;
  outW: number;
  outH: number;
  format: 'jpeg' | 'webp';
  /** Final quality in the encoder's own scale: integer 0–100 for MozJPEG and WebP, 0–1 for canvas. Null when stripped. */
  q: number | null;
  encoder: PhotoEncoder;
  /** Downscaled to meet the byte target (not counting the max-long-edge setting). */
  scaled: boolean;
  flattened: boolean;
  cmykConverted: boolean;
  mobileCapped: boolean;
  mozjpegFallback: boolean;
  gpsRemoved: boolean;
  exifRemoved: boolean;
  /**
   * Nothing is offered for download: in percent and quality modes the result was not smaller; in target
   * mode the input already fitted and had nothing to remove (encoder 'original').
   */
  kept: boolean;
  /**
   * Re-encoded although no smaller output was needed (target mode: the input already fitted; quality mode:
   * no size gain), to drop EXIF/XMP/GPS or bake in the orientation. The output may be larger than the input.
   */
  resaved: boolean;
  ms: { decode: number; search: number; final: number };
}
