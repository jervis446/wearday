# What's deployed where

Live resources for Wearday. This file holds no secrets: keys live in Supabase, Cloudflare and EAS.

| Part | Where | Address / ID |
|---|---|---|
| Database, auth, photo storage | Supabase project `wearday-mumbai` (South Asia, Mumbai `ap-south-1`) | `https://fkhxgkscnkxtwnvecoyv.supabase.co` |
| AI outfit suggestions | Cloudflare Worker `wearday-suggest` | `https://wearday-suggest.prime-adarsh108.workers.dev` |
| App builds | EAS project `@jarvis446/wearday` | https://expo.dev/accounts/jarvis446/projects/wearday |
| iPhone (browser, simulator build) | Appetize.io app `josbgjh7naecp3sdab4ossxohy` | https://appetize.io/app/josbgjh7naecp3sdab4ossxohy |
| Sign-in emails | Gmail SMTP (`smtp.gmail.com:465`) via a Gmail app password, entered in Supabase → Authentication → SMTP | Sender name "Wearday", 30 emails/hour in Supabase (Gmail allows about 500/day) |

Applied database migrations: `20261107090000_wardrobe_sync`, `20261108090000_premium`.

EAS **preview** environment variables: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_AUTH_PROVIDERS=email`, `EXPO_PUBLIC_SUGGEST_URL`.

## Not set up yet
- Own domain + Resend (optional upgrade from Gmail for a professional sender address).
- RevenueCat, the store subscriptions and the `revenuecat-webhook` Edge Function (SETUP.md §6).
- Google sign-in, PostHog analytics.
- The old Sydney project `wearday` (`zkazpfphgppmprgdbrkl`) is unused and can be deleted.

## Common tasks
- Redeploy the Worker: `cd worker && npx wrangler deploy`
- New database change: add a file in `supabase/migrations/`, then `npx supabase link --project-ref fkhxgkscnkxtwnvecoyv` and `npx supabase db push`
- New Android test build: `eas build -p android --profile preview`
- New iPhone simulator build for Appetize: `eas build -p ios --profile simulator`, then upload the `.tar.gz` in Appetize (or via its API with `{"url": <artifact>, "platform": "ios"}`). To update the same Appetize link, upload to `/v1/apps/josbgjh7naecp3sdab4ossxohy`.
