/* Service worker: makes both looks work offline.
 * Bump VERSION whenever you ship changes so players pick them up.
 *
 * Strategy: serve from cache instantly, refresh the cache in the background
 * (stale-while-revalidate). The newest files are used on the next launch.
 */
const VERSION = 'v1';
const CACHE = `snake-${VERSION}`;
const FONT_CACHE = 'snake-fonts';

const PRECACHE = [
  './',
  'index.html',
  'App.css',
  'App.js',
  'engine.js',
  'pwa.js',
  'favicon.ico',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'nyoka/',
  'nyoka/index.html',
  'nyoka/nyoka.css',
  'nyoka/nyoka.js',
  'nyoka/favicon.svg',
  'nyoka/manifest.webmanifest',
  'nyoka/icons/icon-192.png',
  'nyoka/icons/icon-512.png',
  'nyoka/icons/icon-maskable-512.png',
  'nyoka/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE && k !== FONT_CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

function staleWhileRevalidate(request, cacheName, { ignoreSearch = false } = {}) {
  return caches.open(cacheName).then((cache) =>
    cache.match(request, { ignoreSearch }).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          // Opaque responses (cross-origin stylesheets) are fine to keep for fonts.
          if (response && (response.ok || response.type === 'opaque')) {
            cache.put(request, response.clone());
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Google Fonts (used by the Nyoka look): cache so it keeps its typeface offline.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(request, FONT_CACHE));
    return;
  }

  if (url.origin !== self.location.origin) return;

  // ?source=pwa on the start URL shouldn't create a second cache entry.
  event.respondWith(
    staleWhileRevalidate(request, CACHE, { ignoreSearch: true }).then(
      (response) =>
        response ||
        (request.mode === 'navigate' ? caches.match('index.html') : Response.error())
    )
  );
});
