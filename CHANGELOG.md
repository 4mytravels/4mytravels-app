# Changelog

All notable changes to 4MyTravels will be documented in this file.

## [1.1.0] - 2026-10-10

The headline feature of this release is the **encrypted PWA**: 4MyTravels now
runs as a real, installable web app with the same on-device encrypted database
as the Android build — no account, no cloud, passphrase-protected. Alongside it
are a large set of UI polish and consistency fixes (full-bleed trip cards, a
shared expense row, shared trip statistics) and a long tail of device-tested
bug fixes.

### Added
- **Encrypted PWA (web app)** — the whole app now runs in the browser as an
  installable Progressive Web App with a genuinely encrypted database:
  - sqlite3mc 2.5.1 WASM (SQLCipher-compatible AES-256 + HMAC) in a dedicated
    Web Worker, persisted through OPFS (`multipleciphers-opfs-sahpool` VFS).
  - Automatic fallback to an **AES-GCM-encrypted IndexedDB snapshot** when OPFS
    is unavailable (Safari private browsing, older browsers). At rest,
    IndexedDB only ever holds ciphertext.
  - **Passphrase unlock** (web only): first visit creates a passphrase
    (Argon2id-derived key, 64 MiB / t=3 / p=1, per-database random salt);
    later visits unlock. A wrong passphrase returns to the gate without data
    loss. Native keeps the Keystore device key — no gate on Android.
  - PWA manifest (any + maskable icons), a hand-rolled service worker (zero
    dependencies, no Workbox) that precaches the app shell + WASM engine,
    supports offline reload and SPA fallback.
  - Strict Content-Security-Policy with a sha256 hash for Expo Router's
    hydration bootstrap (never `unsafe-inline`); COOP/COEP headers (required
    for OPFS) served by the nginx config.
  - `navigator.storage.persist()` requested after unlock to reduce eviction
    risk.
- **Storage-health banner** surfacing the active storage mode (OPFS / IndexedDB
  fallback / volatile) with a dismiss action (`StorageHealthBanner`).
