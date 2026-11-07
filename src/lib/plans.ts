/** What the free plan includes, and helpers to check it (pure, unit tested). */

export const FREE_LIMITS = {
  /** AI outfit suggestions per day (the basic offline picker is always free). */
  aiPerDay: 1,
  /** Items that can be synced to the cloud. Must match the limit in the push_docs SQL function. */
  syncItems: 50,
  trips: 1,
  collections: 2,
} as const;

export type Feature = 'ai' | 'sync' | 'stats' | 'trips' | 'collections';

/** Shown on the paywall to explain why it opened. */
export const FEATURE_REASON: Record<Feature, string> = {
  ai: `Free includes ${FREE_LIMITS.aiPerDay} AI suggestion a day. Go Premium for unlimited suggestions.`,
  sync: `Free syncs up to ${FREE_LIMITS.syncItems} items. Go Premium to back up and sync your whole wardrobe.`,
  stats: 'Colour palette, spending, cost per wear and declutter insights are part of Premium.',
  trips: `Free includes ${FREE_LIMITS.trips} trip. Go Premium to plan as many trips as you like.`,
  collections: `Free includes ${FREE_LIMITS.collections} collections. Go Premium for unlimited collections.`,
};

export const PREMIUM_BENEFITS = [
  { icon: 'sparkles', title: 'Unlimited AI outfit ideas', body: 'For every occasion and today’s weather.' },
  { icon: 'cloud-done', title: 'Sync your whole wardrobe', body: 'Every item and photo, on all your phones.' },
  { icon: 'stats-chart', title: 'Advanced stats', body: 'Colours, spending, cost per wear and declutter tips.' },
  { icon: 'airplane', title: 'Unlimited trips & collections', body: 'Packing lists and lookbooks for everything.' },
] as const;

export function canUseAi(premium: boolean, usedToday: number) {
  return premium || usedToday < FREE_LIMITS.aiPerDay;
}

export function canAddTrip(premium: boolean, existing: number) {
  return premium || existing < FREE_LIMITS.trips;
}

export function canAddCollection(premium: boolean, existing: number) {
  return premium || existing < FREE_LIMITS.collections;
}

/** Items that count toward the sync limit: owned or wishlist items that still exist. */
export function canSync(premium: boolean, itemCount: number) {
  return premium || itemCount <= FREE_LIMITS.syncItems;
}

/** "7-day free trial" from a store period like P7D / P1W / P1M, or null. */
export function trialLabel(period: { unit: string; count: number } | null | undefined): string | null {
  if (!period || !period.count) return null;
  const unit = period.unit.toUpperCase();
  const days = unit.startsWith('D') ? period.count : unit.startsWith('W') ? period.count * 7 : null;
  if (days) return `${days}-day free trial`;
  if (unit.startsWith('M')) return `${period.count}-month free trial`;
  return null;
}

/** Parses ISO 8601 periods like "P7D", "P1W", "P1M" into unit + count. */
export function parsePeriod(iso: string | null | undefined): { unit: string; count: number } | null {
  const m = /^P(\d+)([DWMY])$/i.exec(iso ?? '');
  return m ? { unit: m[2].toUpperCase(), count: Number(m[1]) } : null;
}

/** How much cheaper yearly is than 12 × monthly, rounded down to a whole percent. */
export function yearlySavings(monthly: number | null | undefined, yearly: number | null | undefined): number | null {
  if (!monthly || !yearly || monthly <= 0) return null;
  const pct = Math.floor((1 - yearly / (monthly * 12)) * 100);
  return pct > 0 ? pct : null;
}
