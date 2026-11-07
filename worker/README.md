# Wearday suggestion Worker

A small Cloudflare Worker that powers **Suggest an outfit**. It runs on
[Workers AI](https://developers.cloudflare.com/workers-ai/), whose free allowance is 10,000 Neurons a day.

- **Privacy:** the app sends only text (item names, categories, colours, tags, wear history), never photos. With weather on, it also sends a location rounded to about 1 km.
- **Weather:** looked up from [Open-Meteo](https://open-meteo.com/), which is free and needs no key.
- **Model:** `@cf/meta/llama-3.3-70b-instruct-fp8-fast` by default. Set `MODEL` in `wrangler.jsonc` to change it; a smaller model such as `@cf/meta/llama-3.1-8b-instruct-fp8` uses less of the free allowance.
- **Abuse protection:** a per-IP limit of 10 requests a minute, plus an optional shared token.

## Deploy (about 5 minutes)

You need a free Cloudflare account: https://dash.cloudflare.com/sign-up

```bash
cd worker
npm install
npx wrangler login
npx wrangler deploy
```

`wrangler deploy` prints your Worker URL, for example `https://wearday-suggest.<you>.workers.dev`.
Check it's live:

```bash
curl https://wearday-suggest.<you>.workers.dev/health
```

Then, in the app folder, copy `.env.example` to `.env`, set `EXPO_PUBLIC_SUGGEST_URL` to that URL, and restart `npx expo start`.
For EAS builds, set the same variable in the Expo dashboard under **Environment variables**, or with `eas env:create`.

### Optional: shared token

A token stops casual misuse of your free allowance. It isn't a real secret, because anyone can extract it from the app.

```bash
npx wrangler secret put APP_TOKEN
```

Put the same value in the app's `EXPO_PUBLIC_SUGGEST_TOKEN`.

## Develop and test

```bash
npm test           # unit tests with a fake AI, no account needed
npm run typecheck
npx wrangler dev   # local server; calls the real Workers AI, so login is required
```
