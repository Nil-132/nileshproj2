const CACHE_NAME = 'my-pw-v2'; // 🔁 bump version to force cache refresh
const urlsToCache = [
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
  // 🚫 NO HTML files – we want them always fresh from network
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

// 🆕 Network-first strategy for HTML, cache for assets
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // For HTML pages, always go to network (no cache)
  if (event.request.mode === 'navigate' || url.pathname.endsWith('.html')) {
    event.respondWith(fetch(event.request));
    return;
  }
  
  // For other assets, try cache first, then network
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});

// 🆕 Clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );
    })
  );
});
