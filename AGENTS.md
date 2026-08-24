# 4MyTravels — Agent / Contributor Notes

Expo SDK details change fast. Before writing framework code, read the exact
versioned docs at https://docs.expo.dev/versions/v57.0.0/.

## Project status

App scaffold + design + native storage + expense flow are in place (Expo SDK 57,
React 19.2.3, RN 0.86.2, TypeScript, Zustand). The MVP architecture is wired:
`src/db/` has a real `StorageAdapter` with a native (op-sqlite/SQLCipher)
implementation and a web (in-memory) fallback behind Metro `.native`/`.web`
resolution. The PWA WASM engine (sqlite-wasm/SQLite3MC) is NOT yet built.

A dev-client APK is built (EAS project `@matthyb/4mytravels`, projectId in
`app.json`). Expo Go CANNOT run this app (op-sqlite is a native module).

## Architecture (MVP scope §2–§3)

- `src/types/` — domain types (Trip, Expense, RateSnapshot). Source of truth §2.1.
- `src/db/` — `StorageAdapter` interface + runtime selector. Two impls planned:
  Android op-sqlite/SQLCipher, PWA sqlite-wasm/SQLite3MC. Both pass the same
  `PRAGMA key=` unlock test (acceptance §2.5).
- `src/store/` — Zustand stores (`useTripStore`, `useExpenseStore`). UI/derived
  state only; SQLite is the source of truth.
- `src/services/frankfurter.ts` — Frankfurter **v2** client (keyless, CORS-open).
  v2 returns an ARRAY of `{date,base,quote,rate}` — NOT the v1 object. Re-verify
  endpoints/shape at each major release.
- `src/utils/currency.ts` — conversion + formatting. `src/utils/pace.ts` — budget
  pace algorithm + multi-day split allocation (§2.2).

## Build / run

- Install: `npm install` (repo has `.npmrc` with `legacy-peer-deps` for React 19).
- Dev on device: install the built dev-client APK, then `npx expo start --tunnel`
  (tunnel required — the bundler runs on the VPS, phone is on mobile data).
  Scan the QR with the dev-client app (NOT Expo Go).
- Web: `npx expo start --web` (uses the in-memory `WebStorageAdapter`; data resets
  on reload — use Android dev build to test real encrypted persistence).
- Android dev build: `eas build --profile development --platform android`
  (requires EAS auth + `extra.eas.projectId` in `app.json`).

## Hard rules to preserve (privacy-first)

- No third-party analytics/tracking SDKs.
- No GMS/FCM. Local notifications only in v1.
- PWA: strict CSP + zero third-party JavaScript.
- EXIF/GPS stripped from photos before storage.
- Passphrase-based, portable backup key (Argon2) — not device-bound.

## Next build steps (suggested order)

1. ~~Wire `expo-router` (file-based navigation) and real screens under `app/`~~ DONE.
   - Tabs: Home / Trips / Expenses / Settings, styled to the Lovable design.
2. ~~Apply the Lovable "My Travel Compass" design system~~ DONE.
   - `src/theme/theme.ts` — tokens (oklch from Lovable styles.css → sRGB hex),
     Manrope (body) + Sora (headings) loaded via `src/theme/fonts.ts`.
   - `src/components/ui.tsx` — Card, Pill, Button, StatBox, IconCircle,
     CategoryChip, SectionTitle. `ExpenseForm.tsx` = add-expense bottom sheet.
   - Screens: Home (globe hero + stat pills + recent expenses + FAB), Trips
     (trip cards w/ budget+progress+status, filter tabs, new-trip button),
     Expenses (search + category chips + rows), Trip detail (FAB → expense
     sheet), New-trip modal, Settings placeholder.
3. ~~Implement the Android `StorageAdapter` (op-sqlite + SQLCipher)~~ DONE.
   - `src/db/types.ts` — `StorageAdapter` interface + `SCHEMA_VERSION`.
   - `src/db/storage.native.ts` — `@op-engineering/op-sqlite` + SQLCipher. Key
     generated on first launch, stored in `expo-secure-store` (Android Keystore
     backed); opened via `encryptionKey` (SQLCipher PRAGMA key= equivalent).
     Acceptance §2.5: `isEncrypted()` returns true on native.
   - `src/db/storage.web.ts` — in-memory adapter so `expo start --web` runs; the
     real PWA engine (sqlite.org WASM + SQLite3MC, OPFS-sahpool + IndexedDB
     fallback) lands later. Metro `.native`/`.web` resolution keeps op-sqlite
     OUT of the web bundle (verified: grep count 0 in web bundle).
   - `src/db/migrations.ts` — CREATE TABLE trips/expenses + indexes, idempotent.
   - `src/db/tripRepo.ts` / `expenseRepo.ts` — domain ↔ SQL mapping.
   - `src/db/useStorage.ts` — `useStorageInit()` boots the adapter + loads trips;
     `usePersistTrips()` persists add/remove. New-trip screen calls `saveTrip`.
4. ~~EAS dev-build config for Android (native op-sqlite module)~~ DONE.
   - `eas.json` — development (dev-client APK) / preview / production profiles.
   - `expo-dev-client` installed + listed in `app.json` plugins. `app.json`
     `extra.eas.projectId` is a PLACEHOLDER — run `eas build:configure` to set it.
   - `BUILD.md` — exact steps to build + test the encrypted storage on device.
   - NOTE: Expo Go cannot run op-sqlite; a dev build is required (acceptance §2.5).
5. Implement the PWA `StorageAdapter` (sqlite-wasm/SQLite3MC + OPFS-sahpool +
   IndexedDB fallback) behind the same interface.
6. Local encrypted backup/restore (zip + Argon2 passphrase).
7. CSV export + F-Droid metadata.
