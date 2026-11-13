// Offline-first shell cache (Brief P4). Network-first for HTML, cache-first for static assets.
const CACHE = 'godavari-field-v1';
const ASSETS = [
  './', './index.html', './manifest.webmanifest', './assets/icon.svg',
  './src/styles/tokens.css', './src/styles/base.css', './src/styles/components.css', './src/styles/screens.css',
  './src/js/app.js', './src/js/store.js', './src/js/data.js', './src/js/icons.js', './src/js/util.js', './src/js/ui.js', './src/js/bus.js', './src/js/overlays.js',
  './src/js/screens/tasks.js', './src/js/screens/map.js', './src/js/screens/report.js', './src/js/screens/inspection.js', './src/js/screens/profile.js',
];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET' || request.url.includes('/api/')) return;
  const url = new URL(request.url);
  if (request.mode === 'navigate') {
    e.respondWith(fetch(request).then((r) => { caches.open(CACHE).then((c) => c.put('./index.html', r.clone())); return r; }).catch(() => caches.match('./index.html')));
    return;
  }
  e.respondWith(caches.match(request).then((hit) => hit || fetch(request).then((r) => {
    if (r.ok && (url.origin === location.origin || url.host.includes('fonts.g'))) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(request, copy)); }
    return r;
  })));
});
