/**
 * THAITHINHTV Service Worker
 * Caches app shell for offline/fast loading on TV
 */

const CACHE_NAME = 'thaithinhtv-v1';
const APP_SHELL = [
  '/',
  '/index.html',
  '/player.html',
  '/css/style.css',
  '/js/api.js',
  '/js/matches.js',
  '/js/player.js',
  '/assets/logo.png',
  '/manifest.json',
];

// Install: cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL).catch((err) => {
        console.warn('[SW] Some assets failed to cache:', err);
      });
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network first for API, cache first for app shell
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // API calls: network only (always fresh data)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request));
    return;
  }

  // External CDN (HLS.js, FLV.js): network first
  if (!url.hostname.includes(self.location.hostname) && url.hostname !== '') {
    event.respondWith(
      fetch(request).catch(() => caches.match(request))
    );
    return;
  }

  // App shell: cache first, update in background
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request).then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return response;
      }).catch(() => cached);

      return cached || fetchPromise;
    })
  );
});
