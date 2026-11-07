# Wearday

A digital wardrobe and daily outfit log in React Native (Expo), modelled on Fits (`de.lhenne.fits`).
Built from scratch: no code or assets were taken from the original app.

## Features

- **Wardrobe**: add clothes from the camera or photo library, with category, brand, color, size, price, seasons, tags and notes. Search, filter by category, and sort by newest, most worn or least worn.
- **Item status**: Available, In laundry, Lent out (to whom), Sold or Donated. Laundry and lent items are skipped by suggestions; sold and donated items move to Archived with their history kept.
- **Wishlist**: items you want but don't own yet. "I bought it" moves them into the closet.
- **Outfit builder**: drag pieces around a canvas, resize them, and bring them to the front. Outfits can be named and tagged.
- **Collections**: group outfits into named collections like "Office" or "Date night", and filter the Outfits tab by them.
- **Share outfits**: turn any outfit into a branded image card and share it to Instagram, WhatsApp and other apps.
- **Calendar**: log what you wore each day (a saved outfit and/or individual items), with an optional outfit selfie and a note. The month grid shows the selfie or a piece of clothing for each logged day.
- **Trips and packing lists**: plan a trip (dates, nights, destination), let the app suggest clothes for its length and season, add outfits or single items, and tick things off, including extras like chargers and ID.
- **Stats**: item count, closet value, share of items worn, logging streak, breakdowns by category and colour, spending by month, a declutter list (not worn in 6+ months), most worn items and best cost per wear.
- **Auto-tagging**: after you take a photo, the app fills in the colour, and in a real build the category too (Google ML Kit, on the phone). Nothing is uploaded.
- **Suggest an outfit**: an AI stylist that picks from your own closet using the occasion, today's weather and what you haven't worn lately. It runs on a free Cloudflare Worker (see [`worker/`](worker/README.md)). Without the Worker, it falls back to a simple offline picker.
- **Background removal**: cuts clothes out of photos on the phone (Google ML Kit on Android, Apple Vision on iOS 17+), automatically or with one tap, and you can switch back to the original. Not available in Expo Go or the browser.
- **Accounts and sync** (optional): sign in with Apple, Google or an emailed code. The wardrobe and photos sync automatically between phones through Supabase, and still work offline. You can delete your account in the app.
- **Usage analytics** (optional): privacy-friendly PostHog with a switch in Settings; no session replay, no personal data in events.
- **Backup and restore**: Settings → Export backup saves everything (data, settings and photos) to one `.zip` file you can keep in Google Drive or iCloud. Restore brings it all back, for example on a new phone.
- **Daily reminder**: an optional "What are you wearing today?" notification at a time you choose, skipped on days you've already logged. It's a local notification, so nothing goes to a server.
- **Currency**: prices show in your region's currency (₹, $, € and so on), or pick one in Settings.
- **Dark mode**: follows the phone, or set Light or Dark in Settings.
- **Item detail**: times worn, cost per wear, last worn date, and how many outfits use the item.

Without an account, all data is stored on the device (AsyncStorage). When signed in, it also syncs to your private Supabase account. Photos are resized to at most 1200 px and kept in the app's documents folder; unused photos are cleaned up automatically. In the browser version, photos are stored as embedded data.

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

## Accounts, sync and analytics setup

See **[SETUP.md](SETUP.md)** for step-by-step instructions for Supabase, Google sign-in, Sign in with Apple, email delivery and PostHog.

## AI setup

1. Deploy the Worker: follow [`worker/README.md`](worker/README.md).
2. Copy `.env.example` to `.env` and set `EXPO_PUBLIC_SUGGEST_URL`.

Category auto-detection uses a native module (`@react-native-ml-kit/image-labeling`). It works in development and EAS builds, but not in Expo Go or on web, where the app simply skips it. Colour detection works everywhere.

## Store listing

`store/listing.md` has the store descriptions, keywords and answers for the Play Data safety and App Store privacy forms. `store/screenshots/` has 1080×1920 screenshots, and `docs/privacy.html` is the privacy policy, ready for GitHub Pages.

## Tests

```bash
npm test               # auto-tagging logic
cd worker && npm test  # suggestion Worker
```
