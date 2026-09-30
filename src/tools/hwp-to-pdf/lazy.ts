// The post-processing, viewer and print chunk (brief Step 5 §4 budget: ≤ 25 KB gzip), imported by the
// controller once the first page is on its way. Nothing here loads before a file is picked.
export { createViewer, type Viewer } from './viewer';
export { installPageStyle, printDocument, removePageStyle } from './print';
export { detectBrowser, orderedGuides } from './guidance';
