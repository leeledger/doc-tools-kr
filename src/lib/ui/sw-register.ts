// Service-worker registration and the update bar (brief Polish P.11). Production builds only. There is no
// automatic skipWaiting: a new version waits until the user presses 새로고침 on the bar, and the bar never
// shows while a tool is working (tools set document.body.dataset.busy).

const idle = (fn: () => void): void => {
  if ('requestIdleCallback' in window) requestIdleCallback(fn, { timeout: 3000 });
  else setTimeout(fn, 1000);
};

function showUpdateBar(reg: ServiceWorkerRegistration): void {
  if (document.getElementById('sw-update')) return;
  const show = (): void => {
    if (document.body.dataset.busy || !reg.waiting || document.getElementById('sw-update')) return;
    const bar = document.createElement('div');
    bar.id = 'sw-update';
    bar.className = 'sw-bar';
    bar.setAttribute('role', 'status');
    const text = document.createElement('span');
    text.textContent = '새 버전이 있습니다.';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn small primary';
    btn.textContent = '새로고침';
    btn.addEventListener('click', () => {
      btn.disabled = true;
      navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
      reg.waiting?.postMessage({ type: 'SKIP_WAITING' });
    });
    bar.append(text, ' ', btn);
    document.body.append(bar);
  };
  show();
  // While busy, wait for the tool to finish.
  new MutationObserver(show).observe(document.body, { attributes: true, attributeFilter: ['data-busy'] });
}

function watch(reg: ServiceWorkerRegistration | undefined): void {
  // Some environments resolve register() without a registration (a blocked or unsupported worker).
  if (!reg) return;
  // Only an update (a controller already exists) gets the bar; the first install is silent.
  if (reg.waiting && navigator.serviceWorker.controller) showUpdateBar(reg);
  reg.addEventListener('updatefound', () => {
    const w = reg.installing;
    w?.addEventListener('statechange', () => {
      if (w.state === 'installed' && navigator.serviceWorker.controller) showUpdateBar(reg);
    });
  });
}

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const start = (): void =>
    idle(() => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(watch, () => undefined);
    });
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
}
