# Setting up accounts, sync and analytics

Everything here is optional and can be done in any order. Until a service is set up, the matching feature is hidden and the app works offline.

| What | Service | Cost | Time |
|---|---|---|---|
| Accounts, sync, photo storage | Supabase | Free tier | ~10 min |
| Google sign-in | Google Cloud | Free | ~10 min |
| Sign in with Apple | Apple Developer | Included in the $99/yr membership you need for iOS anyway | ~10 min |
| Sign-in emails that actually arrive | Resend (or any SMTP) | Free tier | ~5 min |
| Usage analytics | PostHog | Free tier | ~3 min |
| AI outfit suggestions | Cloudflare | Free tier | see `worker/README.md` |
| Premium subscriptions | RevenueCat + Google Play + App Store | Free until a revenue threshold, then a small % | ~1 hour (store setup) |

Free-tier limits change. Check each provider's pricing page before launch.

---

## 1. Supabase project (accounts and sync)

1. Create a project at https://supabase.com/dashboard. Pick the region closest to your users (for India: **Mumbai, ap-south-1**). Save the database password somewhere safe.
2. Create the tables, security rules and photo bucket. From this repo, run these one at a time:
   ```bash
   npx supabase login
   ```
   ```bash
   npx supabase link --project-ref YOUR_PROJECT_REF
   ```
   ```bash
   npx supabase db push
   ```
   The project ref is the `xxxx` in `https://xxxx.supabase.co`.
   Alternative: open **SQL Editor** in the dashboard, paste the contents of `supabase/migrations/20261107090000_wardrobe_sync.sql`, and run it.
3. **Authentication → URL Configuration:**
   - Site URL: `wearday://auth-callback`
   - Redirect URLs, add: `wearday://auth-callback` and `exp://**` (the second one lets sign-in work while testing in Expo Go)
4. **Authentication → Email templates.** The app asks for a 6-digit code, so the emails must contain the code:
   - Open **Magic link** and **Confirm signup**. In each, set the subject to `Your Wearday sign-in code` and replace the body with the contents of `supabase/templates/code.html` (it uses `{{ .Token }}`).
5. **Project Settings → API:** copy the **Project URL** and the **anon / publishable key** into `.env` (see step 6). Never put the `service_role` / secret key in the app.

## 2. Email delivery (important before launch)

Supabase's built-in email sender is only for testing: it sends very few emails per hour. Before real users sign up:

1. Create a free account at https://resend.com, verify your domain (or use their test domain to start), and create an API key.
2. In Supabase go to **Authentication → Emails → SMTP settings**, enable custom SMTP and enter Resend's SMTP details (host `smtp.resend.com`, port `465`, user `resend`, password = your API key, sender e.g. `Wearday <login@yourdomain.com>`).
3. Optionally raise the email rate limit under **Authentication → Rate limits**.

## 3. Google sign-in

1. Go to https://console.cloud.google.com and create a project.
2. **APIs & Services → OAuth consent screen:** choose External, then fill in the app name (Wearday), support email, and your privacy policy URL (`https://jervis446.github.io/wearday/privacy.html`). Add the scopes `email`, `profile` and `openid`.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID:**
   - Application type: **Web application**
   - Authorized redirect URI: `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`
4. Copy the **Client ID** and **Client secret** into Supabase → **Authentication → Providers → Google** and enable it.
5. Before launch, publish the consent screen (move it from "Testing" to "In production"). Otherwise only test users you list can sign in.

## 4. Sign in with Apple

On iPhone the app uses Apple's native sign-in sheet, which needs only this:

1. In https://developer.apple.com/account → **Certificates, IDs & Profiles → Identifiers**, open (or create) the App ID **`com.wearday.app`** and tick **Sign In with Apple**. EAS also turns this on automatically on your first iOS build.
2. In Supabase → **Authentication → Providers → Apple**: enable it, and under **Client IDs** enter `com.wearday.app`. No secret is needed for native iOS sign-in.

Optional, Apple on Android and web: create a **Services ID** and a **Sign in with Apple key** (.p8), enter them in the Supabase Apple provider, and add `apple-web` to `EXPO_PUBLIC_AUTH_PROVIDERS`. The generated secret expires every 6 months, so set a reminder to renew it.

## 5. PostHog analytics

1. Sign up at https://eu.posthog.com. The EU region keeps data in the EU, which makes privacy compliance simpler.
2. Copy the **Project API key** (starts with `phc_`) into `EXPO_PUBLIC_POSTHOG_KEY`.
3. In PostHog project settings, keep **Session replay off**. The app doesn't use it.