- **PWA install nudge** (`PwaInstallBanner`) shown on browser visits until the
  app runs installed: a one-tap Install button when Chrome offers
  `beforeinstallprompt`, the Share ▸ Add to Home Screen path on iOS, and the
  browser-menu path otherwise. The CTA always renders (falls back to "How to
  install"), and there is a persistent "Never show again" alongside the
  session-only ✕.
- **Web notices** (`WebNotices`) render storage-health and install prompts in
  the layout flow under each screen's header on opaque surfaces; dismiss state
  is shared across tabs.
- **Trip statistics filter on the Statistics tab** — the same trip-selector
  button as the Expenses tab but multi-select (one, several, or all trips).
  Every chart and the CSV export respect the selection.
- **Shared `TripCard`** — the Trips tab and the trip-detail screen now render
  the exact same full-bleed photo card (`src/components/TripCard.tsx`), so the
  two can never drift apart. Owner of the day-bar and verdict logic.
- **Shared `ExpenseRow`** (`src/components/ExpenseRow.tsx`) — one expense row
  used by the Expenses tab, trip detail and the Home "Expenses today" list.
- **Shared `computeTripStats`** (`src/utils/tripStats.ts`) — the single source
  of truth for daily average, total/budget, over-budget status and "Day X of Y"
  across the Trips tab, trip detail and Expenses tab.
- **Shared `PickerSheet`** with a sibling backdrop/sheet structure (see Fixed)
  and `confirmDestructive` for web-safe confirmations.
- New regression test suites: `npm run test:days`, `test:cover`, `test:csv`
  (`npm test` runs all three).
- New script `npm run icon:mono` to regenerate the Android monochrome
  (themed-icon) layer.

### Fixed
- **`Alert.alert` is a no-op in react-native-web** — every destructive
  confirmation that relied on its buttons was dead on the PWA (trip delete
  silently did nothing). All confirmations now go through
  `src/utils/confirm.ts` (`window.confirm` on web, native dialog elsewhere).
- **Trip delete works on the PWA** (consequence of the above).
- **Bottom dead space / content behind the nav** — scroll views now pad by
  `insets.bottom + 106` so the last row is reachable; the redundant `body`
  padding was removed.
- **Full trip budget** — "Total spend / budget" now uses the full-trip budget
  (`dailyBudget × totalDays`) instead of the to-date budget, so a 28-day trip
  on day 21 shows the 28-day budget. Pace and the progress bar keep the
  to-date figure.
- **Android monochrome icon** — the shipped layer was an opaque white square,
  so Android themed icons drew a blank tile. Now derived from the visible
  foreground mark. **Requires the Android build in this release to take
  effect.**
- **Trip photo aspect ratio** — `processPhoto` squashed every cover into a
  square; it now scales the longest side and preserves the ratio.
- **Trip photo sometimes not saved** — removed a 4s timeout race that aborted
  slow SQLCipher BLOB writes; a phase label now shows progress instead.
- **Day counting is inclusive everywhere** (`inclusiveDays`/`parseLocalDay`),
  so a trip that started today is "Day 1" and no longer instantly reads "Over
  budget".
- **A finished trip shows "N days"** instead of "Day N of N"; an imported trip
  with an old end date no longer shows a nonsense running counter.
- **Moving an expense to another day now sticks** — `createdAt` is rebuilt
  from the chosen date/time instead of being pinned to the original.
- **Edit mode never re-resolves the FX rate** — the entry-time `rateToHome`
  snapshot is preserved; only amount/category/note/country/date-time/receipt
  are editable.
- **CSV import: conversion rates are no longer thousands-grouped** (a rate of
  `44.444` no longer became 44444, which under-valued every expense 1000×).
- **Auto-import no longer reuses a trip name** — the counter is derived from
  existing trips instead of React state.
- **Picker search field is usable and sheets no longer close instantly** —
  `PickerSheet` puts the backdrop and the sheet as siblings instead of relying
  on `stopPropagation`.
- **Menu bar is genuinely edge-to-edge on web** (`alignSelf: 'stretch'`).
- **Keyboard avoidance works on web** — the sheet is padded by the measured
  `visualViewport` overlap, not just Android's Keyboard event.
- **Trip-editor pickers no longer nest a `<Modal>` inside a modal route** —
  they use `SheetPortal` (real Modal on native, `document.body` portal on web).
- **Multi-day split shares are computed in home currency**, so they sum into
  day/trip totals correctly.
- **Quick-add (Home FAB) targets the active trip**, not the trip of the most
  recent (possibly future, pre-logged) expense.
- **Trips tab reloads expenses on focus** so cards stop showing stale figures
  after logging an expense elsewhere.

### Changed
- **Expense-row separator** is 1px top and bottom (was 2px).
- **Trip-photo field** preview rebalanced and, in the editor, cropped to match
  the card format; Change/Remove sit under a full-width preview.
- **Number formatting** is `en-US` ("€1,234.56") as the international default
  (a temporary `nl-NL` switch was reverted at user request).
- **Home "Expenses today"** is split-aware and shows every entry (no 5-row
  cap); each card shows the expense currency on top and the home amount below.
- **Service worker cache is bumped on every deploy** so returning visitors
  never keep serving a previous build.

## [v1.0.0] - 2026-09-14

### First stable release

Privacy-first travel expense tracker. Everything stays on your device — encrypted local database, no account, no tracking, no ads.

### Features
- Expense tracking with amount, category, country, payment method, notes, receipt photos
- Live currency conversion via Frankfurter (ECB rates), cached for offline use
- Multi-day split for hotel bookings and other multi-night expenses
- Trip budgets with daily pace tracking
- Statistics: spend by category (donut chart), country (bar chart), over time (line chart), payment method
- Encrypted CSV export/import (including TravelSpend import with category mapping)
- Encrypted local backup/restore (Argon2 + XChaCha20-Poly1305)
- Dark theme with premium fintech aesthetic

### Fixed
- Statistics: donut chart now shows top 5 + Others with indented sub-categories
- Statistics: by country bars sorted by spend, flag displayed next to name
- Statistics: over time uses smooth SVG line chart with gradient fill and highlighted max point
- Statistics: by payment uses split bar (Card vs Cash with percentages)
- Home: active trip detection now requires startDate <= today (future trips excluded)
- Home: journey card shows active trip spend instead of all-trips total
- Home: countries count excludes upcoming trips
- Expenses: rows use light periwinkle background for better visual separation
- Expenses: larger font sizes for better readability
- Trip detail: edit and delete actions added to header
- Trip detail: date range displayed between cover photo and statistics
- Trip detail: "Day X of Y" format consistent with trip cards
- Trip cards: tab indicator uses periwinkle background (no underline)
- Trip cards: expected total uses projectedTotalBudget for consistency
- Modals: aligned to top of screen (marginTop: 0)
- Pickers: KeyboardAvoidingView prevents keyboard overlap on iOS
- CSV import: Restaurants category now maps to Food (was General)
- CSV import: extended category aliases (taxi, uber, souvenirs, tips, etc.)
- FloatingNav: Home tab active on index route (/)

### Changed
- StatBox: vertical layout (label above, value below) for better readability
- StatBox padding increased for touch targets
- Expenses row border width increased to 2px
- Expenses background: primary12 (light periwinkle)
- Trip detail stats: 2 blocks instead of 4 (Daily avg/budget, Total spend/budget)

### Dependencies
- Updated all Expo SDK 57 packages to latest patches
- Updated @op-engineering/op-sqlite to 18.2.1
- Added expo-build-properties plugin

---

## [v0.9.0-beta] - 2026-09-09

### First beta release

Privacy-first travel expense tracker. Everything stays on your device — encrypted local database, no account, no tracking, no ads.

### Features
- Expense tracking with amount, category, country, payment method, notes, receipt photos
- Live currency conversion via Frankfurter (ECB rates), cached for offline use
- Multi-day split for hotel bookings and other multi-night expenses
- Trip budgets with daily pace tracking
- Statistics: spend by category, country, and over time
- Encrypted CSV export/import (including TravelSpend import)
- Encrypted local backup/restore (Argon2 + XChaCha20-Poly1305)

### Fixed
- Corrected releases URL in README (was pointing to wrong repo)
- Removed TravelSpend trademark references from UI (replaced with generic "other travel expense apps")
- Trip selector position — no longer floats above the bottom of the screen
- Adaptive icon — clean white logo with transparent background (Android 13+)
- App icon — fixed corrupted icon file that caused build failures

### Performance
- Expensive calculations are now memoized (faster scrolling)
- Deleting expenses is now near-instant
- Reduced unnecessary database reloads after saving or deleting

### Security
- Added validation for Infinity/NaN amounts
- Hardened backup restore with better error handling and input validation

[1.1.0]: https://github.com/4mytravels/4mytravels-app/releases/tag/v1.1.0
[v1.0.0]: https://github.com/4mytravels/4mytravels-app/releases/tag/v1.0.0
[v0.9.0-beta]: https://github.com/4mytravels/4mytravels-app/releases/tag/v0.9.0-beta
