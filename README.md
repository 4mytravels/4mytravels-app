# 4MyTravels

Privacy-first reis-app, gebouwd met React Native + Expo.

> Licentie: **AGPL-3.0** — zie [`LICENSE`](./LICENSE).
> Bij netwerkgebruik (bijv. een backend/API) verplicht de AGPL het aanbieden
> van de volledige broncode van de draaiende versie aan de gebruikers.

## Stack

- React Native (Expo SDK 57)
- TypeScript
- Expo Router (best practice voor nieuwe Expo-apps)
- npm als package manager

## Vereisten (lokaal)

- Node.js 22.x
- npm 10.x
- Expo CLI (`npx expo`)
- Een emulator (Android Studio / Xcode) of fysiek device met Expo Go

## Aan de slag

```bash
# dependencies installeren
npm install

# dev-server starten (Expo)
npx expo start
```

Scan de QR-code in de Expo Go-app (of druk `a` voor Android-emulator / `i` voor iOS).

## Projectstructuur

```
4mytravels/
├── app/            # Expo Router schermen & navigatie
├── assets/         # logo's, fonts, images
├── components/     # herbruikbare UI-componenten
├── constants/      # thema, config
├── hooks/          # custom React hooks
├── scripts/        # build-/dev-hulpscripts
├── LICENSE         # AGPL-3.0
└── README.md
```

## Licentie

Dit project valt onder de **GNU Affero General Public License v3.0**.
De volledige tekst staat in [`LICENSE`](./LICENSE).

Copyright (C) 2026 4MyTravels
