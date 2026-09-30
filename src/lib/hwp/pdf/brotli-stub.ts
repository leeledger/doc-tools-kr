// Stands in for brotli/decompress.js in the build (astro.config.mjs alias; SPIKE-HWP-DIRECT §6.5): the PDF path
// reads only WOFF 1.0 slices, so @cantoo/fontkit never needs a WOFF2 (Brotli) decoder, and ~60 KB gzip stay out
// of the export chunk. Reaching this is a bug.
export default function decompress(): never {
  throw new Error('WOFF2 is not read by the HWP PDF path');
}
