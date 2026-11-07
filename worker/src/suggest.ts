/**
 * Outfit suggestion logic, kept free of Worker globals so it can be tested with a fake AI.
 * Only text is sent to the model: item names, categories, colours, tags and wear history.
 */

export type ClosetItem = {
  id: string;
  name: string;
  category: string;
  color?: string;
  seasons?: string[];
  tags?: string[];
  wears?: number;
  lastWorn?: string;
};

export type SuggestRequest = {
  items: ClosetItem[];
  occasion?: string;
  /** Rounded to ~1 km before use. Optional; without it no weather is used. */
  lat?: number;
  lon?: number;
  /** Local date (YYYY-MM-DD) on the phone, used for season and "worn recently". */
  today?: string;
  /** Item ids of the previous suggestion, so "try again" gives something different. */
  avoidItemIds?: string[];
};

export type Weather = { summary: string; tempMin: number; tempMax: number; rainChance: number };

export type Suggestion = {
  name: string;
  itemIds: string[];
  reason: string;
  weather?: Weather;
};

export type RunModel = (input: {
  messages: { role: 'system' | 'user'; content: string }[];
  response_format: { type: 'json_schema'; json_schema: unknown };
  max_tokens: number;
  temperature: number;
}) => Promise<unknown>;

export class BadRequest extends Error {}

const MAX_ITEMS = 400;
const clip = (v: unknown, n = 60) => (typeof v === 'string' ? v.replace(/[\n\r|]/g, ' ').trim().slice(0, n) : undefined);

/** Validates and trims the request so a client can't send huge or malformed payloads. */
export function parseRequest(body: unknown): SuggestRequest {
  if (!body || typeof body !== 'object') throw new BadRequest('Body must be a JSON object');
  const b = body as Record<string, unknown>;
  if (!Array.isArray(b.items) || b.items.length === 0) throw new BadRequest('items must be a non-empty array');
  if (b.items.length > MAX_ITEMS) throw new BadRequest(`At most ${MAX_ITEMS} items`);

  const items: ClosetItem[] = b.items.map((raw, i) => {
    const it = (raw ?? {}) as Record<string, unknown>;
    const id = clip(it.id, 40);
    const category = clip(it.category, 30);
    if (!id || !category) throw new BadRequest(`items[${i}] needs id and category`);
    return {
      id,
      category,
      name: clip(it.name) ?? category,
      color: clip(it.color, 30),
      seasons: Array.isArray(it.seasons) ? it.seasons.map((s) => clip(s, 12)).filter(Boolean).slice(0, 4) as string[] : [],
      tags: Array.isArray(it.tags) ? it.tags.map((s) => clip(s, 24)).filter(Boolean).slice(0, 8) as string[] : [],
      wears: typeof it.wears === 'number' && it.wears >= 0 ? Math.floor(it.wears) : 0,
      lastWorn: typeof it.lastWorn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(it.lastWorn) ? it.lastWorn : undefined,
    };
  });

  const num = (v: unknown, lim: number) => (typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= lim ? v : undefined);
  return {
    items,
    occasion: clip(b.occasion, 40),
    lat: num(b.lat, 90),
    lon: num(b.lon, 180),
    today: typeof b.today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.today) ? b.today : undefined,
    avoidItemIds: Array.isArray(b.avoidItemIds) ? b.avoidItemIds.map((s) => clip(s, 40)).filter(Boolean).slice(0, 12) as string[] : [],
  };
}

export function seasonFor(date: string, lat?: number): string {
  const month = Number(date.slice(5, 7));
  const north = ['Winter', 'Winter', 'Spring', 'Spring', 'Spring', 'Summer', 'Summer', 'Summer', 'Autumn', 'Autumn', 'Autumn', 'Winter'][month - 1];
  if (lat == null || lat >= 0) return north;
  return { Winter: 'Summer', Summer: 'Winter', Spring: 'Autumn', Autumn: 'Spring' }[north]!;
}

// WMO weather codes from Open-Meteo, grouped.
function describeCode(code: number): string {
  if (code === 0) return 'clear';
  if (code <= 3) return 'partly cloudy';
  if (code <= 48) return 'foggy';
  if (code <= 67 || (code >= 80 && code <= 82)) return 'rainy';
  if (code <= 77 || code === 85 || code === 86) return 'snowy';
  return 'stormy';
}