What you'll see in PostHog:
- daily and monthly active users and retention
- the screens people use
- events: `item_added`, `outfit_saved`, `outfit_logged`, `suggestion_requested`, `trip_created`, `outfit_shared`, `backup_exported`, `backup_restored`, `signed_in`

To see who signed up and when they last used the app, open Supabase → **Authentication → Users**.

> For users in the EU/UK, analytics may legally need opt-in consent rather than the current opt-out switch. If you target those markets, set `analytics: false` as the default in `src/lib/settingsModel.ts` and ask on first launch.

## 6. Premium subscriptions (RevenueCat)

The app sells Premium through **Google Play Billing** and **Apple In-App Purchase**. The stores require this for digital features, and on Google Play in India people can pay with UPI. RevenueCat sits in front of both stores and tells the app (and your database) who is Premium.

### a. Google Play Console
1. Create the app (package `com.wearday.app`) and upload one build to the **Internal testing** track (`eas build -p android --profile production`, then `eas submit -p android`). Play only lets you create subscriptions after a build is uploaded.
2. Set up a **payments profile** (Settings → Payments profile) so you can get paid.
3. **Monetize → Products → Subscriptions → Create subscription**: product ID `wearday_premium`, then add two **base plans**:
   - `monthly`: auto-renewing, billing period 1 month (for example ₹99)
   - `yearly`: auto-renewing, billing period 1 year (for example ₹599), with an **offer**: free trial of 7 days, eligibility "New customer acquisition"
4. **Setup → License testing**: add your Google account, so test purchases are free and renew quickly.
5. Give RevenueCat access: follow RevenueCat's "Google Play service credentials" guide. You'll create a service account in Google Cloud, invite it in Play Console with financial permissions, and upload its JSON key to RevenueCat.

### b. App Store Connect
1. Accept the **Paid Apps agreement** and add bank and tax details (Business → Agreements).
2. Create the app (bundle `com.wearday.app`). Then go to **Monetization → Subscriptions**, create a group "Wearday Premium" and add:
   - `wearday_premium_monthly`: 1 month
   - `wearday_premium_yearly`: 1 year, with an **introductory offer**: free, 1 week
3. Create an **In-App Purchase key** (Users and Access → Integrations) and add it to RevenueCat, along with the App Store Connect API key RevenueCat asks for.

### c. RevenueCat (https://app.revenuecat.com)
1. Create a project and add two apps: **Google Play** (`com.wearday.app`) and **App Store** (`com.wearday.app`). Connect them with the credentials from a5 and b3.
2. **Products:** import the subscriptions from both stores.
3. **Entitlements:** create `premium` and attach all four products.
4. **Offerings:** edit the `default` offering, add a **Monthly** package (`$rc_monthly`) and an **Annual** package (`$rc_annual`), and attach the matching Play and App Store product to each. The app reads this offering, so you can change prices and trials without an app update.
5. **API keys:** copy the public SDK keys (`goog_…` and `appl_…`) into `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` and `EXPO_PUBLIC_REVENUECAT_IOS_KEY`.

### d. Tell Supabase who is Premium (webhook)
This is what lets the database enforce the free sync limit and honour Premium on every device.

1. Apply the new migration: `npx supabase db push`.
2. Deploy the function: `npx supabase functions deploy revenuecat-webhook --no-verify-jwt`.
3. Make up a long random secret (for example `openssl rand -hex 32`), then set the function's secrets:
   ```bash
   npx supabase secrets set REVENUECAT_WEBHOOK_AUTH="Bearer YOUR_RANDOM_SECRET" REVENUECAT_SECRET_KEY=sk_YOUR_REVENUECAT_SECRET_KEY
   ```
   `REVENUECAT_SECRET_KEY` is a **secret** API key from RevenueCat (Project settings → API keys). It's optional but recommended: with it, the webhook asks RevenueCat for each user's current state instead of trusting events in the order they arrive.
