# Changelog

All notable changes to 4MyTravels will be documented in this file.

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

[v1.0.0]: https://github.com/4mytravels/4mytravels-app/releases/tag/v1.0.0
[v0.9.0-beta]: https://github.com/4mytravels/4mytravels-app/releases/tag/v0.9.0-beta
