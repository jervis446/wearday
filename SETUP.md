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

## 6. Put the keys in the app

For local development, copy `.env.example` to `.env` and fill it in, then restart `npx expo start`.

For EAS builds, add the same variables in the Expo dashboard (Project → Environment variables) or from the CLI. For example:

```bash
eas env:create --name EXPO_PUBLIC_SUPABASE_URL --value https://YOUR_PROJECT_REF.supabase.co --environment production --environment preview --visibility plaintext
```

Repeat for `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_POSTHOG_KEY`, `EXPO_PUBLIC_SUGGEST_URL` and so on. All of these are public client keys.

## 7. Check it works

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
