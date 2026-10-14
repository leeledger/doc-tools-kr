// The shared site script on every page (budget ≤ 4 KB gzip): the header menu, the service worker and the share buttons.
import { initMenu } from './menu';
import { registerServiceWorker } from './sw-register';
import { initShareAll } from './share';
import utmLandUrl from './utm-land?worker&url';

initMenu();
registerServiceWorker();
// "링크 보내기 / 링크 복사" (Growth G.7) on tool results and guides: here, not in its own module, so those
// pages load one script less (Lighthouse LCP).
initShareAll();
// A marked link (utm_source) landing on the home page or a guide (REQ1014-A D5/D6), only with usage statistics on;
// tool pages report theirs from the tracker. utm-land is built as its own file (`?worker&url`: compiled with the
// build constants, imports nothing) and added as a module script that runs itself: an `import()` here would pull
// Vite's preload helper, which lives in ui-shared, into every page's initial JS (check-dist guide budget, G3).
if (__USAGE_STATS__ && /[?&]utm_source=/.test(location.search) && (location.pathname === '/' || location.pathname.startsWith('/guide/'))) {
  const s = document.createElement('script');
  s.type = 'module';
  s.src = utmLandUrl;
  document.head.append(s);
}
