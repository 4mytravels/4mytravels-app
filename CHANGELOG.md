# Changelog

All notable changes to 4MyTravels will be documented in this file.

## [Unreleased]

### Fixed
- Image loading: processPhoto now correctly returns base64 data (was empty Uint8Array causing black images)
- CSV import: invert conversionRate (1/rate) for correct EUR conversion from TravelSpend exports
- Daily average: use split-aware totals (per-day shares) instead of full expense amounts
- Trip ordering: ORDER BY start_date ASC (was DESC, now chronological)
- Trip detail daily avg: use split-aware totals from sections
- Import content URI: use expo-file-system File class instead of fetch (fixes "unknown protocol: content" error)
- Save button: add marginBottom to sheet so it sits above keyboard on Android

### Changed
- Adaptive icon: white 4MT logo with transparent background
- App icon: proper PNG format (was JPEG with .png extension)
- Splash screen: dark background with centered 4MT logo

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

[Unreleased]: https://github.com/4mytravels/4mytravels-app/compare/v0.9.0-beta...HEAD
[v0.9.0-beta]: https://github.com/4mytravels/4mytravels-app/releases/tag/v0.9.0-beta
