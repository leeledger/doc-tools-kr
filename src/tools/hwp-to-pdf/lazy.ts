// The post-processing and viewer chunk (brief Step 5 §4 budget: ≤ 25 KB gzip), imported by the controller once
// the engine is on its way. Nothing here loads before a file is picked.
export { createViewer, type Viewer } from './viewer';
