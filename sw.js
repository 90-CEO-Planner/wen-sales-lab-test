// sw.js
// Bump CACHE_NAME and these ?v= numbers whenever the bundle version in
// index.html changes. Fetching is network-first, so a stale list does not break
// normal loading, but it is what an offline user gets served, and serving a
// bundle from before the card-free trial change would be worse than nothing.
const CACHE_NAME = 'ceo-planner-cache-v419';
const urlsToCache = [
  './',
  './index.html',
  './js/bundle.js?v=419',
  './css/variables.css?v=19',
  './css/styles.css?v=22',
  './css/components.css?v=111',
  './favicon.ico',
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png'
];

// Install the caching background worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
});

// Clean up old caches on activation and claim clients immediately
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('Service Worker: Clearing Old Cache', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Intercept fetch requests for lightning fast loading
self.addEventListener('fetch', event => {
  const request = event.request;

  // The HTML shell is fetched with cache: 'reload', which bypasses the browser's
  // OWN http cache and forces a trip to the network.
  //
  // This matters more than it looks. Every other file here is cache-busted with
  // ?v=NN, but index.html cannot be — it is the file that CONTAINS those version
  // numbers. A plain fetch() still consults the browser cache, so Safari was
  // serving a months-old index.html, which asked for an old bundle URL, which was
  // also cached. The result was a browser permanently pinned to an old build
  // while the server had the new one, and no amount of bumping ?v= could reach
  // it, because the file naming the new version was itself stale.
  //
  // Chrome revalidates HTML far more eagerly, which is why this only ever showed
  // up in Safari and looked like a Safari bug rather than a caching one.
  const isDocument = request.mode === 'navigate' || request.destination === 'document';

  if (isDocument) {
    event.respondWith(
      fetch(request, { cache: 'reload' })
        .catch(() => caches.match(request).then(hit => hit || caches.match('./index.html')))
    );
    return;
  }

  // Everything else is versioned in its URL, so the normal network-first path is
  // safe: a changed file has a changed URL and cannot be served stale.
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});

// Handle incoming local notification clicks
self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      // Focus the open tab if it exists
      for (let client of windowClients) {
        if (client.url.includes(self.registration.scope) && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open a new tab/window wrapper
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});

