// The shared site script on every page (budget ≤ 4 KB gzip): the header menu, the service worker and the share buttons.
import { initMenu } from './menu';
import { registerServiceWorker } from './sw-register';
import { initShareAll } from './share';

initMenu();
registerServiceWorker();
// "링크 보내기 / 링크 복사" (Growth G.7) on tool results and guides: here, not in its own module, so those
// pages load one script less (Lighthouse LCP).
initShareAll();
