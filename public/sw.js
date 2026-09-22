/*
 * 4MyTravels PWA service worker — hand-rolled, zero dependencies (MVP scope
 * §2.4: offline-first via service worker; no third-party JS, no Workbox).
 *
 * Strategy:
 *   - App shell + static assets (same-origin GET): cache-first, filled at
 *     install and on first fetch. Versioned by CACHE_NAME — a new deploy
 *     changes the name, activate() drops old caches, clients.claim() picks
 *     up the new worker immediately.
 *   - Frankfurter API: network-only (the app's own encrypted rate cache
 *     handles offline; a stale SW cache would be redundant and less fresh).
 *   - Never caches POST/PUT/DELETE or cross-origin non-API requests.
 *
 * The encrypted database (OPFS/IndexedDB) is NOT touched by this worker —
 * storage lives in the sqlite worker, untouched by SW cache eviction.
 */
'use strict';

const CACHE_NAME = '4mytravels-v1-2026-09-21';
const APP_SHELL = [
  '/',
  '/manifest.webmanifest',
  '/sqlite-worker.js',
  '/jswasm/sqlite3.js',
  '/jswasm/sqlite3.wasm',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Frankfurter etc.: network only

  // SPA navigations: serve the cached shell for any route (static export
  // ships .html files, but client-side routes must not 404 offline).
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('/').then((cached) => cached || fetch(req)),
    );
    return;
  }

  // Static assets: cache-first.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return res;
      });
    }),
  );
});