4. In RevenueCat go to **Integrations → Webhooks → Add**:
   - URL: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/revenuecat-webhook`
   - Authorization header value: `Bearer YOUR_RANDOM_SECRET` (exactly as set above)
   - Click **Send test event**; it should return 200.

### e. Test a purchase
- **Android:** install the internal-testing build from Play with a license-tester account, open Settings → Wearday Premium, and subscribe (no real charge). Check Supabase → Table Editor → `user_entitlements` for a row with `premium = true`.
- **iPhone:** use TestFlight with a Sandbox tester (Settings → App Store → Sandbox Account on the phone).
- **During development:** debug builds have a "Developer: simulate Premium" switch on the paywall. It unlocks the app's gates but **not** the server sync limit. To test Premium sync, insert a row in `user_entitlements` for your user in the Supabase table editor.

### What's free and what's Premium
Change the limits in `src/lib/plans.ts`. If you change the sync limit, also change `free_limit` in `supabase/migrations/20261108090000_premium.sql` (in a new migration).

| | Free | Premium |
|---|---|---|
| Wardrobe, outfits, calendar, basic stats, backup | ✓ | ✓ |
| AI outfit suggestions | 1 a day (basic picker unlimited) | Unlimited |
| Cloud sync | Up to 50 items | Unlimited |
| Trips / packing lists | 1 | Unlimited |
| Collections | 2 | Unlimited |
| Advanced stats (colours, spending, declutter, cost per wear) | – | ✓ |

## 7. Put the keys in the app

For local development, copy `.env.example` to `.env` and fill it in, then restart `npx expo start`.

For EAS builds, add the same variables in the Expo dashboard (Project → Environment variables) or from the CLI. For example:

```bash
eas env:create --name EXPO_PUBLIC_SUPABASE_URL --value https://YOUR_PROJECT_REF.supabase.co --environment production --environment preview --visibility plaintext
```

Repeat for `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_POSTHOG_KEY`, `EXPO_PUBLIC_SUGGEST_URL`, `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`, `EXPO_PUBLIC_REVENUECAT_IOS_KEY` and so on. All of these are public client keys. Never put the RevenueCat secret key or the Supabase service key in the app.

## 8. Check it works

1. Build: `eas build -p android --profile preview` and install it.
2. Settings → **Sign in** → try each sign-in method.
3. Add an item on one phone, sign in on a second phone (or reinstall), and the item and its photo should appear.
4. In Supabase → **Table Editor → wardrobe_docs** you'll see the rows, and in **Storage → photos** the pictures.

## Running Supabase locally (for development)

Docker is required.

```bash
npx supabase start
```

That runs the full stack locally with the same schema. Sign-in emails go to the local inbox at http://127.0.0.1:54324. The local URL and anon key appear in `npx supabase status`.

Tests:
- `npm test`: unit tests, including two-phone sync
- `npm run test:db`: security and sync against the local Supabase (needs `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_KEY` from `npx supabase status -o env`)

## 9. Noha Money (shared Asanoha wallet)

One wallet and one transaction history per account, shared by every Asanoha product. The tables live in this Supabase project, so asanoha.co.in should sign people in with this same project to see the same balance.

1. Apply the migration: `npx supabase db push` (adds `noha_transactions`, `noha_lots`, `noha_products`, `noha_orders`, `premium_grants` and the functions below).
2. Schedule expiry once a day (Supabase → Integrations → Cron): `select public.noha_expire_lots();`
3. Give credit from the server only (service role), for example cashback after an Asanoha order is delivered:
   ```sql
   select public.noha_credit('<user uuid>', 'asanoha', 'cashback', 4990, 'bonus', now() + interval '365 days',
                             '10% back on order ASN-1042', 'ASN-1042', 'cashback:ASN-1042');
   ```
   The last argument is an idempotency key: running the same line twice never pays twice.
4. Apps spend with `noha_buy(product_id, idempotency_key)`. Products and prices are rows in `noha_products`.
5. UPI top-ups through NohaPI: deploy `npx supabase functions deploy noha-pay --no-verify-jwt`, set
   `npx supabase secrets set NOHA_GATEWAY_URL=https://pay.asanoha.co.in NOHA_MERCHANT_ID=<uuid> NOHA_WEBHOOK_SECRET=<secret>`,
   and point the gateway's webhook at `https://<project>.supabase.co/functions/v1/noha-pay/webhook`. Until then, "Add money" says it opens soon.

Where people can pay with Noha Money: the website account page always; in the app only on the platforms listed in `EXPO_PUBLIC_NOHA_PAY` (default `web`). Don't add `ios` (Apple requires In-App Purchase). Add `android` only after enrolling in Google Play's User Choice Billing for India.

## 10. Website (wearday.asanoha.co.in)

The site is built from `site/` into `docs/` (served by GitHub Pages): edit `site/pages/*.html`, then run `python3 site/build.py`.

1. GitHub → `jervis446/wearday` → Settings → Pages: Source **Deploy from a branch**, Branch **main**, folder **/docs**. The custom domain comes from `docs/CNAME`.
2. At the DNS provider for asanoha.co.in, add a record: type **CNAME**, name **wearday**, value **jervis446.github.io**.
3. Back in Settings → Pages, wait for the DNS check, then tick **Enforce HTTPS**.
4. Supabase → Authentication → URL Configuration → Redirect URLs: add `https://wearday.asanoha.co.in/account.html`.
