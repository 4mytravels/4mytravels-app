# 4MyTravels

Privacy-first travel app built with React Native + Expo.

> License: **GPL-3.0** — see [`LICENSE`](./LICENSE).

## Language

All repository content — code, comments, documentation, commit messages, and
issue/PR discussions — is written in **English** to serve an international user
base and English-speaking contributors. (In-app UI text is English in v1, with
other languages planned later.)

## Stack

- React Native (Expo SDK 57)
- TypeScript
- Expo Router (recommended for new Expo apps)
- npm as package manager

## Requirements (local)

- Node.js 22.x
- npm 10.x
- Expo CLI (`npx expo`)
- An emulator (Android Studio / Xcode) or a physical device with Expo Go

## Getting started

```bash
# install dependencies
npm install

# start the dev server (Expo)
npx expo start
```

Scan the QR code in the Expo Go app (or press `a` for the Android emulator / `i` for iOS).

## Project structure

```
4mytravels/
├── app/            # Expo Router screens & navigation
├── assets/         # logos, fonts, images
├── components/     # reusable UI components
├── constants/      # theme, config
├── hooks/          # custom React hooks
├── scripts/        # build/dev helper scripts
├── LICENSE         # GPL-3.0
└── README.md
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Contributions are welcome via
fork → branch → pull request.

## License

This project is licensed under the **GNU General Public License v3.0**.
The full text is in [`LICENSE`](./LICENSE).

Copyright (C) 2026 4MyTravels
