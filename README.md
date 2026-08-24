# 4MyTravels

Privacy-first travel expense tracker. The **client app** is open source
(React Native + Expo, GPL-3.0). The optional sync/backup backend (Phase 1.1) is
proprietary and closed source — it is never published. Source of truth for scope
and architecture is the MVP Scope Document (v1.6).

> License: **GPL-3.0** — see [`LICENSE`](./LICENSE).

## Language

All repository content — code, comments, documentation, commit messages, and
issue/PR discussions — is written in **English** to serve an international user
base and English-speaking contributors. (In-app UI text is English in v1, with
other languages planned later.)

## Stack (per MVP scope §3)

- React Native (Expo SDK 57) + TypeScript
- One codebase, two targets: **Android** (F-Droid, primary) + **PWA** (Expo web)
- Local encrypted database behind a storage abstraction:
  - Android: `op-sqlite` (native) + SQLCipher, key in Android Keystore
  - PWA: official sqlite.org WASM + SQLite3MC, OPFS-sahpool with IndexedDB fallback
- State management: **Zustand** (one store per concern)
- Currency rates: **Frankfurter API** (keyless, CORS-open, self-hostable)
- Package / bundle ID: **`app.fourmytravels`**

## Requirements (local)

- Node.js 22.x
- npm 10.x
- Expo CLI (`npx expo`)
- Android Studio / emulator or a physical device (custom dev client / EAS Build —
  note: `op-sqlite` + SQLCipher is a native module, so plain Expo Go will not work)

## Getting started

```bash
# install dependencies
npm install

# start the dev server (Expo)
npx expo start
```

Scan the QR code (press `a` for Android emulator / `w` for web).

> Distribution is **F-Droid-first** + PWA. Google Play & App Store releases are a
> deferred decision (MVP scope §7).

## Project structure

```
4mytravels/
├── app.json                 # Expo config (bundle ID app.fourmytravels, PWA web target, expo-router)
├── app/                     # Expo Router file-based navigation
│   ├── _layout.tsx          # Root Stack: (tabs) + trip/[id] + trips/new (modal); loads fonts
│   ├── (tabs)/              # Bottom tabs: Home / Trips / Expenses / Settings (Lovable design)
│   ├── trip/[id].tsx        # Trip detail + add-expense FAB
│   └── trips/new.tsx        # New-trip modal
├── assets/                  # app icons, splash (project root, for app.json)
├── src/
│   ├── types/               # Domain types (Trip, Expense, RateSnapshot) — MVP §2.1
│   ├── db/                  # Storage abstraction (StorageAdapter interface + selector)
│   ├── store/               # Zustand stores (tripStore, expenseStore) — MVP §3
│   ├── services/            # frankfurter.ts (v2 API client, verified 2026-08-21)
│   ├── utils/               # currency.ts (conversion), pace.ts (budget algorithms)
│   ├── theme/               # theme.ts (Lovable tokens, oklch→hex), fonts.ts (Manrope+Sora)
│   ├── components/          # ui.tsx (Card/Pill/Button/StatBox/IconCircle/CategoryChip),
│   │                         #   ExpenseForm, ExpenseForm bottom-sheet
│   └── assets/fonts/        # Manrope.ttf + Sora.ttf (variable, from Google Fonts)
├── scripts/                 # build/dev helper scripts (EAS-free local recipe, §3)
├── LICENSE                  # GPL-3.0
└── README.md
```

## Architecture notes

- **Storage abstraction (§3):** the `StorageAdapter` interface is defined once;
  Android (op-sqlite/SQLCipher) and PWA (sqlite-wasm/SQLite3MC) are the two
  concrete implementations. Both must pass the same `PRAGMA key=` unlock test
  (acceptance §2.5). The Android/PWA engines are stubbed in this scaffold.
- **State (§3):** Zustand holds UI/derived state only; SQLite is the source of
  truth. One store per concern (`useTripStore`, `useExpenseStore`).
- **Currency (§2.2):** every expense stores an applied rate + rate-date snapshot
  at entry time; rate refreshes never change recorded amounts. Manual override is
  a hard, tested requirement.
- **PWA security prerequisite (§2.2):** strict CSP + zero third-party JavaScript
  (the in-memory key has no secure-enclave equivalent).

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). This project is **sole-authorship**:
external code pull requests are not accepted (issues, bug reports and feature
requests are welcome).

## License

This project is licensed under the **GNU General Public License v3.0**.
The full text is in [`LICENSE`](./LICENSE).

Copyright (C) 2026 4MyTravels
