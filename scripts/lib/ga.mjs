// Google Analytics 4 (owner 2026-10-08): page_view only, behind PUBLIC_GA_ID (the "G-" measurement ID of the web data
// stream). Unset: no tag, no dist/ga.js, no CSP change, policy unchanged. The ID is baked into a self-hosted /ga.js
// (postbuild gen-ga), so the CSP needs no inline script; that file loads gtag.js only after the page has loaded.
// Google signals and ad personalization are off here and in the property (docs/COPY.md, owner steps).

export const GA_ID_RE = /^G-[A-Z0-9]{6,12}$/;
/** The same-origin loader every page loads (Base.astro), generated at postbuild. */
export const GA_LOADER = '/ga.js';
export const GTAG_ORIGIN = 'https://www.googletagmanager.com';

// CSP hosts: Google's tag-platform CSP guide, "Google Analytics 4 without Ads features"
// (https://developers.google.com/tag-platform/security/guides/csp, fetched 2026-10-08), plus the regional collect host.
// No doubleclick, googlesyndication or frame-src: the Ads features stay off.
export const GA_SCRIPT_SRC = GTAG_ORIGIN;
export const GA_IMG_SRC = `${GTAG_ORIGIN} https://*.google-analytics.com`;
export const GA_CONNECT_SRC = `${GTAG_ORIGIN} https://*.google-analytics.com https://*.analytics.google.com https://*.google.com`;

/** 395 days (about 13 months): the cookie lifetime the privacy policy names. */
export const GA_COOKIE_EXPIRES = 34128000;

/** The trimmed ID, '' when unset; throws on a value that is not a GA4 measurement ID (check-dist reports it). */
export function gaId(value) {
  const t = typeof value === 'string' ? value.trim() : '';
  if (t && !GA_ID_RE.test(t)) throw new Error(`PUBLIC_GA_ID "${t}" is not a Google Analytics 4 measurement ID (G- and 6-12 capital letters or digits)`);
  return t;
}

/** dist/_headers with Google Analytics allowed in the site-wide CSP (script-src, connect-src and img-src only). */
export function withGaCsp(headers) {
  let n = 0;
  let missing = false;
  const extend = (line, directive, hosts) => {
    const from = `${directive} 'self'`;
    if (!line.includes(from)) missing = true;
    return line.replace(from, `${from} ${hosts}`);
  };
  const out = headers.replace(/^(\s*Content-Security-Policy:.*)$/m, (line) => {
    n++;
    return extend(extend(extend(line, 'script-src', GA_SCRIPT_SRC), 'connect-src', GA_CONNECT_SRC), 'img-src', GA_IMG_SRC);
  });
  if (n !== 1 || missing || out === headers) throw new Error('gen-headers: no site-wide Content-Security-Policy with script-src, connect-src and img-src to extend');
  return out;
}

/**
 * The text of /ga.js for `id` (ES5, no eval). Order matters: the URL is read first, before the page's module scripts
 * run (quicklinks drops utm_* with replaceState); gtag pushes `arguments` (gtag.js ignores plain arrays); gtag.js
 * itself loads after the load event, when the browser is idle (at most 2 s later), so the page's own loading is
 * untouched. A blocked or failed load stays silent. gtag is never put on window.
 */
export function loaderSource(id) {
  if (!GA_ID_RE.test(id)) throw new Error(`loaderSource: "${id}" is not a GA4 measurement ID`);
  return (
    '(function(){' +
    "var loc=location.href.split('#')[0];" +
    'var w=window,d=document;' +
    'w.dataLayer=w.dataLayer||[];' +
    'function gtag(){w.dataLayer.push(arguments);}' +
    "gtag('js',new Date());" +
    `gtag('config','${id}',{page_location:loc,allow_google_signals:false,allow_ad_personalization_signals:false,cookie_expires:${GA_COOKIE_EXPIRES},cookie_flags:'SameSite=Lax;Secure'});` +
    "function load(){var s=d.createElement('script');s.async=true;" +
    `s.src='${GTAG_ORIGIN}/gtag/js?id=${id}';d.head.appendChild(s);}` +
    'function idle(){if(w.requestIdleCallback)w.requestIdleCallback(load,{timeout:2000});else setTimeout(load,0);}' +
    "if(d.readyState==='complete')idle();else w.addEventListener('load',idle);" +
    '})();\n'
  );
}
