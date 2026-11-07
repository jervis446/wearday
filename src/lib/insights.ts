import { addDays } from './packing.ts';
import type { Item } from './types';

/** Wardrobe insights for the Stats tab (pure, so they can be unit tested). */

/** Swatch colours for the colour names the app produces or people commonly type. */
const SWATCH: Record<string, string> = {
  black: '#1f1f1f', white: '#ffffff', 'light grey': '#cfcfcf', grey: '#8e8e8e', gray: '#8e8e8e', charcoal: '#3c3c3c',
  red: '#c8313a', burgundy: '#6e1a2a', pink: '#f0a7bd', magenta: '#c2338a', orange: '#e8792b', brown: '#6e4527',
  beige: '#e3d3b8', camel: '#c19a6b', cream: '#f3ead4', khaki: '#b5a777', yellow: '#efc93b', olive: '#5d6331',
  green: '#2f8c4f', teal: '#1d8a8a', navy: '#1c2a4f', blue: '#3a6db5', 'light blue': '#a8c8e8', purple: '#6c3fa0',
  denim: '#3d5a80', gold: '#c9a227', silver: '#c0c0c0',
};

export const swatchFor = (name: string): string | undefined => SWATCH[name.trim().toLowerCase()];

/** Count of items per colour name, most common first. Unnamed colours are grouped as "Not set". */
export function colorBreakdown(items: Item[]): { name: string; count: number; swatch?: string }[] {
  const counts = new Map<string, { name: string; count: number }>();
  for (const i of items) {
    const raw = i.color?.trim();
    const key = raw ? raw.toLowerCase() : '';
    const entry = counts.get(key) ?? { name: raw ? raw[0].toUpperCase() + raw.slice(1) : 'Not set', count: 0 };
    entry.count++;
    counts.set(key, entry);
  }
  return [...counts.entries()]
    .map(([key, v]) => ({ ...v, swatch: key ? swatchFor(key) : undefined }))
    .sort((a, b) => (a.name === 'Not set' ? 1 : b.name === 'Not set' ? -1 : b.count - a.count || a.name.localeCompare(b.name)));
}

/** Total price of items added in each of the last `months` months, oldest first. */
export function monthlySpend(items: Item[], now: Date, months = 6): { key: string; label: string; total: number; count: number }[] {
  const out = [];
  for (let k = months - 1; k >= 0; k--) {
    const d = new Date(now.getFullYear(), now.getMonth() - k, 1);
    const inMonth = items.filter((i) => {
      const c = new Date(i.createdAt);
      return c.getFullYear() === d.getFullYear() && c.getMonth() === d.getMonth();
    });
    out.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString(undefined, { month: 'short' }),
      total: inMonth.reduce((s, i) => s + (i.price ?? 0), 0),
      count: inMonth.length,
    });
  }
  return out;
}

/**
 * Items worth reconsidering: owned for at least `days` days and not worn in that time.
 * Longest-unworn first.
 */
export function declutterCandidates(
  items: Item[],
  lastWorn: Record<string, string | undefined>,
  today: string,
  now: number,
  days = 180,
): { item: Item; lastWorn?: string }[] {
  const cutoff = addDays(today, -days);
  return items
    .filter((i) => now - i.createdAt >= days * 864e5 && (!lastWorn[i.id] || lastWorn[i.id]! < cutoff))
    .map((item) => ({ item, lastWorn: lastWorn[item.id] }))
    .sort((a, b) => (a.lastWorn ?? '').localeCompare(b.lastWorn ?? '') || a.item.createdAt - b.item.createdAt);
}

/** Consecutive days logged, ending today (or yesterday, so the streak survives until you log today). */
export function logStreak(dates: Set<string>, today: string): number {
  let day = dates.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (dates.has(day)) {
    n++;
    day = addDays(day, -1);
  }
  return n;
}
