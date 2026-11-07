import type { Item, Trip } from './types.ts';

/** Packing-list helpers (pure, so they can be unit tested). */

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

/** "2026-11-14" → "Sat, 14 Nov" in the phone's language. */
export function formatDay(date: string, withWeekday = true) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: withWeekday ? 'short' : undefined,
    day: 'numeric',
    month: 'short',
  });
}

export const tripEnd = (t: Pick<Trip, 'start' | 'nights'>) => addDays(t.start, t.nights);

/** Northern-hemisphere season for a date (the app doesn't know the destination's hemisphere). */
export function seasonOf(date: string): string {
  const m = Number(date.slice(5, 7));
  return ['Winter', 'Winter', 'Spring', 'Spring', 'Spring', 'Summer', 'Summer', 'Summer', 'Autumn', 'Autumn', 'Autumn', 'Winter'][m - 1];
}

/** How many of each category to pack for a trip of `nights` nights. */
export function packingCounts(nights: number, season: string): Record<string, number> {
  const days = Math.max(1, nights + 1);
  return {
    Tops: Math.min(days, 7),
    Bottoms: Math.min(3, Math.max(1, Math.ceil(days / 3))),
    Dresses: days >= 3 ? 1 : 0,
    Shoes: days > 3 ? 2 : 1,
    Outerwear: season === 'Winter' || season === 'Autumn' ? 1 : 0,
    Bags: 1,
  };
}

/**
 * Picks clothes for a trip: in-season pieces first, then favourites (most worn).
 * Skips items that are lent out, sold, donated or on the wishlist.
 */
export function suggestPacking(items: Item[], trip: Pick<Trip, 'start' | 'nights'>, wears: Record<string, number>): string[] {
  const season = seasonOf(trip.start);
  const usable = items.filter((i) => !i.wishlist && !['lent', 'sold', 'donated'].includes(i.status ?? ''));
  const rank = (i: Item) => (i.seasons.length === 0 || i.seasons.includes(season as never) ? 0 : 1000) - (wears[i.id] ?? 0);
  const out: string[] = [];
  for (const [category, n] of Object.entries(packingCounts(trip.nights, season))) {
    const picks = usable.filter((i) => i.category === category).sort((a, b) => rank(a) - rank(b)).slice(0, n);
    out.push(...picks.map((i) => i.id));
  }
  return out;
}

/** Common non-clothing things people forget. */
export const EXTRA_SUGGESTIONS = ['Phone charger', 'Toiletries', 'ID / Passport', 'Medicines', 'Sunglasses', 'Sleepwear', 'Underwear & socks'];

export function packProgress(t: Pick<Trip, 'itemIds' | 'packed' | 'extras'>): { done: number; total: number } {
  const packed = new Set(t.packed);
  const done = t.itemIds.filter((id) => packed.has(id)).length + t.extras.filter((e) => e.packed).length;
  return { done, total: t.itemIds.length + t.extras.length };
}
