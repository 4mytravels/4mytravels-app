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

// Bump this on EVERY deploy that changes the shell. The activate handler deletes
// every other cache, so a stale name means returning visitors keep serving the
// previous deploy from disk and never see the new build.
//   v10 2026-10-04 — full-bleed menu bar, PickerSheet (tappable search field),
//                    web keyboard avoidance, PWA port of the Android fixes.
//   v11 2026-10-04 — shared ExpenseRow (expenses tab == trip detail), optional
//                     daily budget, "N days" for finished trips, edit moves an
//                     expense to its new day, larger trip-photo preview.
//   v12 2026-10-04 — ExpenseRow full-bleed fix (rows were indented twice) and
//                     the row tint in trip detail to match the Expenses tab.
//   v13 2026-10-04 — ExpenseRow separator on both edges; day headers no longer
//                     draw their own rule (it would double up).
//   v14 2026-10-04 — row separator 2px -> 1px; trip-detail day header aligned
//                     with the Expenses tab (same negative margin + padding).
//   v15 2026-10-07 — full-trip budget on the trip cards (was budget-to-date),
//                     Expenses fade-out under the nav, home-screen install nudge,
//                     Settings/Exchange-rates bottom padding clears the nav.
//   v16 2026-10-07 — the under-nav content fade now covers every scrolling
//                     screen (home, trips, expenses, stats, settings, trip).
//   v17 2026-10-07 — install notice moved to the top (under the app title) with
//                     an opaque surface.
//   v18 2026-10-07 — both web notices (storage health + install nudge) at the
//                     top, opaque, with a persistent "Never show again";
//                     import-trip copy no longer names the auto trips.
//   v33 2026-10-10 — Home screen now renders the SAME shared components as the
//                     tabs: the journey card is the Trips-tab TripCard (tap ->
//                     trip detail) and "Expenses today" rows are the shared
//                     ExpenseRow (expense currency on top, home below).
//   v34 2026-10-10 — Home stats: "spent" shows whole currency units (no cents)
//                     and a new "N days" quick-fact pill counts past trips in
//                     full + active trips up to and including today (future
//                     trips excluded). Inclusive day counting.
//   v35 2026-10-10 — Home quick-fact pills made compact: tighter inner gap
//                     (icon <-> text 4px) and narrower horizontal padding,
//                     removing the dead space around the icon.
//   v36 2026-10-10 — Trip-card day bar is translucent (primary 55%, muted 45%)
//                     instead of solid, and its track lighter (0.16 -> 0.10),
//                     so the cover photo shows through on Home, Trips and the
//                     trip detail screen (all three share TripCard).
//   v37 2026-10-10 — Trip photo format is now IDENTICAL everywhere: the
//                     new/edit-trip picker crops 16:9 landscape (was 4:3) and
//                     the preview is a full-width TRIP_COVER_HEIGHT (224) stage
//                     matching the card exactly (was a 132×100 thumb). Card +
//                     form share the TRIP_COVER_HEIGHT constant.
//   v38 2026-10-10 — Trip card photo gets a subtle 6% white brightening veil
//                     (under the scrim) so the native Android JPEG — darker
//                     than the web canvas re-encode — reads as bright as the
//                     PWA. Shared in TripCard: Home, Trips and trip detail.
//   v39 2026-10-10 — Two PWA fixes. (1) Import/restore: the document picker
//                     returns a blob: URL on web, which expo-file-system's File
//                     cannot read → read it with fetch() on web instead
//                     (src/utils/readPickedDocument.ts). (2) Country/currency
//                     picker: the list was a plain View (never scrolls on web)
//                     → a real ScrollView, plus autoFocus on the search field.
//   v40 2026-10-10 — v39's import fix was WRONG and search regressed.
//                     (1) fetch(blob:) is blocked by COEP require-corp
//                     ("Failed to fetch") — so import still failed. The picker
//                     also returns the original File as asset.file; read THAT
//                     via File.text() on web (verified). Native unchanged.
//                     (2) autoFocus in the web portal broke typing — replaced
//                     with a ref + focus effect so search reliably filters.
const CACHE_NAME = '4mytravels-v40-2026-10-10';
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

  // SPA navigations: network-first (so deploys are picked up immediately),
  // cache fallback when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('/', copy));
          }
          return res;
        })
        .catch(() => caches.match('/')),
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
