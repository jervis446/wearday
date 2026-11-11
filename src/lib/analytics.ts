import { Platform } from 'react-native';
import PostHog from 'posthog-react-native';

import { safeProps, screenName, type Props } from './analyticsUtil';

/**
 * Privacy-friendly product analytics (PostHog). Set EXPO_PUBLIC_POSTHOG_KEY (and optionally
 * EXPO_PUBLIC_POSTHOG_HOST, default EU cloud) to turn it on.
 * - No session recording, no autocapture of what people type.
 * - Signed-in people are identified by their random account id only, never email or name.
 * - Event properties are limited to numbers, booleans and short labels (no item names or photos).
 * - Users can switch it off in Settings.
 */
const key = process.env.EXPO_PUBLIC_POSTHOG_KEY;
const host = process.env.EXPO_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com';

export const analyticsConfigured = !!key && Platform.OS !== 'web';

const client: PostHog | null = analyticsConfigured
  ? new PostHog(key!, {
      host,
      captureAppLifecycleEvents: true,
      enableSessionReplay: false,
      personProfiles: 'identified_only',
      persistence: 'file',
    })
  : null;

export type EventName =
  | 'item_added'
  | 'outfit_saved'
  | 'outfit_logged'
  | 'outfit_rated'
  | 'fit_shared'
  | 'fit_rated'
  | 'fit_reported'
  | 'friend_request_sent'
  | 'friend_added'
  | 'friend_blocked'
  | 'suggestion_requested'
  | 'trip_created'
  | 'outfit_shared'
  | 'backup_exported'
  | 'backup_restored'
  | 'signed_in'
  | 'paywall_viewed'
  | 'premium_purchased';

export function track(event: EventName, props?: Props) {
  client?.capture(event, safeProps(props));
}

/** Screen views with ids removed, e.g. /item/abc123 → /item/[id]. */
export function trackScreen(pathname: string) {
  if (!client) return;
  client.screen(screenName(pathname));
}

export function identifyUser(userId: string) {
  client?.identify(userId);
}

export function resetAnalytics() {
  client?.reset();
}

export async function setAnalyticsEnabled(on: boolean) {
  if (!client) return;
  if (on) await client.optIn();
  else await client.optOut();
}
