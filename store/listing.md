# Wearday store listing

Copy these into Google Play Console and App Store Connect. Character limits are in brackets.

## Basics

- **App name** (Play 30 / Apple 30): `Wearday: Closet & Outfits`
- **Subtitle** (Apple only, 30): `Digital wardrobe & outfit log`
- **Short description** (Play only, 80): `Your closet in your pocket: plan outfits, log what you wear, pack smarter.`
- **Category:** Lifestyle (secondary on Apple: Shopping)
- **Content rating:** Everyone / 4+ (no user-generated content shared publicly, no ads)
- **Keywords** (Apple only, 100, comma-separated, no spaces):
  `wardrobe,closet,outfit,planner,clothes,style,fashion,packing,ootd,stylist,capsule,laundry`
- **Privacy policy URL:** `https://jervis446.github.io/wearday/privacy.html` (after you turn on GitHub Pages; see below)

## Full description (Play 4000 / Apple 4000)

Wearday turns your closet into an app. Photograph your clothes and Wearday cuts them out, recognises the colour and type, and keeps everything organised, so you always know what you own and what to wear.

**Your wardrobe, organised**
• Add clothes in seconds. The background is removed automatically, and colour and category are filled in for you
• Search and filter by category, colour, brand or tag
• Track what's in the laundry, lent to a friend, sold or donated
• Keep a wishlist of things you want to buy

**Outfits made easy**
• Build outfits on a drag-and-drop canvas
• Get outfit suggestions for the occasion and today's weather, picked from your own clothes
• Group outfits into collections like Office, Date night or Holiday
• Share any outfit as a beautiful image card

**Sync across your phones**
• Sign in with Apple, Google or an email code
• Your wardrobe and photos sync automatically and work offline

**Log what you wear**
• Record each day's outfit with an optional mirror selfie
• See your outfit history on a calendar
• Optional daily reminder, skipped on days you've already logged

**Pack smarter**
• Plan trips and get a packing list sized to the trip length and season
• Tick items off as you pack, with extras like chargers and ID

**Know your style**
• See your most-worn pieces, cost per wear, colour palette and monthly spending
• Find clothes you haven't worn in six months and decide whether to keep them

**Private by design**
Use it without an account, or sign in with Apple, Google or email to back up and sync between your phones. No ads, no selling your data, and you can delete your account in the app at any time.

## Release notes for the first version

First release of Wearday: digital closet, outfit builder, outfit suggestions, calendar, trips and packing lists, stats, backup and restore, and dark mode.

---

## Google Play: Data safety form

These answers match the app with accounts, sync and analytics turned on. If you ship without analytics (no PostHog key), remove the "App interactions" and "Device or other IDs" rows.

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | **Yes** |
| Is all of the user data collected by your app encrypted in transit? | **Yes** |
| Do you provide a way for users to request that their data is deleted? | **Yes**: in-app *Delete account*, plus the privacy-policy contact |
| Is data shared with third parties? | **No**. Supabase, Cloudflare and PostHog act as service providers on our behalf, which Google does not count as sharing |

Data types, all **collected, not shared**:

| Data type | Required or optional | Processed ephemerally? | Purposes |
|---|---|---|---|
| Personal info → **Email address** | Optional (only if you create an account) | No | Account management |
| Personal info → **User IDs** | Optional | No | Account management, Analytics |
| Photos and videos → **Photos** | Optional (synced only when signed in) | No | App functionality |
| Location → **Approximate location** | Optional | Yes | App functionality (weather for suggestions) |
| App activity → **App interactions** | Optional (users can turn it off) | No | Analytics |
| App activity → **Other user-generated content** (clothing details, outfits, calendar) | Optional | No | App functionality |
| Device or other IDs | Optional | No | Analytics |

## Apple: App Privacy ("nutrition label")

- **Data used to track you:** None. PostHog is first-party analytics and is not used for advertising or combined with other companies' data, so no App Tracking Transparency prompt is needed.
- **Data linked to you** (when signed in):
  - Contact Info → Email Address: App Functionality
  - User Content → Photos or Videos: App Functionality
  - User Content → Other User Content: App Functionality
  - Identifiers → User ID: App Functionality, Analytics
  - Usage Data → Product Interaction: Analytics
- **Data not linked to you:**
  - Location → Coarse Location: App Functionality
- **Sign in with Apple:** required by Apple because the app also offers Google sign-in. It's already built in.

## Screenshots

Ready-made screenshots are in `store/screenshots/` (1080 × 1920, 9:16), made from sample data.
Ideally retake them with your own clothes on a real phone before launch.

Apple needs 6.9" iPhone screenshots (1320 × 2868 or 1290 × 2796). Take those on a device or simulator, or resize these with padding.

## Hosting the privacy policy (free, about 2 minutes)

1. On GitHub, open the `jervis446/wearday` repository → **Settings** → **Pages**.
2. Under **Build and deployment**, set Source to **Deploy from a branch**, Branch **main**, folder **/docs**, then **Save**.
3. After a minute the policy is live at `https://jervis446.github.io/wearday/privacy.html`.

Before publishing, replace `CONTACT_EMAIL` in `docs/privacy.html` with the email address you want people to contact.
