// 본 제품은 한컴의 HWP 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.
// The post-processing and viewer chunk (brief Step 5 §4 budget: ≤ 25 KB gzip), imported by the controller once
// the engine is on its way. Nothing here loads before a file is picked.
export { createViewer, type Viewer } from './viewer';
