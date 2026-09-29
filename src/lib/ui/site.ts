// The shared site script on every page (budget ≤ 4 KB gzip): the header menu and the service worker.
import { initMenu } from './menu';
import { registerServiceWorker } from './sw-register';

initMenu();
registerServiceWorker();
