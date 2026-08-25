/* ===== Paper Plane Service Worker ===== */
const CACHE_VERSION = 'paperplane-v11';

const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',

  // Game graphics
  './blueplane.png',
  './yellowplane.png',

  // Local game sounds
  './sound/countdown.mp3',
  './sound/go.mp3',
  './sound/warning.mp3',
  './sound/move.mp3',
  './sound/correct.mp3',
  './sound/wrong.mp3',

  // App icons
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-192.png',
  './icons/maskable-512.png',
  './icons/apple-touch-180.png',
  './icons/apple-touch-167.png',
  './icons/apple-touch-152.png',
  './icons/apple-touch-120.png',
  './icons/favicon.ico'
];

/* Install: cache local core files. */
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);

    // Cache assets individually so one unexpected failure does not abort
    // the whole service-worker installation.
    await Promise.allSettled(
      CORE_ASSETS.map(async (asset) => {
        try {
          await cache.add(asset);
        } catch (err) {
          console.warn('Could not precache:', asset, err);
        }
      })
    );

    await self.skipWaiting();
  })());
});

/* Activate: remove older Paper Plane caches. */
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith('paperplane-') && key !== CACHE_VERSION)
        .map((key) => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

/* Fetch strategy. */
self.addEventListener('fetch', (event) => {
  const req = event.request;

  if (req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch (_) {
    return;
  }

  // Ignore chrome-extension://, edge-extension://, data:, blob:, etc.
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  const acceptsHtml = (req.headers.get('accept') || '').includes('text/html');

  // HTML/navigation should prefer the newest network version.
  if (req.mode === 'navigate' || acceptsHtml) {
    event.respondWith(networkFirst(req));
    return;
  }

  // Local/static assets prefer cache for fast/offline loading.
  const isStatic = /\.(png|jpg|jpeg|gif|webp|svg|ico|mp3|wav|ogg|m4a|css|js|json|webmanifest|woff|woff2|ttf|otf)$/i.test(url.pathname);

  if (isStatic) {
    event.respondWith(cacheFirst(req));
    return;
  }

  event.respondWith(networkFirst(req));
});

async function networkFirst(req) {
  try {
    const fresh = await fetch(req);

    // Cache only successful normal responses.
    if (fresh && fresh.ok) {
      try {
        const cache = await caches.open(CACHE_VERSION);
        await cache.put(req, fresh.clone());
      } catch (err) {
        console.warn('Could not cache network response:', req.url, err);
      }
    }

    return fresh;
  } catch (_) {
    const cached = await caches.match(req);
    if (cached) return cached;

    const acceptsHtml = (req.headers.get('accept') || '').includes('text/html');
    if (req.mode === 'navigate' || acceptsHtml) {
      const fallback = await caches.match('./index.html');
      if (fallback) return fallback;
    }

    return new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;

  try {
    const fresh = await fetch(req);

    if (fresh && fresh.ok) {
      try {
        const cache = await caches.open(CACHE_VERSION);
        await cache.put(req, fresh.clone());
      } catch (err) {
        console.warn('Could not cache static asset:', req.url, err);
      }
    }

    return fresh;
  } catch (_) {
    return new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

/* Allow the page's update button to activate a waiting SW immediately. */
self.addEventListener('message', (event) => {
  if (event.data && event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
});
