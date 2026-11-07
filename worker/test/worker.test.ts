import assert from 'node:assert/strict';
import { test } from 'node:test';

import worker from '../src/index.ts';
import { buildMessages, extractJson, parseRequest, seasonFor, suggestOutfit } from '../src/suggest.ts';

const items = [
  { id: 'top1', name: 'White tee', category: 'Tops', color: 'White', wears: 5, lastWorn: '2026-11-05' },
  { id: 'jeans', name: 'Dark jeans', category: 'Bottoms', color: 'Navy', wears: 2 },
  { id: 'shoes', name: 'Loafers', category: 'Shoes', color: 'Brown' },
  { id: 'coat', name: 'Wool coat', category: 'Outerwear', color: 'Camel', seasons: ['Winter'] },
];

const fakeWeather = (async () =>
  new Response(JSON.stringify({ daily: { weather_code: [61], temperature_2m_max: [9.4], temperature_2m_min: [3.1], precipitation_probability_max: [80] } }))) as typeof fetch;

test('parseRequest trims, validates and drops junk', () => {
  const r = parseRequest({ items: [{ id: 'a', category: 'Tops', name: 'x'.repeat(200), wears: -3, lastWorn: 'yesterday' }], lat: 500 });
  assert.equal(r.items[0].name.length, 60);
  assert.equal(r.items[0].wears, 0);
  assert.equal(r.items[0].lastWorn, undefined);
  assert.equal(r.lat, undefined);
  assert.throws(() => parseRequest({ items: [] }), /non-empty/);
  assert.throws(() => parseRequest({ items: [{ name: 'no id' }] }), /needs id/);
});

test('season flips in the southern hemisphere', () => {
  assert.equal(seasonFor('2026-07-10', 52), 'Summer');
  assert.equal(seasonFor('2026-07-10', -33), 'Winter');
});

test('prompt includes closet, weather and occasion', () => {
  const msgs = buildMessages(parseRequest({ items, occasion: 'Work', today: '2026-11-07' }), { summary: 'rainy', tempMin: 3, tempMax: 9, rainChance: 80 });
  assert.match(msgs[1].content, /coat \| Outerwear \| Wool coat/);
  assert.match(msgs[1].content, /rainy, 3–9°C/);
  assert.match(msgs[1].content, /Occasion: Work/);
});

test('extractJson handles string, object and prose-wrapped output', () => {
  assert.deepEqual(extractJson({ response: '{"a":1}' }), { a: 1 });
  assert.deepEqual(extractJson({ response: { a: 1 } }), { a: 1 });
  assert.deepEqual(extractJson({ response: 'Sure! {"a":1} enjoy' }), { a: 1 });
  assert.equal(extractJson({ response: 'no json' }), undefined);
});

test('suggestOutfit drops invented ids and uses weather', async () => {
  const req = parseRequest({ items, lat: 51.5, lon: -0.12 });
  const s = await suggestOutfit(req, async () => ({ response: JSON.stringify({ name: 'Rainy office', itemIds: ['top1', 'jeans', 'ghost', 'coat', 'jeans'], reason: 'Warm and dry.' }) }), fakeWeather);
  assert.deepEqual(s.itemIds, ['top1', 'jeans', 'coat']);
  assert.equal(s.weather?.summary, 'rainy');
  assert.equal(s.weather?.tempMax, 9);
});

test('suggestOutfit retries once, then fails on unusable output', async () => {
  let calls = 0;
  await assert.rejects(suggestOutfit(parseRequest({ items }), async () => { calls++; return { response: '{"itemIds":["nope"]}' }; }), /usable outfit/);
  assert.equal(calls, 2);
});

test('worker: routes, token, CORS and errors', async () => {
  const env = { AI: { run: async () => ({ response: '{"name":"Easy","itemIds":["top1","jeans"],"reason":"ok"}' }) } } as any;
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    new Request('https://w.dev/suggest', { method: 'POST', body: JSON.stringify(body), headers });

  const ok = await worker.fetch(post({ items }), env);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('access-control-allow-origin'), '*');
  assert.deepEqual((await ok.json() as any).itemIds, ['top1', 'jeans']);

  assert.equal((await worker.fetch(post({ items: [] }), env)).status, 400);
  assert.equal((await worker.fetch(new Request('https://w.dev/suggest', { method: 'POST', body: '{bad' }), env)).status, 400);
  assert.equal((await worker.fetch(new Request('https://w.dev/nope'), env)).status, 404);
  assert.equal((await worker.fetch(new Request('https://w.dev/suggest', { method: 'OPTIONS' }), env)).status, 200);

  const locked = { ...env, APP_TOKEN: 'secret' };
  assert.equal((await worker.fetch(post({ items }), locked)).status, 401);
  assert.equal((await worker.fetch(post({ items }, { 'x-app-token': 'secret' }), locked)).status, 200);

  const limited = { ...env, RATE_LIMITER: { limit: async () => ({ success: false }) } };
  assert.equal((await worker.fetch(post({ items }), limited)).status, 429);

  const broken = { AI: { run: async () => { throw new Error('quota'); } } } as any;
  assert.equal((await worker.fetch(post({ items }), broken)).status, 502);
});
