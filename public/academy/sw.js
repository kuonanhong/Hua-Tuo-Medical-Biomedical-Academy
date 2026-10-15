/* Cache only the public application shell. Never persist authenticated content. */
const CACHE = 'huatuo-v2-public-shell-20261015';
const CORE = ['./', './index.html', './style.css', './bootstrap.js', './config.js', './i18n.js', './icons.js', './voice.js', './personalization.js', './locale.js', './account.js', './membership.js', './tutor.js', './intern-tcm.js', './intern-western.js', './tcm-library.js', './tcm-library-v2.js', './data/tcm-library.js', './data/tcm-v2.js', './data/content-v2.js', './nobel-explorer.js', './course-player.js', './app.js', './academy-v2.css', './voice-controls.css', './workbench.js', './workbench.css', './content-hub.js', './content-hub.css', './data/catalog.js', './data/departments.js', './assets/icon.svg'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(async cache => {
  await Promise.all(CORE.map(async url => {try {const response = await fetch(url,{cache:'reload'}); if(response.ok) await cache.put(url,response);} catch(_) { /* shell assets can retry online */ }}));
}).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('huatuo-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (/\/api(?:\/|$)|\/data\/courses(?:\/|$)|\/private(?:\/|$)/.test(url.pathname)) {
    event.respondWith(fetch(event.request,{cache:'no-store'})); return;
  }
  // Only explicitly listed shell paths may enter Cache Storage.
  const relative='./'+url.pathname.slice(new URL('./',self.location.href).pathname.length);
  if (!CORE.includes(relative) && relative !== './') return;
  event.respondWith(fetch(event.request).then(response => {
    if(response.ok) {const copy=response.clone(); caches.open(CACHE).then(cache => cache.put(event.request,copy));}
    return response;
  }).catch(() => caches.match(event.request).then(hit => hit || Response.error())));
});
