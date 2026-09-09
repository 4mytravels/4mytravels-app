# 4MyTravels

Privacy-first travel expense tracker. Open source (React Native + Expo, GPL-3.0).

**Download:** get the APK from the [Releases](https://github.com/4mytravels/4mytravels-app/releases) section.

## What it does

Track spending on trips with automatic currency conversion. Everything stays on your device — encrypted local database, no account, no tracking, no ads.

- Log expenses with amount, category, country, payment method, notes, receipt photos
- Automatic FX conversion via Frankfurter (ECB rates), cached for offline use
- Multi-day split for hotel bookings and other multi-night expenses
- Trip budgets with daily pace tracking
- Statistics: spend by category, country, and over time
- Encrypted CSV export/import
- Encrypted local backup/restore (Argon2 + XChaCha20-Poly1305)

## Stack

- React Native (Expo SDK 57) + TypeScript
- Local encrypted database: `op-sqlite` + SQLCipher (Android)
- State management: Zustand
- Currency rates: Frankfurter API (keyless, ECB-sourced)
- Package ID: `app.fourmytravels`

## Requirements

- Node.js 22.x
- npm 10.x
- A physical Android device or emulator with a custom dev client (op-sqlite is a native module — plain Expo Go won't work)

## Project structure

```
4mytravels/
├── app.json                 # Expo config
├── app/                     # Expo Router file-based navigation
│   ├── _layout.tsx          # Root layout
│   ├── (tabs)/              # Home / Trips / Expenses / Settings
│   ├── trip/[id].tsx        # Trip detail
│   └── trips/new.tsx        # New-trip modal
├── assets/                  # App icons, splash screen
├── src/
│   ├── types/               # Domain types (Trip, Expense)
│   ├── db/                  # Storage abstraction + SQLCipher implementation
│   ├── store/               # Zustand stores
│   ├── services/            # Frankfurter API client
│   ├── utils/               # Currency conversion, budget algorithms
│   ├── theme/               # Design tokens (colors, fonts, spacing)
│   └── components/          # Shared UI components
├── LICENSE                  # GPL-3.0
└── README.md
```

## Architecture

- **Storage:** `StorageAdapter` interface with platform-specific implementations. Android uses op-sqlite with SQLCipher (key stored in Android Keystore). Web uses an in-memory adapter (PWA persistence planned).
- **State:** Zustand holds UI state only; SQLite is the source of truth.
- **Currency:** Every expense stores a rate snapshot at entry time. Later rate refreshes never change recorded amounts. Manual override available in Settings.
- **Privacy:** No analytics SDKs. No Google Play Services. EXIF/GPS stripped from photos. Backup key is passphrase-based (Argon2) and portable across devices.

## Contributing

This is a solo-authored project. I'm not accepting external code pull requests at this time, but bug reports, feature requests, and issues are genuinely welcome — they help make the app better for everyone.

## License

Licensed under the [GNU General Public License v3.0](./LICENSE).

Copyright (C) 2026 4MyTravels