/** Today's forecast from Open-Meteo (free, no key). Returns undefined on any failure. */
export async function fetchWeather(lat: number, lon: number, fetchFn: typeof fetch = fetch): Promise<Weather | undefined> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(2)}&longitude=${lon.toFixed(2)}` +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=1';
  try {
    const res = await fetchFn(url);
    if (!res.ok) return undefined;
    const d = ((await res.json()) as { daily?: Record<string, number[]> }).daily;
    if (!d?.temperature_2m_max?.length) return undefined;
    const w: Weather = {
      tempMax: Math.round(d.temperature_2m_max[0]),
      tempMin: Math.round(d.temperature_2m_min[0]),
      rainChance: Math.round(d.precipitation_probability_max?.[0] ?? 0),
      summary: describeCode(d.weather_code?.[0] ?? 0),
    };
    return w;
  } catch {
    return undefined;
  }
}

const SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    itemIds: { type: 'array', items: { type: 'string' } },
    reason: { type: 'string' },
  },
  required: ['name', 'itemIds', 'reason'],
};

export function buildMessages(req: SuggestRequest, weather?: Weather) {
  const today = req.today ?? new Date().toISOString().slice(0, 10);
  const lines = req.items.map((i) =>
    [
      i.id,
      i.category,
      i.name,
      i.color ?? '-',
      i.seasons?.length ? i.seasons.join('/') : 'any season',
      i.tags?.length ? i.tags.join(', ') : '-',
      `worn ${i.wears ?? 0}x`,
      i.lastWorn ? `last ${i.lastWorn}` : 'never worn',
    ].join(' | '),
  );

  const context = [
    `Today: ${today} (${seasonFor(today, req.lat)}).`,
    weather
      ? `Weather: ${weather.summary}, ${weather.tempMin}–${weather.tempMax}°C, ${weather.rainChance}% chance of rain.`
      : 'Weather: unknown.',
    `Occasion: ${req.occasion ?? 'everyday'}.`,
    req.avoidItemIds?.length ? `The user rejected an outfit with these ids, so make a clearly different one: ${req.avoidItemIds.join(', ')}.` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return [
    {
      role: 'system' as const,
      content:
        'You are a practical personal stylist. Build ONE outfit using only items from the user\'s closet list. ' +
        'Rules: use only ids that appear in the list, exactly as written. Pick either a dress, or a top plus a bottom. ' +
        'Add shoes if any exist. Add outerwear when it is cold (under ~15°C) or rainy. At most one bag and two accessories. ' +
        'Respect season and weather, and keep colours coordinated. Prefer items not worn recently or never worn, ' +
        'but never at the cost of a clashing outfit. ' +
        'Reply with JSON only: {"name": short catchy outfit name, "itemIds": [ids], "reason": one or two friendly sentences}.',
    },
    {
      role: 'user' as const,
      content: `${context}\n\nCloset (id | category | name | colour | seasons | tags | wear count | last worn):\n${lines.join('\n')}`,
    },
  ];
}

/** Model output can be a JSON string, an object, or JSON wrapped in prose. */
export function extractJson(output: unknown): Record<string, unknown> | undefined {
  const res = (output as { response?: unknown })?.response ?? output;
  if (res && typeof res === 'object') return res as Record<string, unknown>;
  if (typeof res !== 'string') return undefined;
  const match = res.match(/\{[\s\S]*\}/);
  if (!match) return undefined;
  try {
    return JSON.parse(match[0]);
  } catch {
    return undefined;
  }
}

export async function suggestOutfit(
  req: SuggestRequest,
  run: RunModel,
  fetchFn: typeof fetch = fetch,
): Promise<Suggestion> {
  const weather = req.lat != null && req.lon != null ? await fetchWeather(req.lat, req.lon, fetchFn) : undefined;
  const messages = buildMessages(req, weather);
  const known = new Set(req.items.map((i) => i.id));

  // The model occasionally invents ids; retry once before giving up.
  for (let attempt = 0; attempt < 2; attempt++) {
    const out = await run({
      messages,
      response_format: { type: 'json_schema', json_schema: SCHEMA },
      max_tokens: 400,
      temperature: 0.7,
    });
    const json = extractJson(out);
    const ids = Array.isArray(json?.itemIds)
      ? [...new Set(json.itemIds.filter((x): x is string => typeof x === 'string' && known.has(x)))]
      : [];
    if (ids.length >= 2 || (ids.length === 1 && req.items.length === 1)) {
      return {
        name: clip(json?.name, 50) || 'Today’s outfit',
        itemIds: ids,
        reason: clip(json?.reason, 300) || '',
        weather,
      };
    }
  }
  throw new Error('The model did not return a usable outfit');
}
