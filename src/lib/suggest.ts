import { Item, todayKey, WearLog } from './types';

/** Set in a .env file (see .env.example). Without it, the app uses the offline rule-based picker. */
const URL_ = process.env.EXPO_PUBLIC_SUGGEST_URL?.replace(/\/+$/, '');
const TOKEN = process.env.EXPO_PUBLIC_SUGGEST_TOKEN;

export const aiConfigured = !!URL_;

export type Weather = { summary: string; tempMin: number; tempMax: number; rainChance: number };
export type Suggestion = { name: string; itemIds: string[]; reason: string; weather?: Weather; source: 'ai' | 'basic' };

type Ctx = {
  items: Item[];
  logs: WearLog[];
  itemsOfLog: (l: WearLog) => string[];
  wears: Record<string, number>;
  occasion: string;
  coords?: { lat: number; lon: number };
  avoidItemIds?: string[];
};

function lastWornMap(logs: WearLog[], itemsOfLog: Ctx['itemsOfLog']) {
  const last: Record<string, string> = {};
  for (const l of logs) for (const id of itemsOfLog(l)) if (!last[id] || l.date > last[id]) last[id] = l.date;
  return last;
}

export async function suggestOutfit(ctx: Ctx): Promise<Suggestion> {
  const owned = ctx.items.filter((i) => !i.wishlist);
  if (owned.length < 2) throw new Error('Add at least two clothes to your closet first.');
  if (!URL_) return basicSuggestion(ctx, owned);

  const last = lastWornMap(ctx.logs, ctx.itemsOfLog);
  const body = {
    items: owned.map((i) => ({
      id: i.id,
      name: i.name,
      category: i.category,
      color: i.color,
      seasons: i.seasons,
      tags: i.tags,
      wears: ctx.wears[i.id] ?? 0,
      lastWorn: last[i.id],
    })),
    occasion: ctx.occasion,
    today: todayKey(),
    // ~1 km precision is plenty for a forecast.
    lat: ctx.coords ? Math.round(ctx.coords.lat * 100) / 100 : undefined,
    lon: ctx.coords ? Math.round(ctx.coords.lon * 100) / 100 : undefined,
    avoidItemIds: ctx.avoidItemIds,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(`${URL_}/suggest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(TOKEN ? { 'x-app-token': TOKEN } : {}) },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Suggestion service error (${res.status})`);
    const known = new Set(owned.map((i) => i.id));
    const itemIds = (data.itemIds ?? []).filter((id: string) => known.has(id));
    if (itemIds.length < 1) throw new Error('No usable outfit came back. Try again.');
    return { name: data.name, itemIds, reason: data.reason ?? '', weather: data.weather, source: 'ai' };
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error('The suggestion service took too long. Try again.');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function currentSeason() {
  return ['Winter', 'Winter', 'Spring', 'Spring', 'Spring', 'Summer', 'Summer', 'Summer', 'Autumn', 'Autumn', 'Autumn', 'Winter'][
    new Date().getMonth()
  ];
}

/** Offline fallback: least-recently-worn, in-season pieces, one per slot. No AI involved. */
export function basicSuggestion(ctx: Ctx, owned: Item[]): Suggestion {
  const last = lastWornMap(ctx.logs, ctx.itemsOfLog);
  const season = currentSeason();
  const avoid = new Set(ctx.avoidItemIds ?? []);
  const score = (i: Item) =>
    (i.seasons.length === 0 || i.seasons.includes(season as never) ? 0 : 100) +
    (avoid.has(i.id) ? 50 : 0) +
    (last[i.id] ? 1 / (1 + daysSince(last[i.id])) * 40 : 0) +
    Math.random() * 10;
  const pick = (cat: string) => owned.filter((i) => i.category === cat).sort((a, b) => score(a) - score(b))[0];

  const dress = pick('Dresses');
  const top = pick('Tops');
  const bottom = pick('Bottoms');
  const useDress = dress && (!top || !bottom || Math.random() < 0.3);
  const chosen = [useDress ? dress : top, useDress ? undefined : bottom, pick('Shoes')];
  if (season === 'Winter' || season === 'Autumn') chosen.push(pick('Outerwear'));
  const itemIds = chosen.filter((i): i is Item => !!i).map((i) => i.id);
  if (itemIds.length < 2) throw new Error('Add a top and a bottom (or a dress) to get suggestions.');
  return {
    name: `${season} pick`,
    itemIds,
    reason: 'Picked from in-season clothes you haven’t worn lately.',
    source: 'basic',
  };
}

function daysSince(date: string) {
  return Math.max(0, (Date.now() - new Date(`${date}T12:00:00`).getTime()) / 864e5);
}
