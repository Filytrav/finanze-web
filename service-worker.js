'use strict';

const CACHE = 'finanze-web-1.4.2';
const FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './web-api.js?v=1.4.2',
  './webapp.js?v=1.4.2',
  './logic.js?v=1.4.2',
  './app.js?v=1.4.2',
  './style.css?v=1.4.2',
  './fonts.css?v=1.4.2',
  './icon.png',
  './icon-192.png',
  './icon-512.png',
  './font-inter-latin-400-normal.woff2',
  './font-inter-latin-500-normal.woff2',
  './font-inter-latin-600-normal.woff2',
  './font-jetbrains-mono-latin-400-normal.woff2',
  './font-space-grotesk-latin-500-normal.woff2',
  './font-space-grotesk-latin-700-normal.woff2',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('finanze-web-') && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy));
      }
      return response;
    }).catch(async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      if (request.mode === 'navigate') return caches.match('./index.html');
      return Response.error();
    }),
  );
});
