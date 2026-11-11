import { type Mood, moodFit } from './moods.ts';
import { hasStyle, styleFit, type StyleProfile } from './style.ts';
import { type Item, todayKey, type WearLog, wearable } from './types.ts';

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
  /** How the person feels today (optional). */
  mood?: Mood;
  /** What we've learned about their style (optional). */
  style?: StyleProfile;
  /** Use the offline picker even if AI is configured (e.g. free daily AI limit reached). */
  basic?: boolean;
};

function lastWornMap(logs: WearLog[], itemsOfLog: Ctx['itemsOfLog']) {
  const last: Record<string, string> = {};
  for (const l of logs) for (const id of itemsOfLog(l)) if (!last[id] || l.date > last[id]) last[id] = l.date;
  return last;
}

export async function suggestOutfit(ctx: Ctx): Promise<Suggestion> {
  const owned = ctx.items.filter(wearable);
  if (owned.length < 2) throw new Error('Add at least two clothes to your closet first (items in the laundry or lent out are skipped).');
  if (!URL_ || ctx.basic) return basicSuggestion(ctx, owned);

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
    mood: ctx.mood ? { label: ctx.mood.label, hint: ctx.mood.hint } : undefined,
    style: ctx.style && hasStyle(ctx.style) ? styleForRequest(ctx.style, new Set(owned.map((i) => i.id))) : undefined,
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

/** The profile as sent to the suggestion service: only ids of clothes in today's list. */
export function styleForRequest(p: StyleProfile, known: Set<string>) {
  const keep = (outfits: string[][]) => outfits.map((o) => o.filter((id) => known.has(id))).filter((o) => o.length >= 2);
  return {
    notes: p.notes,
    favoriteColors: p.favoriteColors,
    favoriteTags: p.favoriteTags,
    lovedOutfits: keep(p.lovedOutfits),
    dislikedOutfits: keep(p.dislikedOutfits),
    moodOutfits: Object.fromEntries(Object.entries(p.moodOutfits).map(([m, o]) => [m, keep(o)]).filter(([, o]) => o.length)),
  };
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
  // Lower is better. Scored once per item, so the random part is stable while sorting.
  const scoreOf = (i: Item) =>
    (i.seasons.length === 0 || i.seasons.includes(season as never) ? 0 : 100) +
    (avoid.has(i.id) ? 50 : 0) +
    (last[i.id] ? 1 / (1 + daysSince(last[i.id])) * 40 : 0) -
    (ctx.mood ? moodFit(ctx.mood, i) * 15 : 0) -
    (ctx.style ? styleFit(ctx.style, i) * 25 : 0) +
    Math.random() * 10;
  const scores = new Map(owned.map((i) => [i.id, scoreOf(i)]));
  const score = (i: Item) => scores.get(i.id)!;
  const pick = (cat: string) => owned.filter((i) => i.category === cat).sort((a, b) => score(a) - score(b))[0];

  const dress = pick('Dresses');
  const top = pick('Tops');
  const bottom = pick('Bottoms');
  // A dress when it fits today better than the best top-and-bottom pair (the random part keeps variety).
  const useDress = !!dress && (!top || !bottom || score(dress) < (score(top) + score(bottom)) / 2);
  const chosen = [useDress ? dress : top, useDress ? undefined : bottom, pick('Shoes')];
  if (season === 'Winter' || season === 'Autumn' || ctx.mood?.label === 'Cozy') chosen.push(pick('Outerwear'));
  const itemIds = chosen.filter((i): i is Item => !!i).map((i) => i.id);
  if (itemIds.length < 2) throw new Error('Add a top and a bottom (or a dress) to get suggestions.');
  const why = ['in-season clothes you haven’t worn lately'];
  if (ctx.mood) why.push(`that suit a ${ctx.mood.label.toLowerCase()} mood`);
  if (ctx.style && hasStyle(ctx.style)) why.push('leaning toward the outfits you loved');
  return {
    name: ctx.mood ? `${ctx.mood.emoji} ${ctx.mood.label} ${season.toLowerCase()} pick` : `${season} pick`,
    itemIds,
    reason: `Picked from ${why.join(', ')}.`,
    source: 'basic',
  };
}

function daysSince(date: string) {
  return Math.max(0, (Date.now() - new Date(`${date}T12:00:00`).getTime()) / 864e5);
}
