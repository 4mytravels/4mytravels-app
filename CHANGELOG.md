# Changelog

All notable changes to 4MyTravels will be documented in this file.

## [Unreleased]

## [1.1.1] - 2026-11-07

### Android permissions — allow-list
- **The release build now requests exactly ONE permission: `android.permission.INTERNET`.**
  Until now the APK asked for six: `CAMERA` and `READ_/WRITE_EXTERNAL_STORAGE`
  (declared by the `expo-image-picker` and `expo-file-system` library manifests
  and merged into the APK), `RECORD_AUDIO` (the image-picker plugin's default
  `microphonePermission`), plus `SYSTEM_ALERT_WINDOW` and `VIBRATE` from the
  Expo/React-Native template manifest. The app only ever opens the system photo
  picker — it has no camera, no microphone, no vibration and writes nothing
  outside its own cache.
- The four media/storage permissions are blocked unconditionally in
  `app.json` → `android.blockedPermissions`. `SYSTEM_ALERT_WINDOW` and `VIBRATE`
  are blocked only for non-dev targets, from `app.config.js`
  (`PROD_BLOCKED_PERMISSIONS`) — react-native's *debug* manifest uses
  `SYSTEM_ALERT_WINDOW` for the redbox/dev overlay, so the dev client keeps it.
- Import and export are unaffected: both write to `Paths.cache` (app-internal)
  and share via `expo-sharing`'s FileProvider; CSV/backup import goes through
  `expo-document-picker` (SAF `ACTION_OPEN_DOCUMENT`, per-URI grant, the module
  declares no permissions at all); receipt/cover photos go through
  `launchImageLibraryAsync`, which launches the Android photo picker
  (`PickVisualMedia`) or `ACTION_GET_CONTENT` and never asks for a permission —
  `READ_/WRITE_EXTERNAL_STORAGE` are only requested by the explicit
  `requestMediaLibraryPermissionsAsync`, which the app never calls.
- Verified by generating the Android project for both targets (`expo prebuild`):
  the release manifest carries `<uses-permission … tools:node="remove"/>` for all
  six, only `INTERNET` is left declared.

### Changed
- **Statistics sub-pages: "This year" instead of "Year to date"**, and the trip /
  country / category filter sheets lost their search field — they now follow the
  same build-up as the Statistics trip filter (title, icon + label rows with a
  checkmark, Done). `PickerSheet`'s search row is optional now: omitting
  `onQueryChange` hides it entirely, so the long currency/country pickers in the
  expense form and the trip editor keep theirs.
- **Countries: filters follow the handoff mock.** One horizontally scrollable
  chip row, each chip showing a label + the current value with a chevron-down
  caret (`Trip: All ▾`, `Category: All ▾`, `Highest spend ▾`). The sort is now a
  single chip that opens a `Sort by` sheet (`Highest spend` / `Lowest spend` /
  `A-Z`) instead of three separate chips, so the row never becomes two lines.
- **The category filter is MULTI-select now** on Countries and Over time. Tapping
  several categories in the sheet ORs them (the sheet stays open, `Done` closes
  it) and the chip reads `Category: All` / one name / `N categories`.
  `StatsFilter` carries `categories?: string[]` instead of `category?: string`,
  and an EMPTY array means every category — the screens hold an array in state,
  so "All" needs no special case.
