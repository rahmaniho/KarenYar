/* KarenYar staging admin service worker.
 * Security: never cache authenticated PHP pages, API responses, or any HTML navigation.
 * Only same-origin static assets under this admin scope are cached.
 */
const VERSION = 'karen-admin-static-20261101';
const STATIC_CACHE = `${VERSION}-static`;
const SCOPE = new URL(self.registration.scope).pathname;
const PRECACHE = [
  './assets/admin.css?v=20261101',
  './assets/admin.js?v=20261101',
  './assets/favicon.svg',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/icon-maskable-512.png',
  './assets/apple-touch-icon.png',
  './assets/fonts/Vazirmatn-Regular.woff2',
  './assets/fonts/Vazirmatn-Medium.woff2',
  './assets/fonts/Vazirmatn-Bold.woff2',
  './offline.html',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

function isStaticAsset(url) {
  if (url.origin !== self.location.origin) return false;
  if (!url.pathname.startsWith(SCOPE)) return false;
  const rel = url.pathname.slice(SCOPE.length);
  if (rel.endsWith('.php')) return false;
  return rel.startsWith('assets/') || rel === 'manifest.json' || rel === 'offline.html';
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Navigations are always network-only. If offline, show a generic static fallback.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match(new URL('./offline.html', self.registration.scope).href)),
    );
    return;
  }

  if (!isStaticAsset(url)) return;

  event.respondWith(
    caches.open(STATIC_CACHE).then(async (cache) => {
      const cached = await cache.match(req);
      const network = fetch(req, { credentials: 'same-origin' })
        .then((res) => {
          if (res && res.ok && res.type === 'basic') cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);
      return (
        cached || (await network) || new Response('Offline', { status: 503, statusText: 'Offline' })
      );
    }),
  );
});
