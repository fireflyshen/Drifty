const CACHE_NAME = 'drifty-shell-v1';
const SHELL = ['/', '/manifest.webmanifest', '/favicon.svg', '/pwa-icon-192.png', '/pwa-icon-512.png'];
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

self.addEventListener('install', event => {
  self.skipWaiting();
  if (!LOCAL_HOSTS.has(self.location.hostname)) {
    event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)));
  }
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || LOCAL_HOSTS.has(self.location.hostname)) return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put('/', response.clone()));
          return response;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
      return response;
    }))
  );
});
