# Building & testing 4MyTravels (Android dev client)

`op-sqlite` is a **native module** (SQLCipher). It does NOT run in Expo Go and
NOT in the web bundle — so to test the real encrypted storage (MVP acceptance
§2.5: `PRAGMA key=` unlock) you need a **development build**, not Expo Go.

## Option 1 — EAS cloud build (recommended, no local Android SDK needed)

You get a downloadable APK; install it on a real phone over mobile data
(per the project's offline/security posture) or on an emulator.

```bash
# one-time, on your machine (needs an Expo account):
npm install -g eas-cli
eas login
eas build:configure        # writes the real "projectId" into app.json extra.eas

# build the dev client (Android APK):
eas build --profile development --platform android

# install the resulting .apk on the device, then:
npx expo start --dev-client     # scan the QR with the dev-client app
```

The `eas.json` already defines `development` (dev-client, internal APK),
`preview` and `production` profiles. `expo-dev-client` is installed and listed
in `app.json` plugins.

## Option 2 — Local build (needs Android SDK + NDK + emulator)

```bash
npx expo prebuild --platform android
npx expo run:android          # builds + installs on a connected/emulated device
```

## What the dev build actually verifies

- `StorageNativeAdapter` opens `4mytravels.db` via op-sqlite with
  `encryptionKey` = the key from `expo-secure-store` (Android Keystore).
- First launch: a 32-byte key is generated and stored in the Keystore; the DB is
  created encrypted. `isEncrypted()` returns `true`.
- Wrong/stale key → SQLCipher throws on open (proves encryption is real).
- Trips/expenses persist across app restarts (unlike the web in-memory adapter).

## Web testing (logic only, NOT encrypted persistence)

```bash
npx expo start --web
```

This exercises the full UI + expense flow + Frankfurter rate snapshot, but uses
the in-memory `WebStorageAdapter`, so data resets on reload. Use it to validate
UX/logic; use the Android dev build to validate the privacy/encryption core.

## Pre-flight checklist before a build

- [ ] `app.json` `extra.eas.projectId` replaced with the real EAS project id
      (after `eas build:configure`).
- [ ] `npx tsc --noEmit` passes (it does in this repo state).
- [ ] `npx expo config --type public` parses without error (it does).
