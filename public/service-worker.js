// Flag Football Stat Tracker — service worker
// Caches the app shell so it installs and loads offline.
// Network-first for navigation/pages so updates and API calls always work.

const CACHE = 'ff-tracker-v3';
// Do NOT cache manifest.json — it must stay fresh so the install name/icon update.
const SHELL = [
  './',
  './index.html',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // Never cache API calls — always go to network
  if (url.pathname.startsWith('/api/')) {
    return; // default browser handling
  }

  // Always fetch the manifest fresh so the install name/icon stay current
  if (url.pathname.endsWith('manifest.json')) {
    e.respondWith(fetch(req).catch(() => caches.match(req)));
    return;
  }

  // For page navigations: network-first, fall back to cached shell
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // For other GET requests (assets): cache-first, then network
  if (req.method === 'GET') {
    e.respondWith(
      caches.match(req).then((cached) =>
        cached ||
        fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        }).catch(() => cached)
      )
    );
  }
});
