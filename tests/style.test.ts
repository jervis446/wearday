import assert from 'node:assert/strict';
import { test } from 'node:test';

import { moodChip, moodFit, moodFromChip, MOODS, moodByLabel } from '../src/lib/moods.ts';
import { buildStyleProfile, hasStyle, styleFit } from '../src/lib/style.ts';
import { basicSuggestion, styleForRequest } from '../src/lib/suggest.ts';
import type { Item, WearLog } from '../src/lib/types.ts';

const item = (id: string, category: Item['category'], color: string, tags: string[] = [], name = id): Item => ({
  id, name, category, color, tags, imageUri: '', seasons: [], wishlist: false, createdAt: 1,
});

const closet: Item[] = [
  item('black-tee', 'Tops', 'Black', ['minimal']),
  item('white-shirt', 'Tops', 'White', ['minimal', 'work']),
  item('pink-top', 'Tops', 'Pink', ['party'], 'Pink floral top'),
  item('jeans', 'Bottoms', 'Navy', ['casual']),
  item('yellow-skirt', 'Bottoms', 'Yellow', ['party'], 'Yellow print skirt'),
  item('sneakers', 'Shoes', 'White', ['casual']),
  item('hoodie', 'Outerwear', 'Grey', ['cozy'], 'Grey hoodie'),
];
const log = (id: string, date: string, itemIds: string[], extra: Partial<WearLog> = {}): WearLog => ({ id, date, itemIds, ...extra });
const itemsOfLog = (l: WearLog) => l.itemIds;

test('the style profile learns colours and tags from rated outfits, weighting love over dislike', () => {
  const logs = [
    log('l1', '2026-11-01', ['black-tee', 'jeans', 'sneakers'], { rating: 'love', mood: 'Low-key' }),
    log('l2', '2026-11-03', ['white-shirt', 'jeans', 'sneakers'], { rating: 'love' }),
    log('l3', '2026-11-05', ['pink-top', 'yellow-skirt'], { rating: 'dislike' }),
    log('l4', '2026-11-06', ['gone-item']), // item deleted since: ignored
  ];
  const p = buildStyleProfile({ items: closet, logs, itemsOfLog, notes: '  Minimal, no yellow  ' });
  assert.equal(p.outfitsLearned, 3);
  assert.deepEqual([p.loved, p.disliked], [2, 1]);
  assert.deepEqual(p.favoriteColors.slice(0, 2), ['white', 'navy']); // white shirt + sneakers, jeans in both
  assert.ok(!p.favoriteColors.includes('yellow') && !p.favoriteColors.includes('pink'));
  assert.ok(p.favoriteTags.includes('minimal'));
  assert.ok(!p.favoriteTags.includes('party'));
  assert.deepEqual(p.lovedOutfits[0], ['white-shirt', 'jeans', 'sneakers']); // newest first
  assert.deepEqual(p.dislikedOutfits, [['pink-top', 'yellow-skirt']]);
  assert.deepEqual(p.moodOutfits['Low-key'], [['black-tee', 'jeans', 'sneakers']]);
  assert.equal(p.notes, 'Minimal, no yellow');
  assert.ok(hasStyle(p));

  assert.ok(styleFit(p, closet.find((i) => i.id === 'jeans')!) > 0);
  assert.ok(styleFit(p, closet.find((i) => i.id === 'yellow-skirt')!) < 0);
});

test('an empty history gives an empty profile', () => {
  const p = buildStyleProfile({ items: closet, logs: [], itemsOfLog });
  assert.equal(hasStyle(p), false);
  assert.deepEqual(p.lovedOutfits, []);
});

test('the request copy only keeps clothes still in the list', () => {
  const p = buildStyleProfile({ items: closet, logs: [log('l1', '2026-11-01', ['black-tee', 'jeans', 'sneakers'], { rating: 'love' })], itemsOfLog });
  const r = styleForRequest(p, new Set(['black-tee', 'jeans']));
  assert.deepEqual(r.lovedOutfits, [['black-tee', 'jeans']]);
  assert.deepEqual(styleForRequest(p, new Set(['black-tee'])).lovedOutfits, []); // one piece left is not an outfit
});

test('moods: chips round-trip and items are matched by colour and words', () => {
  for (const m of MOODS) assert.equal(moodFromChip(moodChip(m)), m);
  const cozy = moodByLabel('Cozy')!;
  assert.equal(moodFit(cozy, closet.find((i) => i.id === 'hoodie')!), 2);
  assert.equal(moodFit(moodByLabel('Playful')!, closet.find((i) => i.id === 'yellow-skirt')!), 2);
  assert.equal(moodFit(moodByLabel('Playful')!, closet.find((i) => i.id === 'black-tee')!), 0);
});

test('the offline picker follows the mood and the learned style', () => {
  const ctx = { items: closet, logs: [] as WearLog[], itemsOfLog, wears: {}, occasion: 'Everyday' };
  const playful = moodByLabel('Playful')!;
  let hits = 0;
  for (let i = 0; i < 20; i++) {
    const s = basicSuggestion({ ...ctx, mood: playful }, closet);
    if (s.itemIds.includes('yellow-skirt') || s.itemIds.includes('pink-top')) hits++;
  }
  assert.ok(hits >= 18, `playful picks bright pieces (${hits}/20)`);

  const style = buildStyleProfile({
    items: closet,
    logs: [log('l1', '2026-11-01', ['white-shirt', 'jeans', 'sneakers'], { rating: 'love' }), log('l2', '2026-11-02', ['pink-top', 'yellow-skirt'], { rating: 'dislike' })],
    itemsOfLog,
  });
  let loved = 0;
  for (let i = 0; i < 20; i++) if (basicSuggestion({ ...ctx, style }, closet).itemIds.includes('jeans')) loved++;
  assert.ok(loved >= 18, `style picks loved pieces (${loved}/20)`);
  const named = basicSuggestion({ ...ctx, mood: moodByLabel('Cozy')!, style }, closet);
  assert.match(named.name, /Cozy/);
  assert.match(named.reason, /cozy mood/);
  assert.ok(named.itemIds.includes('hoodie'), 'cozy adds a layer');
});

test('the offline picker skips a dress from a disliked outfit when there is a loved top and bottom', () => {
  const ctx = { items: closet, logs: [] as WearLog[], itemsOfLog, wears: {}, occasion: 'Everyday' };
  const withDress = [...closet, item('dress', 'Dresses', 'Pink', ['party'])];
  const style = buildStyleProfile({
    items: withDress,
    logs: [log('l1', '2026-11-01', ['white-shirt', 'jeans', 'sneakers'], { rating: 'love' }), log('l2', '2026-11-02', ['dress', 'sneakers'], { rating: 'dislike' })],
    itemsOfLog,
  });
  for (let i = 0; i < 30; i++) {
    const s = basicSuggestion({ ...ctx, items: withDress, style, mood: moodByLabel('Cozy')! }, withDress);
    assert.ok(!s.itemIds.includes('dress'), 'disliked dress not picked');
  }
});
