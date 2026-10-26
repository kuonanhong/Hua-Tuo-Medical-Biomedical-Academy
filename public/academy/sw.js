/* Service worker (v3.3). Shell: cache-first with background refresh. Lazy modules, language packs and
   public data chunks: stale-while-revalidate. Member content (/api, data/courses, data/procedures) is
   never persisted. */
const VERSION = '20261026';
const SHELL_CACHE = 'huatuo-shell-' + VERSION;
const LAZY_CACHE = 'huatuo-lazy-' + VERSION;
const SHELL = ['./', './index.html', './style.css', './academy-v2.css', './voice-controls.css', './bootstrap.js', './config.js', './i18n.js', './icons.js', './personalization.js', './locale.js', './account.js', './membership.js', './safe-links.js', './app.js', './data/departments.js', './data/home-summary.js', './assets/icon.svg', './manifest.webmanifest'];
const LAZY = /\/(?:i18n\/[a-zA-Z-]+\.js|data\/(?:catalog|tcm-library|tcm-v2|content-v2|acu-figure|acu-atlas|pharmacy-lab)\.(?:js|json)|(?:voice|tutor|xp|workbench|theatre|theatre3d|twins|specialty-twins|specialty-twins-2|specialty-twins-3|procedures|course-player|intern-tcm|intern-western|tcm-library|tcm-library-v2|content-hub|acu-atlas|pharmacy-lab|nobel-explorer)\.js|(?:workbench|theatre|twins|specialty-twins|specialty-twins-2|specialty-twins-3|procedures|content-hub|acu-atlas|pharmacy-lab)\.css|vendor\/three\.js|assets\/scenes\/.+|data\/twins\/.+|data\/preview\/[a-z0-9-]+\.js|help\.html|terms\.html)$/;
const NEVER = /\/api(?:\/|$)|\/data\/courses(?:\/|$)|\/data\/procedures(?:\/|$)|\/private(?:\/|$)/;

self.addEventListener('install', event => event.waitUntil(caches.open(SHELL_CACHE).then(async cache => {
  await Promise.all(SHELL.map(async url => { try { const response = await fetch(url, { cache: 'reload' }); if (response.ok) await cache.put(url, response); } catch (_) { /* retry online */ } }));
}).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('huatuo-') && key !== SHELL_CACHE && key !== LAZY_CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('message', event => { if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (NEVER.test(url.pathname)) { event.respondWith(fetch(event.request, { cache: 'no-store' })); return; }
  const base = new URL('./', self.location.href).pathname;
  const relative = './' + url.pathname.slice(base.length);
  if (SHELL.includes(relative) || relative === './') {
    event.respondWith(caches.open(SHELL_CACHE).then(async cache => {
      const hit = await cache.match(event.request);
      const refresh = fetch(event.request).then(response => { if (response.ok) cache.put(event.request, response.clone()); return response; }).catch(() => null);
      return hit || (await refresh) || Response.error();
    }));
    return;
  }
  if (LAZY.test(url.pathname)) {
    event.respondWith(caches.open(LAZY_CACHE).then(async cache => {
      const hit = await cache.match(event.request);
      const refresh = fetch(event.request).then(response => { if (response.ok) cache.put(event.request, response.clone()); return response; }).catch(() => null);
      if (hit) { event.waitUntil(refresh); return hit; }
      return (await refresh) || Response.error();
    }));
  }
});