- **Category icons are ONE map now** (`src/utils/categoryIcons.ts`). The expense
  form's grid, the Statistics donut + legend, `ExpenseRow`, and the trip/category
  filter sheets all read `categoryIcons` / `categoryIcon()`. There were TWO maps
  that disagreed (Transport: bus vs car, Groceries: cart vs basket, General:
  wallet vs grid), so the same category showed a different icon per screen.
  Unknown categories (imported CSVs, the donut's synthetic "Others" slice) fall
  back to `ellipsis-horizontal-outline` instead of rendering blank — never index
  the map directly.
- **The category filter sheets on Countries and Over time show the real
  per-category icons** (every row was a pricetag); `All categories` uses
  `apps-outline`, matching `All trips`.
- **Countries: the bare summary line is a summary block now** — globe icon,
  `N countries • €X total`, a subtitle `From N trips and D days` and a bar-chart
  icon, sitting between the filter chips and the country list. The subtitle's
  numbers are DISTINCT trips and DISTINCT local days in the filtered set
  (`summarizeStats` in `src/utils/countryStats.ts`) — never the SUM of each
  country row's `days`, which double-counts a travel day with expenses in two
  countries. It follows the trip/period/category filter but NOT the search box.
- **Statistics: "By payment" is the last preview block again** (below `By country`
  and `Over time`, directly above `Export CSV`).
- **Countries lost its "Filter by country" chip and sheet.** That screen already
  IS the country breakdown, so the filter could only hide the other countries;
  `Over time` keeps it, where it genuinely narrows a time series.
- **Fixed the doubled top inset on Statistics / Countries / Over time.** All three
  wrapped their header in a `SafeAreaView` (which already pads the top inset) AND
  set `paddingTop: insets.top` on the header itself, stacking the status-bar inset
  twice.

### Removed
- **Unused asset `assets/earth-night.jpg`.** It was referenced nowhere in code
  or config (verified across the whole repo, excluding `node_modules`/`dist`),
  so it is gone from the index and the working tree.

### Added
- **Expenses: filter on ANY set of trips** (same multi-select as Statistics).
  The airplane button now opens "Filter by trip" with `All trips` + a checkbox
  per trip; an empty selection means every trip, and the label under the title
  reads `All trips` / one name / `A + B` / `N trips` with a count badge. The
  filtering itself is the shared `src/utils/tripFilter.ts` (already unit-tested).
  - **Startup behaviour is unchanged (explicit requirement):** the filter is
    seeded ONCE with the active/most-recent trip (or the `?tripId` deep link), so
    opening the app still shows only the current trip. The seed waits for the
    trip store to hydrate and is guarded by a ref, so a deliberate "All trips"
    choice is never overwritten on the next render.
  - The FAB always has a trip: with exactly one trip filtered it files the
    expense there, otherwise it falls back to the active/most-recent trip.
  - `Daily avg / budget` is only shown for a SINGLE filtered trip (a budget is
    per trip); the `Total spend` figure always applies to what is on screen.

### Performance
- **List screens no longer load receipt photos.** `loadExpenses` gained a
  `withReceipts` option plus a `loadExpensesForList()` wrapper; home, Expenses,
  Statistics, the trip cards and the CSV export now select the metadata columns
  only. Measured on a 2000-expense table (2 of 3 with a ~350 KB receipt):
  `SELECT *` took **814 ms** and moved **456 MB** of BLOBs across the
  storage/JS boundary, the same rows without the BLOB column took **4.1 ms** —
  ~200x faster, before SQLCipher decryption. `ExpenseRow` renders no receipt at
  all, so nothing on those screens needed the bytes.
  - The edit path is the one place that DOES need them: `saveExpense` writes
    `receiptPhoto` verbatim, so a receipt-less row handed to the form would have
    CLEARED the photo on the next save. `loadExpense(id)` fetches that single row
    (with bytes) before the form opens, and the form does not open at all if that
    load fails. Regression-tested in `scripts/test-expense-receipts.mjs` (40
    assertions, fake recording adapter — no DB or native module needed).
- This means "All trips" on the Expenses tab stays cheap at thousands of rows.

### Fixed
- **PWA: deleting a trip left a blank screen instead of returning to the Trips
  tab.** Two independent causes, both fixed.
  1. *Trip detail screen* — `app/trip/[id].tsx` had an early `if (!trip) return`
     between `useEffect` and `useMemo` (5 hooks before, 1 after). Deleting the
     trip from that screen removed it from the store while the `/trip/<id>` route
     stayed mounted, so the component re-rendered with `trip === undefined` and
     called 5 hooks instead of 6 → **React error #300** ("Rendered fewer hooks
     than expected"), which unmounts the entire tree. Reproduced live on the
     deployed PWA: the click produced `Uncaught Error: Minified React error #300`
     and `#root` ended up empty. The hook list is now unconditional (`useMemo`
     returns `[]` when there is no trip), and the "Trip not found." state offers
     a "Back to trips" button that navigates with `router.replace('/trips')`
     (`router.back()` can be a no-op on web when the screen was opened directly).
  2. *Destructive confirmations* — `window.confirm` is auto-dismissed by Chrome
     ("prevent abusive dialogs") when the page has not been interacted with, so
     the delete was silently skipped and the button looked dead. Every
     destructive action now goes through **one in-app dialog** (`ConfirmHost`,
     mounted once in `app/_layout.tsx` above the navigator): a real `<Modal>` on
     native, a `document.body` portal at z-index 10000 on web (react-native-web's
     `<Modal>` would both clip it and paint it behind the sheet that asked for
     it). `confirmDestructive` is now async and resolves `true` only on an actual
     confirmation, so the trip-manage sheet is closed *after* the answer is known
     (previously it closed first, which left the sheet open after a refusal).
- **PWA: importing a CSV from a cloud drive (Proton Drive, Dropbox, …) did
  nothing.** Picking a file from a local folder worked, picking the same file
  from Proton Drive produced no message and no expenses. Measured on the deployed
  PWA (Android 10, Chrome 155) with a temporary in-origin probe page: the picker
  *does* deliver the file — `name`/`type`/`size` all correct — but **every way of
  reading it fails with `NotReadableError: … permission problems that have
  occurred after a reference to a file was acquired`** (`File.text()`,
  `File.arrayBuffer()`, `FileReader.readAsText`, `FileReader.readAsArrayBuffer`;
  `fetch(objectURL)` fails with `Failed to fetch`). Android hands
  `<input type=file>` a `content://` **proxy** URI from cloud providers, which
  Chrome can stat but not read; local files carry a real path and are unaffected.
  This cannot be fixed in the picker, so the file now arrives through the share
  sheet instead:
  - `manifest.webmanifest` registers a **Web Share Target** (`POST /import`,
    multipart/form-data).
  - `public/sw.js` intercepts that POST (a static host cannot read a request body
    from JS), stashes the file's text in a dedicated Cache entry and
    `303`-redirects to the app — 303 so the POST becomes a GET. The shared cache
    survives `activate` cleanup, so a deploy mid-share cannot drop the import.
  - `SharedImportHost` (web only) consumes the stashed file on app start and runs
    the import, reporting the result in-app.
  - The import logic moved to **one** service (`src/services/csvImport.ts`) used
    by both Settings and the share path, so the two can no longer drift.
  - Verified end-to-end on the deployed PWA: POST → stash → redirect → import →
    `2 expense(s) imported into "Shared India 2026"`, rows visible in Expenses.
  - Caveat: the PWA has to be **installed** for 4MyTravels to appear in the share
    sheet, and the app must be opened once after the update so the new service
    worker takes over.
- **PWA: import/restore/backup errors were invisible.** `Alert.alert` is a no-op
  in react-native-web, so every failure — including the one above — looked like
  "nothing happened". Status messages now go through `showStatus` +
  `StatusHost` (a `document.body` portal at z-index 10000 on web, `Alert.alert`
  on native), which covers Settings' import/export/backup/restore paths and the
  share import.
- **Web export failed to bundle: `Unable to resolve module uuid`.** The code
  imported `uuid` while only `@types/uuid` was ever declared; it resolved from a
  hoisted transitive dependency until a prod-mode install pruned it. Invalid
  package ids now come from `expo-crypto`'s `randomUUID()`, which is a declared
  dependency in both manifests.
- **PWA: the search field in the currency / country pickers could not be
  selected inside the expense form** ("Add expense" / Home FAB and Expenses
  FAB), while the same picker worked in the trip editor. react-native-web's
  `<Modal>` installs `ModalFocusTrap`, a capture-phase `focus` listener that
  pulls focus back to the first focusable element *inside* the modal; the picker
  sheet is portalled into `document.body`, i.e. outside that modal, so the field
  lost focus the instant it got it (measured focus log:
  `INPUT#Search currency` → `DIV`). The trip editor uses a route, not a Modal,
  which is why it was unaffected. The expense form is now hosted by
  `ModalHost` (a native `<Modal>` on device, a `document.body` portal at
  z-index 9000 — below `SheetPortal`'s 10000 — on web), so picker search fields
  take and keep focus. Verified live on the PWA: real click holds focus, typing
  filters (THB → 🇹🇭 THB — Thai Baht), selecting a row closes the sheet and only
  the picker closes on a backdrop tap.

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
