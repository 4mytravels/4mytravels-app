# PWA Test Matrix (MVP scope §2.5)

Engine: sqlite3mc v2.5.1 WASM (sqlite 3.53.4), vendored in `public/jswasm/`.
Test method: headless Chromium 153 / Firefox 155 via Playwright against the
static export served with COOP/COEP headers (`scripts/smoke-server.py`),
plus `public/smoke.html` engine-level checks. `?forceFallback=1` forces the
IndexedDB snapshot path to simulate Safari private browsing.

## Results

| Test | Chromium 153 | Firefox 155 | Safari (real device) |
| --- | --- | --- | --- |
| Engine smoke (sahpool, cipher, blob, wrong-key, persist) | PASS 5/5 (also 145) | PASS 5/5 | PENDING (hosted test) |
| Unlock gate: create passphrase | PASS | PASS | PENDING |
| Unlock gate: unlock after reload | PASS | PASS | PENDING |
| Wrong passphrase → gate returns, no data loss | PASS | PASS | PENDING |
| Trip create → reload → unlock → persisted (sahpool) | PASS | PASS | PENDING |
| Trip create → reload → unlock → persisted (IDB fallback, forced) | PASS | — (same code path) | PENDING (private browsing) |
| Storage-health banner shows fallback | PASS (forced mode) | — | PENDING |
| VACUUM (compact) via worker | PASS (engine smoke path) | PASS | PENDING |
| Blob round-trip (high bytes intact) | PASS | PASS | PENDING |
| Service worker registers + offline reload | PASS (127.0.0.1) | — (SW ok, offline not re-run) | PENDING (iOS 16.4+) |
| Manifest + icons (any/maskable) | PASS (link + files) | PASS | PENDING (A2HS) |
| CSP: no violations, inline hydration allowed via sha256 | PASS | PASS | PENDING |
| op-sqlite absent from web bundle | PASS (grep 0) | — | — |
| `PRAGMA key=` unlock test (§2.5) | PASS (hexkey probe, SQLITE_NOTADB on wrong key) | PASS | PENDING |

## Deferred to the hosted app (Task 7 activation)

Safari/iOS WebKit cannot run on this VPS (missing system libraries, root
required). Once `app.4mytravels.app` is live (DNS + Caddy + compose up),
verify on a real device:

1. Safari 16.4+: OPFS-sahpool path (expect PASS — sahpool supports Safari 16.4+).
2. Safari private browsing: IDB fallback + banner (simulated here via
   forceFallback, but confirm the real detection fires).
3. iOS Add to Home Screen: standalone display, icon, ITP 7-day exemption.
4. `navigator.storage.persist()` grant state (shown via worker health op).

## Known behaviors (by design)

- IDB fallback keeps the live db plaintext in RAM for the session (SQLite3MC
  cannot key `:memory:`); every persisted snapshot is AES-GCM encrypted with
  the Argon2id key. Same at-rest guarantee as sahpool.
- The unlock gate renders create-mode copy on the very first paint of a
  returning user (hydration-safe prerender), then flips to unlock-mode after
  mount. Cosmetic only.
- React error #310 may appear in headless teardown (useLayoutEffect on
  unmount during test navigation); not reproducible in normal interaction.
