/* Optional offline cache for HTTPS deployments. Course data files are cached on first use. */
const CACHE = 'huatuo-v1';
const CORE = ['./', './index.html', './style.css', './bootstrap.js', './config.js', './i18n.js', './icons.js', './voice.js', './personalization.js', './locale.js', './account.js', './membership.js', './tutor.js', './intern-tcm.js', './intern-western.js', './tcm-library.js', './nobel-explorer.js', './course-player.js', './app.js', './data/catalog.js', './data/departments.js', './assets/icon.svg'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.pathname.includes('/api/')) return;
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(res => { if (res.ok && url.origin === location.origin) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return res; })));
});
