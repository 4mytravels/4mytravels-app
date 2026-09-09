# 4MyTravels — Development Setup

This document is for developers who want to build and run the app locally.

## Requirements

- Node.js 22.x
- npm 10.x
- Expo CLI (`npx expo`)
- EAS CLI (`npm install -g eas-cli`)
- An Android device or emulator (op-sqlite is a native module — plain Expo Go won't work)

## Getting started

```bash
npm install
npx expo start
```

## Building for Android

The app uses `op-sqlite` (SQLCipher) as a native module, so you need a custom dev client:

```bash
eas build --profile development --platform android
```

Install the resulting APK on your device, then:

```bash
npx expo start --tunnel
```

Scan the QR code with the dev client app (not Expo Go).

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
