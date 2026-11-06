# Wearday

A digital wardrobe and daily outfit log in React Native (Expo), modelled on Fits (`de.lhenne.fits`).
Built from scratch: no code or assets were taken from the original app.

## Features

- **Wardrobe**: add clothes from the camera or photo library, with category, brand, color, size, price, seasons, tags and notes. Search, filter by category, and sort by newest, most worn or least worn.
- **Wishlist**: items you want but don't own yet. "I bought it" moves them into the closet.
- **Outfit builder**: drag pieces around a canvas, resize them, and bring them to the front. Outfits can be named and tagged.
- **Calendar**: log what you wore each day (a saved outfit and/or individual items), with an optional outfit selfie and a note. The month grid shows the selfie or a piece of clothing for each logged day.
- **Stats**: item count, closet value, share of items worn, days logged, a breakdown by category, most worn items, best cost per wear, and never-worn items.
- **Item detail**: times worn, cost per wear, last worn date, and how many outfits use the item.

All data is stored on the device (AsyncStorage). Photos are copied into the app's document directory.

## Run

```bash
npm install
npx expo start          # scan the QR code with Expo Go (Android/iOS)
npx expo start --web    # or run it in the browser
```

## Build the app

Builds run in the cloud with [EAS Build](https://docs.expo.dev/build/introduction/), so you don't need Android Studio or Xcode.

```bash
npm install -g eas-cli
eas login
eas init                                          # links the project to your Expo account (first time only)
eas build -p android --profile preview            # installable .apk for testing
eas build -p android --profile production         # .aab for the Google Play Store
eas build -p ios --profile production             # needs an Apple Developer account
```

## Structure

- `src/app/`: screens (Expo Router). `(tabs)` holds Wardrobe / Outfits / Calendar / Stats; `item/`, `outfit/` and `log.tsx` are detail and edit screens.
- `src/lib/store.tsx`: data store and persistence. `types.ts` is the data model and `images.ts` handles the camera and photo library.
- `src/components/`: shared UI and the outfit canvas.

## Not yet implemented

- Automatic background removal for clothing photos. This needs an ML model or an API such as remove.bg.
- Cloud sync and accounts (for example Supabase or Firebase).
- Packing lists and outfit sharing.
